const crypto = require('crypto');

// Tus credenciales de AliExpress
const APP_KEY = '552568';
const APP_SECRET = 'QwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT';

// 1. Función para formatear la hora exacta
function getFormattedTimestamp() {
    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 2. Función para firmar la petición EXACTAMENTE como exige AliExpress
function generateSign(params, secret) {
    // Obtenemos las llaves y las ordenamos alfabéticamente
    const sortedKeys = Object.keys(params).sort();
    
    // La firma empieza con el secret
    let signString = secret; 
    
    for (const key of sortedKeys) {
        // Se ignoran valores vacíos y nos aseguramos de no incluir la propia llave 'sign'
        if (params[key] !== undefined && params[key] !== null && key !== 'sign') {
            // Convertimos forzosamente todo a texto para que no se descuadre la firma
            signString += key + String(params[key]);
        }
    }
    
    // La firma termina con el secret
    signString += secret; 
    
    // Generamos MD5 en UTF-8 y lo pasamos a mayúsculas
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
        // Aseguramos que Vercel lea bien los datos enviados desde tu página
        let requestData = req.body || {};
        if (typeof requestData === 'string') {
            try { requestData = JSON.parse(requestData); } catch(e) {}
        }

        // Construimos todos los parámetros
        const apiParams = {
            app_key: APP_KEY,
            timestamp: getFormattedTimestamp(),
            sign_method: 'md5',
            v: '2.0',
            format: 'json',
            ...requestData
        };

        // Generamos la firma de seguridad
        apiParams.sign = generateSign(apiParams, APP_SECRET);

        // IMPORTANTE: Armamos los datos "a mano" en vez de usar URLSearchParams
        // Esto evita que los espacios de la fecha se conviertan en "+" y den error de firma
        let bodyString = '';
        for (const key in apiParams) {
            bodyString += encodeURIComponent(key) + '=' + encodeURIComponent(apiParams[key]) + '&';
        }
        bodyString = bodyString.slice(0, -1); // Quitamos el último '&'

        const url = `https://api-sg.aliexpress.com/sync`;

        // Hacemos la llamada final a AliExpress
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            },
            body: bodyString
        });

        const data = await response.json();
        
        // Imprimimos la respuesta en la consola de Vercel
        console.log("Respuesta de AliExpress:", data);

        // Devolvemos la respuesta (ahora sí, los productos) a tu página NeX
        return res.status(200).json(data);
        
    } catch (error) {
        console.error('Error al conectar con AliExpress:', error);
        return res.status(500).json({ error: error.message });
    }
};
