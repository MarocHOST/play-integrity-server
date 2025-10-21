// server.js (مُعدَّل للتوافق مع Render.com وقراءة المفتاح السري من متغير البيئة)
'use strict';

const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// ====================================================================
// قراءة متغيرات البيئة - هذه هي الأسرار التي يجب إدخالها في Render.com
// ====================================================================
// المنفذ: نستخدم 10000 لأنه هو المنفذ القياسي لخدمات Render
const PORT = process.env.PORT || 10000;

// مفتاح JSON السري: سيتم قراءة كامل محتوى JSON من متغير البيئة
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;

// رقم المشروع: يجب أن يكون رقم مشروعك الحقيقي في Google Cloud
const PROJECT_NUMBER = process.env.PROJECT_NUMBER; 

// مفتاح الحماية: كلمة سر بسيطة لحماية الـ endpoint (يجب عليك إدخالها)
const API_KEY = process.env.API_KEY || ''; 

// ====================================================================
// منطق إنشاء ملف الخدمة المؤقت
// ====================================================================
// Render لا تسمح بوجود ملف service_account.json.
// لذا، نقوم بإنشاء ملف مؤقت وكتابة محتوى SERVICE_ACCOUNT_JSON فيه.
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'temp_sa.json');

if (SERVICE_ACCOUNT_JSON) {
  try {
    // كتابة محتوى JSON في ملف مؤقت
    fs.writeFileSync(SERVICE_ACCOUNT_PATH, SERVICE_ACCOUNT_JSON);
    console.log('Temporary Service Account file created successfully.');
  } catch (e) {
    console.error('Failed to write Service Account file from environment variable:', e);
    process.exit(1);
  }
} 

// التأكد من وجود ملف حساب الخدمة (بعد المحاولة لإنشائه)
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('Service account file not found. Ensure SERVICE_ACCOUNT_JSON and PROJECT_NUMBER are set correctly in Environment Variables.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// middleware بسيط لحماية endpoint بواسطة API_KEY 
app.use((req, res, next) => {
  if (API_KEY) {
    const key = req.headers['x-api-key'] || req.query.api_key;
    if (!key || key !== API_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized (invalid API key)' });
    }
  }
  next();
});

// إنشاء Google Auth client مع حساب الخدمة باستخدام المسار المؤقت
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

    // التحقق من وجود رقم المشروع
    if (!PROJECT_NUMBER) {
        return res.status(500).json({ ok: false, error: 'PROJECT_NUMBER environment variable is missing.' });
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
