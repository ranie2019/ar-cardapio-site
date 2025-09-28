// ==============================
// home2.js - Exibição de Itens, Preview 3D e Configuração
// ==============================

class SistemaCardapioItens extends SistemaCardapioBase {
  constructor() {
    super();
    this._limpezaArrastePreview = null; // guarda função de limpeza dos listeners do preview atual
  }

  // ==============================
  // 3) EXIBIÇÃO DE ITENS E PREVIEW 3D
  // ==============================
  mostrarItens(categoria) {
    const containerItens = document.getElementById('itensContainer');
    if (!containerItens || !objetos3D[categoria]) return;

    containerItens.innerHTML = '';
    containerItens.style.display = 'flex';

    // Esconde botão de configuração quando a categoria for "logo"
    containerItens.classList.toggle('sem-config-logo', categoria === 'logo');

    objetos3D[categoria].forEach((nomeItem, indice) => {
      const envoltorioItem = document.createElement('div');
      envoltorioItem.className = 'item-wrapper';

      const caixaItem = document.createElement('div');
      caixaItem.className = 'item-box';
      caixaItem.textContent = nomeItem;
      caixaItem.setAttribute('data-categoria', categoria);
      caixaItem.setAttribute('data-nome', this.nomeParaSlug(nomeItem));
      caixaItem.style.animationDelay = `${indice * 0.1}s`;

      // Estado salvo (ativado/desativado)
      const chaveEstadoItem = this.gerarChaveItem(categoria, nomeItem);
      if (localStorage.getItem(chaveEstadoItem) === 'true') {
        caixaItem.classList.add('desativado');
      }

      // Alternar visibilidade do item
      caixaItem.addEventListener('click', () => {
        const desativadoAgora = caixaItem.classList.toggle('desativado');
        localStorage.setItem(chaveEstadoItem, desativadoAgora);
        this.salvarConfiguracaoNoS3(); // persiste agregados
        this.canalStatus.postMessage({ nome: nomeItem, visivel: !desativadoAgora });
      });

      // Preview 3D ao passar o mouse
      caixaItem.addEventListener('mouseenter', () => {
        if (caixaItem.classList.contains('desativado')) return;

        if (this.previewFecharTimeout) clearTimeout(this.previewFecharTimeout);

        const identificadorItemAtual = `${categoria}/${nomeItem}`;
        if (this.previewItemAtual !== identificadorItemAtual) {
          this.previewItemAtual = identificadorItemAtual;
          this.mostrarPreview3D(caixaItem, categoria, nomeItem);
        }
      });

      // Esconder preview quando sair do item (com tolerância de hover no modal)
      caixaItem.addEventListener('mouseleave', () => {
        this.previewFecharTimeout = setTimeout(() => {
          if (!this.modelModal.matches(':hover')) {
            this.modelModal.style.display = 'none';
            this.modelModal.innerHTML = '';
            this.previewItemAtual = null;
            if (this._limpezaArrastePreview) {
              this._limpezaArrastePreview();
              this._limpezaArrastePreview = null;
            }
          }
        }, 300);
      });

      // Botão de configuração por item
      const botaoConfigurarProduto = document.createElement('button');
      botaoConfigurarProduto.className = 'btn-configurar-produto';
      botaoConfigurarProduto.textContent = 'Configuração';
      botaoConfigurarProduto.dataset.categoria = categoria;

      if (categoria === 'logo') {
        botaoConfigurarProduto.style.display = 'none';
        botaoConfigurarProduto.setAttribute('aria-hidden', 'true');
      }

      botaoConfigurarProduto.addEventListener('click', (evento) => {
        evento.stopPropagation();
        this.abrirModalConfiguracao(categoria, nomeItem);
      });

      envoltorioItem.appendChild(caixaItem);
      envoltorioItem.appendChild(botaoConfigurarProduto);
      containerItens.appendChild(envoltorioItem);
    });
  }

