// ==================== VARIÁVEIS GLOBAIS ====================
let currentCategory = 'inicio'; // Categoria inicial
let currentIndex = 0; // Índice do modelo dentro da categoria
const modelCache = {}; // Cache para armazenar modelos GLB carregados
let currentModelPath = ''; // Armazena o caminho do modelo atual
let infoVisible = false; // Estado do painel de informações


// ==================== ATUALIZAÇÕES DE INTERFACE ====================

/**
 * Formata o nome do produto a partir do path do modelo GLB.
 * Exemplo: "models/pizzas/pizza_calabresa.glb" -> "Pizza Calabresa"
 */
function formatProductName(path) {
  const file = path.split('/').pop().replace('.glb', '');
  return file
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Atualiza o nome e preço do produto atual na interface.
 */
function updateUI(model) {
  document.getElementById("productNameDisplay").textContent = formatProductName(model.path);
  document.getElementById("priceDisplay").textContent = `R$ ${model.price.toFixed(2)}`;

  const infoBtn = document.getElementById("infoBtn");
  const priceDisplay = document.getElementById("priceDisplay");

  if (["pizzas", "sobremesas", "bebidas", "carnes"].includes(currentCategory)) {
    infoBtn.style.display = "block";
    priceDisplay.style.display = "block";  // Mostra o preço
  } else {
    infoBtn.style.display = "none";
    priceDisplay.style.display = "none";   // Oculta o preço
    document.getElementById("infoPanel").style.display = "none";
    infoVisible = false;
  }
}



// ==================== CARREGAMENTO DE MODELO ====================

/* Carrega o modelo 3D e atualiza a interface.*/
function loadModel(path) {
  // Obtém o elemento A-Frame onde o modelo será exibido
  const container = document.querySelector("#modelContainer");

  // Obtém o elemento que mostra o status de carregamento
  const loadingIndicator = document.getElementById("loadingIndicator");

  // Mostra o indicador de carregamento com a mensagem "Carregando..."
  loadingIndicator.style.display = "block";
  loadingIndicator.innerText = "Carregando...";

  // Remove qualquer modelo anterior carregado no container
  container.removeAttribute("gltf-model");

  // Define rotação, posição e escala padrão para o modelo que será carregado
  container.setAttribute("rotation", "0 180 0");
  container.setAttribute("position", "0 -.6 0");
  container.setAttribute("scale", "1 1 1");

  // Salva o caminho do modelo atual em uma variável global
  currentModelPath = path;

  // Se o modelo já estiver no cache, carrega a versão em cache imediatamente
  if (modelCache[path]) {
    container.setAttribute("gltf-model", modelCache[path]); // Aponta o modelo usando o blob já salvo
    loadingIndicator.style.display = "none"; // Esconde o carregando
    updateUI({ path, price: getModelPrice(path) }); // Atualiza interface (ex: preço, nome, etc.)
  } else {
    // Se não estiver no cache, inicia o carregamento do modelo usando XMLHttpRequest
    const xhr = new XMLHttpRequest();

    // Define o método GET e adiciona um parâmetro de versão para forçar o navegador a não usar cache
    xhr.open("GET", path + "?v=" + Date.now(), true);
    xhr.responseType = "blob"; // Define que a resposta será um arquivo binário

    // Enquanto o modelo carrega, atualiza a porcentagem no indicador
    xhr.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100); // Calcula porcentagem
        loadingIndicator.innerText = `${percent}%`; // Mostra no carregador
      }
    };

    // Quando o carregamento terminar com sucesso
    xhr.onload = () => {
      const blobURL = URL.createObjectURL(xhr.response); // Cria uma URL temporária para o blob
      modelCache[path] = blobURL; // Salva no cache para uso futuro
      container.setAttribute("gltf-model", blobURL); // Aponta o modelo 3D no container
      loadingIndicator.style.display = "none"; // Esconde o carregador
      updateUI({ path, price: getModelPrice(path) }); // Atualiza informações na UI
    };

    // Se ocorrer erro no carregamento, exibe mensagem de erro
    xhr.onerror = () => {
      console.error("Erro ao carregar o modelo:", path); // Log no console
      loadingIndicator.innerText = "Erro ao carregar o modelo"; // Mensagem na interface
    };

    // Envia a requisição
    xhr.send();
  }
}

