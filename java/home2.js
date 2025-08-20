// ==============================
// home2.js - Exibição de Itens, Preview 3D e Configuração
// ==============================

class SistemaCardapioItens extends SistemaCardapioBase {
  constructor() {
    super();
  }

  // ==============================
  // 3) EXIBIÇÃO DE ITENS E PREVIEW 3D
  // ==============================
  mostrarItens(categoria) {
    const container = document.getElementById('itensContainer');
    if (!container || !objetos3D[categoria]) return;

    // limpa e mostra a área de itens
    container.innerHTML = '';
    container.style.display = 'flex';

    // adiciona classe-gancho para CSS esconder config na categoria “logo”
    container.classList.toggle('sem-config-logo', categoria === 'logo');

    objetos3D[categoria].forEach((nome, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-wrapper';

      const box = document.createElement('div');
      box.className = 'item-box';
      box.textContent = nome;
      box.setAttribute('data-categoria', categoria);
      box.setAttribute('data-nome', this.nomeParaSlug(nome));
      box.style.animationDelay = `${index * 0.1}s`;

      // estado salvo (on/off)
      const chaveItem = this.gerarChaveItem(categoria, nome);
      if (localStorage.getItem(chaveItem) === 'true') {
        box.classList.add('desativado');
      }

      // toggle do item
      box.addEventListener('click', () => {
        const desativadoAgora = box.classList.toggle('desativado');
        localStorage.setItem(chaveItem, desativadoAgora);
        // salva no S3 o status agregado
        this.salvarConfiguracaoNoS3();
        // avisa o app (canal broadcast)
        this.canalStatus.postMessage({ nome, visivel: !desativadoAgora });
      });

      // preview 3D (mouseenter/leave)
      box.addEventListener('mouseenter', () => {
        if (box.classList.contains('desativado')) return;

        if (this.previewFecharTimeout) clearTimeout(this.previewFecharTimeout);

        const itemAtual = `${categoria}/${nome}`;
        if (this.previewItemAtual !== itemAtual) {
          this.previewItemAtual = itemAtual;
          this.mostrarPreview3D(box, categoria, nome);
        }
      });

      box.addEventListener('mouseleave', () => {
        this.previewFecharTimeout = setTimeout(() => {
          if (!this.modelModal.matches(':hover')) {
            this.modelModal.style.display = 'none';
            this.modelModal.innerHTML = '';
            this.previewItemAtual = null;
          }
        }, 300);
      });

      // botão de configuração (um por item)
      const botaoConfigurar = document.createElement('button');
      botaoConfigurar.className = 'btn-configurar-produto';
      botaoConfigurar.textContent = 'Configuração';
      botaoConfigurar.dataset.categoria = categoria;

      // Esconde somente na categoria “logo”
      if (categoria === 'logo') {
        botaoConfigurar.style.display = 'none';
        botaoConfigurar.setAttribute('aria-hidden', 'true');
      }

      botaoConfigurar.addEventListener('click', (event) => {
        event.stopPropagation();
        this.abrirModalConfiguracao(categoria, nome);
      });

      wrapper.appendChild(box);
      wrapper.appendChild(botaoConfigurar);
      container.appendChild(wrapper);
    });
  }

