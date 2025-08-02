document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = document.getElementById('email').value.trim();
      const senha = document.getElementById('senha').value.trim();

      if (!email || !senha) {
        alert("Por favor, preencha todos os campos.");
        return;
      }

      try {
        const response = await fetch('https://8p9aawlikb.execute-api.us-east-1.amazonaws.com/loginCliente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,      // corrigido
            senha: senha       // corrigido
          })
        });

        const data = await response.json();

        if (response.ok && data.sucesso) {
          // Redireciona para a home
          window.location.href = "../html/home.html";
        } else {
          alert("E-mail ou senha inválidos.");
        }

      } catch (error) {
        console.error('Erro ao tentar login:', error);
        alert("Erro ao conectar com o servidor. Tente novamente mais tarde.");
      }
    });
  }
});
