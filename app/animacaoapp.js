// animacaoapp.js — DIVERSOS: trava Y e começa SEMPRE de frente + pega config do S3
"use strict";

(function () {
  const MODEL_ID = "modelContainer";
  const DIVERSOS_KEY = "diversos";

  // ✅ fallback se não existir config no S3
  const DEFAULT_DIVERSOS_FRONT_Y = 0;

  // bucket fixo (igual seu padrão atual)
  const S3_BASE = "https://ar-cardapio-models.s3.amazonaws.com";

  // cache-buster pelo ?v=... (igual você já usa no app)
  const __qs = new URLSearchParams(location.search);
  const __ver = __qs.get("v") || Date.now().toString();
  function addBust(url) {
    if (!url) return url;
    return url.includes("?") ? `${url}&v=${encodeURIComponent(__ver)}` : `${url}?v=${encodeURIComponent(__ver)}`;
  }

  const state = {
    isDiversos: false,
    lockedY: null,
    raf: null,

    userInteracting: false,
    lastInteractTs: 0,
    interactTimeoutMs: 220,

    hooked: false,

    // ✅ pra saber qual item está carregado (já que currentModelPath não é window)
    lastModelPath: "",

    // ✅ config de diversos do S3
    diversosCfg: null,
    cfgLoaded: false,
    cfgLoading: false
  };

  function normKey(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\s\-]+/g, "_");
  }

  function qs(name, def = "") {
    const v = new URL(location.href).searchParams.get(name);
    return v == null ? def : v;
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

  // =========================
  // ✅ CONFIG "DIVERSOS" via S3
  // =========================

  function getTenant() {
    // seu padrão usa restaurante=...
    return qs("restaurante", "restaurante-padrao").trim() || "restaurante-padrao";
  }

  function getDiversosConfigCandidates() {
    const tenant = getTenant();

    return [
      addBust(`${S3_BASE}/informacao/${tenant}/diversos.json`),
      addBust(`${S3_BASE}/informacao/${tenant}/diversos/config.json`),
      addBust(`${S3_BASE}/configuracoes/${tenant}-diversos.json`)
    ];
  }

  async function fetchFirstJson(urls) {
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (!r.ok) continue;
        const j = await r.json();
        return j;
      } catch (_) {}
    }
    return null;
  }

  async function ensureDiversosConfigLoaded() {
    if (state.cfgLoaded || state.cfgLoading) return;
    state.cfgLoading = true;

    try {
      const cfg = await fetchFirstJson(getDiversosConfigCandidates());

      // aceita:
      // 1) {frontY, lockY, perItem:{mickey:{frontY}}}
      // 2) {mickey: 0, chef: 0} (mapping simples)
      if (cfg && typeof cfg === "object") {
        state.diversosCfg = cfg;
      } else {
        state.diversosCfg = null;
      }
    } catch (_) {
      state.diversosCfg = null;
    } finally {
      state.cfgLoaded = true;
      state.cfgLoading = false;
    }
  }

  function getCurrentItemSlugFromPath(path) {
    // pega "mickey" de ".../mickey.glb"
    const p = String(path || "");
    if (!p) return "";
    const file = p.split("/").pop() || "";
    return normKey(file.replace(".glb", ""));
  }

  function resolveDiversosFrontYForPath(path) {
    const cfg = state.diversosCfg;
    const slug = getCurrentItemSlugFromPath(path);

    // fallback
    let frontY = DEFAULT_DIVERSOS_FRONT_Y;

    if (!cfg) return frontY;

    // formato 1: cfg.frontY
    if (typeof cfg.frontY === "number" && Number.isFinite(cfg.frontY)) {
      frontY = cfg.frontY;
    }

    // formato 1: cfg.perItem[slug].frontY
    if (cfg.perItem && typeof cfg.perItem === "object" && slug) {
      const it = cfg.perItem[slug];
      if (it && typeof it === "object") {
        if (typeof it.frontY === "number" && Number.isFinite(it.frontY)) {
          frontY = it.frontY;
        }
      }
    }

    // formato 2: cfg[slug] = number
    if (slug && typeof cfg[slug] === "number" && Number.isFinite(cfg[slug])) {
      frontY = cfg[slug];
    }

    return frontY;
  }

  function resolveDiversosLockY() {
    const cfg = state.diversosCfg;
    if (!cfg) return true; // padrão: trava
    if (typeof cfg.lockY === "boolean") return cfg.lockY;
    return true;
  }

  // =========================
  // ✅ Freeze Y em Diversos
  // =========================
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

      // se lockY estiver desligado no config, não força trava
      if (!resolveDiversosLockY()) {
        state.raf = requestAnimationFrame(tick);
        return;
      }

      // ✅ primeira vez: trava SEMPRE na frente (com override por item)
      if (state.lockedY == null) {
        state.lockedY = resolveDiversosFrontYForPath(state.lastModelPath);
      }

      // congela só o Y
      setRotation(el, r.x, state.lockedY, r.z);

      state.raf = requestAnimationFrame(tick);
    };

    state.raf = requestAnimationFrame(tick);
  }

  async function enterDiversos() {
    state.isDiversos = true;

    // ✅ carrega config do S3 (não quebra se falhar)
    await ensureDiversosConfigLoaded();

    const el = getEl();
    const frontY = resolveDiversosFrontYForPath(state.lastModelPath);

    if (el) {
      const r = getRotationObj(el);
      state.lockedY = frontY;              // ✅ força frente
      setRotation(el, r.x, state.lockedY, r.z); // ✅ aplica na hora
    } else {
      state.lockedY = frontY;
    }

    // bloqueia auto-rotate base (se existir)
    try {
      if (typeof window.__setDiversosAutoRotateDisabled === "function") {
        window.__setDiversosAutoRotateDisabled(true);
      }
    } catch (_) {}

    startFreeze();
  }

  function leaveDiversos() {
    state.isDiversos = false;

    try {
      if (typeof window.__setDiversosAutoRotateDisabled === "function") {
        window.__setDiversosAutoRotateDisabled(false);
      }
    } catch (_) {}

    stopFreeze();
  }

  // =========================
  // ✅ Hook sem mexer no app.js
  // =========================
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

    // ✅ pega o path real carregado
    wrapGlobalFn("loadModel", (args) => {
      const p = args && args[0] ? String(args[0]) : "";
      if (p) state.lastModelPath = p;

      // se já estiver em diversos, re-aplica frente (por item) ao trocar modelo
      if (state.isDiversos) {
        const el = getEl();
        if (el) {
          const r = getRotationObj(el);
          state.lockedY = resolveDiversosFrontYForPath(state.lastModelPath);
          setRotation(el, r.x, state.lockedY, r.z);
        } else {
          state.lockedY = resolveDiversosFrontYForPath(state.lastModelPath);
        }
        startFreeze();
      }
    });

    state.hooked = true;
  }

  function boot() {
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

    // tenta hookar algumas vezes
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

    // quando modelo carregar, se estiver em diversos, reforça travamento
    const el = getEl();
    if (el) {
      el.addEventListener("model-loaded", () => {
        if (!state.isDiversos) return;
        // se o config disser lockY=false, não trava
        if (!resolveDiversosLockY()) return;
        // garante que travou no front do item atual
        state.lockedY = resolveDiversosFrontYForPath(state.lastModelPath);
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
