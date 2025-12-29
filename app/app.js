/* ============================================================
   app.js (BASE + HOME4 FIX)
   ✅ Mantém sua lógica original
   ✅ Chef: começa na direção certa (Y=30) + centraliza X/Z + chão no Y=0 (resolve “na lateral”)
   ✅ GLB anima via THREE.AnimationMixer + remove tracks scale bugadas (chef não some)
   ✅ Auto-rotate controlável (diversos/chef)
   ============================================================ */
"use strict";

// ==================== VARIÁVEIS GLOBAIS ====================
let currentCategory = "logo";
let currentIndex = 0;
const modelCache = {}; // cache por URL final (inclui bust)
let currentModelPath = "";
let infoVisible = false;

// Usa o "v" do QR para cache-busting consistente entre dispositivos
const __qs = new URLSearchParams(location.search);
const __ver = __qs.get("v") || Date.now().toString();
const __bust = `?v=${encodeURIComponent(__ver)}`;

// ========= Checagem de assinatura (antes de iniciar o app) =========
const API_BASE = "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com"; // stage $default
const ENDPOINT_STATUS = `${API_BASE}/assinatura/status`;
const PAGE_EXPIRADO = "https://site-arcardapio.s3.us-east-1.amazonaws.com/planoExpirado.html";

// -------------------- Helpers --------------------
function qs(name, def = "") {
  const v = new URL(location.href).searchParams.get(name);
  return v == null ? def : v;
}

function addBust(url) {
  if (!url) return url;
  return url.includes("?") ? `${url}&v=${encodeURIComponent(__ver)}` : `${url}${__bust}`;
}

// Normaliza "Porções", "porcoes", "PORÇÕES" -> "porcoes"
function normKey(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[\s\-]+/g, "_"); // espaços/hífen -> underscore
}

async function ensureActivePlan() {
  const u = qs("u", "").trim();
  if (!u) return;

  try {
    const resp = await fetch(`${ENDPOINT_STATUS}?u=${encodeURIComponent(u)}`, {
      method: "GET",
      headers: { "Cache-Control": "no-cache" }
    });

    const data = await resp.json().catch(() => ({}));

    if (!data.ok || !data.ativo) {
      const dest = new URL(PAGE_EXPIRADO);
      dest.searchParams.set("u", u);
      if (data && data.status) dest.searchParams.set("status", data.status);
      location.replace(dest.toString());
      throw new Error("Plano inativo/expirado");
    }
  } catch (e) {
    console.warn("Falha ao checar assinatura:", e);
  }
}

// ==================== CONFIGURAÇÃO DO RESTAURANTE VIA S3 ====================
async function aplicarConfiguracaoDoRestaurante() {
  const urlParams = new URLSearchParams(window.location.search);
  const nomeRestaurante = urlParams.get("restaurante") || "restaurante-padrao";

  const CATS_CANDIDATES = [
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/informacao/${nomeRestaurante}/config.json`),
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}.json`)
  ];
  const ITENS_CANDIDATES = [
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/informacao/${nomeRestaurante}/itens.json`),
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-itens.json`)
  ];

  const fetchFirstJson = async (urls) => {
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (_) {}
    }
    return null;
  };

  try {
    // 1) Categorias (mostrar/esconder botões)
    const configCategorias = await fetchFirstJson(CATS_CANDIDATES);
    if (configCategorias) {
      const container = document.getElementById("categoryButtons");
      const btns = container ? container.querySelectorAll(".category-btn") : [];
      btns.forEach(btn => {
        const m = btn.getAttribute("onclick")?.match(/'([^']+)'/);
        if (!m) return;
        const key = normKey(m[1]);

        let visivel = true;
        for (const k in configCategorias) {
          if (normKey(k) === key) {
            visivel = Boolean(configCategorias[k]);
            break;
          }
        }
        btn.style.display = visivel ? "block" : "none";
      });
    }

    // 2) Itens desativados por categoria
    const configItens = await fetchFirstJson(ITENS_CANDIDATES);
    if (configItens) {
      for (const categoria in configItens) {
        const catKey = normKey(categoria);
        const lista = Array.isArray(configItens[categoria]) ? configItens[categoria] : [];
        if (!models[catKey]) continue;

        models[catKey].forEach(model => {
          const modelName = normKey(model.path.split("/").pop().replace(".glb", ""));
          const estaDesativado = lista.some(n => normKey(n) === modelName);
          if (estaDesativado) model.visible = false;
        });
      }
    }
  } catch (err) {
    console.warn("⚠️ Falha ao aplicar configuração do restaurante:", err);
  }
}

