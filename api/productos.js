import crypto from 'crypto';

export default async function handler(req, res) {
    // Configura cabeceras CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // 1. Credenciales de AliExpress
        const APP_KEY = "552568";
        const APP_SECRET = "qwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT";
        const API_URL = "https://api.aliexpress.com/sync";

        // 2. Parámetros del método para obtener lista de productos/dropshipping
        const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        
        const params = {
            app_key: APP_KEY,
            method: 'aliexpress.ds.recommend.feed.get',
            format: 'json',
            v: '2.0',
            sign_method: 'md5',
            timestamp: timestamp,
            page_size: '20',
            page_no: '1'
        };

        // 3. Generación de la firma (Sign) requerida por AliExpress
        const sortedKeys = Object.keys(params).sort();
        let queryStr = APP_SECRET;
        for (const key of sortedKeys) {
            queryStr += `${key}${params[key]}`;
        }
        queryStr += APP_SECRET;

        // Crear hash MD5 en mayúsculas
        const sign = crypto.createHash('md5').update(queryStr, 'utf8').digest('hex').toUpperCase();
        params.sign = sign;

        // 4. Realizar la solicitud a la API de AliExpress
        const urlParams = new URLSearchParams(params).toString();
        const response = await fetch(`${API_URL}?${urlParams}`, {
            method: 'GET'
        });

        const data = await response.json();

        if (data.error_response) {
            return res.status(400).json({
                error: "Error en la API de AliExpress",
                details: data.error_response
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        return res.status(500).json({ error: "Error interno del servidor", message: error.message });
    }
}
