// Offline only: node --experimental-vm-modules --test tests/deposit-recovery.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import test from "node:test";

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class Timestamp {
  constructor(ms) { this.ms = ms; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
}
function copy(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") return new Timestamp(value.getTime());
  if (value instanceof Timestamp) return new Timestamp(value.ms);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  return value;
}
const source = await readFile(new URL("../api/wallet/deposit.js", import.meta.url), "utf8");
const requestId = "offline-deposit-request-00001";
const userId = "offline-user";
const customer = { id: "customer-offline", cpfCnpj: "12345678901" };

async function harness(options = {}) {
  const docs = new Map();
  const payments = new Map();
  const calls = { customerLookup: 0, createPayment: 0, qr: 0, paymentSearch: 0 };
  let actor = userId, sequence = Promise.resolve();
  const ref = (path) => ({
    path,
    async get() { return snapshot(path); },
    async set(data, opts = {}) { docs.set(path, copy(opts.merge ? { ...docs.get(path), ...data } : data)); },
  });
  const snapshot = (path) => ({ exists: docs.has(path), data: () => copy(docs.get(path)) });
  const db = {
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    async runTransaction(callback) {
      const preceding = sequence;
      let release;
      sequence = new Promise((resolve) => { release = resolve; });
      await preceding;
      const writes = [];
      try {
        const result = await callback({
          get: async (doc) => snapshot(doc.path),
          set: (doc, data, opts = {}) => writes.push([doc.path, copy(data), opts]),
        });
        for (const [path, data, opts] of writes) docs.set(path, opts.merge ? { ...docs.get(path), ...data } : data);
        return result;
      } finally { release(); }
    },
  };
  async function provider(path, request = {}) {
    // This function is the only provider implementation. No fetch/network exists.
    if (path.startsWith("/customers?")) {
      calls.customerLookup++;
      if (options.customerOutage && calls.customerLookup === 1) throw new Error("offline customer outage");
      return { data: [copy(customer)] };
    }
    if (path.startsWith("/customers/")) return copy(customer);
    if (path === "/payments" && request.method === "POST") {
      calls.createPayment++;
      if (options.definitiveRejection && calls.createPayment === 1) {
        const error = new HttpError(400, "offline definitive rejection");
        error.definitiveProviderRejection = true;
        throw error;
      }
      if (options.unknownWithoutPayment && calls.createPayment === 1) throw new Error("offline uncertain request");
      const payment = {
        id: `payment-offline-${payments.size + 1}`, externalReference: request.body.externalReference,
        customer: request.body.customer, billingType: request.body.billingType,
        value: request.body.value, status: "PENDING",
      };
      payments.set(payment.id, payment);
      if (options.lostCreateResponse && calls.createPayment === 1) throw new Error("offline response lost after acceptance");
      return copy(payment);
    }
    if (path.startsWith("/payments?")) {
      calls.paymentSearch++;
      if (options.searchRejection) throw new HttpError(400, "offline search rejection");
      const reference = new URL(path, "https://offline.invalid").searchParams.get("externalReference");
      return { data: [...payments.values()].filter((p) => p.externalReference === reference).map(copy), hasMore: false };
    }
    if (path.endsWith("/pixQrCode")) {
      calls.qr++;
      if (options.qrOutage && calls.qr === 1) throw new Error("offline QR outage");
      if (options.webhookCompletesDuringQr) {
        const current = docs.get(`walletTransactions/${requestId}`);
        docs.set(`walletTransactions/${requestId}`, { ...current, status: "completed" });
      }
      return { payload: "offline-pix-code", encodedImage: "offline-image" };
    }
    if (path.startsWith("/payments/")) {
      const payment = payments.get(decodeURIComponent(path.split("/")[2]));
      if (!payment) throw new HttpError(404, "offline payment not found");
      return copy(payment);
    }
    throw new Error(`Unexpected offline provider call: ${path}`);
  }
  const helpers = {
    asaas: provider, getDb: () => db, HttpError,
    assertWebhookReady: async () => {},
    requireUser: async () => ({ uid: actor, email: "offline@example.invalid" }),
    makeIdempotencyKey: (id) => {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id || "")) throw new HttpError(400, "invalid reference");
      return id;
    },
    parseMoneyCents: (value) => {
      const cents = Math.round(Number(value) * 100);
      if (!Number.isFinite(cents) || cents <= 0 || Math.abs(Number(value) * 100 - cents) > 0.00001) throw new HttpError(400, "invalid amount");
      return cents;
    },
    centsToReais: (cents) => Number((cents / 100).toFixed(2)),
    sendJson: (response, status, body) => Object.assign(response, { status, body }),
  };
  const context = vm.createContext({});
  const dependencies = new vm.SyntheticModule(Object.keys(helpers), function () {
    for (const [key, value] of Object.entries(helpers)) this.setExport(key, value);
  }, { context });
  const crypto = new vm.SyntheticModule(["randomUUID"], function () { this.setExport("randomUUID", randomUUID); }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === "../_lib.js") return dependencies;
    if (specifier === "node:crypto") return crypto;
    throw new Error("Unexpected module dependency");
  });
  await module.evaluate();
  async function submit(body = {}, id = requestId) {
    const response = { setHeader() {} };
    await module.namespace.default({
      method: "POST", headers: { "idempotency-key": id },
      body: { amount: 10, legalName: "Offline User", cpfCnpj: customer.cpfCnpj, ...body },
    }, response);
    return response;
  }
  return {
    submit, docs, payments, calls,
    operation: () => docs.get(`walletTransactions/${requestId}`),
    actor: (uid) => { actor = uid; },
  };
}

