// ==================== VARIÃVEIS GLOBAIS ====================
let currentCategory = 'inicio';
let currentIndex = 0;
const modelCache = {};
let currentModelPath = '';
let infoVisible = false;

// ==================== CONFIGURAÇÃO DO RESTAURANTE VIA S3 ====================
async function aplicarConfiguracaoDoRestaurante() {
  const urlParams = new URLSearchParams(window.location.search);
  const nomeRestaurante = urlParams.get("restaurante") || "restaurante-padrao";

  // sempre usa o mesmo "v" do QR
  const urlCategorias = `https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}.json${__bust}`;
  const urlItens      = `https://ar-cardapio-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-itens.json${__bust}`;

  try {
    // Carrega configurações de categorias (sem cache)
    const configCategorias = await fetchJsonNoStore(urlCategorias);

    // Mapeia todos os botões existentes e decide visibilidade a partir do JSON
    const container = document.getElementById('categoryButtons');
    const btns = container ? container.querySelectorAll('.category-btn') : [];
    btns.forEach(btn => {
      // extrai a chave do onclick: selectCategory('xxx')
      const m = btn.getAttribute('onclick')?.match(/'([^']+)'/);
      if (!m) return;
      const key = normKey(m[1]);

      // procura no JSON, normalizando a chave também
      // aceitamos "pizzas" e "Pizzas" e "Pízzás" etc.
      let visivel = true;
      for (const k in configCategorias) {
        if (normKey(k) === key) {
          visivel = Boolean(configCategorias[k]);
          break;
        }
      }

      btn.style.display = visivel ? 'block' : 'none';
    });

    // Carrega configurações de itens desativados (sem cache)
    const configItens = await fetchJsonNoStore(urlItens);

    // Aplica visibilidade dos itens por categoria
    for (const categoria in configItens) {
      const catKey = normKey(categoria);
      const lista = Array.isArray(configItens[categoria]) ? configItens[categoria] : [];
      if (!models[catKey]) continue;

      models[catKey].forEach(model => {
        const modelName = model.path.split('/').pop().replace('.glb', '');
        // normaliza nomes vindos do JSON também
        const estaDesativado = lista.some(n => normKey(n) === normKey(modelName));
        if (estaDesativado) model.visible = false;
      });
    }

  } catch (err) {
    console.warn('⚠️ Falha ao aplicar configuração do restaurante:', err);
  }
}

// ==================== SINCRONIZAÃ‡ÃƒO EM TEMPO REAL ====================
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
      
      // Se o item atual ficou invisÃ­vel, muda para o prÃ³ximo
      if (!visivel && currentModelPath === models[categoria][itemIndex].path) {
        changeModel(1);
      }
      break;
    }
  }
};

