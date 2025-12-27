// home4.js — FOCO 100%: ANIMAÇÃO (SEM mexer nas funções do home2/home3)
// ✅ Toca animações GLB (THREE.AnimationMixer)
// ✅ CORRIGE seu "chef.glb": o clip "T-Pose" tem track de SCALE = ~0.0034 e isso faz o Chef SUMIR.
//    -> Este arquivo REMOVE automaticamente tracks de scale “minúsculos/negativos” (mantém o modelo visível).
// ✅ REMOVE a rotação AUTOMÁTICA APENAS quando o preview for da categoria /diversos/ (sem alterar home2.js)
// ✅ (opcional) efeito “andar pra frente + crescer” apenas quando o modelo for CHEF
//
// COMO USAR:
// 1) Salve este arquivo como UTF-8 em: /java/home4.js
// 2) No home.html, adicione por ÚLTIMO (depois do home3.js):
//    <script src="../java/home4.js"></script>
//
// OBS: Não precisa alterar mais nada.

"use strict";

(function () {
  // ========= CONFIG =========
  const FIX = {
    // qualquer track de scale com max < THRESHOLD (ex: 0.003) será removida
    tinyScaleThreshold: 0.05,
    // também remove scale negativo (min < 0)
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
    clip: "*",      // "*" = todas
    loop: "repeat", // repeat | once
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
        // track.name: "Chef.scale" / "Armature.scale" / etc
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

        // ✅ seu caso real: max ~ 0.0034 => SOME
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

  // ========= COMPONENT: walk-depth-loop (só efeito de posição/scale no entity) =========
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
        this.phase = "move"; // move | pause
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

          // aplica só Z + SCALE (não mexe em X/Y)
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

  // ========= PATCH: remove rotação só em /diversos/ no PREVIEW (sem tocar home2.js) =========
  function patchPreviewRotationOnlyDiversos() {
    const root = document.body;

    const apply = (previewModelEl) => {
      if (!previewModelEl || !previewModelEl.getAttribute) return;

      const url = getGltfUrl(previewModelEl);
      if (!url) return;

      // ✅ só remove rotação se for /diversos/
      if (isDiversosUrl(url)) {
        // home2 usa "animation" pra girar
        if (previewModelEl.hasAttribute("animation")) previewModelEl.removeAttribute("animation");
        // se algum dia você usar animation__x, remove também
        Array.from(previewModelEl.attributes || []).forEach((attr) => {
          if (attr && typeof attr.name === "string" && attr.name.startsWith("animation__")) {
            previewModelEl.removeAttribute(attr.name);
          }
        });
      }

      // ✅ toca animação do GLB no preview também (não quebra quem não tem animação)
      if (GLTF_ANIM.enabled) {
        previewModelEl.setAttribute(
          "safe-gltf-animation",
          `clip: ${GLTF_ANIM.clip}; loop: ${GLTF_ANIM.loop}; timeScale: ${GLTF_ANIM.timeScale}`
        );
      }
    };

    // tenta aplicar imediatamente (caso o preview já exista)
    const now = document.querySelector("#previewModel");
    if (now) apply(now);

    // observa criação/atualização do preview
    const obs = new MutationObserver(() => {
      const el = document.querySelector("#previewModel");
      if (el) apply(el);
    });

    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["gltf-model", "animation"] });
  }

  // ========= HOME: aplica animação no #modelo3d (sem setar gltf-model) =========
  function setupHomeEntityAnimation() {
    const el = document.getElementById("modelo3d");
    if (!el) return;

    // câmera: aumenta far (não muda UI; só evita clipping)
    const cam = document.querySelector("a-camera");
    if (cam) cam.setAttribute("camera", "near: 0.01; far: 1000");

    // sempre habilita mixer seguro (se o modelo tiver animação)
    if (GLTF_ANIM.enabled) {
      el.setAttribute(
        "safe-gltf-animation",
        `clip: ${GLTF_ANIM.clip}; loop: ${GLTF_ANIM.loop}; timeScale: ${GLTF_ANIM.timeScale}`
      );
    }

    // efeito WALK só se for CHEF (pra não bagunçar outros modelos)
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

    // aplica agora e também quando trocar o gltf-model
    applyWalkIfChef();

    const mo = new MutationObserver(applyWalkIfChef);
    mo.observe(el, { attributes: true, attributeFilter: ["gltf-model"] });

    // debug
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

    // 1) remove rotação só em /diversos/ no preview (sem tocar home2.js)
    patchPreviewRotationOnlyDiversos();

    // 2) animação do modelo principal da HOME
    await waitFor(() => !!document.getElementById("modelo3d"), 9000);
    setupHomeEntityAnimation();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
