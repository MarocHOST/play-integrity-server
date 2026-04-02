const { google } = require('googleapis');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { token } = req.body;
    const packageName = "com.integrity.ui"; 

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    try {
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
            scopes: ['https://www.googleapis.com/auth/playintegrity'],
        });

        const client = await auth.getClient();
        const playintegrity = google.playintegrity({ version: 'v1', auth: client });

        const response = await playintegrity.decodeIntegrityToken({
            packageName: packageName,
            requestBody: { integrityToken: token },
        });

        res.status(200).json(response.data.tokenPayloadExternal);
    } catch (error) {
        console.error('Integrity Error:', error);
        res.status(500).json({ error: error.message });
    }
}
