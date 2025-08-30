// login.js — versão completa, organizada e sem abreviações

document.addEventListener("DOMContentLoaded", () => {
  // ----- Seletores da interface -----
  const formularioLogin = document.getElementById("form-login");
  const elementoMensagemErro = document.getElementById("mensagem-erro");
  const botaoEnviar = document.getElementById("Acessar");
  const campoEmail = document.getElementById("email");
  const campoSenha = document.getElementById("senha");

  console.log("login.js carregado!");

  if (!formularioLogin) {
    console.error("Formulário de login não encontrado na página.");
    return;
  }

  // ----- Configuração geral -----
  const URL_API_LOGIN = "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/loginCliente";
  const URL_PAGINA_HOME = "/html/home.html"; // use caminho absoluto para evitar erros de pasta

  // Chaves padronizadas para armazenamento local
  const CHAVE_TOKEN = "ar.token";
  const CHAVE_EMAIL = "ar.email";
  const CHAVE_EXPIRACAO = "ar.exp";

  // Duração padrão da sessão (em horas)
  const DURACAO_SESSAO_EM_HORAS = 24;

  // ----- Utilitários -----
  function validarEmail(enderecoEmail) {
    const padraoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return padraoEmail.test(String(enderecoEmail).toLowerCase());
  }

  function exibirMensagemDeErro(mensagem) {
    if (!elementoMensagemErro) return;
    elementoMensagemErro.textContent = mensagem;
    elementoMensagemErro.style.display = "block";
  }

  function ocultarMensagemDeErro() {
    if (!elementoMensagemErro) return;
    elementoMensagemErro.style.display = "none";
    elementoMensagemErro.textContent = "";
  }

  function atualizarEstadoDoBotao(estaCarregando) {
    if (!botaoEnviar) return;
    const textoDoBotao = botaoEnviar.querySelector(".texto-botao");
    if (textoDoBotao) {
      textoDoBotao.textContent = estaCarregando ? "Autenticando..." : "Acessar";
    }
    botaoEnviar.disabled = estaCarregando;
  }

  function salvarSessao(email, token) {
    const instanteDeExpiracao = Date.now() + DURACAO_SESSAO_EM_HORAS * 60 * 60 * 1000;
    localStorage.setItem(CHAVE_EMAIL, email);
    localStorage.setItem(CHAVE_TOKEN, token);
    localStorage.setItem(CHAVE_EXPIRACAO, String(instanteDeExpiracao));
  }

  // Opcional: esconder a mensagem de erro ao digitar novamente
  [campoEmail, campoSenha].forEach((entrada) => {
    if (!entrada) return;
    entrada.addEventListener("input", ocultarMensagemDeErro);
  });

  // ----- Envio do formulário -----
  formularioLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    ocultarMensagemDeErro();

    const email = (campoEmail?.value || "").trim().toLowerCase();
    const senha = (campoSenha?.value || "").trim();

    // Validações de entrada
    if (!email || !senha) {
      exibirMensagemDeErro("Por favor, preencha todos os campos.");
      return;
    }

    if (!validarEmail(email)) {
      exibirMensagemDeErro("Por favor, insira um e-mail válido.");
      return;
    }

    try {
      atualizarEstadoDoBotao(true);

      const resposta = await fetch(URL_API_LOGIN, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email, senha }),
      });

      // Trata respostas de rede incomuns
      if (resposta.type === "opaque" || resposta.type === "error") {
        throw new Error("Erro de conexão ou CORS.");
      }

      // Tenta interpretar o corpo como JSON (pode lançar exceção)
      const corpo = await resposta.json().catch(() => ({}));

      // Quando a API retorna erro (status não-2xx) OU success=false
      if (!resposta.ok || corpo.success === false) {
        const mensagemApi =
          (corpo && (corpo.message || corpo.mensagem)) ||
          `Erro HTTP: ${resposta.status}`;
        throw new Error(mensagemApi);
      }

      // Sucesso: espera `corpo.user.token` e `corpo.user.email`
      const tokenRecebido = corpo?.user?.token;
      const emailConfirmado = corpo?.user?.email || email;

      if (!tokenRecebido) {
        throw new Error("Resposta sem token de autenticação.");
      }

      // Salva sessão e redireciona
      salvarSessao(emailConfirmado, tokenRecebido);
      console.log("Login bem-sucedido. Redirecionando para:", URL_PAGINA_HOME);
      window.location.assign(URL_PAGINA_HOME);
    } catch (erro) {
      console.error("Erro no login:", erro);

      const mensagemAmigavel =
        String(erro?.message || "")
          .toLowerCase()
          .includes("cors") || String(erro?.message || "").toLowerCase().includes("conex")
          ? "Erro de conexão com o servidor. Tente novamente."
          : erro?.message || "E-mail ou senha incorretos.";

      exibirMensagemDeErro(mensagemAmigavel);

      if (campoSenha) campoSenha.value = "";
      campoSenha?.focus?.();
    } finally {
      atualizarEstadoDoBotao(false);
    }
  });
});
