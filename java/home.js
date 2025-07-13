// ==============================
// home.js - Menu de perfil, cardápio e preview 3D
// ==============================
// ——— 3) Abre o modal e carrega dados do S3 ———
async function abrirModalConfiguracao(categoria, nome) {
  itemConfiguracao = `${categoria}/${nome.toLowerCase().replace(/\s+/g, '_')}`;
  const arquivo = itemConfiguracao.split('/')[1] + '.json';
  modal.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;

  try {
    const res  = await fetch(
      `https://ar-menu-models.s3.amazonaws.com/informacao/${arquivo}?v=${Date.now()}`
    );
    if (res.ok) dadosRestaurante[itemConfiguracao] = await res.json();
  } catch {}

  const dados = dadosRestaurante[itemConfiguracao] || {};
  modal.querySelector('#inputValor').value     = dados.preco != null
    ? dados.preco.toLocaleString('pt-BR',{ minimumFractionDigits:2 })
    : '';
  modal.querySelector('#inputDescricao').value = dados.descricao || '';
  modal.style.display = 'flex';
}

// ——— 4) Salva a configuração no S3 ———
async function salvarConfiguracao() {
  if (!itemConfiguracao) return;
  const raw = modal.querySelector('#inputValor').value;
  const preco = parseFloat(raw.replace(/\./g,'').replace(',', '.')) || 0;
  const desc  = modal.querySelector('#inputDescricao').value.trim();
  dadosRestaurante[itemConfiguracao] = { preco, descricao: desc };

  const arquivo = itemConfiguracao.split('/')[1] + '.json';
  await fetch(
    `https://ar-menu-models.s3.amazonaws.com/informacao/${arquivo}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dadosRestaurante[itemConfiguracao])
    }
  );
}

document.addEventListener('DOMContentLoaded', () => {
  // Botões e containers principais
  const profileBtn = document.getElementById('profile-btn');
  const cardapioBtn = document.getElementById('cardapio-btn');
  const dropdownCardapio = document.getElementById('dropdownCardapio');
  const container = document.getElementById('itensContainer');

  let categoriaAtiva = null;

  
  // ==============================
  // PERFIL - Redirecionamento
  // ==============================
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      window.location.href = 'perfil.html';
    });
  }

  // ==============================
  // CARDÁPIO - Botão abre/fecha dropdown
  // ==============================
  if (cardapioBtn && dropdownCardapio) {
    cardapioBtn.addEventListener('click', () => {
      dropdownCardapio.classList.toggle('show');

      if (!dropdownCardapio.classList.contains('show')) {
        // Fecha e limpa
        container.style.display = 'none';
        container.innerHTML = '';
        categoriaAtiva = null;
        modelModal.style.display = 'none';
        modelModal.innerHTML = '';
      } else {
        // Se há categoria ativa, mostra os itens
        const botaoAtivo = document.querySelector(`#dropdownCardapio button[data-categoria="${categoriaAtiva}"]`);
        if (botaoAtivo && !botaoAtivo.classList.contains('desativado')) {
          mostrarItens(categoriaAtiva);
          container.style.display = 'flex';
        }
      }
    });
  }

