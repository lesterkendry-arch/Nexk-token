import {
  getDb,
  HttpError,
  sendJson,
  verifyAsaasWebhook,
} from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  if (!(await verifyAsaasWebhook(req))) {
    return sendJson(res, 401, { error: "No autorizado." });
  }
  try {
    const { event, payment, transfer } = req.body || {};
    const item = payment || transfer;
    if (!event || !item?.id) return sendJson(res, 400, { error: "Evento inválido." });

    const isPayment = Boolean(payment);
    const reference = isPayment ? "providerPaymentId" : "providerTransferId";
    const db = getDb();
    let query = await db
      .collection("walletTransactions")
      .where(reference, "==", item.id)
      .limit(1)
      .get();
    if (query.empty && item.externalReference) {
      const byReference = await db.collection("walletTransactions").doc(String(item.externalReference)).get();
      if (byReference.exists) {
        query = { empty: false, docs: [{ ref: byReference.ref }] };
      }
    }
    if (query.empty) return sendJson(res, 200, { received: true });

    const txRef = query.docs[0].ref;
    await db.runTransaction(async (transaction) => {
      const txSnap = await transaction.get(txRef);
      if (!txSnap.exists) return;
      const data = txSnap.data();
      if (data.status === "completed" || data.status === "failed") return;
      const accountRef = db.collection("walletAccounts").doc(data.uid);
      const accountSnap = await transaction.get(accountRef);
      const account = accountSnap.exists ? accountSnap.data() : {};
      const now = new Date();

      if (isPayment && ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(event)) {
        transaction.set(accountRef, {
          availableCents: Number(account.availableCents || 0) + Number(data.amountCents),
          updatedAt: now,
        }, {merge:true});
        transaction.set(txRef, {status:"completed", updatedAt:now}, {merge:true});
      } else if (!isPayment && event === "TRANSFER_DONE") {
        transaction.set(accountRef, {
          reservedCents: Math.max(0, Number(account.reservedCents || 0) - Number(data.amountCents)),
          updatedAt: now,
        }, {merge:true});
        transaction.set(txRef, {status:"completed", updatedAt:now}, {merge:true});
      } else if (!isPayment && ["TRANSFER_FAILED", "TRANSFER_CANCELLED"].includes(event)) {
        transaction.set(accountRef, {
          availableCents: Number(account.availableCents || 0) + Number(data.amountCents),
          reservedCents: Math.max(0, Number(account.reservedCents || 0) - Number(data.amountCents)),
          withdrawnTodayCents: Math.max(0, Number(account.withdrawnTodayCents || 0) - Number(data.amountCents)),
          updatedAt: now,
        }, {merge:true});
        transaction.set(txRef, {status:"failed", updatedAt:now}, {merge:true});
      }
    });
    return sendJson(res, 200, { received: true });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return sendJson(res, status, { error: status === 500 ? "No se pudo procesar el evento." : error.message });
  }
}
