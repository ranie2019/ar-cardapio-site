// ==============================
// home3.js - Sincronização, QR Code e Sistema Principal
// + Botão lápis ao lado do nome (sem mexer na lógica do clique)
// + Salva nomes por usuário em: informacao/<email>/nomes.json
// ==============================

/* ==============================
   QR LOGO (FORA DA CLASS)
   ============================== */
const LOGO_URL = "https://site-arcardapio.s3.us-east-1.amazonaws.com/imagens/logoqr.png";

function aplicarLogoNoCentro(qrDiv) {
  if (!qrDiv) return;

  const old = qrDiv.querySelector(".qr-logo");
  if (old) old.remove();

  qrDiv.style.position = "relative";

  const img = document.createElement("img");
  img.className = "qr-logo";
  img.src = LOGO_URL;
  img.alt = "Logo";
  img.decoding = "async";
  img.loading = "eager";
  img.referrerPolicy = "no-referrer";

  img.style.position = "absolute";
  img.style.left = "50%";
  img.style.top = "50%";
  img.style.transform = "translate(-50%, -50%)";
  img.style.width = "44px";
  img.style.height = "44px";
  img.style.borderRadius = "10px";
  img.style.background = "#fff";
  img.style.padding = "6px";
  img.style.boxSizing = "border-box";
  img.style.zIndex = "5";

  qrDiv.appendChild(img);
}

/* ==============================
   HELPERS (rename)
   ============================== */
