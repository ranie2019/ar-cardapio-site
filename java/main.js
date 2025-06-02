// ==============================
// index (página inicial)
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  const abrirModal = document.getElementById("abrirModal");
  const fecharModal = document.getElementById("fecharModal");
  const modal = document.getElementById("modal");

  // Abrir/fechar modal de cadastro/login
  if (abrirModal && fecharModal && modal) {
    abrirModal.addEventListener("click", () => modal.classList.remove("hidden"));
    fecharModal.addEventListener("click", () => modal.classList.add("hidden"));

    // Fecha modal clicando fora da área de conteúdo
    window.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });
  }
});


// ==============================
// cadastro (validação, formatação, envio)
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  const senhaInput = document.getElementById("senha");
  const confirmarSenhaInput = document.getElementById("confirmarSenha");
  const formCadastro = document.getElementById('formCadastro');
  const mensagemErro = document.getElementById('mensagemErro');
  const cnpjInput = document.getElementById('cnpj');
  const telefoneInput = document.getElementById('telefone');

  // Valida se as senhas coincidem
  function validarSenhas() {
    if (!senhaInput || !confirmarSenhaInput) return;
    if (senhaInput.value !== confirmarSenhaInput.value) {
      confirmarSenhaInput.setCustomValidity("As senhas não coincidem.");
    } else {
      confirmarSenhaInput.setCustomValidity("");
    }
  }

  if (senhaInput && confirmarSenhaInput) {
    senhaInput.addEventListener("input", validarSenhas);
    confirmarSenhaInput.addEventListener("input", validarSenhas);
  }

  // Controle do envio do formulário: bloqueia se senhas divergentes
  if (formCadastro && senhaInput && confirmarSenhaInput) {
    formCadastro.addEventListener('submit', (event) => {
      if (senhaInput.value !== confirmarSenhaInput.value) {
        event.preventDefault();
        if (mensagemErro) mensagemErro.style.display = 'block';
        senhaInput.value = '';
        confirmarSenhaInput.value = '';
      } else {
        if (mensagemErro) mensagemErro.style.display = 'none';
      }
    });
  }

  // Máscara para CNPJ em tempo real
  if (cnpjInput) {
    cnpjInput.addEventListener('input', function () {
      this.value = this.value
        .replace(/\D/g, '')
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .slice(0, 18);
    });
  }

  // Máscara para telefone (formato: (XX) XXXXX-XXXX)
  if (telefoneInput) {
    telefoneInput.addEventListener('input', function () {
      this.value = this.value
        .replace(/\D/g, '')
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15);
    });
  }
});


// ==============================
// home (menu perfil e cardápio)
// ==============================
document.addEventListener('DOMContentLoaded', () => {
  const profileBtn = document.getElementById('profile-btn');
  const dropdown = document.getElementById('dropdown');
  const cardapioBtn = document.getElementById('cardapio-btn');
  const dropdownCardapio = document.getElementById('dropdownCardapio');

  // Alterna o menu "Perfil"
  if (profileBtn && dropdown) {
    profileBtn.addEventListener('click', () => {
      dropdown.classList.toggle('show');
    });
  }

  // Alterna o menu "Cardápio"
  if (cardapioBtn && dropdownCardapio) {
    cardapioBtn.addEventListener('click', () => {
      dropdownCardapio.classList.toggle('show');

      // Se o menu foi fechado, limpa os itens exibidos
      const container = document.getElementById('itensContainer');
      if (!dropdownCardapio.classList.contains('show') && container) {
        container.innerHTML = '';
        categoriaAtiva = null;
      }
    });
  }

  // ⚠️ Importante: clique fora do cardápio NÃO fecha mais o menu para evitar conflito com seleção de itens
});


// ============================== CARDÁPIO - CONTROLE DE ITENS ==============================

// Armazena qual categoria está ativa
let categoriaAtiva = null;

/**
 * Exibe os itens da categoria clicada no menu do cardápio.
 * Se clicar novamente, oculta.
 */
function mostrarItens(categoria) {
  const container = document.getElementById('itensContainer');

  // Se container ou categoria não existe, sai
  if (!container || !objetos3D[categoria]) return;

  // Se clicou na mesma categoria ativa, reseta
  if (categoriaAtiva === categoria) {
    container.innerHTML = '';
    categoriaAtiva = null;
    return;
  }

  // Define nova categoria e limpa container
  categoriaAtiva = categoria;
  container.innerHTML = '';

  // Para cada item da categoria, cria uma caixa na tela
  objetos3D[categoria].forEach((nome, i) => {
    const box = document.createElement('div');
    box.className = 'item-box';
    box.textContent = nome;
    box.style.animationDelay = `${i * 0.1}s`; // Animação em cascata (opcional)
    container.appendChild(box);
  });
}

// ============================== HOME - PRÉ-VISUALIZAÇÃO AUTOMÁTICA DE MODELO 3D ==============================
// Caminho base dos modelos no bucket
const MODEL_BASE_URL = 'https://ar-menu-models.s3.amazonaws.com/';

// Cria um container modal flutuante invisível
const modelModal = document.createElement('div');
modelModal.className = 'model-preview-modal';
modelModal.style.display = 'none';
document.body.appendChild(modelModal);

// Função utilitária para transformar nome em nome de arquivo
function nomeParaArquivo(nome) {
  return nome.trim().toLowerCase().replace(/\s+/g, '_') + '.glb';
}

// Adiciona eventos de hover a cada item do cardápio
document.querySelectorAll('.item-box').forEach(item => {
  const nomeObjeto = item.textContent.trim();
  const nomeArquivo = nomeParaArquivo(nomeObjeto);

  item.addEventListener('mouseenter', () => {
    const rect = item.getBoundingClientRect();

    // Define a posição do modal ao lado do item
    modelModal.style.left = `${rect.right + 10}px`;
    modelModal.style.top = `${rect.top}px`;
    modelModal.style.display = 'block';

    // Define o conteúdo da visualização 3D
    modelModal.innerHTML = `
      <a-scene embedded vr-mode-ui="enabled: false">
        <a-entity position="0 0 -3">
          <a-gltf-model src="${MODEL_BASE_URL}${nomeArquivo}" scale="0.5 0.5 0.5"></a-gltf-model>
        </a-entity>
        <a-light type="ambient" intensity="1.2"></a-light>
        <a-camera position="0 0 0"></a-camera>
      </a-scene>
    `;
  });

  item.addEventListener('mouseleave', () => {
    modelModal.style.display = 'none';
    modelModal.innerHTML = ''; // Limpa conteúdo ao sair
  });
});
