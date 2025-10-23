// استيراد المكتبات الأساسية
const express = require('express');
const { google } = require('googleapis');

// تهيئة Express
const app = express();
const PORT = process.env.PORT || 10000; 

app.use(express.json());

// متغيرات البيئة (Render)
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;
const API_KEY = process.env.API_KEY; 
const PROJECT_NUMBER = process.env.PROJECT_NUMBER; 

// دالة تهيئة Google API Client
async function getPlayIntegrityClient() {
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
    } catch (e) {
        console.error('ERROR: Failed to parse SERVICE_ACCOUNT_JSON', e.message);
        throw new Error('Internal Server Error (Service Account config)');
    }

    const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/playintegrity']
    });

    await auth.authorize();
    
    return google.playintegrity({
        version: 'v1',
        auth: auth
    });
}

// ***************************************************************
// دالة تحليل الـ Verdict - الإصدار المصحح
// ***************************************************************
function analyzeVerdict(verdict) {
    const verdictDetails = {
        MEETS_BASIC_INTEGRITY: false,
        MEETS_DEVICE_INTEGRITY: false,
        MEETS_STRONG_INTEGRITY: false
    };

    // التحقق من أن verdict مصفوفة
    if (verdict && Array.isArray(verdict)) {
        // القراءة الدقيقة للنتائج الفعلية من Google بدون تعديل
        if (verdict.includes('MEETS_BASIC_INTEGRITY')) {
            verdictDetails.MEETS_BASIC_INTEGRITY = true;
        }
        if (verdict.includes('MEETS_DEVICE_INTEGRITY')) {
            verdictDetails.MEETS_DEVICE_INTEGRITY = true;
        }
        if (verdict.includes('MEETS_STRONG_INTEGRITY')) {
            verdictDetails.MEETS_STRONG_INTEGRITY = true;
        }
        
        // ✅ تم إزالة المنطق المعدل الذي كان يسبب المشاكل
        // النتائج تعود كما هي من جوجل بدون أي تغيير
    }
    
    console.log('📊 نتائج الفحص الحقيقية:', verdictDetails);
    return verdictDetails;
}
// ***************************************************************

// نقطة النهاية للتحقق من أن الخادم يعمل 
app.get('/', (req, res) => {
    res.json({ 
        ok: true, 
        message: 'Play Integrity Server is running. Use POST /check-integrity to verify a token.',
        version: '1.0.0 - Fixed Version'
    });
});

// نقطة النهاية التي تستقبل الـ Token (طريقة POST)
app.post('/check-integrity', async (req, res) => {
    // التحقق من المفتاح السري (API Key)
    const clientApiKey = req.header('X-API-KEY'); 
    
    if (!clientApiKey || clientApiKey !== API_KEY) {
        return res.status(401).json({ 
            ok: false, 
            error: 'Unauthorized (invalid API key)' 
        });
    }

    const { integrityToken, packageName } = req.body;

    if (!integrityToken || !packageName) {
        return res.status(400).json({ 
            ok: false, 
            error: 'Bad Request (missing integrityToken or packageName)' 
        });
    }

    try {
        console.log('🔄 بدء فحص النزاهة للحزمة:', packageName);
        
        const client = await getPlayIntegrityClient();

        const response = await client.v1.decodeIntegrityToken({
            packageName: packageName,
            requestBody: {
                integrityToken: integrityToken
            }
        });
        
        const deviceIntegrity = response.data.tokenPayloadExternal.deviceIntegrity;
        
        // التحقق من أن deviceIntegrity موجود قبل محاولة الوصول إلى deviceRecognitionVerdict
        const verdict = deviceIntegrity ? deviceIntegrity.deviceRecognitionVerdict : [];
        const tokenPackageName = response.data.tokenPayloadExternal.requestDetails.requestPackageName;

        console.log('🎯 النتائج الخام من جوجل:', verdict);

        // 1. تحليل النتائج المفصلة (باستخدام المنطق المصحح)
        const verdictDetails = analyzeVerdict(verdict);

        // 2. التحقق من تطابق الحزمة
        if (tokenPackageName !== packageName) {
             return res.status(403).json({ 
                 ok: false, 
                 error: 'Forbidden (Package name mismatch)',
                 verdictDetails: verdictDetails
             });
        }
        
        // 3. التحقق من النجاح العام (المنطق المصحح)
        // ✅ الآن نتحقق من BASIC + (DEVICE أو STRONG) لأقصى درجات الدقة
        const isSecure = verdictDetails.MEETS_BASIC_INTEGRITY && 
                        (verdictDetails.MEETS_DEVICE_INTEGRITY || verdictDetails.MEETS_STRONG_INTEGRITY);

        // رسالة توضيحية حسب النتائج
        let message = '';
        if (isSecure) {
            message = '✅ نجاح: الجهاز موثوق به وآمن.';
        } else if (verdictDetails.MEETS_BASIC_INTEGRITY) {
            message = '⚠️ تحذير: الجهاز يفي بالمتطلبات الأساسية فقط.';
        } else {
            message = '❌ خطر: الجهاز غير موثوق به.';
        }

        console.log('📝 النتيجة النهائية:', { isSecure, message, verdictDetails });

        return res.json({ 
            ok: isSecure,
            message: message,
            verdictDetails: verdictDetails
        });

    } catch (e) {
        console.error('❌ Integrity Check Error:', e.message);
        return res.status(500).json({ 
            ok: false, 
            error: 'Failed to verify token with Google: ' + e.message 
        });
    }
});

// نقطة جديدة لفحص صحة الخادم
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Play Integrity Server'
    });
});

// بدء الخادم
app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
    console.log(`📧 Health check available at: http://localhost:${PORT}/health`);
});
