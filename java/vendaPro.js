// ===================== Configuração =====================
const ARCARDAPIO_PAYMENT = {
  PUBLISHABLE_KEY: "pk_live_51S0B6wGbgLl07gQJwX0bYSIoQtIwUlDeAjFFsE0RrGTRM50eNswczgjuQa7c3cgJdtYtESm9dl7L8SafNyQVENNL00R0nk2VVU",
  CREATE_INTENT_URL: "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/createPaymentIntent",
  VALIDATE_EMAIL_URL: "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/validateEmail",
  GET_INTENT_URL_BASE: "",           // opcional (para polling Pix)
  SUCCESS_URL: "./sucesso.html",
  AMOUNT: 500,
  CURRENCY: "brl",
  PAYMENT_METHOD_TYPES: ["card", "pix"]
};

// ===================== Variáveis globais =====================
let stripe, elements, clientSecret, paymentIntentId;
let emailIsValid = false;

// ===================== Utilidades de DOM/UI =====================
function $(id){ return document.getElementById(id); }

function showMessage(message, type = "error") {
  $("error-message") && ($("error-message").style.display = "none");
  $("success-message") && ($("success-message").style.display = "none");
  $("warning-message") && ($("warning-message").style.display = "none");

  if (type === "error" && $("error-message")) {
    $("error-message").textContent = message;
    $("error-message").style.display = message ? "block" : "none";
  } else if (type === "success" && $("success-message")) {
    $("success-message").textContent = message;
    $("success-message").style.display = "block";
  } else if (type === "warning" && $("warning-message")) {
    $("warning-message").textContent = message;
    $("warning-message").style.display = "block";
  }
}

function setLoading(isLoading, message = "") {
  const button = $("submit-btn");
  const buttonText = $("button-text");
  const spinner = $("button-spinner");
  if (!button || !buttonText || !spinner) return;

  if (isLoading) {
    button.disabled = true;
    if (message) buttonText.textContent = message;
    spinner.style.display = "inline-block";
  } else {
    button.disabled = !emailIsValid; // só habilita quando e-mail estiver válido
    buttonText.textContent = message || "Pagar R$ 5,00";
    spinner.style.display = "none";
  }
}

function setEmailValidation(msg, ok = false) {
  const box = $("email-validation");
  if (!box) return;
  if (!msg) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  box.textContent = msg;
  box.classList.toggle("success", !!ok);
  box.style.color = ok ? "#00d1a2" : "#ff7070";
}

// ===================== Validação de e-mail (DynamoDB) =====================
async function validateEmailInDynamoDB(emailRaw) {
  const email = (emailRaw || "").trim().toLowerCase();
  if (!email) return false;

  // Ambiente local: lista de teste (opcional)
  const TEST_LIST = [
    "restaurante.teste@gmail.com",
    "zane.klas422@gmail.com",
    "ranie.soares@exemplo.com"
  ].map(e => e.toLowerCase());

  if (["localhost", "127.0.0.1"].includes(location.hostname)) {
    return TEST_LIST.includes(email);
  }

  try {
    const resp = await fetch(ARCARDAPIO_PAYMENT.VALIDATE_EMAIL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    let data = {};
    const text = await resp.text().catch(() => "");
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    // aceita chaves comuns de backends
    const candidates = [
      data.isValid, data.valid, data.exists, data.found, data.ok,
      (typeof data === "boolean" ? data : undefined)
    ].filter(v => typeof v !== "undefined");

    if (candidates.length) return !!(candidates.find(v => v === true || v === "true"));
    if (data.item || data.Item || data.count === 1 || data.Count === 1) return true;

    return false;
  } catch (err) {
    console.error("validateEmail error:", err);
    return false; // em produção, não liberar por fallback
  }
}

async function revalidateEmailAndToggle() {
  const email = ($("email")?.value || "").trim().toLowerCase();
  const name  = ($("name")?.value  || "").trim();

  showMessage(""); // limpa mensagens
  emailIsValid = false;
  setEmailValidation("");

  if (!email || !name) { setLoading(false); return false; }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    setEmailValidation("Por favor, insira um e-mail válido", false);
    setLoading(false);
    return false;
  }

  setEmailValidation("Validando e-mail...", true);
  const ok = await validateEmailInDynamoDB(email);
  emailIsValid = ok;

  if (ok) setEmailValidation("E-mail validado. Você pode prosseguir.", true);
  else setEmailValidation("E-mail não encontrado. Verifique seu cadastro.", false);

  setLoading(false);
  return ok;
}

// ===================== Inicialização do Checkout =====================
document.addEventListener("DOMContentLoaded", () => {
  initCheckout().catch((error) => {
    console.error("Erro na inicialização:", error);
    showMessage("Falha ao inicializar o pagamento. Recarregue a página e tente novamente.", "error");
    setLoading(false);
  });

  // validação em tempo real
  ["input", "blur"].forEach(evt => {
    $("email")?.addEventListener(evt, revalidateEmailAndToggle);
    $("name")?.addEventListener(evt, revalidateEmailAndToggle);
  });
});

