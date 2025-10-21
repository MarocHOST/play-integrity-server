// استيراد المكتبات الأساسية
const express = require('express');
// استخدام مكتبة Googleapis الأصلية
const { google } = require('googleapis');

// تهيئة Express
const app = express();
// يتم الحصول على البورت من متغيرات البيئة Render
const PORT = process.env.PORT || 10000; 

// Middleware لمعالجة JSON الواردة (ضروري لاستقبال الـ Token)
app.use(express.json());

// *****************************************************************
// متغيرات البيئة (Render)
// *****************************************************************
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;
const API_KEY = process.env.API_KEY; 
const PROJECT_NUMBER = process.env.PROJECT_NUMBER; 

// *****************************************************************
// دالة تهيئة Google API Client
// *****************************************************************
async function getPlayIntegrityClient() {
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
    } catch (e) {
        console.error('ERROR: Failed to parse SERVICE_ACCOUNT_JSON', e.message);
        throw new Error('Internal Server Error (Service Account config)');
    }

    // تهيئة OAuth2 client باستخدام Service Account
    const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ['https://www.googleapis.com/auth/playintegrity']
    });

    // إنشاء Play Integrity API client
    await auth.authorize();
    
    // تمرير auth client إلى مكتبة google
    return google.playintegrity({
        version: 'v1',
        auth: auth
    });
}


// *****************************************************************
// 1. نقطة النهاية للتحقق من أن الخادم يعمل 
// *****************************************************************
app.get('/', (req, res) => {
    res.json({ ok: true, message: 'Play Integrity Server is running. Use POST /check-integrity to verify a token.' });
});

// *****************************************************************
// 2. نقطة النهاية التي تستقبل الـ Token (طريقة POST)
// *****************************************************************
app.post('/check-integrity', async (req, res) => {
    // 1. التحقق من المفتاح السري (API Key)
    const clientApiKey = req.header('X-API-KEY'); 
    
    if (!clientApiKey || clientApiKey !== API_KEY) {
        return res.status(401).json({ 
            ok: false, 
            error: 'Unauthorized (invalid API key)' 
        });
    }

    // 2. التحقق من وجود Token وبيانات الحزمة في جسم الطلب
    const { integrityToken, packageName } = req.body;

    if (!integrityToken || !packageName) {
        return res.status(400).json({ 
            ok: false, 
            error: 'Bad Request (missing integrityToken or packageName)' 
        });
    }

    // 3. محاولة التحقق باستخدام googleapis
    try {
        const client = await getPlayIntegrityClient();

        // ************* التعديل هنا: استخدام المسار الصحيح *************
        const response = await client.v1.decodeIntegrityToken({
            packageName: packageName,
            requestBody: {
                integrityToken: integrityToken
            }
        });
        // ************************************************************
        
        // 4. تحليل النتيجة (Verdict) من استجابة googleapis
        // نستخدم tokenPayloadExternal لأنه الأسهل والأكثر ثباتاً
        const verdict = response.data.tokenPayloadExternal.deviceIntegrity.deviceRecognitionVerdict;
        
        // التحقق من اسم الحزمة (لضمان أن الرمز جاء من تطبيقك)
        const tokenPackageName = response.data.tokenPayloadExternal.requestDetails.requestPackageName;
        if (tokenPackageName !== packageName) {
             return res.status(403).json({ 
                ok: false, 
                error: 'Forbidden (Package name mismatch)' 
            });
        }
        
        // 5. إرجاع النتيجة
        if (verdict.includes('MEETS_DEVICE_INTEGRITY')) {
            // الجهاز موثوق به
            return res.json({ 
                ok: true, 
                message: 'Device integrity verified successfully.', 
                verdict: verdict 
            });
        } else {
            // الجهاز غير موثوق به (جذر، محاكي، الخ...)
            return res.status(200).json({ 
                ok: false, 
                error: 'Device integrity failed.', 
                verdict: verdict 
            });
        }

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
