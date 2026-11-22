import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  AVIATOR_GROWTH_PER_SECOND,
  AVIATOR_MAX_CRASH_HUNDREDTHS,
  AVIATOR_MIN_CRASH_HUNDREDTHS,
  calculateAviatorMultiplier,
  calculateAviatorPayoutMilli,
  createAviatorCrashMultiplier,
  createAviatorGameState,
  placeAviatorBet,
  advanceAviatorFlight,
  cashOutAviatorSlot,
  resetAviatorRound,
} from "../aviator-practice.mjs";

const page = await readFile(new URL("../index.html", import.meta.url), "utf8");
const aviatorMarkup = page.match(/<section id="aviatorGameView"[\s\S]*?<section id="walletView"/)?.[0] || "";

test("Aviator is a second playable practice tile beside Minesweeper", () => {
  assert.match(page, /<div class="games-catalog-grid">[\s\S]*id="openMinesweeper"[\s\S]*id="openAviator"[\s\S]*<\/div>/);
  assert.match(aviatorMarkup, /id="aviatorGameView"/);
  assert.match(page, /juego para ganar dinero<\/button>/);
});

test("Aviator starts with a zero demo balance and no real-money controls", () => {
  assert.match(aviatorMarkup, /id="aviatorDemoBalance">0\.00<\/strong>/);
  assert.match(aviatorMarkup, /Simulación de práctica/);
  assert.match(aviatorMarkup, /No hay pagos ni dinero real/);
  assert.doesNotMatch(aviatorMarkup, /R\$/);
  assert.match(aviatorMarkup, /option value="20">20 puntos/);
  assert.match(aviatorMarkup, /option value="50">50 puntos/);
  assert.doesNotMatch(aviatorMarkup, /option value="0"/);
});

test("the reference controls, two panels, moving chart, history, and tabs exist", () => {
  assert.equal((aviatorMarkup.match(/class="aviator-bet-panel"/g) || []).length, 2);
  for (const label of ["10", "20", "50", "100", "500"]) {
    assert.match(aviatorMarkup, new RegExp(`data-aviator-quick="${label}"`));
  }
  assert.match(aviatorMarkup, /id="aviatorMinus0"/);
  assert.match(aviatorMarkup, /id="aviatorPlus0"/);
  assert.match(aviatorMarkup, /id="aviatorGraphCurve"/);
  assert.match(aviatorMarkup, /id="aviatorPlane"/);
  assert.match(aviatorMarkup, /data-aviator-tab="rounds"[^>]*>Rondas/);
  assert.match(aviatorMarkup, /data-aviator-tab="previous"[^>]*>Anterior/);
  assert.match(aviatorMarkup, /data-aviator-tab="top"[^>]*>Topo/);
});

test("the practice multiplier rises by the published constant", () => {
  assert.equal(AVIATOR_GROWTH_PER_SECOND, 0.2);
  assert.equal(calculateAviatorMultiplier(-1), 1);
  assert.equal(calculateAviatorMultiplier(5000), 2);
});

test("crash multiplier is generated uniformly within disclosed bounds", () => {
  assert.equal(createAviatorCrashMultiplier(() => 0), AVIATOR_MIN_CRASH_HUNDREDTHS / 100);
  assert.equal(
    createAviatorCrashMultiplier((range) => range - 1),
    AVIATOR_MAX_CRASH_HUNDREDTHS / 100,
  );
  assert.throws(() => createAviatorCrashMultiplier(() => 999), /no válido/);
});

test("payout returns the stake multiplied by flight progress, rounded to cents", () => {
  assert.equal(calculateAviatorPayoutMilli(1000, 1, 1), 1000);
  assert.equal(calculateAviatorPayoutMilli(1000, 1, 1.43), 1430);
  assert.equal(calculateAviatorPayoutMilli(2000, 1.4, 2.1), 3000);
  assert.throws(() => calculateAviatorPayoutMilli(1000, 1.5, 1.2), /multiplicador/);
});

test("manual cashout credits the in-flight amount and leaves the other panel independent", () => {
  const first = placeAviatorBet(createAviatorGameState(), 0, 1000, 1000, 3);
  assert.equal(first.valid, true);
  assert.equal(first.state.phase, "flying");
  assert.equal(first.state.slots[0].entryMultiplier, 1);

  const second = placeAviatorBet(first.state, 1, 2000, 3000, null);
  assert.equal(second.valid, true);
  assert.equal(second.state.slots[1].entryMultiplier, 1.4);

  const result = cashOutAviatorSlot(second.state, 0, 3000);
  assert.equal(result.outcome, "cashed");
  assert.equal(result.payoutMilli, 1400);
  assert.equal(result.state.slots[0].status, "cashed");
  assert.equal(result.state.slots[1].status, "active");
});

test("a cutoff loses active demo participation and records the round", () => {
  const started = placeAviatorBet(createAviatorGameState(), 0, 1000, 0, 1.2);
  const ended = advanceAviatorFlight(started.state, 1000);
  assert.equal(ended.crashed, true);
  assert.equal(ended.state.phase, "crashed");
  assert.equal(ended.state.slots[0].status, "lost");
  assert.equal(ended.state.slots[0].payoutMilli, 0);
  assert.equal(ended.state.history[0].crashMultiplier, 1.2);
});

test("automatic withdrawal settles before the cutoff, but not at the same cutoff", () => {
  const auto = placeAviatorBet(createAviatorGameState(), 0, 1000, 0, 2, {
    mode: "auto",
    autoCashoutMultiplier: 1.5,
  });
  const paid = advanceAviatorFlight(auto.state, 3000);
  assert.equal(paid.crashed, false);
  assert.equal(paid.payouts[0].payoutMilli, 1500);
  assert.equal(paid.state.slots[0].status, "cashed");

  const tied = placeAviatorBet(createAviatorGameState(), 0, 1000, 0, 1.5, {
    mode: "auto",
    autoCashoutMultiplier: 1.5,
  });
  const cut = advanceAviatorFlight(tied.state, 3000);
  assert.equal(cut.crashed, true);
  assert.equal(cut.state.slots[0].status, "lost");
  assert.equal(cut.payouts.length, 0);
});

test("the next round resets both panels without erasing prior results", () => {
  const started = placeAviatorBet(createAviatorGameState(), 0, 1000, 0, 1.2);
  const crashed = advanceAviatorFlight(started.state, 1000).state;
  const next = resetAviatorRound(crashed);
  assert.equal(next.phase, "waiting");
  assert.equal(next.roundId, crashed.roundId + 1);
  assert.equal(next.slots[0].status, "idle");
  assert.equal(next.history.length, 1);
  assert.equal(next.crashAtMultiplier, null);
});
