// ==============================
// Função única que salva a configuração no S3
// ==============================
async function salvarConfiguracao() {
  if (!itemConfiguracao) return;

  // lê e formata o valor do input
  const raw   = document.getElementById('inputValor').value;
  const preco = parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0;
  const desc  = document.getElementById('inputDescricao').value.trim();

  // monta objeto a ser salvo no cache local
  dadosRestaurante[itemConfiguracao] = { preco, descricao: desc };

  // determina o nome do arquivo JSON
  const arquivo = itemConfiguracao.split('/')[1] + '.json';

  // envia PUT para o S3
  try {
    const res = await fetch(
      `https://ar-menu-models.s3.amazonaws.com/informacao/${arquivo}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosRestaurante[itemConfiguracao])
      }
    );
    if (!res.ok) {
      console.error('❌ Erro ao salvar configuração:', res.status);
    }
  } catch (err) {
    console.error('❌ Erro de rede ao salvar configuração:', err);
  }
}

// ==============================
// Variáveis globais
// ==============================
// ——— 1) Variáveis globais ———
const nomeRestaurante = 'restaurante-001';
let itemConfiguracao = null;      // ex: "bebidas/absolut_vodka_1l"
const dadosRestaurante = {};      // cache local

// ——— 2) Criação única do modal ———
const modal = document.createElement('div');
modal.id = 'modalConfiguracaoProduto';
modal.className = 'modal-edicao';
modal.innerHTML = `
  <div class="modal-content-edicao">
    <span class="close-edicao">&times;</span>
    <h3 class="modal-titulo"></h3>
    <label>Valor (R$):</label>
    <input type="text" id="inputValor" placeholder="0,00"><br>
    <label>Descrição:</label>
    <textarea id="inputDescricao" rows="4"></textarea><br>
  </div>
`;
document.body.appendChild(modal);

// fecha ao clicar no X
// fecha ao clicar no X
modal.querySelector('.close-edicao').onclick = () => modal.style.display = 'none';
// fecha ao clicar fora
window.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

// pega referências aos inputs
const inputValor = modal.querySelector('#inputValor');
const inputDesc  = modal.querySelector('#inputDescricao');

// listener para formatar valor em tempo real
inputValor.addEventListener('input', e => {
  // remove tudo que não for dígito
  let v = e.target.value.replace(/\D/g, '');
  // converte em centavos e formata com duas casas decimais
  v = (parseFloat(v) / 100).toFixed(2);
  // vírgula decimal
  v = v.replace('.', ',');
  // pontos de milhar
  v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // devolve ao campo formatado
  e.target.value = v;
  // só então grava no S3
  salvarConfiguracao();
});

// mantém o listener da descrição
inputDesc.addEventListener('input', salvarConfiguracao);

// ==============================
// Função que abre o modal e carrega os dados do S3
// ==============================
async function abrirModalConfiguracao(categoria, nome) {
  // monta a chave e o nome do arquivo JSON
  itemConfiguracao = `${categoria}/${nome.toLowerCase().replace(/\s+/g, '_')}`;
  const arquivo = itemConfiguracao.split('/')[1] + '.json';

  // preenche o título do modal dinamicamente
  const titulo = modal.querySelector('h3');
  titulo.textContent = `Configurar ${nome}`;

  // tenta buscar dados no S3
  try {
    const res = await fetch(
      `https://ar-menu-models.s3.amazonaws.com/informacao/${arquivo}?v=${Date.now()}`
    );
    if (res.ok) {
      const json = await res.json();
      dadosRestaurante[itemConfiguracao] = json;
    }
  } catch (e) {
    console.warn('Não há dados prévios para esse produto.', e);
  }

  // preenche inputs com cache (ou vazio)
  const dados = dadosRestaurante[itemConfiguracao] || {};
  document.getElementById('inputValor').value     = dados.preco !== undefined
    ? dados.preco.toLocaleString('pt-BR',{minimumFractionDigits:2})
    : '';
  document.getElementById('inputDescricao').value = dados.descricao || '';

  // exibe o modal
  modal.style.display = 'flex';
}


function abrirModalConfiguracao(categoria, nome) {
  itemConfiguracao = `${categoria}/${nome.toLowerCase().replace(/\s+/g,'_')}`;
  const dados = dadosRestaurante[itemConfiguracao] || {};
  document.getElementById('inputValor').value = dados.preco || '';
  document.getElementById('inputDescricao').value = dados.descricao || '';
}

