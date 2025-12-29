// animacaoapp.js — REMOVER AUTO-ROTATION APENAS EM "DIVERSOS" (igual lógica do HOME4 no preview)
// ✅ Em "diversos": desliga auto-rotate do app.js (sem brigar travando Y)
// ✅ Remove qualquer A-Frame animation que esteja rotacionando o modelo
// ✅ Saiu de "diversos": volta o auto-rotate e restaura o animation (se existia)

"use strict";

(function () {
  const MODEL_ID = "modelContainer";
  const DIVERSOS_KEY = "diversos";

  const state = {
    isDiversos: false,
    hooked: false,

    savedAnimationAttr: null,
    savedAnimationWasSet: false
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

  function hasRotationAnimation(val) {
    const s = String(val || "").toLowerCase();
    // cobre "property: rotation" / "rotation;" / etc.
    return s.includes("rotation");
  }

  function disableRotate() {
    // desliga o auto-rotate do app.js (se existir)
    if (typeof window.__setAutoRotateEnabled === "function") {
      window.__setAutoRotateEnabled(false);
    }

    // remove animation A-Frame que rotaciona (se existir)
    const el = getEl();
    if (!el) return;

    const anim = el.getAttribute("animation");
    if (anim && hasRotationAnimation(anim)) {
      state.savedAnimationAttr = anim;
      state.savedAnimationWasSet = true;
      el.removeAttribute("animation");
    }
  }

  function enableRotate() {
    // liga o auto-rotate do app.js (se existir)
    if (typeof window.__setAutoRotateEnabled === "function") {
      window.__setAutoRotateEnabled(true);
    }

    // restaura animation anterior (se tinha)
    const el = getEl();
    if (!el) return;

    if (state.savedAnimationWasSet && state.savedAnimationAttr) {
      el.setAttribute("animation", state.savedAnimationAttr);
    }

    state.savedAnimationAttr = null;
    state.savedAnimationWasSet = false;
  }

  function enterDiversos() {
    state.isDiversos = true;
    disableRotate();
  }

  function leaveDiversos() {
    state.isDiversos = false;
    enableRotate();
  }

  function wrapGlobalFn(fnName, onCall) {
    const current = window[fnName];
    if (typeof current !== "function") return false;
    if (current.__diversosWrapped) return true;

    function wrapped(...args) {
      try { onCall(args); } catch (_) {}
      return current.apply(this, args);
    }
    wrapped.__diversosWrapped = true;
    window[fnName] = wrapped;
    return true;
  }

  function tryHook() {
    if (state.hooked) return;

    // troca de categoria
    wrapGlobalFn("selectCategory", (args) => {
      const cat = normKey(args[0]);
      if (cat === DIVERSOS_KEY) enterDiversos();
      else leaveDiversos();
    });

    // quando trocar modelo dentro de diversos, garante que continua sem rotate
    wrapGlobalFn("loadModel", () => {
      if (state.isDiversos) disableRotate();
    });

    state.hooked = true;
  }

  function boot() {
    // tenta hookar até o app.js existir
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      tryHook();

      try {
        if (normKey(window.currentCategory) === DIVERSOS_KEY) {
          enterDiversos();
        }
      } catch (_) {}

      if (tries >= 240) clearInterval(timer);
    }, 50);

    // se o model carregar já em diversos, reforça
    const el = getEl();
    if (el) {
      el.addEventListener(
        "model-loaded",
        () => {
          if (state.isDiversos) disableRotate();
        },
        { passive: true }
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
