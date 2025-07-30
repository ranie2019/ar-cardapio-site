document.addEventListener('DOMContentLoaded', () => {
  const senhaInput = document.getElementById("senha");
  const confirmarSenhaInput = document.getElementById("confirmarSenha");
  const formCadastro = document.getElementById('formCadastro');
  const mensagemErro = document.getElementById('mensagemErro');
  const cnpjInput = document.getElementById('cnpj');
  const telefoneInput = document.getElementById('telefone');
  const botaoCadastro = document.getElementById('botaoCadastro');

  // ✅ Validação de senhas
  function validarSenhas() {
    if (!senhaInput || !confirmarSenhaInput) return;
    if (senhaInput.value !== confirmarSenhaInput.value) {
      confirmarSenhaInput.setCustomValidity("As senhas não coincidem.");
    } else {
      confirmarSenhaInput.setCustomValidity("");
    }
    verificarCampos();
  }

  // ✅ Máscara CNPJ (permite apenas números e formata)
  if (cnpjInput) {
    cnpjInput.addEventListener('input', function () {
      this.value = this.value
        .replace(/\D/g, '') // remove tudo que não for número
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .slice(0, 18); // limita a 18 caracteres formatados
    });
  }

  // ✅ Máscara telefone (permite apenas números e formata)
  if (telefoneInput) {
    telefoneInput.addEventListener('input', function () {
      this.value = this.value
        .replace(/\D/g, '') // remove tudo que não for número
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15); // limita a 15 caracteres formatados
    });
  }

  // ✅ Habilita botão quando todos os campos estão preenchidos corretamente
  function verificarCampos() {
    const empresa = document.getElementById('empresa')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const telefone = telefoneInput?.value.trim();
    const cnpj = cnpjInput?.value.trim();
    const senha = senhaInput?.value.trim();
    const confirmarSenha = confirmarSenhaInput?.value.trim();

    const todosPreenchidos = empresa && email && telefone && cnpj && senha && confirmarSenha;
    const senhasIguais = senha === confirmarSenha;

    if (botaoCadastro) {
      botaoCadastro.disabled = !(todosPreenchidos && senhasIguais);
    }
  }

  // ✅ Eventos para validação em tempo real
  if (senhaInput && confirmarSenhaInput) {
    senhaInput.addEventListener("input", validarSenhas);
    confirmarSenhaInput.addEventListener("input", validarSenhas);
  }

  formCadastro?.addEventListener('input', verificarCampos);

  // ✅ Envio do formulário com integração ao banco de dados via API
  if (formCadastro) {
    formCadastro.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (senhaInput.value !== confirmarSenhaInput.value) {
        if (mensagemErro) mensagemErro.style.display = 'block';
        senhaInput.value = '';
        confirmarSenhaInput.value = '';
        return;
      } else {
        if (mensagemErro) mensagemErro.style.display = 'none';
      }

      const dados = {
        empresa: document.getElementById('empresa')?.value,
        email: document.getElementById('email')?.value,
        telefone: telefoneInput?.value,
        cnpj: cnpjInput?.value,
        senha: senhaInput?.value
      };

      try {
        const response = await fetch('https://k61hfu0r63.execute-api.us-east-1.amazonaws.com/dev/registrar', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(dados)
        });

        const result = await response.json();

        if (response.ok) {
          alert('✅ Cadastro realizado com sucesso!');
          formCadastro.reset();
          botaoCadastro.disabled = true;
        } else {
          alert(result.message || '❌ Erro ao cadastrar');
        }
      } catch (error) {
        console.error('Erro na requisição:', error);
        alert('❌ Erro ao enviar os dados. Tente novamente mais tarde.');
      }
    });
  }
});
