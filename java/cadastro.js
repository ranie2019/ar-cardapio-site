document.addEventListener('DOMContentLoaded', () => {
  const senhaInput = document.getElementById("senha");
  const confirmarSenhaInput = document.getElementById("confirmarSenha");
  const formCadastro = document.getElementById('formCadastro');
  const mensagemErro = document.getElementById('mensagemErro');
  const cnpjInput = document.getElementById('cnpj');
  const telefoneInput = document.getElementById('telefone');

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