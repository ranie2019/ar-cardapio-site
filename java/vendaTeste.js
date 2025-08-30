/* ========================== Configuração ========================== */
const API_CREATE_PAYMENT_INTENT =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/createPaymentIntent";

const API_VALIDATE_EMAIL =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/cliente"; // GET /cliente?email=...

const STRIPE_PUBLISHABLE_KEY =
  "pk_live_51S0B6wGbgLl07gQJwX0bYSIoQtIwUlDeAjFFsE0RrGTRM50eNswczgjuQa7c3cgJdtYtESm9dl7L8SafNyQVENNL00R0nk2VVU";

const PURCHASE_AMOUNT_CENTS = 50; // R$ 5,00
const PURCHASE_CURRENCY = "brl";

/* Em ambiente local, estes e-mails são aceitos para testes */
const LOCALHOST_VALID_EMAILS = [
  "restaurante.teste@gmail.com",
  "zane.klas422@gmail.com",
  "ranie.soares@exemplo.com",
].map((e) => e.toLowerCase());

/* ========================== Estado Global ========================== */
let stripeInstance = null;
let stripeElements = null;
let stripePaymentElement = null;

let currentPaymentMethod = "card"; // "card" ou "pix"
let currentClientSecret = null;

let lastPixPayload = null; // { qr_code_base64, copy_paste, ticket_url }

/* ========================== Referências de DOM ========================== */
const formElement = document.getElementById("payment-form");
const inputEmail = document.getElementById("email");
const inputName = document.getElementById("name");

const errorBox = document.getElementById("error");
const emailValidationBox = document.getElementById("email-validation");

const buttonSubmit = document.getElementById("submitBtn");

const stripeWrapper = document.getElementById("stripe-wrapper");
const paymentElementContainer = document.getElementById("payment-element");

const tabsButtons = document.querySelectorAll(".pay-tabs .tab");
const panels = document.querySelectorAll(".pay-panel");
const pixPanel = document.getElementById("pixPanel");

const pixArea = document.getElementById("pix-area");
const pixQrImage = document.getElementById("pix-qr");
const pixStatusText = document.getElementById("pix-status");
const buttonCopyPixCode = document.getElementById("btnCopy");
const qrPlaceholder = document.getElementById("qr-placeholder");

/* ========================== Utilidades UI ========================== */
function showError(message) {
  errorBox.textContent = message || "";
}

function showEmailValidation(message, isOk = false) {
  emailValidationBox.textContent = message || "";
  emailValidationBox.style.display = message ? "block" : "none";
  emailValidationBox.style.color = isOk ? "#00d1a2" : "#ff7070";
}

function disableSubmitWithMessage(message) {
  buttonSubmit.disabled = true;
  if (message) {
    buttonSubmit.textContent = message;
  }
}

function enableSubmitWithMessage(message) {
  buttonSubmit.disabled = false;
  buttonSubmit.textContent = message || "Pagar e assinar";
}

/* Placeholder/QR na área de Pix */
function showPixPlaceholder(message) {
  if (message) qrPlaceholder.textContent = message;
  qrPlaceholder.classList.remove("hidden");
  pixArea.classList.add("hidden");
  pixQrImage.removeAttribute("src");
  pixStatusText.textContent = "";
}

function showPixQr(base64) {
  qrPlaceholder.classList.add("hidden");
  pixArea.classList.remove("hidden");
  pixQrImage.removeAttribute("src");
  pixQrImage.src = "data:image/png;base64," + base64;
}

