/* ============================================================
   app.js (ATUALIZADO)
   ============================================================ */
"use strict";

/* ============================================================
   ✅ AUTO PLAY GLTF ANIMATION (A-Frame)
   - Registra o componente mesmo se AFRAME carregar depois
   - Toca automaticamente animações do GLB quando model-loaded dispara
   ============================================================ */

function __registerAutoGltfAnimationOnce() {
  if (!window.AFRAME) return false;
  if (AFRAME.components["auto-gltf-animation"]) return true;

  AFRAME.registerComponent("auto-gltf-animation", {
    schema: {
      clip: { default: "*" },        // "*" = toca todas
      timeScale: { default: 1.0 },   // velocidade
      loop: { default: "repeat" }    // repeat | once
    },

    init() {
      this.mixer = null;
      this.actions = [];

      this._onModelLoaded = (e) => {
        this._stopAll();

        const model = e.detail && e.detail.model;
        const clips = model && model.animations ? model.animations : [];

        if (!model || !clips.length || !window.THREE) return;

        this.mixer = new THREE.AnimationMixer(model);

        const wantAll = (this.data.clip === "*" || !this.data.clip);

        for (const clip of clips) {
          if (!wantAll && clip.name !== this.data.clip) continue;

          const action = this.mixer.clipAction(clip);
          action.reset();

          if (this.data.loop === "once") {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          } else {
            action.setLoop(THREE.LoopRepeat, Infinity);
          }

          action.play();
          this.actions.push(action);
        }

        this.mixer.timeScale = Number(this.data.timeScale) || 1.0;
      };

      this.el.addEventListener("model-loaded", this._onModelLoaded);
    },

    tick(_t, dt) {
      if (this.mixer) this.mixer.update((dt || 0) / 1000);
    },

    remove() {
      this.el.removeEventListener("model-loaded", this._onModelLoaded);
      this._stopAll();
    },

    _stopAll() {
      if (this.actions && this.actions.length) {
        this.actions.forEach(a => { try { a.stop(); } catch (_) {} });
      }
      this.actions = [];
      this.mixer = null;
    }
  });

  return true;
}

// tenta registrar agora; se não der, tenta algumas vezes (A-Frame pode carregar depois)
(function ensureAutoAnimRegistered() {
  let tries = 0;
  const maxTries = 120; // ~6s (120 * 50ms)
  const tick = () => {
    tries++;
    const ok = __registerAutoGltfAnimationOnce();
    if (ok || tries >= maxTries) clearInterval(timer);
  };
  const timer = setInterval(tick, 50);
  tick();
})();

// Helper: aplica o componente no container (sem depender do timing)
function __applyAutoAnimTo(container) {
  if (!container) return;
  // garante que o componente exista no entity
  container.setAttribute("auto-gltf-animation", "clip: *; loop: repeat; timeScale: 1");
}

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
  // se já tem query, adiciona &v=... ; senão ?v=...
  return url.includes("?") ? `${url}&v=${encodeURIComponent(__ver)}` : `${url}${__bust}`;
}

// Normaliza "Porções", "porcoes", "PORÇÕES" -> "porcoes"
function normKey(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[\s\-]+/g, "_"); // espaços/hífen -> underscore
}

async function ensureActivePlan() {
  const u = qs("u", "").trim(); // e-mail vindo do QR
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
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}.json`),
  ];
  const ITENS_CANDIDATES = [
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/informacao/${nomeRestaurante}/itens.json`),
    addBust(`https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-itens.json`),
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
  return startIndex; // fallback
}

async function loadModel(path) {
  const container = document.querySelector("#modelContainer");
  const loadingIndicator = document.getElementById("loadingIndicator");
  if (!container || !loadingIndicator) return;

  // ✅ garante componente de animação sempre presente no entity
  __applyAutoAnimTo(container);

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

  container.setAttribute("rotation", "0 180 0");

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

  container.setAttribute("position", `${px} ${py} ${pz}`);
  container.setAttribute("scale", "1 1 1");

  currentModelPath = path;
  const modelUrl = addBust(path);

  if (modelCache[modelUrl]) {
    container.setAttribute("gltf-model", modelCache[modelUrl]);
    __applyAutoAnimTo(container); // ✅ (cache) garante autoplay

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
    __applyAutoAnimTo(container); // ✅ (XHR) garante autoplay

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

  applyRotationRule();
}

function selectCategory(category) {
  if (!models[category] || !models[category].length) return;

  currentCategory = category;
  applyRotationRule();

  const first = findNextVisibleIndex(category, 0, 1);
  currentIndex = first;

  loadModel(models[category][currentIndex].path);
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

  applyRotationRule();

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
   ✅ ROTAÇÃO AUTOMÁTICA (ATUALIZADA)
   - NÃO rotaciona quando a categoria é "diversos"
   - PAUSA enquanto o usuário está tocando (pra não brigar)
   ============================================================ */

let __isTouching = false;

function shouldAutoRotate() {
  const isDiversos = normKey(currentCategory) === "diversos";
  if (isDiversos) return false;
  if (__isTouching) return false;
  return true;
}

function applyRotationRule() {
  const isDiversos = normKey(currentCategory) === "diversos";
  const mv = document.getElementById("modelViewer"); // pode ser null
  if (mv) {
    if (isDiversos) mv.removeAttribute("auto-rotate");
    else mv.setAttribute("auto-rotate", "");
  }
}

setInterval(() => {
  if (!shouldAutoRotate()) return;

  const model = document.querySelector("#modelContainer");
  if (!model || !model.getAttribute("gltf-model")) return;

  const rotation = model.getAttribute("rotation");
  rotation.y = (rotation.y + 0.5) % 360;
  model.setAttribute("rotation", rotation);
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
      const rotation = model.getAttribute("rotation");
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
      const rotation = model.getAttribute("rotation");
      if (rotation) {
        const newX = Math.min(Math.max(initialRotationX - deltaY * 0.2, -90), 90);
        model.setAttribute("rotation", `${newX} ${rotation.y} ${rotation.z}`);
      }
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

async function loadProductInfoJSON(filename, panel) {
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

/* ============================================================
   model-viewer (se existir) — deixei seguro (não quebra)
   (Não é necessário pro autoplay do A-Frame)
   ============================================================ */
const mv = document.getElementById("modelViewer"); // pode ser null
function forceAutoPlayAnimation() {
  if (!mv) return;

  const play = () => {
    const anims = mv.availableAnimations || [];
    if (!anims.length) return;
    if (!mv.animationName) mv.animationName = anims[0];
    mv.play();
  };

  if (mv.loaded) play();
  else mv.addEventListener("load", play, { once: true });
}