function salvarConfiguracao() {
  if (!itemConfiguracao) return;
  const raw = modal.querySelector('#inputValor').value;
  const preco = parseFloat(raw.replace(/\./g,'').replace(',', '.')) || 0;
  const descricao = modal.querySelector('#inputDescricao').value.trim();

  dadosRestaurante[itemConfiguracao] = { preco, descricao };

  // salva no S3
  fetch(`https://ar-menu-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-dados.json`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(dadosRestaurante)
  });
}

// ==============================
// PREVIEW 3D - HOVER NOS ITENS
// ==============================

const MODEL_BASE_URL = 'https://ar-menu-models.s3.amazonaws.com/';
const modelModal = document.createElement('div');
modelModal.className = 'model-preview-modal';
modelModal.style.display = 'none';
document.body.appendChild(modelModal);

// Converte o nome do item para o nome de arquivo .glb
function nomeParaArquivo(nome) {
return nome.trim().toLowerCase().replace(/\s+/g, '_') + '.glb';
}

// Adiciona a pré-visualização 3D com animação no item em hover
function adicionarPreview3D() {
document.querySelectorAll('.item-box').forEach(item => {
const nomeObjeto = item.textContent.trim();
const categoria = item.getAttribute('data-categoria');
const nomeArquivo = nomeParaArquivo(nomeObjeto);
const modelURL = `${MODEL_BASE_URL}${categoria}/${nomeArquivo}`;

item.addEventListener('mouseenter', () => {
    if (item.classList.contains('desativado')) return;

    const rect = item.getBoundingClientRect();
    modelModal.style.left = `${rect.right + 10}px`;
    modelModal.style.top = `${rect.top}px`;
    modelModal.style.display = 'block';

    // Cena A-Frame com rotação contínua
    modelModal.innerHTML = `
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
});

item.addEventListener('mouseleave', () => {
    modelModal.style.display = 'none';
    modelModal.innerHTML = '';
});
});
}


// ==============================
// GARÇONS - Cadastro
// ==============================

function setupCadastroGarcons() {
  const inputQuantidade = document.getElementById('quantidadeGarcons');
  const btnMais = document.getElementById('btnMaisGarcom');
  const btnMenos = document.getElementById('btnMenosGarcom');
  const containerFormularios = document.getElementById('formularioGarcons');

  function formatarCelular(value) {
    value = value.replace(/\D/g, '');
    value = value.substring(0, 11);
    if (value.length > 6) {
      value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
    } else if (value.length > 2) {
      value = value.replace(/^(\d{2})(\d{0,5})/, '($1) $2');
    } else if (value.length > 0) {
      value = value.replace(/^(\d{0,2})/, '($1');
    }
    return value;
  }

  function adicionarEventoFormatacao(input) {
    input.addEventListener('input', (e) => {
      const posicaoCursor = input.selectionStart;
      const valorAnterior = input.value;
      input.value = formatarCelular(input.value);
      const novaPosicaoCursor = posicaoCursor + (input.value.length - valorAnterior.length);
      input.setSelectionRange(novaPosicaoCursor, novaPosicaoCursor);
      const form = input.closest('.form-garcom');
      const inputNome = form.querySelector('.nome-garcom');
      if (input.value.trim() === '') {
        inputNome.value = '';
      }
    });
  }

  function validarCampos(form) {
    const inputNome = form.querySelector('.nome-garcom');
    const inputTel = form.querySelector('.tel-garcom');
    const btnQr = form.querySelector('.btn-qr');
    const nomeValido = inputNome.value.trim().length > 0;
    const telValido = inputTel.value.trim().length >= 14;
    btnQr.disabled = !(nomeValido && telValido);
  }

  function adicionarEventosValidacao(form) {
  const inputNome = form.querySelector('.nome-garcom');
  const inputTel = form.querySelector('.tel-garcom');

  inputNome.addEventListener('input', () => validarCampos(form));
  inputTel.addEventListener('input', () => {
    inputTel.value = formatarCelular(inputTel.value);
    validarCampos(form);
  });
}


  function gerarFormulariosGarcons(qtd) {
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
  }

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

  gerarFormulariosGarcons(1);
}

// Chamada das funções
setupCadastroGarcons();
setupQrCodeGarcons();