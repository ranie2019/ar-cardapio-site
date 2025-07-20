// ==============================
// home.js - Sistema de Cardápio Digital Completo
// ==============================

/**
 * Classe principal que gerencia o sistema de cardápio
 */
class SistemaCardapio {
  constructor() {
    this.nomeRestaurante = 'restaurante-001';
    this.itemConfiguracao = null;
    this.dadosRestaurante = {};
    this.categoriaAtiva = null;
    this.currentGarcomId = null;
    
    // URLs base
    this.MODEL_BASE_URL = 'https://ar-menu-models.s3.amazonaws.com/';
    this.ARQUIVO_CONFIG_CATEGORIAS = `https://ar-menu-models.s3.amazonaws.com/configuracoes/${this.nomeRestaurante}.json`;
    this.ARQUIVO_CONFIG_ITENS = `https://ar-menu-models.s3.amazonaws.com/configuracoes/${this.nomeRestaurante}-itens.json`;
    
    // Inicializa componentes
    this.inicializarModalConfiguracao();
    this.inicializarModalPreview3D();
    this.configurarEventosCardapio();
    this.setupCadastroGarcons();
    this.setupQrCodeGarcons();
    
    // Canal de sincronização
    this.canalStatus = new BroadcastChannel('cardapio_channel');
    this.configurarSincronizacao();
    
    // Carrega configurações iniciais
    this.carregarConfiguracoesIniciais();
  }

  // ==============================
  // INICIALIZAÇÃO DOS COMPONENTES
  // ==============================

  /**
   * Inicializa o modal de configuração de produtos
   */
  inicializarModalConfiguracao() {
    // Cria o elemento pai do modal
    this.modalConfig = document.createElement('div');
    this.modalConfig.id = 'modalConfiguracaoProduto';
    this.modalConfig.className = 'modal-edicao';
    this.modalConfig.style.display = 'none';

    // Conteúdo interno do modal
    this.modalConfig.innerHTML = `
      <div class="modal-content-edicao">
        <span class="close-edicao">&times;</span>
        <h3 class="modal-titulo">Configurar Produto</h3>
        <div class="grupo-input">
          <label for="inputValor">Valor (R$):</label>
          <input type="text" id="inputValor" placeholder="0,00">
        </div>
        <div class="grupo-input">
          <label for="inputDescricao">Descrição:</label>
          <textarea id="inputDescricao" rows="4"></textarea>
        </div>
        <div class="actions">
          <button id="btnSalvarModal" class="btn-salvar-config">Salvar</button>
        </div>
      </div>
    `;
    // Anexa o modal ao body
    document.body.appendChild(this.modalConfig);

    // Fecha o modal ao clicar no "×"
    const botaoFechar = this.modalConfig.querySelector('.close-edicao');
    botaoFechar.addEventListener('click', () => {
      this.modalConfig.style.display = 'none';
    });

    // Impede que cliques dentro do conteúdo fechem o modal
    const conteudoModal = this.modalConfig.querySelector('.modal-content-edicao');
    conteudoModal.addEventListener('click', (evento) => {
      evento.stopPropagation();
    });

    // Formata valor monetário enquanto digita
    const campoValor = this.modalConfig.querySelector('#inputValor');
    campoValor.addEventListener('input', (evento) => {
      this.formatarValorMonetario(evento);
      this.salvarConfiguracao();
    });

    // Formatação do valor monetário
    const inputValor = this.modalConfig.querySelector('#inputValor');
    inputValor.addEventListener('input', (e) => {
      this.formatarValorMonetario(e);
      this.salvarConfiguracao();
    });

    // Salva configuração ao modificar descrição
    const campoDescricao = this.modalConfig.querySelector('#inputDescricao');
    campoDescricao.addEventListener('input', () => {
      this.salvarConfiguracao();
    });

    // Fecha o modal e salva ao clicar em "Salvar"
    const botaoSalvar = this.modalConfig.querySelector('#btnSalvarModal');
    botaoSalvar.addEventListener('click', async () => {
      await this.salvarConfiguracao();
      this.modalConfig.style.display = 'none';
    });
  }

  /**
   * Inicializa o modal de preview 3D
   */
  inicializarModalPreview3D() {
    this.modelModal = document.createElement('div');
    this.modelModal.className = 'model-preview-modal';
    this.modelModal.style.display = 'none';
    document.body.appendChild(this.modelModal);
  }