// ==============================
// CARDÁPIO - Clique e Hover nos botões de categoria (COM SINCRONIZAÇÃO)
// ==============================
document.querySelectorAll('#dropdownCardapio button').forEach(btn => {
  const categoria = btn.getAttribute('data-categoria');
  const id = 'btnEstado_' + categoria;

  // 1. Recupera estado inicial do localStorage
  const estaDesativado = localStorage.getItem(id) === 'true';
  if (estaDesativado) {
    btn.classList.add('desativado');
    
    // Notifica o app AR imediatamente ao carregar (para sincronização inicial)
    const canal = new BroadcastChannel('sincronizacao_categorias');
    canal.postMessage({
      acao: 'atualizar_botao',
      categoria: categoria,
      desativado: true
    });
  }

  // 2. Clique no botão (COM SINCRONIZAÇÃO)
  btn.addEventListener('click', () => {
    const desativadoAgora = !btn.classList.contains('desativado');
    
    // Atualiza estado local
    btn.classList.toggle('desativado');
    localStorage.setItem(id, desativadoAgora);

    // Envia para o app AR via BroadcastChannel
    const canal = new BroadcastChannel('sincronizacao_categorias');
    canal.postMessage({
      acao: 'atualizar_botao',
      categoria: categoria,
      desativado: desativadoAgora
    });

    // Salvar config no S3 imediatamente
    salvarConfiguracaoNoS3();

    // Lógica existente de limpeza/recarrega
    if (desativadoAgora) {
      if (categoriaAtiva === categoria) {
        categoriaAtiva = null;
        container.innerHTML = '';
        container.style.display = 'none';
        modelModal.style.display = 'none';
        modelModal.innerHTML = '';
      }
    } else {
      categoriaAtiva = categoria;
      mostrarItens(categoria);
      container.style.display = 'flex';
      
      document.querySelectorAll(`.item-box[data-categoria="${categoria}"]`).forEach(item => {
        item.classList.remove('desativado');
      });
    }
  });

  // 3. Hover (mantido original)
  btn.addEventListener('mouseenter', () => {
    if (!btn.classList.contains('desativado') && categoriaAtiva !== categoria) {
      mostrarItens(categoria);
    }
  });
});

// ==============================
// Função para exibir itens da categoria com animação,
// controle de estado, botão de configuração e modal embutido
// ==============================
function mostrarItens(categoria) {
  const container = document.getElementById('itensContainer');
  if (!container || !objetos3D[categoria]) return;

  // ----- 1) Cria o modal (se ainda não existir) -----
  let modal = document.getElementById('modalConfiguracaoProduto');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalConfiguracaoProduto';
    modal.className = 'modal-edicao';
    modal.innerHTML = `
      <div class="modal-content-edicao">
        <span class="close-edicao">&times;</span>
        <h3 class="modal-titulo"></h3>
        <label>Valor (R$):</label>
        <input type="text" id="inputValor" /><br>
        <label>Descrição:</label>
        <textarea id="inputDescricao" rows="4"></textarea><br>
      </div>
    `;
    document.body.appendChild(modal);

    // Fecha ao clicar no X
    modal.querySelector('.close-edicao')
         .addEventListener('click', () => modal.style.display = 'none');

    // Fecha ao clicar fora do conteúdo
    window.addEventListener('click', e => {
      if (e.target === modal) modal.style.display = 'none';
    });

// Formatação e salvamento ao digitar no Valor
const inputValor = modal.querySelector('#inputValor');
const inputDesc  = modal.querySelector('#inputDescricao');

inputValor.addEventListener('input', e => {
  // remove tudo que não for dígito
  let v = e.target.value.replace(/\D/g, '');
  // converte em centavos e formata com duas casas decimais
  v = (parseFloat(v) / 100).toFixed(2);
  // coloca vírgula decimal
  v = v.replace('.', ',');
  // coloca pontos de milhar
  v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // finalmente, devolve ao campo
  e.target.value = v;
  // só então grava no S3
  salvarConfiguracao();
});

// mantém o listener da descrição
inputDesc.addEventListener('input', salvarConfiguracao);

  }

  // ----- 2) Limpa e monta os itens -----
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

    const idItem = `itemEstado_${categoria}_${nome}`;
    if (localStorage.getItem(idItem) === 'true') {
      box.classList.add('desativado');
    }
    box.addEventListener('click', () => {
      box.classList.toggle('desativado');
      localStorage.setItem(idItem, box.classList.contains('desativado'));
      salvarConfiguracaoNoS3();
    });

    const btnConfig = document.createElement('button');
    btnConfig.className = 'btn-configurar-produto';
    btnConfig.textContent = 'Configuração';
    btnConfig.addEventListener('click', e => {
      e.stopPropagation();

      // prepara modal com título, valor e descrição já salvos
      const chave = `${categoria}/${nome.toLowerCase().replace(/\s+/g,'_')}`;
      const dados = dadosRestaurante[chave] || {};

      modal.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;
      modal.querySelector('#inputValor').value = 
        dados.preco != null
          ? dados.preco.toLocaleString('pt-BR',{ minimumFractionDigits:2, maximumFractionDigits:2 })
          : '';
      modal.querySelector('#inputDescricao').value = dados.descricao || '';

      modal.style.display = 'flex';
    });

    wrapper.appendChild(box);
    wrapper.appendChild(btnConfig);
    container.appendChild(wrapper);
  });

  // ----- 3) Reativa o preview 3D nos itens -----
  requestAnimationFrame(() => adicionarPreview3D());
}

