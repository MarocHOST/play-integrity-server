// استيراد المكتبات الضرورية
const express = require('express');
const { google } = require('googleapis'); 
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------------------------------------
// ** إعدادات الأمان والمشروع - يجب تعديلها **
// --------------------------------------------------------------------------------

// رقم مشروع Google Cloud (تأكد من مطابقته للقيمة في تطبيق الأندرويد)
const CLOUD_PROJECT_NUMBER = '893510491856'; 

// المفتاح السري الذي يجب أن يتطابق مع X-API-KEY في تطبيق الأندرويد
const X_API_KEY = 'MoroccoSecret2025';

// --------------------------------------------------------------------------------
// ** إعدادات بيانات الاعتماد و Play Integrity Client **
// --------------------------------------------------------------------------------

let playIntegrity;

const credentialsJsonString = process.env.GOOGLE_CREDENTIALS_JSON;

try {
    if (!credentialsJsonString) {
        throw new Error("❌ متغير البيئة GOOGLE_CREDENTIALS_JSON مفقود. يجب إضافته في إعدادات Render.");
    }
    
    const credentials = JSON.parse(credentialsJsonString);

    const auth = new google.auth.GoogleAuth({
        credentials: credentials,
        scopes: ['https://www.googleapis.com/auth/playintegrity']
    });

    playIntegrity = google.playintegrity({
        version: 'v1',
        auth: auth
    });
    console.log('✅ تم تهيئة عميل Play Integrity بنجاح باستخدام متغير بيئة Render.');

} catch (e) {
    console.error('❌ فشل في تهيئة GoogleAuth. تأكد من أن متغير البيئة GOOGLE_CREDENTIALS_JSON تم إعداده بشكل صحيح وبصيغة JSON سليمة.');
    console.error(e.message);
}


// تفعيل Middleware
app.use(cors());
app.use(express.json()); 

// --------------------------------------------------------------------------------
// ** المسار الرئيسي للتحقق من النزاهة (Integrity Check Route) **
// --------------------------------------------------------------------------------

app.post('/check-integrity', async (req, res) => {
    
    // 1. التحقق من مفتاح API (طبقة أمان أولى)
    const apiKeyHeader = req.header('X-API-KEY');
    if (!apiKeyHeader || apiKeyHeader !== X_API_KEY) {
        console.error('❌ فشل التحقق: مفتاح API غير صالح أو مفقود.');
        return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }

    const { integrityToken, packageName } = req.body;

    if (!integrityToken || !packageName) {
        console.error('❌ فشل التحقق: Token أو Package Name مفقود في الطلب.');
        return res.status(400).json({ error: 'Missing integrityToken or packageName in request body' });
    }
    
    if (!playIntegrity) {
        return res.status(503).json({ error: 'Service Unavailable: Google Play Integrity Client not initialized.' });
    }

    try {
        console.log(`✅ بدأ التحقق من الـ Token للتطبيق: ${packageName}`);
        
        // 2. استدعاء واجهة برمجة تطبيقات Google لفك التشفير - تم حذف "name"
        const response = await playIntegrity.v1.decodeIntegrityToken({
            packageName: packageName,
            // ❌ كان هذا السطر هو سبب الخطأ: name: packageName,
            requestBody: {
                integrityToken: integrityToken,
            },
        });

        // استخراج محتويات الحمولة (Payload) المفككة
        const tokenPayloadExternal = response.data.tokenPayloadExternal;
        // ... (بقية المنطق كما هو)
        const { requestDetails, appIntegrity, deviceIntegrity } = tokenPayloadExternal;

        console.log('✅ تم فك تشفير الـ Token بنجاح.');
        console.log('   - Nonce: ', requestDetails.nonce);
        console.log('   - Device Recognition Verdict: ', deviceIntegrity.deviceRecognitionVerdict);
        
        // التحقق الأمني من الـ Payload
        const isPackageNameValid = appIntegrity.packageName === packageName;
        if (!isPackageNameValid) {
            console.warn('⚠️ تحذير: اسم الحزمة غير متطابق!');
        }

        // الحكم النهائي
        const deviceVerdict = deviceIntegrity.deviceRecognitionVerdict;

        // إرسال الرد إلى تطبيق الأندرويد
        res.status(200).json({
            success: true,
            finalVerdict: deviceVerdict.includes('MEETS_DEVICE_INTEGRITY'),
            packageNameCheck: isPackageNameValid,
            verdictDetails: tokenPayloadExternal
        });

    } catch (error) {
        console.error('❌ خطأ في فك تشفير الـ Token:', error.message);
        
        res.status(500).json({
            success: false,
            error: 'Failed to decode integrity token on server.',
            details: error.message
        });
    }
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 Play Integrity Server is running on port ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/check-integrity`);
});
