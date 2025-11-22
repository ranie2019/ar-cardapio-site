// ==============================
// home2.js - Exibição de Itens, Preview 3D e Configuração
// ==============================
"use strict";

class SistemaCardapioItens extends SistemaCardapioBase {
  constructor() {
    super();
    this._limpezaArrastePreview = null;
    this.itemConfiguracao = null;
    this.previewItemAtual = null;
    this.previewFecharTimeout = null;
  }

  // ==============================
  // EXIBIÇÃO DE ITENS E PREVIEW 3D
  // ==============================
  mostrarItens(categoria) {
    const containerItens = document.getElementById("itensContainer");
    if (!containerItens || !objetos3D[categoria]) return;

    containerItens.innerHTML = "";
    containerItens.style.display = "flex";
    containerItens.classList.toggle("sem-config-logo", categoria === "logo");

    objetos3D[categoria].forEach((nomeItem, indice) => {
      const envoltorioItem = document.createElement("div");
      envoltorioItem.className = "item-wrapper";

      const caixaItem = document.createElement("div");
      caixaItem.className = "item-box";
      caixaItem.textContent = nomeItem;
      caixaItem.setAttribute("data-categoria", categoria);
      caixaItem.setAttribute("data-nome", this.nomeParaSlug(nomeItem));
      caixaItem.style.animationDelay = `${indice * 0.1}s`;

      const chaveEstadoItem = this.gerarChaveItem(categoria, nomeItem);
      if (localStorage.getItem(chaveEstadoItem) === "true") {
        caixaItem.classList.add("desativado");
      }

      // Toggle visibilidade
      caixaItem.addEventListener("click", () => {
        const desativadoAgora = caixaItem.classList.toggle("desativado");
        localStorage.setItem(chaveEstadoItem, desativadoAgora);
        this.salvarConfiguracaoNoS3();
        this.canalStatus.postMessage({ nome: nomeItem, visivel: !desativadoAgora });
      });

      // Preview 3D
      caixaItem.addEventListener("mouseenter", () => {
        if (caixaItem.classList.contains("desativado")) return;
        if (this.previewFecharTimeout) clearTimeout(this.previewFecharTimeout);

        const identificador = `${categoria}/${nomeItem}`;
        if (this.previewItemAtual !== identificador) {
          this.previewItemAtual = identificador;
          this.mostrarPreview3D(caixaItem, categoria, nomeItem);
        }
      });

      caixaItem.addEventListener("mouseleave", () => {
        this.previewFecharTimeout = setTimeout(() => {
          if (!this.modelModal.matches(":hover")) {
            this.modelModal.style.display = "none";
            this.modelModal.innerHTML = "";
            this.previewItemAtual = null;
            if (this._limpezaArrastePreview) {
              this._limpezaArrastePreview();
              this._limpezaArrastePreview = null;
            }
          }
        }, 300);
      });

      // Botão de configuração
      const botaoConfig = document.createElement("button");
      botaoConfig.className = "btn-configurar-produto";
      botaoConfig.textContent = "Configuração";
      botaoConfig.dataset.categoria = categoria;

      if (categoria === "logo") {
        botaoConfig.style.display = "none";
        botaoConfig.setAttribute("aria-hidden", "true");
      }

      botaoConfig.addEventListener("click", (evento) => {
        evento.stopPropagation();
        this.abrirModalConfiguracao(categoria, nomeItem);
      });

      envoltorioItem.appendChild(caixaItem);
      envoltorioItem.appendChild(botaoConfig);
      containerItens.appendChild(envoltorioItem);
    });
  }

