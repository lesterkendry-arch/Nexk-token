// Offline only: node --experimental-vm-modules --test tests/wallet-cancel.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const source = await readFile(new URL("../api/wallet/cancel.js", import.meta.url), "utf8");
const operationId = "offline-wallet-operation-123";

async function harness({
  kind = "deposit",
  actor = "user-1",
  status = "pending",
  reservedCents = 2000,
  paymentPaidDuringDelete = false,
} = {}) {
  const docs = new Map();
  const calls = [];
  const operation = {
    uid: "user-1",
    kind,
    provider: "asaas",
    amountCents: 2000,
    status,
    createdAt: new Date(),
    ...(kind === "deposit"
      ? { providerPaymentId: "payment-1", providerCustomerId: "customer-1", pixCopyPaste: "pending-pix" }
      : { providerTransferId: "transfer-1", withdrawalDate: "2026-11-22" }),
  };
  docs.set(`walletTransactions/${operationId}`, structuredClone(operation));
  docs.set("walletAccounts/user-1", {
    availableCents: 5000,
    reservedCents,
    withdrawalDate: "2026-11-22",
    withdrawnTodayCents: reservedCents,
    frozen: false,
  });

  const reference = (path) => ({
    path,
    async get() {
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => structuredClone(data) };
    },
  });
  const db = {
    collection: (name) => ({ doc: (id) => reference(`${name}/${id}`) }),
    async runTransaction(callback) {
      const writes = [];
      const result = await callback({
        get: async (ref) => {
          const data = docs.get(ref.path);
          return { exists: data !== undefined, data: () => structuredClone(data) };
        },
        set: (ref, data, options = {}) => writes.push([ref.path, structuredClone(data), options]),
      });
      for (const [path, data, options] of writes) {
        docs.set(path, options.merge ? { ...docs.get(path), ...data } : data);
      }
      return result;
    },
  };

  const payment = {
    id: "payment-1",
    externalReference: operationId,
    billingType: "PIX",
    value: 20,
    customer: "customer-1",
    status: "PENDING",
    deleted: false,
  };
  const transfer = {
    id: "transfer-1",
    externalReference: operationId,
    value: 20,
    status: "PENDING",
  };
  const helpers = {
    asaas: async (path, request = {}) => {
      calls.push({ path, method: request.method || "GET" });
      if (path === "/payments/payment-1" && request.method === "DELETE") {
        if (paymentPaidDuringDelete) payment.status = "RECEIVED";
        else payment.deleted = true;
        return { ...payment };
      }
      if (path === "/payments/payment-1") return { ...payment };
      if (path === "/transfers/transfer-1/cancel" && request.method === "DELETE") {
        transfer.status = "CANCELLED";
        return { ...transfer };
      }
      if (path === "/transfers/transfer-1") return { ...transfer };
      throw new Error(`Unexpected offline provider call: ${path}`);
    },
    assertWebhookReady: async () => {},
    getDb: () => db,
    HttpError,
    makeIdempotencyKey: (value) => {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(value || "")) throw new HttpError(400, "invalid id");
      return value;
    },
    requireUser: async () => ({ uid: actor }),
    sendJson: (response, code, body) => Object.assign(response, { status: code, body }),
  };
  const context = vm.createContext({});
  const dependencies = new vm.SyntheticModule(Object.keys(helpers), function () {
    for (const [key, value] of Object.entries(helpers)) this.setExport(key, value);
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === "../_lib.js") return dependencies;
    throw new Error(`Unexpected module dependency: ${specifier}`);
  });
  await module.evaluate();

  async function submit(id = operationId) {
    const response = { setHeader() {} };
    await module.namespace.default({
      method: "POST",
      headers: {},
      body: { id },
    }, response);
    return response;
  }
  return { submit, docs, calls, operation: () => docs.get(`walletTransactions/${operationId}`) };
}

test("a pending Pix deposit is deleted and marked cancelled", async () => {
  const h = await harness({ kind: "deposit" });
  const response = await h.submit();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "cancelled");
  assert.equal(h.operation().status, "cancelled");
  assert.equal(h.operation().pixCopyPaste, null);
  assert.deepEqual(h.calls.map((call) => call.method), ["GET", "DELETE", "GET"]);
});

test("a payment that becomes received during cancellation is not marked cancelled", async () => {
  const h = await harness({ kind: "deposit", paymentPaidDuringDelete: true });
  const response = await h.submit();
  assert.equal(response.status, 409);
  assert.match(response.body.error, /no se canceló/);
  assert.equal(h.operation().status, "pending");
  assert.equal(h.operation().pixCopyPaste, "pending-pix");
});

test("a different account cannot cancel the deposit", async () => {
  const h = await harness({ kind: "deposit", actor: "other-user" });
  const response = await h.submit();
  assert.equal(response.status, 404);
  assert.equal(h.calls.length, 0);
  assert.equal(h.operation().status, "pending");
});

test("a completed payment is never deleted", async () => {
  const h = await harness({ kind: "deposit" });
  h.docs.set("walletTransactions/" + operationId, { ...h.operation(), status: "completed" });
  const response = await h.submit();
  assert.equal(response.status, 409);
  assert.equal(h.calls.length, 0);
  assert.equal(h.operation().status, "completed");
});

test("a cancelled Pix transfer releases its reservation once", async () => {
  const h = await harness({ kind: "withdrawal" });
  const response = await h.submit();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "cancelled");
  assert.equal(h.operation().status, "cancelled");
  assert.deepEqual(h.docs.get("walletAccounts/user-1"), {
    availableCents: 7000,
    reservedCents: 0,
    withdrawalDate: "2026-11-22",
    withdrawnTodayCents: 0,
    frozen: false,
    updatedAt: h.docs.get("walletTransactions/" + operationId).updatedAt,
  });
  assert.deepEqual(h.calls.map((call) => call.method), ["GET", "DELETE", "GET"]);
});

test("repeat cancellation is idempotent", async () => {
  const h = await harness({ kind: "withdrawal" });
  assert.equal((await h.submit()).body.status, "cancelled");
  const callsAfterFirst = h.calls.length;
  const response = await h.submit();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "cancelled");
  assert.equal(h.calls.length, callsAfterFirst);
});
