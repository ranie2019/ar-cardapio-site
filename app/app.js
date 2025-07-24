// ==================== VARIÁVEIS GLOBAIS ====================
let currentCategory = 'inicio';
let currentIndex = 0;
const modelCache = {};
let currentModelPath = '';
let infoVisible = false;
let pedidos = {}; // chave: nome do produto, valor: quantidade


// ==================== CONFIGURAÇÃO DO RESTAURANTE VIA S3 ====================
async function aplicarConfiguracaoDoRestaurante() {
  const urlCategorias = `https://ar-cardapio-models.s3.amazonaws.com/configuracoes/restaurante-001.json?v=${Date.now()}`;
  const urlItens = `https://ar-cardapio-models.s3.amazonaws.com/configuracoes/restaurante-001-itens.json?v=${Date.now()}`;

  const urlParams = new URLSearchParams(window.location.search);
  const telefoneGarcom = urlParams.get("garcom"); // ex: 11947329140

  const urlParams = new URLSearchParams(window.location.search);
  const telefoneGarcom = urlParams.get("garcom"); // ex: 11947329140

  try {
    // Carrega configurações de categorias
    const responseCategorias = await fetch(urlCategorias);
    if (!responseCategorias.ok) throw new Error('Erro ao carregar configuração de categorias');
    const configCategorias = await responseCategorias.json();

    // Aplica visibilidade das categorias
    for (const categoria in configCategorias) {
      const visivel = configCategorias[categoria];
      const botao = document.querySelector(`.category-btn[onclick*="${categoria}"]`);
      if (botao) {
        botao.style.display = visivel ? 'block' : 'none';
      }
    }

    // Carrega configurações de itens desativados
    const responseItens = await fetch(urlItens);
    if (!responseItens.ok) throw new Error('Erro ao carregar configuração de itens');
    const configItens = await responseItens.json();

    // Aplica visibilidade dos itens
    for (const categoria in configItens) {
      if (models[categoria]) {
        models[categoria].forEach(model => {
          const modelName = model.path.split('/').pop().replace('.glb', '');
          if (configItens[categoria].includes(modelName)) {
            model.visible = false;
          }
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
  // Verifica se o modelo está visível
  const modelData = getCurrentModelData();
  if (modelData && modelData.visible === false) {
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

    // Atualiza o preço antes de mostrar
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

      // Atualiza o preço antes de mostrar
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
      modelData.price = parseFloat(data.preco); // Atualiza o preço com base no JSON do S3
    }
  } catch (error) {
    console.warn("Não foi possível atualizar o preço a partir do JSON:", error);
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
  const maxTentativas = models[currentCategory].length * 2; // Prevenção de loop infinito
  
  do {
    currentIndex = (currentIndex + dir + models[currentCategory].length) % models[currentCategory].length;
    tentativas++;
    
    // Para se encontrou um item visível ou excedeu o número máximo de tentativas
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
  
  // Carrega o primeiro modelo visível
  selectCategory(currentCategory);
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
      
      // Aplica configurações de itens
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

    // Junta com duplo \n para separar em parágrafos
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
  for (let cat in models) {
    for (let model of models[cat]) {
      if (model.path === currentModelPath) return model;
    }
  }
  return null;
}

// ==================== EVENTOS PARA BOTÃO "ESCOLHER" ====================
document.getElementById('escolherBtn').addEventListener('click', () => {
  const modal = document.getElementById('modalEscolha');
  const nomeProduto = formatProductName(currentModelPath);
  modal.querySelector('.produto-nome').textContent = nomeProduto;
  modal.querySelector('.quantidade').textContent = '1';
  modal.style.display = 'flex';
});

document.querySelector('#modalEscolha .mais').addEventListener('click', () => {
  const quantidadeEl = document.querySelector('#modalEscolha .quantidade');
  let qtd = parseInt(quantidadeEl.textContent);
  quantidadeEl.textContent = qtd + 1;
});

document.querySelector('#modalEscolha .menos').addEventListener('click', () => {
  const quantidadeEl = document.querySelector('#modalEscolha .quantidade');
  let qtd = parseInt(quantidadeEl.textContent);
  if (qtd > 1) quantidadeEl.textContent = qtd - 1;
});

document.querySelector('#modalEscolha .fechar').addEventListener('click', () => {
  document.getElementById('modalEscolha').style.display = 'none';
});

document.querySelector('#modalEscolha .ok').addEventListener('click', () => {
  const nome = document.querySelector('#modalEscolha .produto-nome').textContent;
  const qtd = parseInt(document.querySelector('#modalEscolha .quantidade').textContent);
  pedidos[nome] = (pedidos[nome] || 0) + qtd;
  document.getElementById('modalEscolha').style.display = 'none';
});

// ==================== EVENTOS PARA BOTÃO "FINALIZAR" ====================
document.getElementById('finalizarBtn').addEventListener('click', () => {
  const modal = document.getElementById('modalResumo');
  const lista = modal.querySelector('.lista-pedidos');
  lista.innerHTML = '';

  if (Object.keys(pedidos).length === 0) {
    lista.innerHTML = '<p style="text-align:center; color:gray;">Nenhum pedido.</p>';
  } else {
    for (const nome in pedidos) {
      const item = document.createElement('div');
      item.textContent = `${pedidos[nome]}x ${nome}`;
      lista.appendChild(item);
    }
  }

  modal.style.display = 'flex';
});

document.querySelector('#modalResumo .fechar-finalizar').addEventListener('click', () => {
  pedidos = {}; // limpa todos os pedidos
  document.getElementById('modalResumo').style.display = 'none';
});


document.querySelector('#modalResumo .ok-finalizar').addEventListener('click', () => {
  alert('Pedido finalizado com sucesso!');
  pedidos = {}; // limpa os pedidos
  document.getElementById('modalResumo').style.display = 'none';
});

async function enviarPedidoParaTelegram(resumoTexto) {
  const tokenBot = "SEU_TOKEN_DO_BOT";
  const telefone = telefoneGarcom;

  if (!telefone) {
    console.warn("Telefone do garçom não disponível.");
    return;
  }

  // Construa a mensagem
  const mensagem = `🛎️ *Novo Pedido*\n\n${resumoTexto}`;

  // Opcional: mapeie telefone para chat_id manualmente
  const chatIds = {
    "11947329140": 1234567890,  // exemplo: telefone → chat_id
    // adicione outros garçons aqui
  };

  const chatId = chatIds[telefone];
  if (!chatId) {
    console.warn("Chat ID do garçom não encontrado.");
    return;
  }

  const url = `https://api.telegram.org/bot${tokenBot}/sendMessage`;

  const body = {
    chat_id: chatId,
    text: mensagem,
    parse_mode: "Markdown"
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!data.ok) throw new Error("Erro ao enviar mensagem: " + data.description);

    console.log("✅ Pedido enviado com sucesso para o Telegram.");
  } catch (err) {
    console.error("❌ Falha ao enviar pedido para Telegram:", err);
  }
}
