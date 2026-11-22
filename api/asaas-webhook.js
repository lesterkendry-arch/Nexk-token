import { createHash } from "node:crypto";
import { asaas, getDb, HttpError, sendJson, verifyAsaasWebhook } from "./_lib.js";

const EVENTS = new Set([
  "PAYMENT_RECEIVED", "PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED",
  "TRANSFER_DONE", "TRANSFER_FAILED", "TRANSFER_CANCELLED",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  if (!(await verifyAsaasWebhook(req))) {
    return sendJson(res, 401, { error: "No autorizado." });
  }
  try {
    const { id, event, payment, transfer } = req.body || {};
    if (!EVENTS.has(event)) return sendJson(res, 200, { received: true });
    const isPayment = event.startsWith("PAYMENT_");
    const item = isPayment ? payment : transfer;
    if (typeof id !== "string" || id.length > 256 || typeof item?.id !== "string") {
      return sendJson(res, 400, { error: "Evento inválido." });
    }
    const db = getDb();
    const eventRef = db.collection("walletWebhookEvents").doc(createHash("sha256").update(id).digest("hex"));
    if ((await eventRef.get()).exists) return sendJson(res, 200, { received: true });
    const providerField = isPayment ? "providerPaymentId" : "providerTransferId";
    const matching = await db.collection("walletTransactions").where(providerField, "==", item.id).limit(1).get();
    let txRef = matching.empty ? null : matching.docs[0].ref;
    if (!txRef && /^[a-zA-Z0-9_-]{16,80}$/.test(String(item.externalReference || ""))) {
      const referenced = db.collection("walletTransactions").doc(item.externalReference);
      if ((await referenced.get()).exists) txRef = referenced;
    }
    if (!txRef) return sendJson(res, 200, { received: true });

    // Never credit or release funds using the event body alone.
    const remote = await asaas(`/${isPayment ? "payments" : "transfers"}/${encodeURIComponent(item.id)}`);
    const amountCents = Math.round(Number(remote.value) * 100);
    if (remote.id !== item.id || remote.externalReference !== txRef.id || !Number.isSafeInteger(amountCents)) {
      throw new HttpError(409, "La referencia del proveedor no coincide.");
    }
    await db.runTransaction(async (transaction) => {
      const [txSnap, eventSnap] = await Promise.all([transaction.get(txRef), transaction.get(eventRef)]);
      if (eventSnap.exists || !txSnap.exists) return;
      const data = txSnap.data();
      if (
        data.provider !== "asaas" || data.kind !== (isPayment ? "deposit" : "withdrawal")
        || data.amountCents !== amountCents || (data[providerField] && data[providerField] !== remote.id)
      ) {
        throw new HttpError(409, "El monto o tipo de operación no coincide.");
      }
      const accountRef = db.collection("walletAccounts").doc(data.uid);
      const accountSnap = await transaction.get(accountRef);
      const account = accountSnap.exists ? accountSnap.data() : {};
      const available = Number(account.availableCents || 0);
      const reserved = Number(account.reservedCents || 0);
      if (!Number.isSafeInteger(available) || !Number.isSafeInteger(reserved)) {
        throw new HttpError(503, "La cuenta requiere revisión.");
      }
      const now = new Date();
      const metadata = { [providerField]: remote.id, providerStatus: remote.status, updatedAt: now };
      const refund = isPayment && (
        event !== "PAYMENT_RECEIVED" || ["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(remote.status)
      );
      if (refund) {
        // Partial refunds/chargebacks require reconciliation; don't expose a spendable estimate.
        transaction.set(accountRef, { frozen: true, updatedAt: now }, { merge: true });
        transaction.set(txRef, { ...metadata, status: "review" }, { merge: true });
      } else if (isPayment && data.status !== "completed" && data.status !== "review") {
        if (remote.status !== "RECEIVED" || remote.billingType !== "PIX") {
          throw new HttpError(503, "El pago aún no está disponible.");
        }
        transaction.set(accountRef, { availableCents: available + amountCents, updatedAt: now }, { merge: true });
        transaction.set(txRef, { ...metadata, status: "completed" }, { merge: true });
      } else if (!isPayment && !["completed", "failed", "cancelled"].includes(data.status)) {
        if (reserved < amountCents) throw new HttpError(503, "La reserva requiere revisión.");
        if (remote.status === "DONE") {
          transaction.set(accountRef, { reservedCents: reserved - amountCents, updatedAt: now }, { merge: true });
          transaction.set(txRef, { ...metadata, status: "completed" }, { merge: true });
        } else if (["FAILED", "CANCELLED"].includes(remote.status)) {
          transaction.set(accountRef, {
            availableCents: available + amountCents,
            reservedCents: reserved - amountCents,
            ...(account.withdrawalDate === data.withdrawalDate
              ? { withdrawnTodayCents: Math.max(0, Number(account.withdrawnTodayCents || 0) - amountCents) }
              : {}),
            updatedAt: now,
          }, { merge: true });
          transaction.set(txRef, {
            ...metadata,
            status: remote.status === "CANCELLED" ? "cancelled" : "failed",
          }, { merge: true });
        } else {
          throw new HttpError(503, "La transferencia aún no tiene resultado definitivo.");
        }
      }
      transaction.create(eventRef, { providerEventId: id, transactionId: txRef.id, event, processedAt: now });
    });
    return sendJson(res, 200, { received: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return sendJson(res, status, { error: "No se pudo confirmar el evento." });
  }
}