// ==============================
// Função que grava no objeto e no S3
// ==============================
function salvarConfiguracao() {
  const modal = document.getElementById('modalConfiguracaoProduto');
  const titulo = modal.querySelector('.modal-titulo').textContent;
  // extrai nome e categoria da chave salva anteriormente
  // (você já setou itemConfiguracao em abrirModalConfiguracao)
  if (!itemConfiguracao) return;

  // converte "1.234,56" => 1234.56
  const raw = modal.querySelector('#inputValor').value;
  const preco = parseFloat( raw.replace(/\./g,'').replace(',', '.') ) || 0;
  const descricao = modal.querySelector('#inputDescricao').value.trim();

  dadosRestaurante[itemConfiguracao] = { preco, descricao };

  // PUT no S3
  fetch(`https://ar-menu-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-dados.json`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(dadosRestaurante)
  });
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
// Função que salva a configuração no S3
// ==============================
async function salvarConfiguracao() {
  if (!itemConfiguracao) return;

  // lê e formata o valor do input
  const raw    = document.getElementById('inputValor').value;
  const preco  = parseFloat(raw.replace(/\./g,'').replace(',', '.')) || 0;
  const desc   = document.getElementById('inputDescricao').value.trim();

  // monta objeto a ser salvo
  dadosRestaurante[itemConfiguracao] = { preco, descricao: desc };

  // determina o arquivo JSON destino
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
      console.error('Erro ao salvar configuração:', res.status);
    }
  } catch (err) {
    console.error('Erro de rede ao salvar configuração:', err);
  }
}

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


  // Função para disparar as animações em sequência com loop
  function iniciarAnimacaoLoop(modelo) {
    let etapa = 1;
    function loop() {
      modelo.emit(`startAnim${etapa}`);
      etapa++;
      if (etapa > 6) etapa = 1;
      setTimeout(loop, 1000);
    }
    loop();
  }

});

