import {
  asaas,
  centsToReais,
  assertWebhookReady,
  getDb,
  HttpError,
  makeIdempotencyKey,
  parseMoneyCents,
  requireUser,
  sendJson,
} from "../_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  try {
    const user = await requireUser(req);
    const userName = String(req.body?.legalName || "").trim();
    const cpfCnpj = String(req.body?.cpfCnpj || "").replace(/\D/g, "");
    if (userName.length < 5 || userName.length > 120 || !/\S+\s+\S+/.test(userName)) {
      throw new HttpError(400, "Escribe tu nombre completo para el cobro Pix.");
    }
    if (![11, 14].includes(cpfCnpj.length)) {
      throw new HttpError(400, "Asaas requiere un CPF o CNPJ válido para crear el cobro.");
    }
    const amountCents = parseMoneyCents(req.body?.amount);
    if (amountCents < 1000) {
      throw new HttpError(400, "El depósito mínimo es R$10,00.");
    }
    const idempotencyKey = makeIdempotencyKey(req.headers["idempotency-key"]);
    const db = getDb();
    await assertWebhookReady(db);
    const opRef = db.collection("walletTransactions").doc(idempotencyKey);
    const now = new Date();
    await db.runTransaction(async (transaction) => {
      const previous = await transaction.get(opRef);
      if (previous.exists) {
        const old = previous.data();
        if (old.uid !== user.uid || old.kind !== "deposit") {
          throw new HttpError(409, "La referencia ya fue utilizada.");
        }
        if (old.status === "pending" && old.pixCopyPaste) return;
        throw new HttpError(409, "Esta operación ya está siendo procesada.");
      }
      transaction.create(opRef, {
        uid: user.uid,
        kind: "deposit",
        provider: "asaas",
        amountCents,
        currency: "BRL",
        status: "creating",
        createdAt: now,
        updatedAt: now,
      });
    });
    const existing = await opRef.get();
    if (existing.data()?.status === "pending" && existing.data()?.pixCopyPaste) {
      return sendJson(res, 200, {
        id: opRef.id,
        status: "pending",
        amountCents: existing.data().amountCents,
        pixCopyPaste: existing.data().pixCopyPaste,
        pixQrCode: existing.data().pixQrCode || null,
      });
    }

    const customerRef = db.collection("walletCustomers").doc(user.uid);
    const savedCustomer = await customerRef.get();
    let customer;
    if (savedCustomer.exists && savedCustomer.data().providerCustomerId) {
      customer = await asaas(`/customers/${encodeURIComponent(savedCustomer.data().providerCustomerId)}`);
      if (String(customer.cpfCnpj || "").replace(/\D/g, "") !== cpfCnpj) {
        throw new HttpError(400, "El CPF/CNPJ no coincide con el cliente ya vinculado a esta cuenta.");
      }
    } else {
      const existing = await asaas(`/customers?externalReference=${encodeURIComponent(`nex-wallet-${user.uid}`)}&limit=1`);
      customer = existing.data?.[0];
      if (customer && String(customer.cpfCnpj || "").replace(/\D/g, "") !== cpfCnpj) {
        throw new HttpError(400, "El CPF/CNPJ no coincide con el cliente vinculado.");
      }
      if (!customer) {
        customer = await asaas("/customers", {
          method: "POST",
          idempotencyKey: `${idempotencyKey}-customer`,
          body: {
            name: userName,
            cpfCnpj,
            email: user.email || undefined,
            externalReference: `nex-wallet-${user.uid}`,
            notificationDisabled: true,
          },
        });
      }
      await customerRef.set({ providerCustomerId: customer.id, updatedAt: new Date() });
    }
    await opRef.set({ providerCustomerId: customer.id, updatedAt: new Date() }, { merge: true });
    const payment = await asaas("/payments", {
      method: "POST",
      idempotencyKey,
      body: {
        customer: customer.id,
        billingType: "PIX",
        value: centsToReais(amountCents),
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
        description: "Depósito de cartera NEX Token",
        externalReference: idempotencyKey,
      },
    });
    await opRef.set({ providerPaymentId: payment.id, updatedAt: new Date() }, { merge: true });
    const qr = await asaas(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(opRef);
      transaction.set(opRef, {
        ...(snapshot.data()?.status === "creating" ? { status: "pending" } : {}),
        pixCopyPaste: qr.payload || null,
        pixQrCode: qr.encodedImage || null,
        updatedAt: new Date(),
      }, { merge: true });
    });
    return sendJson(res, 201, {
      id: opRef.id,
      status: "pending",
      amountCents,
      pixCopyPaste: qr.payload || null,
      pixQrCode: qr.encodedImage || null,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    return sendJson(res, status, {
      error:
        status === 500
          ? "No se pudo iniciar el depósito. No se confirmó ningún saldo."
          : error.message,
    });
  }
}