  // ==============================
  // Preview 3D com fallback entre as bases de URL
  // ==============================
  async mostrarPreview3D(elemento, categoria, nome) {
    const rect = elemento.getBoundingClientRect();
    const OFFSET_TOP = 80;
    this.modelModal.style.left = `${rect.right + 5}px`;
    this.modelModal.style.top  = `${rect.top + OFFSET_TOP}px`;
    this.modelModal.style.display = 'block';

    // loading
    this.modelModal.innerHTML = `
      <div style="width:330px;height:300px;background:#1a1a1a;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#00f0c0;">
        <div style="text-align:center;">
          <div style="width:40px;height:40px;border:3px solid #00f0c0;border-top:3px solid transparent;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;"></div>
          <div>Carregando modelo 3D...</div>
        </div>
      </div>
      <style>@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}</style>
    `;

    // monta candidatos em TODAS as bases configuradas
    const arquivo = this.nomeParaArquivo(nome); // “bisteca_suina_grelhada.glb”
    const bases   = Array.isArray(this.MODEL_BASE_URLS) ? this.MODEL_BASE_URLS : [];
    const candidates = bases.map(base => encodeURI(`${base}/${categoria}/${arquivo}`));

    // tenta HEAD para achar a primeira que existe
    let modelURL = null;
    for (const url of candidates) {
      try {
        const r = await fetch(url, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
        if (r.ok) { modelURL = url; break; }
      } catch (_) { /* tenta próximo */ }
    }

    // fallback (CORS/HEAD bloqueado)
    if (!modelURL && candidates.length) modelURL = candidates[0];

    if (!modelURL) {
      this.modelModal.innerHTML = `
        <div style="width:330px;height:300px;background:#1a1a1a;border-radius:16px;display:flex;align-items:center;justify-content:center;color:#ff6b6b;text-align:center;padding:20px;box-sizing:border-box;">
          <div>
            <div style="font-size:24px;margin-bottom:10px;">⚠️</div>
            <div style="font-size:14px;">Modelo 3D não encontrado</div>
            <div style="font-size:12px;color:#ccc;margin-top:5px;">${nome}</div>
          </div>
        </div>`;
      return;
    }

    // renderiza a cena A-Frame
    this.escalaAtual = 1;
    this.modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled:false" device-orientation-permission-ui="enabled:false"
               style="width:100%;height:300px;" id="previewScene" background="color:#1a1a1a">
        <a-light type="ambient" intensity="1.2"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>
        <a-entity position="0 0 -2" rotation="0 0 0">
          <a-entity id="previewModel"
            gltf-model="url(${modelURL}); dracoDecoderPath: https://www.gstatic.com/draco/v1/decoders/"
            scale="${this.escalaAtual} ${this.escalaAtual} ${this.escalaAtual}"
            rotation="0 0 0"
            animation="property: rotation; to: 0 360 0; loop: true; dur: 8000; easing: linear">
          </a-entity>
        </a-entity>
        <a-camera position="0 1.6 0" look-controls="enabled:false" wasd-controls="enabled:false"></a-camera>
      </a-scene>
      <div style="position:absolute;top:5px;right:5px;color:#00f0c0;font-size:12px;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:3px;">
        Preview 3D
      </div>
      <style>
        .a-enter-vr,.a-enter-ar,.a-orientation-modal,[data-aframe-default-ui]{display:none!important}
        .a-canvas{pointer-events:none!important}
      </style>
    `;

    this.configurarControlesPreview();
  }

  // Pequenos controles para o preview (evita erro se for chamado)
  configurarControlesPreview() {
    // Aqui você pode adicionar zoom por roda do mouse, etc., se quiser.
    // Mantido simples para não interferir no restante do fluxo.
  }

  // ==============================
  // Configuração de Itens (Modal)
  // ==============================
  async abrirModalConfiguracao(categoria, nome) {
    const nomeFormatado = this.nomeParaSlug(nome);
    this.itemConfiguracao = `${categoria}/${nomeFormatado}`;
    const arquivoJson = `${nomeFormatado}.json`;

    this.modalConfig.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;

    let dadosProduto = { preco: 0, descricao: '' };
    // leitura do mesmo local onde será salvo
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

    const inputValor = this.modalConfig.querySelector('#inputValor');
    const inputDescricao = this.modalConfig.querySelector('#inputDescricao');

    inputValor.value = typeof dadosProduto.preco === 'number'
      ? dadosProduto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';

    inputDescricao.value = dadosProduto.descricao || '';

    this.dadosRestaurante[this.itemConfiguracao] = dadosProduto;

    this.modalConfig.style.display = 'flex';
  }

  async salvarConfiguracao(confirmado = false) {
    if (!this.itemConfiguracao || !confirmado) return false;

    try {
      const inputValor = this.modalConfig.querySelector('#inputValor');
      const inputDescricao = this.modalConfig.querySelector('#inputDescricao');
      if (!inputValor || !inputDescricao) throw new Error('Campos de configuração não encontrados');

      const valorTexto = inputValor.value;
      const preco = parseFloat(valorTexto.replace(/\./g, '').replace(',', '.')) || 0;
      const descricao = inputDescricao.value.trim();

      const [, nomeProduto] = this.itemConfiguracao.split('/');
      const nomeArquivo = `${nomeProduto}.json`;

      const dadosAtualizados = { preco, descricao, ultimaAtualizacao: new Date().toISOString() };

      // salva no bucket ar-cardapio-models/informacao/{restaurante}
      const urlCompleta = `https://ar-cardapio-models.s3.amazonaws.com/informacao/${this.nomeRestaurante}/${nomeArquivo}`;

      const resposta = await fetch(urlCompleta, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-amz-acl': 'bucket-owner-full-control'
        },
        body: JSON.stringify(dadosAtualizados)
      });

      if (!resposta.ok) throw new Error(`Erro ${resposta.status}: ${await resposta.text()}`);

      this.dadosRestaurante[this.itemConfiguracao] = dadosAtualizados;
      return true;
    } catch (erro) {
      console.error('Falha ao salvar configuração:', erro);
      throw erro;
    }
  }
}