  // ==============================
  // PREVIEW 3D (com fallback entre bases de URL)
  // ==============================
  async mostrarPreview3D(elementoOrigem, categoria, nomeItem) {
    // Remove listeners antigos se existir um preview anterior
    if (this._limpezaArrastePreview) {
      this._limpezaArrastePreview();
      this._limpezaArrastePreview = null;
    }

    const retangulo = elementoOrigem.getBoundingClientRect();
    const DESLOCAMENTO_TOPO = 80;
    this.modelModal.style.left = `${retangulo.right + 5}px`;
    this.modelModal.style.top = `${retangulo.top + DESLOCAMENTO_TOPO}px`;
    this.modelModal.style.display = 'block';

    // Estado de carregamento
    this.modelModal.innerHTML = `
      <div style="width:330px;height:300px;background:#1a1a1a;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#00f0c0;">
        <div style="text-align:center;">
          <div style="width:40px;height:40px;border:3px solid #00f0c0;border-top:3px solid transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;"></div>
          <div>Carregando modelo 3D...</div>
        </div>
      </div>
      <style>@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}</style>
    `;

    // Monta candidatos de URL do modelo
    const nomeArquivoModelo = this.nomeParaArquivo(nomeItem);
    const basesModelos = Array.isArray(this.MODEL_BASE_URLS) ? this.MODEL_BASE_URLS : [];
    const candidatos = basesModelos.map(base => encodeURI(`${base}/${categoria}/${nomeArquivoModelo}`));

    // Tenta um HEAD para descobrir a primeira que responde 200 OK
    let urlModelo = null;
    for (const url of candidatos) {
      try {
        const resposta = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
        if (resposta.ok) { urlModelo = url; break; }
      } catch (_) { /* Tenta a próxima */ }
    }
    // Fallback: usa a primeira se HEAD não foi possível por CORS
    if (!urlModelo && candidatos.length) urlModelo = candidatos[0];

    if (!urlModelo) {
      this.modelModal.innerHTML = `
        <div style="width:330px;height:300px;background:#1a1a1a;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#ff6b6b;text-align:center;padding:20px;box-sizing:border-box;">
          <div>
            <div style="font-size:24px;margin-bottom:10px;">⚠️</div>
            <div style="font-size:14px;">Modelo 3D não encontrado</div>
            <div style="font-size:12px;color:#ccc;margin-top:5px;">${nomeItem}</div>
          </div>
        </div>`;
      return;
    }

    // ===== Parâmetros do enquadramento =====
    const DESLOCAMENTO_Y_PREVIEW = 0.35; // metros para subir o objeto no quadro
    const ALTURA_CAMERA = 1.6;
    const DISTANCIA_Z_MODELO = -2;

    // Cena A-Frame com nós de rotação e elevação
    this.escalaAtual = 1;
    this.modelModal.innerHTML = `
      <a-scene
        embedded
        vr-mode-ui="enabled:false"
        device-orientation-permission-ui="enabled:false"
        style="width:100%;height:300px;"
        id="previewScene"
        background="color:#1a1a1a">

        <a-light type="ambient" intensity="1.2"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>

        <!-- Grupo em Z (distância) -->
        <a-entity id="previewRig" position="0 0 ${DISTANCIA_Z_MODELO}">
          <!-- Elevador (ajusta Y sem interferir na rotação) -->
          <a-entity id="previewLift" position="0 ${DESLOCAMENTO_Y_PREVIEW} 0">
            <!-- Yaw manual (eixo Y) -->
            <a-entity id="previewYaw" rotation="0 0 0">
              <!-- Pitch manual (eixo X) -->
              <a-entity id="previewPitch" rotation="0 0 0">
                <!-- Modelo com rotação automática contínua no próprio eixo -->
                <a-entity id="previewModel"
                  gltf-model="url(${urlModelo}); dracoDecoderPath: https://www.gstatic.com/draco/v1/decoders/"
                  scale="${this.escalaAtual} ${this.escalaAtual} ${this.escalaAtual}"
                  animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
                </a-entity>
              </a-entity>
            </a-entity>
          </a-entity>
        </a-entity>

        <a-camera position="0 ${ALTURA_CAMERA} 0" look-controls="enabled:false" wasd-controls="enabled:false"></a-camera>
      </a-scene>

      <div style="position:absolute;top:5px;right:5px;color:#00f0c0;font-size:12px;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:3px;">
        Preview 3D
      </div>

      <style>
        /* Permitir interação no canvas e mostrar feedback visual do arraste */
        #previewScene .a-canvas { pointer-events: auto !important; cursor: grab; }
        #previewScene.is-dragging .a-canvas { cursor: grabbing; }
        .a-enter-vr,.a-enter-ar,.a-orientation-modal,[data-aframe-default-ui]{display:none!important}
      </style>
    `;

    // Ativa controles de arraste (giro, elevação e zoom)
    this.configurarControlesPreview();
  }

