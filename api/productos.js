const crypto = require('crypto');

// Tus credenciales de AliExpress
const APP_KEY = '552568';
const APP_SECRET = 'QwLFTLfIFh3Ksg0JvoDmXDhHXQaXTQVT';

// 1. Función para la hora exacta
function getFormattedTimestamp() {
    const date = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// 2. Ejecución principal
module.exports = async (req, res) => {
    // Permisos CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // Extraemos los datos que envía tu index.html
        let requestData = req.body || {};
        if (typeof requestData === 'string') {
            try { requestData = JSON.parse(requestData); } catch(e) {}
        }

        // Construcción ESTRICTA: Solo inyectamos los valores válidos, cero basura.
        const params = {
            app_key: APP_KEY,
            timestamp: getFormattedTimestamp(),
            sign_method: 'md5',
            format: 'json',
            v: '2.0',
            method: requestData.method,
            country: requestData.country,
            target_currency: requestData.target_currency,
            target_language: requestData.target_language,
            category_id: requestData.category_id,
            feed_name: requestData.feed_name
        };

        // Limpiamos cualquier variable que venga vacía para no ensuciar la firma
        Object.keys(params).forEach(key => {
            if (params[key] === undefined || params[key] === null) {
                delete params[key];
            }
        });

        // Ordenamos estrictamente en orden alfabético
        const sortedKeys = Object.keys(params).sort();

        // Construimos el texto de la firma (Secret + Parametros + Secret)
        let signString = APP_SECRET;
        sortedKeys.forEach(key => {
            signString += key + String(params[key]);
        });
        signString += APP_SECRET;

        // Generamos la clave MD5 en mayúsculas
        params.sign = crypto.createHash('md5').update(signString, 'utf8').digest('hex').toUpperCase();

        // Convertimos al formato nativo de URL para la petición
        const formBody = new URLSearchParams(params).toString();

        // Llamada final al servidor de AliExpress
        const response = await fetch('https://api-sg.aliexpress.com/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            },
            body: formBody
        });

        const data = await response.json();
        
        // Imprime en los logs de Vercel (o en tu cuadro rojo de la tienda)
        console.log("Respuesta de AliExpress:", data);

        return res.status(200).json(data);
        
    } catch (error) {
        console.error('Error interno:', error);
        return res.status(500).json({ error: error.message });
    }
};
