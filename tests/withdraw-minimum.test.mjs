// Offline only: node --experimental-vm-modules --test tests/withdraw-minimum.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../api/wallet/withdraw.js", import.meta.url), "utf8");
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function submit(amountCents) {
  let databaseReads = 0;
  const helpers = {
    HttpError,
    requireUser: async () => ({ uid: "offline-user" }),
    parseMoneyCents: (value) => Math.round(Number(value) * 100),
    makeIdempotencyKey: (value) => value,
    assertWebhookReady: async () => {},
    dateInSaoPaulo: () => "2026-11-21",
    centsToReais: (value) => value / 100,
    asaas: async () => { throw new Error("No provider calls are allowed in this offline boundary check"); },
    getDb: () => ({
      collection: () => ({
        doc: () => ({
          id: "offline-request-reference",
          get: async () => {
            databaseReads++;
            // A same-owner replay proves the amount passed validation without
            // creating a transfer, reserving funds, or touching a real account.
            return { exists: true, data: () => ({ uid: "offline-user", kind: "withdrawal", amountCents, status: "pending" }) };
          },
        }),
      }),
    }),
    sendJson: (response, status, body) => Object.assign(response, { status, body }),
  };
  const context = vm.createContext({});
  const dependencies = new vm.SyntheticModule(Object.keys(helpers), function () {
    for (const [key, value] of Object.entries(helpers)) this.setExport(key, value);
  }, { context });
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    assert.equal(specifier, "../_lib.js");
    return dependencies;
  });
  await module.evaluate();
  const response = { setHeader() {} };
  await module.namespace.default({
    method: "POST",
    headers: { "idempotency-key": "offline-request-reference" },
    body: { amountCents, legalName: "Offline User", pixKey: "offline@example.invalid", pixKeyType: "EMAIL" },
  }, response);
  return { ...response, databaseReads };
}

for (const amount of [1, 1999, 2000]) {
  test(`rejects ${amount} cents before reading balances or requesting a payout`, async () => {
    const response = await submit(amount);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /mayor de R\$20,00/);
    assert.equal(response.databaseReads, 0);
  });
}

test("2001 cents is the first permitted amount", async () => {
  const response = await submit(2001);
  assert.equal(response.status, 200);
  assert.equal(response.body.amountCents, 2001);
  assert.equal(response.databaseReads, 1);
});

test("the form matches the server minimum and preserves the daily ceiling", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const input = html.match(/<input[^>]*id="walletWithdrawAmount"[^>]*>/)?.[0];
  assert.ok(input);
  assert.match(input, /\bmin="20\.01"/);
  assert.match(input, /\bmax="5000"/);
  assert.match(input, /\bstep="0\.01"/);
});