  // ==============================
  // CONTROLES DE ARRASTE E SCROLL (mouse e toque)
  //  - Botão esquerdo: girar (yaw e pitch)
  //  - Botão direito: subir/baixar (posição Y)
  //  - Scroll: zoom (escala do modelo)
// ==============================
  configurarControlesPreview() {
    const elementoCena = this.modelModal.querySelector('#previewScene');
    const elementoRotacaoYaw = this.modelModal.querySelector('#previewYaw');
    const elementoRotacaoPitch = this.modelModal.querySelector('#previewPitch');
    const elementoElevacao = this.modelModal.querySelector('#previewLift');
    const elementoModelo = this.modelModal.querySelector('#previewModel');

    if (!elementoCena || !elementoRotacaoYaw || !elementoRotacaoPitch || !elementoElevacao || !elementoModelo) return;

    // Sensibilidades e limites (rotação)
    const SENSIBILIDADE_YAW_GRAUS_POR_PIXEL = 0.4;     // arraste horizontal → graus de yaw
    const SENSIBILIDADE_PITCH_GRAUS_POR_PIXEL = 0.4;   // arraste vertical   → graus de pitch
    const LIMITE_PITCH_MIN = -120;
    const LIMITE_PITCH_MAX = 120;

    // Subir/Descer com botão direito
    const SENSIBILIDADE_ELEVACAO_METROS_POR_PIXEL = 0.004; // 4 mm por pixel
    const LIMITE_ELEVACAO_MIN = -0.30;
    const LIMITE_ELEVACAO_MAX = 1.80;

    // Zoom por scroll (escala do modelo)
    const ESCALA_MIN = 0.2;
    const ESCALA_MAX = 3.0;
    const FATOR_ZOOM_POR_PASSO = 1.08; // cada "tic" de scroll aplica ~8%

    // Estado do arraste
    let arrastando = false;
    let modoArraste = null; // 'girar' | 'elevar'
    let ultimoX = 0;
    let ultimoY = 0;
    let anguloYaw = 0;
    let anguloPitch = 0;
    let posicaoYElevacao = elementoElevacao.object3D.position.y || 0;
    let escalaAtual = this.escalaAtual || 1;

    const opcoesNaoPassivas = { passive: false };
    const obterPonto = (evento) =>
      (evento.touches && evento.touches[0]) ? evento.touches[0] : evento;

    const aoPressionar = (evento) => {
      // Desktop: botão 0 = esquerdo (girar), botão 2 = direito (elevar)
      // Touch: sempre girar
      if (evento.touches) {
        modoArraste = 'girar';
      } else if (evento.button === 0) {
        modoArraste = 'girar';
      } else if (evento.button === 2) {
        modoArraste = 'elevar';
      } else {
        return;
      }

      const p = obterPonto(evento);
      arrastando = true;
      ultimoX = p.clientX;
      ultimoY = p.clientY;
      elementoCena.classList.add('is-dragging');
      evento.preventDefault();
    };

    const aoMover = (evento) => {
      if (!arrastando) return;

      const p = obterPonto(evento);
      const deltaX = p.clientX - ultimoX;
      const deltaY = p.clientY - ultimoY;
      ultimoX = p.clientX;
      ultimoY = p.clientY;

      if (modoArraste === 'girar') {
        anguloYaw = (anguloYaw + deltaX * SENSIBILIDADE_YAW_GRAUS_POR_PIXEL) % 360;
        anguloPitch = Math.max(
          LIMITE_PITCH_MIN,
          Math.min(LIMITE_PITCH_MAX, anguloPitch - deltaY * SENSIBILIDADE_PITCH_GRAUS_POR_PIXEL)
        );
        elementoRotacaoYaw.setAttribute('rotation', `0 ${anguloYaw} 0`);
        elementoRotacaoPitch.setAttribute('rotation', `${anguloPitch} 0 0`);
      } else if (modoArraste === 'elevar') {
        posicaoYElevacao = Math.max(
          LIMITE_ELEVACAO_MIN,
          Math.min(LIMITE_ELEVACAO_MAX, posicaoYElevacao - deltaY * SENSIBILIDADE_ELEVACAO_METROS_POR_PIXEL)
        );
        elementoElevacao.setAttribute('position', `0 ${posicaoYElevacao} 0`);
      }

      evento.preventDefault();
    };

    const aoSoltar = () => {
      arrastando = false;
      modoArraste = null;
      elementoCena.classList.remove('is-dragging');
    };

    const aoMenuDeContexto = (evento) => {
      // Evita abrir o menu do botão direito enquanto usamos para elevar
      evento.preventDefault();
    };

    // Zoom por scroll (roda do mouse)
    const aoRolar = (evento) => {
      // deltaY < 0 → rolar para frente → aproximar (aumentar escala)
      // deltaY > 0 → rolar para trás   → afastar  (diminuir escala)
      const fator = (evento.deltaY < 0) ? FATOR_ZOOM_POR_PASSO : (1 / FATOR_ZOOM_POR_PASSO);
      escalaAtual = Math.max(ESCALA_MIN, Math.min(ESCALA_MAX, escalaAtual * fator));
      this.escalaAtual = escalaAtual; // mantém no estado da classe

      elementoModelo.setAttribute('scale', `${escalaAtual} ${escalaAtual} ${escalaAtual}`);
      evento.preventDefault();
    };

    // Listeners de mouse
    elementoCena.addEventListener('mousedown', aoPressionar);
    elementoCena.addEventListener('mousemove', aoMover);
    window.addEventListener('mouseup', aoSoltar);
    elementoCena.addEventListener('contextmenu', aoMenuDeContexto);
    elementoCena.addEventListener('wheel', aoRolar, opcoesNaoPassivas);

    // Listeners de toque (somente giro)
    elementoCena.addEventListener('touchstart', aoPressionar, opcoesNaoPassivas);
    elementoCena.addEventListener('touchmove', aoMover, opcoesNaoPassivas);
    window.addEventListener('touchend', aoSoltar);

    // Guarda função de limpeza para quando o preview fechar/trocar
    this._limpezaArrastePreview = () => {
      elementoCena.removeEventListener('mousedown', aoPressionar);
      elementoCena.removeEventListener('mousemove', aoMover);
      window.removeEventListener('mouseup', aoSoltar);
      elementoCena.removeEventListener('contextmenu', aoMenuDeContexto);
      elementoCena.removeEventListener('wheel', aoRolar, opcoesNaoPassivas);

      elementoCena.removeEventListener('touchstart', aoPressionar, opcoesNaoPassivas);
      elementoCena.removeEventListener('touchmove', aoMover, opcoesNaoPassivas);
      window.removeEventListener('touchend', aoSoltar);
    };
  }

