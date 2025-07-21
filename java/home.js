// ==============================
// home.js - Sistema de Cardápio Digital Completo
// ==============================

class SistemaCardapio {
  constructor() {
    // ------------------------------
    // Propriedades iniciais
    // ------------------------------
    this.nomeRestaurante      = 'restaurante-001';
    this.itemConfiguracao     = null;           // chave do JSON atual ("categoria/nome")
    this.dadosRestaurante     = {};             // cache local das configurações carregadas
    this.categoriaAtiva       = null;           // categoria que está aberta
    this.currentGarcomId      = null;           // id do garçom para QR
    this.MODEL_BASE_URL       = 'https://ar-menu-models.s3.amazonaws.com/';
    this.ARQUIVO_CONFIG_CATEGORIAS = `${this.MODEL_BASE_URL}configuracoes/${this.nomeRestaurante}.json`;
    this.ARQUIVO_CONFIG_ITENS      = `${this.MODEL_BASE_URL}configuracoes/${this.nomeRestaurante}-itens.json`;

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

    // Fecha ao clicar no “×”
    this.modalConfig.querySelector('.close-edicao').addEventListener('click', () => {
      this.modalConfig.style.display = 'none';
    });

    // Fecha ao clicar fora do conteúdo
    this.modalConfig.addEventListener('click', e => {
      if (e.target === this.modalConfig) {
        this.modalConfig.style.display = 'none';
      }
    });

    // Impede fechamento ao clicar dentro do conteúdo
    this.modalConfig.querySelector('.modal-content-edicao')
      .addEventListener('click', e => e.stopPropagation());

    // Formatação monetária + auto-save
    const inputValor = this.modalConfig.querySelector('#inputValor');
    inputValor.addEventListener('input', e => {
      this.formatarValorMonetario(e);
      this.salvarConfiguracao();
    });

    // Auto-save ao modificar descrição
    const inputDesc = this.modalConfig.querySelector('#inputDescricao');
    inputDesc.addEventListener('input', () => {
      this.salvarConfiguracao();
    });

    // Botão Salvar: salva e fecha
    this.modalConfig.querySelector('#btnSalvarModal')
      .addEventListener('click', async () => {
        await this.salvarConfiguracao();
        this.modalConfig.style.display = 'none';
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
    const profileBtn     = document.getElementById('profile-btn');
    const cardapioBtn    = document.getElementById('cardapio-btn');
    const dropdownCardapio = document.getElementById('dropdownCardapio');
    const container      = document.getElementById('itensContainer');

    // Perfil
    if (profileBtn) {
      profileBtn.addEventListener('click', () => window.location.href = 'perfil.html');
    }

    // Toggle do dropdown
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

    // Botões de categoria
    document.querySelectorAll('#dropdownCardapio button').forEach(btn => {
      const categoria = btn.dataset.categoria;
      const key       = `btnEstado_${categoria}`;

      // Estado inicial do botão vindo do localStorage
      if (localStorage.getItem(key) === 'true') {
        btn.classList.add('desativado');
        this.notificarEstadoCategoria(categoria, true);
      }

      // Clique para ativar/desativar categoria
      btn.addEventListener('click', () => {
        const desativadoAgora = btn.classList.toggle('desativado');
        localStorage.setItem(key, desativadoAgora);
        this.notificarEstadoCategoria(categoria, desativadoAgora);
        this.salvarConfiguracaoNoS3();

        if (desativadoAgora && this.categoriaAtiva === categoria) {
          this.categoriaAtiva = null;
          container.innerHTML = '';
          container.style.display = 'none';
          this.modelModal.style.display = 'none';
          this.modelModal.innerHTML = '';
        } else if (!desativadoAgora) {
          this.categoriaAtiva = categoria;
          this.mostrarItens(categoria);
          container.style.display = 'flex';
          document.querySelectorAll(`.item-box[data-categoria="${categoria}"]`)
            .forEach(item => item.classList.remove('desativado'));
        }
      });

      // Hover para pré-visualizar
      btn.addEventListener('mouseenter', () => {
        if (!btn.classList.contains('desativado') && this.categoriaAtiva !== categoria) {
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

    objetos3D[categoria].forEach((nome, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'item-wrapper';

      const box = document.createElement('div');
      box.className = 'item-box';
      box.textContent = nome;
      box.dataset.categoria = categoria;
      box.style.animationDelay = `${i * 0.1}s`;
      box.dataset.nome = nome.toLowerCase().replace(/\s+/g, '_');

      // Estado já salvo no localStorage
      const chaveLS = `itemEstado_${categoria}_${nome}`;
      if (localStorage.getItem(chaveLS) === 'true') {
        box.classList.add('desativado');
      }

      // Clique para ativar/desativar item
      box.addEventListener('click', () => {
        const desativadoAgora = box.classList.toggle('desativado');
        localStorage.setItem(chaveLS, desativadoAgora);
        this.salvarConfiguracaoNoS3();
        // Notifica o app AR
        this.canalStatus.postMessage({
          nome: nome,
          visivel: !desativadoAgora
        });
      });

      // Botão de configuração de cada item
      const btnConfig = document.createElement('button');
      btnConfig.className = 'btn-configurar-produto';
      btnConfig.textContent = 'Configuração';
      btnConfig.addEventListener('click', e => {
        e.stopPropagation();
        this.abrirModalConfiguracao(categoria, nome);
      });

      // Hover para preview 3D
      box.addEventListener('mouseenter', () => {
        if (!box.classList.contains('desativado')) {
          this.mostrarPreview3D(box, categoria, nome);
        }
      });
      box.addEventListener('mouseleave', () => {
        this.modelModal.style.display = 'none';
        this.modelModal.innerHTML = '';
      });

      wrapper.appendChild(box);
      wrapper.appendChild(btnConfig);
      container.appendChild(wrapper);
    });
  }

  mostrarPreview3D(elemento, categoria, nome) {
    const rect = elemento.getBoundingClientRect();
    this.modelModal.style.left = `${rect.right + 10}px`;
    this.modelModal.style.top  = `${rect.top}px`;
    this.modelModal.style.display = 'block';

    const nomeArquivo = this.nomeParaArquivo(nome);
    const modelURL   = `${this.MODEL_BASE_URL}${categoria}/${nomeArquivo}`;

    this.modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled: false" style="width:100%; height:300px">
        <a-light type="ambient" intensity="1.0"></a-light>
        <a-light type="directional" intensity="0.8" position="2 4 1"></a-light>
        <a-entity position="0 1 -3">
          <a-gltf-model src="${modelURL}" scale="1 1 1"
            animation="property: rotation; to: 0 360 0; loop: true; dur: 5000">
          </a-gltf-model>
        </a-entity>
        <a-camera position="0 2 0"></a-camera>
      </a-scene>
    `;
  }

  // ==============================
  // 4. CONFIGURAÇÃO DE ITENS (Modal)
  // ==============================

  /**
   * Abre o modal e carrega o JSON de configuração do item
   */
  async abrirModalConfiguracao(categoria, nome) {
    // 1) Gera o nome do arquivo JSON (minusculas + underlines)
    this.itemConfiguracao = `${categoria}/${nome.toLowerCase().replace(/\s+/g, '_')}`;
    const arquivo = this.itemConfiguracao.split('/')[1] + '.json';

    // 2) Atualiza o título
    this.modalConfig.querySelector('.modal-titulo')
      .textContent = `Configurar ${nome}`;

    // 3) Busca o JSON existente no S3
    try {
      const res = await fetch(
        `${this.MODEL_BASE_URL}informacao/${arquivo}?v=${Date.now()}`
      );
      if (res.ok) {
        this.dadosRestaurante[this.itemConfiguracao] = await res.json();
      }
    } catch (error) {
      console.warn('Erro ao carregar configuração:', error);
    }

    // 4) Preenche os campos
    const dados = this.dadosRestaurante[this.itemConfiguracao] || {};
    this.modalConfig.querySelector('#inputValor').value = 
      dados.preco != null
        ? dados.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '0,00';
    this.modalConfig.querySelector('#inputDescricao').value = dados.descricao || '';

    // 5) Exibe o modal
    this.modalConfig.style.display = 'flex';
  }

  /**
   * Salva o valor e a descrição atuais de volta no S3
   */
  async salvarConfiguracao() {
    if (!this.itemConfiguracao) return;

    // 1) Lê e formata o valor
    const rawValor = this.modalConfig.querySelector('#inputValor').value;
    const preco    = parseFloat(rawValor.replace(/\D/g, '').padStart(3, '0'))/100 || 0;
    const descricao = this.modalConfig.querySelector('#inputDescricao').value.trim();

    // 2) Atualiza o cache local
    this.dadosRestaurante[this.itemConfiguracao] = { preco, descricao };

    // 3) Faz PUT no S3
    const arquivo = this.itemConfiguracao.split('/')[1] + '.json';
    try {
      await fetch(
        `${this.MODEL_BASE_URL}informacao/${arquivo}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preco, descricao })
        }
      );
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
    }
  }

  // ==============================
  // 5. UTILITÁRIOS
  // ==============================

  formatarValorMonetario(e) {
    let v = e.target.value.replace(/\D/g, '');
    v = (parseFloat(v) / 100).toFixed(2).replace('.', ',');
    e.target.value = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  nomeParaArquivo(nome) {
    return nome.trim().toLowerCase().replace(/\s+/g, '_') + '.glb';
  }

  // ==============================
  // 6. SINCRONIZAÇÃO COM O APP AR
  // ==============================

  configurarSincronizacao() {
    this.canalStatus.onmessage = event => {
      const { nome, visivel } = event.data;
      const el = document.querySelector(`[data-nome="${nome}"]`);
      if (!el) return;
      el.style.display = visivel ? '' : 'none';
    };
  }

  // ==============================
  // 7. CATEGORIAS E ITENS → S3
  // ==============================

  async salvarConfiguracaoNoS3() {
    // 7.1) Salva visibilidade das categorias
    const botoes = document.querySelectorAll('#dropdownCardapio .btn-categoria');
    const configCats = {};
    botoes.forEach(btn => {
      // true = visível, false = desativado
      configCats[btn.dataset.categoria] = !btn.classList.contains('desativado');
    });

    try {
      await fetch(this.ARQUIVO_CONFIG_CATEGORIAS, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(configCats)
      });
      console.log('Categorias salvas com sucesso.');
    } catch (e) {
      console.error('Erro ao salvar categorias:', e);
    }

    // 7.2) Salva itens desativados de todas as categorias
    //     (monta o JSON completo lendo o estado no localStorage)
    const desativados = {};
    // `objetos3D` deve conter todas as categorias → array de nomes originais
    Object.keys(objetos3D).forEach(categoria => {
      objetos3D[categoria].forEach(nome => {
        const chaveLS = `itemEstado_${categoria}_${nome}`;
        // se no localStorage esse item está marcado como desativado ("true")
        if (localStorage.getItem(chaveLS) === 'true') {
          if (!desativados[categoria]) desativados[categoria] = [];
          // adiciona o nome de arquivo (underscore + lower)
          desativados[categoria].push(
            nome.toLowerCase().replace(/\s+/g, '_')
          );
        }
      });
    });

    try {
      await fetch(this.ARQUIVO_CONFIG_ITENS, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(desativados)
      });
      console.log('Itens desativados salvos com sucesso.');
    } catch (e) {
      console.error('Erro ao salvar itens desativados:', e);
    }
  }


  // ==============================
  // 8. CARREGAMENTO INICIAL
  // ==============================

  async carregarConfiguracoesIniciais() {
    try {
      // Categorias
      const resCats = await fetch(`${this.ARQUIVO_CONFIG_CATEGORIAS}?v=${Date.now()}`);
      if (resCats.ok) {
        const cats = await resCats.json();
        Object.entries(cats).forEach(([cat, visivel]) => {
          const btn = document.querySelector(`#dropdownCardapio button[data-categoria="${cat}"]`);
          if (btn && !visivel) {
            btn.classList.add('desativado');
            localStorage.setItem(`btnEstado_${cat}`, 'true');
          }
        });
      }

      // Itens desativados
      const resItens = await fetch(`${this.ARQUIVO_CONFIG_ITENS}?v=${Date.now()}`);
      if (resItens.ok) {
        const desat = await resItens.json();
        Object.entries(desat).forEach(([cat, itens]) => {
          itens.forEach(nomeItem => {
            const key = `itemEstado_${cat}_${nomeItem.replace(/_/g, ' ')}`;
            localStorage.setItem(key, 'true');
          });
        });
      }
    } catch (err) {
      console.error('Erro ao carregar configs iniciais:', err);
    }
  }

  // ==============================
  // 9. CADASTRO DE GARÇONS
  // ==============================

  setupCadastroGarcons() {
    const inputQtd = document.getElementById('quantidadeGarcons');
    const btnMais  = document.getElementById('btnMaisGarcom');
    const btnMenos = document.getElementById('btnMenosGarcom');
    const container = document.getElementById('formularioGarcons');

    // Formata celular
    const formatarCel = value => {
      value = value.replace(/\D/g, '').slice(0,11);
      if (value.length > 6) {
        value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
      } else if (value.length > 2) {
        value = value.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
      } else {
        value = value.replace(/^(\d{0,2})/, '($1');
      }
      return value;
    };

    // Validação de nome e telefone
    const validar = form => {
      const nome = form.querySelector('.nome-garcom').value.trim();
      const tel  = form.querySelector('.tel-garcom').value.replace(/\D/g, '');
      form.querySelector('.btn-qr').disabled = !(nome && tel.length >= 10);
    };

    // Gera os formulários
    const gerarForms = qtd => {
      const dadosAtuais = {};
      container.querySelectorAll('.form-garcom').forEach(f => {
        const id = f.querySelector('.nome-garcom').dataset.id;
        dadosAtuais[id] = {
          nome: f.querySelector('.nome-garcom').value,
          tel: f.querySelector('.tel-garcom').value
        };
      });

      container.innerHTML = '';
      for (let i = 1; i <= qtd; i++) {
        const form = document.createElement('div');
        form.className = 'form-garcom';
        const salvo = dadosAtuais[i] || { nome: '', tel: '' };
        form.innerHTML = `
          <label>Garçom ${i}:</label><br>
          <input type="text" class="nome-garcom" data-id="${i}" placeholder="Nome" value="${salvo.nome}">
          <input type="tel" class="tel-garcom" data-id="${i}" maxlength="15" placeholder="Telefone" value="${salvo.tel}">
          <button class="btn-qr" data-id="${i}" disabled>Gerar QR Code</button>
        `;
        container.appendChild(form);

        const inpNome = form.querySelector('.nome-garcom');
        const inpTel  = form.querySelector('.tel-garcom');
        const btnQr   = form.querySelector('.btn-qr');

        // Eventos
        inpNome.addEventListener('input', () => validar(form));
        inpTel.addEventListener('input', e => {
          e.target.value = formatarCel(e.target.value);
          validar(form);
        });
        validar(form);
      }
    };

    // Listeners de quantidade
    inputQtd.addEventListener('change', () => {
      const v = Math.max(1, parseInt(inputQtd.value) || 1);
      inputQtd.value = v;
      gerarForms(v);
    });
    btnMais.addEventListener('click', () => {
      inputQtd.value = parseInt(inputQtd.value) + 1;
      inputQtd.dispatchEvent(new Event('change'));
    });
    btnMenos.addEventListener('click', () => {
      inputQtd.value = Math.max(1, parseInt(inputQtd.value) - 1);
      inputQtd.dispatchEvent(new Event('change'));
    });

    // Inicializa com 1
    gerarForms(1);
  }

  // ==============================
  // 10. QR CODES DE GARÇONS
  // ==============================

  setupQrCodeGarcons() {
    const modalQr    = document.getElementById('modalQrCode');
    const qrContainer = document.getElementById('qrcodeContainer');
    const btnFechar   = modalQr.querySelector('.fechar-modal');
    const forms       = document.getElementById('formularioGarcons');
    const inputQtd    = document.getElementById('qtdQr');
    const btnMais     = document.getElementById('aumentarQr');
    const btnMenos    = document.getElementById('diminuirQr');
    const btnImprimir = document.getElementById('imprimirQr');

    if (!modalQr || !qrContainer || !btnFechar || !forms || !inputQtd || !btnMais || !btnMenos || !btnImprimir) {
      console.error('Elementos de QR Code não encontrados.');
      return;
    }

    // Gera QR codes
    const gerarQRCodes = (nome, qtd) => {
      qrContainer.innerHTML = '';
      for (let i = 1; i <= qtd; i++) {
        const wr = document.createElement('div');
        wr.className = 'qrcode-wrapper';
        wr.innerHTML = `<div id="qr-${i}" class="qrcode"></div><div class="mesa-label">Mesa ${i}</div>`;
        qrContainer.appendChild(wr);
        new QRCode(wr.querySelector('.qrcode'), {
          text: `https://arcardapio-site.s3.us-east-1.amazonaws.com/app/app.html?v=${Date.now()}`,
          width: 200, height: 200, correctLevel: QRCode.CorrectLevel.H
        });
      }
    };

    // Atualiza quando clica em “Gerar QR”
    forms.addEventListener('click', e => {
      const btn = e.target.closest('.btn-qr');
      if (!btn || btn.disabled) return;
      this.currentGarcomId = btn.dataset.id;
      gerarQRCodes(btn.closest('.form-garcom').querySelector('.nome-garcom').value, parseInt(inputQtd.value) || 1);
      modalQr.classList.add('ativo');
    });

    // Controles de quantidade
    inputQtd.addEventListener('input', () => {
      if (this.currentGarcomId) {
        gerarQRCodes(forms.querySelector(`.nome-garcom[data-id="${this.currentGarcomId}"]`).value, parseInt(inputQtd.value));
      }
    });
    btnMais.addEventListener('click', () => {
      inputQtd.value = (parseInt(inputQtd.value) || 1) + 1;
      inputQtd.dispatchEvent(new Event('input'));
    });
    btnMenos.addEventListener('click', () => {
      inputQtd.value = Math.max(1, (parseInt(inputQtd.value)||1) - 1);
      inputQtd.dispatchEvent(new Event('input'));
    });

    // Fecha modal
    btnFechar.addEventListener('click', () => {
      modalQr.classList.remove('ativo');
      qrContainer.innerHTML = '';
      this.currentGarcomId = null;
    });

    // Imprimir
    btnImprimir.addEventListener('click', () => {
      if (!qrContainer.innerHTML.trim()) {
        alert('Gere os QR Codes antes de imprimir.');
        return;
      }
      const w = window.open('', '_blank');
      w.document.write(`<html><body>${qrContainer.innerHTML}</body></html>`);
      w.document.close();
      w.focus();
      w.print();
      w.close();
    });
  }
}

// ------------------------------
// Inicialização após DOMReady
// ------------------------------
document.addEventListener('DOMContentLoaded', () => {
  new SistemaCardapio();
});