// ==================== SINCRONIZAÇÃO EM TEMPO REAL ====================
const canalCardapio = new BroadcastChannel("cardapio_channel");

canalCardapio.onmessage = (event) => {
  const { nome, visivel } = event.data || {};
  const alvo = normKey(nome || "");

  for (const categoria in models) {
    const itemIndex = models[categoria].findIndex(model => {
      const modelName = normKey(model.path.split("/").pop().replace(".glb", ""));
      return modelName === alvo;
    });

    if (itemIndex !== -1) {
      models[categoria][itemIndex].visible = Boolean(visivel);

      if (!visivel && currentModelPath === models[categoria][itemIndex].path) {
        changeModel(1);
      }
      break;
    }
  }
};

// ==================== ATUALIZAÇÕES DE INTERFACE ====================
function formatProductName(path) {
  const file = path.split("/").pop().replace(".glb", "");
  return file.replace(/[_-]/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function updateUI(model) {
  const nameEl = document.getElementById("productNameDisplay");
  const priceEl = document.getElementById("priceDisplay");
  const infoBtn = document.getElementById("infoBtn");

  if (nameEl) nameEl.textContent = formatProductName(model.path);

  const deveMostrarPreco = ["pizzas", "sobremesas", "bebidas", "carnes"].includes(currentCategory);

  if (deveMostrarPreco) {
    const n = typeof model.price === "number" && !Number.isNaN(model.price) ? model.price : 0;
    if (priceEl) {
      priceEl.textContent = `R$ ${n.toFixed(2)}`;
      priceEl.style.display = "block";
    }
    if (infoBtn) infoBtn.style.display = "block";
  } else {
    if (infoBtn) infoBtn.style.display = "none";
    if (priceEl) priceEl.style.display = "none";
    const panel = document.getElementById("infoPanel");
    if (panel) panel.style.display = "none";
    infoVisible = false;
  }
}

// ==================== CARREGAMENTO DO MODELO 3D ====================
function getModelDataByPath(path) {
  for (const cat in models) {
    const found = models[cat].find(m => m.path === path);
    if (found) return found;
  }
  return null;
}

function getModelPrice(path) {
  for (const cat in models) {
    for (const model of models[cat]) {
      if (model.path === path) return model.price;
    }
  }
  return 0;
}

// Pega o próximo índice visível sem recursão
function findNextVisibleIndex(cat, startIndex, dir) {
  if (!models[cat] || !models[cat].length) return startIndex;
  const total = models[cat].length;
  let idx = startIndex;
  for (let i = 0; i < total; i++) {
    idx = (idx + dir + total) % total;
    if (models[cat][idx].visible !== false) return idx;
  }
  return startIndex;
}

/* ============================================================
   ✅ HOME4: AnimationMixer + Fix de scale + Chef Centralizado
   ============================================================ */

// Detecta Chef por nome/caminho
function __isChefPath(path) {
  return String(path || "").toLowerCase().includes("chef");
}

// Direção igual HOME
const __CHEF_FRONT_Y = 0;

// Fix scale tracks
const __FIX_SCALE_TINY_THRESHOLD = 0.05;
const __FIX_REMOVE_NEGATIVE_SCALE = true;

// Mixer
let __mixer = null;
let __actions = [];
let __mixerRAF = null;
let __mixerLastTs = 0;

// Cache de “centralização” por path (pra não aplicar 2x)
const __centerApplied = Object.create(null);

function __stopMixer() {
  if (__mixerRAF) cancelAnimationFrame(__mixerRAF);
  __mixerRAF = null;
  __mixerLastTs = 0;

  try {
    __actions.forEach(a => { try { a.stop(); } catch (_) {} });
  } catch (_) {}
  __actions = [];
  __mixer = null;
}

function __shouldDropScaleTrack(track) {
  if (!track || !track.name || !track.name.endsWith(".scale")) return false;
  const v = track.values;
  if (!v || v.length < 3) return false;

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < v.length; i++) {
    const val = v[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }

  if (max < __FIX_SCALE_TINY_THRESHOLD) return true;
  if (__FIX_REMOVE_NEGATIVE_SCALE && min < 0) return true;
  return false;
}

function __fixClipScaleTracks(clip) {
  if (!clip || !clip.tracks || !clip.tracks.length) return clip;

  let changed = false;
  const tracks = clip.tracks.filter(tr => {
    const drop = __shouldDropScaleTrack(tr);
    if (drop) changed = true;
    return !drop;
  });

  if (!changed) return clip;

  const cloned = clip.clone();
  cloned.tracks = tracks;
  return cloned;
}

function __pickClips(anims) {
  const bad = /(t[\-\s_]?pose|bindpose|rest)/i;
  const good = anims.filter(a => a && a.name && !bad.test(a.name));
  return good.length ? good : anims;
}

function __startMixerLoop() {
  if (__mixerRAF) return;

  const tick = (ts) => {
    if (!__mixer) {
      __mixerRAF = null;
      return;
    }

    if (!__mixerLastTs) __mixerLastTs = ts;
    const dt = Math.min(0.05, (ts - __mixerLastTs) / 1000);
    __mixerLastTs = ts;

    try { __mixer.update(dt); } catch (_) {}

    __mixerRAF = requestAnimationFrame(tick);
  };

  __mixerRAF = requestAnimationFrame(tick);
}

function __applyChefFront(container, path) {
  if (!container) return;
  if (!__isChefPath(path)) return;
  container.setAttribute("rotation", `0 ${__CHEF_FRONT_Y} 0`);
}

/**
 * ✅ NOVO (o que resolve seu problema):
 * Centraliza o modelo no meio (X/Z) e coloca o “chão” no Y=0,
 * baseado no bounding box do THREE model.
 */
function __centerAndGroundThreeModel(threeModel, cacheKey) {
  if (!window.THREE || !threeModel) return;
  if (__centerApplied[cacheKey]) return;

  try {
    const box = new THREE.Box3().setFromObject(threeModel);
    const center = box.getCenter(new THREE.Vector3());

    // centraliza X/Z (meio da tela)
    threeModel.position.x -= center.x;
    threeModel.position.z -= center.z;

    // recalcula após centralizar
    const box2 = new THREE.Box3().setFromObject(threeModel);

    // joga o “pé” no chão
    threeModel.position.y -= box2.min.y;

    __centerApplied[cacheKey] = true;
  } catch (e) {
    console.warn("[CENTER] falha ao centralizar:", e);
  }
}

function __setupAnimationsFromModelLoadedEvent(ev, path) {
  if (!window.THREE) return;

  const threeModel = ev && ev.detail && ev.detail.model ? ev.detail.model : null;
  if (!threeModel) return;

  const animations = Array.isArray(threeModel.animations) ? threeModel.animations : [];
  if (!animations.length) {
    __stopMixer();
    return;
  }

  __stopMixer();

  try {
    __mixer = new THREE.AnimationMixer(threeModel);

    const chosen = __pickClips(animations).map(__fixClipScaleTracks);

    for (const clip of chosen) {
      try {
        const action = __mixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        __actions.push(action);
      } catch (_) {}
    }

    __startMixerLoop();
  } catch (e) {
    console.warn("[ANIM] Falha ao iniciar mixer:", e);
    __stopMixer();
  }
}

// ==================== CHEF: ANDAR RETO IGUAL HOME (walk-depth-loop) ====================
const __CHEF_WALK = {
  enabled: true,
  startZ: -8,
  endZ: -3,
  startScale: 0.15,
  endScale: 1.0,
  durMs: 4500,
  pauseMs: 400,

  raf: null,
  t0: null,
  phase: "move",
  pauseT0: 0,

  baseX: 0,
  baseY: 0,
  zOffset: 0
};

function __easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

function __stopChefWalk() {
  if (__CHEF_WALK.raf) cancelAnimationFrame(__CHEF_WALK.raf);
  __CHEF_WALK.raf = null;
  __CHEF_WALK.t0 = null;
  __CHEF_WALK.phase = "move";
}

function __startChefWalk(container) {
  if (!container || !container.object3D) return;
  if (!__CHEF_WALK.enabled) return;

  __stopChefWalk();

  const el = container.object3D;
  __CHEF_WALK.t0 = null;
  __CHEF_WALK.phase = "move";

  const tick = (t) => {
    // pausa loop se usuário estiver tocando (pra não brigar)
    if (__isTouching) {
      __CHEF_WALK.raf = requestAnimationFrame(tick);
      return;
    }

    if (__CHEF_WALK.t0 == null) __CHEF_WALK.t0 = t;

    if (__CHEF_WALK.phase === "move") {
      const p = Math.min(1, (t - __CHEF_WALK.t0) / Math.max(1, __CHEF_WALK.durMs));
      const e = __easeOutCubic(p);

      const z = (__CHEF_WALK.startZ + (__CHEF_WALK.endZ - __CHEF_WALK.startZ) * e) + __CHEF_WALK.zOffset;
      const s = __CHEF_WALK.startScale + (__CHEF_WALK.endScale - __CHEF_WALK.startScale) * e;

      el.position.x = __CHEF_WALK.baseX;
      el.position.y = __CHEF_WALK.baseY;
      el.position.z = z;

      el.scale.set(s, s, s);

      if (p >= 1) {
        __CHEF_WALK.phase = "pause";
        __CHEF_WALK.pauseT0 = t;
      }

      __CHEF_WALK.raf = requestAnimationFrame(tick);
      return;
    }

    if (__CHEF_WALK.phase === "pause") {
      if ((t - __CHEF_WALK.pauseT0) >= Math.max(0, __CHEF_WALK.pauseMs)) {
        __CHEF_WALK.t0 = null;
        __CHEF_WALK.phase = "move";
      }
      __CHEF_WALK.raf = requestAnimationFrame(tick);
      return;
    }
  };

  __CHEF_WALK.raf = requestAnimationFrame(tick);
}

// Centraliza o chef SEM mexer no threeModel.position (pra mixer não sobrescrever)
function __computeChefOffsets(threeModel) {
  if (!window.THREE || !threeModel) return { xOff: 0, yOff: 0, zOff: 0 };

  try {
    const box = new THREE.Box3().setFromObject(threeModel);
    const center = box.getCenter(new THREE.Vector3());

    // X/Z: centraliza (no entity)
    const xOff = -center.x;
    const zOff = -center.z;

    // Y: põe “pé” no chão (no entity)
    const yOff = -box.min.y;

    return { xOff, yOff, zOff };
  } catch (_) {
    return { xOff: 0, yOff: 0, zOff: 0 };
  }
}

// Flags de auto-rotate (animacaoapp.js controla "diversos")
let __autoRotateBaseEnabled = true;
let __autoRotateDisabledByDiversos = false;

window.__setAutoRotateEnabled = function (enabled) {
  __autoRotateBaseEnabled = !!enabled;
};

window.__setDiversosAutoRotateDisabled = function (disabled) {
  __autoRotateDisabledByDiversos = !!disabled;
};

function __isAutoRotateBlockedNow() {
  const isDiversos =
    currentCategory === "diversos" ||
    (currentModelPath && String(currentModelPath).toLowerCase().includes("/diversos/"));

  const isChef = __isChefPath(currentModelPath);

  if (!__autoRotateBaseEnabled) return true;
  if (__autoRotateDisabledByDiversos) return true;
  if (isDiversos) return true;
  if (isChef) return true;

  return false;
}

async function loadModel(path) {
  const container = document.querySelector("#modelContainer");
  const loadingIndicator = document.getElementById("loadingIndicator");
  if (!container || !loadingIndicator) return;

  // Se o modelo indicado está invisível, pula para o próximo visível
  const targetModel = getModelDataByPath(path);
  if (targetModel && targetModel.visible === false) {
    currentIndex = findNextVisibleIndex(currentCategory, currentIndex, 1);
    const next = models[currentCategory]?.[currentIndex];
    if (next) return loadModel(next.path);
    return;
  }

  loadingIndicator.style.display = "block";
  loadingIndicator.innerText = "Carregando...";
  container.removeAttribute("gltf-model");

  // rotação padrão
  if (__isChefPath(path)) {
    container.setAttribute("rotation", `0 ${__CHEF_FRONT_Y} 0`);
  } else {
    container.setAttribute("rotation", "0 -45 0");
  }

  // mantém posição padrão sem quebrar ajustes manuais
  const rawPos = container.getAttribute("position");
  let px = 0, py = -0.6, pz = 0;

  if (rawPos && typeof rawPos === "object") {
    px = Number.isFinite(rawPos.x) ? rawPos.x : 0;
    py = Number.isFinite(rawPos.y) ? rawPos.y : -0.6;
    pz = Number.isFinite(rawPos.z) ? rawPos.z : 0;
  } else if (typeof rawPos === "string") {
    const parts = rawPos.trim().split(/\s+/).map(Number);
    px = Number.isFinite(parts[0]) ? parts[0] : 0;
    py = Number.isFinite(parts[1]) ? parts[1] : -0.6;
    pz = Number.isFinite(parts[2]) ? parts[2] : 0;
  }

  // ✅ Chef: zera X/Z do container pra evitar nascer “pro lado”
  if (__isChefPath(path)) {
    px = 0;
    pz = 0;
  }

  container.setAttribute("position", `${px} ${py} ${pz}`);
  container.setAttribute("scale", "1 1 1");

  currentModelPath = path;
  const modelUrl = addBust(path);

  // limpa mixer ao trocar
  __stopMixer();

  // Quando o modelo carregar: direção + centralização + animação
  const onModelLoaded = (ev) => {
    container.removeEventListener("model-loaded", onModelLoaded);

    // chef: força frente
    __applyChefFront(container, path);

    // ✅ chef: centraliza o THREE model (resolve “lateral”)
    if (__isChefPath(path)) {
      const threeModel = ev && ev.detail && ev.detail.model ? ev.detail.model : null;
      __centerAndGroundThreeModel(threeModel, path);
    }

    // animação (mixer + fix scale)
    __setupAnimationsFromModelLoadedEvent(ev, path);
  };

  container.addEventListener("model-loaded", onModelLoaded);

  if (modelCache[modelUrl]) {
    container.setAttribute("gltf-model", modelCache[modelUrl]);

    await atualizarPrecoDoModelo(path);

    loadingIndicator.style.display = "none";
    updateUI({ path, price: getModelPrice(path) });

    syncLikeWithCurrentItem();
    return;
  }

  const xhr = new XMLHttpRequest();
  xhr.open("GET", modelUrl, true);
  xhr.responseType = "blob";

  xhr.onprogress = (e) => {
    if (e.lengthComputable) {
      loadingIndicator.innerText = `${Math.round((e.loaded / e.total) * 100)}%`;
    }
  };

  xhr.onload = async () => {
    const blobURL = URL.createObjectURL(xhr.response);
    modelCache[modelUrl] = blobURL;

    container.setAttribute("gltf-model", blobURL);

    await atualizarPrecoDoModelo(path);

    loadingIndicator.style.display = "none";
    updateUI({ path, price: getModelPrice(path) });

    syncLikeWithCurrentItem();
  };

  xhr.onerror = () => {
    console.error("Erro ao carregar o modelo:", modelUrl);
    loadingIndicator.innerText = "Erro ao carregar o modelo";
  };

  xhr.send();
}

async function atualizarPrecoDoModelo(path) {
  const modelData = getModelDataByPath(path);
  if (!modelData || !modelData.info) return;

  try {
    const response = await fetch(addBust(modelData.info), { cache: "no-store" });
    if (!response.ok) throw new Error("Erro ao buscar JSON");

    const data = await response.json();

    if (data.preco !== undefined) {
      modelData.price = parseFloat(data.preco);
    }
  } catch (error) {
    console.warn("Não foi possível atualizar o preço a partir do JSON:", error);
  }
}

// ==================== CONTROLE DE MODELOS ====================
function changeModel(dir) {
  const total = models[currentCategory]?.length || 0;
  if (!total) return;

  currentIndex = findNextVisibleIndex(currentCategory, currentIndex, dir);
  const next = models[currentCategory][currentIndex];
  if (next) loadModel(next.path);

  const infoPanel = document.getElementById("infoPanel");
  if (infoPanel && infoPanel.style.display === "block") {
    infoPanel.style.display = "none";
    infoVisible = false;
  }
}

function selectCategory(category) {
  // ✅ ÚNICA mudança: normaliza a chave para bater com "models"
  const key = normKey(category);
  if (!models[key] || !models[key].length) return;

  currentCategory = key;

  const first = findNextVisibleIndex(key, 0, 1);
  currentIndex = first;

  loadModel(models[key][currentIndex].path);
}

// ==================== SUPORTE A LOGO INICIAL ====================
function firstVisibleIndex(cat) {
  if (!models[cat] || !models[cat].length) return -1;
  for (let i = 0; i < models[cat].length; i++) {
    if (models[cat][i].visible !== false) return i;
  }
  return -1;
}

function mostrarLogoInicial() {
  currentCategory = "logo";
  const savedSlug = localStorage.getItem("logoSelecionado");

  let idx = -1;
  if (savedSlug && Array.isArray(models.logo)) {
    idx = models.logo.findIndex(m => {
      const slug = m.path.split("/").pop().replace(".glb", "");
      return slug === savedSlug && m.visible !== false;
    });
  }

  if (idx < 0) idx = firstVisibleIndex("logo");
  if (idx < 0) idx = 0;

  currentIndex = Math.max(0, idx);

  if (models.logo && models.logo[currentIndex]) {
    loadModel(models.logo[currentIndex].path);
  }
}

// ==================== MENU LATERAL (MOBILE) ====================
document.getElementById("menuBtn")?.addEventListener("click", () => {
  const el = document.getElementById("categoryButtons");
  if (!el) return;
  el.style.display = (el.style.display === "flex") ? "none" : "flex";
});

// ==================== INICIALIZAÇÃO ====================
window.addEventListener("DOMContentLoaded", async () => {
  await ensureActivePlan();

  for (const categoria in models) {
    models[categoria].forEach(model => {
      if (model.visible === undefined) model.visible = true;
    });
  }

  await aplicarConfiguracaoDoRestaurante();
  verificarEstadoInicial();

  loadLikeStateFromStorage();
  setupLikeButtons();

  mostrarLogoInicial();
});

// ==================== VERIFICAÇÃO POR QR CODE ====================
function verificarEstadoInicial() {
  const urlParams = new URLSearchParams(window.location.search);
  const estadoCodificado = urlParams.get("estado");

  if (!estadoCodificado) return;

  try {
    const estado = JSON.parse(decodeURIComponent(estadoCodificado));

    if (estado.categorias) {
      document.querySelectorAll(".category-btn").forEach(btn => {
        const categoria = btn.getAttribute("onclick")?.match(/'([^']+)'/)?.[1];
        if (!categoria) return;
        if (estado.categorias[categoria] === false) btn.style.display = "none";
      });
    }

    if (estado.itens) {
      for (const categoria in estado.itens) {
        if (models[categoria]) {
          estado.itens[categoria].forEach(itemNome => {
            const alvo = normKey(itemNome);
            const itemIndex = models[categoria].findIndex(model => {
              const modelName = normKey(model.path.split("/").pop().replace(".glb", ""));
              return modelName === alvo;
            });

            if (itemIndex !== -1) models[categoria][itemIndex].visible = false;
          });
        }
      }
    }
  } catch (e) {
    console.error("Erro ao decodificar estado inicial:", e);
  }
}

/* ============================================================
   ROTAÇÃO AUTOMÁTICA BASE (SEM REGRAS DE "DIVERSOS")
   - Agora usa bloqueio central (chef/diversos/flags)
   ============================================================ */
let __isTouching = false;

function __getRotObj(el) {
  const r = el.getAttribute("rotation");
  if (!r) return { x: 0, y: 0, z: 0 };
  if (typeof r === "object") return r;
  if (typeof r === "string") {
    const p = r.trim().split(/\s+/).map(Number);
    return {
      x: Number.isFinite(p[0]) ? p[0] : 0,
      y: Number.isFinite(p[1]) ? p[1] : 0,
      z: Number.isFinite(p[2]) ? p[2] : 0
    };
  }
  return { x: 0, y: 0, z: 0 };
}

setInterval(() => {
  if (__isTouching) return;
  if (__isAutoRotateBlockedNow()) return;

  const model = document.querySelector("#modelContainer");
  if (!model || !model.getAttribute("gltf-model")) return;

  const rot = __getRotObj(model);
  rot.y = (rot.y + 0.5) % 360;
  model.setAttribute("rotation", rot);
}, 30);

// ==================== ZOOM + ROTAÇÃO (1 dedo) + SUBIR/DESCER (2 dedos) ====================
let initialDistance = null;
let initialScale = 1;

let startY = null;
let initialRotationX = 0;

let initialMidY = null;
let initialPosY = null;

const TWO_FINGER_MOVE_SENS = 0.0025;
const POS_Y_MIN = -3;
const POS_Y_MAX = 3;

function __arGetMidY(touches) {
  return (touches[0].clientY + touches[1].clientY) / 2;
}

function __arClamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function __arGetPosObj(model) {
  const pos = model.getAttribute("position");
  if (typeof pos === "string") {
    const parts = pos.trim().split(/\s+/).map(Number);
    return {
      x: Number.isFinite(parts[0]) ? parts[0] : 0,
      y: Number.isFinite(parts[1]) ? parts[1] : 0,
      z: Number.isFinite(parts[2]) ? parts[2] : 0
    };
  }
  return pos || { x: 0, y: 0, z: 0 };
}

function updateScale(scaleFactor) {
  const model = document.querySelector("#modelContainer");
  if (!model) return;

  const newScale = Math.min(Math.max(initialScale * scaleFactor, 0.1), 10);
  model.setAttribute("scale", `${newScale} ${newScale} ${newScale}`);
}

function __arSetModelPosY(newY) {
  const model = document.querySelector("#modelContainer");
  if (!model) return;

  const pos = __arGetPosObj(model);
  const y = __arClamp(newY, POS_Y_MIN, POS_Y_MAX);
  model.setAttribute("position", `${pos.x} ${y} ${pos.z}`);
}

window.addEventListener("touchstart", (e) => {
  __isTouching = true;

  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    initialDistance = Math.sqrt(dx * dx + dy * dy);

    const model = document.querySelector("#modelContainer");
    if (model) {
      const scale = model.getAttribute("scale");
      initialScale = scale ? scale.x : 1;

      initialMidY = __arGetMidY(e.touches);
      const pos = __arGetPosObj(model);
      initialPosY = (typeof pos.y === "number") ? pos.y : 0;
    }
  } else if (e.touches.length === 1) {
    startY = e.touches[0].clientY;

    const model = document.querySelector("#modelContainer");
    if (model) {
      const rotation = __getRotObj(model);
      initialRotationX = rotation ? rotation.x : 0;
    }
  }
}, { passive: true });