async function initCheckout() {
  setLoading(true, "Preparando pagamento...");

  // 1) cria PaymentIntent
  try {
    const result = await createPaymentIntent();
    clientSecret = result.clientSecret;
    paymentIntentId = result.paymentIntentId;
  } catch (error) {
    console.error("Erro ao criar PaymentIntent:", error);
    showMessage(error.message || "Erro ao iniciar pagamento", "error");
    setLoading(false);
    return;
  }

  // 2) Stripe/Elements
  stripe = Stripe(ARCARDAPIO_PAYMENT.PUBLISHABLE_KEY);

  elements = stripe.elements({
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#5469d4',
        colorBackground: '#0f1f1e',
        colorText: '#eafff7',
        colorDanger: '#df1b41',
        fontFamily: 'Inter, system-ui, sans-serif',
        spacingUnit: '6px',
        borderRadius: '12px'
      }
    },
    locale: 'pt-BR'
  });

  const paymentElement = elements.create('payment', {
    layout: { type: 'tabs', defaultCollapsed: false },
    paymentMethodOrder: ['card', 'pix']
  });

  paymentElement.mount('#payment-element');
  setLoading(false, "Pagar R$ 5,00");

  // submit
  $("payment-form")?.addEventListener("submit", handleSubmit);
}

// ===================== Backend: criar PaymentIntent =====================
async function createPaymentIntent() {
  const email = ($("email")?.value || "cliente@exemplo.com").trim().toLowerCase();
  const name  = ($("name")?.value  || "Cliente Exemplo").trim();

  try {
    const response = await fetch(ARCARDAPIO_PAYMENT.CREATE_INTENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: ARCARDAPIO_PAYMENT.AMOUNT,
        currency: ARCARDAPIO_PAYMENT.CURRENCY,
        payment_method_types: ARCARDAPIO_PAYMENT.PAYMENT_METHOD_TYPES,
        email, name
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Erro ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const clientSecret = data.client_secret || data.clientSecret;
    const paymentIntentId = data.id || data.paymentIntentId;

    if (!clientSecret) throw new Error("Resposta da API não contém client_secret");
    return { clientSecret, paymentIntentId };
  } catch (error) {
    console.error("Erro ao criar PaymentIntent:", error);
    throw new Error(error.message || "Falha na comunicação com o servidor");
  }
}

// ===================== Submit / Confirmação =====================
async function handleSubmit(event) {
  event.preventDefault();

  const email = ($("email")?.value || "").trim().toLowerCase();
  const name  = ($("name")?.value  || "").trim();

  if (!email || !name) {
    showMessage("Por favor, preencha todos os campos obrigatórios", "error");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showMessage("Por favor, insira um e-mail válido", "error");
    return;
  }

  // revalida na hora (garantia extra)
  const ok = await revalidateEmailAndToggle();
  if (!ok) {
    showMessage("E-mail não encontrado na base. Não foi possível prosseguir.", "error");
    return;
  }

  setLoading(true, "Processando pagamento...");
  showMessage("");

  const { error: submitError } = await elements.submit();
  if (submitError) {
    showMessage(submitError.message, "error");
    setLoading(false);
    return;
  }

  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: ARCARDAPIO_PAYMENT.SUCCESS_URL,
        receipt_email: email,
        payment_method_data: {
          billing_details: { name, email }
        }
      },
      redirect: 'if_required'
    });

    if (error) {
      showMessage(error.message, "error");
      setLoading(false);
      return;
    }

    handlePaymentResult(paymentIntent);
  } catch (err) {
    console.error("Erro ao confirmar pagamento:", err);
    showMessage("Erro inesperado ao processar pagamento", "error");
    setLoading(false);
  }
}

// ===================== Resultado / Polling =====================
function handlePaymentResult(paymentIntent) {
  switch (paymentIntent.status) {
    case 'succeeded':
      showMessage("Pagamento aprovado! Redirecionando...", "success");
      setTimeout(() => { window.location.href = ARCARDAPIO_PAYMENT.SUCCESS_URL; }, 1200);
      break;

    case 'processing':
      showMessage("Seu pagamento está sendo processado. Aguarde a confirmação.", "warning");
      if (ARCARDAPIO_PAYMENT.GET_INTENT_URL_BASE && paymentIntentId) {
        pollPaymentStatus(paymentIntentId);
      } else {
        setLoading(false, "Aguardando confirmação...");
      }
      break;

    case 'requires_action':
      showMessage("É necessária uma ação adicional para completar seu pagamento", "warning");
      setLoading(false, "Complete a autenticação");
      break;

    case 'requires_payment_method':
      showMessage("Falha no processamento do pagamento. Tente outro método.", "error");
      setLoading(false, "Tentar novamente");
      break;

    default:
      showMessage(`Status desconhecido: ${paymentIntent.status}`, "error");
      setLoading(false, "Tentar novamente");
  }
}

async function pollPaymentStatus(paymentIntentId) {
  if (!ARCARDAPIO_PAYMENT.GET_INTENT_URL_BASE) {
    console.warn("GET_INTENT_URL_BASE não configurado - polling desativado");
    return;
  }

  const maxAttempts = 30; // ~2.5 minutos
  let attempts = 0;

  const poll = async () => {
    attempts++;
    try {
      const response = await fetch(`${ARCARDAPIO_PAYMENT.GET_INTENT_URL_BASE}/${paymentIntentId}`);
      if (response.ok) {
        const paymentIntent = await response.json();

        if (paymentIntent.status === 'succeeded') {
          showMessage("Pagamento confirmado! Redirecionando...", "success");
          setTimeout(() => { window.location.href = ARCARDAPIO_PAYMENT.SUCCESS_URL; }, 1200);
          return;
        } else if (paymentIntent.status === 'canceled' || attempts >= maxAttempts) {
          showMessage("Tempo esgotado para confirmação do pagamento", "error");
          setLoading(false, "Tentar novamente");
          return;
        }
      }

      if (attempts < maxAttempts) setTimeout(poll, 5000);
    } catch (error) {
      console.error("Erro no polling:", error);
      if (attempts < maxAttempts) setTimeout(poll, 5000);
      else {
        showMessage("Erro ao verificar status do pagamento", "error");
        setLoading(false, "Tentar novamente");
      }
    }
  };

  poll();
}
