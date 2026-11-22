export const SAFE_REWARD_FACTOR = 0.2;
export const MIN_PRACTICE_STAKE_MILLI = 400;
export const DEFAULT_PRACTICE_STAKE_MILLI = 1000;

// Public mode settings. Mine counts define the disclosed chance for each cell.
export const MINESWEEPER_MODES = Object.freeze({
  low: Object.freeze({ id: "low", label: "Baja", rows: 4, columns: 4, mines: 3, initialSafeChance: 13 / 16 }),
  medium: Object.freeze({ id: "medium", label: "Media", rows: 5, columns: 5, mines: 8, initialSafeChance: 17 / 25 }),
  maximum: Object.freeze({ id: "maximum", label: "Máxima", rows: 7, columns: 7, mines: 21, initialSafeChance: 28 / 49 }),
});

function getMode(modeId) {
  const mode = MINESWEEPER_MODES[modeId];
  if (!mode) throw new RangeError("Modo de Buscaminas no válido.");
  return mode;
}

function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError("El límite aleatorio debe ser un entero positivo.");
  }
  const cryptoProvider = globalThis.crypto;
  if (!cryptoProvider?.getRandomValues) {
    throw new Error("No está disponible el generador aleatorio seguro del navegador.");
  }

  const uint32Range = 0x100000000;
  const limit = Math.floor(uint32Range / maxExclusive) * maxExclusive;
  const sample = new Uint32Array(1);
  do {
    cryptoProvider.getRandomValues(sample);
  } while (sample[0] >= limit);
  return sample[0] % maxExclusive;
}

export function createMineLocations(modeId, randomInt = secureRandomInt) {
  const mode = getMode(modeId);
  const totalCells = mode.rows * mode.columns;
  const locations = Array.from({ length: totalCells }, (_, index) => index);

  for (let index = 0; index < mode.mines; index += 1) {
    const offset = randomInt(totalCells - index);
    if (!Number.isInteger(offset) || offset < 0 || offset >= totalCells - index) {
      throw new RangeError("El generador aleatorio devolvió un índice no válido.");
    }
    const swapIndex = index + offset;
    [locations[index], locations[swapIndex]] = [locations[swapIndex], locations[index]];
  }

  return locations.slice(0, mode.mines).sort((left, right) => left - right);
}

export function countAdjacentMines(modeId, cellIndex, mineLocations) {
  const mode = getMode(modeId);
  const totalCells = mode.rows * mode.columns;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalCells) {
    throw new RangeError("La casilla no pertenece al tablero.");
  }

  const mines = mineLocations instanceof Set ? mineLocations : new Set(mineLocations);
  const row = Math.floor(cellIndex / mode.columns);
  const column = cellIndex % mode.columns;
  let count = 0;

  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      if (rowOffset === 0 && columnOffset === 0) continue;
      const neighborRow = row + rowOffset;
      const neighborColumn = column + columnOffset;
      if (
        neighborRow >= 0 &&
        neighborRow < mode.rows &&
        neighborColumn >= 0 &&
        neighborColumn < mode.columns &&
        mines.has(neighborRow * mode.columns + neighborColumn)
      ) {
        count += 1;
      }
    }
  }
  return count;
}

export function getNextSafeChance(modeId, safeCellsRevealed = 0) {
  const mode = getMode(modeId);
  const totalCells = mode.rows * mode.columns;
  const totalSafeCells = totalCells - mode.mines;
  if (
    !Number.isInteger(safeCellsRevealed) ||
    safeCellsRevealed < 0 ||
    safeCellsRevealed > totalSafeCells
  ) {
    throw new RangeError("La cantidad de casillas descubiertas no es válida.");
  }
  const hiddenCells = totalCells - safeCellsRevealed;
  if (hiddenCells === 0) return 0;
  return (totalSafeCells - safeCellsRevealed) / hiddenCells;
}

export function calculateSafeReward(stakeMilli) {
  if (
    !Number.isInteger(stakeMilli) ||
    stakeMilli < MIN_PRACTICE_STAKE_MILLI ||
    stakeMilli % 10 !== 0
  ) {
    throw new RangeError("La apuesta debe ser de al menos 0,40 y usar incrementos de 0,01.");
  }
  return Math.round(stakeMilli * SAFE_REWARD_FACTOR);
}

