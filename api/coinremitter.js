export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  const { action, payload } = req.body;
  
  // Datos de autenticación de CoinRemitter
  const API_KEY = "$2y$10$wkey_MBiyQDIooBNV18K";
  const PASSWORD = "04123071043";

  try {
    let targetUrl = "";
    if (action === "create-invoice") {
      targetUrl = "https://coinremitter.com/api/v3/bnb/create-invoice";
    } else if (action === "get-invoice") {
      targetUrl = "https://coinremitter.com/api/v3/bnb/get-invoice";
    } else {
      return res.status(400).json({ message: "Acción no válida" });
    }

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: API_KEY,
        password: PASSWORD,
        ...payload
      })
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
