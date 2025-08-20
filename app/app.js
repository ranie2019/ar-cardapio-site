// ==================== VARIÁVEIS GLOBAIS ====================
let currentCategory = 'logo';
let currentIndex = 0;
const modelCache = {};
let currentModelPath = '';
let infoVisible = false;

// Usa o "v" do QR para cache-busting consistente entre dispositivos
const __qs = new URLSearchParams(location.search);
const __ver = __qs.get('v') || Date.now().toString();
const __bust = `?v=${encodeURIComponent(__ver)}`;

// ==================== CONFIGURAÇÃO DO RESTAURANTE VIA S3 ====================
async function aplicarConfiguracaoDoRestaurante() {
  const urlParams = new URLSearchParams(window.location.search);
  const nomeRestaurante = urlParams.get("restaurante") || "restaurante-padrao";

  // Candidatos (ordem de prioridade) — tentamos o primeiro que responder OK
  const CATS_CANDIDATES = [
    `https://ar-cardapio-models.s3.amazonaws.com/informacao/${nomeRestaurante}/config.json${__bust}`,
    `https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}.json${__bust}`,
  ];
  const ITENS_CANDIDATES = [
    `https://ar-cardapio-models.s3.amazonaws.com/informacao/${nomeRestaurante}/itens.json${__bust}`,
    `https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-itens.json${__bust}`,
  ];

  // helper: pega o primeiro JSON disponível
  const fetchFirstJson = async (urls) => {
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (r.ok) return await r.json();
      } catch (_) { /* tenta o próximo */ }
    }
    return null;
  };

  try {
    // 1) Categorias (mostrar/esconder botões do menu)
    const configCategorias = await fetchFirstJson(CATS_CANDIDATES);
    if (configCategorias) {
      const container = document.getElementById('categoryButtons');
      const btns = container ? container.querySelectorAll('.category-btn') : [];
      btns.forEach(btn => {
        const m = btn.getAttribute('onclick')?.match(/'([^']+)'/);
        if (!m) return;
        const key = normKey(m[1]);

        let visivel = true;
        for (const k in configCategorias) {
          if (normKey(k) === key) {
            visivel = Boolean(configCategorias[k]);
            break;
          }
        }
        btn.style.display = visivel ? 'block' : 'none';
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
          const modelName = model.path.split('/').pop().replace('.glb', '');
          const estaDesativado = lista.some(n => normKey(n) === normKey(modelName));
          if (estaDesativado) model.visible = false;
        });
      }
    }
  } catch (err) {
    console.warn('⚠️ Falha ao aplicar configuração do restaurante:', err);
  }
}

// ==================== SINCRONIZAÇÃO EM TEMPO REAL ====================
const canalCardapio = new BroadcastChannel('cardapio_channel');

canalCardapio.onmessage = (event) => {
  const { nome, visivel } = event.data;
  const nomeFormatado = nome.toLowerCase().replace(/\s+/g, '_');

  // Atualiza o estado nos modelos
  for (const categoria in models) {
    const itemIndex = models[categoria].findIndex(model => {
      const modelName = model.path.split('/').pop().replace('.glb', '');
      return modelName === nomeFormatado;
    });

    if (itemIndex !== -1) {
      models[categoria][itemIndex].visible = visivel;

      // Se o item atual ficou invisível, muda para o próximo
      if (!visivel && currentModelPath === models[categoria][itemIndex].path) {
        changeModel(1);
      }
      break;
    }
  }
};

