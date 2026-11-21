import { requiredEnvironment, sendJson } from "../_lib.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  const missing = requiredEnvironment();
  return sendJson(res, 200, {
    enabled: missing.length === 0,
    mode: "production",
  });
}
