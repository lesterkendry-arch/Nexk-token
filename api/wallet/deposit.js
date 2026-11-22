import { randomUUID } from "node:crypto";
import {
  asaas, assertWebhookReady, centsToReais, getDb, HttpError,
  makeIdempotencyKey, parseMoneyCents, requireUser, sendJson,
} from "../_lib.js";

const FINAL_STATES = new Set(["cancelled", "completed", "review"]);
const leaseTime = (value) => value?.toMillis?.() ?? value?.toDate?.().getTime() ?? (value instanceof Date ? value.getTime() : 0);

function result(id, data) {
  const showCode = data.status === "pending";
  return {
    id,
    status: data.status,
    amountCents: data.amountCents,
    pixCopyPaste: showCode ? data.pixCopyPaste || null : null,
    pixQrCode: showCode ? data.pixQrCode || null : null,
  };
}

function validatePayment(payment, operation, id) {
  if (
    typeof payment?.id !== "string" || payment.externalReference !== id ||
    payment.billingType !== "PIX" ||
    Math.round(Number(payment.value) * 100) !== operation.amountCents ||
    (operation.providerCustomerId && payment.customer !== operation.providerCustomerId)
  ) throw new HttpError(409, "El cobro necesita revisión: sus datos no coinciden con la solicitud.");
}

async function findPayment(operation, id) {
  const list = await asaas(`/payments?externalReference=${encodeURIComponent(id)}&limit=100`);
  if (!Array.isArray(list.data)) throw new HttpError(502, "Asaas no confirmó la búsqueda del cobro.");
  const matches = list.data.filter((item) => item.externalReference === id && item.deleted !== true);
  if (matches.length > 1 || list.hasMore === true) {
    throw new HttpError(409, "Existen varias coincidencias del cobro. El administrador debe revisarlas.");
  }
  if (!matches.length) {
    throw new HttpError(409, "Asaas todavía no confirma si creó este cobro. Conservamos su referencia; vuelve a consultar, sin generar otro.");
  }
  validatePayment(matches[0], operation, id);
  return matches[0];
}

