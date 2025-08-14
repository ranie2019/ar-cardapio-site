document.addEventListener('DOMContentLoaded', () => {
  const senhaInput = document.getElementById("senha");
  const confirmarSenhaInput = document.getElementById("confirmarSenha");
  const formCadastro = document.getElementById('formCadastro');
  const mensagemErro = document.getElementById('mensagemErro');
  const cnpjInput = document.getElementById('cnpj');
  const telefoneInput = document.getElementById('telefone');
  const botaoCadastro = document.getElementById('botaoCadastro');

  // âœ… ValidaÃ§Ã£o de senhas
  function validarSenhas() {
    if (!senhaInput || !confirmarSenhaInput) return;
    if (senhaInput.value !== confirmarSenhaInput.value) {
      confirmarSenhaInput.setCustomValidity("As senhas nÃ£o coincidem.");
    } else {
      confirmarSenhaInput.setCustomValidity("");
    }
    verificarCampos();
  }

  // âœ… MÃ¡scara CNPJ (permite apenas nÃºmeros e formata)
  if (cnpjInput) {
    cnpjInput.addEventListener('input', function () {
      this.value = this.value
        .replace(/\D/g, '') // remove tudo que nÃ£o for nÃºmero
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .slice(0, 18); // limita a 18 caracteres formatados
    });
  }

  // âœ… MÃ¡scara telefone (permite apenas nÃºmeros e formata)
  if (telefoneInput) {
    telefoneInput.addEventListener('input', function () {
      this.value = this.value
        .replace(/\D/g, '') // remove tudo que nÃ£o for nÃºmero
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15); // limita a 15 caracteres formatados
    });
  }

  // âœ… Habilita botÃ£o quando todos os campos estÃ£o preenchidos corretamente
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

  // âœ… Eventos para validaÃ§Ã£o em tempo real
  if (senhaInput && confirmarSenhaInput) {
    senhaInput.addEventListener("input", validarSenhas);
    confirmarSenhaInput.addEventListener("input", validarSenhas);
  }

  formCadastro?.addEventListener('input', verificarCampos);

  // âœ… Envio do formulÃ¡rio com integraÃ§Ã£o ao banco de dados via API
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
        nome: document.getElementById("empresa")?.value,
        email: document.getElementById('email')?.value,
        telefone: telefoneInput?.value,
        cnpj: cnpjInput?.value,
        senha: senhaInput?.value
      };

      try {
        const response = await fetch("https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com/prod/register", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(dados)
        });

        const result = await response.json();

        if (response.ok) {
          showNotification("âœ… Cadastro realizado com sucesso!");
          formCadastro.reset();
          botaoCadastro.disabled = true;
          setTimeout(() => {
            window.location.href = 'plano.html';
          }, 5000); // Redireciona apÃ³s 5 segundos
        } else {
          showNotification(result.message || 'âŒ Erro ao cadastrar', true);
        }
      } catch (error) {
        console.error('Erro na requisiÃ§Ã£o:', error);
        showNotification('âŒ Erro ao enviar os dados. Tente novamente mais tarde.', true);
      }
    });
  }

  function showNotification(message, isError = false) {
    let notification = document.getElementById('custom-notification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'custom-notification';
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 15px 25px;
      border-radius: 8px;
      color: white;
      font-size: 16px;
      font-weight: bold;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transition: opacity 0.5s ease-in-out;
      opacity: 1;
      background-color: ${isError ? '#dc3545' : '#28a745'};
    `;

    // Remove a notificaÃ§Ã£o apÃ³s 5 segundos
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 500); // Remove do DOM apÃ³s a transiÃ§Ã£o
    }, 5000);
  }
});