test("customer lookup outage releases the operation for a same-reference retry", async () => {
  const h = await harness({ customerOutage: true });
  assert.equal((await h.submit()).status, 502);
  assert.equal(h.operation().status, "retryable");
  assert.equal(h.operation().paymentAttempted, false);
  assert.equal(h.operation().leaseId, null);
  const retry = await h.submit();
  assert.equal(retry.status, 200);
  assert.equal(retry.body.pixCopyPaste, "offline-pix-code");
  assert.equal(h.calls.createPayment, 1);
});

test("QR failure recovers the persisted payment without creating another", async () => {
  const h = await harness({ qrOutage: true });
  const first = await h.submit();
  assert.equal(first.status, 502);
  assert.equal(first.body.canResetReference, false);
  assert.equal(h.operation().status, "pending");
  assert.ok(h.operation().providerPaymentId);
  const recovered = await h.submit({ recover: true, legalName: "", cpfCnpj: "" });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.body.pixCopyPaste, "offline-pix-code");
  assert.equal(h.calls.createPayment, 1);
});

test("lost payment-create response is recovered by externalReference", async () => {
  const h = await harness({ lostCreateResponse: true });
  assert.equal((await h.submit()).status, 502);
  assert.equal(h.operation().status, "unknown");
  assert.equal(h.payments.size, 1);
  const recovered = await h.submit({ recover: true });
  assert.equal(recovered.status, 200);
  assert.equal(h.calls.paymentSearch, 1);
  assert.equal(h.calls.createPayment, 1);
  assert.equal(recovered.body.pixCopyPaste, "offline-pix-code");
});

test("unknown creation with no match never sends a second payment request", async () => {
  const h = await harness({ unknownWithoutPayment: true });
  assert.equal((await h.submit()).status, 502);
  const recovery = await h.submit({ recover: true });
  assert.equal(recovery.status, 409);
  assert.equal(recovery.body.canResetReference, false);
  assert.equal(h.operation().status, "unknown");
  assert.equal(h.calls.createPayment, 1);
});

test("a provider read rejection cannot authorize clearing an unknown reference", async () => {
  const h = await harness({ unknownWithoutPayment: true, searchRejection: true });
  await h.submit();
  const recovery = await h.submit({ recover: true });
  assert.equal(recovery.status, 400);
  assert.equal(recovery.body.canResetReference, false);
  assert.equal(h.operation().paymentAttempted, true);
  assert.equal(h.calls.createPayment, 1);
});

test("a definitive rejected creation can be retried without duplicating a payment", async () => {
  const h = await harness({ definitiveRejection: true });
  const rejected = await h.submit();
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.canResetReference, true);
  assert.equal(h.operation().status, "retryable");
  assert.equal(h.operation().paymentAttempted, false);
  assert.equal((await h.submit()).status, 200);
  assert.equal(h.payments.size, 1);
});

test("concurrent retries of one operation create at most one payment", async () => {
  const h = await harness();
  const responses = await Promise.all([h.submit(), h.submit()]);
  assert.ok(responses.every((response) => [200, 409].includes(response.status)));
  assert.equal(h.calls.createPayment, 1);
  assert.equal((await h.submit()).status, 200);
  assert.equal(h.calls.createPayment, 1);
});

test("completed webhook state cannot be regressed by delayed QR retrieval", async () => {
  const h = await harness({ webhookCompletesDuringQr: true });
  const response = await h.submit();
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "completed");
  assert.equal(response.body.pixCopyPaste, null);
  assert.equal(h.operation().status, "completed");
});

test("another user cannot recover an existing deposit", async () => {
  const h = await harness({ qrOutage: true });
  await h.submit();
  h.actor("another-offline-user");
  assert.equal((await h.submit({ recover: true })).status, 404);
  assert.equal(h.calls.qr, 1);
});

test("amount mismatch cannot repurpose an existing operation", async () => {
  const h = await harness();
  await h.submit();
  assert.equal((await h.submit({ amount: 20 })).status, 409);
  assert.equal(h.calls.createPayment, 1);
});

test("minimum deposit is enforced before customer or payment requests", async () => {
  const h = await harness();
  assert.equal((await h.submit({ amount: 9.99 })).status, 400);
  assert.equal(h.calls.customerLookup, 0);
  assert.equal(h.calls.createPayment, 0);
});
