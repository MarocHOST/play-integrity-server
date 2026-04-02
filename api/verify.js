const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// إعداد المصادقة
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/play_integrity'],
});

app.post('/api/verify', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const authClient = await auth.getClient();
    
    // تعريف الخدمة وربطها بالمصادقة مباشرة
    const playintegrity = google.playintegrity({
      version: 'v1',
      auth: authClient
    });

    // تنفيذ طلب فحص التوكن
    const response = await playintegrity.decodeIntegrityToken({
      packageName: 'mtaate.checkintegrityma',
      requestBody: {
        integrityToken: token
      }
    });

    // إرسال النتيجة للتطبيق
    res.json(response.data.tokenPayloadExternal);

  } catch (error) {
    console.error('Integrity Error Details:', error.message);
    res.status(500).json({ 
      error: 'Google API Error', 
      message: error.message 
    });
  }
});

module.exports = app;
