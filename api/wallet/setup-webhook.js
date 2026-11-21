import {
  asaas,
  getDb,
  HttpError,
  requireUser,
  requirePixEnabled,
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
    requirePixEnabled();
    if (!user.email) throw new HttpError(403, "La cuenta debe tener correo verificado.");
    const db = getDb();
    const settingRef = db.collection("walletSettings").doc("asaasWebhook");
    if (!process.env.ASAAS_WEBHOOK_TOKEN) {
      throw new HttpError(503, "Falta terminar la configuración segura de Asaas.");
    }
    const claimed = await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(settingRef);
      const config = existing.exists ? existing.data() : {};
      if (config.status === "active") return "active";
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
      if (conflict) {
        await settingRef.set({ status: "manual_review", updatedAt: new Date() }, { merge: true });
        throw new HttpError(409, "Ya existe una configuración de webhook que requiere revisión.");
      }
      const created = await asaas("/webhooks", {
        method: "POST",
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
            "PAYMENT_CONFIRMED",
            "PAYMENT_RECEIVED",
            "TRANSFER_DONE",
            "TRANSFER_FAILED",
            "TRANSFER_CANCELLED",
          ],
        },
      });
      await settingRef.set({
        status: "active",
        providerWebhookId: created.id,
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