function emailToFolder(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function isConfigText(txt) {
  const t = String(txt || "").trim().toLowerCase();
  return t === "configuração" || t === "configuracao";
}

/* ==============================
   SISTEMA
   ============================== */
class SistemaCardapio extends SistemaCardapioItens {
  constructor() {
    super();

    this.setupQrCode();
    this.configurarSincronizacao();
    this.carregarConfiguracoesIniciais();

    // ✅ RENOMEAR (lápis)
    this.nomesMap = {};
    this.ARQUIVO_CONFIG_NOMES = this._resolverArquivoNomes();
    this._renameObserver = null;

    // expõe helper global (se quiser usar de fora)
    window.salvarNomePersonalizado = (nomePadrao, novoNome) =>
      this.salvarNomePersonalizado(nomePadrao, novoNome);

    this.setupRenomearUI();
  }

  _resolverArquivoNomes() {
    // tenta derivar da URL que você já usa (mais confiável)
    try {
      if (this.ARQUIVO_CONFIG_ITENS && String(this.ARQUIVO_CONFIG_ITENS).includes("itens.json")) {
        return String(this.ARQUIVO_CONFIG_ITENS).replace(/itens\.json(\?.*)?$/i, "nomes.json");
      }
      if (this.ARQUIVO_CONFIG_CATEGORIAS && String(this.ARQUIVO_CONFIG_CATEGORIAS).includes("config.json")) {
        return String(this.ARQUIVO_CONFIG_CATEGORIAS).replace(/config\.json(\?.*)?$/i, "nomes.json");
      }
    } catch (_) {}

    // fallback: monta pelo padrão do bucket informacao/<email>/
    const email = (localStorage.getItem("ar.email") || "").trim().toLowerCase();
    const folder = emailToFolder(email);
    return `https://ar-cardapio-models.s3.amazonaws.com/informacao/${folder}/nomes.json`;
  }

  // ==============================
  // 6. SINCRONIZAÇÃO COM O APP AR
  // ==============================
  configurarSincronizacao() {
    this.canalStatus.onmessage = (evento) => {
      const { nome, visivel } = evento.data;
      const elemento = document.querySelector(`[data-nome="${this.nomeParaSlug(nome)}"]`);
      if (!elemento) return;
      elemento.style.display = visivel ? "" : "none";
    };
  }

  // ==============================
  // 7. CATEGORIAS E ITENS → S3
  // ==============================
  async salvarConfiguracaoNoS3() {
    // 1. Categorias
    const botoesCategoria = document.querySelectorAll("#dropdownCardapio button[data-categoria]");
    const configuracoesCategoria = {};
    botoesCategoria.forEach((botao) => {
      const categoria = botao.getAttribute("data-categoria");
      configuracoesCategoria[categoria] = !botao.classList.contains("desativado");
    });

    try {
      const r = await fetch(this.ARQUIVO_CONFIG_CATEGORIAS, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-amz-acl": "bucket-owner-full-control",
        },
        body: JSON.stringify(configuracoesCategoria),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`Falha ao salvar categorias (${r.status}) ${t}`);
      }
    } catch (erro) {
      console.error("Erro ao salvar configurações de categoria:", erro);
      alert("Falha ao salvar categorias: " + erro.message);
    }

    // 2. Itens desativados
    const itensDesativados = {};
    Object.keys(objetos3D).forEach((categoria) => {
      objetos3D[categoria].forEach((nomeItem) => {
        const chaveLocal = this.gerarChaveItem(categoria, nomeItem);
        if (localStorage.getItem(chaveLocal) === "true") {
          if (!itensDesativados[categoria]) itensDesativados[categoria] = [];
          itensDesativados[categoria].push(this.nomeParaSlug(nomeItem));
        }
      });
    });

    try {
      const r2 = await fetch(this.ARQUIVO_CONFIG_ITENS, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-amz-acl": "bucket-owner-full-control",
        },
        body: JSON.stringify(itensDesativados),
      });
      if (!r2.ok) {
        const t2 = await r2.text().catch(() => "");
        throw new Error(`Falha ao salvar itens (${r2.status}) ${t2}`);
      }
    } catch (erro) {
      console.error("Erro ao salvar itens desativados:", erro);
      alert("Falha ao salvar itens desativados: " + erro.message);
    }
  }

  // ==============================
  // 8. CARREGAMENTO INICIAL
  // ==============================
  async carregarConfiguracoesIniciais() {
    this.garantirBotoesCategoriasVisiveis();

    try {
      await this.carregarConfiguracoesSalvas();
    } catch (erro) {
      console.error("Erro ao carregar configurações iniciais:", erro);
    }
  }

  garantirBotoesCategoriasVisiveis() {
    const botoesCategoria = document.querySelectorAll("#dropdownCardapio .btn-categoria");

    if (botoesCategoria.length === 0) {
      this.criarBotoesCategoriaPadrao();
      return;
    }

    botoesCategoria.forEach((botao) => {
      const categoria = botao.getAttribute("data-categoria");
      if (categoria) {
        botao.style.display = "";
        botao.classList.remove("hidden");
      }
    });
  }

  criarBotoesCategoriaPadrao() {
    const dropdown = document.getElementById("dropdownCardapio");
    if (!dropdown) return;

    const categoriasPadrao = ["logo", "bebidas", "carnes", "pizzas", "lanches", "sobremesas", "porcoes", "diversos"];
    const nomesCategorias = {
      logo: "Logo",
      bebidas: "Bebidas",
      carnes: "Carnes",
      pizzas: "Pizzas",
      lanches: "Lanches",
      sobremesas: "Sobremesas",
      porcoes: "Porções",
      diversos: "Diversos",
    };

    categoriasPadrao.forEach((categoria) => {
      const botao = document.createElement("button");
      botao.className = "btn-categoria";
      botao.setAttribute("data-categoria", categoria);
      botao.textContent = nomesCategorias[categoria] || categoria;
      dropdown.appendChild(botao);
    });
  }

  async carregarConfiguracoesSalvas() {
    try {
      const respostaCategorias = await fetch(`${this.ARQUIVO_CONFIG_CATEGORIAS}?v=${Date.now()}`);
      if (respostaCategorias.ok) {
        const categorias = await respostaCategorias.json();
        Object.entries(categorias).forEach(([categoria, visivel]) => {
          const botao = document.querySelector(`#dropdownCardapio button[data-categoria="${categoria}"]`);
          if (botao && !visivel) {
            botao.classList.add("desativado");
            localStorage.setItem(`btnEstado_${categoria}`, "true");
          }
        });
      }

      const respostaItens = await fetch(`${this.ARQUIVO_CONFIG_ITENS}?v=${Date.now()}`);
      if (respostaItens.ok) {
        const itensDesativados = await respostaItens.json();
        Object.entries(itensDesativados).forEach(([categoria, itens]) => {
          itens.forEach((nomeItemSlug) => {
            const nomeNormalizado = nomeItemSlug.replace(/_/g, " ").toLowerCase();
            const chave = this.gerarChaveItem(categoria, nomeNormalizado);
            localStorage.setItem(chave, "true");
          });
        });
      }
    } catch (erro) {
      console.log("Configurações não encontradas - usando padrões:", erro.message);
    }

    // ✅ nomes personalizados (se existir)
    await this.carregarNomesPersonalizados();
    this.aplicarNomesNaTela();
  }

  /* ==============================
     NOMES PERSONALIZADOS (S3)
     ============================== */
  async carregarNomesPersonalizados() {
    this.nomesMap = {};
    try {
      const r = await fetch(`${this.ARQUIVO_CONFIG_NOMES}?v=${Date.now()}`);
      if (!r.ok) return;
      const data = await r.json();
      if (data && typeof data === "object") this.nomesMap = data;
    } catch (_) {
      // se não existe ainda, tudo bem
    }
  }

  async salvarNomesNoS3() {
    try {
      const r = await fetch(this.ARQUIVO_CONFIG_NOMES, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-amz-acl": "bucket-owner-full-control",
        },
        body: JSON.stringify(this.nomesMap || {}),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        Holden;
        throw new Error(`Falha ao salvar nomes (${r.status}) ${t}`);
      }
    } catch (err) {
      console.error("Erro ao salvar nomes:", err);
      alert("Falha ao salvar nome do produto: " + err.message);
    }
  }

  async salvarNomePersonalizado(nomePadrao, novoNome) {
    const base = String(nomePadrao || "").trim();
    const novo = String(novoNome || "").trim();
    if (!base || !novo) return;

    const slug = this.nomeParaSlug(base);
    this.nomesMap = this.nomesMap || {};
    this.nomesMap[slug] = novo;

    await this.salvarNomesNoS3();
    this.aplicarNomesNaTela();
  }

  /* ==============================
     LÁPIS AO LADO (SEM BOTÃO DENTRO DE BOTÃO)
     Decorar os elementos reais: [data-nome]
     ============================== */
  setupRenomearUI() {
    const run = () => this._decorarTodosItensComLapis();

    run();

    // observa o DOM porque a lista muda por categoria
    if (this._renameObserver) this._renameObserver.disconnect();
    this._renameObserver = new MutationObserver(() => run());
    this._renameObserver.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("load", () => run());
  }

  _decorarTodosItensComLapis() {
    const itens = document.querySelectorAll("[data-nome]");
    if (!itens || !itens.length) return;

    itens.forEach((el) => this._decorarItemComLapis(el));
  }

  _decorarItemComLapis(nameBtn) {
  if (!nameBtn) return;

  // já pronto no formato correto
  if (nameBtn.closest(".itemBlock")) return;

  // evita mexer em coisas fora do painel
  if (nameBtn.closest("#dropdownCardapio")) return;
  if (nameBtn.closest("#dropdownPerfil")) return;

  const txt = (nameBtn.textContent || "").trim();
  if (!txt) return;
  if (isConfigText(txt)) return;

  // pega o botão Configuração que vinha logo abaixo/ao lado no DOM original
  const configBtn = nameBtn.nextElementSibling;
  const temConfig = !!(configBtn && configBtn.tagName === "BUTTON" && isConfigText(configBtn.textContent));

  // guarda nome original (chave)
  if (!nameBtn.dataset.defaultName) nameBtn.dataset.defaultName = txt;
  const nomePadrao = nameBtn.dataset.defaultName;

  // aplica nome salvo (sem mudar data-nome)
  const slug = this.nomeParaSlug(nomePadrao);
  const nomeCustom = this.nomesMap?.[slug];
  if (nomeCustom) nameBtn.textContent = nomeCustom;

  // ====== cria BLOCO (mantém layout original: nome em cima e config embaixo) ======
  const block = document.createElement("div");
  block.className = "itemBlock";
  block.style.display = "inline-block";
  block.style.verticalAlign = "top";

  const topRow = document.createElement("div");
  topRow.className = "itemTopRow";
  topRow.style.display = "inline-flex";
  topRow.style.alignItems = "center";
  topRow.style.gap = "8px";
  topRow.style.width = "fit-content";

  // botão lápis
  const pencilBtn = document.createElement("button");
  pencilBtn.type = "button";
  pencilBtn.className = "editNameBtn";
  pencilBtn.title = "Editar nome";
  pencilBtn.setAttribute("aria-label", "Editar nome");
  pencilBtn.textContent = "✎";

  // herda visual do botão do nome
  try {
    const cs = getComputedStyle(nameBtn);
    pencilBtn.style.background = cs.backgroundColor;
    pencilBtn.style.color = cs.color;
    pencilBtn.style.boxShadow = cs.boxShadow;
  } catch (_) {}

  // não deixa o lápis disparar o clique do item
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  pencilBtn.addEventListener("pointerdown", stop, true);
  pencilBtn.addEventListener("click", async (e) => {
    stop(e);

    const atual = String(nameBtn.textContent || nomePadrao).trim();
    const novo = prompt("Novo nome do produto:", atual);
    if (novo == null) return;

    const clean = novo.trim();
    if (!clean) return;

    nameBtn.textContent = clean;
    await this.salvarNomePersonalizado(nomePadrao, clean);
  }, true);

  // ====== injeta no DOM sem quebrar listeners ======
  const parent = nameBtn.parentNode;
  if (!parent) return;

  parent.insertBefore(block, nameBtn);

  // linha de cima
  block.appendChild(topRow);
  topRow.appendChild(nameBtn);       // move o botão original (com listeners)
  topRow.appendChild(pencilBtn);     // lápis ao lado

  // linha de baixo: Configuração (igual era antes)
  if (temConfig) {
    configBtn.style.display = "block";   // força ficar embaixo dentro do bloco
    configBtn.style.marginTop = "6px";
    block.appendChild(configBtn);        // move o botão original (com listeners)
  }

  // marca
  nameBtn.dataset.renameReady = "1";
}


  // ==============================
  // 9. GERADOR DE QR CODE (Usando /qr/resolve) + LOGO NO CENTRO
  // ==============================
  setupQrCode() {
    const modalQR = document.getElementById("modalQrCode");
    const containerQR = document.getElementById("qrcodeContainer");
    const botaoFechar = modalQR?.querySelector(".fechar-modal");
    const inputQuantidade = document.getElementById("qtdQr");
    const botaoMais = document.getElementById("aumentarQr");
    const botaoMenos = document.getElementById("diminuirQr");
    const botaoImprimir = document.getElementById("imprimirQr");
    const botaoGerarQR = document.getElementById("btnGerarQR");

    if (!modalQR || !containerQR || !inputQuantidade || !botaoMais || !botaoMenos || !botaoImprimir || !botaoGerarQR) {
      console.error("Elementos do QR Code não encontrados.");
      return;
    }

    const API_QR_RESOLVE = "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/qr/resolve";

    const gerarQRCodes = (quantidade) => {
      const email = (localStorage.getItem("ar.email") || "").trim().toLowerCase();
      if (!email) {
        alert("Não foi possível identificar o e-mail do cliente (ar.email). Faça login novamente.");
        return;
      }

      containerQR.innerHTML = "";
      const frag = document.createDocumentFragment();

      for (let i = 1; i <= quantidade; i++) {
        const wrapper = document.createElement("div");
        wrapper.className = "qrcode-wrapper";

        const divQR = document.createElement("div");
        divQR.className = "qrcode";
        divQR.id = `qr-${i}`;

        const label = document.createElement("div");
        label.className = "mesa-label";
        label.textContent = `Mesa ${i}`;

        wrapper.appendChild(divQR);
        wrapper.appendChild(label);
        frag.appendChild(wrapper);
      }

      containerQR.appendChild(frag);

      for (let i = 1; i <= quantidade; i++) {
        const mesaId = `mesa${i}`;
        const url = `${API_QR_RESOLVE}?u=${encodeURIComponent(email)}&i=${encodeURIComponent(mesaId)}&t=${Date.now()}`;

        const qrDiv = document.getElementById(`qr-${i}`);
        if (!qrDiv) continue;

        qrDiv.innerHTML = "";

        new QRCode(qrDiv, {
          text: url,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H,
        });

        aplicarLogoNoCentro(qrDiv);
      }
    };

    const atualizarQRCodes = () => {
      let quantidade = parseInt(inputQuantidade.value, 10) || 1;
      if (quantidade < 1) quantidade = 1;
      if (quantidade > 200) quantidade = 200;
      inputQuantidade.value = quantidade;
      gerarQRCodes(quantidade);
    };

    botaoGerarQR.addEventListener("click", () => {
      atualizarQRCodes();
      modalQR.classList.add("ativo");
    });

    inputQuantidade.addEventListener("input", atualizarQRCodes);

    botaoMais.addEventListener("click", () => {
      inputQuantidade.value = (parseInt(inputQuantidade.value, 10) || 1) + 1;
      inputQuantidade.dispatchEvent(new Event("input"));
    });

    botaoMenos.addEventListener("click", () => {
      inputQuantidade.value = Math.max(1, (parseInt(inputQuantidade.value, 10) || 1) - 1);
      inputQuantidade.dispatchEvent(new Event("input"));
    });

    botaoFechar?.addEventListener("click", () => {
      modalQR.classList.remove("ativo");
      containerQR.innerHTML = "";
    });

    modalQR.addEventListener("click", (evento) => {
      if (evento.target === modalQR) {
        modalQR.classList.remove("ativo");
        containerQR.innerHTML = "";
      }
    });

    botaoImprimir.addEventListener("click", () => {
      if (!containerQR.innerHTML.trim()) {
        alert("Gere os QR Codes antes de imprimir.");
        return;
      }

      const janelaImpressao = window.open("", "_blank");
      janelaImpressao.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Imprimir QR Codes</title>
            <style>
              body { margin:0; padding:20px; display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:20px; }
              .qrcode-wrapper { text-align:center; page-break-inside:avoid; }
              .mesa-label { font-weight:bold; margin-top:8px; font-size:16px; }
              .qrcode { position:relative; width:200px; height:200px; margin:0 auto; }
              .qr-logo { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:44px; height:44px; border-radius:10px; background:#fff; padding:6px; box-sizing:border-box; z-index:5; }
              @page { size:auto; margin:10mm; }
            </style>
          </head>
          <body>${containerQR.innerHTML}</body>
        </html>
      `);
      janelaImpressao.document.close();
      janelaImpressao.focus();

      setTimeout(() => {
        janelaImpressao.print();
        janelaImpressao.close();
      }, 500);
    });
  }
}

// Inicializa o sistema quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  const sceneElement =
    document.querySelector("a-scene") ||
    document.getElementById("suaJanela3D") ||
    document.getElementById("scene3D") ||
    document.querySelector(".scene-3d");

  if (sceneElement) {
    sceneElement.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });
  }

  new SistemaCardapio();
});
