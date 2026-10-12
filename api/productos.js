const crypto = require('crypto');

const APP_KEY = '552568';
const APP_SECRET = 'QwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT';

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

        // Formato de hora UTC exacto para la plataforma
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

        // Parámetros oficiales para cuentas de AFILIADO de AliExpress
        const params = {
            app_key: APP_KEY,
            timestamp: timestamp,
            sign_method: 'md5',
            format: 'json',
            v: '2.0',
            method: 'aliexpress.affiliate.product.query', // <-- Método correcto de Afiliados
            keywords: requestData.keywords || 'smartphone',
            target_currency: requestData.target_currency || 'BRL',
            target_language: requestData.target_language || 'PT',
            page_no: '1',
            page_size: '20'
        };

        // Ordenar alfabéticamente para generar la firma MD5
        const sortedKeys = Object.keys(params).sort();
        let signString = APP_SECRET;
        sortedKeys.forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                signString += key + String(params[key]);
            }
        });
        signString += APP_SECRET;

        params.sign = crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();

        // Petición a la pasarela de AliExpress
        const formBody = new URLSearchParams(params).toString();

        const response = await fetch('https://api-sg.aliexpress.com/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            },
            body: formBody
        });

        const data = await response.json();
        console.log("Respuesta de Afiliados AliExpress:", data);

        return res.status(200).json(data);

    } catch (error) {
        console.error('Error interno:', error);
        return res.status(500).json({ error: error.message });
    }
};