/* ========================== Validação de e-mail ========================== */
async function validateEmailInDynamoDB(rawEmail) {
  const email = (rawEmail || "").trim().toLowerCase();
  if (!email) return false;

  // Em ambiente local, libera para facilitar testes
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.log("[DEV] Pulando validação de e-mail no ambiente local:", email);
    return true;
  }

  try {
    // Usa a constante definida no topo do arquivo
    const url = `${API_VALIDATE_EMAIL}?email=${encodeURIComponent(email)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return false;

    const data = await resp.json().catch(() => ({}));

    // Preenche o nome automaticamente se o backend enviar
    if (data?.name && inputName && !inputName.value) {
      inputName.value = data.name;
    }

    return Boolean(data?.found ?? data?.exists ?? data?.isValid ?? false);
  } catch (err) {
    console.error("validateEmail error:", err);
    return false;
  }
}

/* Confere campos e, se Pix estiver selecionado e e-mail for válido, gera o QR */
async function checkFieldsAndMaybeGeneratePix() {
  const email = (inputEmail.value || "").trim().toLowerCase();
  const name = (inputName.value || "").trim();

  // Limpa mensagens
  showEmailValidation("");
  showError("");

  if (!email || !name) {
    showPixPlaceholder("Preencha e-mail e nome para gerar o QR Code");
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showEmailValidation("Por favor, insira um e-mail válido");
    showPixPlaceholder("E-mail inválido");
    return false;
  }

  showEmailValidation("Validando e-mail...", true);
  const isValid = await validateEmailInDynamoDB(email);
  if (!isValid) {
    showEmailValidation("E-mail não encontrado. Verifique seu cadastro.");
    showPixPlaceholder("E-mail não cadastrado no sistema");
    return false;
  }

  showEmailValidation("E-mail validado.", true);

  // Se a aba atual é Pix e e-mail é válido, gere o QR
  if (currentPaymentMethod === "pix") {
    await bootPaymentFor("pix");
  }

  return true;
}

/* ========================== Inicialização Stripe/Card/Pix ========================== */
async function bootPaymentFor(method) {
  try {
    showError("");
    disableSubmitWithMessage("Carregando opções de pagamento…");

    // Zera UI antes de cada boot
    currentClientSecret = null;
    stripeWrapper.style.display = "none";
    showPixPlaceholder("Preencha e-mail e nome para gerar o QR Code");
    lastPixPayload = null;

    // Chama seu backend para criar um PaymentIntent (ou iniciar Pix)
    const response = await fetch(API_CREATE_PAYMENT_INTENT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: PURCHASE_AMOUNT_CENTS,
        currency: PURCHASE_CURRENCY,
        payment_method_types: [method], // ["card"] ou ["pix"]
        email: (inputEmail.value || "").trim(),
        name: (inputName.value || "").trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data?.message || data?.error || `Falha ao iniciar pagamento (${response.status})`
      );
    }

    if (method === "card") {
      const clientSecret = data.client_secret || data.clientSecret;
      if (!clientSecret) {
        throw new Error("Resposta do servidor sem client_secret para cartão.");
      }
      currentClientSecret = clientSecret;

      // Monta Stripe Elements para cartão
      stripeWrapper.style.display = "block";
      if (!stripeInstance) {
        stripeInstance = Stripe(STRIPE_PUBLISHABLE_KEY);
      }

      if (stripePaymentElement) {
        try {
          stripePaymentElement.unmount();
          stripePaymentElement.destroy();
        } catch (_) {}
        stripePaymentElement = null;
      }

      stripeElements = stripeInstance.elements({
        clientSecret: currentClientSecret,
        appearance: { theme: "night" },
        locale: "pt-BR",
      });

      stripePaymentElement = stripeElements.create("payment", {
        layout: { type: "tabs" },
      });
      stripePaymentElement.mount("#payment-element");
      enableSubmitWithMessage("Pagar e assinar");
    } else {
      // PIX: esperamos dados como qr_code_base64 e copy_paste (do seu backend)
      if (!data.qr_code_base64 || !data.copy_paste) {
        throw new Error("Não foi possível gerar o QR Pix no momento.");
      }

      lastPixPayload = {
        qr_code_base64: data.qr_code_base64,
        copy_paste: data.copy_paste,
        ticket_url: data.ticket_url || "",
      };

      showPixQr(data.qr_code_base64);
      pixStatusText.textContent =
        "Abra o app do seu banco, pague pelo Pix e aguarde a confirmação.";

      // Botão "copiar código Pix"
      if (buttonCopyPixCode) {
        buttonCopyPixCode.onclick = async () => {
          try {
            await navigator.clipboard.writeText(lastPixPayload.copy_paste);
            pixStatusText.textContent = "Código Pix copiado para a área de transferência!";
          } catch (_) {
            pixStatusText.textContent = "Não foi possível copiar. Copie manualmente do QR.";
          }
        };
      }

      // Para Pix, o botão "Pagar e assinar" não faz nada (o pagamento ocorre no app do banco)
      enableSubmitWithMessage("Aguardando pagamento Pix…");
    }
  } catch (error) {
    console.error(error);
    showError(error.message || "Não foi possível iniciar o pagamento.");
    enableSubmitWithMessage("Pagar e assinar");
  }
}

/* ========================== Troca de Abas (Cartão / Pix) ========================== */
tabsButtons.forEach((tabButton) => {
  tabButton.addEventListener("click", async () => {
    // Visual das abas
    tabsButtons.forEach((b) => b.classList.remove("active"));
    tabButton.classList.add("active");

    // Mostra painel correspondente
    panels.forEach((p) => p.classList.remove("show"));
    const targetSelector = tabButton.dataset.target;
    const targetPanel = document.querySelector(targetSelector);
    if (targetPanel) targetPanel.classList.add("show");

    // Define método atual
    currentPaymentMethod = targetSelector === "#pixPanel" ? "pix" : "card";

    // Para Pix, só gerar QR se e-mail e nome válidos
    if (currentPaymentMethod === "pix") {
      const ok = await checkFieldsAndMaybeGeneratePix();
      if (!ok) {
        showPixPlaceholder("Preencha e-mail e nome para gerar o QR Code");
        disableSubmitWithMessage("Pagar e assinar");
        enableSubmitWithMessage("Pagar e assinar"); // deixa clicável, mas não fará nada em Pix
      }
    } else {
      // Cartão: monta Stripe imediatamente (não depende de validação de e-mail)
      await bootPaymentFor("card");
    }
  });
});

/* ========================== Envio do Formulário (somente Cartão) ========================== */
async function onFormSubmit(event) {
  event.preventDefault();

  // Em Pix, não há submit — o cliente paga no app do banco.
  if (currentPaymentMethod === "pix") return;

  const email = (inputEmail.value || "").trim();
  const name = (inputName.value || "").trim();

  showError("");
  disableSubmitWithMessage("Processando…");

  if (!stripeElements || !stripeInstance || !currentClientSecret) {
    showError("Pagamento não inicializado. Troque de aba e volte para Cartão.");
    enableSubmitWithMessage("Pagar e assinar");
    return;
  }

  // Solicita validações internas dos elementos (endereço, etc.)
  const { error: submitError } = await stripeElements.submit();
  if (submitError) {
    showError(submitError.message || "Não foi possível validar os dados do cartão.");
    enableSubmitWithMessage("Pagar e assinar");
    return;
  }

  // Confirma o pagamento com Stripe
  const { error } = await stripeInstance.confirmPayment({
    elements: stripeElements,
    confirmParams: {
      return_url: `${location.origin}/sucesso.html`, // ajuste se desejar
      payment_method_data: {
        billing_details: { email, name },
      },
      receipt_email: email,
    },
    // Evita redirecionar quando não necessário (3DS etc.)
    redirect: "if_required",
  });

  if (error) {
    showError(error.message || "Não foi possível confirmar o pagamento.");
    enableSubmitWithMessage("Pagar e assinar");
    return;
  }

  // Se não houve erro e não redirecionou, provavelmente concluiu localmente
  showError("");
  enableSubmitWithMessage("Pagar e assinar");
}

if (formElement) {
  formElement.addEventListener("submit", onFormSubmit);
}

/* ========================== Validações de Entrada ========================== */
inputEmail?.addEventListener("blur", checkFieldsAndMaybeGeneratePix);
inputName?.addEventListener("blur", checkFieldsAndMaybeGeneratePix);
inputEmail?.addEventListener("input", () => showEmailValidation(""));

/* ========================== Boot Inicial ========================== */
/* Começa na aba Cartão: monta Stripe imediatamente */
(async function initialBoot() {
  try {
    // Marque visualmente a aba Cartão como ativa (caso o HTML não venha assim)
    const firstTab = document.querySelector('.pay-tabs .tab[data-target="#cardPanel"]');
    if (firstTab) firstTab.classList.add("active");
    const firstPanel = document.getElementById("cardPanel");
    if (firstPanel) firstPanel.classList.add("show");

    await bootPaymentFor("card");
    enableSubmitWithMessage("Pagar e assinar");
  } catch (err) {
    console.error(err);
    showError("Falha ao preparar o pagamento. Recarregue a página.");
    enableSubmitWithMessage("Pagar e assinar");
  }
})();