// ==================== ATUALIZAÇÕES DE INTERFACE ====================
function formatProductName(path) {
  const file = path.split('/').pop().replace('.glb', '');
  return file.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function updateUI(model) {
  const nameEl = document.getElementById("productNameDisplay");
  const priceEl = document.getElementById("priceDisplay");
  const infoBtn = document.getElementById("infoBtn");

  nameEl.textContent = formatProductName(model.path);

  const deveMostrarPreco = ["pizzas", "sobremesas", "bebidas", "carnes"].includes(currentCategory);

  if (deveMostrarPreco) {
    const n = typeof model.price === 'number' && !Number.isNaN(model.price) ? model.price : 0;
    priceEl.textContent = `R$ ${n.toFixed(2)}`;
    infoBtn.style.display = "block";
    priceEl.style.display = "block";
  } else {
    infoBtn.style.display = "none";
    priceEl.style.display = "none";
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

async function loadModel(path) {
  // Verifica se o modelo indicado está visível
  const targetModel = getModelDataByPath(path);
  if (targetModel && targetModel.visible === false) {
    changeModel(1); // Pula para o próximo modelo se este estiver invisível
    return;
  }

  const container = document.querySelector("#modelContainer");
  const loadingIndicator = document.getElementById("loadingIndicator");

  loadingIndicator.style.display = "block";
  loadingIndicator.innerText = "Carregando...";
  container.removeAttribute("gltf-model");

  container.setAttribute("rotation", "0 180 0");
  container.setAttribute("position", "0 -.6 0");
  container.setAttribute("scale", "1 1 1");

  currentModelPath = path;

  if (modelCache[path]) {
    container.setAttribute("gltf-model", modelCache[path]);

    // Atualiza o preço (se houver JSON vinculado)
    await atualizarPrecoDoModelo(path);

    loadingIndicator.style.display = "none";
    updateUI({ path, price: getModelPrice(path) });
  } else {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path + "?v=" + Date.now(), true);
    xhr.responseType = "blob";

    xhr.onprogress = (e) => {
      if (e.lengthComputable) {
        loadingIndicator.innerText = `${Math.round((e.loaded / e.total) * 100)}%`;
      }
    };

    xhr.onload = async () => {
      const blobURL = URL.createObjectURL(xhr.response);
      modelCache[path] = blobURL;
      container.setAttribute("gltf-model", blobURL);

      // Atualiza o preço (se houver JSON vinculado)
      await atualizarPrecoDoModelo(path);

      loadingIndicator.style.display = "none";
      updateUI({ path, price: getModelPrice(path) });
    };

    xhr.onerror = () => {
      console.error("Erro ao carregar o modelo:", path);
      loadingIndicator.innerText = "Erro ao carregar o modelo";
    };

    xhr.send();
  }
}

async function atualizarPrecoDoModelo(path) {
  const modelData = getModelDataByPath(path);
  if (!modelData || !modelData.info) return;

  try {
    const response = await fetch(modelData.info + "?v=" + Date.now());
    if (!response.ok) throw new Error("Erro ao buscar JSON");

    const data = await response.json();

    if (data.preco !== undefined) {
      modelData.price = parseFloat(data.preco); // Atualiza o preço com base no JSON do S3
    }
  } catch (error) {
    console.warn("Não foi possível atualizar o preço a partir do JSON:", error);
  }
}

function getModelPrice(path) {
  for (const cat in models) {
    for (const model of models[cat]) {
      if (model.path === path) return model.price;
    }
  }
  return 0;
}

// ==================== CONTROLE DE MODELOS ====================
function changeModel(dir) {
  let tentativas = 0;
  const total = models[currentCategory].length;
  const maxTentativas = total * 2; // prevenção de loop infinito

  do {
    currentIndex = (currentIndex + dir + total) % total;
    tentativas++;
    if (models[currentCategory][currentIndex].visible !== false || tentativas >= maxTentativas) {
      break;
    }
  } while (true);

  loadModel(models[currentCategory][currentIndex].path);

  const infoPanel = document.getElementById('infoPanel');
  if (infoPanel && infoPanel.style.display === 'block') {
    infoPanel.style.display = 'none';
    infoVisible = false;
  }
}

function selectCategory(category) {
  if (!models[category]) return;

  currentCategory = category;
  currentIndex = 0;

  // Encontra o primeiro item visível na categoria
  while (currentIndex < models[category].length && models[category][currentIndex].visible === false) {
    currentIndex++;
  }

  // Se todos estiverem invisíveis, mostra o primeiro (como fallback)
  if (currentIndex >= models[category].length) {
    currentIndex = 0;
  }

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
  currentCategory = 'logo';

  // Se a Home salvou a escolha do logo: localStorage.setItem('logoSelecionado', '<slug>');
  const savedSlug = localStorage.getItem('logoSelecionado'); // ex.: "cubo" ou "tabua_de_carne"

  let idx = -1;
  if (savedSlug && Array.isArray(models.logo)) {
    idx = models.logo.findIndex(m => {
      const slug = m.path.split('/').pop().replace('.glb', '');
      return slug === savedSlug && m.visible !== false;
    });
  }

  if (idx < 0) idx = firstVisibleIndex('logo'); // primeiro logo ativo (pelas configs S3)
  if (idx < 0) idx = 0;                         // fallback

  currentIndex = Math.max(0, idx);

  if (models.logo && models.logo[currentIndex]) {
    loadModel(models.logo[currentIndex].path);
  }
}

// ==================== MENU LATERAL (MOBILE) ====================
document.getElementById("menuBtn").addEventListener("click", () => {
  const el = document.getElementById("categoryButtons");
  el.style.display = el.style.display === "flex" ? "none" : "flex";
});

// ==================== INICIALIZAÇÃO ====================
window.addEventListener("DOMContentLoaded", async () => {
  // Inicializa todos os modelos como visíveis por padrão
  for (const categoria in models) {
    models[categoria].forEach(model => {
      if (model.visible === undefined) {
        model.visible = true;
      }
    });
  }

  await aplicarConfiguracaoDoRestaurante();
  verificarEstadoInicial();

  // Carrega o LOGO inicialmente (respeita itens desativados e a escolha salva)
  mostrarLogoInicial();
});

// ==================== VERIFICAÇÃO POR QR CODE ====================
function verificarEstadoInicial() {
  const urlParams = new URLSearchParams(window.location.search);
  const estadoCodificado = urlParams.get('estado');

  if (estadoCodificado) {
    try {
      const estado = JSON.parse(decodeURIComponent(estadoCodificado));

      // Aplica configurações de categorias
      if (estado.categorias) {
        document.querySelectorAll('.category-btn').forEach(btn => {
          const categoria = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
          if (estado.categorias[categoria] === false) {
            btn.style.display = 'none';
          }
        });
      }

      // Aplica configurações de itens (tornar invisíveis)
      if (estado.itens) {
        for (const categoria in estado.itens) {
          if (models[categoria]) {
            estado.itens[categoria].forEach(itemNome => {
              const itemIndex = models[categoria].findIndex(model => {
                const modelName = model.path.split('/').pop().replace('.glb', '');
                return modelName === itemNome;
              });

              if (itemIndex !== -1) {
                models[categoria][itemIndex].visible = false;
              }
            });
          }
        }
      }
    } catch (e) {
      console.error('Erro ao decodificar estado inicial:', e);
    }
  }
}

// ==================== ROTAÇÃO AUTOMÁTICA ====================
let rotationInterval = setInterval(() => {
  const model = document.querySelector("#modelContainer");
  if (!model || !model.getAttribute("gltf-model")) return;

  const rotation = model.getAttribute("rotation");
  rotation.y = (rotation.y + 0.5) % 360;
  model.setAttribute("rotation", rotation);
}, 30);

// ==================== ZOOM E ROTAÇÃO COM TOQUE ====================
let initialDistance = null;
let initialScale = 1;
let startY = null;
let initialRotationX = 0;

function updateScale(scaleFactor) {
  const model = document.querySelector("#modelContainer");
  if (!model) return;

  const newScale = Math.min(Math.max(initialScale * scaleFactor, 0.1), 10);
  model.setAttribute("scale", `${newScale} ${newScale} ${newScale}`);
}

window.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    initialDistance = Math.sqrt(dx * dx + dy * dy);
    const model = document.querySelector("#modelContainer");
    if (model) {
      const scale = model.getAttribute("scale");
      initialScale = scale ? scale.x : 1;
    }
  } else if (e.touches.length === 1) {
    startY = e.touches[0].clientY;
    const model = document.querySelector("#modelContainer");
    if (model) {
      const rotation = model.getAttribute("rotation");
      initialRotationX = rotation ? rotation.x : 0;
    }
  }
});

