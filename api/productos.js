const crypto = require('crypto');

// Tus credenciales de AliExpress
const APP_KEY = '552568';
const APP_SECRET = 'QwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT';

// 1. Nueva función para formatear la hora a como lo exige AliExpress
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

// 2. Función de Firma CORREGIDA para AliExpress
function generateSign(params, secret) {
    const sortedKeys = Object.keys(params).sort();
    
    // AliExpress EXIGE poner el secreto al principio...
    let signString = secret; 
    
    for (const key of sortedKeys) {
        signString += key + params[key];
    }
    
    // ... y también al final de la cadena
    signString += secret; 
    
    // Se usa Hash MD5 puro, no HMAC
    return crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();
}

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', 'https://nexshopping.com.br');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    }

    try {
        const frontendData = req.body || {};

        // 3. Parámetros estructurados como exige la documentación oficial
        const apiParams = {
            app_key: APP_KEY,
            timestamp: getFormattedTimestamp(),
            sign_method: 'md5',
            v: '2.0', // Versión obligatoria
            format: 'json', // Formato obligatorio
            ...frontendData // Aquí vendrá el 'method' (ej. aliexpress.ds.product.get) y los datos del producto
        };

        // Generar la firma con la nueva función
        apiParams.sign = generateSign(apiParams, APP_SECRET);

        // Convertir para el body de la petición
        const urlEncodedData = new URLSearchParams(apiParams).toString();

        const response = await fetch('https://api-sg.aliexpress.com/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            },
            body: urlEncodedData
        });

        const data = await response.json();

        // Devolver a tu frontend
        return res.status(200).json(data);

    } catch (error) {
        console.error('Error al conectar con AliExpress:', error);
        return res.status(500).json({ error: 'Error en el backend de Vercel' });
    }
};