window.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialDistance) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    updateScale(currentDistance / initialDistance);

    if (initialMidY != null && initialPosY != null) {
      const midY = __arGetMidY(e.touches);
      const delta = midY - initialMidY;
      const newY = initialPosY + (-delta * TWO_FINGER_MOVE_SENS);
      __arSetModelPosY(newY);
    }
  } else if (e.touches.length === 1 && startY !== null) {
    const deltaY = e.touches[0].clientY - startY;
    const model = document.querySelector("#modelContainer");
    if (model) {
      const rotation = __getRotObj(model);
      const newX = Math.min(Math.max(initialRotationX - deltaY * 0.2, -90), 90);
      model.setAttribute("rotation", `${newX} ${rotation.y} ${rotation.z}`);
    }
  }
}, { passive: true });

window.addEventListener("touchend", (e) => {
  if (!e.touches || e.touches.length < 2) {
    initialDistance = null;
    initialMidY = null;
    initialPosY = null;
  }
  if (!e.touches || e.touches.length === 0) {
    startY = null;
    __isTouching = false;
  }
}, { passive: true });

// ==================== INFO ====================
document.getElementById("infoBtn")?.addEventListener("click", () => {
  const panel = document.getElementById("infoPanel");
  if (!panel) return;

  setTimeout(() => {
    const visibleNow = panel.style.display === "block";
    infoVisible = visibleNow;

    if (!visibleNow) return;
    if (!currentModelPath) return;

    const filename = currentModelPath.split("/").pop().replace(".glb", "");
    loadProductInfoJSON(filename, panel);
  }, 0);
});

