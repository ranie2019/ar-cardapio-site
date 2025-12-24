"use strict";

/**
 * cadastro.js (COMPLETO + ROBUSTO)
 * ✅ Não quebra suas lógicas antigas
 * ✅ Funciona mesmo se o HTML tiver IDs diferentes (aliases)
 * ✅ Máscaras: CNPJ, telefone, CEP
 * ✅ ViaCEP: autopreenche logradouro/bairro/cidade/UF
 * ✅ Validações: senha>=8, confirmar senha, endereço completo, checkbox confirmBilling (se existir)
 * ✅ Envia SEMPRE: cnpj (com máscara) + cpfCnpj (só números) + enderecoCobranca (objeto)
 * ✅ Email sempre lowercase
 * ✅ Popup: imediato; sucesso redireciona
 * ✅ Debug: URL + payload + resposta
 */

// ============================
// CONFIG
// ============================
const API_BASE = "https://k61hfu0r63.execute-api.us-east-1.amazonaws.com/dev";
const API_REGISTER_URL = `${API_BASE}/registrar`;
const REDIRECT_AFTER_SUCCESS_URL = "plano.html";

// ============================
// HELPERS
// ============================
const onlyDigits = (s) => (s || "").toString().replace(/\D+/g, "");
const trim = (v) => (v || "").toString().trim();
const has = (el) => !!el;

// pega o primeiro elemento que existir (pra não depender de 1 ID exato)
function pickEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function setErr(el, msg) {
  if (!el) return;
  el.setCustomValidity(msg || "");
}

