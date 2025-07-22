// ==============================
// home.js - Sistema de Cardápio Digital Completo
// ==============================

class SistemaCardapio {
  constructor() {
    // ------------------------------
    // Propriedades iniciais
    // ------------------------------
    this.nomeRestaurante = 'restaurante-001';
    this.itemConfiguracao = null;
    this.dadosRestaurante = {};
    this.categoriaAtiva = null;
    this.currentGarcomId = null;
    this.MODEL_BASE_URL = 'https://ar-menu-models.s3.amazonaws.com/';
    this.ARQUIVO_CONFIG_CATEGORIAS = `${this.MODEL_BASE_URL}configuracoes/${this.nomeRestaurante}.json`;
    this.ARQUIVO_CONFIG_ITENS = `${this.MODEL_BASE_URL}configuracoes/${this.nomeRestaurante}-itens.json`;

    // ------------------------------
    // Inicialização dos componentes
    // ------------------------------
    this.inicializarModalConfiguracao();
    this.inicializarModalPreview3D();
    this.configurarEventosCardapio();
    this.setupCadastroGarcons();
    this.setupQrCodeGarcons();

    // ------------------------------
    // Sincronização com o app AR
    // ------------------------------
    this.canalStatus = new BroadcastChannel('cardapio_channel');
    this.configurarSincronizacao();

    // ------------------------------
    // Carregamento inicial de configurações de categorias e itens
    // ------------------------------
    this.carregarConfiguracoesIniciais();
  }

  // ==============================
  // 1. MODAIS
  // ==============================

  inicializarModalConfiguracao() {
    // Cria e injeta o container do modal
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

    // Fecha ao clicar no "×"
    this.modalConfig.querySelector('.close-edicao').addEventListener('click', () => {
      this.modalConfig.style.display = 'none';
    });

    // Impede fechamento ao clicar dentro do conteúdo
    this.modalConfig.querySelector('.modal-content-edicao').addEventListener('click', (event) => {
      event.stopPropagation();
    });

    // ADICIONE ESTE CÓDIGO NOVAMENTE (com modificações):
    const inputValor = this.modalConfig.querySelector('#inputValor');
    const inputDescricao = this.modalConfig.querySelector('#inputDescricao');

    // Mantém APENAS a formatação (sem auto-save)
    inputValor.addEventListener('input', (event) => {
      this.formatarValorMonetario(event);
    });

    // NOVO EVENT LISTENER PARA O BOTÃO SALVAR:
    // NOVO EVENT LISTENER PARA O BOTÃO SALVAR:
    this.modalConfig.querySelector('#btnSalvarModal').addEventListener('click', async (e) => {
      e.preventDefault();
      
      try {
        const salvou = await this.salvarConfiguracao(true);
        if (salvou) {
          this.modalConfig.style.display = 'none';
          // Adicione qualquer feedback visual de sucesso aqui se necessário
        }
      } catch (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar as configurações: ' + error.message);
      }
    });

    // MODIFIQUE O LISTENER DO BOTÃO FECHAR (X):
    this.modalConfig.querySelector('.close-edicao').addEventListener('click', () => {
      this.modalConfig.style.display = 'none';
      this.itemConfiguracao = null; // Reseta o item sendo configurado
    });
  }

  inicializarModalPreview3D() {
    this.modelModal = document.createElement('div');
    this.modelModal.className = 'model-preview-modal';
    this.modelModal.style.display = 'none';
    document.body.appendChild(this.modelModal);
  }

  // ==============================
  // 2. EVENTOS DO CARDÁPIO
  // ==============================

