// استيراد المكتبات الضرورية
const express = require('express');
const { PlayIntegrity } = require('@google-cloud/playintegrity');
const cors = require('cors'); // لإتاحة الوصول من أي مصدر (لبيئات التطوير والاختبار)

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------------------------------------------------------------------
// ** إعدادات الأمان والمشروع - يجب تعديلها **
// --------------------------------------------------------------------------------

// رقم مشروع Google Cloud (يجب أن يتطابق مع القيمة في تطبيق الأندرويد)
const CLOUD_PROJECT_NUMBER = '893510491856'; 

// المفتاح السري الخاص بك الذي يجب أن يتطابق مع X-API-KEY في تطبيق الأندرويد
const X_API_KEY = 'MoroccoSecret2025';

// --------------------------------------------------------------------------------
// ** إعدادات بيانات الاعتماد (Authentication) **
// --------------------------------------------------------------------------------

/*
 * هام: لكي يعمل هذا الكود، يجب تعيين متغير البيئة GOOGLE_APPLICATION_CREDENTIALS
 * ليشير إلى ملف مفتاح حساب الخدمة (Service Account Key JSON) الخاص بك من Google Cloud.
 * ستقوم المكتبة بتحميل بيانات الاعتماد تلقائياً.
 */
const playIntegrityClient = new PlayIntegrity();

// تفعيل Middleware
app.use(cors());
app.use(express.json()); // لتحليل طلبات JSON الواردة في الجسم (Body)

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

    try {
        console.log(`✅ بدأ التحقق من الـ Token للتطبيق: ${packageName}`);
        
        // 2. استدعاء واجهة برمجة تطبيقات Google لفك التشفير
        const tokenResponse = await playIntegrityClient.decodeIntegrityToken({
            packageName: packageName,
            integrityToken: integrityToken,
            cloudProjectNumber: CLOUD_PROJECT_NUMBER,
        });

        // استخراج محتويات الحمولة (Payload) المفككة
        const { tokenPayloadExternal, tokenPayloadExternal: { requestDetails, appIntegrity, deviceIntegrity } } = tokenResponse;

        console.log('✅ تم فك تشفير الـ Token بنجاح.');
        console.log('   - Nonce: ', requestDetails.nonce);
        console.log('   - Device Recognition Verdict: ', deviceIntegrity.deviceRecognitionVerdict);
        
        // 3. التحقق الأمني من الـ Payload
        
        // التحقق من اسم الحزمة
        const isPackageNameValid = appIntegrity.packageName === packageName;
        if (!isPackageNameValid) {
            console.warn('⚠️ تحذير: اسم الحزمة غير متطابق! قد يشير إلى تلاعب.');
        }

        // ملاحظة أمنية: هنا يجب عليك التحقق من الـ Nonce (nonce)
        // في مشروع فعلي، يجب تخزين الـ Nonce في قاعدة بيانات للتأكد من استخدامه مرة واحدة فقط.

        // 4. إرسال الرد إلى تطبيق الأندرويد
        // نرسل التفاصيل الكاملة حالياً ليتمكن تطبيق الأندرويد من عرضها،
        // لكن الممارسة الأمنية الأفضل هي إرسال (Yes/No) فقط.
        res.status(200).json({
            success: true,
            // الحكم النهائي بناءً على ما إذا كان الجهاز سليمًا أم لا (MEETS_DEVICE_INTEGRITY)
            finalVerdict: deviceIntegrity.deviceRecognitionVerdict.includes('MEETS_DEVICE_INTEGRITY'),
            packageNameCheck: isPackageNameValid,
            // نرسل الحمولة المفككة الكاملة لعرضها في التطبيق
            verdictDetails: tokenPayloadExternal
        });

    } catch (error) {
        console.error('❌ خطأ في فك تشفير الـ Token:', error.message);
        
        // إرسال رسالة خطأ قياسية إلى العميل
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