// debounce simples (pra ViaCEP não ficar disparando sem parar)
function debounce(fn, wait = 350) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// ============================
// MAIN
// ============================
document.addEventListener("DOMContentLoaded", () => {
  // Form / botão (aliases)
  const formCadastro = pickEl("formCadastro", "cadastroForm", "form-cadastro");
  const botaoCadastro = pickEl("botaoCadastro", "btnCadastrar", "btnCadastro", "cadastrarBtn");

  // Campos básicos (aliases)
  const empresaInput  = pickEl("empresa", "nomeEmpresa", "nome", "empresaNome");
  const emailInput    = pickEl("email", "emailEmpresa", "emailCliente");
  const telefoneInput = pickEl("telefone", "whatsapp", "telefoneWhatsapp", "fone");
  const cnpjInput     = pickEl("cnpj", "cnpjEmpresa", "cpfCnpjInput", "documento");
  const senhaInput    = pickEl("senha", "password", "newPassword");
  const confirmarSenhaInput = pickEl("confirmarSenha", "confirmPassword", "confirmar_senha", "senha2");

  // Endereço (aliases)
  const cepInput        = pickEl("cep", "cepCobranca", "cep_endereco", "billingCep");
  const numeroInput     = pickEl("numero", "numeroCobranca", "numero_endereco", "billingNumber");
  const logradouroInput = pickEl("logradouro", "endereco", "rua", "billingStreet");
  const bairroInput     = pickEl("bairro", "bairroCobranca", "billingDistrict");
  const cidadeInput     = pickEl("cidade", "cidadeCobranca", "billingCity");
  const ufInput         = pickEl("uf", "estado", "estadoUF", "billingState");
  const complementoInput = pickEl("complemento", "complementoCobranca", "billingComplement");

  // Checkbox opcional
  const confirmBilling = pickEl("confirmBilling", "confirmEnderecoCobranca", "billingConfirm");

  // Compatibilidade antiga
  const mensagemErro = pickEl("mensagemErro", "erroCadastro", "msgErro");

  // -----------------------------
  // Email lowercase em tempo real (não quebra nada)
  // -----------------------------
  if (emailInput) {
    emailInput.addEventListener("blur", () => {
      emailInput.value = trim(emailInput.value).toLowerCase();
    });
  }

  function getLowerEmail() {
    return trim(emailInput?.value).toLowerCase();
  }

  // -----------------------------
  // Senhas
  // -----------------------------
  function validarSenhas() {
    if (!senhaInput || !confirmarSenhaInput) {
      verificarCampos();
      return;
    }

    const s1 = trim(senhaInput.value);
    const s2 = trim(confirmarSenhaInput.value);

    if (s1 && s1.length < 8) setErr(senhaInput, "Senha muito curta (mínimo 8 caracteres).");
    else setErr(senhaInput, "");

    if (s2 && s1 !== s2) setErr(confirmarSenhaInput, "As senhas não coincidem.");
    else setErr(confirmarSenhaInput, "");

    verificarCampos();
  }

  if (senhaInput) senhaInput.addEventListener("input", validarSenhas);
  if (confirmarSenhaInput) confirmarSenhaInput.addEventListener("input", validarSenhas);

  // -----------------------------
  // Máscara CNPJ
  // -----------------------------
  if (cnpjInput) {
    cnpjInput.addEventListener("input", function () {
      this.value = this.value
        .replace(/\D/g, "")
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2")
        .slice(0, 18);
      verificarCampos();
    });
  }

  // -----------------------------
  // Máscara telefone
  // -----------------------------
  if (telefoneInput) {
    telefoneInput.addEventListener("input", function () {
      this.value = this.value
        .replace(/\D/g, "")
        .replace(/^(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{5})(\d)/, "$1-$2")
        .slice(0, 15);
      verificarCampos();
    });
  }

  // -----------------------------
  // UF: só 2 letras
  // -----------------------------
  if (ufInput) {
    ufInput.addEventListener("input", function () {
      this.value = (this.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      verificarCampos();
    });
  }

  // -----------------------------
  // ViaCEP
  // -----------------------------
  async function buscarCep(cep8) {
    const url = `https://viacep.com.br/ws/${cep8}/json/`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json().catch(() => null);
    if (data && !data.erro) return data;
    return null;
  }

  const preencherViaCep = debounce(async () => {
    if (!cepInput) return;
    const cep8 = onlyDigits(cepInput.value);
    if (cep8.length !== 8) return;

    try {
      const data = await buscarCep(cep8);
      if (!data) return;

      // só preenche se o input existir (sem dar erro)
      if (logradouroInput) logradouroInput.value = data.logradouro || "";
      if (bairroInput) bairroInput.value = data.bairro || "";
      if (cidadeInput) cidadeInput.value = data.localidade || "";
      if (ufInput) ufInput.value = (data.uf || "").toUpperCase();

      verificarCampos();
    } catch (e) {
      console.warn("[CADASTRO] ViaCEP falhou:", e);
    }
  }, 350);

  if (cepInput) {
    // máscara CEP
    cepInput.addEventListener("input", function () {
      let v = onlyDigits(this.value).slice(0, 8);
      if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
      this.value = v;

      verificarCampos();
      preencherViaCep();
    });

    // também tenta no blur (quando a pessoa cola e sai do campo)
    cepInput.addEventListener("blur", preencherViaCep);
  }

  // -----------------------------
  // Habilitar botão (principal)
  // -----------------------------
  function verificarCampos() {
    const empresa = trim(empresaInput?.value);
    const email = getLowerEmail();
    const telefone = trim(telefoneInput?.value);
    const cnpj = trim(cnpjInput?.value);

    const senha = trim(senhaInput?.value);
    const confirmarSenha = trim(confirmarSenhaInput?.value);

    // básicos: só exige o que realmente existe na página
    const basicosOk =
      (!!empresaInput ? !!empresa : true) &&
      (!!emailInput ? !!email : true) &&
      (!!telefoneInput ? !!telefone : true) &&
      (!!cnpjInput ? !!cnpj : true) &&
      (!!senhaInput ? !!senha : true) &&
      (!!confirmarSenhaInput ? !!confirmarSenha : true);

    const senhasIguais = (!!senhaInput && !!confirmarSenhaInput) ? (senha === confirmarSenha) : true;
    const senhaMin = (!!senhaInput) ? (senha.length >= 8) : true;

    // endereço obrigatório SOMENTE se os campos existirem
    let enderecoOk = true;
    if (cepInput || numeroInput || logradouroInput || bairroInput || cidadeInput || ufInput) {
      const cep = cepInput ? onlyDigits(cepInput.value) : "";
      const numero = numeroInput ? trim(numeroInput.value) : "";
      const logradouro = logradouroInput ? trim(logradouroInput.value) : "";
      const bairro = bairroInput ? trim(bairroInput.value) : "";
      const cidade = cidadeInput ? trim(cidadeInput.value) : "";
      const uf = ufInput ? trim(ufInput.value).toUpperCase() : "";

      enderecoOk =
        (!cepInput || cep.length === 8) &&
        (!numeroInput || !!numero) &&
        (!logradouroInput || !!logradouro) &&
        (!bairroInput || !!bairro) &&
        (!cidadeInput || !!cidade) &&
        (!ufInput || uf.length === 2);
    }

    // checkbox confirmBilling (se existir)
    let billingOk = true;
    if (confirmBilling) billingOk = !!confirmBilling.checked;

    // se o form existir, respeita validade nativa também
    const formOk = formCadastro ? formCadastro.checkValidity() : true;

    const canEnable = basicosOk && senhasIguais && senhaMin && enderecoOk && billingOk && formOk;

    if (botaoCadastro) botaoCadastro.disabled = !canEnable;

    // debug opcional (não quebra nada)
    // console.log("[CADASTRO] enable?", canEnable, { basicosOk, senhasIguais, senhaMin, enderecoOk, billingOk, formOk });
  }

  if (formCadastro) {
    formCadastro.addEventListener("input", verificarCampos);
    formCadastro.addEventListener("change", verificarCampos);
  }
  verificarCampos();

  // -----------------------------
  // Submit
  // -----------------------------
  let isSubmitting = false;

  if (formCadastro) {
    formCadastro.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (isSubmitting) return;
      isSubmitting = true;

      validarSenhas();
      if (!formCadastro.checkValidity()) {
        formCadastro.reportValidity();
        isSubmitting = false;
        return;
      }

      if (senhaInput && confirmarSenhaInput && senhaInput.value !== confirmarSenhaInput.value) {
        if (mensagemErro) mensagemErro.style.display = "block";
        senhaInput.value = "";
        confirmarSenhaInput.value = "";
        verificarCampos();
        isSubmitting = false;
        return;
      } else {
        if (mensagemErro) mensagemErro.style.display = "none";
      }

      const notif = showNotification("Cadastrando...", false, 0);

      if (botaoCadastro) {
        botaoCadastro.disabled = true;
        botaoCadastro.dataset._oldText = botaoCadastro.textContent || "Cadastrar";
        botaoCadastro.textContent = "Cadastrando...";
      }

      const cnpjMascara = trim(cnpjInput?.value);
      const cpfCnpjLimpo = onlyDigits(cnpjMascara);

      const dados = {
        nome: trim(empresaInput?.value),
        email: getLowerEmail(),
        telefone: trim(telefoneInput?.value),

        cnpj: cnpjMascara,
        cpfCnpj: cpfCnpjLimpo,

        senha: senhaInput?.value || "",

        enderecoCobranca: (cepInput || numeroInput || logradouroInput || bairroInput || cidadeInput || ufInput)
          ? {
              cep: cepInput ? onlyDigits(cepInput.value) : "",
              logradouro: logradouroInput ? trim(logradouroInput.value) : "",
              numero: numeroInput ? trim(numeroInput.value) : "",
              bairro: bairroInput ? trim(bairroInput.value) : "",
              cidade: cidadeInput ? trim(cidadeInput.value) : "",
              uf: ufInput ? trim(ufInput.value).toUpperCase() : "",
              complemento: complementoInput ? (trim(complementoInput.value) || undefined) : undefined
            }
          : undefined
      };

      console.log("[CADASTRO] URL:", API_REGISTER_URL);
      console.log("[CADASTRO] payload:", dados);

      try {
        const response = await fetch(API_REGISTER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(dados)
        });

        const text = await response.text();
        let result = {};
        try { result = text ? JSON.parse(text) : {}; } catch { result = { raw: text }; }

        console.log("[CADASTRO] HTTP", response.status, result);

        if (response.ok) {
          updateNotification(notif, "Cadastro realizado com sucesso! Redirecionando...", false);

          try {
            localStorage.setItem("ar.email", dados.email);
            localStorage.setItem("ar.nomeEmpresa", dados.nome);
          } catch {}

          setTimeout(() => {
            window.location.href = REDIRECT_AFTER_SUCCESS_URL;
          }, 1500);

          return;
        }

        updateNotification(notif, result.message || `❌ Erro ao cadastrar (${response.status})`, true);
        autoHideNotification(notif, 4500);
      } catch (error) {
        console.error("[CADASTRO] falha na requisição:", error);
        updateNotification(notif, "❌ Erro ao enviar os dados. Tente novamente.", true);
        autoHideNotification(notif, 4500);
      } finally {
        isSubmitting = false;
        if (botaoCadastro) {
          botaoCadastro.disabled = false;
          botaoCadastro.textContent = botaoCadastro.dataset._oldText || "Cadastrar";
        }
        verificarCampos();
      }
    });
  }

  // -----------------------------
  // Notificação
  // -----------------------------
  function showNotification(message, isError = false, durationMs = 1800) {
    let n = document.getElementById("custom-notification");
    if (!n) {
      n = document.createElement("div");
      n.id = "custom-notification";
      n.style.cssText = `
        position:fixed; top:20px; left:50%;
        transform:translate(-50%,-6px);
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
    n.style.backgroundColor = isError ? "#dc3545" : "#28a745";

    requestAnimationFrame(() => {
      n.style.opacity = "1";
      n.style.transform = "translate(-50%, 0)";
    });

    clearTimeout(n._hideTimer);
    if (durationMs > 0) {
      n._hideTimer = setTimeout(() => {
        n.style.opacity = "0";
        n.style.transform = "translate(-50%, -6px)";
      }, durationMs);
    }

    return n;
  }

  function updateNotification(n, message, isError = false) {
    if (!n) return;
    n.textContent = message;
    n.style.backgroundColor = isError ? "#dc3545" : "#28a745";
    n.style.opacity = "1";
    n.style.transform = "translate(-50%, 0)";
  }

  function autoHideNotification(n, durationMs = 1800) {
    if (!n) return;
    clearTimeout(n._hideTimer);
    n._hideTimer = setTimeout(() => {
      n.style.opacity = "0";
      n.style.transform = "translate(-50%, -6px)";
    }, durationMs);
  }
});