  /**
   * Configura os eventos do cardápio
   */
  configurarEventosCardapio() {
    const profileBtn = document.getElementById('profile-btn');
    const cardapioBtn = document.getElementById('cardapio-btn');
    const dropdownCardapio = document.getElementById('dropdownCardapio');
    const container = document.getElementById('itensContainer');

    // Evento do botão de perfil
    if (profileBtn) {
      profileBtn.addEventListener('click', () => {
        window.location.href = 'perfil.html';
      });
    }

    // Evento do botão do cardápio
    if (cardapioBtn && dropdownCardapio) {
      cardapioBtn.addEventListener('click', () => {
        dropdownCardapio.classList.toggle('show');

        if (!dropdownCardapio.classList.contains('show')) {
          container.style.display = 'none';
          container.innerHTML = '';
          this.categoriaAtiva = null;
          this.modelModal.style.display = 'none';
          this.modelModal.innerHTML = '';
        } else if (this.categoriaAtiva) {
          this.mostrarItens(this.categoriaAtiva);
          container.style.display = 'flex';
        }
      });
    }

    // Eventos dos botões de categoria
    document.querySelectorAll('#dropdownCardapio button').forEach(btn => {
      const categoria = btn.getAttribute('data-categoria');
      const id = 'btnEstado_' + categoria;

      // Estado inicial do localStorage
      const estaDesativado = localStorage.getItem(id) === 'true';
      if (estaDesativado) {
        btn.classList.add('desativado');
        this.notificarEstadoCategoria(categoria, true);
      }

      // Clique no botão
      btn.addEventListener('click', () => {
        const desativadoAgora = !btn.classList.contains('desativado');
        
        btn.classList.toggle('desativado');
        localStorage.setItem(id, desativadoAgora);
        this.notificarEstadoCategoria(categoria, desativadoAgora);
        this.salvarConfiguracaoNoS3();

        if (desativadoAgora) {
          if (this.categoriaAtiva === categoria) {
            this.categoriaAtiva = null;
            container.innerHTML = '';
            container.style.display = 'none';
            this.modelModal.style.display = 'none';
            this.modelModal.innerHTML = '';
          }
        } else {
          this.categoriaAtiva = categoria;
          this.mostrarItens(categoria);
          container.style.display = 'flex';
          
          document.querySelectorAll(`.item-box[data-categoria="${categoria}"]`).forEach(item => {
            item.classList.remove('desativado');
          });
        }
      });

      // Efeito hover
      btn.addEventListener('mouseenter', () => {
        if (!btn.classList.contains('desativado') && this.categoriaAtiva !== categoria) {
          this.mostrarItens(categoria);
        }
      });
    });
  }

  // ==============================
  // FUNÇÕES PRINCIPAIS
  // ==============================

  /**
   * Mostra os itens de uma categoria
   * @param {string} categoria - Nome da categoria
   */
  mostrarItens(categoria) {
    const container = document.getElementById('itensContainer');
    if (!container || !objetos3D[categoria]) return;

    container.innerHTML = '';
    container.style.display = 'flex';

    objetos3D[categoria].forEach((nome, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-wrapper';

      const box = document.createElement('div');
      box.className = 'item-box';
      box.textContent = nome;
      box.setAttribute('data-categoria', categoria);
      box.style.animationDelay = `${i * 0.1}s`;
      box.setAttribute('data-nome', nome.toLowerCase().replace(/\s+/g,'_'));

      // Verifica estado no localStorage
      const idItem = `itemEstado_${categoria}_${nome}`;
      if (localStorage.getItem(idItem) === 'true') {
        box.classList.add('desativado');
      }

      // Click para ativar/desativar item e notificar o app AR
      box.addEventListener('click', () => {
        // alterna estado visual
        const desativadoAgora = box.classList.toggle('desativado');
        // grava no localStorage
        localStorage.setItem(idItem, desativadoAgora);
        // persiste no S3
        this.salvarConfiguracaoNoS3();
        // **nova linha**: notifica o canal para sincronizar no app AR
        this.canalStatus.postMessage({
          tipo:      'item',         // << informa que é um item
          categoria: categoria,      // << opcional, se você quiser
          nome:      nome.toLowerCase(),          
          visivel:   !desativadoAgora
        });
      });


      // Botão de configuração
      const btnConfig = document.createElement('button');
      btnConfig.className = 'btn-configurar-produto';
      btnConfig.textContent = 'Configuração';
      btnConfig.addEventListener('click', (e) => {
        e.stopPropagation();
        this.abrirModalConfiguracao(categoria, nome);
      });

      // Preview 3D no hover
      box.addEventListener('mouseenter', () => {
        if (box.classList.contains('desativado')) return;
        this.mostrarPreview3D(box, categoria, nome);
      });

      box.addEventListener('mouseleave', () => {
        this.modelModal.style.display = 'none';
        this.modelModal.innerHTML = '';
      });

      wrapper.appendChild(box);
      wrapper.appendChild(btnConfig);
      container.appendChild(wrapper);
    });

    this.adicionarPreview3D();
  }

