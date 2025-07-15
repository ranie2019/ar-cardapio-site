// ==============================
// QR Code local (sem limite)
// ==============================

function setupQrCodeGarcons() {
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

  // Função que gera os QR Codes com base na quantidade e nome do garçom
  function gerarQRCodes(nome, quantidade, id) {
    qrCodeContainer.innerHTML = ''; // limpa tudo

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
  }

  // Atualiza QR Codes baseado no garçom ativo e quantidade
  function atualizarQRCodesAtivos(id) {
    const nomeInput = containerFormularios.querySelector(`.nome-garcom[data-id="${id}"]`);
    if (!nomeInput) return;

    const nome = nomeInput.value.trim() || `garcom${id}`;
    const quantidade = parseInt(inputQtdQr.value);
    if (isNaN(quantidade) || quantidade < 1) return;

    gerarQRCodes(nome, quantidade, id);
    modalQrCode.classList.add('ativo');
  }

  // Contador + e -
  btnMais.addEventListener('click', () => {
    let val = parseInt(inputQtdQr.value);
    if (isNaN(val)) val = 1;
    if (val < 99) {
      inputQtdQr.value = val + 1;
      if (currentGarcomId) atualizarQRCodesAtivos(currentGarcomId);
    }
  });

  btnMenos.addEventListener('click', () => {
    let val = parseInt(inputQtdQr.value);
    if (isNaN(val)) val = 1;
    if (val > 1) {
      inputQtdQr.value = val - 1;
      if (currentGarcomId) atualizarQRCodesAtivos(currentGarcomId);
    }
  });

  // Atualiza QR Codes ao alterar input manualmente
  inputQtdQr.addEventListener('input', () => {
    if (currentGarcomId) atualizarQRCodesAtivos(currentGarcomId);
  });

  // Guarda o id do garçom que gerou o QR Code para atualizar na mudança da quantidade
  let currentGarcomId = null;

  // Clique no botão .btn-qr para gerar QR Code inicial
  containerFormularios.addEventListener('click', (e) => {
    const btnQr = e.target.closest('.btn-qr');
    if (!btnQr || btnQr.disabled) return;

    const id = btnQr.getAttribute('data-id');
    if (!id) return;

    currentGarcomId = id; // salva garçom ativo
    atualizarQRCodesAtivos(id);
  });

  // Fecha modal
  btnFecharModal.addEventListener('click', () => {
    modalQrCode.classList.remove('ativo');
    qrCodeContainer.innerHTML = '';
    currentGarcomId = null;
  });

  // Fecha modal clicando fora do conteúdo
  window.addEventListener('click', (e) => {
    if (e.target === modalQrCode) {
      modalQrCode.classList.remove('ativo');
      qrCodeContainer.innerHTML = '';
      currentGarcomId = null;
    }
  });

  // Botão imprimir QR Codes
  btnImprimir.addEventListener('click', () => {
    if (!qrCodeContainer.innerHTML.trim()) return alert('Gere os QR Codes antes de imprimir.');

    // Abre nova janela com apenas os QR Codes para imprimir
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
// SINCRONIZAÇÃO DE VISIBILIDADE EM TEMPO REAL (PAINEL ↔ APP)
// ==============================

const canalStatus = new BroadcastChannel('estado_cardapio');

// 🔁 Apenas no PAINEL: chama essa função para alterar visibilidade
function alterarVisibilidadeItem(nomeItem, visivel) {
  const botao = document.querySelector(`[data-nome="${nomeItem}"]`);

  if (botao) {
    if (visivel) {
      botao.classList.remove('desativado');
      botao.style.display = 'inline-block';
    } else {
      botao.classList.add('desativado');
      botao.style.display = 'none';
    }
  }

  // Envia para o app
  canalStatus.postMessage({ nome: nomeItem, visivel: visivel });
}

// 👂 Apenas no APP: escuta atualizações em tempo real do painel
canalStatus.onmessage = (event) => {
  const { nome, visivel } = event.data;
  const botao = document.querySelector(`[data-nome="${nome}"]`);

  if (botao) {
    if (visivel) {
      botao.style.display = 'inline-block';
    } else {
      botao.remove(); // Remove totalmente do DOM
    }
  }
};

// ==============================
// SALVAR STATUS NO S3 (JSON de configuração por restaurante)
// ==============================

function salvarConfiguracaoNoS3() {
  const botoes = document.querySelectorAll('#dropdownCardapio .btn-categoria');
  const configuracaoCategorias = {};

  botoes.forEach(btn => {
    const categoria = btn.getAttribute('data-categoria');
    const visivel = !btn.classList.contains('desativado');
    configuracaoCategorias[categoria] = visivel;
  });

  // SALVAR CONFIGURAÇÃO DE CATEGORIAS
  fetch(`https://ar-menu-models.s3.amazonaws.com/configuracoes/restaurante-001.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(configuracaoCategorias)
  }).then(res => {
    if (res.ok) console.log('✅ Categorias salvas no S3');
    else console.error('❌ Erro ao salvar categorias:', res.status);
  }).catch(err => {
    console.error('❌ Erro ao salvar categorias no S3:', err);
  });

  // SALVAR CONFIGURAÇÃO DE ITENS DESATIVADOS (sem sobrescrever as outras categorias)
  fetch(`https://ar-menu-models.s3.amazonaws.com/configuracoes/restaurante-001-itens.json?v=${Date.now()}`)
    .then(res => res.ok ? res.json() : {})
    .catch(() => ({}))
    .then(jsonExistente => {
      const itensDesativados = { ...jsonExistente };

      // Adiciona os itens atualmente desativados no painel
      document.querySelectorAll('.item-box.desativado').forEach(box => {
        const categoria = box.getAttribute('data-categoria');
        const nome = box.textContent.trim().toLowerCase().replace(/\s+/g, '_');
        if (!itensDesativados[categoria]) itensDesativados[categoria] = [];
        if (!itensDesativados[categoria].includes(nome)) {
          itensDesativados[categoria].push(nome);
        }
      });

      // Remove os itens que foram reativados
      document.querySelectorAll('.item-box:not(.desativado)').forEach(box => {
        const categoria = box.getAttribute('data-categoria');
        const nome = box.textContent.trim().toLowerCase().replace(/\s+/g, '_');
        if (itensDesativados[categoria]) {
          itensDesativados[categoria] = itensDesativados[categoria].filter(n => n !== nome);
          if (itensDesativados[categoria].length === 0) {
            delete itensDesativados[categoria]; // remove categoria se estiver vazia
          }
        }
      });

      // Salva JSON completo atualizado no S3
      fetch(`https://ar-menu-models.s3.amazonaws.com/configuracoes/restaurante-001-itens.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itensDesativados)
      }).then(res => {
        if (res.ok) console.log('✅ Itens ocultos salvos no S3');
        else console.error('❌ Erro ao salvar itens ocultos:', res.status);
      }).catch(err => {
        console.error('❌ Erro ao salvar itens ocultos no S3:', err);
      });
    });
}

// Chamada das funções
setupCadastroGarcons();
setupQrCodeGarcons();