async function loadProductInfoJSON(_filename, panel) {
  try {
    const modelData = getCurrentModelData();
    if (!modelData || !modelData.info) throw new Error("Informações não disponíveis");

    const response = await fetch(addBust(modelData.info), { cache: "no-store" });
    if (!response.ok) throw new Error("Erro ao carregar informações");

    const data = await response.json();
    const ocultar = new Set(["preco", "nome", "ultimaAtualizacao"]);

    const linhas = [];
    for (let key in data) {
      if (ocultar.has(key)) continue;
      const textoChave = String(key)
        .replace(/_/g, " ")
        .replace(/\b\w/g, l => l.toUpperCase());
      linhas.push(`${textoChave}: ${data[key]}`);
    }

    const infoDiv = document.getElementById("infoContent");
    if (infoDiv) infoDiv.innerText = linhas.join("\n\n");

    panel.style.display = "block";
    infoVisible = true;
  } catch (error) {
    console.error("Erro:", error);
    const infoDiv = document.getElementById("infoContent");
    if (infoDiv) infoDiv.innerText = "Informações não disponíveis";
    panel.style.display = "block";
    infoVisible = true;
  }
}

function getCurrentModelData() {
  for (const cat in models) {
    for (const model of models[cat]) {
      if (model.path === currentModelPath) return model;
    }
  }
  return null;
}

