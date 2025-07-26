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
    this.MODEL_BASE_URL = 'https://ar-cardapio-models.s3.amazonaws.com/';
    this.ARQUIVO_CONFIG_CATEGORIAS = `${this.MODEL_BASE_URL}configuracoes/${this.nomeRestaurante}.json`;
    this.ARQUIVO_CONFIG_ITENS = `${this.MODEL_BASE_URL}configuracoes/${this.nomeRestaurante}-itens.json`;

    // ------------------------------
    // Inicialização dos componentes
    // ------------------------------
    this.inicializarModalConfiguracao();
    this.inicializarModalPreview3D();
    this.configurarEventosCardapio();
    this.setupQrCode(); // Atualizado para versão simplificada

    // ------------------------------
    // Sincronização com o app AR
    // ------------------------------
    this.canalStatus = new BroadcastChannel('cardapio_channel');
    this.configurarSincronizacao();

    // ------------------------------
    // Carregamento inicial de configurações de categorias e itens
    // ------------------------------
    this.carregarConfiguracoesIniciais();

    this.previewFecharTimeout = null;
    this.previewItemAtual = null;

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

    const inputValor = this.modalConfig.querySelector('#inputValor');
    const inputDescricao = this.modalConfig.querySelector('#inputDescricao');

    // Formatação monetária
    inputValor.addEventListener('input', (event) => {
      this.formatarValorMonetario(event);
    });

    // Event listener para o botão Salvar
    this.modalConfig.querySelector('#btnSalvarModal').addEventListener('click', async (e) => {
      e.preventDefault();
      
      try {
        const salvou = await this.salvarConfiguracao(true);
        if (salvou) {
          this.modalConfig.style.display = 'none';
        }
      } catch (error) {
        console.error('Erro ao salvar:', error);
        alert('Erro ao salvar as configurações: ' + error.message);
      }
    });

    // Listener do botão fechar (X)
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
          
          document.querySelectorAll(`.item-box[data-categoria="${categoria}"]`).forEach(item => {
            item.classList.remove('desativado');
          });
        }
      });

      // Efeito hover
      button.addEventListener('mouseenter', () => {
        if (!button.classList.contains('desativado') && this.categoriaAtiva !== categoria) {
          this.mostrarItens(categoria);
        }
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
      box.setAttribute('data-nome', nome.toLowerCase().replace(/\s+/g, '_'));

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
        this.previewFecharTimeout = setTimeout(() => {
          if (!this.modelModal.matches(':hover')) {
            this.modelModal.style.display = 'none';
            this.modelModal.innerHTML = '';
            this.previewItemAtual = null;
          }
        }, 300);
      });

      box.addEventListener('mouseenter', () => {
        if (box.classList.contains('desativado')) return;

        // Cancela qualquer tentativa anterior de fechar
        if (this.previewFecharTimeout) {
          clearTimeout(this.previewFecharTimeout);
        }

        // Garante que só mostra se for um novo item
        const itemAtual = `${categoria}/${nome}`;
        if (this.previewItemAtual !== itemAtual) {
          this.previewItemAtual = itemAtual;
          this.mostrarPreview3D(box, categoria, nome);
        }
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

    this.escalaAtual = 1;

    this.modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled: false" style="width: 100%; height: 300px;" id="previewScene">
        <a-light type="ambient" intensity="1.0"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>
        <a-entity position="0 1 -3" rotation="0 0 0">
          <a-gltf-model 
            id="previewModel"
            src="${modelURL}" 
            scale="${this.escalaAtual} ${this.escalaAtual} ${this.escalaAtual}"
            rotation="0 0 0"
            animation="property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear"
          ></a-gltf-model>
        </a-entity>
        <a-camera position="0 2 0"></a-camera>
      </a-scene>
    `;

    // Controle de zoom com scroll do mouse
    this.modelModal.onwheel = (e) => {
      e.preventDefault();

      const zoomStep = 0.1;
      if (e.deltaY < 0) {
        this.escalaAtual += zoomStep;
      } else {
        this.escalaAtual = Math.max(0.1, this.escalaAtual - zoomStep);
      }

      const model = document.getElementById('previewModel');
      if (model) {
        const novaEscala = `${this.escalaAtual} ${this.escalaAtual} ${this.escalaAtual}`;
        model.setAttribute('scale', novaEscala);
      }
    };

    // Controle de movimento com botão direito
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
      if (e.button === 2) {
        isRightMouseDown = false;
      }
    });

    this.modelModal.addEventListener('mousemove', (e) => {
      if (!isRightMouseDown || !modelEntity) return;

      const deltaX = (e.clientX - lastMouseX) * 0.01;
      const deltaY = (e.clientY - lastMouseY) * 0.01;

      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const currentPos = modelEntity.getAttribute('position');
      modelEntity.setAttribute('position', {
        x: currentPos.x + deltaX,
        y: currentPos.y - deltaY,
        z: currentPos.z
      });
    });
  }

  async salvarConfiguracao(confirmado = false) {
    if (!this.itemConfiguracao || !confirmado) {
      return false;
    }

    try {
      const inputValor = this.modalConfig.querySelector('#inputValor');
      const inputDescricao = this.modalConfig.querySelector('#inputDescricao');
      
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

      this.dadosRestaurante[this.itemConfiguracao] = dadosAtualizados;
      return true;
      
    } catch (erro) {
      console.error('Falha ao salvar configuração:', erro);
      throw erro;
    }
  }

  // ==============================
  // 4. CONFIGURAÇÃO DE ITENS (Modal)
  // ==============================

  async abrirModalConfiguracao(categoria, nome) {
    const nomeFormatado = nome.toLowerCase().replace(/\s+/g, '_');
    this.itemConfiguracao = `${categoria}/${nomeFormatado}`;
    const arquivoJson = `${nomeFormatado}.json`;
    
    this.modalConfig.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;
    
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
    
    const inputValor = this.modalConfig.querySelector('#inputValor');
    const inputDescricao = this.modalConfig.querySelector('#inputDescricao');
    
    inputValor.value = typeof dadosProduto.preco === 'number' 
      ? dadosProduto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '0,00';
    
    inputDescricao.value = dadosProduto.descricao || '';
    
    this.dadosRestaurante[this.itemConfiguracao] = dadosProduto;
    
    this.modalConfig.style.display = 'flex';
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
      if (respostaCategorias.ok) {
        const categorias = await respostaCategorias.json();
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
  // 9. GERADOR DE QR CODE (Versão Simplificada)
  // ==============================

  setupQrCode() {
    const modalQR = document.getElementById('modalQrCode');
    const containerQR = document.getElementById('qrcodeContainer');
    const botaoFechar = modalQR.querySelector('.fechar-modal');
    const inputQuantidade = document.getElementById('qtdQr');
    const botaoMais = document.getElementById('aumentarQr');
    const botaoMenos = document.getElementById('diminuirQr');
    const botaoImprimir = document.getElementById('imprimirQr');
    const botaoGerarQR = document.getElementById('btnGerarQR');

    if (!modalQR || !containerQR || !botaoFechar || !inputQuantidade || !botaoMais || !botaoMenos || !botaoImprimir || !botaoGerarQR) {
      console.error('Elementos do QR Code não encontrados.');
      return;
    }

    // Gera QR Codes diretamente
    const gerarQRCodes = (quantidade) => {
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
        
        // Gera o QR Code sem necessidade de dados do garçom
        new QRCode(divQR, {
          text: `https://site-arcardapio.s3.us-east-1.amazonaws.com/app/app.html?v=${Date.now()}`,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    };

    // Atualiza QR Codes baseado na quantidade
    const atualizarQRCodes = () => {
      const quantidade = parseInt(inputQuantidade.value) || 1;
      gerarQRCodes(quantidade);
    };

    // Geração de QR Code ao clicar no botão principal
    botaoGerarQR.addEventListener('click', () => {
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
      inputQuantidade.dispatchEvent(new Event('input')); // Corrigido: aspas simples normais
    });

    // Fechar modal
    botaoFechar.addEventListener('click', () => {
      modalQR.classList.remove('ativo');
      containerQR.innerHTML = '';
    });

    // Fechar ao clicar fora
    modalQR.addEventListener('click', (evento) => {
      if (evento.target === modalQR) {
        modalQR.classList.remove('ativo');
        containerQR.innerHTML = '';
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