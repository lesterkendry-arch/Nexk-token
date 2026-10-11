export default async function handler(req, res) {
    // Configura cabeceras CORS para permitir la lectura desde tu frontend
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
        // 1. Obtener Access Token de CJ Dropshipping
        const authResponse = await fetch('https://api.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: "CJ5921371@api@666d4fdecce94d33af10e8"
            })
        });

        const authData = await authResponse.json();

        if (!authData.result || !authData.data || !authData.data.accessToken) {
            return res.status(400).json({ error: "Error al autenticar con CJ Dropshipping", details: authData });
        }

        const accessToken = authData.data.accessToken;

        // 2. Consultar el catálogo de productos usando el token obtenido
        const productsResponse = await fetch('https://api.cjdropshipping.com/api2.0/v1/product/list?pageSize=20&pageNum=1', {
            method: 'GET',
            headers: {
                'CJ-Access-Token': accessToken
            }
        });

        const productsData = await productsResponse.json();
        return res.status(200).json(productsData);

    } catch (error) {
        return res.status(500).json({ error: "Error en el servidor", message: error.message });
    }
}