  configurarEventosCardapio() {
    const profileButton = document.getElementById('profile-btn');
    const cardapioButton = document.getElementById('cardapio-btn');
    const dropdownCardapio = document.getElementById('dropdownCardapio');
    const container = document.getElementById('itensContainer');

    // Evento do botão de perfil
    if (profileButton) {
      profileButton.addEventListener('click', () => {
        window.location.href = 'perfil.html';
      });
    }

    // Evento do botão do cardápio
    if (cardapioButton && dropdownCardapio) {
      cardapioButton.addEventListener('click', () => {
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
    document.querySelectorAll('#dropdownCardapio button').forEach(button => {
      const categoria = button.getAttribute('data-categoria');
      const id = 'btnEstado_' + categoria;

      // Estado inicial do localStorage
      const estaDesativado = localStorage.getItem(id) === 'true';
      if (estaDesativado) {
        button.classList.add('desativado');
        this.notificarEstadoCategoria(categoria, true);
      }

      // Clique no botão
      button.addEventListener('click', () => {
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
          
          document.querySelectorAll(`.item-box[data-categoria="${categoria}"]`).forEach(item => {item.classList.remove('desativado');
          });
        }
      });

      // Efeito hover
      button.addEventListener('mouseenter', () => {
        if (!button.classList.contains('desativado') && this.categoriaAtiva !== categoria) { this.mostrarItens(categoria);}
      });
    });
  }

  // ==============================
  // 3. EXIBIÇÃO DE ITENS E PREVIEW 3D
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
      box.setAttribute('data-nome', nome.toLowerCase().replace(/\s+/g,'_'));

      // Verifica estado no localStorage
      const idItem = `itemEstado_${categoria}_${nome}`;
      if (localStorage.getItem(idItem) === 'true') {
        box.classList.add('desativado');
      }

      // Click para ativar/desativar item e notificar o app AR
      box.addEventListener('click', () => {
        const desativadoAgora = box.classList.toggle('desativado');
        localStorage.setItem(idItem, desativadoAgora);
        this.salvarConfiguracaoNoS3();
        this.canalStatus.postMessage({
          nome: nome,
          visivel: !desativadoAgora
        });
      });

      // Botão de configuração
      const botaoConfigurar = document.createElement('button');
      botaoConfigurar.className = 'btn-configurar-produto';
      botaoConfigurar.textContent = 'Configuração';
      botaoConfigurar.addEventListener('click', (event) => {
        event.stopPropagation();
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
      wrapper.appendChild(botaoConfigurar);
      container.appendChild(wrapper);
    });
  }

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

  async salvarConfiguracao(confirmado = false) {
  // Só salva se for chamado com confirmado=true e tiver um item selecionado
  if (!this.itemConfiguracao || !confirmado) {
    return false; // Retorna false quando não salva
  }

  try {
    const inputValor = this.modalConfig.querySelector('#inputValor');
    const inputDescricao = this.modalConfig.querySelector('#inputDescricao');
    
    // Validação dos campos
    if (!inputValor || !inputDescricao) {
      throw new Error('Campos de configuração não encontrados');
    }

    const valorTexto = inputValor.value;
    const preco = parseFloat(valorTexto.replace(/\./g, '').replace(',', '.')) || 0;
    const descricao = inputDescricao.value.trim();

    const [categoria, nomeProduto] = this.itemConfiguracao.split('/');
    const nomeArquivo = `${nomeProduto}.json`;
    
    const dadosAtualizados = {
      preco: preco,
      descricao: descricao,
      ultimaAtualizacao: new Date().toISOString()
    };

    const urlCompleta = `${this.MODEL_BASE_URL}informacao/${nomeArquivo}`;

    const resposta = await fetch(urlCompleta, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-amz-acl': 'bucket-owner-full-control'
      },
      body: JSON.stringify(dadosAtualizados)
    });

    if (!resposta.ok) {
      throw new Error(`Erro ${resposta.status}: ${await resposta.text()}`);
    }

    // Atualiza o cache local
    this.dadosRestaurante[this.itemConfiguracao] = dadosAtualizados;
    return true; // Retorna true quando salva com sucesso
    
  } catch (erro) {
    console.error('Falha ao salvar configuração:', erro);
    throw erro; // Re-lança o erro para ser tratado pelo chamador
  }
}

  // ==============================
  // 4. CONFIGURAÇÃO DE ITENS (Modal)
  // ==============================

  async abrirModalConfiguracao(categoria, nome) {
    // 1. Formata o nome do arquivo JSON
    const nomeFormatado = nome.toLowerCase().replace(/\s+/g, '_');
    this.itemConfiguracao = `${categoria}/${nomeFormatado}`;
    const arquivoJson = `${nomeFormatado}.json`;
    
    // 2. Atualiza o título do modal
    this.modalConfig.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;
    
    // 3. Tenta carregar os dados do S3
    let dadosProduto = { preco: 0, descricao: '' };
    const urlJson = `${this.MODEL_BASE_URL}informacao/${arquivoJson}?v=${Date.now()}`;
    
    try {
      console.log(`Buscando configuração do produto em: ${urlJson}`);
      const resposta = await fetch(urlJson);
      
      if (resposta.ok) {
        dadosProduto = await resposta.json();
        console.log('Dados do produto carregados:', dadosProduto);
      } else if (resposta.status === 404) {
        console.log('Arquivo de configuração não encontrado, usando valores padrão');
      } else {
        console.warn('Erro ao buscar configuração:', resposta.status, resposta.statusText);
      }
    } catch (erro) {
      console.error('Falha ao carregar configuração:', erro);
    }
    
    // 4. Preenche os campos do modal
    const inputValor = this.modalConfig.querySelector('#inputValor');
    const inputDescricao = this.modalConfig.querySelector('#inputDescricao');
    
    // Formata o preço para exibição
    inputValor.value = typeof dadosProduto.preco === 'number' 
      ? dadosProduto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';
    
    // Preenche a descrição (ou string vazia se não existir)
    inputDescricao.value = dadosProduto.descricao || '';
    
    // 5. Atualiza o cache local
    this.dadosRestaurante[this.itemConfiguracao] = dadosProduto;
    
    // 6. Exibe o modal
    this.modalConfig.style.display = 'flex';
  }

  // No seu home.js, atualize a função salvarConfiguracao:
  async testarConexaoS3() {
  try {
    const urlTeste = `${this.MODEL_BASE_URL}test-connection.txt`;
    const resposta = await fetch(urlTeste, {
      method: 'PUT',
      headers: {'Content-Type': 'text/plain'},
      body: 'teste de conexão'
    });
    
    console.log('Teste S3:', resposta.status, await resposta.text());
  } catch (erro) {
    console.error('Falha no teste S3:', erro);
  }
}

  // ==============================
  // 5. UTILITÁRIOS
  // ==============================

  formatarValorMonetario(evento) {
    let valor = evento.target.value.replace(/\D/g, '');
    valor = (parseFloat(valor) / 100).toFixed(2);
    valor = valor.replace('.', ',');
    valor = valor.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    evento.target.value = valor;
  }

  nomeParaArquivo(nome) {
    return nome.trim().toLowerCase().replace(/\s+/g, '_') + '.glb';
  }

  notificarEstadoCategoria(categoria, desativado) {
    const canal = new BroadcastChannel('sincronizacao_categorias');
    canal.postMessage({
      acao: 'atualizar_botao',
      categoria: categoria,
      desativado: desativado
    });
  }

  // ==============================
  // 6. SINCRONIZAÇÃO COM O APP AR
  // ==============================

  configurarSincronizacao() {
    this.canalStatus.onmessage = (evento) => {
      const { nome, visivel } = evento.data;
      const elemento = document.querySelector(`[data-nome="${nome}"]`);
      if (!elemento) return;
      elemento.style.display = visivel ? '' : 'none';
    };
  }

  // ==============================
  // 7. CATEGORIAS E ITENS → S3
  // ==============================

  async salvarConfiguracaoNoS3() {
    // 1. Salva configurações de categorias
    const botoesCategoria = document.querySelectorAll('#dropdownCardapio .btn-categoria');
    const configuracoesCategoria = {};

    botoesCategoria.forEach(botao => {
      const categoria = botao.getAttribute('data-categoria');
      configuracoesCategoria[categoria] = !botao.classList.contains('desativado');
    });

    try {
      await fetch(this.ARQUIVO_CONFIG_CATEGORIAS, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configuracoesCategoria)
      });
    } catch (erro) {
      console.error('Erro ao salvar configurações de categoria:', erro);
    }

    // 2. Salva itens desativados
    const itensDesativados = {};
    Object.keys(objetos3D).forEach(categoria => {
      objetos3D[categoria].forEach(nomeItem => {
        const chaveLocalStorage = `itemEstado_${categoria}_${nomeItem}`;
        if (localStorage.getItem(chaveLocalStorage) === 'true') {
          if (!itensDesativados[categoria]) {
            itensDesativados[categoria] = [];
          }
          itensDesativados[categoria].push(nomeItem.toLowerCase().replace(/\s+/g, '_'));
        }
      });
    });

    try {
      await fetch(this.ARQUIVO_CONFIG_ITENS, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itensDesativados)
      });
    } catch (erro) {
      console.error('Erro ao salvar itens desativados:', erro);
    }
  }

  // ==============================
  // 8. CARREGAMENTO INICIAL
  // ==============================

  async carregarConfiguracoesIniciais() {
    try {
      // Carrega configurações de categoria
      const respostaCategorias = await fetch(`${this.ARQUIVO_CONFIG_CATEGORIAS}?v=${Date.now()}`);
      if (respostaCategorias.ok) {const categorias = await respostaCategorias.json();
        Object.entries(categorias).forEach(([categoria, visivel]) => {
          const botao = document.querySelector(`#dropdownCardapio button[data-categoria="${categoria}"]`);
          if (botao && !visivel) {
            botao.classList.add('desativado');
            localStorage.setItem(`btnEstado_${categoria}`, 'true');
          }
        });
      }

      // Carrega itens desativados
      const respostaItens = await fetch(`${this.ARQUIVO_CONFIG_ITENS}?v=${Date.now()}`);
      if (respostaItens.ok) {
        const itensDesativados = await respostaItens.json();
        Object.entries(itensDesativados).forEach(([categoria, itens]) => {
          itens.forEach(nomeItem => {
            const chave = `itemEstado_${categoria}_${nomeItem.replace(/_/g, ' ')}`;
            localStorage.setItem(chave, 'true');
          });
        });
      }
    } catch (erro) {
      console.error('Erro ao carregar configurações iniciais:', erro);
    }
  }

  // ==============================
  // 9. CADASTRO DE GARÇONS
  // ==============================

  setupCadastroGarcons() {
    const inputQuantidade = document.getElementById('quantidadeGarcons');
    const botaoMais = document.getElementById('btnMaisGarcom');
    const botaoMenos = document.getElementById('btnMenosGarcom');
    const containerFormularios = document.getElementById('formularioGarcons');

    // Função para formatar número de celular
    const formatarCelular = (valor) => {
      valor = valor.replace(/\D/g, '');
      valor = valor.substring(0, 11);
      if (valor.length > 6) {
        valor = valor.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
      } else if (valor.length > 2) {
        valor = valor.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
      } else if (valor.length > 0) {
        valor = valor.replace(/^(\d{0,2})/, '($1');
      }
      return valor;
    };

    // Valida os campos do formulário
    const validarFormulario = (formulario) => {
      const inputNome = formulario.querySelector('.nome-garcom');
      const inputTelefone = formulario.querySelector('.tel-garcom');
      const botaoQR = formulario.querySelector('.btn-qr');
      
      const nomeValido = inputNome.value.trim().length > 0;
      const telefoneValido = inputTelefone.value.replace(/\D/g, '').length >= 10;
      
      botaoQR.disabled = !(nomeValido && telefoneValido);
    };

    // Gera os formulários de garçons
    const gerarFormularios = (quantidade) => {
      const dadosSalvos = {};
      
      // Coleta dados existentes
      containerFormularios.querySelectorAll('.form-garcom').forEach(formulario => {
        const id = formulario.querySelector('.nome-garcom').dataset.id;
        dadosSalvos[id] = {nome: formulario.querySelector('.nome-garcom').value,telefone: formulario.querySelector('.tel-garcom').value};
      });

      containerFormularios.innerHTML = '';
      
      for (let i = 1; i <= quantidade; i++) {
        const formulario = document.createElement('div');
        formulario.className = 'form-garcom';
        
        const dados = dadosSalvos[i] || { nome: '', telefone: '' };
        
        formulario.innerHTML = `
          <label>Garçom ${i}:</label><br>
          <input type="text" class="nome-garcom" data-id="${i}" placeholder="Nome" value="${dados.nome}">
          <input type="tel" class="tel-garcom" data-id="${i}" maxlength="15" placeholder="Telefone" value="${dados.telefone}">
          <button class="btn-qr" data-id="${i}" disabled>Gerar QR Code</button>
        `;
        
        containerFormularios.appendChild(formulario);
        
        const inputTelefone = formulario.querySelector('.tel-garcom');
        
        // Adiciona formatação ao telefone
        inputTelefone.addEventListener('input', (evento) => {
          const posicaoCursor = inputTelefone.selectionStart;
          const valorAnterior = inputTelefone.value;
          
          inputTelefone.value = formatarCelular(inputTelefone.value);
          
          // Ajusta a posição do cursor após formatação
          const diferenca = inputTelefone.value.length - valorAnterior.length;
          inputTelefone.setSelectionRange(posicaoCursor + diferenca, posicaoCursor + diferenca);
          
          validarFormulario(formulario);
        });
        
        // Validação ao digitar nome
        formulario.querySelector('.nome-garcom').addEventListener('input', () => {validarFormulario(formulario)});
        
        // Validação inicial
        validarFormulario(formulario);
      }
    };

    // Event listeners
    inputQuantidade.addEventListener('change', () => {
      let valor = parseInt(inputQuantidade.value);
      if (isNaN(valor) || valor < 1) valor = 1;
      inputQuantidade.value = valor;
      gerarFormularios(valor);
    });

    botaoMais.addEventListener('click', () => {
      inputQuantidade.value = parseInt(inputQuantidade.value) + 1;
      inputQuantidade.dispatchEvent(new Event('change'));
    });

    botaoMenos.addEventListener('click', () => {
      inputQuantidade.value = Math.max(1, parseInt(inputQuantidade.value) - 1);
      inputQuantidade.dispatchEvent(new Event('change'));
    });

    // Inicializa com 1 formulário
    gerarFormularios(1);
  }

  // ==============================
  // 10. QR CODES DE GARÇONS
  // ==============================

  setupQrCodeGarcons() {
    const modalQR = document.getElementById('modalQrCode');
    const containerQR = document.getElementById('qrcodeContainer');
    const botaoFechar = modalQR.querySelector('.fechar-modal');
    const formularios = document.getElementById('formularioGarcons');
    const inputQuantidade = document.getElementById('qtdQr');
    const botaoMais = document.getElementById('aumentarQr');
    const botaoMenos = document.getElementById('diminuirQr');
    const botaoImprimir = document.getElementById('imprimirQr');

    if (!modalQR || !containerQR || !botaoFechar || !formularios || !inputQuantidade || !botaoMais || !botaoMenos || !botaoImprimir) {
      console.error('Elementos do QR Code não encontrados.');
      return;
    }

    // Gera QR Codes
    const gerarQRCodes = (nome, quantidade) => {
      containerQR.innerHTML = '';
      
      for (let i = 1; i <= quantidade; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'qrcode-wrapper';
        
        const divQR = document.createElement('div');
        divQR.className = 'qrcode';
        divQR.id = `qr-${i}`;
        
        const label = document.createElement('div');
        label.className = 'mesa-label';
        label.textContent = `Mesa ${i}`;
        
        wrapper.appendChild(divQR);
        wrapper.appendChild(label);
        containerQR.appendChild(wrapper);
        
        // Gera o QR Code
        new QRCode(divQR, {
          text: `https://arcardapio-site.s3.us-east-1.amazonaws.com/app/app.html?v=${Date.now()}`,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    };

    // Atualiza QR Codes quando muda a quantidade
    const atualizarQRCodes = () => {
      if (!this.currentGarcomId) return;
      
      const formulario = formularios.querySelector(`.form-garcom .nome-garcom[data-id="${this.currentGarcomId}"]`)?.closest('.form-garcom');
      if (!formulario) return;
      
      const nome = formulario.querySelector('.nome-garcom').value.trim() || `Garçom ${this.currentGarcomId}`;
      const quantidade = parseInt(inputQuantidade.value) || 1;
      
      gerarQRCodes(nome, quantidade);
    };

    // Geração inicial de QR Code
    formularios.addEventListener('click', (evento) => {
      const botaoQR = evento.target.closest('.btn-qr');
      if (!botaoQR || botaoQR.disabled) return;
      
      this.currentGarcomId = botaoQR.dataset.id;
      atualizarQRCodes();
      modalQR.classList.add('ativo');
    });

    // Controles de quantidade
    inputQuantidade.addEventListener('input', atualizarQRCodes);
    
    botaoMais.addEventListener('click', () => {
      inputQuantidade.value = (parseInt(inputQuantidade.value) || 1) + 1;
      inputQuantidade.dispatchEvent(new Event('input'));
    });
    
    botaoMenos.addEventListener('click', () => {
      inputQuantidade.value = Math.max(1, (parseInt(inputQuantidade.value) || 1) - 1);
      inputQuantidade.dispatchEvent(new Event('input'));
    });

    // Fechar modal
    botaoFechar.addEventListener('click', () => {
      modalQR.classList.remove('ativo');
      containerQR.innerHTML = '';
      this.currentGarcomId = null;
    });

    // Fechar ao clicar fora
    modalQR.addEventListener('click', (evento) => {
      if (evento.target === modalQR) {
        modalQR.classList.remove('ativo');
        containerQR.innerHTML = '';
        this.currentGarcomId = null;
      }
    });

    // Impressão
    botaoImprimir.addEventListener('click', () => {
      if (!containerQR.innerHTML.trim()) {
        alert('Gere os QR Codes antes de imprimir.');
        return;
      }

      const janelaImpressao = window.open('', '_blank');
      janelaImpressao.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Imprimir QR Codes</title>
            <style>
              body { 
                margin: 0;
                padding: 20px;
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 20px;
              }
              .qrcode-wrapper {
                text-align: center;
                page-break-inside: avoid;
              }
              .mesa-label {
                font-weight: bold;
                margin-top: 8px;
                font-size: 16px;
              }
              @page {
                size: auto;
                margin: 10mm;
              }
            </style>
          </head>
          <body>
            ${containerQR.innerHTML}
          </body>
        </html>
      `);
      janelaImpressao.document.close();
      janelaImpressao.focus();
      
      // Espera um pouco antes de imprimir para garantir que o conteúdo foi carregado
      setTimeout(() => {
        janelaImpressao.print();
        janelaImpressao.close();
      }, 500);
    });
  }
}

// Inicializa o sistema quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  new SistemaCardapio();
});