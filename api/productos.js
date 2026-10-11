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
        // 1. Credenciales
        const APP_KEY = "552568";
        const APP_SECRET = "qwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT";
        const API_URL = "https://api-gw.aliexpress.com/router/rest";

        // 2. Formato de Timestamp preciso para TOP / AliExpress (YYYY-MM-DD HH:mm:ss en GMT/UTC)
        const date = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;

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

        // 3. Firma (Sign) - AliExpress exige concatenar APP_SECRET + params ordenados + APP_SECRET
        const sortedKeys = Object.keys(params).sort();
        let queryStr = APP_SECRET;
        for (const key of sortedKeys) {
            queryStr += `${key}${params[key]}`;
        }
        queryStr += APP_SECRET;

        // Hash MD5 en mayúsculas
        const sign = crypto.createHash('md5').update(queryStr, 'utf-8').digest('hex').toUpperCase();
        params.sign = sign;

        // 4. Petición a la API
        const urlParams = new URLSearchParams(params).toString();
        const fetchUrl = `${API_URL}?${urlParams}`;
        
        console.log("=== URL DE PETICIÓN ===");
        console.log(fetchUrl);

        const response = await fetch(fetchUrl, {
            method: 'GET'
        });

        const data = await response.json();

        // 5. REGISTRO DE LOGS (Aquí se fuerza la impresión de la respuesta)
        console.log("=== RESPUESTA DE ALIEXPRESS ===");
        console.log(JSON.stringify(data, null, 2));
        console.log("===============================");

        if (data.error_response) {
            return res.status(400).json({
                error: "Error en la API de AliExpress",
                details: data.error_response
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        // ATRAPA Y MUESTRA CUALQUIER FALLO DE SERVIDOR
        console.error("=== ERROR CRÍTICO ===");
        console.error(error);
        console.error("=====================");

        return res.status(500).json({ error: "Error interno del servidor", message: error.message });
    }
}
