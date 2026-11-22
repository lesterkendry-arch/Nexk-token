export const AVIATOR_GROWTH_PER_SECOND = 0.2;
export const AVIATOR_MIN_CRASH_HUNDREDTHS = 110;
export const AVIATOR_MAX_CRASH_HUNDREDTHS = 500;
export const AVIATOR_CRASH_HUNDREDTHS_COUNT =
  AVIATOR_MAX_CRASH_HUNDREDTHS - AVIATOR_MIN_CRASH_HUNDREDTHS + 1;
export const AVIATOR_DEFAULT_BET_MILLI = 1000;
export const AVIATOR_MIN_BET_MILLI = 400;
export const AVIATOR_BET_STEP_MILLI = 10;
export const AVIATOR_QUICK_BETS_MILLI = Object.freeze([10000, 20000, 50000, 100000, 500000]);

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

export function createAviatorCrashMultiplier(randomInt = secureRandomInt) {
  const offset = randomInt(AVIATOR_CRASH_HUNDREDTHS_COUNT);
  if (!Number.isInteger(offset) || offset < 0 || offset >= AVIATOR_CRASH_HUNDREDTHS_COUNT) {
    throw new RangeError("El generador aleatorio devolvió un valor no válido.");
  }
  return (AVIATOR_MIN_CRASH_HUNDREDTHS + offset) / 100;
}

export function calculateAviatorMultiplier(elapsedMs) {
  if (!Number.isFinite(elapsedMs)) throw new RangeError("El tiempo de vuelo no es válido.");
  return 1 + (Math.max(0, elapsedMs) / 1000) * AVIATOR_GROWTH_PER_SECOND;
}

export function calculateAviatorPayoutMilli(stakeMilli, entryMultiplier, exitMultiplier) {
  if (!Number.isSafeInteger(stakeMilli) || stakeMilli < AVIATOR_MIN_BET_MILLI) {
    throw new RangeError("El monto demo no es válido.");
  }
  if (
    !Number.isFinite(entryMultiplier) ||
    entryMultiplier < 1 ||
    !Number.isFinite(exitMultiplier) ||
    exitMultiplier < entryMultiplier
  ) {
    throw new RangeError("El multiplicador de salida no es válido.");
  }
  const rawMilli = (stakeMilli * exitMultiplier) / entryMultiplier;
  if (!Number.isSafeInteger(Math.round(rawMilli))) throw new RangeError("El resultado supera el límite permitido.");
  return Math.max(stakeMilli, Math.round(rawMilli / AVIATOR_BET_STEP_MILLI) * AVIATOR_BET_STEP_MILLI);
}

function emptySlot(previous = {}) {
  return {
    stakeMilli: Number.isSafeInteger(previous.stakeMilli) ? previous.stakeMilli : AVIATOR_DEFAULT_BET_MILLI,
    mode: previous.mode === "auto" ? "auto" : "manual",
    autoCashoutMultiplier: Number.isFinite(previous.autoCashoutMultiplier)
      ? Math.min(AVIATOR_MAX_CRASH_HUNDREDTHS / 100, Math.max(1.1, previous.autoCashoutMultiplier))
      : 2,
    status: "idle",
    entryMultiplier: 1,
    cashoutMultiplier: null,
    payoutMilli: 0,
  };
}

export function createAviatorGameState(history = [], roundId = 1) {
  return {
    phase: "waiting",
    roundId: Number.isSafeInteger(roundId) && roundId > 0 ? roundId : 1,
    startedAt: null,
    endedAt: null,
    crashAtMultiplier: null,
    currentMultiplier: 1,
    slots: [emptySlot(), emptySlot()],
    history: Array.isArray(history) ? history.slice(0, 50) : [],
  };
}

