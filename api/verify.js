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

app.post('/api/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    // 1. الحصول على Access Token
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    // 2. إرسال الطلب لجوجل باستخدام axios
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

    // 3. إرسال النتيجة للتطبيق
    res.json(response.data.tokenPayloadExternal);

  } catch (error) {
    console.error('Final Fix Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: 'Google API Error', 
      message: error.message 
    });
  }
});

module.exports = app;