window.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialDistance) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    updateScale(currentDistance / initialDistance);
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
});

window.addEventListener("touchend", () => {
  initialDistance = null;
  startY = null;
});

// ==================== BOTÃO DE INFORMAÇÕES ====================
document.getElementById("infoBtn").addEventListener("click", () => {
  const panel = document.getElementById("infoPanel");

  if (infoVisible) {
    panel.style.display = "none";
    infoVisible = false;
    return;
  }

  if (!currentModelPath) return;

  const filename = currentModelPath.split('/').pop().replace('.glb', '');
  loadProductInfoJSON(filename, panel);
});

// ==================== LER JSON DE INFORMAÇÕES ====================
async function loadProductInfoJSON(filename, panel) {
  try {
    const modelData = getCurrentModelData();
    if (!modelData || !modelData.info) throw new Error("Informações não disponíveis");

    const response = await fetch(modelData.info + "?v=" + Date.now());
    if (!response.ok) throw new Error("Erro ao carregar informações");

    const data = await response.json();

    // Propriedades que NÃO queremos exibir
    const ocultar = new Set(['preco', 'ultimaAtualizacao']);

    // Monta linhas apenas com as chaves permitidas
    const linhas = [];
    for (let key in data) {
      if (ocultar.has(key)) continue;           // pula preco e ultimaAtualizacao
      const textoChave = key
        .replace(/_/g, ' ')                      // trocar underscores
        .replace(/\b\w/g, l => l.toUpperCase()); // capitalizar
      linhas.push(`${textoChave}: ${data[key]}`);
    }

    // Texto final
    const textoFormatado = linhas.join('\n\n');
    const infoDiv = document.getElementById("infoContent");
    infoDiv.innerText = textoFormatado;
    panel.style.display = "block";
    infoVisible = true;

  } catch (error) {
    console.error("Erro:", error);
    document.getElementById("infoContent").innerText = "Informações não disponíveis";
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

// ==================== HELPERS ====================
// Normaliza "Porções", "porcoes", "PORÇÕES" -> "porcoes"
function normKey(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, '_'); // espaços -> underscore
}

async function fetchJsonNoStore(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
  return res.json();
}
