const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

const auth = new GoogleAuth({
  credentials: credentials,
  scopes: ['https://www.googleapis.com/auth/playintegrity'],
});

app.get('/api/verify', (req, res) => {
  res.send("Server is running! Waiting for POST request from Android app.");
});

app.post('/api/verify', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  try {
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    const tokenValue = accessToken.token || accessToken;

    const packageName = 'mtaate.checkintegrityma';
    const url = `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`;

    const response = await axios.post(url, 
      { integrityToken: token },
      {
        headers: {
          Authorization: `Bearer ${tokenValue}`,
          'Content-Type': 'application/json',
        }
      }
    );

    res.json(response.data.tokenPayloadExternal);

  } catch (error) {
    console.error('Full Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ 
      error: 'Google API Error', 
      message: error.message,
      details: error.response ? error.response.data : "No extra details"
    });
  }
});

module.exports = app;