  /**
   * Mostra o preview 3D de um item
   * @param {HTMLElement} elemento - Elemento DOM do item
   * @param {string} categoria - Categoria do item
   * @param {string} nome - Nome do item
   */
  mostrarPreview3D(elemento, categoria, nome) {
    const rect = elemento.getBoundingClientRect();
    this.modelModal.style.left = `${rect.right + 10}px`;
    this.modelModal.style.top = `${rect.top}px`;
    this.modelModal.style.display = 'block';

    const nomeArquivo = this.nomeParaArquivo(nome);
    const modelURL = `${this.MODEL_BASE_URL}${categoria}/${nomeArquivo}`;

    this.modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled: false" style="width: 100%; height: 300px;">
        <a-light type="ambient" intensity="1.0"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>
        <a-entity position="0 1 -3" rotation="0 0 0">
          <a-gltf-model 
            src="${modelURL}" 
            scale="1 1 1"
            rotation="0 0 0"
            animation="property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear"
          ></a-gltf-model>
        </a-entity>
        <a-camera position="0 2 0"></a-camera>
      </a-scene>
    `;
  }

  /**
   * Abre o modal de configuração para um item
   * @param {string} categoria - Categoria do item
   * @param {string} nome - Nome do item
   */
  async abrirModalConfiguracao(categoria, nome) {
    this.itemConfiguracao = `${categoria}/${nome.toLowerCase().replace(/\s+/g, '_')}`;
    const arquivo = this.itemConfiguracao.split('/')[1] + '.json';

    // Atualiza título do modal
    this.modalConfig.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;

    try {
      const res = await fetch(
        `https://ar-menu-models.s3.amazonaws.com/informacao/${arquivo}?v=${Date.now()}`
      );
      if (res.ok) {
        this.dadosRestaurante[this.itemConfiguracao] = await res.json();
      }
    } catch (error) {
      console.warn('Erro ao carregar configuração:', error);
    }

    // Preenche os campos
    const dados = this.dadosRestaurante[this.itemConfiguracao] || {};
    this.modalConfig.querySelector('#inputValor').value = dados.preco != null
      ? dados.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';
    this.modalConfig.querySelector('#inputDescricao').value = dados.descricao || '';

    // Mostra o modal
    this.modalConfig.style.display = 'flex';
  }

  /**
   * Salva a configuração do item atual
   */
  async salvarConfiguracao() {
    if (!this.itemConfiguracao) return;

    // Formata o valor
    const raw = this.modalConfig.querySelector('#inputValor').value;
    const preco = parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
    const descricao = this.modalConfig.querySelector('#inputDescricao').value.trim();

    // Atualiza cache local
    this.dadosRestaurante[this.itemConfiguracao] = { preco, descricao };

    // Salva no S3
    const arquivo = this.itemConfiguracao.split('/')[1] + '.json';
    try {
      await fetch(
        `https://ar-menu-models.s3.amazonaws.com/informacao/${arquivo}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.dadosRestaurante[this.itemConfiguracao])
        }
      );
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
    }
  }

  // ==============================
  // FUNÇÕES AUXILIARES
  // ==============================

  /**
   * Formata valor monetário durante a digitação
   * @param {Event} e - Evento de input
   */
  formatarValorMonetario(e) {
    let v = e.target.value.replace(/\D/g, '');
    v = (parseFloat(v) / 100).toFixed(2);
    v = v.replace('.', ',');
    v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    e.target.value = v;
  }

  /**
   * Converte nome do item para nome de arquivo
   * @param {string} nome - Nome do item
   * @returns {string} Nome do arquivo
   */
  nomeParaArquivo(nome) {
    return nome.trim().toLowerCase().replace(/\s+/g, '_') + '.glb';
  }

  /**
   * Notifica o estado de uma categoria
   * @param {string} categoria - Nome da categoria
   * @param {boolean} desativado - Se está desativada
   */
  notificarEstadoCategoria(categoria, desativado) {
    const canal = new BroadcastChannel('sincronizacao_categorias');
    canal.postMessage({
      acao: 'atualizar_botao',
      categoria: categoria,
      desativado: desativado
    });
  }

  // ==============================
  // GARÇONS E QR CODES
  // ==============================

  /**
   * Configura o cadastro de garçons
   */
  setupCadastroGarcons() {
    const inputQuantidade = document.getElementById('quantidadeGarcons');
    const btnMais = document.getElementById('btnMaisGarcom');
    const btnMenos = document.getElementById('btnMenosGarcom');
    const containerFormularios = document.getElementById('formularioGarcons');

    // Função de formatação otimizada
    function formatarCelular(value) {
      const digits = value.replace(/\D/g, '').substring(0, 11);
      if (!digits) return '';
      
      const size = digits.length;
      if (size < 3) return `(${digits}`;
      if (size < 6) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
      return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7,11)}`;
    }


    // Adiciona formatação com controle de cursor
    const adicionarEventoFormatacao = (input) => {
      input.addEventListener('input', (e) => {
        const target = e.target;
        const cursorPos = target.selectionStart;
        const valorOriginal = target.value;
        
        // Aplica formatação
        const valorFormatado = formatarCelular(valorOriginal);
        target.value = valorFormatado;
        
        // Calcula nova posição do cursor
        let novoCursorPos = cursorPos;
        const digitosRemovidos = valorOriginal.replace(/\D/g, '').length - 
                                valorFormatado.replace(/\D/g, '').length;
        
        if (digitosRemovidos > 0 && cursorPos > 0) {
          novoCursorPos = Math.max(0, cursorPos - digitosRemovidos);
        } else if (valorFormatado.length > valorOriginal.length) {
          novoCursorPos += (valorFormatado.length - valorOriginal.length);
        }
        
        novoCursorPos = Math.min(novoCursorPos, valorFormatado.length);
        target.setSelectionRange(novoCursorPos, novoCursorPos);
      });
    };

    // Validação simplificada
    const validarCampos = (form) => {
      const inputNome = form.querySelector('.nome-garcom');
      const inputTel = form.querySelector('.tel-garcom');
      const btnQr = form.querySelector('.btn-qr');
      
      const nomeValido = inputNome.value.trim().length > 0;
      const telValido = inputTel.value.replace(/\D/g, '').length >= 10;
      
      btnQr.disabled = !(nomeValido && telValido);
    };

    // Adiciona eventos de validação
    const adicionarEventosValidacao = (form) => {
      const inputNome = form.querySelector('.nome-garcom');
      const inputTel = form.querySelector('.tel-garcom');

      inputNome.addEventListener('input', () => validarCampos(form));
      inputTel.addEventListener('input', () => validarCampos(form));
    };

    // Gera os formulários de garçons
    const gerarFormulariosGarcons = (qtd) => {
      const dadosAtuais = {};
      containerFormularios.querySelectorAll('.form-garcom').forEach(form => {
        const id = form.querySelector('.nome-garcom').getAttribute('data-id');
        dadosAtuais[id] = {
          nome: form.querySelector('.nome-garcom').value,
          tel: form.querySelector('.tel-garcom').value
        };
      });

      containerFormularios.innerHTML = '';
      for (let i = 1; i <= qtd; i++) {
        const form = document.createElement('div');
        form.className = 'form-garcom';
        const nomeSalvo = dadosAtuais[i]?.nome || '';
        const telSalvo = dadosAtuais[i]?.tel || '';
        form.innerHTML = `
          <label>Garçom ${i}:</label><br>
          <input type="text" placeholder="Nome" class="nome-garcom" data-id="${i}" value="${nomeSalvo}">
          <input type="tel" placeholder="Telefone" class="tel-garcom" data-id="${i}" maxlength="15" value="${telSalvo}">
          <button class="btn-qr" data-id="${i}" disabled>Gerar QR Code</button>
        `;
        containerFormularios.appendChild(form);
        const inputTel = form.querySelector('.tel-garcom');
        adicionarEventoFormatacao(inputTel);
        adicionarEventosValidacao(form);
        validarCampos(form);
      }
    };

    // Event listeners
    inputQuantidade.addEventListener('change', () => {
      let val = parseInt(inputQuantidade.value);
      if (val < 1) val = 1;
      gerarFormulariosGarcons(val);
    });

    btnMais.addEventListener('click', () => {
      inputQuantidade.value = parseInt(inputQuantidade.value) + 1;
      inputQuantidade.dispatchEvent(new Event('change'));
    });

    btnMenos.addEventListener('click', () => {
      inputQuantidade.value = Math.max(1, parseInt(inputQuantidade.value) - 1);
      inputQuantidade.dispatchEvent(new Event('change'));
    });

    // Inicializa com 1 garçom
    gerarFormulariosGarcons(1);
  }

  /**
   * Configura o sistema de QR Codes
   */
  setupQrCodeGarcons() {
    const modalQrCode = document.getElementById('modalQrCode');
    const qrCodeContainer = document.getElementById('qrcodeContainer');
    const btnFecharModal = modalQrCode?.querySelector('.fechar-modal');
    const containerFormularios = document.getElementById('formularioGarcons');
    const inputQtdQr = document.getElementById('qtdQr');
    const btnMais = document.getElementById('aumentarQr');
    const btnMenos = document.getElementById('diminuirQr');
    const btnImprimir = document.getElementById('imprimirQr');

    if (!modalQrCode || !qrCodeContainer || !btnFecharModal || !containerFormularios || !inputQtdQr || !btnMais || !btnMenos || !btnImprimir) {
      console.error('Elementos do QR Code não encontrados.');
      return;
    }

    // Gera QR Codes
    const gerarQRCodes = (nome, quantidade, id) => {
      qrCodeContainer.innerHTML = '';

      for (let i = 1; i <= quantidade; i++) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('qrcode-wrapper');

        const qrDiv = document.createElement('div');
        qrDiv.id = `qr-${id}-${i}`;
        qrDiv.classList.add('qrcode');

        const label = document.createElement('div');
        label.classList.add('mesa-label');
        label.innerText = `Mesa ${i}`;

        wrapper.appendChild(qrDiv);
        wrapper.appendChild(label);
        qrCodeContainer.appendChild(wrapper);

        const urlPedido = `https://arcardapio-site.s3.us-east-1.amazonaws.com/app/app.html?v=${Date.now()}`;

        new QRCode(qrDiv, {
          text: urlPedido,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    };

    // Atualiza QR Codes ativos
    const atualizarQRCodesAtivos = (id) => {
      const nomeInput = containerFormularios.querySelector(`.nome-garcom[data-id="${id}"]`);
      if (!nomeInput) return;

      const nome = nomeInput.value.trim() || `garcom${id}`;
      const quantidade = parseInt(inputQtdQr.value);
      if (isNaN(quantidade) || quantidade < 1) return;

      gerarQRCodes(nome, quantidade, id);
      modalQrCode.classList.add('ativo');
    };

    // Controles de quantidade
    btnMais.addEventListener('click', () => {
      let val = parseInt(inputQtdQr.value);
      if (isNaN(val)) val = 1;
      if (val < 99) {
        inputQtdQr.value = val + 1;
        if (this.currentGarcomId) atualizarQRCodesAtivos(this.currentGarcomId);
      }
    });

    btnMenos.addEventListener('click', () => {
      let val = parseInt(inputQtdQr.value);
      if (isNaN(val)) val = 1;
      if (val > 1) {
        inputQtdQr.value = val - 1;
        if (this.currentGarcomId) atualizarQRCodesAtivos(this.currentGarcomId);
      }
    });

    inputQtdQr.addEventListener('input', () => {
      if (this.currentGarcomId) atualizarQRCodesAtivos(this.currentGarcomId);
    });

    // Geração inicial de QR Code
    containerFormularios.addEventListener('click', (e) => {
      const btnQr = e.target.closest('.btn-qr');
      if (!btnQr || btnQr.disabled) return;

      const id = btnQr.getAttribute('data-id');
      if (!id) return;

      this.currentGarcomId = id;
      atualizarQRCodesAtivos(id);
    });

    // Fechar modal
    btnFecharModal.addEventListener('click', () => {
      modalQrCode.classList.remove('ativo');
      qrCodeContainer.innerHTML = '';
      this.currentGarcomId = null;
    });

    window.addEventListener('click', (e) => {
      if (e.target === modalConfig) {
        modalConfig.classList.remove('active');
      }
    });


    // Impressão
    btnImprimir.addEventListener('click', () => {
      if (!qrCodeContainer.innerHTML.trim()) return alert('Gere os QR Codes antes de imprimir.');

      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Imprimir QR Codes</title>
            <style>
              body { margin: 20px; display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
              .qrcode-wrapper { text-align: center; margin-bottom: 16px; }
              .mesa-label { font-weight: bold; margin-top: 8px; font-size: 16px; }
            </style>
          </head>
          <body>
            ${qrCodeContainer.innerHTML}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
      printWindow.close();
    });
  }

  // ==============================
  // SINCRONIZAÇÃO E CONFIGURAÇÕES
  // ==============================

  /**
   * Configura a sincronização com o app AR
   */
  configurarSincronizacao() {
    // Envia para o app
    // dentro de configurarSincronizacao()
    this.canalStatus.onmessage = (event) => {
      const { nome, visivel } = event.data;
      // agora vai achar o elemento que você marcou acima:
      const el = document.querySelector(`[data-nome="${nome}"]`);
      if (!el) return;
      if (visivel) {
        el.style.display = '';    // ou inline-block/flex, que for o caso
      } else {
        el.style.display = 'none';
      }
    };
  }

  /**
 * Salva as configurações de categorias e itens no S3
 */
async salvarConfiguracaoNoS3() {
  // 1) Configurações de categorias
  const botoes = document.querySelectorAll('#dropdownCardapio .btn-categoria');
  const configCats = {};
  botoes.forEach(b => {
    const cat = b.getAttribute('data-categoria');
    configCats[cat] = !b.classList.contains('desativado');
  });

  try {
    await fetch(this.ARQUIVO_CONFIG_CATEGORIAS, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configCats)
    });
  } catch (e) {
    console.error('Erro ao salvar categorias no S3:', e);
  }

  // 2) Configurações de itens (todos os itens desativados)
  const desat = {};
  // `objetos3D` deve conter todas as categorias → array de nomes originais
  Object.keys(objetos3D).forEach(cat => {
    objetos3D[cat].forEach(nome => {
      const chaveLS = `itemEstado_${cat}_${nome}`;
      if (localStorage.getItem(chaveLS) === 'true') {
        if (!desat[cat]) desat[cat] = [];
        desat[cat].push(nome.toLowerCase().replace(/\s+/g, '_'));
      }
    });
  });

  try {
    await fetch(this.ARQUIVO_CONFIG_ITENS, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(desat)
    });
  } catch (e) {
    console.error('Erro ao salvar itens desativados no S3:', e);
  }
}

  /**
   * Carrega as configurações iniciais
   */
  async carregarConfiguracoesIniciais() {
    try {
      // Carrega categorias
      const resCategorias = await fetch(`${this.ARQUIVO_CONFIG_CATEGORIAS}?v=${Date.now()}`);
      if (resCategorias.ok) {
        const categorias = await resCategorias.json();
        Object.entries(categorias).forEach(([categoria, visivel]) => {
          const btn = document.querySelector(`#dropdownCardapio button[data-categoria="${categoria}"]`);
          if (btn) {
            if (!visivel) {
              btn.classList.add('desativado');
              localStorage.setItem(`btnEstado_${categoria}`, 'true');
            }
          }
        });
      }

      // Carrega itens desativados
      const resItens = await fetch(`${this.ARQUIVO_CONFIG_ITENS}?v=${Date.now()}`);
      if (resItens.ok) {
        const itensDesativados = await resItens.json();
        Object.entries(itensDesativados).forEach(([categoria, itens]) => {
          itens.forEach(nomeItem => {
            const nomeFormatado = nomeItem.replace(/_/g, ' ');
            localStorage.setItem(`itemEstado_${categoria}_${nomeFormatado}`, 'true');
          });
        });
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
    }
  }
}

// Inicializa o sistema quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  new SistemaCardapio();
});