// ==================== LIKE / DISLIKE (VISUAL + MÉTRICAS) ====================
const LIKE_EMPTY_SRC     = "../imagens/positivo.png";
const LIKE_FILLED_SRC    = "../imagens/positivo1.png";
const DISLIKE_EMPTY_SRC  = "../imagens/negativo.png";
const DISLIKE_FILLED_SRC = "../imagens/negativo1.png";

const __tenantKey = qs("restaurante", "unknown");
const LIKE_STORAGE_KEY = `arcardapio_like_state_v1_${__tenantKey}`;

let likeStateByItem = {};
let likeState = null;

let btnLikeEl = null;
let btnDislikeEl = null;
let imgLikeEl = null;
let imgDislikeEl = null;

function applyLikeVisual() {
  if (!imgLikeEl || !imgDislikeEl) return;

  if (likeState === "like") {
    imgLikeEl.src = LIKE_FILLED_SRC;
    imgDislikeEl.src = DISLIKE_EMPTY_SRC;
  } else if (likeState === "dislike") {
    imgLikeEl.src = LIKE_EMPTY_SRC;
    imgDislikeEl.src = DISLIKE_FILLED_SRC;
  } else {
    imgLikeEl.src = LIKE_EMPTY_SRC;
    imgDislikeEl.src = DISLIKE_EMPTY_SRC;
  }
}

