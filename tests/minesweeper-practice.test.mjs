import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateSafeReward,
  countAdjacentMines,
  createMineLocations,
  formatPracticeAmount,
  getNextSafeChance,
  MINESWEEPER_MODES,
  parsePracticeStake,
  revealPracticeCell,
  settlePracticeRound,
  startPracticeRound,
} from "../minesweeper-practice.mjs";

const page = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("the practice page exposes all three modes, bet bounds, and both balance readouts", () => {
  assert.match(page, /id="gamePracticeMode"[\s\S]*?value="low"[\s\S]*?value="medium"[\s\S]*?value="maximum"/);
  assert.match(page, /id="gamePracticeStake" type="number" min="0\.40" step="0\.01"[^>]*value="1"/);
  assert.match(page, /id="gamePracticeBalance"/);
  assert.match(page, /id="gamePracticeBottomBalance"/);
  assert.match(page, /id="gamePracticePlay"/);
  assert.match(page, /id="minesweeperBoard"[^>]*role="group"/);
  assert.match(page, /Solo puntos demo; no es dinero real\./);
});

test("the original game label stays exact and the catalog opens the visible game board", () => {
  assert.match(page, /class="entry-choice entry-choice-secondary"[^>]*>juego para ganar dinero<\/button>/);
  assert.match(page, /data-portal-section="game"[^>]*>juego para ganar dinero<\/button>/);
  const catalog = page.match(/<section id="gamesHomeView"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(catalog, /id="openMinesweeper"/);
  assert.match(catalog, /Buscaminas/);
  assert.doesNotMatch(catalog, /gamePracticeBalance|gamePracticeModeInfo|<p\b/);
  assert.match(page, /id="minesweeperGameView"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(page, /Tablero · casillas ocultas/);
});

test("practice starts at zero without offering a zero-point selector option", () => {
  assert.match(page, /id="gamePracticeBalance"[^>]*>0 pesos del juego<\/strong>/);
  assert.match(page, /id="gamePracticeAmount"[\s\S]*?value="20"[\s\S]*?value="50"/);
  assert.doesNotMatch(page, /<option value="0">/);
  assert.match(page, /new Set\(\[20, 50\]\)/);
  assert.match(page, /Elige 20 o 50 puntos demo\./);
});

test("each disclosed mode has a unique grid, mine count, and safe-cell chance", () => {
  assert.deepEqual(
    Object.values(MINESWEEPER_MODES).map(({ rows, columns, mines }) => ({
      cells: rows * columns,
      mines,
      safe: rows * columns - mines,
    })),
    [
      { cells: 16, mines: 3, safe: 13 },
      { cells: 25, mines: 8, safe: 17 },
      { cells: 49, mines: 21, safe: 28 },
    ],
  );
  assert.equal(getNextSafeChance("low"), 13 / 16);
  assert.equal(getNextSafeChance("medium"), 17 / 25);
  assert.equal(getNextSafeChance("maximum"), 28 / 49);
  for (const mode of Object.values(MINESWEEPER_MODES)) {
    assert.equal(mode.initialSafeChance, getNextSafeChance(mode.id));
  }
  assert.equal(getNextSafeChance("low", 1), 12 / 15);
});

test("mine generation returns the configured count without duplicate cells", () => {
  const mines = createMineLocations("medium", () => 0);
  assert.equal(mines.length, MINESWEEPER_MODES.medium.mines);
  assert.equal(new Set(mines).size, mines.length);
  assert.ok(mines.every((index) => index >= 0 && index < 25));
});

test("adjacent mine counts respect row and column boundaries", () => {
  assert.equal(countAdjacentMines("medium", 12, [6, 7, 11, 13, 17, 18]), 6);
  assert.equal(countAdjacentMines("low", 4, [3]), 0);
});

test("each safe cell accumulates exactly twenty percent of the original stake", () => {
  assert.equal(calculateSafeReward(5000), 1000);
  assert.equal(calculateSafeReward(10000), 2000);
  assert.equal(calculateSafeReward(400), 80);
  assert.throws(() => calculateSafeReward(405), /incrementos/);
});

test("practice stake validation enforces minimum, balance, and cent increments", () => {
  assert.deepEqual(parsePracticeStake("0.40", 400), { valid: true, stakeMilli: 400 });
  assert.deepEqual(parsePracticeStake("5", 10000), { valid: true, stakeMilli: 5000 });
  assert.deepEqual(parsePracticeStake("10", 10000), { valid: true, stakeMilli: 10000 });
  assert.equal(parsePracticeStake("0.39", 1000).valid, false);
  assert.equal(parsePracticeStake("1.01", 1000).valid, false);
  assert.equal(parsePracticeStake("0.405", 1000).valid, false);
});

test("practice amounts display the whole balance and fractional rewards clearly", () => {
  assert.equal(formatPracticeAmount(0), "0");
  assert.equal(formatPracticeAmount(20000), "20");
  assert.equal(formatPracticeAmount(400), "0.40");
  assert.equal(formatPracticeAmount(82), "0.082");
});

test("starting a round deducts the selected practice stake only", () => {
  const started = startPracticeRound("low", "5", 20000, () => 0);
  assert.equal(started.valid, true);
  assert.equal(started.balanceMilli, 15000);
  assert.equal(started.round.stakeMilli, 5000);
  assert.equal(started.round.status, "active");
  assert.equal(started.round.mineIndices.length, 3);
  assert.equal(startPracticeRound("low", "0.39", 20000).valid, false);
  assert.equal(startPracticeRound("low", "20.01", 20000).valid, false);
});

test("a safe cell adds twenty percent and a mine discards the round accumulation", () => {
  const round = {
    modeId: "low",
    stakeMilli: 5000,
    mineIndices: [0, 1, 2],
    revealedIndices: [],
    accumulatedMilli: 0,
    settledMilli: 0,
    lostAccumulatedMilli: 0,
    status: "active",
  };
  const safe = revealPracticeCell(round, 5);
  assert.equal(safe.outcome, "safe");
  assert.equal(safe.awardMilli, 1000);
  assert.equal(safe.round.accumulatedMilli, 1000);
  const risk = revealPracticeCell(safe.round, 0);
  assert.equal(risk.outcome, "risk");
  assert.equal(risk.round.lostAccumulatedMilli, 1000);
  assert.equal(risk.round.accumulatedMilli, 0);
  assert.equal(risk.round.status, "lost");
});

test("collecting only returns accumulated practice points, never the deducted entry stake", () => {
  const active = {
    modeId: "low",
    stakeMilli: 5000,
    mineIndices: [0, 1, 2],
    revealedIndices: [5],
    accumulatedMilli: 1000,
    settledMilli: 0,
    lostAccumulatedMilli: 0,
    status: "active",
  };
  const collected = settlePracticeRound(active, "collect", 15000);
  assert.equal(collected.balanceMilli, 16000);
  assert.equal(collected.round.settledMilli, 1000);
  assert.equal(collected.round.accumulatedMilli, 0);
});

test("clearing every safe cell adds only the accumulated reward", () => {
  const mineIndices = [0, 1, 2];
  let round = {
    modeId: "low",
    stakeMilli: 400,
    mineIndices,
    revealedIndices: [],
    accumulatedMilli: 0,
    settledMilli: 0,
    lostAccumulatedMilli: 0,
    status: "active",
  };
  let result;
  for (let index = 3; index < 16; index += 1) {
    result = revealPracticeCell(round, index);
    round = result.round;
  }
  assert.equal(result.outcome, "cleared");
  assert.equal(round.status, "won");
  assert.equal(round.accumulatedMilli, 0);
  assert.equal(round.settledMilli, 13 * 80);
  assert.equal(result.balanceAdjustmentMilli, 1040);
});
