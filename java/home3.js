// ==============================
// home3.js - SincronizaÃ§Ã£o, QR Code e Sistema Principal
// ==============================

class SistemaCardapio extends SistemaCardapioItens {
  constructor() {
    super();
    
    // ------------------------------
    // ConfiguraÃ§Ãµes especÃ­ficas do sistema completo
    // ------------------------------
    this.setupQrCode();
    this.configurarSincronizacao();
    this.carregarConfiguracoesIniciais();
  }

  // ==============================
  // 6. SINCRONIZAÃ‡ÃƒO COM O APP AR
  // ==============================
  configurarSincronizacao() {
    this.canalStatus.onmessage = (evento) => {
      const { nome, visivel } = evento.data;
      const elemento = document.querySelector(`[data-nome="${this.nomeParaSlug(nome)}"]`);
      if (!elemento) return;
      elemento.style.display = visivel ? '' : 'none';
    };
  }

  // ==============================
  // 7. CATEGORIAS E ITENS â†’ S3
  // ==============================
  async salvarConfiguracaoNoS3() {
    // 1. Categorias
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
      console.error('Erro ao salvar configuraÃ§Ãµes de categoria:', erro);
    }

    // 2. Itens desativados
    const itensDesativados = {};
    Object.keys(objetos3D).forEach(categoria => {
      objetos3D[categoria].forEach(nomeItem => {
        const chaveLocal = this.gerarChaveItem(categoria, nomeItem);
        if (localStorage.getItem(chaveLocal) === 'true') {
          if (!itensDesativados[categoria]) itensDesativados[categoria] = [];
          itensDesativados[categoria].push(this.nomeParaSlug(nomeItem));
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
      // Categorias
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

      // Itens desativados
      const respostaItens = await fetch(`${this.ARQUIVO_CONFIG_ITENS}?v=${Date.now()}`);
      if (respostaItens.ok) {
        const itensDesativados = await respostaItens.json();
        Object.entries(itensDesativados).forEach(([categoria, itens]) => {
          itens.forEach(nomeItemSlug => {
            const nomeNormalizado = nomeItemSlug.replace(/_/g, ' ').toLowerCase();
            const chave = this.gerarChaveItem(categoria, nomeNormalizado);
            localStorage.setItem(chave, 'true');
          });
        });
      }
    } catch (erro) {
      console.error('Erro ao carregar configuraÃ§Ãµes iniciais:', erro);
    }
  }

  // ==============================
  // 9. GERADOR DE QR CODE (VersÃ£o Melhorada)
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
      console.error('Elementos do QR Code nÃ£o encontrados.');
      return;
    }

    const gerarQRCodes = (quantidade) => {
      containerQR.innerHTML = '';
      const frag = document.createDocumentFragment();

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
        frag.appendChild(wrapper);
      }

      containerQR.appendChild(frag);

      for (let i = 1; i <= quantidade; i++) {
        new QRCode(document.getElementById(`qr-${i}`), {
          text: `https://site-arcardapio.s3.us-east-1.amazonaws.com/app/app.html?restaurante=${this.nomeRestaurante}&v=${Date.now()}`,
          width: 200,
          height: 200,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }
    };

    const atualizarQRCodes = () => {
      let quantidade = parseInt(inputQuantidade.value, 10) || 1;
      if (quantidade < 1) quantidade = 1;
      if (quantidade > 200) quantidade = 200;
      inputQuantidade.value = quantidade;
      gerarQRCodes(quantidade);
    };

    botaoGerarQR.addEventListener('click', () => {
      atualizarQRCodes();
      modalQR.classList.add('ativo');
    });

    inputQuantidade.addEventListener('input', atualizarQRCodes);

    botaoMais.addEventListener('click', () => {
      inputQuantidade.value = (parseInt(inputQuantidade.value, 10) || 1) + 1;
      inputQuantidade.dispatchEvent(new Event('input'));
    });

    botaoMenos.addEventListener('click', () => {
      inputQuantidade.value = Math.max(1, (parseInt(inputQuantidade.value, 10) || 1) - 1);
      inputQuantidade.dispatchEvent(new Event('input'));
    });

    botaoFechar.addEventListener('click', () => {
      modalQR.classList.remove('ativo');
      containerQR.innerHTML = '';
    });

    // Fecha ao clicar fora do conteÃºdo
    modalQR.addEventListener('click', (evento) => {
      if (evento.target === modalQR) {
        modalQR.classList.remove('ativo');
        containerQR.innerHTML = '';
      }
    });

    // ImpressÃ£o
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
              .qrcode-wrapper { text-align: center; page-break-inside: avoid; }
              .mesa-label { font-weight: bold; margin-top: 8px; font-size: 16px; }
              @page { size: auto; margin: 10mm; }
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
document.addEventListener('DOMContentLoaded', () => {
  new SistemaCardapio();
});
