/* ============================================================
   vendaPlus.js — Final, pronto para Plano Plus (30 dias)
   - Força slug: "plano_plus_30_dias"
   - Envia provider/type e payload robusto para createPaymentIntent
   - Usa amountCents do HTML quando disponível
   ============================================================ */

/* ========================== Config ========================== */
const API_CREATE_PAYMENT_INTENT =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/createPaymentIntent";

const API_VALIDATE_EMAIL =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/cliente";

/* Mercado Pago (cartão) – deixe vazio para desativar cartão */
const MP_PUBLIC_KEY = ""; // ex.: "TEST-xxxxxxxxxxxxxxxxxxxx"

/* Valores padrão (fallback) */
const PURCHASE_AMOUNT = 120.0; // R$ — fallback
const PURCHASE_CURRENCY = "BRL";
const ASAAS_PIX_AMOUNT_BRL = 120.0; // R$ — fallback

/* ========================== Estado ========================== */
let currentPaymentMethod = "pix"; // padrão para esta página
let mp = null;
let mpCardForm = null;

/* ========================== DOM ========================== */
const formElement = document.getElementById("payment-form");
const inputEmail = document.getElementById("email");
const inputName = document.getElementById("name");
const inputDesc = document.getElementById("description"); // hidden / description
const inputAmountCents = document.getElementById("amountCents"); // hidden (centavos)
const inputPlanoSlug = document.getElementById("planoSlug"); // optional hidden

const errorBox = document.getElementById("error");
const emailValidationBox = document.getElementById("email-validation");
const buttonSubmit = document.getElementById("submitBtn");

const tabsButtons = document.querySelectorAll(".pay-tabs .tab");
const panels = document.querySelectorAll(".pay-panel");

/* PIX UI */
const pixArea = document.getElementById("pix-area");
const pixQrImage = document.getElementById("pix-qr");
const pixStatusText = document.getElementById("pix-status");
const buttonCopyPix = document.getElementById("btnCopy");
const qrPlaceholder = document.getElementById("qr-placeholder");

/* Campos cartão (fallback simples) */
const ccNumberEl = document.getElementById("cc-number");
const ccExpEl = document.getElementById("cc-exp");
const ccCvcEl = document.getElementById("cc-cvc");
const ccNameEl = document.getElementById("cc-name");

/* ========================== Helpers UI ========================== */
function showError(message) {
  if (!errorBox) return;
  errorBox.textContent = message || "";
  errorBox.style.display = message ? "block" : "none";
}
function showEmailValidation(message, isOk = false) {
  if (!emailValidationBox) return;
  emailValidationBox.textContent = message || "";
  emailValidationBox.style.display = message ? "block" : "none";
  emailValidationBox.style.color = isOk ? "#10b981" : "#ef4444";
}
function setSubmit(text, disabled = false) {
  if (!buttonSubmit) return;
  buttonSubmit.textContent = text;
  buttonSubmit.disabled = !!disabled;
}

/* PIX placeholder/QR */
function showPixPlaceholder(message) {
  if (message && qrPlaceholder) qrPlaceholder.textContent = message;
  qrPlaceholder?.classList.remove("hidden");
  pixArea?.classList.add("hidden");
  if (pixQrImage) {
    pixQrImage.removeAttribute("src");
    pixQrImage.alt = "QR Code Pix";
  }
  if (pixStatusText) pixStatusText.textContent = "";
}
function showPixQr(base64, copyPaste) {
  qrPlaceholder?.classList.add("hidden");
  pixArea?.classList.remove("hidden");
  if (pixQrImage) {
    pixQrImage.src = "data:image/png;base64," + base64;
    pixQrImage.alt = "QR Code Pix";
  }
  if (pixStatusText) {
    pixStatusText.textContent =
      "Abra o app do seu banco, leia o QR ou use o código copia-e-cola.";
  }

  if (buttonCopyPix) {
    buttonCopyPix.onclick = async () => {
      try {
        await navigator.clipboard.writeText(copyPaste);
        if (pixStatusText) pixStatusText.textContent = "Código Pix copiado!";
      } catch {
        if (pixStatusText) pixStatusText.textContent =
          "Não foi possível copiar automaticamente.";
      }
    };
  }
}

