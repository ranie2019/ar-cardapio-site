// ==============================
// home2.js - ExibiÃ§Ã£o de Itens, Preview 3D e ConfiguraÃ§Ã£o
// ==============================

class SistemaCardapioItens extends SistemaCardapioBase {
  constructor() {
    super();
  }

  // ==============================
  // 3. EXIBIÃ‡ÃƒO DE ITENS E PREVIEW 3D
  // ==============================
  mostrarItens(categoria) {
    const container = document.getElementById('itensContainer');
    if (!container || !objetos3D[categoria]) return;

    container.innerHTML = '';
    container.style.display = 'flex';

    objetos3D[categoria].forEach((nome, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-wrapper';

      const box = document.createElement('div');
      box.className = 'item-box';
      box.textContent = nome;
      box.setAttribute('data-categoria', categoria);
      box.style.animationDelay = `${index * 0.1}s`;
      box.setAttribute('data-nome', this.nomeParaSlug(nome));

      // Estado salvo
      const chaveItem = this.gerarChaveItem(categoria, nome);
      if (localStorage.getItem(chaveItem) === 'true') {
        box.classList.add('desativado');
      }

      // Toggle do item
      box.addEventListener('click', () => {
        const desativadoAgora = box.classList.toggle('desativado');
        localStorage.setItem(chaveItem, desativadoAgora);
        this.salvarConfiguracaoNoS3();
        this.canalStatus.postMessage({ nome, visivel: !desativadoAgora });
      });

      // Preview 3D â€” Ãºnico mouseenter
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

      // BotÃ£o de configuraÃ§Ã£o
      const botaoConfigurar = document.createElement('button');
      botaoConfigurar.className = 'btn-configurar-produto';
      botaoConfigurar.textContent = 'ConfiguraÃ§Ã£o';
      botaoConfigurar.addEventListener('click', (event) => {
        event.stopPropagation();
        this.abrirModalConfiguracao(categoria, nome);
      });

      wrapper.appendChild(box);
      wrapper.appendChild(botaoConfigurar);
      container.appendChild(wrapper);
    });
  }

  mostrarPreview3D(elemento, categoria, nome) {
    const rect = elemento.getBoundingClientRect();
    this.modelModal.style.left = `${rect.right + 10}px`;
    this.modelModal.style.top = `${rect.top}px`;
    this.modelModal.style.display = 'block';

    // ajuste fino: descer X pixels para nÃ£o cobrir o botÃ£o
    const OFFSET_TOP = 80; // mude para o valor que preferir (40~80)

    this.modelModal.style.left = `${rect.right + 5}px`;
    this.modelModal.style.top  = `${rect.top + OFFSET_TOP}px`; // << aqui
    this.modelModal.style.display = 'block';

    const modelURL = `${this.MODEL_BASE_URL}${categoria}/${this.nomeParaArquivo(nome)}`;
    this.escalaAtual = 1;

    this.modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled: false" style="width: 100%; height: 300px;" id="previewScene">
        <a-light type="ambient" intensity="1.0"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>
        <a-entity position="0 1 -3" rotation="0 0 0">
          <a-gltf-model 
            id="previewModel"
            src="${modelURL}" 
            scale="${this.escalaAtual * 2} ${this.escalaAtual * 2} ${this.escalaAtual * 2}"
            rotation="0 0 0"
            animation="property: rotation; to: 0 360 0; loop: true; dur: 10000; easing: linear"
          ></a-gltf-model>
        </a-entity>
        <a-camera position="0 2 0"></a-camera>
      </a-scene>
    `;

    // Zoom
    this.modelModal.onwheel = (e) => {
      e.preventDefault();
      const zoomStep = 0.1;
      this.escalaAtual = e.deltaY < 0 ? this.escalaAtual + zoomStep : Math.max(0.1, this.escalaAtual - zoomStep);
      const model = document.getElementById('previewModel');
      if (model) model.setAttribute('scale', `${this.escalaAtual} ${this.escalaAtual} ${this.escalaAtual}`);
    };

    // Pan (botÃ£o direito)
    let isRightMouseDown = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    const modelEntity = this.modelModal.querySelector('a-entity');

    this.modelModal.addEventListener('contextmenu', e => e.preventDefault());
    this.modelModal.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        isRightMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    });
    this.modelModal.addEventListener('mouseup', (e) => {
      if (e.button === 2) isRightMouseDown = false;
    });
    this.modelModal.addEventListener('mousemove', (e) => {
      if (!isRightMouseDown || !modelEntity) return;
      const deltaX = (e.clientX - lastMouseX) * 0.01;
      const deltaY = (e.clientY - lastMouseY) * 0.01;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      const currentPos = modelEntity.getAttribute('position');
      modelEntity.setAttribute('position', { x: currentPos.x + deltaX, y: currentPos.y - deltaY, z: currentPos.z });
    });
  }

  // ==============================
  // 4. CONFIGURAÃ‡ÃƒO DE ITENS (Modal)
  // ==============================
  async abrirModalConfiguracao(categoria, nome) {
    const nomeFormatado = this.nomeParaSlug(nome);
    this.itemConfiguracao = `${categoria}/${nomeFormatado}`;
    const arquivoJson = `${nomeFormatado}.json`;

    this.modalConfig.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;

    let dadosProduto = { preco: 0, descricao: '' };
    const urlJson = `${this.MODEL_BASE_URL}informacao/${arquivoJson}?v=${Date.now()}`;

    try {
      const resposta = await fetch(urlJson);
      if (resposta.ok) {
        dadosProduto = await resposta.json();
      } else if (resposta.status !== 404) {
        console.warn('Erro ao buscar configuraÃ§Ã£o:', resposta.status, resposta.statusText);
      }
    } catch (erro) {
      console.error('Falha ao carregar configuraÃ§Ã£o:', erro);
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
      if (!inputValor || !inputDescricao) throw new Error('Campos de configuraÃ§Ã£o nÃ£o encontrados');

      const valorTexto = inputValor.value;
      const preco = parseFloat(valorTexto.replace(/\./g, '').replace(',', '.')) || 0;
      const descricao = inputDescricao.value.trim();

      const [, nomeProduto] = this.itemConfiguracao.split('/');
      const nomeArquivo = `${nomeProduto}.json`;

      const dadosAtualizados = { preco, descricao, ultimaAtualizacao: new Date().toISOString() };
      const urlCompleta = `${this.MODEL_BASE_URL}informacao/${nomeArquivo}`;

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
      console.error('Falha ao salvar configuraÃ§Ã£o:', erro);
      throw erro;
    }
  }
}
