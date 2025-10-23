const express = require('express');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// متغيرات البيئة
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const SERVICE_ACCOUNT_JSON = process.env.SERVICE_ACCOUNT_JSON;

// دالة فك تشفير Integrity Token
async function decodeIntegrityToken(token) {
    try {
        const privatekey = JSON.parse(SERVICE_ACCOUNT_JSON);
        
        const jwtClient = new google.auth.JWT(
            privatekey.client_email,
            null,
            privatekey.private_key,
            ['https://www.googleapis.com/auth/playintegrity']
        );

        const playintegrity = google.playintegrity({ version: 'v1', auth: jwtClient });

        const response = await playintegrity.v1.decodeIntegrityToken({
            packageName: PACKAGE_NAME,
            requestBody: {
                integrityToken: token
            }
        });

        console.log('✅ نتائج جوجل:', JSON.stringify(response.data.tokenPayloadExternal, null, 2));
        return response.data.tokenPayloadExternal;

    } catch (error) {
        console.error('❌ خطأ في فك التشفير:', error.message);
        throw error;
    }
}

// نقطة النهاية الرئيسية
app.get('/api/check', async (req, res) => {
    const { token } = req.query;
    
    if (!token) {
        return res.status(400).json({ 
            error: 'No token provided' 
        });
    }

    try {
        console.log('🔄 معالجة طلب فحص النزاهة...');
        console.log('📱 Token length:', token.length);
        console.log('📦 Package Name:', PACKAGE_NAME);
        
        const result = await decodeIntegrityToken(token);
        
        // إرجاع النتائج كما هي من جوجل بدون تعديل
        res.status(200).json(result);

    } catch (error) {
        console.error('❌ خطأ في API:', error);
        res.status(500).json({ 
            error: 'Google API error: ' + error.message 
        });
    }
});

// نقطة النهاية POST (اختيارية)
app.post('/api/check', async (req, res) => {
    const { integrityToken } = req.body;
    
    if (!integrityToken) {
        return res.status(400).json({ 
            error: 'No integrityToken provided' 
        });
    }

    try {
        console.log('🔄 معالجة طلب POST فحص النزاهة...');
        const result = await decodeIntegrityToken(integrityToken);
        
        res.status(200).json(result);

    } catch (error) {
        console.error('❌ خطأ في API:', error);
        res.status(500).json({ 
            error: 'Google API error: ' + error.message 
        });
    }
});

// نقطة للتحقق من صحة الخادم
app.get('/', (req, res) => {
    res.json({ 
        status: 'running',
        message: 'Play Integrity Server is running - Nikolas Version',
        endpoints: {
            'GET': '/api/check?token=YOUR_TOKEN',
            'POST': '/api/check with { "integrityToken": "YOUR_TOKEN" }'
        },
        packageName: PACKAGE_NAME
    });
});

// نقطة health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'Play Integrity Server - Nikolas Version',
        package: PACKAGE_NAME
    });
});

// معالجة الأخطاء
app.use((err, req, res, next) => {
    console.error('💥 خطأ غير متوقع:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// بدء الخادم
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📦 Package Name: ${PACKAGE_NAME}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🔗 API endpoint: http://localhost:${PORT}/api/check?token=YOUR_TOKEN`);
});