// ==================== ATUALIZAÃ‡Ã•ES DE INTERFACE ====================
function formatProductName(path) {
  const file = path.split('/').pop().replace('.glb', '');
  return file.replace(/[_-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function updateUI(model) {
  document.getElementById("productNameDisplay").textContent = formatProductName(model.path);
  document.getElementById("priceDisplay").textContent = `R$ ${model.price.toFixed(2)}`;

  const infoBtn = document.getElementById("infoBtn");
  const priceDisplay = document.getElementById("priceDisplay");

  if (["pizzas", "sobremesas", "bebidas", "carnes"].includes(currentCategory)) {
    infoBtn.style.display = "block";
    priceDisplay.style.display = "block";
  } else {
    infoBtn.style.display = "none";
    priceDisplay.style.display = "none";
    document.getElementById("infoPanel").style.display = "none";
    infoVisible = false;
  }
}

// ==================== CARREGAMENTO DO MODELO 3D ====================
async function loadModel(path) {
  // Verifica se o modelo estÃ¡ visÃ­vel
  const modelData = getCurrentModelData();
  if (modelData && modelData.visible === false) {
    changeModel(1); // Pula para o prÃ³ximo modelo se este estiver invisÃ­vel
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

    // Atualiza o preÃ§o antes de mostrar
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

      // Atualiza o preÃ§o antes de mostrar
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
  const modelData = getCurrentModelData();
  if (!modelData || !modelData.info) return;

  try {
    const response = await fetch(modelData.info + "?v=" + Date.now());
    if (!response.ok) throw new Error("Erro ao buscar JSON");

    const data = await response.json();

    if (data.preco !== undefined) {
      modelData.price = parseFloat(data.preco); // Atualiza o preÃ§o com base no JSON do S3
    }
  } catch (error) {
    console.warn("NÃ£o foi possÃ­vel atualizar o preÃ§o a partir do JSON:", error);
  }
}


function getModelPrice(path) {
  for (let cat in models) {
    for (let model of models[cat]) {
      if (model.path === path) return model.price;
    }
  }
  return 0;
}

// ==================== CONTROLE DE MODELOS ====================
function changeModel(dir) {
  let tentativas = 0;
  const maxTentativas = models[currentCategory].length * 2; // PrevenÃ§Ã£o de loop infinito
  
  do {
    currentIndex = (currentIndex + dir + models[currentCategory].length) % models[currentCategory].length;
    tentativas++;
    
    // Para se encontrou um item visÃ­vel ou excedeu o nÃºmero mÃ¡ximo de tentativas
    if (models[currentCategory][currentIndex].visible !== false || tentativas >= maxTentativas) {
      break;
    }
  } while (true);

  loadModel(models[currentCategory][currentIndex].path);

  const infoPanel = document.getElementById('infoPanel');
  if (infoPanel.style.display === 'block') {
    infoPanel.style.display = 'none';
    infoVisible = false;
  }
}

function selectCategory(category) {
  if (!models[category]) return;
  
  currentCategory = category;
  currentIndex = 0;
  
  // Encontra o primeiro item visÃ­vel na categoria
  while (currentIndex < models[category].length && models[category][currentIndex].visible === false) {
    currentIndex++;
  }
  
  // Se todos estiverem invisÃ­veis, mostra o primeiro (como fallback)
  if (currentIndex >= models[category].length) {
    currentIndex = 0;
  }
  
  loadModel(models[category][currentIndex].path);
}

document.getElementById("menuBtn").addEventListener("click", () => {
  const el = document.getElementById("categoryButtons");
  el.style.display = el.style.display === "flex" ? "none" : "flex";
});

// ==================== INICIALIZAÃ‡ÃƒO ====================
window.addEventListener("DOMContentLoaded", async () => {
  // Inicializa todos os modelos como visÃ­veis por padrÃ£o
  for (const categoria in models) {
    models[categoria].forEach(model => {
      if (model.visible === undefined) {
        model.visible = true;
      }
    });
  }

  await aplicarConfiguracaoDoRestaurante();
  verificarEstadoInicial();
  
  // Carrega o primeiro modelo visÃ­vel
  selectCategory(currentCategory);
});

// ==================== VERIFICAÃ‡ÃƒO POR QR CODE ====================
function verificarEstadoInicial() {
  const urlParams = new URLSearchParams(window.location.search);
  const estadoCodificado = urlParams.get('estado');
  
  if (estadoCodificado) {
    try {
      const estado = JSON.parse(decodeURIComponent(estadoCodificado));
      
      // Aplica configuraÃ§Ãµes de categorias
      if (estado.categorias) {
        document.querySelectorAll('.category-btn').forEach(btn => {
          const categoria = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
          if (estado.categorias[categoria] === false) {
            btn.style.display = 'none';
          }
        });
      }
      
      // Aplica configuraÃ§Ãµes de itens
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

// ==================== ROTAÃ‡ÃƒO AUTOMÃTICA ====================
let rotationInterval = setInterval(() => {
  const model = document.querySelector("#modelContainer");
  if (!model || !model.getAttribute("gltf-model")) return;
  
  const rotation = model.getAttribute("rotation");
  rotation.y = (rotation.y + 0.5) % 360;
  model.setAttribute("rotation", rotation);
}, 30);

// ==================== ZOOM E ROTAÃ‡ÃƒO COM TOQUE ====================
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

// ==================== BOTÃƒO DE INFORMAÃ‡Ã•ES ====================
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

// ==================== LER JSON DE INFORMAÃ‡Ã•ES ====================
async function loadProductInfoJSON(filename, panel) {
  try {
    const modelData = getCurrentModelData();
    if (!modelData || !modelData.info) throw new Error("InformaÃ§Ãµes nÃ£o disponÃ­veis");

    const response = await fetch(modelData.info + "?v=" + Date.now());
    if (!response.ok) throw new Error("Erro ao carregar informaÃ§Ãµes");

    const data = await response.json();

    // Propriedades que NÃƒO queremos exibir
    const ocultar = new Set([ 'preco', 'ultimaAtualizacao' ]);

    // Monta linhas apenas com as chaves permitidas
    const linhas = [];
    for (let key in data) {
      if (ocultar.has(key)) continue;           // pula preco e ultimaAtualizacao
      const textoChave = key
        .replace(/_/g, ' ')                     // opcional: trocar undercores
        .replace(/\b\w/g, l => l.toUpperCase()); // opcional: capitalizar
      linhas.push(`${textoChave}: ${data[key]}`);
    }

    // Junta com duplo \n para separar em parÃ¡grafos
    const textoFormatado = linhas.join('\n\n');
    const infoDiv = document.getElementById("infoContent");
    infoDiv.innerText = textoFormatado;
    panel.style.display = "block";
    infoVisible = true;

  } catch (error) {
    console.error("Erro:", error);
    document.getElementById("infoContent").innerText = "InformaÃ§Ãµes nÃ£o disponÃ­veis";
    panel.style.display = "block";
    infoVisible = true;
  }
}


function getCurrentModelData() {
  for (let cat in models) {
    for (let model of models[cat]) {
      if (model.path === currentModelPath) return model;
    }
  }
  return null;
}

// Normaliza "Porções", "porcoes", "PORÇÕES" -> "porcoes"
function normKey(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/\s+/g, '_'); // espaços -> underscore (se usar)
}

// Usa o "v" do QR para cache-busting consistente entre dispositivos
const __qs = new URLSearchParams(location.search);
const __ver = __qs.get('v') || Date.now().toString();
const __bust = `?v=${encodeURIComponent(__ver)}`;

async function fetchJsonNoStore(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Falha ao carregar ${url}: ${res.status}`);
  return res.json();
}