export function placeAviatorBet(
  state,
  slotIndex,
  stakeMilli,
  now,
  crashMultiplier,
  { mode = "manual", autoCashoutMultiplier = 2 } = {},
) {
  if (![0, 1].includes(slotIndex)) throw new RangeError("Panel de apuesta no válido.");
  if (!Number.isSafeInteger(stakeMilli) || stakeMilli < AVIATOR_MIN_BET_MILLI || stakeMilli % AVIATOR_BET_STEP_MILLI !== 0) {
    throw new RangeError("El monto mínimo es 0,40 y debe avanzar en pasos de 0,01.");
  }
  if (!Number.isFinite(now)) throw new RangeError("La hora de inicio no es válida.");
  if (!["manual", "auto"].includes(mode)) throw new RangeError("Modo de apuesta no válido.");
  if (!Number.isFinite(autoCashoutMultiplier) || autoCashoutMultiplier < 1.1 || autoCashoutMultiplier > 5) {
    throw new RangeError("El retiro automático debe estar entre 1,10x y 5,00x.");
  }

  let currentState = state;
  let payouts = [];
  if (state.phase === "flying") {
    const advanced = advanceAviatorFlight(state, now);
    currentState = advanced.state;
    payouts = advanced.payouts;
  }
  if (!["waiting", "flying"].includes(currentState.phase)) {
    return { valid: false, reason: "round-ended", state: currentState, payouts };
  }
  if (currentState.slots[slotIndex].status !== "idle") {
    return { valid: false, reason: "slot-used", state: currentState, payouts };
  }

  let nextState = currentState;
  if (currentState.phase === "waiting") {
    if (!Number.isFinite(crashMultiplier) || crashMultiplier < 1.1 || crashMultiplier > 5) {
      throw new RangeError("El punto de corte de la ronda no es válido.");
    }
    nextState = {
      ...currentState,
      phase: "flying",
      startedAt: now,
      endedAt: null,
      crashAtMultiplier: crashMultiplier,
      currentMultiplier: 1,
    };
  }
  const entryMultiplier = nextState.phase === "flying"
    ? calculateAviatorMultiplier(now - nextState.startedAt)
    : 1;
  const slots = [...nextState.slots];
  slots[slotIndex] = {
    stakeMilli,
    mode,
    autoCashoutMultiplier,
    status: "active",
    entryMultiplier,
    cashoutMultiplier: null,
    payoutMilli: 0,
  };
  return {
    valid: true,
    state: { ...nextState, currentMultiplier: entryMultiplier, slots },
    payouts,
    stakeMilli,
  };
}

export function advanceAviatorFlight(state, now) {
  if (state.phase !== "flying") return { state, payouts: [], crashed: state.phase === "crashed" };
  if (!Number.isFinite(now) || !Number.isFinite(state.startedAt) || !Number.isFinite(state.crashAtMultiplier)) {
    throw new RangeError("El estado de vuelo no es válido.");
  }

  const currentMultiplier = calculateAviatorMultiplier(now - state.startedAt);
  const payouts = [];
  const slots = state.slots.map((slot, slotIndex) => {
    if (slot.status !== "active" || slot.mode !== "auto") return slot;
    const target = Math.max(slot.entryMultiplier, slot.autoCashoutMultiplier);
    if (target >= state.crashAtMultiplier || currentMultiplier < target) return slot;
    const payoutMilli = calculateAviatorPayoutMilli(slot.stakeMilli, slot.entryMultiplier, target);
    payouts.push({ slotIndex, payoutMilli, multiplier: target });
    return { ...slot, status: "cashed", cashoutMultiplier: target, payoutMilli };
  });

  if (currentMultiplier >= state.crashAtMultiplier) {
    const crashedSlots = slots.map((slot) =>
      slot.status === "active" ? { ...slot, status: "lost", payoutMilli: 0 } : slot,
    );
    const historyEntry = {
      roundId: state.roundId,
      crashMultiplier: state.crashAtMultiplier,
      endedAt: now,
      cashouts: crashedSlots
        .map((slot, slotIndex) => (slot.status === "cashed"
          ? { slotIndex, multiplier: slot.cashoutMultiplier, payoutMilli: slot.payoutMilli }
          : null))
        .filter(Boolean),
    };
    return {
      state: {
        ...state,
        phase: "crashed",
        endedAt: now,
        currentMultiplier: state.crashAtMultiplier,
        slots: crashedSlots,
        history: [historyEntry, ...state.history].slice(0, 50),
      },
      payouts,
      crashed: true,
    };
  }

  return {
    state: { ...state, currentMultiplier, slots },
    payouts,
    crashed: false,
  };
}

export function cashOutAviatorSlot(state, slotIndex, now) {
  if (![0, 1].includes(slotIndex)) throw new RangeError("Panel de apuesta no válido.");
  const advanced = advanceAviatorFlight(state, now);
  if (advanced.state.phase !== "flying") {
    return { outcome: advanced.crashed ? "crashed" : "inactive", ...advanced };
  }
  const slot = advanced.state.slots[slotIndex];
  if (slot.status !== "active") return { outcome: "inactive", ...advanced };
  const payoutMilli = calculateAviatorPayoutMilli(
    slot.stakeMilli,
    slot.entryMultiplier,
    advanced.state.currentMultiplier,
  );
  const slots = [...advanced.state.slots];
  slots[slotIndex] = {
    ...slot,
    status: "cashed",
    cashoutMultiplier: advanced.state.currentMultiplier,
    payoutMilli,
  };
  return {
    outcome: "cashed",
    state: { ...advanced.state, slots },
    payouts: [...advanced.payouts, { slotIndex, payoutMilli, multiplier: advanced.state.currentMultiplier }],
    payoutMilli,
    crashed: false,
  };
}

export function resetAviatorRound(state) {
  return {
    ...state,
    phase: "waiting",
    roundId: state.roundId + 1,
    startedAt: null,
    endedAt: null,
    crashAtMultiplier: null,
    currentMultiplier: 1,
    slots: state.slots.map((slot) => emptySlot(slot)),
  };
}
