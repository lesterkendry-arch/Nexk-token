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
        let requestData = req.body || {};
        if (typeof requestData === 'string') {
            try { requestData = JSON.parse(requestData); } catch(e) {}
        }

        // ========================================================================
        // EL TRADUCTOR: Convierte los nombres de tu HTML a los números de AliExpress
        // ========================================================================
        const diccionarioCategorias = {
            'roupa masculina': '200000343',
            'roupa feminina': '200000348',
            'acessórios para celular': '380230',
            'celular': '5090301',
            'relógio masculino': '1010893',
            'relógio feminino': '1010892',
            'sapatos': '322',
            'shorts': '200000350',
            'luvas': '200000216',
            'ferramentas para conserto de celular': '1420', // ID de Herramientas
            'ferramentas de construção': '100007304'      // ID de Herramientas manuales/construcción
        };

        // Si el HTML nos manda palabras ("keywords"), hacemos el truco
        if (requestData.keywords) {
            // Buscamos el número en nuestro diccionario (si no existe, usa 509 por defecto)
            const numeroCategoria = diccionarioCategorias[requestData.keywords] || '509';
            
            // Le decimos a AliExpress que usaremos su API oficial para Dropshippers
            requestData.method = 'aliexpress.ds.recommend.feed.get';
            
            // Le pasamos el número que quiere
            requestData.category_id = numeroCategoria;
            
            // BORRAMOS la palabra original, porque si AliExpress ve texto en esta API, da error
            delete requestData.keywords;
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

        let bodyString = '';
        for (const key in apiParams) {
            bodyString += encodeURIComponent(key) + '=' + encodeURIComponent(apiParams[key]) + '&';
        }
        bodyString = bodyString.slice(0, -1);

        const url = `https://api-sg.aliexpress.com/sync`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            },
            body: bodyString
        });

        const data = await response.json();
        
        console.log("Respuesta de AliExpress enviada a NeX:", JSON.stringify(data).substring(0, 200) + '...');
        return res.status(200).json(data);
        
    } catch (error) {
        console.error('Error al conectar con AliExpress:', error);
        return res.status(500).json({ error: error.message });
    }
};
