const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const auth = new GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/play_integrity'],
});

// إضافة هذا الجزء لعلاج رسالة Cannot GET في المتصفح
app.get('/api/verify', (req, res) => {
  res.send("Server is running! Waiting for POST request from Android app.");
});

app.post('/api/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    const packageName = 'mtaate.checkintegrityma';
    const url = `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`;

    const response = await axios.post(url, 
      { integrityToken: token },
      {
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    res.json(response.data.tokenPayloadExternal);

  } catch (error) {
    // طباعة تفصيلية للخطأ في سجلات Vercel لمعرفة السبب الحقيقي
    console.error('Full Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: 'Google API Error', 
      message: error.message 
    });
  }
});

module.exports = app;
