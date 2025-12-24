/* ============================================================
   vendaTeste.js — Asaas Pix + Cartão (BOTÃO NO CARTÃO)
   - Valor SEMPRE vem do HTML (#amountCents)
   - Pix: gera QR, polling status, popup sucesso e redireciona
   - Cartão: só paga ao clicar no botão.
   - MODAL: sem botão, travado enquanto processa, auto-close no sucesso/erro
   ============================================================ */

/* =========================
   ENDPOINTS
   ========================= */
const API_BASE  = "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com";
const API_STAGE = ""; // $default (sem /dev). Se sua API for /dev, troque para "/dev"

const API_CREATE_PAYMENT_INTENT = `${API_BASE}${API_STAGE}/createPaymentIntent`;
const API_CHECK_PAYMENT_STATUS  = `${API_BASE}${API_STAGE}/checkPaymentStatusAsaas`;
const API_CREATE_CARD_PAYMENT   = `${API_BASE}${API_STAGE}/createCardPayment`;
const API_VALIDATE_EMAIL        = `${API_BASE}${API_STAGE}/cliente`;

// ✅ se teu site estiver no root do S3/CloudFront, use "/html/login.html"
const LOGIN_URL = "../html/login.html";

/* =========================
   ESTADO
   ========================= */
let currentPaymentMethod = "pix";
let currentPaymentId = null;
let pollTimer = null;
let isSubmittingCard = false;

// evita redirecionar 2x
let isRedirecting = false;

// Pix anti-duplicação
let pixLastKey = "";
let pixInFlight = false;
let pixAbortController = null;
let pixCopyPasteCurrent = "";
let pixEncodedImageCurrent = "";

/* =========================
   DOM
   ========================= */
const formElement      = document.getElementById("payment-form");
const inputEmail       = document.getElementById("email");
const inputName        = document.getElementById("name");
const inputCpfCnpj     = document.getElementById("cpfCnpj");
const inputDesc        = document.getElementById("description");
const inputAmountCents = document.getElementById("amountCents");
const inputPlanoSlug   = document.getElementById("planoSlug");

const errorBox            = document.getElementById("error");
const emailValidationBox  = document.getElementById("email-validation");
const cpfValidationBox    = document.getElementById("cpf-validation");

const buttonSubmit = document.getElementById("submitBtn");

const tabsButtons = document.querySelectorAll(".pay-tabs .tab");
// ✅ FIX: querySelectorAndAll não existe
const panels      = document.querySelectorAll(".pay-panel");

// Pix UI
const pixArea        = document.getElementById("pix-area");
const pixQrImage     = document.getElementById("pix-qr");
const pixStatusText  = document.getElementById("pix-status");
const buttonCopyPix  = document.getElementById("btnCopy");
const qrPlaceholder  = document.getElementById("qr-placeholder");

// Resumo
const dispSubtotal  = document.getElementById("display-subtotal");
const dispDescontos = document.getElementById("display-descontos");
const dispTaxas     = document.getElementById("display-taxas");
const dispTotal     = document.getElementById("display-total");
const feesNote      = document.getElementById("fees-note");

// Cartão
const ccNumberEl       = document.getElementById("cc-number");
const ccExpEl          = document.getElementById("cc-exp");
const ccCvcEl          = document.getElementById("cc-cvc");
const ccNameEl         = document.getElementById("cc-name");
const uiInstallments   = document.getElementById("installments");
const installmentHint  = document.getElementById("installment-hint");

// Modal
const modal    = document.getElementById("pay-modal");
const modalBox = modal?.querySelector(".modal-box");
const titleEl  = document.getElementById("pay-modal-title");
const msgEl    = document.getElementById("pay-modal-msg");
const okBtn    = document.getElementById("pay-modal-ok"); // se existir no HTML antigo, vamos esconder

/* =========================
   HELPERS
   ========================= */
const fmtBRL = (n) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg || "";
  errorBox.style.display = msg ? "block" : "none";
}

