// ==============================
// home3.js - Sincronização, QR Code e Sistema Principal
// ==============================

/* ==============================
   QR LOGO (FORA DA CLASS)
   ============================== */
const LOGO_URL = "https://site-arcardapio.s3.us-east-1.amazonaws.com/imagens/logoqr.png";

function aplicarLogoNoCentro(qrDiv) {
  if (!qrDiv) return;

  // evita duplicar logo ao regenerar
  const old = qrDiv.querySelector(".qr-logo");
  if (old) old.remove();

  // garante que o container do QR é "ancora" pro absolute
  qrDiv.style.position = "relative";

  const img = document.createElement("img");
  img.className = "qr-logo";
  img.src = LOGO_URL;
  img.alt = "Logo";
  img.decoding = "async";
  img.loading = "eager";
  img.referrerPolicy = "no-referrer";

  // estilo inline pra funcionar mesmo sem mexer no CSS
  img.style.position = "absolute";
  img.style.left = "50%";
  img.style.top = "50%";
  img.style.transform = "translate(-50%, -50%)";
  img.style.width = "44px";     // ajuste aqui (40~60 costuma ficar bom)
  img.style.height = "44px";
  img.style.borderRadius = "10px";
  img.style.background = "#fff";
  img.style.padding = "6px";
  img.style.boxSizing = "border-box";
  img.style.zIndex = "5";

  qrDiv.appendChild(img);
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

        // limpa caso regenere
        qrDiv.innerHTML = "";

        new QRCode(qrDiv, {
          text: url,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H,
        });

        // aplica logo por cima
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