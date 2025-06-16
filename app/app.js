// ==================== VARIÁVEIS GLOBAIS ====================
let currentCategory = 'inicio';
let currentIndex = 0;
const modelCache = {};
let currentModelPath = '';
let infoVisible = false;


// ==================== ATUALIZAÇÕES DE INTERFACE ====================

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

function loadModel(path) {
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

    xhr.onload = () => {
      const blobURL = URL.createObjectURL(xhr.response);
      modelCache[path] = blobURL;
      container.setAttribute("gltf-model", blobURL);
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
  const lista = models[currentCategory];
  currentIndex = (currentIndex + dir + lista.length) % lista.length;
  loadModel(lista[currentIndex].path);

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
  loadModel(models[category][0].path);
}

document.getElementById("menuBtn").addEventListener("click", () => {
  const el = document.getElementById("categoryButtons");
  el.style.display = el.style.display === "flex" ? "none" : "flex";
});

window.addEventListener("DOMContentLoaded", () => {
  loadModel(models[currentCategory][0].path);
});


// ==================== ROTAÇÃO AUTOMÁTICA ====================

setInterval(() => {
  const model = document.querySelector("#modelContainer");
  if (!model) return;
  const rotation = model.getAttribute("rotation");
  rotation.y += 0.5;
  model.setAttribute("rotation", rotation);
}, 30);


// ==================== ZOOM COM DOIS DEDOS ====================

let initialDistance = null;
let initialScale = 1;

function updateScale(scaleFactor) {
  const model = document.querySelector("#modelContainer");
  const newScale = Math.min(Math.max(initialScale * scaleFactor, 0.1), 10);
  model.setAttribute("scale", `${newScale} ${newScale} ${newScale}`);
}

window.addEventListener("touchstart", (e) => {
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    initialDistance = Math.sqrt(dx * dx + dy * dy);
    const scale = document.querySelector("#modelContainer").getAttribute("scale");
    initialScale = scale.x;
  }
});

window.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2 && initialDistance) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    updateScale(currentDistance / initialDistance);
  }
});

window.addEventListener("touchend", () => {
  initialDistance = null;
});


// ==================== ROTAÇÃO VERTICAL COM UM DEDO ====================

let startY = null;
let initialRotationX = 0;

window.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    startY = e.touches[0].clientY;
    const model = document.querySelector("#modelContainer");
    initialRotationX = model.getAttribute("rotation").x;
  }
});

window.addEventListener("touchmove", (e) => {
  if (e.touches.length === 1 && startY !== null) {
    const deltaY = e.touches[0].clientY - startY;
    const model = document.querySelector("#modelContainer");
    const rotation = model.getAttribute("rotation");
    const newX = Math.min(Math.max(initialRotationX - deltaY * 0.2, -90), 90);
    model.setAttribute("rotation", `${newX} ${rotation.y} ${rotation.z}`);
  }
});

window.addEventListener("touchend", () => {
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


// ==================== NOVA FUNÇÃO: LER JSON DE INFORMAÇÕES ====================

async function loadProductInfoJSON(filename, panel) {
  try {
    const modelData = getCurrentModelData();
    if (!modelData || !modelData.info) throw new Error("Informações não disponíveis");

    const response = await fetch(modelData.info + "?v=" + Date.now());
    if (!response.ok) throw new Error("Erro ao carregar informações");

    const data = await response.json();
    let content = "<ul>";

    for (let key in data) {
      content += `<li><strong>${key}:</strong> ${data[key]}</li>`;
    }

    content += "</ul>";
    document.getElementById("infoContent").innerHTML = content;
    panel.style.display = "block";
    infoVisible = true;
  } catch (error) {
    console.error("Erro:", error);
    document.getElementById("infoContent").innerHTML = "Informações não disponíveis";
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


// ==============================
// SINCRONIZAÇÃO DE CATEGORIAS (APP AR)
// ==============================
const canal = new BroadcastChannel('sincronizacao_categorias');

// A. Ouvinte para mensagens do painel admin
canal.onmessage = (event) => {
  const { acao, categoria, desativado } = event.data;
  
  if (acao === 'atualizar_botao') {
    const botaoApp = document.querySelector(`.category-btn[onclick*="selectCategory('${categoria}')"]`);
    
    if (botaoApp) {
      // 1. Atualiza visibilidade
      botaoApp.style.display = desativado ? 'none' : 'block';
      
      // 2. Redireciona se a categoria ativa foi desativada
      if (currentCategory === categoria && desativado) {
        const primeiraCategoriaVisivel = document.querySelector('.category-btn[style*="block"], .category-btn:not([style])');
        if (primeiraCategoriaVisivel) {
          const novaCategoria = primeiraCategoriaVisivel.getAttribute('onclick').match(/'([^']+)'/)[1];
          selectCategory(novaCategoria);
        } else {
          selectCategory('inicio');
        }
      }
    }
  }
};

// B. Sincronização inicial ao carregar
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.category-btn').forEach(btn => {
    const categoria = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
    const estaDesativado = localStorage.getItem(`btnEstado_${categoria}`) === 'true';
    
    // Esconde botões desativados
    if (estaDesativado) {
      btn.style.display = 'none';
      
      // Força sincronização se o app iniciar com categoria inválida
      if (currentCategory === categoria) {
        selectCategory('inicio');
      }
    }
  });
});