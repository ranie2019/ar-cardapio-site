// ==============================
// home1.js - Configuração Inicial, Modais e Eventos
// ==============================

class SistemaCardapioBase {
  constructor() {
    // ------------------------------
    // Verificação de sessão e carregamento do nome da empresa
    // ------------------------------
    this.verificarSessao();
    // Chamar carregarNomeEmpresa apenas se a sessão for válida
    if (localStorage.getItem("authToken")) {
      this.carregarNomeEmpresa();
    }

    // ------------------------------
    // Propriedades iniciais
    // ------------------------------
    this.nomeRestaurante = this.obterNomeRestaurante();
    this.MODEL_BASE_URL = `https://site-arcardapio.s3.us-east-1.amazonaws.com/modelos3d/${this.nomeRestaurante}/`;
    this.ARQUIVO_CONFIG_CATEGORIAS = `https://ar-cardapio-models.s3.amazonaws.com/informacao/${this.nomeRestaurante}/config.json`;
    this.ARQUIVO_CONFIG_ITENS      = `https://ar-cardapio-models.s3.amazonaws.com/informacao/${this.nomeRestaurante}/itens.json`;

    this.dadosRestaurante = {};
    this.categoriaAtiva = null;
    this.itemConfiguracao = null;
    this.escalaAtual = 1;
    this.previewFecharTimeout = null;
    this.previewItemAtual = null;

    // Canais de comunicação
    this.canalStatus = new BroadcastChannel('status-itens');
    this.canalCategorias = new BroadcastChannel('status-categorias');

    // ------------------------------
    // Inicialização
    // ------------------------------
    this.inicializarModalConfiguracao();
    this.inicializarModalPreview3D();
    this.configurarEventosCardapio();
  }

  // ==============================
  // VERIFICAÇÃO DE SESSÃO
  // ==============================
  verificarSessao() {
    const authToken = localStorage.getItem("authToken");
    if (!authToken) {
      window.location.href = "../html/login.html";
      return;
    }
  }

  // ==============================
  // CARREGAR NOME DA EMPRESA
  // ==============================
  async carregarNomeEmpresa() {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) return;

    try {
      const response = await fetch(`https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com/prod/verify`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });

      if (response.ok) {
        const userData = await response.json();
        if (userData && userData.user && userData.user.nome) {
          const perfilTextoElement = document.getElementById('perfil-texto');
          if (perfilTextoElement) {
            const primeiroNome = userData.user.nome.split(' ')[0];
            perfilTextoElement.innerHTML = `Perfil ▼<br><small style="font-size: 12px; color: #ccc;">${primeiroNome}</small>`;
          }
        }
      } else {
        console.error('Erro ao carregar dados do usuário:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Erro na requisição para carregar dados do usuário:', error);
    }
  }

  // ==============================
  // OBTER NOME DO RESTAURANTE
  // ==============================
  obterNomeRestaurante() {
    const userEmail = localStorage.getItem("userEmail");
    if (!userEmail) {
      console.error("E-mail do usuário não encontrado no localStorage");
      return "restaurante-padrao";
    }
    return userEmail.replace(/[@.]/g, '-').toLowerCase();
  }

  // ==============================
  // Helpers
  // ==============================
  gerarChaveItem(categoria, nome) {
    return `itemEstado_${categoria}_${nome.trim().toLowerCase()}`;
  }

  nomeParaSlug(nome) {
    return nome.trim().toLowerCase().replace(/\s+/g, '_');
  }

  nomeParaArquivo(nome) {
    return this.nomeParaSlug(nome) + '.glb';
  }

  // ==============================
  // 1. MODAIS
  // ==============================
  inicializarModalConfiguracao() {
    this.modalConfig = document.createElement('div');
    this.modalConfig.id = 'modalConfiguracaoProduto';
    this.modalConfig.className = 'modal-edicao';
    this.modalConfig.style.display = 'none';
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
    document.body.appendChild(this.modalConfig);

    // Impede fechamento ao clicar dentro do conteúdo
    this.modalConfig.querySelector('.modal-content-edicao')
      .addEventListener('click', (event) => event.stopPropagation());

    // Formatação monetária
    const inputValor = this.modalConfig.querySelector('#inputValor');
    inputValor.addEventListener('input', (event) => this.formatarValorMonetario(event));

    // Salvar
    this.modalConfig.querySelector('#btnSalvarModal').addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const salvou = await this.salvarConfiguracao(true);
        if (salvou) this.modalConfig.style.display = 'none';
      } catch (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar as configurações: ' + error.message);
      }
    });

    // Fechar (X)
    this.modalConfig.querySelector('.close-edicao').addEventListener('click', () => {
      this.modalConfig.style.display = 'none';
      this.itemConfiguracao = null;
    });
  }

  inicializarModalPreview3D() {
    this.modelModal = document.createElement('div');
    this.modelModal.className = 'model-preview-modal';
    this.modelModal.style.display = 'none';
    document.body.appendChild(this.modelModal);

    // Se o mouse entrar no modal de preview, cancela o fechamento agendado
    this.modelModal.addEventListener('mouseenter', () => {
      if (this.previewFecharTimeout) clearTimeout(this.previewFecharTimeout);
    });
  }

  // ==============================
  // 2. EVENTOS DO CARDÁPIO
  // ==============================