async function getCustomer(db, user, legalName, cpfCnpj, id) {
  const customerRef = db.collection("walletCustomers").doc(user.uid);
  const saved = await customerRef.get();
  let customer;
  if (saved.exists && saved.data().providerCustomerId) {
    customer = await asaas(`/customers/${encodeURIComponent(saved.data().providerCustomerId)}`);
  } else {
    const existing = await asaas(`/customers?externalReference=${encodeURIComponent(`nex-wallet-${user.uid}`)}&limit=1`);
    customer = existing.data?.[0];
    if (!customer) {
      customer = await asaas("/customers", {
        method: "POST", idempotencyKey: `${id}-customer`,
        body: { name: legalName, cpfCnpj, email: user.email || undefined, externalReference: `nex-wallet-${user.uid}`, notificationDisabled: true },
      });
    }
  }
  if (String(customer?.cpfCnpj || "").replace(/\D/g, "") !== cpfCnpj || !customer.id) {
    throw new HttpError(400, "El CPF/CNPJ no coincide con el cliente vinculado.");
  }
  await customerRef.set({ providerCustomerId: customer.id, updatedAt: new Date() });
  return customer;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  let db, opRef, leaseId, operation;
  let paymentRequestInFlight = false;
  try {
    const user = await requireUser(req);
    const id = makeIdempotencyKey(req.headers["idempotency-key"]);
    const recoverOnly = req.body?.recover === true;
    const legalName = String(req.body?.legalName || "").trim();
    const cpfCnpj = String(req.body?.cpfCnpj || "").replace(/\D/g, "");
    if (!recoverOnly && (legalName.length < 5 || legalName.length > 120 || !/\S+\s+\S+/.test(legalName))) {
      throw new HttpError(400, "Escribe tu nombre completo para el cobro Pix.");
    }
    if (!recoverOnly && ![11, 14].includes(cpfCnpj.length)) {
      throw new HttpError(400, "Asaas requiere un CPF o CNPJ válido para crear el cobro.");
    }
    db = getDb();
    await assertWebhookReady(db);
    opRef = db.collection("walletTransactions").doc(id);
    const previous = await opRef.get();
    if (recoverOnly && (!previous.exists || previous.data().uid !== user.uid || previous.data().kind !== "deposit")) {
      throw new HttpError(404, "No se encontró ese depósito en tu cuenta.");
    }
    const amountCents = recoverOnly ? previous.data().amountCents : parseMoneyCents(req.body?.amount);
    if (!Number.isSafeInteger(amountCents) || amountCents < 1000) {
      throw new HttpError(400, "El depósito mínimo es R$10,00.");
    }
    leaseId = randomUUID();
    const now = new Date();
    operation = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(opRef);
      const old = snap.exists ? snap.data() : null;
      if (old && (old.uid !== user.uid || old.kind !== "deposit")) {
        throw new HttpError(409, "La referencia ya fue utilizada para otra solicitud.");
      }
      if (old && old.amountCents !== amountCents) {
        const knownOutcome = old.status === "completed" ||
          (old.status === "pending" && Boolean(old.pixCopyPaste)) ||
          (old.recoveryVersion === 2 && !old.paymentAttempted && !old.providerPaymentId);
        const error = new HttpError(409, knownOutcome
          ? "La referencia anterior corresponde a otro importe. Puedes consultar ese depósito en el historial; vuelve a enviar el formulario para solicitar el nuevo importe."
          : "El depósito anterior todavía necesita confirmación. Recupera su estado desde el historial antes de solicitar otro importe.");
        error.canResetReference = knownOutcome && !(old.leaseId && leaseTime(old.leaseUntil) > Date.now());
        throw error;
      }
      if (old?.status === "cancelled") {
        throw new HttpError(409, "Este Pix ya fue cancelado. Genera una nueva solicitud desde el formulario.");
      }
      if (old?.status === "completed" || (old?.status === "pending" && old.pixCopyPaste)) return { ...old, cached: true };
      if (old?.status === "review") throw new HttpError(409, "El cobro requiere revisión del administrador.");
      if (old?.leaseId && leaseTime(old.leaseUntil) > Date.now()) {
        throw new HttpError(409, "Este cobro se está procesando. Espera un momento y vuelve a consultar.");
      }
      // Legacy requests may have reached Asaas before their payment ID was saved.
      // Such operations must be searched, never blindly created a second time.
      const paymentAttempted = old?.paymentAttempted === true ||
        Boolean(old && !old.recoveryVersion && old.providerCustomerId && !old.providerPaymentId);
      const data = {
        ...(old || { uid: user.uid, kind: "deposit", provider: "asaas", amountCents, currency: "BRL", status: "creating", createdAt: now }),
        paymentAttempted, recoveryVersion: 2, leaseId,
        leaseUntil: new Date(now.getTime() + 120000), updatedAt: now,
      };
      transaction.set(opRef, data);
      return data;
    });
    if (operation.cached) return sendJson(res, 200, result(id, operation));

    async function record(fields) {
      operation = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(opRef);
        const current = snap.data();
        if (current?.leaseId !== leaseId) throw new HttpError(409, "La operación está siendo recuperada. Consulta el historial.");
        if (FINAL_STATES.has(current.status)) return current;
        const next = { ...fields, updatedAt: new Date() };
        transaction.set(opRef, next, { merge: true });
        return { ...current, ...next };
      });
    }

    let payment;
    if (operation.providerPaymentId) {
      payment = await asaas(`/payments/${encodeURIComponent(operation.providerPaymentId)}`);
      validatePayment(payment, operation, id);
    } else if (operation.paymentAttempted) {
      payment = await findPayment(operation, id);
      await record({ providerPaymentId: payment.id, status: "pending", stage: "qr" });
    } else {
      if (recoverOnly) throw new HttpError(400, "Completa el formulario de depósito para reintentar este cobro.");
      const customer = await getCustomer(db, user, legalName, cpfCnpj, id);
      await record({ providerCustomerId: customer.id, stage: "customer_ready" });
      // Persist BEFORE making the request. A timeout must not cause another POST.
      await record({ paymentAttempted: true, stage: "payment_request" });
      paymentRequestInFlight = true;
      payment = await asaas("/payments", {
        method: "POST", idempotencyKey: id,
        body: {
          customer: customer.id, billingType: "PIX", value: centsToReais(amountCents),
          dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          description: "Depósito de cartera NEX Token", externalReference: id,
        },
      });
      validatePayment(payment, operation, id);
      paymentRequestInFlight = false;
      await record({ providerPaymentId: payment.id, status: "pending", stage: "qr" });
    }
    if (!["RECEIVED", "CONFIRMED"].includes(payment.status)) {
      const qr = await asaas(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
      if (!qr.payload) throw new HttpError(502, "El cobro existe, pero Asaas todavía no devolvió su código Pix. Puedes recuperarlo desde el historial.");
      await record({ pixCopyPaste: qr.payload, pixQrCode: qr.encodedImage || null, status: "pending", stage: "ready" });
    }
    await record({ leaseId: null, leaseUntil: null });
    return sendJson(res, 200, result(id, operation));
  } catch (error) {
    let canResetReference = error.canResetReference === true;
    // Release only our lease; never regress a status confirmed by a webhook.
    if (db && opRef && operation && !operation.cached && leaseId) {
      try {
        canResetReference = await db.runTransaction(async (transaction) => {
          const snap = await transaction.get(opRef);
          const current = snap.data();
          if (!current || current.leaseId !== leaseId) return false;
          const definitelyRejected = paymentRequestInFlight && error.definitiveProviderRejection === true;
          const attempted = current.paymentAttempted === true && !definitelyRejected;
          transaction.set(opRef, {
            leaseId: null, leaseUntil: null, updatedAt: new Date(),
            ...(!FINAL_STATES.has(current.status) ? {
              status: current.providerPaymentId ? "pending" : attempted ? "unknown" : "retryable",
              paymentAttempted: attempted,
            } : {}),
          }, { merge: true });
          return !attempted && !current.providerPaymentId && !FINAL_STATES.has(current.status);
        });
      } catch {
        // A crashed worker's lease expires; the persisted stage still prevents duplicate creation.
      }
    }
    const status = error instanceof HttpError ? error.status : 502;
    return sendJson(res, status, {
      canResetReference,
      error: status >= 500
        ? "El depósito quedó sin confirmar. Vuelve a consultar con la misma referencia o recupera el código desde el historial; no se confirmó ningún saldo."
        : error.message,
    });
  }
}
