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

// دالة تحليل الـ Verdict
function analyzeVerdict(verdict) {
    const verdictDetails = {
        MEETS_BASIC_INTEGRITY: false,
        MEETS_DEVICE_INTEGRITY: false,
        MEETS_STRONG_INTEGRITY: false
    };

    if (verdict && Array.isArray(verdict)) {
        if (verdict.includes('MEETS_BASIC_INTEGRITY')) {
            verdictDetails.MEETS_BASIC_INTEGRITY = true;
        }
        if (verdict.includes('MEETS_DEVICE_INTEGRITY')) {
            verdictDetails.MEETS_DEVICE_INTEGRITY = true;
        }
        if (verdict.includes('MEETS_STRONG_INTEGRITY')) {
            verdictDetails.MEETS_STRONG_INTEGRITY = true;
        }
    }
    return verdictDetails;
}

// نقطة النهاية للتحقق من أن الخادم يعمل 
app.get('/', (req, res) => {
    res.json({ ok: true, message: 'Play Integrity Server is running. Use POST /check-integrity to verify a token.' });
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
        const client = await getPlayIntegrityClient();

        const response = await client.v1.decodeIntegrityToken({
            packageName: packageName,
            requestBody: {
                integrityToken: integrityToken
            }
        });
        
        const deviceIntegrity = response.data.tokenPayloadExternal.deviceIntegrity;
        const verdict = deviceIntegrity ? deviceIntegrity.deviceRecognitionVerdict : [];
        const tokenPackageName = response.data.tokenPayloadExternal.requestDetails.requestPackageName;

        // 1. تحليل النتائج المفصلة
        const verdictDetails = analyzeVerdict(verdict);

        // 2. التحقق من تطابق الحزمة
        if (tokenPackageName !== packageName) {
             return res.status(403).json({ 
                ok: false, 
                error: 'Forbidden (Package name mismatch)',
                verdictDetails: verdictDetails // يمكن إرسالها للتحليل
            });
        }
        
        // 3. التحقق من النجاح العام (إذا كان meets_device_integrity)
        const isSecure = verdict.includes('MEETS_DEVICE_INTEGRITY') || verdict.includes('MEETS_STRONG_INTEGRITY');

        return res.json({ 
            ok: isSecure, // إرسال حالة النجاح/الفشل العامة
            message: isSecure ? 'صحيح: الجهاز موثوق به بالكامل.' : 'خطر: الجهاز غير موثوق به.',
            verdictDetails: verdictDetails // إرسال النتائج التفصيلية لواجهة المستخدم
        });

    } catch (e) {
        console.error('Integrity Check Error:', e.message);
        return res.status(500).json({ 
            ok: false, 
            error: 'Failed to verify token with Google: ' + e.message 
        });
    }
});

// بدء الخادم
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
