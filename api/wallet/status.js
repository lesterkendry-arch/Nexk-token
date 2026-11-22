import { getDb, requiredEnvironment, sendJson } from "../_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  let configurationReady = false;
  let webhookReady = false;
  try {
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    configurationReady = requiredEnvironment().length === 0 && account.project_id === "nexk-131a4";
    if (configurationReady) {
      const setting = await getDb().collection("walletSettings").doc("asaasWebhook").get();
      webhookReady = setting.exists && setting.data().status === "active";
    }
  } catch {
    configurationReady = false;
  }
  return sendJson(res, 200, {
    enabled: configurationReady && webhookReady && process.env.PIX_ENABLED === "true",
    configurationReady,
    webhookReady,
    mode: "production",
  });
}