  // ==============================
  // CONFIGURAÇÃO DE ITENS (Modal)
  // ==============================
  async abrirModalConfiguracao(categoria, nomeItem) {
    const nomeFormatado = this.nomeParaSlug(nomeItem);
    this.itemConfiguracao = `${categoria}/${nomeFormatado}`;
    const arquivoJson = `${nomeFormatado}.json`;

    this.modalConfig.querySelector('.modal-titulo').textContent = `Configurar ${nomeItem}`;

    let dadosProduto = { preco: 0, descricao: '' };
    const urlJson = `https://ar-cardapio-models.s3.amazonaws.com/informacao/${this.nomeRestaurante}/${arquivoJson}?v=${Date.now()}`;

    try {
      const resposta = await fetch(urlJson);
      if (resposta.ok) {
        dadosProduto = await resposta.json();
      } else if (resposta.status !== 404) {
        console.warn('Erro ao buscar configuração:', resposta.status, resposta.statusText);
      }
    } catch (erro) {
      console.error('Falha ao carregar configuração:', erro);
    }

    const campoValor = this.modalConfig.querySelector('#inputValor');
    const campoDescricao = this.modalConfig.querySelector('#inputDescricao');

    campoValor.value = typeof dadosProduto.preco === 'number'
      ? dadosProduto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';

    campoDescricao.value = dadosProduto.descricao || '';

    this.dadosRestaurante[this.itemConfiguracao] = dadosProduto;

    this.modalConfig.style.display = 'flex';
  }

  async salvarConfiguracao(confirmado = false) {
    if (!this.itemConfiguracao || !confirmado) return false;

    try {
      const campoValor = this.modalConfig.querySelector('#inputValor');
      const campoDescricao = this.modalConfig.querySelector('#inputDescricao');
      if (!campoValor || !campoDescricao) throw new Error('Campos de configuração não encontrados.');

      const [categoria, nomeItemSlug] = this.itemConfiguracao.split('/');
      const nomeItemOriginal = objetos3D[categoria].find(item => this.nomeParaSlug(item) === nomeItemSlug);

      const novoPreco = parseFloat(campoValor.value.replace('.', '').replace(',', '.'));
      const novaDescricao = campoDescricao.value;

      const dadosParaSalvar = {
        preco: novoPreco,
        descricao: novaDescricao,
        nome: nomeItemOriginal // Adiciona o nome original para facilitar a identificação
      };

      const urlUpload = `https://ar-cardapio-models.s3.amazonaws.com/informacao/${this.nomeRestaurante}/${nomeItemSlug}.json`;

      const response = await fetch(urlUpload, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(dadosParaSalvar)
      });

      if (!response.ok) {
        const erroTexto = await response.text();
        throw new Error(`Erro ao salvar no S3: ${response.status} - ${erroTexto}`);
      }

      console.log('Configuração salva com sucesso no S3:', dadosParaSalvar);
      alert('Configurações salvas com sucesso!');
      return true;

    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      alert('Erro ao salvar as configurações: ' + error.message);
      return false;
    }
  }
}