// ==================== CONTROLE DE MODELOS ====================

function changeModel(dir) {
  // Pega a lista de modelos da categoria atual
  const lista = models[currentCategory];

  // Atualiza o índice atual com base na direção (dir: 1 para próximo, -1 para anterior)
  // A lógica com módulo (%) permite circular: se passar do final, volta para o início
  currentIndex = (currentIndex + dir + lista.length) % lista.length;

  // Carrega o modelo correspondente ao novo índice
  loadModel(lista[currentIndex].path);

  // Fecha o painel de informações, se estiver aberto
  const infoPanel = document.getElementById('infoPanel');
  if (infoPanel.style.display === 'block') {
    infoPanel.style.display = 'none'; // Esconde o painel
    infoVisible = false;              // Atualiza estado para refletir que o painel está fechado
  }
}
// Troca a categoria atual dos modelos 3D exibidos
function selectCategory(category) {
  if (!models[category]) return; // Verifica se a categoria existe no objeto 'models'. Se não existir, encerra a função.
  currentCategory = category;    // Atualiza a categoria atual com a nova selecionada
  currentIndex = 0;              // Reinicia o índice para exibir o primeiro modelo da nova categoria
  loadModel(models[category][0].path); // Carrega o modelo 3D correspondente ao primeiro item da nova categoria
}

// Mostra ou esconde os botões de categoria dinamicamente ao clicar no botão de menu
document.getElementById("menuBtn").addEventListener("click", () => {
  const el = document.getElementById("categoryButtons");   // Pega o container dos botões de categori
  el.style.display = el.style.display === "flex" ? "none" : "flex"; // Alterna entre mostrar e esconder os botões de categoria
});

// Quando o conteúdo HTML da página estiver totalmente carregado, exibe o primeiro modelo da categoria atual
window.addEventListener("DOMContentLoaded", () => {
  loadModel(models[currentCategory][0].path); // Garante que o primeiro modelo da categoria seja carregado automaticamente ao abrir a página
});

// ==================== ROTAÇÃO AUTOMÁTICA ====================
setInterval(() => {
  const model = document.querySelector("#modelContainer");
  if (!model) return;
  const rotation = model.getAttribute("rotation");
  rotation.y += 0.5;
  model.setAttribute("rotation", rotation);
}, 30);


// ==================== ZOOM COM PINÇA ====================
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
    const scaleFactor = currentDistance / initialDistance;
    updateScale(scaleFactor);
  }
});

window.addEventListener("touchend", () => {
  initialDistance = null;
});


// ==================== ROTAÇÃO VERTICAL ====================
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


// ==================== BOTÃO DE INFORMAÇÕES (POPUP LIGA/DESLIGA) ====================

document.getElementById("infoBtn").addEventListener("click", () => {
  const panel = document.getElementById("infoPanel");

  if (infoVisible) {
    panel.style.display = "none";
    infoVisible = false;
    return;
  }

  if (!currentModelPath) return;

  const filename = currentModelPath.split('/').pop().replace('.glb', '');
  const infoPath = `informacao/${filename}.txt`; // <- Corrigido o nome da pasta

  fetch(infoPath)
    .then(response => {
      if (!response.ok) throw new Error('Arquivo não encontrado');
      return response.text();
    })
    .then(data => {
      panel.innerText = data;
      panel.style.display = "block";
      infoVisible = true;
    })
    .catch(err => {
      console.error("Erro ao carregar info:", err);
      panel.innerText = "Informações não disponíveis.";
      panel.style.display = "block";
      infoVisible = true;
    });
});