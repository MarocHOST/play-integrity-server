const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();

// تفعيل CORS للسماح لتطبيق الأندرويد بالاتصال بالسيرفر
app.use(cors());
// تفعيل قراءة بيانات JSON المرسلة من التطبيق
app.use(express.json());

// إعداد الاتصال بجوجل (تأكد أن GOOGLE_SERVICE_ACCOUNT موجود في Vercel Variables)
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/play_integrity'],
});

const playintegrity = google.playintegrity('v1');

// المسار الذي يستقبله التطبيق (https://your-url.vercel.app/api/verify)
app.post('/api/verify', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // طلب فك تشفير الـ Token من جوجل
    const response = await playintegrity.decodeIntegrityToken({
      packageName: 'mtaate.checkintegrityma', // اسم حزمة تطبيقك
      decodeIntegrityTokenRequest: {
        integrityToken: token
      },
    }, {
      auth: await auth.getClient()
    });

    // إرسال البيانات النهائية (النتائج) إلى تطبيق الأندرويد
    // نرسل الجزء الذي يحتوي على (deviceIntegrity, appIntegrity, accountDetails)
    res.json(response.data.tokenPayloadExternal);
    
  } catch (error) {
    console.error('Integrity Error:', error.message);
    // إرجاع الخطأ للتطبيق ليظهر في السجلات
    res.status(500).json({ 
      error: 'Google API Error', 
      message: error.message 
    });
  }
});

// تصدير التطبيق ليعمل كـ Serverless Function على Vercel
module.exports = app;
