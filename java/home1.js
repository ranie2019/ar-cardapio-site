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

// Salva a configuração no S3 
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

// referências do modal de configuração (único no DOM)
const modalConfig      = document.getElementById('modalConfiguracaoProduto');
const btnFecharConfig  = document.getElementById('fecharConfiguracao');
const btnSalvarConfig  = document.getElementById('btnSalvarConfiguracao');
const inputValor       = document.getElementById('inputValor');
const inputDesc        = document.getElementById('inputDescricao');

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

  // Clique no botão (COM SINCRONIZAÇÃO)
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

  // Hover (mantido original)
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

  // ----- 1) Verifica se o modal já existe globalmente -----
  let modal = document.getElementById('modalConfiguracaoProduto');
  
  // Se não existir, cria (isso só deve acontecer uma vez)
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modalConfiguracaoProduto';
    modal.className = 'modal-edicao';
    modal.style.display = 'none';
    modal.innerHTML = `
      <div class="modal-content-edicao">
        <span class="close-edicao">&times;</span>
        <h3 class="modal-titulo">Configurar Produto</h3>
        <label>Valor (R$):</label>
        <input type="text" id="inputValor" placeholder="0,00"><br>
        <label>Descrição:</label>
        <textarea id="inputDescricao" rows="4"></textarea><br>
      </div>
    `;
    document.body.appendChild(modal);

    // ----- Eventos do modal (configurados uma única vez) -----
    // Fecha ao clicar no X
    modal.querySelector('.close-edicao').addEventListener('click', () => {
      modal.style.display = 'none';
    });

    // Fecha ao clicar fora do conteúdo
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
      }
    });

    // Impede que clique dentro do modal feche
    modal.querySelector('.modal-content-edicao').addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Formatação automática do valor monetário
    const inputValor = modal.querySelector('#inputValor');
    const inputDesc = modal.querySelector('#inputDescricao');

    inputValor.addEventListener('input', (e) => {
      // Formatação do valor
      let v = e.target.value.replace(/\D/g, '');
      v = (parseFloat(v) / 100).toFixed(2);
      v = v.replace('.', ',');
      v = v.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      e.target.value = v;
      
      // Salva automaticamente
      salvarConfiguracao();
    });

    // Salva ao modificar descrição
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

    // Verifica estado no localStorage
    const idItem = `itemEstado_${categoria}_${nome}`;
    if (localStorage.getItem(idItem) === 'true') {
      box.classList.add('desativado');
    }

    // Click para ativar/desativar item
    box.addEventListener('click', () => {
      box.classList.toggle('desativado');
      localStorage.setItem(idItem, box.classList.contains('desativado'));
      salvarConfiguracaoNoS3();
    });

    // Botão de configuração
    const btnConfig = document.createElement('button');
    btnConfig.className = 'btn-configurar-produto';
    btnConfig.textContent = 'Configuração';
    btnConfig.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Prepara dados do item
      const chave = `${categoria}/${nome.toLowerCase().replace(/\s+/g, '_')}`;
      const dados = dadosRestaurante[chave] || {};
      
      // Atualiza o modal global
      modal.querySelector('.modal-titulo').textContent = `Configurar ${nome}`;
      modal.querySelector('#inputValor').value = dados.preco != null 
        ? dados.preco.toLocaleString('pt-BR', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          }) 
        : '0,00';
      modal.querySelector('#inputDescricao').value = dados.descricao || '';
      
      // Define o item atual sendo configurado
      itemConfiguracao = chave;
      
      // Exibe o modal
      modal.style.display = 'flex';
    });

    wrapper.appendChild(box);
    wrapper.appendChild(btnConfig);
    container.appendChild(wrapper);
  });

  // Reativa o preview 3D nos itens
  requestAnimationFrame(() => adicionarPreview3D());
}

// Chamada das funções
setupCadastroGarcons();
setupQrCodeGarcons();