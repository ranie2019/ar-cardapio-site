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
          showNotification("Cadastro realizado com sucesso!");
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

  function showNotification(message, isError = false, durationMs = 1800) {
  let n = document.getElementById('custom-notification');
  if (!n) {
    n = document.createElement('div');
    n.id = 'custom-notification';
    n.style.cssText = `
      position:fixed; top:20px; left:50%;
      transform:translate(-50%,-6px); /* levinho para cima ao iniciar */
      opacity:0;
      padding:12px 18px; border-radius:10px;
      color:#fff; font:600 14px/1.3 Inter,system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
      z-index:10000; box-shadow:0 12px 32px rgba(0,0,0,.35);
      transition:opacity .18s ease-out, transform .18s ease-out;
      pointer-events:none;
    `;
    document.body.appendChild(n);
  }

  n.textContent = message;
  n.style.backgroundColor = isError ? '#dc3545' : '#28a745';

  // animação de ENTRADA (rápida)
  requestAnimationFrame(() => {
    n.style.opacity = '1';
    n.style.transform = 'translate(-50%, 0)';
  });

  // limpa timers e agenda a SAÍDA (rápida)
  clearTimeout(n._hideTimer);
  if (durationMs > 0) {
    n._hideTimer = setTimeout(() => {
      n.style.opacity = '0';
      n.style.transform = 'translate(-50%, -6px)';
    }, durationMs);
  }
}

});