// ==============================
// GARÇONS - Cadastro
// ==============================
function setupCadastroGarcons() {
  const inputQuantidade   = document.getElementById('quantidadeGarcons');
  const btnMais           = document.getElementById('btnMaisGarcom');
  const btnMenos          = document.getElementById('btnMenosGarcom');
  const containerFormularios = document.getElementById('formularioGarcons');

  // Guarda o número "cru" da iteração anterior para detectar deleção
  let prevRawNumber = "";

  // Formata só dígitos num telefone (XX) XXXXX-XXXX
  function formatarCelular(raw) {
    let v = raw.replace(/\D/g, '').slice(0, 11);
    if (v.length > 2) {
      v = `(${v.slice(0,2)}) ${v.slice(2)}`;
    }
    if (v.replace(/\D/g, '').length > 7) {
      // insere o traço depois de 9 caracteres incluindo máscara
      const digits = v.replace(/\D/g, '');
      v = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    return v;
  }

  // Adiciona listener de input com detecção de inserção / deleção
  function adicionarEventoFormatacao(input) {
    input.addEventListener('input', e => {
      const el = e.target;
      const cursorPos = el.selectionStart;
      const raw     = el.value.replace(/\D/g, '');
      const isDeleting = raw.length < prevRawNumber.length;
      prevRawNumber = raw;

      // se ficou vazio, limpa tudo
      if (raw === "") {
        el.value = "";
        return;
      }

      // formata
      const formatted = formatarCelular(el.value);

      // reaplica sempre (mas em deleção ele não “segura” o traço)
      el.value = formatted;

      // reposiciona o cursor
      let newPos = cursorPos;
      if (!isDeleting) {
        // ao digitar, avança sobre os símbolos
        if (raw.length === 1)      newPos += 1; // depois do "("
        else if (raw.length === 3) newPos += 2; // depois de ") "
        else if (raw.length === 7) newPos += 1; // depois do "-"
      }
      el.setSelectionRange(newPos, newPos);
    });
  }

  // Valida se nome e telefone estão preenchidos para habilitar o QR
  function validarCampos(form) {
    const inputNome = form.querySelector('.nome-garcom');
    const inputTel  = form.querySelector('.tel-garcom');
    const btnQr     = form.querySelector('.btn-qr');
    const nomeValido = inputNome.value.trim().length > 0;
    const telValido  = inputTel.value.replace(/\D/g, '').length === 11;
    btnQr.disabled   = !(nomeValido && telValido);
  }

  // Adiciona listeners de validação em cada formulário
  function adicionarEventosValidacao(form) {
    const inputNome = form.querySelector('.nome-garcom');
    const inputTel  = form.querySelector('.tel-garcom');
    inputNome.addEventListener('input', () => validarCampos(form));
    inputTel .addEventListener('input', () => validarCampos(form));
  }

  // (Re)Gera os formulários de garçons conforme quantidade
  function gerarFormulariosGarcons(qtd) {
    // salva valores atuais pra não perder
    const backup = {};
    containerFormularios.querySelectorAll('.form-garcom').forEach(f => {
      const id = f.querySelector('.nome-garcom').dataset.id;
      backup[id] = {
        nome: f.querySelector('.nome-garcom').value,
        tel:  f.querySelector('.tel-garcom').value
      };
    });

    containerFormularios.innerHTML = '';
    for (let i = 1; i <= qtd; i++) {
      const form = document.createElement('div');
      form.className = 'form-garcom';
      const nomeSalvo = backup[i]?.nome || '';
      const telSalvo  = backup[i]?.tel  || '';
      form.innerHTML = `
        <label>Garçom ${i}:</label><br>
        <input type="text" placeholder="Nome" class="nome-garcom" data-id="${i}" value="${nomeSalvo}">
        <input type="tel"  placeholder="Telefone" class="tel-garcom" data-id="${i}" maxlength="15" value="${telSalvo}">
        <button class="btn-qr" data-id="${i}" disabled>Gerar QR Code</button>
      `;
      containerFormularios.appendChild(form);

      const inputTel = form.querySelector('.tel-garcom');
      adicionarEventoFormatacao(inputTel);
      adicionarEventosValidacao(form);
      validarCampos(form);
    }
  }

  // Listeners do controle de quantidade
  inputQuantidade.addEventListener('change', () => {
    let val = parseInt(inputQuantidade.value) || 1;
    if (val < 1) val = 1;
    inputQuantidade.value = val;
    gerarFormulariosGarcons(val);
  });
  btnMais.addEventListener('click', () => {
    inputQuantidade.value = (parseInt(inputQuantidade.value) || 1) + 1;
    inputQuantidade.dispatchEvent(new Event('change'));
  });
  btnMenos.addEventListener('click', () => {
    inputQuantidade.value = Math.max(1, (parseInt(inputQuantidade.value) || 1) - 1);
    inputQuantidade.dispatchEvent(new Event('change'));
  });

  // inicializa com 1 formulário
  gerarFormulariosGarcons(1);
}


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