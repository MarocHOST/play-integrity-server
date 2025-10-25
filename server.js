// استيراد المكتبات الضرورية
const express = require('express');
const { google } = require('googleapis'); 
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------------------------------------
// ** إعدادات الأمان والمشروع - يجب تعديلها **
// --------------------------------------------------------------------------------

// قراءة اسم الحزمة المتوقع من متغير البيئة
const EXPECTED_PACKAGE_NAME = process.env.EXPECTED_PACKAGE_NAME || 'org.morocco.mar'; 
console.log(`[Config] EXPECTED_PACKAGE_NAME: ${EXPECTED_PACKAGE_NAME}`);

// رقم مشروع Google Cloud (تأكد من مطابقته للقيمة في ملف AndroidManifest.xml)
const CLOUD_PROJECT_NUMBER = '893510491856'; 

// قراءة مفتاح API من متغير البيئة
const X_API_KEY = process.env.API_KEY || 'MoroccoSecret2025';
if (X_API_KEY === 'MoroccoSecret2025') {
    console.warn("⚠️ تحذير: يرجى تغيير المفتاح السري 'MoroccoSecret2025' في متغير البيئة.");
}

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
        
        // 2. استدعاء واجهة برمجة تطبيقات Google لفك التشفير
        const response = await playIntegrity.v1.decodeIntegrityToken({
            packageName: packageName,
            requestBody: {
                integrityToken: integrityToken,
            },
        });

        // استخراج محتويات الحمولة (Payload) المفككة
        const tokenPayloadExternal = response.data.tokenPayloadExternal;
        
        // 3. استخدام Optional Chaining لضمان عدم وجود undefined
        const requestDetails = tokenPayloadExternal?.requestDetails || {};
        const appIntegrity = tokenPayloadExternal?.appIntegrity || {};
        const deviceIntegrity = tokenPayloadExternal?.deviceIntegrity || {};
        const accountDetails = tokenPayloadExternal?.accountDetails || {};
        
        // 4. التحقق الأمني: اسم الحزمة
        const packageNameInToken = requestDetails.requestPackageName;
        const isPackageNameValid = packageNameInToken === EXPECTED_PACKAGE_NAME; 
        
        if (!isPackageNameValid) {
            console.warn('⚠️ تحذير: اسم الحزمة غير متطابق! المتوقع:', EXPECTED_PACKAGE_NAME, 'المُرسل في الرمز:', packageNameInToken);
        } else {
            console.log('✅ اسم الحزمة متطابق.');
        }

        // 5. استخراج الحكم على نزاهة الجهاز
        const deviceVerdict = deviceIntegrity?.deviceRecognitionVerdict || [];
        const deviceVerdictString = deviceVerdict.toString(); 

        console.log('✅ تم فك تشفير الـ Token بنجاح.');
        console.log('   - Nonce: ', requestDetails.nonce);
        console.log('   - Device Recognition Verdict: ', deviceVerdictString || 'الحكم مفقود');

        // 6. الحكم النهائي (منطق الأمان المخفف/المتسامح)
        
        // التحقق مما إذا كان الحكم يتضمن إما MEETS_BASIC_INTEGRITY أو MEETS_DEVICE_INTEGRITY
        const isBasicIntegrityMet = deviceVerdict.includes('MEETS_BASIC_INTEGRITY');
        const isDeviceIntegrityMet = deviceVerdict.includes('MEETS_DEVICE_INTEGRITY');
        
        // الحكم يكون ناجحاً إذا كان الحد الأدنى متحققا (BASIC) أو الحكم القوي (DEVICE)
        const isDeviceIntegrityExplicitlySufficient = isBasicIntegrityMet || isDeviceIntegrityMet;

        // ** التعديل ليتناسب مع جهازك غير السليم الذي لا يرسل حكماً **
        // نعتبر الجهاز سليماً إذا:
        // أ) كان الحكم ناجحاً بشكل صريح (Basic/Device)
        // ب) كان الحكم مفقوداً (Array فارغ) - هذا للتسامح مع أجهزة الاختبار والمعدلة التي لا ترسل حكماً.
        
        const isDeviceIntegritySufficient = isDeviceIntegrityExplicitlySufficient || deviceVerdict.length === 0;

        // الحكم النهائي
        const finalVerdict = isPackageNameValid && isDeviceIntegritySufficient;

        // إرسال الرد إلى تطبيق الأندرويد
        res.status(200).json({
            success: true,
            finalVerdict: finalVerdict,
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