function showEmailValidation(msg, ok = false) {
  if (!emailValidationBox) return;
  emailValidationBox.textContent = msg || "";
  emailValidationBox.style.display = msg ? "block" : "none";
  emailValidationBox.style.color = ok ? "#10b981" : "#ff7070";
}

function showCpfValidation(msg, ok = false) {
  if (!cpfValidationBox) return;
  cpfValidationBox.textContent = msg || "";
  cpfValidationBox.style.display = msg ? "block" : "none";
  cpfValidationBox.style.color = ok ? "#10b981" : "#ff7070";
}

function setPayButton(label, disabled) {
  if (!buttonSubmit) return;
  buttonSubmit.textContent = label;
  buttonSubmit.disabled = !!disabled;
  buttonSubmit.style.display = currentPaymentMethod === "card" ? "block" : "none";
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").toLowerCase());
}

function onlyDigits(v) {
  return String(v || "").replace(/\D/g, "");
}

function isValidCpfCnpj(v) {
  const d = onlyDigits(v);
  return d.length === 11 || d.length === 14;
}

function getAmountBrlFromInputs() {
  const centsRaw = String(inputAmountCents?.value || "").trim();
  const cents = Number(centsRaw.replace(/[^\d]/g, ""));
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return round2(cents / 100);
}

function getPlanFromInputs() {
  const amount = getAmountBrlFromInputs();
  const description = (inputDesc?.value || "").trim() || "Pagamento";
  const plano = (inputPlanoSlug?.value || "").trim() || null; // "teste"|"plus"|"pro"|"ultra"
  return { amount, description, plano };
}

function getPixKey() {
  const email = (inputEmail?.value || "").trim().toLowerCase();
  const name = (inputName?.value || "").trim();
  const cpfCnpj = onlyDigits(inputCpfCnpj?.value || "");
  const { amount, description, plano } = getPlanFromInputs();
  return JSON.stringify({ email, name, cpfCnpj, amount, description, plano });
}

async function fetchJsonOrThrow(url, options = {}) {
  try {
    const resp = await fetch(url, options);
    const raw = await resp.text();
    let data = null;
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { data = { raw }; }
    }
    if (!resp.ok) {
      const msg = data?.message || data?.error || data?.raw || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    const isNetwork =
      e instanceof TypeError ||
      /Failed to fetch|NetworkError/i.test(String(e?.message || ""));
    if (isNetwork) throw new Error(`Falha de rede/CORS ao chamar: ${url}`);
    throw e;
  }
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
    return Boolean(data?.found ?? data?.exists ?? data?.isValid ?? data?.valido ?? false);
  } catch {
    return false;
  }
}

/* =========================
   MODAL (AUTO / SEM BOTÃO / TRAVADO)
   ========================= */
let modalTimer = null;
let modalLocked = false;

if (okBtn) okBtn.style.display = "none";

function hideModal(force = false) {
  if (!modal) return;

  if (modalTimer) {
    clearTimeout(modalTimer);
    modalTimer = null;
  }

  if (modalLocked && !force) return;

  modalLocked = false;
  modal.classList.add("hidden");
}

function showModal({ title = "", message = "", type = "info", locked = false, autoCloseMs = 0 } = {}) {
  if (!modal || !modalBox) return;

  if (modalTimer) {
    clearTimeout(modalTimer);
    modalTimer = null;
  }

  modalLocked = !!locked;

  if (titleEl) titleEl.textContent = title || "";
  if (msgEl) msgEl.textContent = message || "";

  modalBox.className = `modal-box ${type}`;
  modal.classList.remove("hidden");

  if (okBtn) okBtn.style.display = "none";

  if (autoCloseMs && autoCloseMs > 0) {
    modalTimer = setTimeout(() => hideModal(true), autoCloseMs);
  }
}

modal?.addEventListener("click", (e) => {
  if (e.target === modal) hideModal(false);
});

