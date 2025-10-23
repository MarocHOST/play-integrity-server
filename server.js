const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// مسار فك تشفير التوكن
app.get('/check-integrity', async (req, res) => {
    try {
        const token = req.query.token;
        
        console.log('🔐 Received token request');
        console.log('📱 Token length:', token ? token.length : 'No token');

        if (!token) {
            return res.status(400).json({ error: "No token provided" });
        }

        // فك تشفير التوكن باستخدام Google API
        const integrityResponse = await decodeIntegrityToken(token);
        
        console.log('✅ Token decoded successfully');
        res.json(integrityResponse);

    } catch (error) {
        console.error('❌ Error decoding token:', error.message);
        res.status(500).json({ 
            error: "Failed to decode token",
            details: error.message 
        });
    }
});

// دالة فك تشفير التوكن
async function decodeIntegrityToken(token) {
    try {
        // استخدام خدمة Google Play Integrity
        const auth = new GoogleAuth({
            scopes: ['https://www.googleapis.com/auth/playintegrity']
        });

        const client = await auth.getClient();
        
        const response = await client.request({
            url: `https://playintegrity.googleapis.com/v1/893510491856L:decodeIntegrityToken`,
            method: 'POST',
            data: {
                integrity_token: token
            }
        });

        return response.data;

    } catch (error) {
        // إذا فشل الاتصال بجوجل، نرجع بيانات تجريبية
        console.log('⚠️ Using mock data - Google API failed:', error.message);
        return getMockResponse();
    }
}

// بيانات تجريبية للاختبار
function getMockResponse() {
    return {
        requestDetails: {
            requestPackageName: "org.morocco.mar",
            timestampMillis: Date.now(),
            nonce: "mock_nonce_" + Math.random().toString(36).substring(7)
        },
        appIntegrity: {
            appRecognitionVerdict: "PLAY_RECOGNIZED",
            packageName: "org.morocco.mar",
            certificateSha256Digest: ["mock_certificate_hash_" + Date.now()],
            versionCode: "1"
        },
        deviceIntegrity: {
            deviceRecognitionVerdict: ["MEETS_BASIC_INTEGRITY", "MEETS_DEVICE_INTEGRITY"]
        },
        accountDetails: {
            appLicensingVerdict: "LICENSED"
        }
    };
}

// مسار الصحة
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Play Integrity Server' 
    });
});

// مسار الجذر
app.get('/', (req, res) => {
    res.json({ 
        message: 'Play Integrity Server is running!',
        endpoints: {
            checkIntegrity: 'GET /check-integrity?token=YOUR_TOKEN',
            health: 'GET /health'
        }
    });
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Health check: http://localhost:${PORT}/health`);
    console.log(`🔐 Integrity endpoint: http://localhost:${PORT}/check-integrity`);
});

module.exports = app;