configurarEventosCardapio() {
  const cardapioButton   = document.getElementById('cardapio-btn');
  const dropdownCardapio = document.getElementById('dropdownCardapio');
  const container        = document.getElementById('itensContainer');

  // Cardápio: toggle apenas no clique do botão
  if (cardapioButton && dropdownCardapio) {
    cardapioButton.addEventListener('click', (e) => {
      e.stopPropagation();
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

    // Fechar dropdown do cardápio quando clicar fora
    document.addEventListener('click', (e) => {
      if (dropdownCardapio &&
          !dropdownCardapio.contains(e.target) &&
          e.target !== cardapioButton) {
        dropdownCardapio.classList.remove('show');
        container.style.display = 'none';
        container.innerHTML = '';
        this.categoriaAtiva = null;
        this.modelModal.style.display = 'none';
        this.modelModal.innerHTML = '';
      }
    });
  }

  // --- Delegação de eventos: QUALQUER botão com data-categoria ---
  const dropdown = document.getElementById('dropdownCardapio');
  if (!dropdown) return;

  // Clique nas categorias
  dropdown.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-categoria]');
    if (!button || !dropdown.contains(button)) return;

    const categoria       = button.getAttribute('data-categoria');
    const id              = 'btnEstado_' + categoria;
    const desativadoAgora = !button.classList.contains('desativado');

    button.classList.toggle('desativado');
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
      document.querySelectorAll(`.item-box[data-categoria="${categoria}"]`)
        .forEach(item => item.classList.remove('desativado'));
    }
  });

  // Hover das categorias (preview itens)
  dropdown.addEventListener('mouseover', (e) => {
    const button = e.target.closest('button[data-categoria]');
    if (!button || !dropdown.contains(button)) return;

    const categoria = button.getAttribute('data-categoria');
    if (!button.classList.contains('desativado') && this.categoriaAtiva !== categoria) {
      this.mostrarItens(categoria);
    }
  });
}

  // ==============================
  // UTILITÁRIOS
  // ==============================
  formatarValorMonetario(evento) {
    let valor = evento.target.value.replace(/\D/g, '');
    valor = (parseFloat(valor) / 100).toFixed(2);
    valor = valor.replace('.', ',');
    valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    evento.target.value = valor;
  }

  notificarEstadoCategoria(categoria, desativado) {
    this.canalCategorias.postMessage({
      acao: 'atualizar_botao',
      categoria,
      desativado
    });
  }
}
