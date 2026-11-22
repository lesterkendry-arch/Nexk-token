import { getDb, HttpError, requireUser, sendJson } from "../_lib.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  try {
    const user = await requireUser(req);
    // A per-user field index works without requiring a new composite index.
    const snapshot = await getDb().collection("walletTransactions").where("uid", "==", user.uid).get();
    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id, kind: data.kind, status: data.status, amountCents: data.amountCents,
        createdAt: data.createdAt?.toDate?.().toISOString() || null,
        pixCopyPaste: data.kind === "deposit" && data.status === "pending" ? data.pixCopyPaste || null : null,
        canCancel: data.status === "pending" && (
          (data.kind === "deposit" && Boolean(data.providerPaymentId)) ||
          (data.kind === "withdrawal" && Boolean(data.providerTransferId))
        ),
        canRecoverPix: data.kind === "deposit" && !["cancelled", "completed", "failed", "review"].includes(data.status) &&
          !data.pixCopyPaste && Boolean(data.providerPaymentId || data.paymentAttempted ||
            (!data.recoveryVersion && data.providerCustomerId)),
      };
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 30);
    return sendJson(res, 200, { items });
  } catch (error) {
    return sendJson(res, error instanceof HttpError ? error.status : 500, { error: "No se pudo cargar el historial." });
  }
}