/* ========================== Validação ========================== */
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").toLowerCase());
}
async function validateEmailInDynamoDB(rawEmail) {
  const email = (rawEmail || "").trim().toLowerCase();
  if (!email) return false;
  try {
    const url = `${API_VALIDATE_EMAIL}?email=${encodeURIComponent(email)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => ({}));
    if (data?.name && inputName && !inputName.value) inputName.value = data.name;
    return Boolean(
      data?.found ?? data?.exists ?? data?.isValid ?? data?.valido ?? false
    );
  } catch {
    return false;
  }
}

/* ========================== Planos (fallbacks úteis) */
function planSlugFromDescription(desc) {
  const d = String(desc || "").toLowerCase();
  if (d.includes("ultra")) return "plano_ultra_5_anos";
  if (d.includes("pro"))   return "plano_pro_1_ano";
  if (d.includes("plus"))  return "plano_plus_30_dias";
  return "teste_7_dias";
}

/* Read numeric amount from hidden input if present (centavos) */
function getAmountBrlFromInputs() {
  const cents = inputAmountCents?.value;
  if (cents) {
    const n = Number(String(cents).replace(/[^0-9\-\.]/g, ""));
    if (!Number.isNaN(n)) return n / 100.0;
  }
  return ASAAS_PIX_AMOUNT_BRL || PURCHASE_AMOUNT || 1.0;
}

/* ========================== Pix (Asaas) ========================== */
async function checkFieldsAndMaybeGeneratePix() {
  const email = (inputEmail?.value || "").trim().toLowerCase();
  const name = (inputName?.value || "").trim();

  showError("");
  showEmailValidation("");

  if (!email || !name) {
    showPixPlaceholder("Preencha e-mail e nome para gerar o QR Code.");
    return false;
  }
  if (!isValidEmail(email)) {
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

  if (currentPaymentMethod === "pix") {
    await bootPaymentFor("pix");
  }
  return true;
}

async function bootPaymentFor(method) {
  try {
    showError("");
    setSubmit("Carregando…", true);

    if (method === "card") {
      if (MP_PUBLIC_KEY) {
        mountMpCardForm();
      } else {
        console.info("Cartão desativado: defina MP_PUBLIC_KEY para habilitar Mercado Pago.");
      }
      setSubmit("Pagar e assinar", false);
      return;
    }

    // PIX flow
    const amountBrl = getAmountBrlFromInputs();
    showPixPlaceholder(`Gerando cobrança Pix (R$ ${amountBrl.toFixed(2)})…`);

    const desc = (inputDesc?.value || "Plano Plus (30 Dias)").trim();

    // prefer input hidden planoSlug se existir; caso contrário calcula a partir da descrição
    let slug = (inputPlanoSlug?.value && String(inputPlanoSlug.value).trim()) || planSlugFromDescription(desc);

    // normalize possíveis variações
    if (!slug.startsWith("plano_")) {
      if (slug === "ultra_5_anos" || slug === "ultra") slug = "plano_ultra_5_anos";
      if (slug === "pro_12_meses" || slug === "pro") slug = "plano_pro_1_ano";
      if (slug === "plus_30_dias" || slug === "plus") slug = "plano_plus_30_dias";
    }

    // FORÇAR: garantir que esta página sempre envie PLUS
    slug = "plano_plus_30_dias";

    // validação final do slug
    if (!slug || slug === "teste_7_dias") {
      throw new Error("Plano inválido. Contate o suporte.");
    }

    const payload = {
      provider: "asaas",
      type: "pix",
      amount_brl: Number(amountBrl),
      email: (inputEmail?.value || "").trim(),
      name: (inputName?.value || "").trim(),
      description: desc,
      plano: slug
    };

    console.info("Enviando payload para createPaymentIntent:", payload);

    const response = await fetch(API_CREATE_PAYMENT_INTENT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    console.log("createPaymentIntent →", data);

    if (!response.ok || data?.ok === false) {
      const msg =
        data?.message || data?.error || data?.details || `Falha ao iniciar Pix (${response.status})`;
      throw new Error(msg);
    }

    const qrBase64 =
      data.qr_code_base64 ||
      data.encodedImage ||
      data?.original?.encodedImage ||
      data?.pixQrCode?.encodedImage ||
      data?.pix?.encodedImage ||
      data?.point_of_interaction?.transaction_data?.qr_code_base64;

    const copyPaste =
      data.qr_code_payload ||
      data.qr_code ||
      data.payload ||
      data?.original?.payload ||
      data?.pixQrCode?.payload ||
      data?.pix?.payload ||
      data?.point_of_interaction?.transaction_data?.qr_code;

    if (!qrBase64 || !copyPaste) {
      throw new Error("Não foi possível gerar o QR Pix no momento.");
    }

    showPixQr(qrBase64, copyPaste);
    setSubmit("Aguardando pagamento Pix…", false);
  } catch (error) {
    console.error(error);
    showError(error.message || "Não foi possível iniciar o pagamento.");
    setSubmit("Pagar e assinar", false);
  }
}

/* ========================== Cartão (Mercado Pago opcional) ========================== */
function mountMpCardForm() {
  let installmentsSelect = document.getElementById("mp-installments");
  if (!installmentsSelect) {
    installmentsSelect = document.createElement("select");
    installmentsSelect.id = "mp-installments";
    installmentsSelect.className = "input";
    installmentsSelect.style.marginTop = "12px";
    ccCvcEl?.parentElement?.appendChild(installmentsSelect);
  }

  if (!mp) {
    // eslint-disable-next-line no-undef
    mp = new MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
  }

  try { mpCardForm?.unmount?.(); } catch {}

  mpCardForm = mp.cardForm({
    amount: PURCHASE_AMOUNT.toFixed(2),
    autoMount: false,
    form: {
      id: "payment-form",
      cardNumber:         { id: "cc-number", placeholder: "1234 1234 1234 1234" },
      cardExpirationDate: { id: "cc-exp",    placeholder: "MM/AA" },
      securityCode:       { id: "cc-cvc",    placeholder: "123" },
      cardholderName:     { id: "cc-name" },
      cardholderEmail:    { id: "email" },
      installments:       { id: "mp-installments" },
    },
    callbacks: {
      onFormMounted: (error) => { if (error) console.warn("CardForm mount error", error); },
      onFetching: () => setSubmit("Processando…", true),
    }
  });

  setSubmit("Pagar e assinar", false);
}

/* ========================== Submit (cartão) ========================== */
async function onFormSubmit(e) {
  e.preventDefault();
  if (currentPaymentMethod === "pix") return;

  if (!MP_PUBLIC_KEY) {
    showError("Pagamento por cartão está desativado. Use Pix.");
    return;
  }

  showError("");
  setSubmit("Processando…", true);

  try {
    if (!mpCardForm) mountMpCardForm();

    const data = mpCardForm.getCardFormData();
    const {
      token,
      paymentMethodId,
      issuerId,
      installments,
      cardholderEmail,
      cardholderName
    } = data;

    if (!token) throw new Error("Não foi possível tokenizar o cartão. Verifique os dados.");

    const resp = await fetch(API_CREATE_PAYMENT_INTENT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        provider: "mercadopago",
        type: "card",
        amount: PURCHASE_AMOUNT,
        currency: PURCHASE_CURRENCY,
        email: cardholderEmail || (inputEmail?.value || "").trim(),
        name:  cardholderName || (inputName?.value  || "").trim(),
        token,
        installments: Number(installments || 1),
        payment_method_id: paymentMethodId,
        issuer_id: issuerId,
        description: "Plano Plus (Cartão)",
        plano: inputPlanoSlug?.value || "plano_plus_30_dias"
      })
    });

    const result = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(result?.message || result?.error || "Falha ao criar pagamento.");

    setSubmit("Pagamento aprovado!", true);
  } catch (err) {
    console.error(err);
    showError(err.message || "Não foi possível concluir o pagamento.");
    setSubmit("Pagar e assinar", false);
  }
}

/* ========================== Tabs ========================== */
tabsButtons.forEach((tabButton) => {
  tabButton.addEventListener("click", async () => {
    tabsButtons.forEach((b) => b.classList.remove("active"));
    tabButton.classList.add("active");

    panels.forEach((p) => p.classList.remove("show"));
    const target = document.querySelector(tabButton.dataset.target);
    target?.classList.add("show");

    currentPaymentMethod = tabButton.dataset.target === "#pixPanel" ? "pix" : "card";

    if (currentPaymentMethod === "pix") {
      const ok = await checkFieldsAndMaybeGeneratePix();
      if (!ok) showPixPlaceholder("Preencha e-mail e nome para gerar o QR Code.");
    } else {
      if (MP_PUBLIC_KEY) {
        mountMpCardForm();
      } else {
        console.info("Cartão desativado até informar MP_PUBLIC_KEY.");
      }
    }
  });
});

/* ========================== Eventos ========================== */
formElement?.addEventListener("submit", onFormSubmit);
inputEmail?.addEventListener("blur", checkFieldsAndMaybeGeneratePix);
inputName?.addEventListener("blur", checkFieldsAndMaybeGeneratePix);
inputEmail?.addEventListener("input", () => showEmailValidation(""));

/* ========================== Boot ========================== */
(function init() {
  try {
    if (inputDesc) inputDesc.value = "Plano Plus (30 Dias)";
    if (inputPlanoSlug) inputPlanoSlug.value = "plano_plus_30_dias";
    if (inputAmountCents && !inputAmountCents.value) inputAmountCents.value = "12000";
  } catch (err) {
    console.warn("Não foi possível forçar valores hidden:", err);
  }

  const pixTab = document.querySelector('.pay-tabs .tab[data-target="#pixPanel"]');
  const pixPanel = document.getElementById("pixPanel");
  const cardTab = document.querySelector('.pay-tabs .tab[data-target="#cardPanel"]');
  const cardPanel = document.getElementById("cardPanel");

  cardTab?.classList.remove("active");
  cardPanel?.classList.remove("show");
  pixTab?.classList.add("active");
  pixPanel?.classList.add("show");
  currentPaymentMethod = "pix";

  showPixPlaceholder("Preencha e-mail e nome para gerar o QR Code.");
  setSubmit("Pagar e assinar", false);
})();
