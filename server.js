// استيراد المكتبات
const express = require('express');
const { google } = require('googleapis'); 
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 3000;

// =================================================================
// 1. الإعدادات (ثلاث قيم أساسية لتطبيقك)
// =================================================================
const EXPECTED_PACKAGE_NAME = process.env.EXPECTED_PACKAGE_NAME || 'org.morocco.mar'; 
const X_API_KEY = process.env.API_KEY || 'MoroccoSecret2025'; 

// =================================================================
// 2. تهيئة Google Play Integrity Client
// =================================================================
let playIntegrity;
const credentialsJsonString = process.env.GOOGLE_CREDENTIALS_JSON;

try {
    if (credentialsJsonString) {
        const credentials = JSON.parse(credentialsJsonString);
        const auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/playintegrity']
        });
        playIntegrity = google.playintegrity({ version: 'v1', auth: auth });
        console.log('✅ تم تهيئة Play Integrity Client');
    } else {
        console.error('❌ GOOGLE_CREDENTIALS_JSON مفقود. الخادم لن يعمل للتحقق.');
    }
} catch (e) {
    console.error('❌ فشل التهيئة:', e.message);
}

// =================================================================
// 3. الميدل-وير (Middleware) والمسار الرئيسي
// =================================================================
app.use(cors());
app.use(express.json()); 

app.post('/check-integrity', async (req, res) => {
    
    // أ. التحقق من المفتاح السري (API Key)
    const apiKeyHeader = req.header('X-API-KEY');
    if (!apiKeyHeader || apiKeyHeader !== X_API_KEY) {
        return res.status(401).json({ success: false, finalVerdict: false, error: 'Unauthorized: Invalid API Key' });
    }

    const { integrityToken, packageName } = req.body;
    if (!integrityToken || !packageName || !playIntegrity) {
        return res.status(400).json({ success: false, finalVerdict: false, error: 'Missing token or service not ready' });
    }

    try {
        // ب. فك تشفير الـ Token بواسطة Google
        const response = await playIntegrity.v1.decodeIntegrityToken({
            packageName: packageName,
            requestBody: { integrityToken: integrityToken },
        });

        const payload = response.data.tokenPayloadExternal;
        const deviceVerdict = payload?.deviceIntegrity?.deviceRecognitionVerdict || [];
        
        // ج. منطق الحكم النهائي (Final Verdict Logic)
        
        // الشرط 1: تطابق اسم الحزمة (App Check)
        const isPackageNameValid = payload.requestDetails.requestPackageName === EXPECTED_PACKAGE_NAME; 
        
        // الشرط 2: نزاهة الجهاز (يجب أن يكون MEETS_BASIC_INTEGRITY على الأقل)
        // هذا يشمل MEETS_DEVICE_INTEGRITY أيضاً
        const isBasicIntegrityMet = deviceVerdict.includes('MEETS_BASIC_INTEGRITY');
        const isDeviceIntegrityMet = deviceVerdict.includes('MEETS_DEVICE_INTEGRITY');
        
        // الحكم يكون صحيحًا إذا كان الحد الأدنى من النزاهة موجوداً
        const isDeviceIntegritySufficient = isBasicIntegrityMet || isDeviceIntegrityMet;

        // الحكم النهائي: يجب تحقق الشرطين معًا
        const finalVerdict = isPackageNameValid && isDeviceIntegritySufficient;

        // د. إرسال الرد
        res.status(200).json({
            success: true,
            finalVerdict: finalVerdict,
            packageNameCheck: isPackageNameValid,
            verdictDetails: payload
        });

    } catch (error) {
        console.error('❌ خطأ في فك تشفير الـ Token:', error.message);
        res.status(500).json({ success: false, finalVerdict: false, error: 'Failed to decode integrity token on server.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Play Integrity Server is running on port ${PORT}`);
});
