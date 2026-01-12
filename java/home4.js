// home4.js — FOCO 100%: ANIMAÇÃO (SEM mexer nas funções do home2/home3)
// ✅ Toca animações GLB (THREE.AnimationMixer)
// ✅ CORRIGE seu "chef.glb": o clip "T-Pose" tem track de SCALE = ~0.0034 e isso faz o Chef SUMIR.
//    -> Este arquivo REMOVE automaticamente tracks de scale “minúsculos/negativos” (mantém o modelo visível).
// ✅ REMOVE a rotação AUTOMÁTICA APENAS quando o preview for da categoria /diversos/ (sem alterar home2.js)
// ✅ (opcional) efeito “andar pra frente + crescer” apenas quando o modelo for CHEF
//
// ✅ ADICIONADO (SEM QUEBRAR): PERFIL DROPDOWN + MODAL PLANO + FETCH /assinatura/statushome

"use strict";

/* ============================================================
   BLOCO 1 — SUA LÓGICA DE ANIMAÇÃO (MANTIDA)
   ============================================================ */
(function () {
  // ========= CONFIG =========
  const FIX = {
    tinyScaleThreshold: 0.05,
    removeNegativeScale: true
  };

  // Efeito de profundidade (só aplica no CHEF)
  const WALK = {
    enabled: true,
    startZ: -8,
    endZ: -3,
    startScale: 0.15,
    endScale: 1.0,
    durMs: 4500,
    pauseMs: 400,
    easing: "easeOutCubic"
  };

  const GLTF_ANIM = {
    enabled: true,
    clip: "*",
    loop: "repeat",
    timeScale: 1.0
  };

  // ========= EASING =========
  const EASING = {
    linear: (t) => t,
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  };

  function safeNum(x, def) {
    const n = Number(x);
    return Number.isFinite(n) ? n : def;
  }

  function parseLoop(loop) {
    const v = String(loop || "repeat").toLowerCase();
    return v === "once" ? "once" : "repeat";
  }

  function waitFor(fn, timeoutMs = 9000, stepMs = 50) {
    return new Promise((resolve) => {
      const t0 = Date.now();
      const timer = setInterval(() => {
        let ok = false;
        try { ok = !!fn(); } catch (_) {}
        if (ok) {
          clearInterval(timer);
          resolve(true);
          return;
        }
        if (Date.now() - t0 > timeoutMs) {
          clearInterval(timer);
          resolve(false);
        }
      }, stepMs);
    });
  }

  function getGltfUrl(el) {
    const v = el && el.getAttribute && el.getAttribute("gltf-model");
    return typeof v === "string" ? v : (v && v.url ? v.url : "");
  }

  function isDiversosUrl(url) {
    return /\/diversos\//i.test(String(url || ""));
  }

  function isChefUrl(url) {
    return /chef/i.test(String(url || ""));
  }

  // ========= COMPONENT: safe-gltf-animation =========
  function registerSafeGltfAnimation() {
    if (!window.AFRAME || !window.THREE) return false;
    if (AFRAME.components["safe-gltf-animation"]) return true;

    AFRAME.registerComponent("safe-gltf-animation", {
      schema: {
        clip: { default: "*" },
        loop: { default: "repeat" },
        timeScale: { default: 1.0 }
      },

      init() {
        this.mixer = null;
        this.actions = [];
        this._boundLoaded = this._onModelLoaded.bind(this);
        this.el.addEventListener("model-loaded", this._boundLoaded);
      },

      remove() {
        this.el.removeEventListener("model-loaded", this._boundLoaded);
        this._stopAll();
      },

      tick(_t, dt) {
        if (this.mixer) this.mixer.update((dt || 0) / 1000);
      },

      _stopAll() {
        try {
          if (this.actions) this.actions.forEach((a) => a && a.stop && a.stop());
        } catch (_) {}
        this.actions = [];
        this.mixer = null;
      },

      _shouldDropScaleTrack(track) {
        if (!track || !track.name || !track.name.endsWith(".scale")) return false;

        const v = track.values;
        if (!v || v.length < 3) return false;

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < v.length; i++) {
          const val = v[i];
          if (val < min) min = val;
          if (val > max) max = val;
        }

        if (max < FIX.tinyScaleThreshold) return true;
        if (FIX.removeNegativeScale && min < 0) return true;

        return false;
      },

      _fixClip(clip) {
        if (!clip || !clip.tracks || !clip.tracks.length) return clip;

        let changed = false;
        const tracks = clip.tracks.filter((tr) => {
          const drop = this._shouldDropScaleTrack(tr);
          if (drop) changed = true;
          return !drop;
        });

        if (!changed) return clip;

        const cloned = clip.clone();
        cloned.tracks = tracks;
        return cloned;
      },

      _onModelLoaded(e) {
        this._stopAll();

        const model = e.detail && e.detail.model;
        if (!model || !model.animations || !model.animations.length) return;

        this.mixer = new THREE.AnimationMixer(model);

        const wantAll = !this.data.clip || this.data.clip === "*";
        const loopMode = parseLoop(this.data.loop);
        const ts = safeNum(this.data.timeScale, 1.0);

        const fixedClips = model.animations.map((clip) => {
          if (!wantAll && clip.name !== this.data.clip) return clip;
          return this._fixClip(clip);
        });

        for (const clip of fixedClips) {
          if (!wantAll && clip.name !== this.data.clip) continue;

          const action = this.mixer.clipAction(clip);
          action.reset();

          if (loopMode === "once") {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          } else {
            action.setLoop(THREE.LoopRepeat, Infinity);
          }

          action.play();
          this.actions.push(action);
        }

        this.mixer.timeScale = ts;
      }
    });

    return true;
  }

  // ========= COMPONENT: walk-depth-loop =========
  function registerWalkDepthLoop() {
    if (!window.AFRAME) return false;
    if (AFRAME.components["walk-depth-loop"]) return true;

    AFRAME.registerComponent("walk-depth-loop", {
      schema: {
        enabled: { default: true },
        startZ: { default: -8 },
        endZ: { default: -3 },
        startScale: { default: 0.15 },
        endScale: { default: 1.0 },
        durMs: { default: 4500 },
        pauseMs: { default: 400 },
        easing: { default: "easeOutCubic" }
      },

      init() {
        this.t0 = null;
        this.phase = "move";
        this.pauseT0 = null;
      },

      tick(t) {
        if (!this.data.enabled) return;

        const ease = EASING[this.data.easing] || EASING.easeOutCubic;

        if (this.phase === "move") {
          if (this.t0 == null) this.t0 = t;
          const elapsed = t - this.t0;
          const p = Math.min(1, elapsed / Math.max(1, this.data.durMs));
          const k = ease(p);

          const z = this.data.startZ + (this.data.endZ - this.data.startZ) * k;
          const s = this.data.startScale + (this.data.endScale - this.data.startScale) * k;

          this.el.object3D.position.z = z;
          this.el.object3D.scale.set(s, s, s);

          if (p >= 1) {
            this.phase = "pause";
            this.pauseT0 = t;
          }
          return;
        }

        if (this.phase === "pause") {
          if ((t - this.pauseT0) >= Math.max(0, this.data.pauseMs)) {
            this.t0 = null;
            this.phase = "move";
          }
        }
      }
    });

    return true;
  }

  // ========= PATCH: remove rotação só em /diversos/ no PREVIEW =========
  function patchPreviewRotationOnlyDiversos() {
    const root = document.body;

    const apply = (previewModelEl) => {
      if (!previewModelEl || !previewModelEl.getAttribute) return;

      const url = getGltfUrl(previewModelEl);
      if (!url) return;

      if (isDiversosUrl(url)) {
        if (previewModelEl.hasAttribute("animation")) previewModelEl.removeAttribute("animation");
        Array.from(previewModelEl.attributes || []).forEach((attr) => {
          if (attr && typeof attr.name === "string" && attr.name.startsWith("animation__")) {
            previewModelEl.removeAttribute(attr.name);
          }
        });
      }

      if (GLTF_ANIM.enabled) {
        previewModelEl.setAttribute(
          "safe-gltf-animation",
          `clip: ${GLTF_ANIM.clip}; loop: ${GLTF_ANIM.loop}; timeScale: ${GLTF_ANIM.timeScale}`
        );
      }
    };

    const now = document.querySelector("#previewModel");
    if (now) apply(now);

    const obs = new MutationObserver(() => {
      const el = document.querySelector("#previewModel");
      if (el) apply(el);
    });

    obs.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["gltf-model", "animation"]
    });
  }

  // ========= HOME: aplica animação no #modelo3d =========
  function setupHomeEntityAnimation() {
    const el = document.getElementById("modelo3d");
    if (!el) return;

    const cam = document.querySelector("a-camera");
    if (cam) cam.setAttribute("camera", "near: 0.01; far: 1000");

    if (GLTF_ANIM.enabled) {
      el.setAttribute(
        "safe-gltf-animation",
        `clip: ${GLTF_ANIM.clip}; loop: ${GLTF_ANIM.loop}; timeScale: ${GLTF_ANIM.timeScale}`
      );
    }

    const applyWalkIfChef = () => {
      if (!WALK.enabled) {
        el.removeAttribute("walk-depth-loop");
        return;
      }
      const url = getGltfUrl(el);
      if (isChefUrl(url)) {
        el.setAttribute(
          "walk-depth-loop",
          `enabled: true; startZ: ${WALK.startZ}; endZ: ${WALK.endZ}; startScale: ${WALK.startScale}; endScale: ${WALK.endScale}; durMs: ${WALK.durMs}; pauseMs: ${WALK.pauseMs}; easing: ${WALK.easing}`
        );
      } else {
        el.removeAttribute("walk-depth-loop");
      }
    };

    applyWalkIfChef();

    const mo = new MutationObserver(applyWalkIfChef);
    mo.observe(el, { attributes: true, attributeFilter: ["gltf-model"] });

    el.addEventListener("model-loaded", () => {
      try {
        const mesh = el.getObject3D("mesh");
        const anims = mesh && mesh.animations ? mesh.animations.map((a) => a.name) : [];
        console.log("[HOME4] HOME model-loaded:", { url: getGltfUrl(el), animations: anims });
      } catch (e) {
        console.log("[HOME4] HOME model-loaded (debug falhou):", e);
      }
    });
  }

  async function boot() {
    const ok = await waitFor(() => !!window.AFRAME && !!window.THREE);
    if (!ok) return;

    registerSafeGltfAnimation();
    registerWalkDepthLoop();

    patchPreviewRotationOnlyDiversos();

    await waitFor(() => !!document.getElementById("modelo3d"), 9000);
    setupHomeEntityAnimation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();


/* ============================================================
   BLOCO 2 — PERFIL DROPDOWN + MODAL PLANO (CORRIGIDO)
   ============================================================ */
(function () {
  const API_PLANO = "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/assinatura/statushome";

  function $(id) { return document.getElementById(id); }

  function pickId(...ids) {
    for (const id of ids) {
      const el = $(id);
      if (el) return el;
    }
    return null;
  }

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else fn();
  }

  function getEmailCliente() {
    return (
      localStorage.getItem("ar.email") ||
      localStorage.getItem("usuarioEmail") ||
      localStorage.getItem("email") ||
      ""
    ).trim().toLowerCase();
  }

  ready(() => {
    const profileBtn  = $("profile-btn");
    const dropdown    = $("dropdownPerfil");
    const perfilTexto = $("perfil-texto");

    if (!profileBtn || !dropdown) {
      console.warn("[PERFIL] profile-btn ou dropdownPerfil não encontrado.");
      return;
    }

    // evita duplicar listeners
    if (profileBtn.dataset.perfilBound === "1") return;
    profileBtn.dataset.perfilBound = "1";

    const btnConta    = pickId("perfil-conta");
    const btnPlano    = pickId("perfil-plano", "perfil-Plano"); // aceita legado
    const btnMetricas = pickId("perfil-metricas");
    const btnSair     = pickId("perfil-sair");

    const overlay  = $("modalPlanoOverlay");
    const btnClose = $("modalPlanoClose");
    const btnOk    = $("modalPlanoOk");

    const elNome     = $("planoNome");
    const elStatus   = $("planoStatus");
    const elValidade = $("planoValidade");

    let timer = null;

    function setArrow(open) {
      const seta = perfilTexto?.querySelector(".perfil-seta");
      if (seta) seta.textContent = open ? "▲" : "▼";
      profileBtn.setAttribute("aria-expanded", open ? "true" : "false");
      dropdown.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function openDropdown() {
      dropdown.classList.remove("hidden");
      dropdown.classList.add("show");
      setArrow(true);
    }

    function closeDropdown() {
      dropdown.classList.remove("show");
      dropdown.classList.add("hidden");
      setArrow(false);
    }

    function toggleDropdown() {
      const isOpen = dropdown.classList.contains("show") && !dropdown.classList.contains("hidden");
      if (isOpen) closeDropdown();
      else openDropdown();
    }

    function openModalPlano() {
      if (!overlay) return;
      overlay.classList.remove("hidden");
      overlay.setAttribute("aria-hidden", "false");
    }

    function closeModalPlano() {
      if (!overlay) return;
      overlay.classList.add("hidden");
      overlay.setAttribute("aria-hidden", "true");
      if (timer) { clearInterval(timer); timer = null; }
    }

    function startCountdown(expiresAtISO) {
      if (!elValidade) return;

      if (timer) { clearInterval(timer); timer = null; }

      if (!expiresAtISO) {
        elValidade.textContent = "Sem data de expiração";
        return;
      }

      const expiresAt = new Date(expiresAtISO).getTime();
      if (!Number.isFinite(expiresAt)) {
        elValidade.textContent = "Sem data de expiração";
        return;
      }

      function tick() {
        const diff = expiresAt - Date.now();

        if (diff <= 0) {
          elValidade.textContent = "Expirado";
          if (elStatus) elStatus.textContent = "Desativado";
          clearInterval(timer);
          timer = null;
          return;
        }

        const totalSeconds = Math.floor(diff / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);

        elValidade.textContent = `Expira em ${days} dias ${hours}h ${mins}m`;
      }

      tick();
      timer = setInterval(tick, 1000);
    }

    async function fetchPlano(email) {
      const url = `${API_PLANO}?email=${encodeURIComponent(email)}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "X-Email": email
        }
      });

      const text = await res.text();
      let data = null;
      try { data = JSON.parse(text); } catch (_) {}

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} - ${text}`);
      }

      if (!data || (data.ok !== true && data.ok !== "true")) {
        // ainda retorna o payload pro debug
        throw new Error(`Resposta inválida: ${text}`);
      }

      return data;
    }

    async function loadPlano() {
      if (elNome) elNome.textContent = "Carregando...";
      if (elStatus) elStatus.textContent = "—";
      if (elValidade) elValidade.textContent = "—";

      const email = getEmailCliente();
      if (!email) {
        if (elNome) elNome.textContent = "—";
        if (elStatus) elStatus.textContent = "—";
        if (elValidade) elValidade.textContent = "Sem e-mail no login";
        console.warn("[PLANO] Sem email no localStorage (ar.email/usuarioEmail/email).");
        return;
      }

      try {
        const data = await fetchPlano(email);

        if (elNome) elNome.textContent = data.planName || "—";
        if (elStatus) elStatus.textContent = (data.active || data.status === "ACTIVE") ? "Ativo" : "Desativado";
        startCountdown(data.expiresAt || "");

      } catch (err) {
        console.warn("[PLANO] erro:", err);
        if (elNome) elNome.textContent = "—";
        if (elStatus) elStatus.textContent = "—";
        if (elValidade) elValidade.textContent = "Falha ao carregar";
      }
    }

    // ====== Eventos ======
    profileBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleDropdown();
    });

    document.addEventListener("click", (e) => {
      if (!dropdown.contains(e.target) && e.target !== profileBtn) closeDropdown();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
        if (overlay && !overlay.classList.contains("hidden")) closeModalPlano();
      }
    });

    btnConta?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeDropdown();
      alert("Em breve: Conta");
    });

    btnMetricas?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeDropdown();
      window.location.href = "metricas.html";
    });

    btnSair?.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      closeDropdown();
      localStorage.removeItem("ar.token");
      localStorage.removeItem("ar.email");
      localStorage.removeItem("ar.exp");
      localStorage.removeItem("ar.statusPlano");
      window.location.href = "../html/login.html";
    });

    btnPlano?.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      closeDropdown();

      if (!overlay) {
        console.warn("[PLANO] modalPlanoOverlay não existe no HTML.");
        return;
      }

      openModalPlano();
      await loadPlano();
    });

    btnClose?.addEventListener("click", closeModalPlano);
    btnOk?.addEventListener("click", closeModalPlano);

    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) closeModalPlano();
    });

    // Debug rápido pra você ver o email que ele vai usar:
    console.log("[PERFIL] bound OK. email:", getEmailCliente());
  });
})();
