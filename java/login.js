// login.js — fluxo completo e claro
// Responsabilidades:
// 1) Enviar e validar o login no backend (API Gateway → Lambda).
// 2) Persistir sessão (token, e-mail, expiração).
// 3) Consultar o status do plano no backend e decidir o redirecionamento.

// ------------------------------
// Seletores e elementos de UI
// ------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const formularioLogin = document.getElementById("form-login");
  const caixaMensagemErro = document.getElementById("mensagem-erro");
  const botaoAcessar = document.getElementById("Acessar");
  const campoEmail = document.getElementById("email");
  const campoSenha = document.getElementById("senha");

  if (!formularioLogin) {
    console.error("Formulário de login não encontrado.");
    return;
  }

  // ------------------------------
  // Configurações de endpoints
  // ------------------------------
  const ENDPOINT_LOGIN = "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/loginCliente";
  // Lambda URL pública para checar o plano (POST { email })
  const ENDPOINT_CHECK_PLANO = "https://bnmlq4xdbvdz45z2wcy7cpso440ysnzk.lambda-url.us-east-1.on.aws/";

  // Páginas de destino
  const URL_PAGINA_HOME = "../html/home.html";
  const URL_PAGINA_PLANOS = "../html/plano.html";      // página com os planos
  const URL_PAGINA_VENDA = "../html/vendaTeste.html";  // checkout do plano

  // ------------------------------
  // Chaves de armazenamento
  // ------------------------------
  const CHAVE_TOKEN = "ar.token";
  const CHAVE_EMAIL = "ar.email";
  const CHAVE_EXPIRACAO = "ar.exp";
  const CHAVE_STATUS_PLANO = "ar.statusPlano"; // Nova chave para o status do plano
  const DURACAO_SESSAO_HORAS = 24;

  // ------------------------------
  // Utilitários
  // ------------------------------
  function validarEmail(valor) {
    const padrao = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return padrao.test(String(valor).toLowerCase());
  }

  function exibirErro(texto) {
    if (!caixaMensagemErro) return;
    caixaMensagemErro.textContent = texto;
    caixaMensagemErro.style.display = "block";
    setTimeout(() => {
      caixaMensagemErro.style.display = "none";
      caixaMensagemErro.textContent = "";
    }, 5000);
  }

  function limparErro() {
    if (!caixaMensagemErro) return;
    caixaMensagemErro.style.display = "none";
    caixaMensagemErro.textContent = "";
  }

  function setEstadoCarregando(ativo) {
    if (!botaoAcessar) return;
    const spanTexto = botaoAcessar.querySelector(".texto-botao");
    if (spanTexto) spanTexto.textContent = ativo ? "Autenticando..." : "Acessar";
    botaoAcessar.disabled = ativo;
  }

  // Modificada para salvar o status do plano
  function salvarSessao(email, token, statusPlano) {
    const instanteExpiracao = Date.now() + DURACAO_SESSAO_HORAS * 60 * 60 * 1000;
    try {
      localStorage.setItem(CHAVE_EMAIL, email);
      localStorage.setItem(CHAVE_TOKEN, token);
      localStorage.setItem(CHAVE_EXPIRACAO, String(instanteExpiracao));
      localStorage.setItem(CHAVE_STATUS_PLANO, statusPlano); // Salva o status do plano
      sessionStorage.setItem(CHAVE_EMAIL, email);
      sessionStorage.setItem(CHAVE_TOKEN, token);
      sessionStorage.setItem(CHAVE_EXPIRACAO, String(instanteExpiracao));
      sessionStorage.setItem(CHAVE_STATUS_PLANO, statusPlano); // Salva o status do plano
    } catch (erro) {
      console.warn("Falha ao gravar sessão:", erro);
    }
  }

  async function fetchComTimeout(url, opcoes = {}, timeoutMs = 15000) {
    const controlador = new AbortController();
    const id = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const resposta = await fetch(url, { ...opcoes, signal: controlador.signal });
      return resposta;
    } finally {
      clearTimeout(id);
    }
  }

  // ------------------------------
  // Checagem de plano
  // ------------------------------
  async function verificarPlanoAtivo(email, token) {
    try {
      const resposta = await fetchComTimeout(
        ENDPOINT_CHECK_PLANO,
        {
          method: "POST",
          mode: "cors",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ email })
        },
        12000
      );

      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) return "inativo"; // Retorna \'inativo\' se a resposta não for OK

      console.log("DEBUG verificarPlanoAtivo corpo:", corpo);
      // Prioriza \'planoAtivo\', se não existir, tenta \'active\'
      if (typeof corpo.planoAtivo === "boolean") return corpo.planoAtivo ? "ativo" : "inativo";
      if (typeof corpo.active === "boolean") return corpo.active ? "ativo" : "inativo";
      return "inativo"; // Padrão se não encontrar status
    } catch (erro) {
      console.warn("Erro ao verificar plano:", erro);
      return "inativo"; // Em caso de erro, assume plano inativo
    }
  }

  // ------------------------------
  // Listeners de UX
  // ------------------------------
  [campoEmail, campoSenha].forEach((entrada) => {
    if (!entrada) return;
    entrada.addEventListener("input", limparErro);
  });

  // ------------------------------
  // Submit do formulário
  // ------------------------------
  formularioLogin.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limparErro();

    const valorEmail = (campoEmail?.value || "").trim().toLowerCase();
    const valorSenha = (campoSenha?.value || "").trim();

    if (!valorEmail || !valorSenha) {
      exibirErro("Por favor, preencha todos os campos.");
      return;
    }
    if (!validarEmail(valorEmail)) {
      exibirErro("Por favor, insira um e-mail válido.");
      return;
    }

    try {
      setEstadoCarregando(true);

      const resposta = await fetchComTimeout(
        ENDPOINT_LOGIN,
        {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify({ email: valorEmail, senha: valorSenha })
        },
        15000
      );

      const texto = await resposta.text();   // <- funciona para text/plain e json
      let corpo = {};
      try { corpo = JSON.parse(texto); } catch (_) {} // se não for JSON, fica objeto vazio
      console.log("DEBUG login =>", resposta.status, texto, corpo);

      if (!resposta.ok || corpo?.success === false) {
        const mensagemServidor = corpo?.message || corpo?.mensagem || `Erro HTTP: ${resposta.status}`;
        throw new Error(mensagemServidor);
      }

      // tenta pegar o token em vários formatos
      const tokenAutenticacao =
        corpo?.token ||
        corpo?.accessToken ||
        corpo?.user?.token ||
        corpo?.data?.token;

      const emailConfirmado = corpo?.user?.email || corpo?.email || valorEmail;

      // se o backend avisar que o plano está inativo, redireciona já
      if (corpo?.reason === "plano_inativo" || corpo?.status === "inativo") {
        window.location.assign(`${URL_PAGINA_PLANOS}?email=${encodeURIComponent(valorEmail)}`);
        return;
      }

      // Checar plano e decidir destino
      const statusPlano = await verificarPlanoAtivo(emailConfirmado, tokenAutenticacao);

      // Salva a sessão APÓS verificar o status do plano
      if (!tokenAutenticacao) throw new Error("Resposta sem token de autenticação.");
      salvarSessao(emailConfirmado, tokenAutenticacao, statusPlano);

      // Se já veio um parâmetro "next" na URL, respeitar quando o plano estiver ativo
      const parametros = new URLSearchParams(window.location.search);
      const urlNext = parametros.get("next");

      if (statusPlano === "ativo") {
        window.location.assign(urlNext || URL_PAGINA_HOME);
      } else {
        // Sem plano: primeiro leva à página de planos; de lá o usuário vai ao checkout
        window.location.assign(URL_PAGINA_PLANOS);
      }
    } catch (erro) {
      console.error("Erro no login:", erro);
      const mensagemAmigavel = (() => {
        const texto = String(erro?.message || "");
        if (texto.toLowerCase().includes("cors") || texto.toLowerCase().includes("conex")) {
          return "Erro de conexão com o servidor. Tente novamente.";
        }
        return texto || "E-mail ou senha incorretos.";
      })();
      exibirErro(mensagemAmigavel);
      if (campoSenha) campoSenha.value = "";
      campoSenha?.focus?.();
    } finally {
      setEstadoCarregando(false);
    }
  });
});


