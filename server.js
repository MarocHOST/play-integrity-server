// استيراد المكتبات الأساسية
const express = require('express');
const { IntegrityTokenClient } = require('@google/playintegrity');

// تهيئة Express
const app = express();
// يتم استخدام PORT من متغيرات البيئة Render، وإذا لم يكن موجوداً، يستخدم 10000 (هذا صحيح بناءً على لقطة شاشتك)
const PORT = process.env.PORT || 10000; 

// Middleware لمعالجة JSON الواردة (ضروري لاستقبال الـ Token)
app.use(express.json());

// *****************************************************************
// متغيرات البيئة (Render)
// *****************************************************************
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;
const API_KEY = process.env.API_KEY; // MoroccoSecret2025
const PROJECT_NUMBER = process.env.PROJECT_NUMBER; // 893518491856 (يجب أن يكون الرقم الصحيح: 893510491856)

// *****************************************************************
// 1. نقطة النهاية للتحقق من أن الخادم يعمل (Route صحيحة)
// *****************************************************************
app.get('/', (req, res) => {
    res.json({ ok: true, message: 'Play Integrity Server is running. Use POST /check-integrity to verify a token.' });
});

// *****************************************************************
// 2. نقطة النهاية التي تستقبل الـ Token (الإصلاح: استخدام POST بدلاً من GET)
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

    // 3. تحليل الـ Service Account (JSON)
    let serviceAccount;
    try {
        serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
    } catch (e) {
        console.error('ERROR: Failed to parse SERVICE_ACCOUNT_JSON', e);
        return res.status(500).json({ ok: false, error: 'Internal Server Error (Service Account config)' });
    }
    
    // 4. إعداد العميل والتحقق من الرمز
    try {
        const client = new IntegrityTokenClient(serviceAccount);
        
        const response = await client.decodeIntegrityToken({
            integrityToken: integrityToken,
            cloudProjectNumber: PROJECT_NUMBER 
        });

        // 5. تحليل النتيجة (Verdict)
        const verdict = response.tokenPayload.deviceIntegrity.deviceRecognitionVerdict;

        // التحقق من اسم الحزمة (لضمان أن الرمز جاء من تطبيقك)
        const tokenPackageName = response.tokenPayload.requestDetails.requestPackageName;
        if (tokenPackageName !== packageName) {
             return res.status(403).json({ 
                ok: false, 
                error: 'Forbidden (Package name mismatch)' 
            });
        }
        
        // 6. إرجاع النتيجة
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
        // إذا كان الخطأ هو خطأ في المفتاح السري أو مشكلة اتصال بـ Google Play
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
