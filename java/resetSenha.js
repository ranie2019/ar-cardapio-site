// ============================
//   resetSenha.js
// ============================

// --- CONFIGURAÇÃO ---
// IMPORTANTE: Substitua esta URL pela URL de invocação (Invoke URL) do seu API Gateway.
const API_ENDPOINT = 'https://SEU_API_GATEWAY_AQUI/seu-recurso'; // <-- TROQUE AQUI

// --- ELEMENTOS DO DOM ---
// Captura todos os elementos do HTML que vamos manipular.
const newPasswordInput = document.getElementById('newPassword' );
const confirmPasswordInput = document.getElementById('confirmPassword');
const showPasswordCheckbox = document.getElementById('showPassword');
const resetBtn = document.getElementById('resetBtn');
const messageDiv = document.getElementById('message');

// --- LÓGICA DE VISIBILIDADE DA SENHA ---
// Adiciona um "ouvinte" de eventos na caixa de seleção.
showPasswordCheckbox.addEventListener('change', () => {
  // Verifica se a caixa está marcada.
  const isChecked = showPasswordCheckbox.checked;
  
  // Define o tipo do campo com base no estado da caixa (operador ternário).
  const newType = isChecked ? 'text' : 'password';
  
  // Aplica o novo tipo aos dois campos de senha.
  newPasswordInput.type = newType;
  confirmPasswordInput.type = newType;
});

// --- CAPTURA DE PARÂMETROS DA URL ---
// Cria um objeto para facilitar a busca de parâmetros na URL da página.
const urlParams = new URLSearchParams(window.location.search);
const tokenFromUrl = urlParams.get('token'); // Pega o valor do parâmetro 'token'
const emailFromUrl = urlParams.get('email'); // Pega o valor do parâmetro 'email'

// --- VALIDAÇÃO INICIAL ---
// Verifica se o token e o e-mail foram encontrados na URL.
// Se um deles estiver faltando, o processo não pode continuar.
if (!tokenFromUrl || !emailFromUrl) {
  showMessage('Link inválido. Token ou e-mail ausente na URL.', true);
  resetBtn.disabled = true; // Desabilita o botão para impedir ações.
}

// --- FUNÇÃO AUXILIAR PARA EXIBIR MENSAGENS ---
/**
 * Exibe uma mensagem na tela para o usuário.
 * @param {string} msg - A mensagem a ser exibida.
 * @param {boolean} isError - Se verdadeiro, aplica o estilo de erro; senão, aplica o de sucesso.
 */
function showMessage(msg, isError = false) {
  messageDiv.textContent = msg;
  // Adiciona a classe CSS 'error' ou 'success' para colorir a mensagem.
  messageDiv.className = isError ? 'error' : 'success';
}

// --- EVENTO PRINCIPAL DO BOTÃO "REDEFINIR SENHA" ---
// Adiciona um "ouvinte" para o evento de clique no botão.
resetBtn.addEventListener('click', async () => {
  // Pega e limpa os valores dos campos de senha.
  const newPassword = newPasswordInput.value.trim();
  const confirmPassword = confirmPasswordInput.value.trim();

  // 1. VALIDAÇÕES DO LADO DO CLIENTE
  if (!newPassword || !confirmPassword) {
    showMessage('Por favor, preencha os dois campos de senha.', true);
    return; // Para a execução.
  }
  if (newPassword !== confirmPassword) {
    showMessage('As senhas não coincidem. Tente novamente.', true);
    return;
  }
  if (newPassword.length < 8) {
    showMessage('A senha deve ter pelo menos 8 caracteres.', true);
    return;
  }

  // 2. PREPARAÇÃO PARA A REQUISIÇÃO
  // Desabilita o botão para evitar cliques duplos e mostra uma mensagem de carregamento.
  resetBtn.disabled = true;
  showMessage('Redefinindo sua senha, aguarde...');

  // 3. REQUISIÇÃO PARA A API (BACKEND)
  try {
    // Monta o corpo (payload) da requisição em formato JSON.
    const payload = {
      email: emailFromUrl,
      token: tokenFromUrl,
      newPassword: newPassword
    };

    // Envia a requisição para o endpoint da API usando o método POST.
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Tenta converter a resposta da API para JSON. Se falhar, retorna um objeto vazio.
    const responseBody = await response.json().catch(() => ({}));

    // 4. TRATAMENTO DA RESPOSTA
    if (response.ok) {
      // SUCESSO: A API retornou um status 2xx.
      showMessage('Senha redefinida com sucesso! Redirecionando para o login...');
      
      // Aguarda 2 segundos para o usuário ler a mensagem e então redireciona.
      setTimeout(() => {
        window.location.href = 'login.html'; // Altere se o nome da sua página de login for diferente.
      }, 2000);
      
      // Não reabilita o botão, pois a página será redirecionada.
      return; 
    } else {
      // ERRO: A API retornou um status de erro (4xx ou 5xx).
      // Tenta encontrar a mensagem de erro mais específica no corpo da resposta.
      const errorMessage = responseBody.error || responseBody.message || `Erro ${response.status}. Tente novamente.`;
      showMessage(errorMessage, true);
    }

  } catch (err) {
    // ERRO DE CONEXÃO: Falha ao tentar se comunicar com o servidor.
    console.error('Erro de rede ou na requisição fetch:', err);
    showMessage('Erro de conexão. Verifique sua internet e tente novamente.', true);
  } finally {
    // O bloco 'finally' sempre é executado, com ou sem erro.
    // Reabilita o botão apenas se a requisição não teve sucesso.
    if (resetBtn.disabled && !messageDiv.classList.contains('success')) {
      resetBtn.disabled = false;
    }
  }
});