  // ==============================
  // PREVIEW 3D
  // ==============================
  async mostrarPreview3D(elementoOrigem, categoria, nomeItem) {
    if (this._limpezaArrastePreview) {
      this._limpezaArrastePreview();
      this._limpezaArrastePreview = null;
    }

    const ret = elementoOrigem.getBoundingClientRect();
    this.modelModal.style.left = `${ret.right + 5}px`;
    this.modelModal.style.top = `${ret.top + 80}px`;
    this.modelModal.style.display = "block";

    this.modelModal.innerHTML = `
      <div style="width:330px;height:300px;background:#1a1a1a;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#00f0c0;">
        <div style="text-align:center;">
          <div style="width:40px;height:40px;border:3px solid #00f0c0;border-top:3px solid transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;"></div>
          <div>Carregando modelo 3D...</div>
        </div>
      </div>
      <style>@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}</style>
    `;

    const nomeArquivoModelo = this.nomeParaArquivo(nomeItem);
    const bases = Array.isArray(this.MODEL_BASE_URLS) ? this.MODEL_BASE_URLS : [];
    const candidatos = bases.map((b) => encodeURI(`${b}/${categoria}/${nomeArquivoModelo}`));
    const urlModelo = candidatos[0] || null;

    if (!urlModelo) {
      this.modelModal.innerHTML = `<div style="width:330px;height:300px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;color:#ff6b6b;">Modelo 3D não encontrado</div>`;
      return;
    }

    this.escalaAtual = 1;
    this.modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled:false" style="width:100%;height:300px;" id="previewScene" background="color:#1a1a1a">
        <a-light type="ambient" intensity="1.2"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>
        <a-entity id="previewRig" position="0 0 -2">
          <a-entity id="previewLift" position="0 0.35 0">
            <a-entity id="previewYaw" rotation="0 0 0">
              <a-entity id="previewPitch" rotation="0 0 0">
                <a-entity id="previewModel"
                  gltf-model="url(${urlModelo})"
                  scale="1 1 1"
                  animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
                </a-entity>
              </a-entity>
            </a-entity>
          </a-entity>
        </a-entity>
        <a-camera position="0 1.6 0" look-controls="enabled:false" wasd-controls="enabled:false"></a-camera>
      </a-scene>
    `;

    this.configurarControlesPreview();
  }

  configurarControlesPreview() {
    const cena = this.modelModal.querySelector("#previewScene");
    // CORREÇÃO: Previne o menu de contexto (clique direito) na cena 3D
    cena.addEventListener("contextmenu", (e) => e.preventDefault());
    const yaw = this.modelModal.querySelector("#previewYaw");
    const pitch = this.modelModal.querySelector("#previewPitch");
    const lift = this.modelModal.querySelector("#previewLift");
    const model = this.modelModal.querySelector("#previewModel");
    if (!cena || !yaw || !pitch || !lift || !model) return;

    let arrastando = false, modo = null;
    let ultimoX = 0, ultimoY = 0;
    let angYaw = 0, angPitch = 0;
    let posY = lift.object3D.position.y || 0;
    let escala = this.escalaAtual || 1;

    const down = (e) => {
      if (e.touches || e.button === 0) modo = "girar";
      else if (e.button === 2) modo = "elevar";
      else return;

      arrastando = true;
      ultimoX = e.clientX || e.touches[0].clientX;
      ultimoY = e.clientY || e.touches[0].clientY;
      cena.classList.add("is-dragging");
      e.preventDefault();
    };
    const move = (e) => {
      if (!arrastando) return;
      const x = e.clientX || e.touches[0].clientX;
      const y = e.clientY || e.touches[0].clientY;
      const dx = x - ultimoX;
      const dy = y - ultimoY;
      ultimoX = x; ultimoY = y;

      if (modo === "girar") {
        angYaw += dx * 0.4;
        angPitch = Math.max(-120, Math.min(120, angPitch - dy * 0.4));
        yaw.setAttribute("rotation", `0 ${angYaw} 0`);
        pitch.setAttribute("rotation", `${angPitch} 0 0`);
      } else if (modo === "elevar") {
        posY = Math.max(-0.3, Math.min(1.8, posY - dy * 0.004));
        lift.setAttribute("position", `0 ${posY} 0`);
      }
    };
    const up = () => { arrastando = false; modo = null; cena.classList.remove("is-dragging"); };
    const scroll = (e) => {
      const f = e.deltaY < 0 ? 1.08 : 1 / 1.08;
      escala = Math.max(0.2, Math.min(3, escala * f));
      this.escalaAtual = escala;
      model.setAttribute("scale", `${escala} ${escala} ${escala}`);
      e.preventDefault();
    };

    cena.addEventListener("mousedown", down);
    cena.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    cena.addEventListener("wheel", scroll, { passive: false });
    cena.addEventListener("touchstart", down, { passive: false });
    cena.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);

    this._limpezaArrastePreview = () => {
      cena.removeEventListener("mousedown", down);
      cena.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cena.removeEventListener("wheel", scroll);
      cena.removeEventListener("touchstart", down);
      cena.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }

  // ==============================
  // MODAL DE CONFIGURAÇÃO
  // ==============================
  async abrirModalConfiguracao(categoria, nomeItem) {
    const slug = this.nomeParaSlug(nomeItem);
    this.itemConfiguracao = `${categoria}/${slug}`;
    const arquivoJson = `${slug}.json`;

    this.modalConfig.querySelector(".modal-titulo").textContent = `Configurar ${nomeItem}`;

    let dadosProduto = { preco: 0, descricao: "" };
    const urlJson = `https://ar-cardapio-models.s3.amazonaws.com/informacao/${this.nomeRestaurante}/${arquivoJson}?v=${Date.now()}`;

    try {
      const resp = await fetch(urlJson);
      if (resp.ok) dadosProduto = await resp.json();
    } catch (e) {
      console.error("Falha ao carregar configuração:", e);
    }

    this.modalConfig.querySelector("#inputValor").value =
      typeof dadosProduto.preco === "number"
        ? dadosProduto.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "0,00";

    this.modalConfig.querySelector("#inputDescricao").value = dadosProduto.descricao || "";
    this.dadosRestaurante[this.itemConfiguracao] = dadosProduto;

    this.modalConfig.style.display = "flex";
  }

