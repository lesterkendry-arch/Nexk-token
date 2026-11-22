import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("deposit and withdrawal forms open inside the wallet dialog", () => {
  const dialogStart = page.indexOf('<dialog id="walletActionDialog"');
  const dialogEnd = page.indexOf("</dialog>", dialogStart);
  assert.notEqual(dialogStart, -1);
  assert.notEqual(dialogEnd, -1);
  const dialog = page.slice(dialogStart, dialogEnd);
  assert.match(dialog, /id="walletDepositForm"[^>]*hidden/);
  assert.match(dialog, /id="walletWithdrawForm"[^>]*hidden/);
  assert.match(page, /\.wallet-form\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  assert.match(page, /dialog\.showModal\(\)/);
  assert.match(page, /dialog\.close\(\)/);
});

test("history offers cancellation only for pending transactions marked cancellable", () => {
  assert.match(page, /if \(item\.canCancel\)/);
  assert.match(page, /walletApiRequest\('\/api\/wallet\/cancel'/);
  assert.match(page, /window\.confirm\(confirmation\)/);
});