function redirectToLoginAfter(ms = 5000) {
  if (isRedirecting) return;
  isRedirecting = true;

  showModal({
    title: "Finalizando",
    message: "Você será redirecionado para o login…",
    type: "success",
    locked: true,
    autoCloseMs: ms
  });

  setTimeout(() => {
    window.location.href = LOGIN_URL;
  }, ms);
}

/* =========================
   POLLING
   ========================= */
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

function normalizeStatus(s) {
  return String(s || "").trim().toUpperCase();
}

function isPaidStatus(st) {
  return ["PAID", "RECEIVED", "CONFIRMED", "SETTLED"].includes(normalizeStatus(st));
}

function isFailedStatus(st) {
  return ["CANCELLED", "CANCELED", "REFUNDED", "CHARGEBACK", "FAILED", "EXPIRED"].includes(
    normalizeStatus(st)
  );
}

function startPolling(paymentId) {
  stopPolling();

  pollTimer = setInterval(async () => {
    try {
      const url = `${API_CHECK_PAYMENT_STATUS}?paymentId=${encodeURIComponent(paymentId)}`;
      const r = await fetch(url, { method: "GET", headers: { Accept: "application/json" } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data?.ok === false) return;

      const st = normalizeStatus(data?.normalizedStatus || data?.status);

      // ✅ SUCESSO: não depende de done:true
      if (isPaidStatus(st)) {
        stopPolling();

        // 1) Pagamento concluído
        showModal({
          title: "Pagamento concluído!",
          message: "Pagamento confirmado.",
          type: "success",
          locked: true
        });

        // 2) depois mostra redirecionamento por 5s
        setTimeout(() => redirectToLoginAfter(5000), 1200);
        return;
      }

      // ✅ ERRO: também NÃO depende de done:true (mais confiável)
      if (isFailedStatus(st)) {
        stopPolling();
        showModal({
          title: "Pagamento não concluído",
          message: "Transação não autorizada / cancelada. Tente novamente.",
          type: "error",
          locked: false,
          autoCloseMs: 5000
        });
        return;
      }

      // opcional: se quiser atualizar mensagem em status pendente, faz aqui
      // ex: PENDING -> "Aguardando confirmação…"
    } catch {
      // silencioso
    }
  }, 3000);
}

/* =========================
   TAXAS (CARTÃO)
   ========================= */
const ASAAS_TIERS = [
  { min: 2, max: 6,  mdr: 0.0349, fixed: 0.49 },
  { min: 7, max: 12, mdr: 0.0399, fixed: 0.49 },
];

const tierForInstallments = (n) =>
  ASAAS_TIERS.find((t) => n >= t.min && n <= t.max) || ASAAS_TIERS[ASAAS_TIERS.length - 1];

function grossUpTotal(subtotal, n) {
  const base = round2(subtotal);
  if (n === 1) return { tier: null, total: round2(base), per: round2(base), fees: 0 };

  const t = tierForInstallments(n);
  const T = (base + t.fixed) / (1 - t.mdr);
  const total = round2(T);
  return { tier: t, total, per: round2(total / n), fees: round2(total - base) };
}

function getSelectedInstallments() {
  const n = parseInt(uiInstallments?.value || "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 12) : 1;
}

function updateInstallmentsOptions(subtotal) {
  if (!uiInstallments) return;
  Array.from(uiInstallments.options).forEach((opt) => {
    const n = parseInt(opt.value || "1", 10) || 1;
    if (n === 1) opt.textContent = `1x ${fmtBRL(subtotal)} (SEM JUROS)`;
    else opt.textContent = `${n}x de ${fmtBRL(grossUpTotal(subtotal, n).per)}`;
  });
}

function getDisplayedTotal() {
  const subtotal = round2(getAmountBrlFromInputs());
  if (currentPaymentMethod === "pix") return subtotal;
  return grossUpTotal(subtotal, getSelectedInstallments()).total;
}

function validateCardNumber(number) {
  const cleaned = String(number || "").replace(/\D/g, "");
  return cleaned.length >= 13 && cleaned.length <= 19;
}

function validateExpiryDate(expiry) {
  const parts = String(expiry || "").split("/");
  if (parts.length !== 2) return false;
  const month = parseInt(parts[0], 10);
  const yy = parseInt(parts[1], 10);
  if (!month || month < 1 || month > 12) return false;
  if (!Number.isFinite(yy) || yy < 0 || yy > 99) return false;

  const year = 2000 + yy;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return !(year < currentYear || (year === currentYear && month < currentMonth));
}

function validateCVC(cvc) {
  const cleaned = String(cvc || "").replace(/\D/g, "");
  return cleaned.length >= 3 && cleaned.length <= 4;
}

function maskExpInput(e) {
  let v = String(e.target.value || "").replace(/\D/g, "");
  if (v.length > 4) v = v.slice(0, 4);
  e.target.value = v.length >= 3 ? `${v.slice(0, 2)}/${v.slice(2)}` : v;
}

function validateMonthOnBlur(el) {
  const parts = String(el.value || "").split("/");
  if (parts.length !== 2) return;
  let mm = parseInt(parts[0], 10);
  const yy = parts[1] || "";
  if (!mm || mm < 1 || mm > 12) mm = 1;
  el.value = `${String(mm).padStart(2, "0")}/${yy}`.slice(0, 5);
}

function maskCardNumber(e) {
  let v = String(e.target.value || "").replace(/\D/g, "");
  if (v.length > 19) v = v.slice(0, 19);
  e.target.value = v.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function validateCardFields() {
  const errors = [];
  const cardNumber = ccNumberEl?.value?.replace(/\D/g, "") || "";
  const expiry = ccExpEl?.value || "";
  const cvc = ccCvcEl?.value || "";
  const holderName = ccNameEl?.value?.trim() || "";

  if (!validateCardNumber(cardNumber)) errors.push("Número do cartão inválido");
  if (!validateExpiryDate(expiry)) errors.push("Vencimento inválido (MM/AA)");
  if (!validateCVC(cvc)) errors.push("CVC inválido");
  if (!holderName) errors.push("Nome do titular é obrigatório");

  return errors;
}

function isCardReadyForSubmit() {
  if (currentPaymentMethod !== "card") return false;

  const email = (inputEmail?.value || "").trim().toLowerCase();
  const name  = (inputName?.value || "").trim();
  const cpfDigits = onlyDigits(inputCpfCnpj?.value || "");

  if (!email || !name) return false;
  if (!isValidEmail(email)) return false;
  if (!(cpfDigits.length === 11 || cpfDigits.length === 14)) return false;

  return validateCardFields().length === 0;
}

function updateTotalsUI() {
  const descontos = 0;
  const subtotal = round2(getAmountBrlFromInputs() - descontos);

  updateInstallmentsOptions(subtotal);

  if (dispSubtotal)  dispSubtotal.textContent = fmtBRL(subtotal);
  if (dispDescontos) dispDescontos.textContent = fmtBRL(descontos);

  if (currentPaymentMethod === "pix") {
    if (dispTaxas) dispTaxas.textContent = fmtBRL(0);
    if (dispTotal) dispTotal.textContent = fmtBRL(subtotal);
    if (feesNote) feesNote.textContent = "";
    if (installmentHint) installmentHint.textContent = "";
    setPayButton(`Pagar ${fmtBRL(subtotal)}`, true);
    return;
  }

  const n = getSelectedInstallments();
  const { total, per, fees } = grossUpTotal(subtotal, n);

  if (dispTaxas) dispTaxas.textContent = fmtBRL(n === 1 ? 0 : fees);
  if (dispTotal) dispTotal.textContent = fmtBRL(n === 1 ? subtotal : total);

  if (installmentHint) {
    installmentHint.textContent = n === 1 ? "" : `${n}x de ${fmtBRL(per)} (total ${fmtBRL(total)}).`;
  }

  const btnTotal = getDisplayedTotal();
  const canTry = isCardReadyForSubmit();
  setPayButton(isSubmittingCard ? "Processando…" : `Pagar ${fmtBRL(btnTotal)}`, !canTry || isSubmittingCard);
}

/* =========================
   PIX
   ========================= */
function resetPixStateUI() {
  currentPaymentId = null;
  pixCopyPasteCurrent = "";
  pixEncodedImageCurrent = "";
  if (pixQrImage) pixQrImage.removeAttribute("src");
  if (pixStatusText) pixStatusText.textContent = "";
}

function showPixPlaceholder(message) {
  if (message && qrPlaceholder) qrPlaceholder.textContent = message;
  qrPlaceholder?.classList.remove("hidden");
  pixArea?.classList.add("hidden");
  resetPixStateUI();
}

function showPixQr(base64, copyPaste) {
  qrPlaceholder?.classList.add("hidden");
  pixArea?.classList.remove("hidden");

  pixEncodedImageCurrent = base64 || "";
  pixCopyPasteCurrent = copyPaste || "";

  if (pixQrImage) pixQrImage.src = "data:image/png;base64," + base64;
  if (pixStatusText) pixStatusText.textContent = "Aguardando pagamento…";
}

buttonCopyPix?.addEventListener("click", async () => {
  if (!pixCopyPasteCurrent) return;
  try {
    await navigator.clipboard.writeText(pixCopyPasteCurrent);
    if (pixStatusText) pixStatusText.textContent = "Código Pix copiado!";
    setTimeout(() => {
      if (pixStatusText) pixStatusText.textContent = "Aguardando pagamento…";
    }, 1200);
  } catch {
    if (pixStatusText) pixStatusText.textContent = "Não foi possível copiar automaticamente.";
  }
});

async function checkFieldsAndMaybeGeneratePix() {
  if (currentPaymentMethod !== "pix") return false;

  const email = (inputEmail?.value || "").trim().toLowerCase();
  const name  = (inputName?.value || "").trim();

  showError("");
  showEmailValidation("");
  showCpfValidation("");

  const { amount } = getPlanFromInputs();

  if (!amount || amount < 0.01) {
    showPixPlaceholder("Defina um valor válido no HTML (amountCents).");
    return false;
  }

  if (!email || !name) {
    showPixPlaceholder("Preencha e-mail, nome e CPF/CNPJ para gerar o QR Code.");
    return false;
  }

  if (!isValidEmail(email)) {
    showEmailValidation("Por favor, insira um e-mail válido");
    showPixPlaceholder("E-mail inválido");
    return false;
  }

  const cpfDigits = onlyDigits(inputCpfCnpj?.value || "");
  if (!cpfDigits) {
    showPixPlaceholder("Preencha e-mail, nome e CPF/CNPJ para gerar o QR Code.");
    return false;
  }
  if (!isValidCpfCnpj(cpfDigits)) {
    showCpfValidation("CPF/CNPJ inválido (11 ou 14 dígitos).");
    showPixPlaceholder("CPF/CNPJ obrigatório (11 ou 14 dígitos).");
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

  await bootPaymentForPix();
  return true;
}

async function bootPaymentForPix() {
  if (currentPaymentMethod !== "pix") return;

  const key = getPixKey();

  if (key === pixLastKey && currentPaymentId && pixEncodedImageCurrent && pixCopyPasteCurrent) {
    showPixQr(pixEncodedImageCurrent, pixCopyPasteCurrent);
    return;
  }

  stopPolling();
  resetPixStateUI();

  if (pixAbortController) {
    try { pixAbortController.abort(); } catch {}
  }
  pixAbortController = new AbortController();

  if (pixInFlight) return;
  pixInFlight = true;

  try {
    showError("");

    const email = (inputEmail?.value || "").trim().toLowerCase();
    const name  = (inputName?.value || "").trim();
    const cpfCnpj = (inputCpfCnpj?.value || "").trim();

    const { amount, description, plano } = getPlanFromInputs();
    showPixPlaceholder(`Gerando cobrança Pix (${fmtBRL(amount)})…`);

    const payload = {
      provider: "asaas",
      type: "pix",
      plan: plano,
      amount_brl: amount,
      email,
      name,
      cpfCnpj,
      description
    };

    const data = await fetchJsonOrThrow(API_CREATE_PAYMENT_INTENT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: pixAbortController.signal
    });

    const qrBase64  = data?.encodedImage || data?.original?.encodedImage;
    const copyPaste = data?.payload || data?.original?.payload;

    if (!qrBase64 || !copyPaste) throw new Error("Não foi possível gerar o QR Pix no momento.");

    currentPaymentId = data?.paymentId || data?.id || null;
    pixLastKey = key;

    showPixQr(qrBase64, copyPaste);

    if (currentPaymentId) startPolling(currentPaymentId);
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.error(err);
    showError(err?.message || "Não foi possível iniciar o Pix.");
    showPixPlaceholder("Falha ao gerar Pix. Tente novamente.");
  } finally {
    pixInFlight = false;
  }
}

/* =========================
   CARTÃO
   ========================= */
async function processCardPayment() {
  const email = (inputEmail?.value || "").trim().toLowerCase();
  const name  = (inputName?.value || "").trim();
  const cpfCnpj = onlyDigits(inputCpfCnpj?.value || "");

  if (!email || !name) throw new Error("E-mail e nome são obrigatórios");
  if (!isValidEmail(email)) throw new Error("E-mail inválido");
  if (!cpfCnpj) throw new Error("CPF/CNPJ é obrigatório");
  if (!isValidCpfCnpj(cpfCnpj)) throw new Error("CPF/CNPJ inválido");

  showEmailValidation("Validando e-mail...", true);
  const ok = await validateEmailInDynamoDB(email);
  if (!ok) throw new Error("E-mail não encontrado no sistema");
  showEmailValidation("E-mail validado.", true);

  const errs = validateCardFields();
  if (errs.length) throw new Error(errs.join(", "));

  const installments = getSelectedInstallments();
  const { amount, description, plano } = getPlanFromInputs();
  const totalCard = grossUpTotal(amount, installments).total;

  const cardNumber = ccNumberEl.value.replace(/\D/g, "");
  const [expMonthRaw, expYearRaw] = String(ccExpEl.value || "").split("/");
  const expMonth = String(expMonthRaw || "").padStart(2, "0");
  const expYear  = String(expYearRaw || "").padStart(2, "0"); // YY
  const cvc      = String(ccCvcEl.value || "").replace(/\D/g, "");
  const holderName = ccNameEl.value.trim();

  const holderInfo = {
    name: holderName,
    email,
    cpfCnpj,
    address: "Rua Teste",
    addressNumber: "123",
    postalCode: "58000000",
    phone: "83999999999",
    mobilePhone: "83999999999",
  };

  const payload = {
    type: "CARD",
    plan: plano,
    value: totalCard,
    description,
    installmentCount: installments,
    customerData: { name, email, cpfCnpj },
    creditCard: {
      holderName,
      number: cardNumber,
      expiryMonth: expMonth,
      expiryYear: expYear,
      ccv: cvc,
    },
    creditCardHolderInfo: holderInfo
  };

  const result = await fetchJsonOrThrow(API_CREATE_CARD_PAYMENT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (!result?.ok) {
    const msg =
      result?.message ||
      result?.error ||
      result?.asaas?.errors?.[0]?.description ||
      "Erro ao processar pagamento";
    throw new Error(msg);
  }

  return result;
}

async function onPayButtonClick(e) {
  e.preventDefault();

  if (currentPaymentMethod !== "card") return;
  if (isSubmittingCard) return;

  showError("");
  showCpfValidation("");
  isRedirecting = false;

  const cpfDigits = onlyDigits(inputCpfCnpj?.value || "");
  if (!cpfDigits || !isValidCpfCnpj(cpfDigits)) {
    showCpfValidation("Digite 11 (CPF) ou 14 (CNPJ) dígitos.");
    showError("CPF/CNPJ inválido");
    updateTotalsUI();
    return;
  }

  const errs = validateCardFields();
  if (errs.length) {
    showError(errs.join(", "));
    updateTotalsUI();
    return;
  }

  try {
    isSubmittingCard = true;
    updateTotalsUI();

    showModal({
      title: "Pagamento em andamento",
      message: "Processando pagamento… aguarde.",
      type: "info",
      locked: true
    });

    const r = await processCardPayment();

    const pid =
      r?.paymentId ||
      r?.asaasPaymentId ||
      r?.payment?.id ||
      r?.original?.id ||
      r?.id ||
      null;

    // ✅ GARANTE QUE O POLLING VAI NUM pay_...
    if (!pid || !String(pid).startsWith("pay_")) {
      throw new Error("A API do cartão não retornou paymentId (pay_...). Ajuste a Lambda para devolver paymentId.");
    }

    currentPaymentId = pid;

    showModal({
      title: "Pagamento em andamento",
      message: "Aguardando confirmação…",
      type: "info",
      locked: true
    });

    startPolling(currentPaymentId);
  } catch (err) {
    console.error(err);
    showError(err?.message || "Não foi possível concluir o pagamento no cartão.");
    showModal({
      title: "Erro no cartão",
      message: err?.message || "Falha no pagamento.",
      type: "error",
      locked: false,
      autoCloseMs: 5000
    });
  } finally {
    isSubmittingCard = false;
    updateTotalsUI();
  }
}

/* =========================
   TABS + INIT
   ========================= */
function switchMethodTo(method) {
  currentPaymentMethod = method;
  stopPolling();
  currentPaymentId = null;
  isRedirecting = false;

  showError("");
  showCpfValidation("");

  updateTotalsUI();

  if (currentPaymentMethod === "pix") {
    if (pixStatusText) pixStatusText.textContent = "";
    showPixPlaceholder("Preencha e-mail, nome e CPF/CNPJ para gerar o QR Code.");
  } else {
    resetPixStateUI();
  }
}

tabsButtons.forEach((tabButton) => {
  tabButton.addEventListener("click", async () => {
    tabsButtons.forEach((b) => b.classList.remove("active"));
    tabButton.classList.add("active");

    panels.forEach((p) => p.classList.remove("show"));
    const target = document.querySelector(tabButton.dataset.target);
    target?.classList.add("show");

    const method = tabButton.dataset.target === "#pixPanel" ? "pix" : "card";
    switchMethodTo(method);

    if (method === "pix") await checkFieldsAndMaybeGeneratePix();
  });
});

(function init() {
  currentPaymentMethod =
    document.querySelector(".pay-tabs .tab.active")?.dataset.target === "#pixPanel"
      ? "pix"
      : "card";

  buttonSubmit?.addEventListener("click", onPayButtonClick);
  formElement?.addEventListener("submit", (e) => e.preventDefault());

  ccExpEl?.addEventListener("input", maskExpInput);
  ccExpEl?.addEventListener("blur", () => validateMonthOnBlur(ccExpEl));
  ccNumberEl?.addEventListener("input", maskCardNumber);

  [
    inputEmail, inputName, inputCpfCnpj,
    ccNumberEl, ccExpEl, ccCvcEl, ccNameEl
  ].forEach((el) => el?.addEventListener("input", updateTotalsUI));

  uiInstallments?.addEventListener("change", updateTotalsUI);

  inputEmail?.addEventListener("blur", () => {
    if (currentPaymentMethod === "pix") checkFieldsAndMaybeGeneratePix();
  });
  inputName?.addEventListener("blur", () => {
    if (currentPaymentMethod === "pix") checkFieldsAndMaybeGeneratePix();
  });
  inputCpfCnpj?.addEventListener("blur", () => {
    if (currentPaymentMethod === "pix") checkFieldsAndMaybeGeneratePix();
  });

  updateTotalsUI();

  if (currentPaymentMethod === "pix") {
    showPixPlaceholder("Preencha e-mail, nome e CPF/CNPJ para gerar o QR Code.");
  }
})();
