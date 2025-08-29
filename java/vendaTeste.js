/* vendaTeste.js
   Fluxo:
   1) Cria PaymentIntent no backend (sua Lambda / API Gateway)
   2) Inicializa Stripe Elements (Payment Element em abas: Cartão/Pix)
   3) Confirma pagamento (stripe.confirmPayment)
   4) Polling opcional para Pix até "succeeded"
*/

const ARCARDAPIO_PAYMENT = {
  // ======= CONFIG JÁ PREENCHIDA =======
  PUBLISHABLE_KEY: "pk_live_51S0B6wGbgLl07gQJwX0bYSIoQtIwUlDeAjFFsE0RrGTRM50eNswczgjuQa7c3cgJdtYtESm9dl7L8SafNyQVENNL00R0nk2VVU",
  CREATE_INTENT_URL: "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/createPaymentIntent", // Lambda (POST)
  GET_INTENT_URL_BASE: "", // opcional (GET /payment-intent/:id) — deixe vazio por enquanto
  SUCCESS_URL: "./sucesso.html", // página de sucesso
  AMOUNT: 500,             // R$ 5,00 (centavos)
  CURRENCY: "brl",
  PAYMENT_METHOD_TYPES: ["card"], // ative ["card","pix"] se Pix estiver habilitado na sua conta Stripe
  // ====================================
};

document.addEventListener("DOMContentLoaded", () => {
  initCheckout().catch((e) => {
    console.error(e);
    say("Falha ao inicializar o pagamento.");
    setBtnEnabled(true);
  });
});

let stripe, elements, clientSecret, createdPaymentIntentId;

function $(id) { return document.getElementById(id); }
function say(msg) { const el = $("error"); if (el) el.textContent = msg || ""; }
function setBtnEnabled(v) { const b = $("submitBtn"); if (b) b.disabled = !v; }

async function initCheckout() {
  const form = $("payment-form");
  if (!form) throw new Error("Elemento #payment-form não encontrado.");

  setBtnEnabled(false);
  say("Preparando pagamento…");

  // 1) Cria PaymentIntent no backend
  ({ clientSecret, createdPaymentIntentId } = await createPaymentIntent());

  // 2) Inicializa Stripe Elements
  stripe = Stripe(ARCARDAPIO_PAYMENT.PUBLISHABLE_KEY);
  elements = stripe.elements({
    clientSecret,
    appearance: { theme: "night" },
    locale: "pt-BR",
  });

  // Payment Element com layout de abas (Cartão/Pix)
   const paymentElement = elements.create("payment", {
    layout: { type: "tabs" },
    paymentMethodOrder: ["card"],
   });
  paymentElement.mount("#payment-element");

  say("Selecione Cartão ou Pix e clique em pagar.");
  setBtnEnabled(true);

  // 3) Submit
  form.addEventListener("submit", onSubmit);
}

async function createPaymentIntent() {
  const email = $("email")?.value?.trim() || "";
  const name  = $("name")?.value?.trim()  || "";

  const res = await fetch(ARCARDAPIO_PAYMENT.CREATE_INTENT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: ARCARDAPIO_PAYMENT.AMOUNT,
      currency: ARCARDAPIO_PAYMENT.CURRENCY,
      payment_method_types: ARCARDAPIO_PAYMENT.PAYMENT_METHOD_TYPES,
      email,
      name,
    }),
  });

  if (!res.ok) {
    const data = await safeJson(res);
    throw new Error(data?.message || data?.error || "Erro ao criar PaymentIntent");
  }

  const data = await res.json();
  // Suporta formatos comuns:
  // 1) { client_secret, id, status }
  // 2) { ok:true, client_secret, id, status }
  const secret = data.client_secret || data.clientSecret;
  const id = data.id || data.paymentIntentId;

  if (!secret) throw new Error("Resposta sem client_secret.");
  return { clientSecret: secret, createdPaymentIntentId: id };
}

async function onSubmit(e) {
  e.preventDefault();
  setBtnEnabled(false);
  say("");

  const email = $("email")?.value?.trim();
  const name  = $("name")?.value?.trim();

  if (!email || !name) {
    say("Preencha e-mail e nome.");
    setBtnEnabled(true);
    return;
  }

  // valida campos Stripe internos
  const { error: submitError } = await elements.submit();
  if (submitError) {
    say(submitError.message || "Dados de pagamento incompletos.");
    setBtnEnabled(true);
    return;
  }

  try {
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        receipt_email: email,
        payment_method_data: {
          billing_details: { name, email },
        },
      },
      // Redireciona apenas se necessário (3DS, etc.)
      redirect: "if_required",
    });

    if (error) {
      say(error.message || "Não foi possível concluir o pagamento.");
      setBtnEnabled(true);
      return;
    }

    handleStatus(paymentIntent);

    // Polling opcional para Pix (somente se você preencher GET_INTENT_URL_BASE)
    if (shouldPoll(paymentIntent?.status) &&
        ARCARDAPIO_PAYMENT.GET_INTENT_URL_BASE &&
        (createdPaymentIntentId || paymentIntent?.id)) {
      const id = createdPaymentIntentId || paymentIntent.id;
      pollStatus(id, handleStatus, () => setBtnEnabled(true));
    } else {
      setBtnEnabled(true);
    }
  } catch (err) {
    console.error(err);
    say("Erro inesperado ao confirmar pagamento.");
    setBtnEnabled(true);
  }
}

function handleStatus(pi) {
  if (!pi) return;

  switch (pi.status) {
    case "succeeded":
      say("Pagamento aprovado! Redirecionando…");
      setTimeout(() => (window.location.href = ARCARDAPIO_PAYMENT.SUCCESS_URL), 600);
      break;
    case "processing":
      say("Pagamento em processamento…");
      break;
    case "requires_action":
      // Para Pix, esse estado aparece enquanto o QR está sendo exibido
      say("Aguardando confirmação do pagamento…");
      break;
    case "requires_payment_method":
      say("Pagamento não concluído. Revise os dados ou tente outro método.");
      break;
    default:
      say(`Status: ${pi.status}`);
  }
}

function shouldPoll(status) {
  // Em Pix, normalmente teremos "processing" ou "requires_action" até aprovar
  return ["processing", "requires_action"].includes(status);
}

async function pollStatus(paymentIntentId, onUpdate, onDone) {
  let attempts = 0;
  const maxAttempts = 40; // ~2 minutos (40 * 3s)

  const tick = async () => {
    attempts++;
    try {
      const url = `${ARCARDAPIO_PAYMENT.GET_INTENT_URL_BASE}/${paymentIntentId}`;
      const res = await fetch(url);
      if (res.ok) {
        const pi = await res.json(); // { id, status, ... } (conforme seu backend)
        onUpdate(pi);
        if (pi.status === "succeeded" || pi.status === "canceled" || attempts >= maxAttempts) {
          onDone && onDone();
          return;
        }
      }
    } catch (_) { /* silencioso */ }

    setTimeout(tick, 3000);
  };

  tick();
}

async function safeJson(res) {
  try { return await res.json(); } catch { return null; }
}
