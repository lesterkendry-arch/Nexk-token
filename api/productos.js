const crypto = require('crypto');

// Tus credenciales de AliExpress
// (Nota: Ten cuidado de no compartir estos códigos en público, son las llaves de tu negocio)
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

        // ==========================================
        // INTERCEPTAMOS LA BÚSQUEDA POR NOMBRE
        // ==========================================
        let isKeywordSearch = false;
        
        // Si el HTML nos manda "keywords" (nombres), forzamos el buscador por texto
        if (requestData.keywords) {
            requestData.method = 'aliexpress.affiliate.product.query';
            isKeywordSearch = true;
            
            // La API de búsqueda por texto a veces exige un tracking_id, agregamos uno por defecto
            if (!requestData.tracking_id) {
                requestData.tracking_id = 'NeXShopping'; 
            }
        }

        const apiParams = {
            app_key: APP_KEY,
            timestamp: getFormattedTimestamp(),
            sign_method: 'md5',
            v: '2.0',
            format: 'json',
            ...requestData
        };

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

        let data = await response.json();
        
        // ==========================================
        // TRUCO PARA NO ROMPER EL HTML FRONTAL
        // ==========================================
        // Si usamos el buscador de texto, AliExpress nos devuelve un objeto llamado 'aliexpress_affiliate_product_query_response'.
        // Pero tu HTML está esperando 'aliexpress_ds_recommend_feed_get_response'.
        // Aquí lo renombramos para que el HTML reciba exactamente lo que espera y dibuje los productos sin dar error.
        if (isKeywordSearch && data.aliexpress_affiliate_product_query_response) {
            const resultInfo = data.aliexpress_affiliate_product_query_response.resp_result?.result;
            let productosEncontrados = [];
            
            if (resultInfo && resultInfo.products && resultInfo.products.product) {
                productosEncontrados = resultInfo.products.product;
            }

            // Sobrescribimos la variable 'data' con la estructura falsa para el HTML
            data = {
                aliexpress_ds_recommend_feed_get_response: {
                    result: {
                        products: {
                            product: productosEncontrados
                        }
                    }
                }
            };
        }

        console.log("Respuesta de AliExpress enviada a NeX:", JSON.stringify(data).substring(0, 200) + '...');
        return res.status(200).json(data);
        
    } catch (error) {
        console.error('Error al conectar con AliExpress:', error);
        return res.status(500).json({ error: error.message });
    }
};