export function parsePracticeStake(value, availableMilli) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const amount = Number(normalized);
  if (!normalized || !Number.isFinite(amount)) {
    return { valid: false, error: "Escribe un monto de práctica válido." };
  }
  const stakeMilli = Math.round(amount * 1000);
  if (Math.abs(amount * 1000 - stakeMilli) > 0.000001) {
    return { valid: false, error: "El monto debe tener hasta tres decimales." };
  }
  if (stakeMilli < MIN_PRACTICE_STAKE_MILLI) {
    return { valid: false, error: "La apuesta mínima es 0,40 pesos del juego." };
  }
  if (!Number.isInteger(availableMilli) || stakeMilli > availableMilli) {
    return { valid: false, error: "La apuesta no puede superar tu saldo de práctica." };
  }
  if (stakeMilli % 10 !== 0) {
    return { valid: false, error: "El monto debe avanzar en pasos de 0,01 pesos del juego." };
  }
  return { valid: true, stakeMilli };
}

export function formatPracticeAmount(amountMilli) {
  if (!Number.isInteger(amountMilli) || amountMilli < 0) {
    throw new RangeError("El saldo de práctica debe ser un entero no negativo.");
  }
  const whole = Math.floor(amountMilli / 1000);
  const remainder = amountMilli % 1000;
  if (remainder === 0) return String(whole);
  if (remainder % 10 === 0) {
    return `${whole}.${String(remainder / 10).padStart(2, "0")}`;
  }
  return `${whole}.${String(remainder).padStart(3, "0")}`;
}

export function startPracticeRound(modeId, stakeValue, availableMilli, randomInt = secureRandomInt) {
  const parsedStake = parsePracticeStake(stakeValue, availableMilli);
  if (!parsedStake.valid) return parsedStake;

  const mineIndices = createMineLocations(modeId, randomInt);
  return {
    valid: true,
    balanceMilli: availableMilli - parsedStake.stakeMilli,
    round: {
      modeId,
      stakeMilli: parsedStake.stakeMilli,
      mineIndices,
      revealedIndices: [],
      accumulatedMilli: 0,
      settledMilli: 0,
      lostAccumulatedMilli: 0,
      status: "active",
    },
  };
}

export function revealPracticeCell(round, cellIndex) {
  if (!round || round.status !== "active") return { outcome: "inactive", round };
  const mode = getMode(round.modeId);
  const totalCells = mode.rows * mode.columns;
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= totalCells) {
    throw new RangeError("La casilla no pertenece al tablero.");
  }
  if (round.revealedIndices.includes(cellIndex)) return { outcome: "duplicate", round };

  const nextRound = { ...round, revealedIndices: [...round.revealedIndices, cellIndex] };
  if (round.mineIndices.includes(cellIndex)) {
    nextRound.hitIndex = cellIndex;
    nextRound.lostAccumulatedMilli = round.accumulatedMilli;
    nextRound.accumulatedMilli = 0;
    nextRound.status = "lost";
    return { outcome: "risk", round: nextRound, balanceAdjustmentMilli: 0 };
  }

  const awardMilli = calculateSafeReward(round.stakeMilli);
  nextRound.accumulatedMilli += awardMilli;
  const mines = new Set(round.mineIndices);
  const safeRevealed = nextRound.revealedIndices.filter((index) => !mines.has(index)).length;
  if (safeRevealed === totalCells - mode.mines) {
    nextRound.settledMilli = nextRound.accumulatedMilli;
    nextRound.accumulatedMilli = 0;
    nextRound.status = "won";
    return {
      outcome: "cleared",
      round: nextRound,
      awardMilli,
      balanceAdjustmentMilli: nextRound.settledMilli,
    };
  }
  return { outcome: "safe", round: nextRound, awardMilli, balanceAdjustmentMilli: 0 };
}

export function settlePracticeRound(round, action, availableMilli) {
  if (!round || round.status !== "active") return { outcome: "inactive", round, balanceMilli: availableMilli };
  if (action === "collect") {
    if (round.accumulatedMilli <= 0) {
      return { outcome: "nothing-to-collect", round, balanceMilli: availableMilli };
    }
    const settledMilli = round.accumulatedMilli;
    return {
      outcome: "collected",
      round: {
        ...round,
        accumulatedMilli: 0,
        settledMilli,
        status: "collected",
      },
      balanceMilli: availableMilli + settledMilli,
    };
  }
  throw new RangeError("Acción de ronda no válida.");
}
