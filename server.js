// server.js
'use strict';

const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// قراءة متغيرات البيئة
const PORT = process.env.PORT || 3000;
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || './service_account.json';
const PROJECT_NUMBER = process.env.PROJECT_NUMBER || '893510491856'; // غيّر إن لزم
const API_KEY = process.env.API_KEY || ''; // مفتاح بسيط لحماية الendpoint (اختياري لكنه مهم)

// التأكد من وجود ملف حساب الخدمة
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account file not found at', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// middleware بسيط لحماية endpoint بواسطة API_KEY (إن حددته)
app.use((req, res, next) => {
  if (API_KEY) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (!key || key !== API_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized (invalid API key)' });
    }
  }
  next();
});

// إنشاء Google Auth client مع حساب الخدمة
const auth = new google.auth.GoogleAuth({
  keyFile: SERVICE_ACCOUNT_PATH,
  scopes: ['https://www.googleapis.com/auth/playintegrity']
});

app.post('/verifyIntegrity', async (req, res) => {
  try {
    const { integrityToken, nonce, packageName } = req.body;
    if (!integrityToken) {
      return res.status(400).json({ ok: false, error: 'integrityToken is required' });
    }

    // الحصول على client
    const client = await auth.getClient();
    const playintegrity = google.playintegrity({ version: 'v1', auth: client });

    // استدعاء decodeIntegrityToken
    const name = `projects/${PROJECT_NUMBER}`;
    const decodeReq = {
      name,
      requestBody: {
        integrityToken
      }
    };

    const resp = await playintegrity.projects.decodeIntegrityToken(decodeReq);
    const data = resp.data || {};

    // tokenPayload يمكن أن يكون نص JSON أو كائن — نحاول التعامل مع الحالتين
    let tokenPayload = data.tokenPayload || data;
    if (typeof tokenPayload === 'string') {
      try {
        tokenPayload = JSON.parse(tokenPayload);
      } catch (e) {
        // لا تفشل، احتفظ بالنسخة النصية
      }
    }

    // الآن اطلع على الحقول المهمة
    const basicIntegrity = !!tokenPayload.basicIntegrity;
    const ctsProfileMatch = !!tokenPayload.ctsProfileMatch;

    const appIntegrity = tokenPayload.appIntegrity || null;
    const deviceIntegrity = tokenPayload.deviceIntegrity || null;

    // تحقق إضافي: تأكد من packageName (إن أرسله العميل)
    let packageNameMatch = null;
    try {
      const payloadPackageName = tokenPayload?.appIntegrity?.packageName;
      if (packageName && payloadPackageName) {
        packageNameMatch = (packageName === payloadPackageName);
      }
    } catch (e) {
      packageNameMatch = null;
    }

    // تحضير رد مبسّط للعميل
    const out = {
      ok: true,
      basicIntegrity,
      ctsProfileMatch,
      appIntegrityPresent: !!appIntegrity,
      deviceIntegrityPresent: !!deviceIntegrity,
      packageNameMatch,
      raw: data
    };

    return res.json(out);

  } catch (err) {
    console.error('verifyIntegrity error:', err);
    // إرجاع نص الخطأ فقط — لا تعرض أي مفاتيح حساسة
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.get('/', (req, res) => {
  res.send('Play Integrity verification server running.');
});

app.listen(PORT, () => {
  console.log(`VerifyIntegrity server listening on port ${PORT}`);
});