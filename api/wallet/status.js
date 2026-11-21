import { requiredEnvironment, sendJson } from "../_lib.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  const missing = requiredEnvironment();
  let firebaseValid = false;
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "{}");
    firebaseValid = serviceAccount.project_id === "nexk-131a4";
  } catch (error) {
    firebaseValid = false;
  }
  return sendJson(res, 200, {
    enabled: missing.length === 0 && firebaseValid,
    mode: "production",
  });
}