function getCurrentItemKey() {
  if (!currentModelPath) return null;
  return currentModelPath.split("/").pop().replace(".glb", "");
}

function loadLikeStateFromStorage() {
  try {
    const raw = localStorage.getItem(LIKE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") likeStateByItem = parsed;
  } catch (e) {
    console.warn("[LIKE] erro ao ler localStorage:", e);
  }
}

function saveLikeStateToStorage() {
  try {
    localStorage.setItem(LIKE_STORAGE_KEY, JSON.stringify(likeStateByItem));
  } catch (e) {
    console.warn("[LIKE] erro ao salvar localStorage:", e);
  }
}

function syncLikeWithCurrentItem() {
  if (!btnLikeEl || !imgLikeEl) return;

  const key = getCurrentItemKey();
  likeState = key ? (likeStateByItem[key] || null) : null;
  applyLikeVisual();
}

function setLikeForCurrentItem(state) {
  const key = getCurrentItemKey();
  if (!key) return;

  if (state === null) delete likeStateByItem[key];
  else likeStateByItem[key] = state;

  saveLikeStateToStorage();
}

function trackLikeEvent(newState, source) {
  if (!newState) return;
  if (!window.MetricaApp || typeof MetricaApp.trackEvent !== "function") return;

  const current = getCurrentModelData() || {};
  const itemPath = current.path || currentModelPath || null;
  const itemName = itemPath ? formatProductName(itemPath) : null;

  const value = (newState === "like") ? "positivo" : "negativo";

  try {
    MetricaApp.trackEvent("like", {
      value,
      source,
      category: currentCategory || null,
      itemPath,
      itemName
    });
  } catch (e) {
    console.error("[METRICAS like] erro ao enviar:", e);
  }
}

function setupLikeButtons() {
  btnLikeEl = document.getElementById("btnLike");
  btnDislikeEl = document.getElementById("btnDislike");
  if (!btnLikeEl || !btnDislikeEl) return;

  imgLikeEl = btnLikeEl.querySelector("img");
  imgDislikeEl = btnDislikeEl.querySelector("img");
  if (!imgLikeEl || !imgDislikeEl) return;

  likeState = null;
  applyLikeVisual();

  btnLikeEl.addEventListener("click", () => {
    likeState = (likeState === "like") ? null : "like";
    setLikeForCurrentItem(likeState);
    applyLikeVisual();
    trackLikeEvent(likeState, "like");
  });

  btnDislikeEl.addEventListener("click", () => {
    likeState = (likeState === "dislike") ? null : "dislike";
    setLikeForCurrentItem(likeState);
    applyLikeVisual();
    trackLikeEvent(likeState, "dislike");
  });
}
