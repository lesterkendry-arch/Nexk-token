const crypto = require('crypto');

const APP_KEY = '552568';
const APP_SECRET = 'QwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT';

function generateSign(params, secret) {
    const sortedKeys = Object.keys(params).sort();
    let signString = secret;
    for (const key of sortedKeys) {
        if (params[key] !== undefined && params[key] !== null && key !== 'sign') {
            signString += key + String(params[key]);
        }
    }
    signString += secret;
    return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        let requestData = req.body || {};
        if (typeof requestData === 'string') {
            try { requestData = JSON.parse(requestData); } catch(e) {}
        }

        // Hora UTC estándar que utiliza AliExpress para evitar desfases
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace('T', ' ');

        const params = {
            app_key: APP_KEY,
            timestamp: timestamp,
            sign_method: 'md5',
            format: 'json',
            v: '2.0',
            method: requestData.method || 'aliexpress.ds.recommend.feed.get',
            country: requestData.country || 'BR',
            target_currency: requestData.target_currency || 'BRL',
            target_language: requestData.target_language || 'PT',
            category_id: requestData.category_id || '509',
            feed_name: requestData.feed_name || 'bestseller'
        };

        params.sign = generateSign(params, APP_SECRET);

        const formBody = new URLSearchParams(params).toString();

        const response = await fetch('https://api-sg.aliexpress.com/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formBody
        });

        const data = await response.json();
        console.log("Respuesta de AliExpress:", data);

        return res.status(200).json(data);
        
    } catch (error) {
        console.error('Error interno:', error);
        return res.status(500).json({ error: error.message });
    }
};
