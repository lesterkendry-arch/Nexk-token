const crypto = require('crypto');

// Tus credenciales de AliExpress
const APP_KEY = '552568';
const APP_SECRET = 'QwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT';

// 1. Función para formatear la hora
function getFormattedTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 2. Función para firmar la petición
function generateSign(params, secret) {
    const sortedKeys = Object.keys(params).sort();
    let signString = '';
    for (const key of sortedKeys) {
        if (params[key] !== undefined && params[key] !== null) {
            signString += key + params[key];
        }
    }
    signString = secret + signString + secret;
    return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
}

// 3. Ejecución principal
module.exports = async (req, res) => {
    // Permisos CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // Atrapamos los datos que envía tu index.html (como el category_id)
        const requestData = req.body || {};

        // Construimos los parámetros para AliExpress
        const apiParams = {
            app_key: APP_KEY,
            timestamp: getFormattedTimestamp(),
            sign_method: 'md5',
            feed_name: 'bestseller', // AliExpress a veces exige esto para devolver productos
            ...requestData // Esto inyecta automáticamente el method y la categoría
        };

        // Generamos la firma de seguridad
        apiParams.sign = generateSign(apiParams, APP_SECRET);

        // Convertimos todo a formato de URL
        const urlParams = new URLSearchParams(apiParams).toString();
        const url = `https://api-sg.aliexpress.com/sync?${urlParams}`;

        // Hacemos la llamada final a AliExpress
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const data = await response.json();
        
        // Devolvemos los productos a tu página
        return res.status(200).json(data);
        
    } catch (error) {
        console.error('Error al conectar con AliExpress:', error);
        return res.status(500).json({ error: 'Error interno de conexión' });
    }
};
