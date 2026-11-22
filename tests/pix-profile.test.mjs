// Offline only: node --experimental-vm-modules --test tests/pix-profile.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as nodeCrypto from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../api/wallet/pix-profile.js", import.meta.url), "utf8");
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function harness() {
  const documents = new Map();
  let currentUid = "user-a";
  const db = {
    collection: (name) => ({
      doc: (uid) => {
        const path = `${name}/${uid}`;
        return {
          async get() {
            return {
              exists: documents.has(path),
              data: () => structuredClone(documents.get(path)),
            };
          },
          async set(data) { documents.set(path, structuredClone(data)); },
        };
      },
    }),
  };
  const helpers = {
    getDb: () => db,
    HttpError,
    requireUser: async () => ({ uid: currentUid }),
    sendJson: (response, status, body) => Object.assign(response, { status, body }),
  };
  const context = vm.createContext({
    Buffer,
    process: { env: { PIX_PROFILE_ENCRYPTION_KEY: nodeCrypto.randomBytes(32).toString("base64url") } },
  });
  const dependencies = new vm.SyntheticModule(Object.keys(helpers), function () {
    for (const [key, value] of Object.entries(helpers)) this.setExport(key, value);
  }, { context });
  const crypto = new vm.SyntheticModule(
    ["createCipheriv", "createDecipheriv", "randomBytes"],
    function () {
      for (const key of ["createCipheriv", "createDecipheriv", "randomBytes"]) this.setExport(key, nodeCrypto[key]);
    },
    { context },
  );
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    if (specifier === "../_lib.js") return dependencies;
    if (specifier === "node:crypto") return crypto;
    throw new Error("Unexpected module dependency");
  });
  await module.evaluate();
  async function request(method, body) {
    const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; } };
    await module.namespace.default({ method, body }, response);
    return response;
  }
  return { request, documents, uid: (uid) => { currentUid = uid; } };
}

test("saves the payout profile encrypted and restores it for the same account", async () => {
  const h = await harness();
  const profile = { legalName: "Example User", pixKeyType: "EMAIL", pixKey: "private@example.invalid" };
  const saved = await h.request("PUT", profile);
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.body.profile)), profile);
  const stored = h.documents.get("walletPayoutProfiles/user-a");
  assert.equal(stored.version, 1);
  const serialized = JSON.stringify(stored);
  assert.ok(!serialized.includes(profile.legalName));
  assert.ok(!serialized.includes(profile.pixKey));
  assert.ok(stored.iv && stored.tag && stored.ciphertext);
  const restored = await h.request("GET");
  assert.equal(restored.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.body.profile)), profile);
});

test("another signed-in account cannot read the saved key", async () => {
  const h = await harness();
  await h.request("PUT", { legalName: "Example User", pixKeyType: "EMAIL", pixKey: "private@example.invalid" });
  h.uid("user-b");
  const result = await h.request("GET");
  assert.equal(result.status, 200);
  assert.equal(result.body.profile, null);
});

test("updates replace the saved encrypted profile and use a fresh IV", async () => {
  const h = await harness();
  await h.request("PUT", { legalName: "Example User", pixKeyType: "EMAIL", pixKey: "first@example.invalid" });
  const oldIV = h.documents.get("walletPayoutProfiles/user-a").iv;
  const updated = await h.request("PUT", { legalName: "Updated User", pixKeyType: "EVP", pixKey: "new-random-key-12345" });
  assert.equal(updated.status, 200);
  const stored = h.documents.get("walletPayoutProfiles/user-a");
  assert.notEqual(stored.iv, oldIV);
  assert.deepEqual(JSON.parse(JSON.stringify((await h.request("GET")).body.profile)), {
    legalName: "Updated User", pixKeyType: "EVP", pixKey: "new-random-key-12345",
  });
});

test("invalid or incomplete profile data is not stored", async () => {
  const h = await harness();
  const result = await h.request("PUT", { legalName: "Short", pixKeyType: "OTHER", pixKey: "x" });
  assert.equal(result.status, 400);
  assert.equal(h.documents.size, 0);
});

test("wrong HTTP methods are rejected", async () => {
  const h = await harness();
  const result = await h.request("POST", {});
  assert.equal(result.status, 405);
});

test("the saved profile API explicitly disables caching", async () => {
  const h = await harness();
  const result = await h.request("GET");
  assert.equal(result.headers["Cache-Control"], "no-store");
  assert.equal(result.headers.Pragma, "no-cache");
});
