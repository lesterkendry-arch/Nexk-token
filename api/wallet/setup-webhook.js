import {
  asaas,
  asaasKeyFingerprint,
  getDb,
  HttpError,
  requireUser,
  sendJson,
} from "../_lib.js";

const WEBHOOK_URL = "https://nexk-token.vercel.app/api/asaas-webhook";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  try {
    const user = await requireUser(req);
    if (!user.email || user.email_verified !== true) throw new HttpError(403, "La cuenta debe tener correo verificado.");
    const db = getDb();
    const settingRef = db.collection("walletSettings").doc("asaasWebhook");
    const initial = await settingRef.get();
    const keyFingerprint = asaasKeyFingerprint();
    if (initial.exists && initial.data().status === "active" && initial.data().keyFingerprint === keyFingerprint) {
      return sendJson(res, 200, { ready: true });
    }
    if (user.uid !== "ejd0cPQ5Lgd3Fhpzl6hvj6hLlXi2") {
      throw new HttpError(503, "El administrador todavía debe configurar la confirmación de Asaas.");
    }
    if (!process.env.ASAAS_WEBHOOK_TOKEN) {
      throw new HttpError(503, "Falta terminar la configuración segura de Asaas.");
    }
    const claimed = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(settingRef);
      const config = existing.exists ? existing.data() : {};
      if (config.status === "active" && config.keyFingerprint === keyFingerprint) return "active";
      if (
        config.status === "creating" &&
        config.updatedAt?.toDate &&
        Date.now() - config.updatedAt.toDate().getTime() < 60000
      ) return "creating";
      transaction.set(settingRef, { status: "creating", updatedAt: new Date() }, { merge: true });
      return "claimed";
    });
    if (claimed === "active") return sendJson(res, 200, { ready: true });
    if (claimed === "creating") {
      throw new HttpError(503, "La configuración de Asaas está en curso.");
    }
    try {
      const list = await asaas("/webhooks");
      const webhooks = Array.isArray(list.data) ? list.data : [];
      const conflict = webhooks.find((item) => item.url === WEBHOOK_URL);
      const created = await asaas(conflict ? `/webhooks/${encodeURIComponent(conflict.id)}` : "/webhooks", {
        method: conflict ? "PUT" : "POST",
        idempotencyKey: `nex-wallet-webhook-${user.uid.slice(0, 40)}`,
        body: {
          name: "NEX Token Pix",
          url: WEBHOOK_URL,
          email: user.email,
          enabled: true,
          interrupted: false,
          apiVersion: 3,
          authToken: process.env.ASAAS_WEBHOOK_TOKEN,
          sendType: "SEQUENTIALLY",
          events: [
            "PAYMENT_RECEIVED",
            "PAYMENT_REFUNDED",
            "PAYMENT_PARTIALLY_REFUNDED",
            "TRANSFER_DONE",
            "TRANSFER_FAILED",
            "TRANSFER_CANCELLED",
          ],
        },
      });
      await settingRef.set({
        status: "active",
        providerWebhookId: created.id,
        keyFingerprint,
        updatedAt: new Date(),
      });
      return sendJson(res, 200, { ready: true });
    } catch (error) {
      if (!(error instanceof HttpError && error.status === 409)) {
        await settingRef.set({ status: "failed", updatedAt: new Date() }, { merge: true });
      }
      throw error;
    }
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    return sendJson(res, status, {
      error: status >= 500 ? "No se pudo configurar la confirmación de Asaas." : error.message,
    });
  }
}