  // ==============================
  // SALVAR CONFIGURAÇÃO
  // ==============================
  async salvarConfiguracao(confirmado = false) {
    if (!this.itemConfiguracao || !confirmado) return false;

    try {
      const campoValor = this.modalConfig.querySelector("#inputValor");
      const campoDescricao = this.modalConfig.querySelector("#inputDescricao");
      if (!campoValor || !campoDescricao) throw new Error("Campos de configuração não encontrados.");

      const [categoria, slug] = this.itemConfiguracao.split("/");
      const original = objetos3D[categoria].find((i) => this.nomeParaSlug(i) === slug);

      const preco = parseFloat(campoValor.value.replace(/\./g, "").replace(",", "."));
      if (isNaN(preco)) throw new Error("Valor inválido. Use formato: 0,00");

      const dadosParaSalvar = { preco, descricao: campoDescricao.value, nome: original };

      // --- INÍCIO: EXTRAÇÃO ROBUSTA DE userId (substituir bloco existente) ---
      const token = localStorage.getItem("ar.token");
      console.log("DEBUG: token (ar.token):", token);

      // util: tenta extrair userId de objeto/string
      function extractUserIdFromObj(obj) {
        if (!obj) return null;
        if (typeof obj === "string") {
          try { obj = JSON.parse(obj); } catch (e) { /* string simples */ }
        }
        if (!obj) return null;
        return obj.userId || obj.user_id || obj.id || (obj.user && (obj.user.id || obj.user.userId)) || null;
      }

      // 1) tenta extrair do token JWT (payload)
      let userId = null;
      if (token) {
        try {
          const parts = token.split(".");
          if (parts.length >= 2) {
            const base64Url = parts[1];
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            const jsonPayload = decodeURIComponent(atob(base64).split("").map(function(c) {
              return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(""));
            const payload = JSON.parse(jsonPayload);
            console.log("DEBUG: token payload:", payload);
            userId = payload.sub || extractUserIdFromObj(payload);
          }
        } catch (e) {
          console.warn("DEBUG: falha ao decodificar token JWT:", e);
        }
      }

      // 2) se não encontrou, tenta várias chaves no localStorage
      if (!userId) {
        const candidateKeys = ["ar.userId","ar.user.id","ar.user","userId","user_id","ar.userData","ar.user_data","userEmail","email"];
        for (const k of candidateKeys) {
          const v = localStorage.getItem(k);
          if (!v) continue;
          const extracted = extractUserIdFromObj(v) || (typeof v === "string" ? v : null);
          if (extracted) {
            userId = extracted;
            console.log("DEBUG: userId encontrado em localStorage key:", k, "=>", userId);
            break;
          }
        }
      }

      // 3) final sanity: normalize (ex: email -> formato do S3 se precisar)
      if (userId && typeof userId === "string") {
        // se estiver em formato email, converta para o formato que você usa no S3 se necessário:
        // exemplo: ranie.black29@gmail.com -> ranie-black29-gmail-com
        if (userId.includes("@")) {
          userId = userId.replace(/[@.]/g, "-");
          console.log("DEBUG: userId normalizado (email => s3 key):", userId);
        }
      }

      console.log("DEBUG: userId final:", userId);

      if (!userId) {
        // mensagem de erro clara para o dev — a UI já captura e mostra
        throw new Error("ID do usuário não encontrado. Faça login novamente.");
      }
      // --- FIM: EXTRAÇÃO ROBUSTA DE userId ---


      const contentType = "application/json";

      // Modifique a construção da URL para incluir todos os parâmetros esperados pela Lambda
      const presignEndpoint = `https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/presign?fileName=${encodeURIComponent(slug + ".json")}&contentType=${encodeURIComponent(contentType)}&userId=${encodeURIComponent(userId)}`;
      console.log("Solicitando presign:", presignEndpoint);


      const respPresign = await fetch(presignEndpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });

      if (!respPresign.ok) {
        const erroTxt = await respPresign.text();
        throw new Error(`Erro presign: ${respPresign.status} - ${erroTxt}`);
      }

      const presignData = await respPresign.json();
      console.log("Presign retornado:", presignData);

      if (!presignData.presignedUrl) throw new Error("URL pré-assinada não retornada");

      const uploadResp = await fetch(presignData.presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosParaSalvar),
      });

      console.log("Upload status:", uploadResp.status);
      if (!uploadResp.ok) throw new Error(`Erro upload: ${uploadResp.status}`);

      showToast("Configuração salva com sucesso!", "success", 3500);
      this.modalConfig.style.display = "none";
      return true;
    } catch (e) {
      console.error("Erro salvar configuração:", e);
      showToast("Erro ao salvar: " + e.message, "error", 4000);
      return false;
    }
  }
}