import {
  advanceAviatorFlight,
  AVIATOR_BET_STEP_MILLI,
  AVIATOR_DEFAULT_BET_MILLI,
  AVIATOR_GROWTH_PER_SECOND,
  AVIATOR_MIN_BET_MILLI,
  calculateAviatorMultiplier,
  calculateAviatorPayoutMilli,
  createAviatorCrashMultiplier,
  createAviatorGameState,
  placeAviatorBet,
  cashOutAviatorSlot,
  resetAviatorRound,
} from "./aviator-practice.mjs";

const SLOT_INDICES = [0, 1];
const WAGERS_ENABLED = false;

export function setupAviatorPractice({ auth, getBalance, setBalance, parseStake, onOpen, onBack }) {
  const stateByUser = new Map();
  const resetTimers = new Map();
  let animationFrameId = null;
  let animationUid = null;

  const $ = (id) => document.getElementById(id);

  function storageKey(uid) {
    return `nex_aviator_practice_v3_${uid}`;
  }

  function isValidState(state) {
    if (!state || typeof state !== "object") return false;
    if (!["waiting", "flying", "crashed"].includes(state.phase)) return false;
    if (!Number.isSafeInteger(state.roundId) || state.roundId < 1) return false;
    if (!Array.isArray(state.slots) || state.slots.length !== 2 || !Array.isArray(state.history) || state.history.length > 50) {
      return false;
    }
    if (state.phase === "flying" &&
        (!Number.isFinite(state.startedAt) ||
         !Number.isFinite(state.crashAtMultiplier) ||
         state.crashAtMultiplier < 1.1 ||
         state.crashAtMultiplier > 5)) return false;
    if (state.history.some((entry) =>
      !entry ||
      !Number.isSafeInteger(entry.roundId) ||
      !Number.isFinite(entry.crashMultiplier) ||
      entry.crashMultiplier < 1.1 ||
      entry.crashMultiplier > 5 ||
      !Array.isArray(entry.cashouts)
    )) return false;
    return state.slots.every((slot) =>
      slot &&
      ["idle", "active", "cashed", "lost"].includes(slot.status) &&
      Number.isSafeInteger(slot.stakeMilli) &&
      slot.stakeMilli >= AVIATOR_MIN_BET_MILLI &&
      slot.stakeMilli % AVIATOR_BET_STEP_MILLI === 0 &&
      ["manual", "auto"].includes(slot.mode) &&
      Number.isFinite(slot.entryMultiplier) &&
      slot.entryMultiplier >= 1 &&
      Number.isSafeInteger(slot.payoutMilli) &&
      slot.payoutMilli >= 0
    );
  }

  function getState(uid) {
    if (!uid) return createAviatorGameState();
    if (stateByUser.has(uid)) return stateByUser.get(uid);
    let state = null;
    try {
      const stored = sessionStorage.getItem(storageKey(uid));
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isValidState(parsed)) state = parsed;
        else sessionStorage.removeItem(storageKey(uid));
      }
    } catch {}
    state ||= createAviatorGameState();
    stateByUser.set(uid, state);
    return state;
  }

  function saveState(uid, state) {
    if (!uid || !isValidState(state)) return false;
    stateByUser.set(uid, state);
    try {
      sessionStorage.setItem(storageKey(uid), JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  function formatAmount(amountMilli) {
    return (amountMilli / 1000).toFixed(2);
  }

  function addPayouts(uid, payouts) {
    if (!uid || !Array.isArray(payouts) || !payouts.length) return;
    const totalMilli = payouts.reduce((sum, payout) => sum + payout.payoutMilli, 0);
    const balanceMilli = getBalance(uid);
    if (Number.isSafeInteger(totalMilli) && Number.isSafeInteger(balanceMilli + totalMilli)) {
      setBalance(uid, balanceMilli + totalMilli);
    }
  }

  function selectedMode(slotIndex) {
    return document.querySelector(
      `[data-aviator-mode][data-aviator-slot="${slotIndex}"][aria-pressed="true"]`,
    )?.dataset.aviatorMode || "manual";
  }

  function parseInputMilli(value) {
    const normalized = String(value ?? "").trim().replace(",", ".");
    const amount = Number(normalized);
    if (!normalized || !Number.isFinite(amount)) return null;
    const milli = Math.round(amount * 1000);
    if (Math.abs(amount * 1000 - milli) > 0.000001 ||
        milli < AVIATOR_MIN_BET_MILLI ||
        milli > 500000 ||
        milli % AVIATOR_BET_STEP_MILLI !== 0) return null;
    return milli;
  }

  function syncSlotSettings(slotIndex) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const state = getState(uid);
    if (state.slots[slotIndex]?.status !== "idle") return;
    const stakeMilli = parseInputMilli($(`aviatorBetAmount${slotIndex}`).value);
    const autoTarget = Number(String($(`aviatorAutoTarget${slotIndex}`).value).replace(",", "."));
    const slots = [...state.slots];
    slots[slotIndex] = {
      ...slots[slotIndex],
      ...(stakeMilli ? { stakeMilli } : {}),
      mode: selectedMode(slotIndex),
      ...(Number.isFinite(autoTarget) && autoTarget >= 1.1 && autoTarget <= 5
        ? { autoCashoutMultiplier: autoTarget }
        : {}),
    };
    saveState(uid, { ...state, slots });
  }

  function renderHistory(state) {
    const strip = $("aviatorRoundHistory");
    strip.replaceChildren();
    const recent = state.history.slice(0, 12);
    if (!recent.length) {
      const empty = document.createElement("span");
      empty.className = "aviator-disclaimer";
      empty.textContent = "Sin rondas anteriores";
      strip.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    recent.forEach((entry) => {
      const pill = document.createElement("span");
      pill.className = `aviator-history-pill${entry.crashMultiplier >= 2 ? " is-high" : " is-low"}`;
      pill.textContent = `${entry.crashMultiplier.toFixed(2)}x`;
      pill.setAttribute("aria-label", `Ronda ${entry.roundId}: corte en ${entry.crashMultiplier.toFixed(2)}x`);
      fragment.appendChild(pill);
    });
    strip.appendChild(fragment);
  }

  function renderTab(state) {
    const panel = $("aviatorTabPanel");
    const selected = document.querySelector('[data-aviator-tab][aria-selected="true"]')?.dataset.aviatorTab || "rounds";
    document.querySelectorAll("[data-aviator-tab]").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.aviatorTab === selected));
    });
    panel.replaceChildren();
    if (selected === "previous") {
      const last = state.history[0];
      panel.textContent = last
        ? `Ronda ${last.roundId} · cortó en ${last.crashMultiplier.toFixed(2)}x`
        : "Todavía no hay una ronda anterior.";
      return;
    }
    const entries = selected === "top"
      ? [...state.history].sort((left, right) => right.crashMultiplier - left.crashMultiplier).slice(0, 5)
      : state.history.slice(0, 8);
    if (!entries.length) {
      panel.textContent = "Los resultados aparecerán aquí al terminar las rondas.";
      return;
    }
    const list = document.createElement("ol");
    list.className = "aviator-tab-list";
    entries.forEach((entry) => {
      const row = document.createElement("li");
      row.textContent = `#${entry.roundId} · ${entry.crashMultiplier.toFixed(2)}x`;
      list.appendChild(row);
    });
    panel.appendChild(list);
  }

  function updateGraph(state, now = Date.now()) {
    const elapsedMs = state.phase === "flying"
      ? Math.max(0, now - state.startedAt)
      : state.phase === "crashed"
        ? Math.max(0, state.endedAt - state.startedAt)
        : 0;
    const multiplier = state.phase === "flying"
      ? state.currentMultiplier
      : state.phase === "crashed"
        ? state.crashAtMultiplier
        : 1;
    const currentX = Math.min(396, 16 + (elapsedMs / 20000) * 380);
    const currentY = Math.max(38, 284 - Math.pow(Math.max(0, multiplier - 1), 1.28) * 48);
    const points = [];
    const steps = Math.max(2, Math.ceil((currentX - 16) / 14));
    for (let index = 0; index <= steps; index += 1) {
      const progress = index / steps;
      const x = 16 + (currentX - 16) * progress;
      const pointMultiplier = calculateAviatorMultiplier(elapsedMs * progress);
      const y = Math.max(38, 284 - Math.pow(Math.max(0, pointMultiplier - 1), 1.28) * 48);
      points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
    }
    const line = `M ${points.join(" L ")}`;
    $("aviatorGraphCurve").setAttribute("d", line);
    $("aviatorGraphFill").setAttribute("d", `${line} L ${currentX.toFixed(1)} 284 L 16 284 Z`);
    $("aviatorPlane").setAttribute("transform", `translate(${currentX.toFixed(1)} ${currentY.toFixed(1)})`);
    $("aviatorMultiplier").textContent = `${multiplier.toFixed(2)}x`;
  }

  function renderSlot(state, balanceMilli, slotIndex) {
    const slot = state.slots[slotIndex];
    const input = $(`aviatorBetAmount${slotIndex}`);
    const action = $(`aviatorAction${slotIndex}`);
    const status = $(`aviatorSlotStatus${slotIndex}`);
    const locked = !WAGERS_ENABLED || slot.status !== "idle" || state.phase === "crashed";
    if (slot.status !== "idle") input.value = formatAmount(slot.stakeMilli);
    input.disabled = locked;
    $(`aviatorAutoTarget${slotIndex}`).disabled = locked;
    $(`aviatorAutoWrap${slotIndex}`).hidden = slot.mode !== "auto";
    document.querySelectorAll(`[data-aviator-mode][data-aviator-slot="${slotIndex}"]`).forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.aviatorMode === slot.mode));
      button.disabled = locked;
    });
    document.querySelectorAll(`[data-aviator-quick][data-aviator-slot="${slotIndex}"]`).forEach((button) => {
      button.disabled = locked;
    });
    $(`aviatorMinus${slotIndex}`).disabled = locked;
    $(`aviatorPlus${slotIndex}`).disabled = locked;

    action.classList.toggle("is-cashout", state.phase === "flying" && slot.status === "active");
    action.disabled = true;
    status.textContent = "";
    if (state.phase === "flying" && slot.status === "active") {
      const valueMilli = calculateAviatorPayoutMilli(slot.stakeMilli, slot.entryMultiplier, state.currentMultiplier);
      action.replaceChildren(
        document.createTextNode("Retirar"),
        Object.assign(document.createElement("span"), {
          textContent: `${formatAmount(valueMilli)} · ${state.currentMultiplier.toFixed(2)}x`,
        }),
      );
      action.disabled = !WAGERS_ENABLED;
      status.textContent = WAGERS_ENABLED
        ? slot.mode === "auto" ? "Retiro automático activo" : "Participación en vuelo"
        : "Apuestas bloqueadas.";
      return;
    }
    if (slot.status === "cashed") {
      action.replaceChildren(
        document.createTextNode("Retirado"),
        Object.assign(document.createElement("span"), { textContent: `+${formatAmount(slot.payoutMilli)}` }),
      );
      status.textContent = "Ronda terminada.";
      return;
    }
    if (slot.status === "lost") {
      action.replaceChildren(
        document.createTextNode("Cortó"),
        Object.assign(document.createElement("span"), { textContent: "Sin saldo para apostar" }),
      );
      status.textContent = "Apuestas bloqueadas.";
      return;
    }
    if (state.phase === "crashed") {
      action.replaceChildren(
        document.createTextNode("Siguiente ronda"),
        Object.assign(document.createElement("span"), { textContent: "Preparando…" }),
      );
      return;
    }

    const parsed = parseStake(input.value, balanceMilli);
    const selectedStake = parseInputMilli(input.value);
    action.replaceChildren(
      document.createTextNode("Bloqueado"),
      Object.assign(document.createElement("span"), {
        textContent: "Cartera real solo lectura",
      }),
    );
    action.disabled = true;
    if (!parsed.valid && balanceMilli > 0) status.textContent = parsed.error;
    else if (balanceMilli === 0) status.textContent = "Apuestas bloqueadas; Cartera real solo lectura.";
  }

  function updateScreen(uid, state, now = Date.now()) {
    const balanceMilli = uid ? getBalance(uid) : 0;
    updateGraph(state, now);
    $("aviatorFlightMessage").textContent = state.phase === "flying"
      ? `En vuelo · +${AVIATOR_GROWTH_PER_SECOND.toFixed(2)}x por segundo`
      : state.phase === "crashed"
        ? `Corte en ${state.crashAtMultiplier.toFixed(2)}x · siguiente ronda pronto`
      : balanceMilli > 0
          ? "Las apuestas están bloqueadas."
          : "Cartera real solo lectura; apuestas bloqueadas.";
    renderHistory(state);
    state.slots.forEach((_, slotIndex) => renderSlot(state, balanceMilli, slotIndex));
    renderTab(state);
  }

  function stopAnimation() {
    if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    animationUid = null;
  }

  function scheduleNextRound(uid, roundId) {
    if (resetTimers.has(uid)) return;
    const timer = setTimeout(() => {
      resetTimers.delete(uid);
      const current = getState(uid);
      if (current.phase !== "crashed" || current.roundId !== roundId) return;
      const next = resetAviatorRound(current);
      saveState(uid, next);
      if (auth.currentUser?.uid === uid) updateScreen(uid, next);
    }, 1600);
    resetTimers.set(uid, timer);
  }

  function processFlight(uid, now = Date.now()) {
    const state = getState(uid);
    if (state.phase !== "flying") return state;
    const advanced = advanceAviatorFlight(state, now);
    stateByUser.set(uid, advanced.state);
    if (advanced.payouts.length || advanced.crashed) {
      const saved = saveState(uid, advanced.state);
      if (saved) addPayouts(uid, advanced.payouts);
    }
    if (advanced.crashed) scheduleNextRound(uid, advanced.state.roundId);
    return advanced.state;
  }

  function animate(uid) {
    if (animationUid === uid && animationFrameId !== null) return;
    stopAnimation();
    animationUid = uid;
    const tick = () => {
      animationFrameId = null;
      if (auth.currentUser?.uid !== uid) {
        stopAnimation();
        return;
      }
      const state = processFlight(uid, Date.now());
      updateScreen(uid, state);
      if (state.phase === "flying") animationFrameId = requestAnimationFrame(tick);
      else animationUid = null;
    };
    animationFrameId = requestAnimationFrame(tick);
  }

  function render(user = auth.currentUser) {
    const uid = user?.uid || null;
    if (!uid) {
      updateScreen("", createAviatorGameState());
      stopAnimation();
      return;
    }
    getBalance(uid);
    let state = getState(uid);
    if (state.phase === "flying") state = processFlight(uid, Date.now());
    state.slots.forEach((slot, slotIndex) => {
      if (slot.status !== "idle") return;
      $(`aviatorBetAmount${slotIndex}`).value = formatAmount(slot.stakeMilli);
      $(`aviatorAutoTarget${slotIndex}`).value = Number(slot.autoCashoutMultiplier || 2).toFixed(2);
      $(`aviatorAutoWrap${slotIndex}`).hidden = slot.mode !== "auto";
      document.querySelectorAll(`[data-aviator-mode][data-aviator-slot="${slotIndex}"]`).forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.aviatorMode === slot.mode));
      });
    });
    updateScreen(uid, state);
    if (state.phase === "flying") animate(uid);
    else stopAnimation();
    if (state.phase === "crashed") scheduleNextRound(uid, state.roundId);
  }

  function placeBet(slotIndex) {
    const uid = auth.currentUser?.uid;
    const notice = $("aviatorDemoStatus");
    if (!WAGERS_ENABLED) {
      notice.textContent = "Apuestas bloqueadas; la Cartera real no se puede usar aquí.";
      return;
    }
    if (!uid) {
      notice.textContent = "Inicia sesión para ver el resultado de la simulación.";
      return;
    }
    let state = processFlight(uid, Date.now());
    if (state.phase === "crashed") {
      notice.textContent = "Espera a que empiece la siguiente ronda.";
      updateScreen(uid, state);
      return;
    }
    const input = $(`aviatorBetAmount${slotIndex}`);
    const balanceBefore = getBalance(uid);
    const parsed = parseStake(input.value, balanceBefore);
    if (!parsed.valid) {
      notice.textContent = parsed.error;
      return;
    }
    const mode = selectedMode(slotIndex);
    const autoTarget = Number(String($(`aviatorAutoTarget${slotIndex}`).value).replace(",", "."));
    if (mode === "auto" && (!Number.isFinite(autoTarget) || autoTarget < 1.1 || autoTarget > 5)) {
      notice.textContent = "El retiro automático debe estar entre 1,10x y 5,00x.";
      return;
    }
    const result = placeAviatorBet(
      state,
      slotIndex,
      parsed.stakeMilli,
      Date.now(),
      state.phase === "waiting" ? createAviatorCrashMultiplier() : null,
      { mode, autoCashoutMultiplier: autoTarget || 2 },
    );
    if (!result.valid) {
      saveState(uid, result.state);
      addPayouts(uid, result.payouts);
      notice.textContent = result.reason === "round-ended"
        ? "La ronda ya cortó. Espera a que empiece la siguiente."
        : "Este panel ya participó en esta ronda.";
      updateScreen(uid, result.state);
      if (result.state.phase === "crashed") scheduleNextRound(uid, result.state.roundId);
      return;
    }
    const previouslyCashedMilli = result.payouts.reduce((sum, payout) => sum + payout.payoutMilli, 0);
    const nextBalance = balanceBefore + previouslyCashedMilli - result.stakeMilli;
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0 || !setBalance(uid, nextBalance)) {
      notice.textContent = "No se pudo guardar la ronda.";
      return;
    }
    if (!saveState(uid, result.state)) {
      stateByUser.set(uid, state);
      setBalance(uid, balanceBefore);
      notice.textContent = "No se pudo guardar el estado de práctica. Inténtalo otra vez.";
      return;
    }
    notice.textContent = "";
    updateScreen(uid, result.state);
    animate(uid);
  }

  function cashOut(slotIndex) {
    if (!WAGERS_ENABLED) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const originalState = getState(uid);
    const result = cashOutAviatorSlot(originalState, slotIndex, Date.now());
    if (result.outcome === "inactive") {
      if (result.payouts.length) {
        if (saveState(uid, result.state)) addPayouts(uid, result.payouts);
        updateScreen(uid, result.state);
      }
      return;
    }
    if (result.outcome === "crashed") {
      if (saveState(uid, result.state)) addPayouts(uid, result.payouts);
      $("aviatorDemoStatus").textContent = "La ronda cortó antes de retirar.";
      updateScreen(uid, result.state);
      scheduleNextRound(uid, result.state.roundId);
      stopAnimation();
      return;
    }
    if (!saveState(uid, result.state)) {
      stateByUser.set(uid, originalState);
      $("aviatorDemoStatus").textContent = "No se pudo guardar el resultado.";
      return;
    }
    addPayouts(uid, result.payouts);
    $("aviatorDemoStatus").textContent =
      `Resultado de la ronda: ${formatAmount(result.payoutMilli)}.`;
    updateScreen(uid, result.state);
  }

  function updateSlotSettings(slotIndex) {
    if (!WAGERS_ENABLED) return;
    syncSlotSettings(slotIndex);
    const uid = auth.currentUser?.uid;
    if (uid) updateScreen(uid, getState(uid));
  }

  $("openAviator").addEventListener("click", onOpen);
  $("aviatorBackToGames").addEventListener("click", onBack);
  document.querySelectorAll("[data-aviator-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotIndex = Number(button.dataset.aviatorSlot);
      document.querySelectorAll(`[data-aviator-mode][data-aviator-slot="${slotIndex}"]`).forEach((option) => {
        option.setAttribute("aria-pressed", String(option === button));
      });
      $(`aviatorAutoWrap${slotIndex}`).hidden = button.dataset.aviatorMode !== "auto";
      updateSlotSettings(slotIndex);
    });
  });
  document.querySelectorAll("[data-aviator-quick]").forEach((button) => {
    button.addEventListener("click", () => {
      const slotIndex = Number(button.dataset.aviatorSlot);
      $(`aviatorBetAmount${slotIndex}`).value = Number(button.dataset.aviatorQuick).toFixed(2);
      updateSlotSettings(slotIndex);
    });
  });
  SLOT_INDICES.forEach((slotIndex) => {
    const amountInput = $(`aviatorBetAmount${slotIndex}`);
    amountInput.addEventListener("input", () => updateSlotSettings(slotIndex));
    $(`aviatorAutoTarget${slotIndex}`).addEventListener("change", () => syncSlotSettings(slotIndex));
    $(`aviatorMinus${slotIndex}`).addEventListener("click", () => {
      const current = parseInputMilli(amountInput.value) || AVIATOR_DEFAULT_BET_MILLI;
      amountInput.value = formatAmount(Math.max(AVIATOR_MIN_BET_MILLI, current - 1000));
      updateSlotSettings(slotIndex);
    });
    $(`aviatorPlus${slotIndex}`).addEventListener("click", () => {
      const current = parseInputMilli(amountInput.value) || AVIATOR_DEFAULT_BET_MILLI;
      amountInput.value = formatAmount(Math.min(500000, current + 1000));
      updateSlotSettings(slotIndex);
    });
    $(`aviatorAction${slotIndex}`).addEventListener("click", () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (getState(uid).slots[slotIndex].status === "active") cashOut(slotIndex);
      else placeBet(slotIndex);
    });
  });
  document.querySelectorAll("[data-aviator-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-aviator-tab]").forEach((tab) => {
        tab.setAttribute("aria-selected", String(tab === button));
      });
      const uid = auth.currentUser?.uid;
      renderTab(uid ? getState(uid) : createAviatorGameState());
    });
  });

  return { render, stopAnimation };
}
