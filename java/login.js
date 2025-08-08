document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form-login');
  console.log("login.js carregado!");

  if (!form) {
    console.error('Formulário de login não encontrado!');
    return;
  }

  // Elementos do DOM
  const mensagemErro = document.getElementById('mensagem-erro');
  const botaoAcessar = document.getElementById('Acessar');
  const emailInput = document.getElementById('email');
  const senhaInput = document.getElementById('senha');

  // Constantes
  const API_URL = 'https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/loginCliente';
  const HOME_URL = '../html/home.html'; // ou sistema.html, dependendo da sua lógica
  const TOKEN_KEY = 'authToken';
  const EMAIL_KEY = 'userEmail';

  // Validação de e-mail
  function validarEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }

  // Exibir erro
  function mostrarErro(mensagem) {
    if (!mensagemErro) return;

    mensagemErro.textContent = mensagem;
    mensagemErro.style.display = 'block';

    setTimeout(() => {
      mensagemErro.style.display = 'none';
    }, 5000);
  }

  // Ativar/desativar botão com texto de carregamento
  function toggleBotaoCarregamento(estaCarregando) {
    if (!botaoAcessar) return;

    const textoBotao = botaoAcessar.querySelector('.texto-botao');
    if (textoBotao) {
      textoBotao.textContent = estaCarregando ? 'Autenticando...' : 'Acessar';
    }

    botaoAcessar.disabled = estaCarregando;
  }

  // Submissão do formulário
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (mensagemErro) mensagemErro.style.display = 'none';

    const email = emailInput?.value.trim().toLowerCase();
    const senha = senhaInput?.value.trim();

    if (!email || !senha) {
      mostrarErro("Por favor, preencha todos os campos.");
      return;
    }

    if (!validarEmail(email)) {
      mostrarErro("Por favor, insira um e-mail válido.");
      return;
    }

    try {
      toggleBotaoCarregamento(true);

      const response = await fetch(API_URL, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ email, senha })
      });

      if (response.type === 'opaque' || response.type === 'error') {
        throw new Error('Erro de conexão ou CORS');
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || `Erro HTTP: ${response.status}`);
      }

      if (data.success && data.user?.token) {
        localStorage.setItem('authToken', data.user.token);
        localStorage.setItem('userEmail', data.user.email);
        // Espera pequena para garantir que o armazenamento finalize antes do redirecionamento
        setTimeout(() => {
          window.location.href = HOME_URL;
        }, 100); // 100 milissegundos
      } else {
        throw new Error('Autenticação falhou');
      }
      console.log('Token salvo, redirecionando para:', HOME_URL);

    } catch (error) {
      console.error('Erro no login:', error);

      const mensagem =
        error.message.includes('fetch') || error.message.includes('CORS')
          ? "Erro de conexão com o servidor. Tente novamente mais tarde."
          : error.message.includes('HTTP')
            ? `Erro do servidor: ${error.message}`
            : error.message || "E-mail ou senha incorretos.";

      mostrarErro(mensagem);

      if (senhaInput) senhaInput.value = '';
    } finally {
      toggleBotaoCarregamento(false);
    }
  });
});
