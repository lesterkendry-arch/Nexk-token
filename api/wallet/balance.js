import {
  getDb,
  requireUser,
  sendJson,
  HttpError,
} from "../_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  try {
    const user = await requireUser(req);
    const snapshot = await getDb().collection("walletAccounts").doc(user.uid).get();
    const account = snapshot.exists ? snapshot.data() : {};
    return sendJson(res, 200, {
      availableCents: account.frozen === true ? null : Number(account.availableCents || 0),
      reservedCents: Number(account.reservedCents || 0),
      frozen: account.frozen === true,
      currency: "BRL",
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return sendJson(res, status, {
      error: status === 500 ? "No se pudo cargar la cartera." : error.message,
    });
  }
}
