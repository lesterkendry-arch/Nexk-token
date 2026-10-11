import crypto from 'crypto';

export default async function handler(req, res) {
    // Configura cabeceras CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const APP_KEY = "552568"; 
        const APP_SECRET = "qwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT";
        const API_URL = "https://api-gw.aliexpress.com/router/rest";

        // ====================================================================
        // AQUÍ ESTÁ TU TOKEN INTEGRADO
        // ====================================================================
        const ACCESS_TOKEN = "50000601c30atpedfgu3LVvik87Ixlsvle3mSoB7701ceb156fPunYZ43GBg"; 

        // Formato de Timestamp para la API (Hora de Beijing)
        const date = new Date();
        const utcTime = date.getTime() + (date.getTimezoneOffset() * 60000);
        const beijingTime = new Date(utcTime + (3600000 * 8));
        
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${beijingTime.getFullYear()}-${pad(beijingTime.getMonth() + 1)}-${pad(beijingTime.getDate())} ${pad(beijingTime.getHours())}:${pad(beijingTime.getMinutes())}:${pad(beijingTime.getSeconds())}`;

        // Parámetros de la petición con el TOKEN INCLUIDO
        const params = {
            app_key: APP_KEY,
            session: ACCESS_TOKEN,
            method: 'aliexpress.ds.recommend.feed.get',
            format: 'json',
            v: '2.0',
            sign_method: 'md5',
            timestamp: timestamp,
            page_size: '20',
            page_no: '1',
            feed_name: 'bestseller',
            target_currency: 'BRL',
            target_language: 'PT',
            country: 'BR'
        };

        // Encriptar y firmar la petición
        const sortedKeys = Object.keys(params).sort();
        let queryStr = APP_SECRET;
        for (const key of sortedKeys) {
            queryStr += `${key}${params[key]}`;
        }
        queryStr += APP_SECRET;

        const sign = crypto.createHash('md5').update(queryStr, 'utf-8').digest('hex').toUpperCase();
        params.sign = sign;

        // Hacer la llamada a AliExpress
        const urlParams = new URLSearchParams(params).toString();
        const fetchUrl = `${API_URL}?${urlParams}`;

        const response = await fetch(fetchUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36'
            }
        });

        // Revisar respuesta
        const rawText = await response.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseError) {
            console.error("=== ERROR: LA RESPUESTA NO ES JSON ===");
            return res.status(500).json({
                error: "AliExpress devolvió HTML. Posiblemente el token es inválido o caducó.",
                respuesta_corta: rawText.substring(0, 150)
            });
        }

        if (data.error_response) {
            return res.status(400).json({ error: "Error en AliExpress", detalles: data.error_response });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error("=== ERROR CRÍTICO ===", error);
        return res.status(500).json({ error: "Error interno", mensaje: error.message });
    }
}
