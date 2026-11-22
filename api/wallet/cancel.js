import {
  asaas, assertWebhookReady, getDb, HttpError, makeIdempotencyKey, requireUser, sendJson,
} from "../_lib.js";

const FINAL_STATUSES = new Set(["cancelled", "completed", "failed", "review"]);

function validatePayment(payment, operationId, operation) {
  if (
    payment?.id !== operation.providerPaymentId ||
    payment.externalReference !== operationId ||
    payment.billingType !== "PIX" ||
    Math.round(Number(payment.value) * 100) !== operation.amountCents ||
    (operation.providerCustomerId && payment.customer !== operation.providerCustomerId)
  ) {
    throw new HttpError(409, "El cobro no coincide con esta operación y no se canceló.");
  }
}

function validateTransfer(transfer, operationId, operation) {
  if (
    transfer?.id !== operation.providerTransferId ||
    transfer.externalReference !== operationId ||
    Math.round(Number(transfer.value) * 100) !== operation.amountCents
  ) {
    throw new HttpError(409, "El retiro no coincide con esta operación y no se canceló.");
  }
}

async function recordCancellation(db, operationId, userId, kind, providerId, providerStatus) {
  const txRef = db.collection("walletTransactions").doc(operationId);
  return db.runTransaction(async (transaction) => {
    const txSnapshot = await transaction.get(txRef);
    if (!txSnapshot.exists || txSnapshot.data().uid !== userId) {
      throw new HttpError(404, "No se encontró este movimiento en tu cuenta.");
    }

    const operation = txSnapshot.data();
    if (operation.kind !== kind || operation.provider !== "asaas") {
      throw new HttpError(409, "El movimiento no se puede cancelar desde aquí.");
    }
    if (FINAL_STATUSES.has(operation.status)) return { status: operation.status };
    if (
      operation.status !== "pending" ||
      (kind === "deposit" && operation.providerPaymentId !== providerId) ||
      (kind === "withdrawal" && operation.providerTransferId !== providerId)
    ) {
      throw new HttpError(409, "El movimiento ya cambió de estado. Actualiza el historial.");
    }

    const now = new Date();
    if (kind === "deposit") {
      transaction.set(txRef, {
        status: "cancelled",
        providerStatus,
        pixCopyPaste: null,
        pixQrCode: null,
        cancelledAt: now,
        updatedAt: now,
      }, { merge: true });
      return { status: "cancelled" };
    }

    const accountRef = db.collection("walletAccounts").doc(userId);
    const accountSnapshot = await transaction.get(accountRef);
    const account = accountSnapshot.exists ? accountSnapshot.data() : {};
    const available = Number(account.availableCents || 0);
    const reserved = Number(account.reservedCents || 0);
    const withdrawnToday = Number(account.withdrawnTodayCents || 0);
    if (
      !Number.isSafeInteger(operation.amountCents) ||
      operation.amountCents <= 0 ||
      !Number.isSafeInteger(available) ||
      !Number.isSafeInteger(reserved) ||
      reserved < operation.amountCents ||
      (account.withdrawalDate === operation.withdrawalDate && !Number.isSafeInteger(withdrawnToday))
    ) {
      transaction.set(accountRef, { frozen: true, updatedAt: now }, { merge: true });
      transaction.set(txRef, {
        status: "review",
        providerStatus,
        updatedAt: now,
      }, { merge: true });
      return { status: "review" };
    }

    transaction.set(accountRef, {
      availableCents: available + operation.amountCents,
      reservedCents: reserved - operation.amountCents,
      ...(account.withdrawalDate === operation.withdrawalDate
        ? { withdrawnTodayCents: Math.max(0, withdrawnToday - operation.amountCents) }
        : {}),
      updatedAt: now,
    }, { merge: true });
    transaction.set(txRef, {
      status: "cancelled",
      providerStatus,
      cancelledAt: now,
      updatedAt: now,
    }, { merge: true });
    return { status: "cancelled" };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }

  try {
    const user = await requireUser(req);
    const operationId = makeIdempotencyKey(req.body?.id);
    const db = getDb();
    await assertWebhookReady(db);
    const txRef = db.collection("walletTransactions").doc(operationId);
    const snapshot = await txRef.get();
    if (!snapshot.exists || snapshot.data().uid !== user.uid) {
      throw new HttpError(404, "No se encontró este movimiento en tu cuenta.");
    }

    const operation = snapshot.data();
    if (operation.provider !== "asaas") {
      throw new HttpError(409, "El movimiento no se puede cancelar desde aquí.");
    }
    if (operation.status === "cancelled") {
      return sendJson(res, 200, { id: operationId, kind: operation.kind, status: "cancelled" });
    }
    if (operation.status !== "pending") {
      throw new HttpError(409, "Solo se pueden cancelar movimientos pendientes confirmados por Asaas.");
    }

    if (operation.kind === "deposit") {
      const paymentId = operation.providerPaymentId;
      if (!paymentId) throw new HttpError(409, "Asaas todavía no confirmó el cobro; no se canceló.");
      const payment = await asaas(`/payments/${encodeURIComponent(paymentId)}`);
      validatePayment(payment, operationId, operation);
      if (["RECEIVED", "CONFIRMED"].includes(payment.status)) {
        throw new HttpError(409, "Asaas confirmó el pago; no se canceló ni se hizo un reembolso.");
      }
      if (payment.deleted !== true) {
        if (payment.status !== "PENDING") {
          throw new HttpError(409, "El Pix ya no está pendiente. Actualiza el historial antes de continuar.");
        }
        await asaas(`/payments/${encodeURIComponent(paymentId)}`, { method: "DELETE" });
        const confirmed = await asaas(`/payments/${encodeURIComponent(paymentId)}`);
        validatePayment(confirmed, operationId, operation);
        if (["RECEIVED", "CONFIRMED"].includes(confirmed.status)) {
          throw new HttpError(409, "Asaas confirmó el pago; no se canceló ni se hizo un reembolso.");
        }
        if (confirmed.deleted !== true) {
          return sendJson(res, 202, {
            id: operationId,
            kind: operation.kind,
            status: "pending",
            message: "Asaas todavía no confirma la cancelación. Revisa el historial en unos momentos.",
          });
        }
      }
      const result = await recordCancellation(db, operationId, user.uid, "deposit", paymentId, "DELETED");
      return sendJson(res, 200, { id: operationId, kind: operation.kind, ...result });
    }

    if (operation.kind === "withdrawal") {
      const transferId = operation.providerTransferId;
      if (!transferId) throw new HttpError(409, "Asaas todavía no confirmó el retiro; no se canceló.");
      const transfer = await asaas(`/transfers/${encodeURIComponent(transferId)}`);
      validateTransfer(transfer, operationId, operation);

      if (transfer.status !== "CANCELLED") {
        if (typeof transfer.status !== "string" || ["DONE", "FAILED"].includes(transfer.status)) {
          throw new HttpError(409, "Asaas ya no permite cancelar este retiro pendiente.");
        }
        await asaas(`/transfers/${encodeURIComponent(transferId)}/cancel`, { method: "DELETE" });
      }

      const confirmed = transfer.status === "CANCELLED"
        ? transfer
        : await asaas(`/transfers/${encodeURIComponent(transferId)}`);
      validateTransfer(confirmed, operationId, operation);
      if (confirmed.status !== "CANCELLED") {
        return sendJson(res, 202, {
          id: operationId,
          kind: operation.kind,
          status: "pending",
          message: "Asaas todavía no confirmó la cancelación. Revisa el historial en unos momentos.",
        });
      }

      const result = await recordCancellation(
        db, operationId, user.uid, "withdrawal", transferId, confirmed.status,
      );
      return sendJson(res, 200, { id: operationId, kind: operation.kind, ...result });
    }

    throw new HttpError(409, "El movimiento no se puede cancelar desde aquí.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    return sendJson(res, status, {
      error: status >= 500
        ? "No se confirmó la cancelación. Consulta el historial antes de volver a intentarlo."
        : error.message,
    });
  }
}
