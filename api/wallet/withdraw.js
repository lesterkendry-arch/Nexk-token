import {
  asaas,
  assertWebhookReady,
  centsToReais,
  dateInSaoPaulo,
  getDb,
  HttpError,
  makeIdempotencyKey,
  parseMoneyCents,
  requireUser,
  sendJson,
} from "../_lib.js";

const DAILY_LIMIT_CENTS = 500000;
const MIN_WITHDRAWAL_CENTS = 2001;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Método no permitido." });
  }
  let user;
  let idempotencyKey;
  let amountCents;
  let reserved = false;
  try {
    user = await requireUser(req);
    amountCents = parseMoneyCents(Number(req.body?.amountCents) / 100);
    if (!Number.isInteger(Number(req.body?.amountCents)) || amountCents <= 0) {
      throw new HttpError(400, "El monto no es válido.");
    }
    if (amountCents < MIN_WITHDRAWAL_CENTS) {
      throw new HttpError(400, "El retiro debe ser mayor de R$20,00 (mínimo R$20,01).");
    }
    idempotencyKey = makeIdempotencyKey(req.headers["idempotency-key"]);
    const legalName = String(req.body?.legalName || "").trim();
    const pixKey = String(req.body?.pixKey || "").trim();
    const pixKeyType = String(req.body?.pixKeyType || "").toUpperCase();
    if (legalName.length < 5 || legalName.length > 120) {
      throw new HttpError(400, "Escribe tu nombre legal completo.");
    }
    if (pixKey.length < 3 || pixKey.length > 120) {
      throw new HttpError(400, "La llave Pix no es válida.");
    }
    if (!["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"].includes(pixKeyType)) {
      throw new HttpError(400, "Selecciona el tipo de llave Pix.");
    }

    const db = getDb();
    await assertWebhookReady(db);
    const txRef = db.collection("walletTransactions").doc(idempotencyKey);
    const replay = await txRef.get();
    if (replay.exists) {
      const data = replay.data();
      if (data.uid !== user.uid || data.kind !== "withdrawal" || data.amountCents !== amountCents) {
        throw new HttpError(409, "La referencia ya fue utilizada para otra solicitud.");
      }
      return sendJson(res, 200, { id: txRef.id, status: data.status, amountCents: data.amountCents });
    }
    const accountRef = db.collection("walletAccounts").doc(user.uid);
    const today = dateInSaoPaulo();
    const now = new Date();
    await db.runTransaction(async (transaction) => {
      const [oldSnap, accountSnap] = await Promise.all([
        transaction.get(txRef),
        transaction.get(accountRef),
      ]);
      if (oldSnap.exists) {
        throw new HttpError(409, "La referencia ya fue utilizada.");
      }
      const account = accountSnap.exists ? accountSnap.data() : {};
      const available = Number(account.availableCents || 0);
      if (account.frozen === true) {
        throw new HttpError(409, "La cuenta requiere revisión del administrador antes de retirar.");
      }
      if (!Number.isSafeInteger(available) || !Number.isSafeInteger(Number(account.reservedCents || 0))) {
        throw new HttpError(503, "No se pudo verificar el saldo.");
      }
      const withdrawnToday =
        account.withdrawalDate === today
          ? Number(account.withdrawnTodayCents || 0)
          : 0;
      if (amountCents > available) {
        throw new HttpError(400, "El saldo disponible no alcanza.");
      }
      if (withdrawnToday + amountCents > DAILY_LIMIT_CENTS) {
        throw new HttpError(400, "El límite diario de retiro es R$5.000,00.");
      }
      transaction.set(
        accountRef,
        {
          availableCents: available - amountCents,
          reservedCents: Number(account.reservedCents || 0) + amountCents,
          withdrawalDate: today,
          withdrawnTodayCents: withdrawnToday + amountCents,
          updatedAt: now,
        },
        { merge: true },
      );
      transaction.create(txRef, {
        uid: user.uid,
        kind: "withdrawal",
        provider: "asaas",
        amountCents,
        currency: "BRL",
        status: "processing",
        createdAt: now,
        updatedAt: now,
        destinationLastFour: pixKey.slice(-4),
        withdrawalDate: today,
        beneficiaryName: legalName,
      });
    });
    reserved = true;

    const transfer = await asaas("/transfers", {
      method: "POST",
      idempotencyKey,
      body: {
        value: centsToReais(amountCents),
        pixAddressKey: pixKey,
        pixAddressKeyType: pixKeyType,
        description: "Retiro de cartera NEX Token",
        externalReference: idempotencyKey,
      },
    });
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(txRef);
      const status = snapshot.data()?.status;
      transaction.set(txRef, {
        providerTransferId: transfer.id,
        ...(status === "processing" || status === "unknown" ? { status: "pending" } : {}),
        updatedAt: new Date(),
      }, { merge: true });
    });
    return sendJson(res, 202, {
      id: idempotencyKey,
      status: "pending",
      amountCents,
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 502;
    if (reserved && user && idempotencyKey && amountCents && error.definitiveProviderRejection === true) {
      try {
        const db = getDb();
        const accountRef = db.collection("walletAccounts").doc(user.uid);
        const txRef = db.collection("walletTransactions").doc(idempotencyKey);
        await db.runTransaction(async (transaction) => {
          const [txSnap, accountSnap] = await Promise.all([
            transaction.get(txRef),
            transaction.get(accountRef),
          ]);
          if (!txSnap.exists || txSnap.data().status !== "processing") return;
          const account = accountSnap.exists ? accountSnap.data() : {};
          transaction.set(accountRef, {
            availableCents: Number(account.availableCents || 0) + amountCents,
            reservedCents: Math.max(0, Number(account.reservedCents || 0) - amountCents),
            ...(account.withdrawalDate === txSnap.data().withdrawalDate
              ? { withdrawnTodayCents: Math.max(0, Number(account.withdrawnTodayCents || 0) - amountCents) }
              : {}),
            updatedAt: new Date(),
          }, { merge: true });
          transaction.set(txRef, {status:"failed", updatedAt:new Date()}, {merge:true});
        });
      } catch {
        // A reservation remains visible for manual reconciliation; never invent a success.
      }
    } else if (reserved && user && idempotencyKey && amountCents) {
      try {
        const db = getDb();
        const ref = db.collection("walletTransactions").doc(idempotencyKey);
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref);
          if (snapshot.data()?.status !== "processing") return;
          transaction.set(ref, { status: "unknown", updatedAt: new Date() }, { merge: true });
        });
      } catch {
        // Keep funds reserved if the provider outcome is unknown.
      }
    }
    return sendJson(res, status, {
      error:
        status >= 500
          ? "El retiro quedó sin confirmar. Consulta el historial antes de volver a intentarlo."
          : error.message,
    });
  }
}
