// animacaoapp.js — REMOVER AUTO-ROTATION APENAS EM "DIVERSOS"
// ✅ Congela rotação Y só em "diversos" (anula o setInterval do app.js)
// ✅ Usuário pode rotacionar manualmente; ao soltar, congela no novo Y
// ❌ Não mexe em camera / scale / position / outras categorias

"use strict";

(function () {
  const MODEL_ID = "modelContainer";
  const DIVERSOS_KEY = "diversos";

  const state = {
    isDiversos: false,
    lockedY: null,
    raf: null,

    userInteracting: false,
    lastInteractTs: 0,
    interactTimeoutMs: 220,

    hooked: false
  };

  function normKey(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s\-]+/g, "_");
  }

  function getEl() {
    return document.getElementById(MODEL_ID);
  }

  function getRotationObj(el) {
    const r = el.getAttribute("rotation");
    if (!r) return { x: 0, y: 0, z: 0 };

    if (typeof r === "object") {
      return {
        x: Number.isFinite(r.x) ? r.x : 0,
        y: Number.isFinite(r.y) ? r.y : 0,
        z: Number.isFinite(r.z) ? r.z : 0
      };
    }

    const p = String(r).trim().split(/\s+/).map(Number);
    return {
      x: Number.isFinite(p[0]) ? p[0] : 0,
      y: Number.isFinite(p[1]) ? p[1] : 0,
      z: Number.isFinite(p[2]) ? p[2] : 0
    };
  }

  function setRotation(el, x, y, z) {
    el.setAttribute("rotation", `${x} ${y} ${z}`);
  }

  function markInteracting() {
    if (!state.isDiversos) return;
    state.userInteracting = true;
    state.lastInteractTs = Date.now();
  }

  function refreshInteractingFlag() {
    if (!state.userInteracting) return;
    if (Date.now() - state.lastInteractTs > state.interactTimeoutMs) {
      state.userInteracting = false;
    }
  }

  function stopFreeze() {
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
    state.lockedY = null;
  }

  function startFreeze() {
    const el = getEl();
    if (!el) return;
    if (state.raf) return;

    const tick = () => {
      if (!state.isDiversos) {
        stopFreeze();
        return;
      }

      refreshInteractingFlag();

      const r = getRotationObj(el);

      // enquanto usuário mexe, deixa mexer e só salva onde ele parou
      if (state.userInteracting) {
        state.lockedY = Number.isFinite(r.y) ? r.y : state.lockedY;
        state.raf = requestAnimationFrame(tick);
        return;
      }

      // primeira vez: trava no Y atual
      if (state.lockedY == null) {
        state.lockedY = Number.isFinite(r.y) ? r.y : 180;
      }

      // congela só o Y (anula o auto-rotate do app.js)
      setRotation(el, r.x, state.lockedY, r.z);

      state.raf = requestAnimationFrame(tick);
    };

    state.raf = requestAnimationFrame(tick);
  }

  function enterDiversos() {
    state.isDiversos = true;

    // trava no Y atual (sem forçar face/front agora)
    const el = getEl();
    if (el) {
      const r = getRotationObj(el);
      state.lockedY = Number.isFinite(r.y) ? r.y : 180;
    } else {
      state.lockedY = null;
    }

    startFreeze();
  }

  function leaveDiversos() {
    state.isDiversos = false;
    stopFreeze();
  }

  function wrapGlobalFn(fnName, onCall) {
    const current = window[fnName];
    if (typeof current !== "function") return false;
    if (current.__diversosFreezeWrapped) return true;

    function wrapped(...args) {
      try { onCall(args); } catch (_) {}
      return current.apply(this, args);
    }
    wrapped.__diversosFreezeWrapped = true;
    window[fnName] = wrapped;
    return true;
  }

  function tryHook() {
    if (state.hooked) return;

    // detecta troca de categoria
    wrapGlobalFn("selectCategory", (args) => {
      const cat = normKey(args[0]);
      if (cat === DIVERSOS_KEY) enterDiversos();
      else leaveDiversos();
    });

    // reforço: se trocar modelo dentro de diversos, garante freeze ativo
    wrapGlobalFn("loadModel", () => {
      if (state.isDiversos) startFreeze();
    });

    state.hooked = true;
  }

  function boot() {
    // listeners de interação (pra não brigar com o dedo)
    const onDown = () => markInteracting();
    const onMove = () => markInteracting();
    const onUp = () => markInteracting();

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });

    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onUp, { passive: true });
    document.addEventListener("touchcancel", onUp, { passive: true });

    // tenta hookar algumas vezes (caso app.js carregue depois)
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      tryHook();

      // se por algum motivo currentCategory já estiver em diversos ao carregar
      try {
        if (normKey(window.currentCategory) === DIVERSOS_KEY) {
          enterDiversos();
        }
      } catch (_) {}

      if (tries >= 240) clearInterval(timer);
    }, 50);

    // quando modelo carregar, se estiver em diversos, reforça travamento
    const el = getEl();
    if (el) {
      el.addEventListener("model-loaded", () => {
        if (!state.isDiversos) return;
        const r = getRotationObj(el);
        state.lockedY = Number.isFinite(r.y) ? r.y : state.lockedY;
        startFreeze();
      }, { passive: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
