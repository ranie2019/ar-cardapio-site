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

  // Constantes - URL corrigida e verificada
  const API_URL = 'https://8p9aawiikb.execute-api.us-east-1.amazonaws.com/dev/loginCliente';
  const HOME_URL = '../html/home.html';
  const TOKEN_KEY = 'authToken';
  const EMAIL_KEY = 'userEmail';

  // Função para validar e-mail
  function validarEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
  }

  // Função para mostrar erros
  function mostrarErro(mensagem) {
    if (!mensagemErro) return;
    
    mensagemErro.textContent = mensagem;
    mensagemErro.style.display = 'block';
    
    setTimeout(() => {
      mensagemErro.style.display = 'none';
    }, 5000);
  }

  // Função para habilitar/desabilitar botão
  function toggleBotaoCarregamento(estaCarregando) {
    if (!botaoAcessar) return;
    
    const textoBotao = botaoAcessar.querySelector('.texto-botao');
    if (!textoBotao) return;
    
    botaoAcessar.disabled = estaCarregando;
    textoBotao.textContent = estaCarregando ? 'Autenticando...' : 'Acessar';
  }

  // Evento de submit do formulário
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    
    if (mensagemErro) mensagemErro.style.display = 'none';
    
    const email = emailInput?.value.trim();
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
          'Accept': 'application/json',
          'Origin': 'https://site-arcardapio.s3.us-east-1.amazonaws.com'
        },
        body: JSON.stringify({ 
          email: String(email).toLowerCase(), 
          senha 
        })
      });

      // Verificação de erro de rede/CORS
      if (response.type === 'opaque' || response.type === 'error') {
        throw new Error('Erro de conexão/CORS');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.mensagem || `Erro HTTP: ${response.status}`);
      }

      if (data.sucesso && data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(EMAIL_KEY, email);
        window.location.href = HOME_URL;
      } else {
        throw new Error(data.mensagem || 'Autenticação falhou');
      }
      
    } catch (error) {
      console.error('Erro no login:', error);
      
      const mensagem = error.message.includes('Failed to fetch') || error.message.includes('CORS')
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