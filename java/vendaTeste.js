/* ============================================================
   vendaTeste_asaas.js — Plano Teste (7 dias) com Asaas
   - Pix via createPaymentIntent (Asaas)
   - Cartão: via createCardPayment (Asaas) com parcelamento funcional
   - Exibe Subtotal / Descontos / Taxas / Total em tempo real
   - Máscara do vencimento MM/AA
   ============================================================ */

const API_CREATE_PAYMENT_INTENT =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/createPaymentIntent"; // Endpoint para criar intenção de pagamento (Pix )
const API_CREATE_CARD_PAYMENT =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/createCardPayment"; // Endpoint para criar pagamento com cartão
const API_VALIDATE_EMAIL =
  "https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/dev/cliente"; // Endpoint para validar e-mail do cliente

const PURCHASE_AMOUNT = 10.0; // Valor base da compra
const PURCHASE_CURRENCY = "BRL"; // Moeda da compra
const ASAAS_PIX_AMOUNT_BRL = 10.0; // Valor do Pix em BRL

let currentPaymentMethod = "card"; // Define o método de pagamento inicial como cartão

// Referências aos elementos do formulário
const formElement = document.getElementById("payment-form" );
const inputEmail = document.getElementById("email");
const inputName = document.getElementById("name");
const inputDesc = document.getElementById("description");
const inputAmountCents = document.getElementById("amountCents");
const inputPlanoSlug = document.getElementById("planoSlug");

const errorBox = document.getElementById("error"); // Caixa para exibir erros
const emailValidationBox = document.getElementById("email-validation"); // Caixa para exibir validação de e-mail
const buttonSubmit = document.getElementById("submitBtn"); // Botão de submissão

const tabsButtons = document.querySelectorAll(".pay-tabs .tab"); // Botões das abas de pagamento
const panels = document.querySelectorAll(".pay-panel"); // Painéis de conteúdo das abas

/* UI do Pix */
const pixArea = document.getElementById("pix-area");
const pixQrImage = document.getElementById("pix-qr");
const pixStatusText = document.getElementById("pix-status");
const buttonCopyPix = document.getElementById("btnCopy");
const qrPlaceholder = document.getElementById("qr-placeholder");

/* Coluna esquerda (valores de resumo) */
const dispSubtotal = document.getElementById("display-subtotal");
const dispDescontos = document.getElementById("display-descontos");
const dispTaxas = document.getElementById("display-taxas");
const dispTotal = document.getElementById("display-total");
const feesNote = document.getElementById("fees-note");

/* Campos do cartão e parcelas */
const ccNumberEl = document.getElementById("cc-number"); // Campo número do cartão
const ccExpEl = document.getElementById("cc-exp"); // Campo vencimento do cartão
const ccCvcEl = document.getElementById("cc-cvc"); // Campo CVC do cartão
const ccNameEl = document.getElementById("cc-name"); // Campo nome do titular
const uiInstallments = document.getElementById("installments"); // Select de parcelas
const installmentHint = document.getElementById("installment-hint"); // Dica de parcelamento

// Função para formatar valores em BRL
const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Exibe mensagens de erro
function showError(msg) {
  if (!errorBox) return;
  errorBox.textContent = msg || "";
  errorBox.style.display = msg ? "block" : "none";
}

// Exibe mensagens de validação de e-mail
function showEmailValidation(msg, ok = false) {
  if (!emailValidationBox) return;
  emailValidationBox.textContent = msg || "";
  emailValidationBox.style.display = msg ? "block" : "none";
  emailValidationBox.style.color = ok ? "#10b981" : "#ff7070";
}

// Define o texto e estado do botão de submissão
function setSubmit(t, dis = false) {
  if (!buttonSubmit) return;
  buttonSubmit.textContent = t;
  buttonSubmit.disabled = !!dis;
}

/* =============== Máscara MM/AA do vencimento =============== */
function maskExpInput(e) {
  let v = e.target.value.replace(/\D/g, ""); // Remove não-dígitos
  if (v.length > 4) v = v.slice(0, 4); // Limita a 4 dígitos
  // Formata como MM/AA
  if (v.length >= 3) {
    const mm = v.slice(0, 2);
    const aa = v.slice(2);
    e.target.value = `${mm}/${aa}`;
  } else if (v.length >= 1) {
    e.target.value = v;
  } else {
    e.target.value = "";
  }
}

// Valida o mês ao perder o foco
function validateMonthOnBlur(e) {
  const parts = (e.target.value || "").split("/");
  if (parts.length === 2) {
    let mm = parseInt(parts[0], 10);
    if (!mm || mm < 1 || mm > 12) {
      // Corrige para 01 se o mês for inválido
      e.target.value = `01/${parts[1] ?? ""}`.slice(0, 5);
    }
  }
}

/* =============== Máscara do número do cartão =============== */
function maskCardNumber(e) {
  let v = e.target.value.replace(/\D/g, ""); // Remove não-dígitos
  if (v.length > 16) v = v.slice(0, 16); // Limita a 16 dígitos
  
  // Adiciona espaços a cada 4 dígitos para formatação visual
  v = v.replace(/(\d{4})(?=\d)/g, '$1 ');
  e.target.value = v;
}

/* =============== Validações de cartão =============== */
// Valida o número do cartão (apenas comprimento)
function validateCardNumber(number) {
  const cleaned = number.replace(/\D/g, "");
  return cleaned.length >= 13 && cleaned.length <= 19; // Números de cartão geralmente têm entre 13 e 19 dígitos
}

// Valida a data de vencimento (MM/AA)
function validateExpiryDate(expiry) {
  const parts = expiry.split("/");
  if (parts.length !== 2) return false;
  
  const month = parseInt(parts[0], 10);
  const year = parseInt("20" + parts[1], 10); // Assume que o ano é no século 21
  
  if (month < 1 || month > 12) return false;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  // Verifica se a data de vencimento é no futuro
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return false;
  }
  
  return true;
}

// Valida o CVC (código de segurança)
function validateCVC(cvc) {
  const cleaned = cvc.replace(/\D/g, "");
  return cleaned.length >= 3 && cleaned.length <= 4; // CVCs têm 3 ou 4 dígitos
}

// Adiciona event listeners para as máscaras e validações
ccExpEl?.addEventListener("input", maskExpInput);
ccExpEl?.addEventListener("blur", validateMonthOnBlur);
ccNumberEl?.addEventListener("input", maskCardNumber);

/* ===================== Helpers e Pix ===================== */
// Mostra o placeholder do QR Code Pix
function showPixPlaceholder(message) {
  if (message && qrPlaceholder) qrPlaceholder.textContent = message;
  qrPlaceholder?.classList.remove("hidden");
  pixArea?.classList.add("hidden");
  if (pixQrImage) {
    pixQrImage.removeAttribute("src");
    pixQrImage.alt = "QR Pix";
  }
  if (pixStatusText) pixStatusText.textContent = "";
}

// Exibe o QR Code Pix e o código copia-e-cola
function showPixQr(base64, copyPaste) {
  qrPlaceholder?.classList.add("hidden");
  pixArea?.classList.remove("hidden");
  if (pixQrImage) {
    pixQrImage.src = "data:image/png;base64," + base64;
    pixQrImage.alt = "QR Pix";
  }
  if (pixStatusText) {
    pixStatusText.textContent = "Abra o app do seu banco, leia o QR ou use o código copia-e-cola.";
  }
  buttonCopyPix?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(copyPaste);
      if (pixStatusText) pixStatusText.textContent = "Código Pix copiado!";
    } catch {
      if (pixStatusText) pixStatusText.textContent = "Não foi possível copiar automaticamente.";
    }
  }, { once: true });
}

// Valida o formato de e-mail
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").toLowerCase());
}

// Valida o e-mail no DynamoDB via API
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

// Deriva o slug do plano a partir da descrição
function planSlugFromDescription(desc) {
  const d = String(desc || "").toLowerCase();
  if (d.includes("ultra")) return "plano_ultra_5_anos";
  if (d.includes("pro")) return "plano_pro_1_ano";
  if (d.includes("plus")) return "plano_plus_30_dias";
  if (d.includes("teste")) return "teste_7_dias";
  return "teste_7_dias";
}

// Obtém o valor da compra em BRL a partir dos inputs
function getAmountBrlFromInputs() {
  const cents = inputAmountCents?.value;
  if (cents) {
    const n = Number(String(cents).replace(/[^0-9\-\.]/g, ""));
    if (!Number.isNaN(n)) return n / 100.0;
  }
  return ASAAS_PIX_AMOUNT_BRL || PURCHASE_AMOUNT || 10.0;
}

/* ================== Tabela de taxas (Asaas) ================== */
// Definição das faixas de taxas do Asaas para parcelamento
const ASAAS_TIERS = [
  { min: 1, max: 1, mdr: 0.0299, fixed: 0.49, label: "1x: 2,99% + R$ 0,49" },
  { min: 2, max: 6, mdr: 0.0349, fixed: 0.49, label: "2 a 6x: 3,49% + R$ 0,49" },
  { min: 7, max: 12, mdr: 0.0399, fixed: 0.49, label: "7 a 12x: 3,99% + R$ 0,49" },
];

// Arredonda um número para duas casas decimais
const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
// Retorna a faixa de taxa para um dado número de parcelas
const tierForInstallments = (n) => ASAAS_TIERS.find(t => n >= t.min && n <= t.max) || ASAAS_TIERS.at(-1);

// Calcula o valor total bruto (com taxas) para um subtotal e número de parcelas
function grossUpTotal(subtotal, n) {
  const t = tierForInstallments(n);
  const T = (subtotal + t.fixed) / (1 - t.mdr);
  return {
    tier: t,
    total: round2(T),
    per: round2(T / n),
    fees: round2(T - subtotal)
  };
}

/* Atualiza coluna esquerda e o hint embaixo do select */
// Atualiza a interface com os valores de subtotal, descontos, taxas e total
function updateTotalsUI(n) {
  const base = getAmountBrlFromInputs();
  const descontos = 0;
  const subtotal = round2(base - descontos);
  const { tier, total, per, fees } = grossUpTotal(subtotal, n);

  if (dispSubtotal) dispSubtotal.textContent = fmtBRL(subtotal);
  if (dispDescontos) dispDescontos.textContent = fmtBRL(descontos);
  if (dispTaxas) dispTaxas.textContent = fmtBRL(fees);
  if (dispTotal) dispTotal.textContent = fmtBRL(total);

  if (installmentHint) {
    installmentHint.textContent =
      n === 1
        ? `Tarifas consideradas: ${tier.label}. Total à vista: ${fmtBRL(total)}.`
        : `Tarifas consideradas: ${tier.label}. ${n}x de ${fmtBRL(per)} (total ${fmtBRL(total)}).`;
  }
  if (feesNote) {
    feesNote.textContent = `As taxas são repassadas conforme parcelamento escolhido. ${tier.label}.`;
  }
  return { total, per };
}

/* ========================== Validações de campos ========================== */
// Verifica campos de e-mail e nome e, se for Pix, gera o QR Code
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

/* ========================== Pix ========================== */
// Inicia o processo de pagamento (Pix ou Cartão)
async function bootPaymentFor(method) {
  try {
    showError("");
    setSubmit("Carregando…", true);

    if (method === "card") {
      setSubmit("Pagar e assinar", false);
      return; // A lógica do cartão é tratada em onFormSubmit
    }

    const amountBrl = getAmountBrlFromInputs();
    showPixPlaceholder(`Gerando cobrança Pix (R$ ${amountBrl.toFixed(2)})…`);

    const desc = (inputDesc?.value || "Plano Teste (7 Dias)").trim();
    let slug = (inputPlanoSlug?.value && String(inputPlanoSlug.value).trim()) || planSlugFromDescription(desc);
    if (!slug.startsWith("plano_") && slug !== "teste_7_dias") slug = "teste_7_dias";
    slug = "teste_7_dias";

    const payload = {
      provider: "asaas",
      type: "pix",
      amount_brl: Number(amountBrl),
      email: (inputEmail?.value || "").trim(),
      name: (inputName?.value || "").trim(),
      description: desc,
      plano: slug
    };

    const response = await fetch(API_CREATE_PAYMENT_INTENT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      const msg = data?.message || data?.error || data?.details || `Falha ao iniciar Pix (${response.status})`;
      throw new Error(msg);
    }

    const qrBase64 =
      data.qr_code_base64 || data.encodedImage ||
      data?.original?.encodedImage || data?.pixQrCode?.encodedImage ||
      data?.pix?.encodedImage || data?.point_of_interaction?.transaction_data?.qr_code_base64;

    const copyPaste =
      data.qr_code_payload || data.qr_code || data.payload ||
      data?.original?.payload || data?.pixQrCode?.payload ||
      data?.pix?.payload || data?.point_of_interaction?.transaction_data?.qr_code;

    if (!qrBase64 || !copyPaste) throw new Error("Não foi possível gerar o QR Pix no momento.");
    showPixQr(qrBase64, copyPaste);
    setSubmit("Aguardando pagamento…", false);
  } catch (err) {
    console.error(err);
    showError(err.message || "Não foi possível iniciar o pagamento.");
    setSubmit("Pagar e assinar", false);
  }
}

/* ========================== Cartão (Asaas) ========================== */
// Obtém o número de parcelas selecionado
function getSelectedInstallments() {
  const n = parseInt(uiInstallments?.value || "1", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 12) : 1;
}

// Obtém o valor total do cartão para um número de parcelas
function getCardAmountFor(n) {
  const base = getAmountBrlFromInputs();
  return grossUpTotal(base, n).total;
}

// Valida todos os campos do formulário de cartão de crédito
function validateCardFields() {
  const errors = [];
  
  const cardNumber = ccNumberEl?.value?.replace(/\D/g, "") || "";
  const expiry = ccExpEl?.value || "";
  const cvc = ccCvcEl?.value || "";
  const name = ccNameEl?.value?.trim() || "";

  if (!validateCardNumber(cardNumber)) {
    errors.push("Número do cartão inválido");
  }
  
  if (!validateExpiryDate(expiry)) {
    errors.push("Data de vencimento inválida");
  }
  
  if (!validateCVC(cvc)) {
    errors.push("Código de segurança inválido");
  }
  
  if (!name) {
    errors.push("Nome do titular é obrigatório");
  }

  return errors;
}

// Processa o pagamento com cartão de crédito via API Lambda do Asaas
async function processCardPayment() {
  const email = (inputEmail?.value || "").trim().toLowerCase();
  const name = (inputName?.value || "").trim();
  
  // Valida e-mail e nome
  if (!email || !name) {
    throw new Error("E-mail e nome são obrigatórios");
  }
  
  if (!isValidEmail(email)) {
    throw new Error("E-mail inválido");
  }

  // Valida e-mail no sistema (DynamoDB)
  const isValidEmailInSystem = await validateEmailInDynamoDB(email);
  if (!isValidEmailInSystem) {
    throw new Error("E-mail não encontrado no sistema");
  }

  // Valida campos específicos do cartão
  const cardErrors = validateCardFields();
  if (cardErrors.length > 0) {
    throw new Error(cardErrors.join(", "));
  }

  const installments = getSelectedInstallments();
  const totalAmount = getCardAmountFor(installments);
  
  const cardNumber = ccNumberEl.value.replace(/\D/g, "");
  const expiry = ccExpEl.value.split("/");
  const cvc = ccCvcEl.value;
  const holderName = ccNameEl.value.trim();

  // Prepara o payload para a API createCardPayment
  const payload = {
    customerData: {
      name: name,
      email: email,
      mobilePhone: "", // Adicionar se houver campo no formulário
      cpfCnpj: "", // Adicionar se houver campo no formulário
    },
    value: totalAmount,
    description: inputDesc?.value || "Plano Teste (7 Dias)",
    externalReference: `teste_7_dias_${Date.now()}`, // Referência externa única
    installmentCount: installments,
    creditCard: {
      holderName: holderName,
      number: cardNumber,
      expiryMonth: expiry[0],
      expiryYear: expiry[1],
      ccv: cvc
    },
    creditCardHolderInfo: {
      name: holderName,
      email: email,
      cpfCnpj: "", // Adicionar se houver campo no formulário
      postalCode: "", // Adicionar se houver campo no formulário
      addressNumber: "", // Adicionar se houver campo no formulário
      phone: "" // Adicionar se houver campo no formulário
    }
  };

  // Envia a requisição para a API Lambda
  const response = await fetch(API_CREATE_CARD_PAYMENT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  
  // Trata a resposta da API
  if (!response.ok || !result.ok) {
    const errorMsg = result?.message || result?.error || result?.asaas?.errors?.[0]?.description || "Erro ao processar pagamento";
    throw new Error(errorMsg);
  }

  return result;
}

/* ========================== Eventos do formulário ========================== */
// Lida com a submissão do formulário
async function onFormSubmit(e) {
  e.preventDefault();
  
  if (currentPaymentMethod === "pix") return; // Se for Pix, a lógica é diferente
  
  showError("");
  setSubmit("Processando…", true);
  
  try {
    const result = await processCardPayment();
    
    // Exibe modal de sucesso após o pagamento
    showPaymentModal("Pagamento Aprovado!", 
      `Seu pagamento foi processado com sucesso! ID: ${result.payment?.id}`, 
      "success");
    
    setSubmit("Pagamento aprovado!", true); // Desabilita o botão após sucesso
  } catch (err) {
    console.error(err);
    showError(err.message || "Não foi possível concluir o pagamento.");
    setSubmit("Pagar e assinar", false);
  }
}

// Exibe um modal de feedback (sucesso/erro)
function showPaymentModal(title, message, type = "success") {
  const modal = document.getElementById("pay-modal");
  const modalBox = modal?.querySelector(".modal-box");
  const titleEl = document.getElementById("pay-modal-title");
  const msgEl = document.getElementById("pay-modal-msg");
  const okBtn = document.getElementById("pay-modal-ok");

  if (!modal || !modalBox) return;

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  
  modalBox.className = `modal-box ${type}`;
  modal.classList.remove("hidden");

  okBtn?.addEventListener("click", () => {
    modal.classList.add("hidden");
  }, { once: true });
}

/* ========================== Tabs / Eventos / Boot ========================== */
// Adiciona event listeners para os botões das abas de pagamento
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
      setSubmit("Pagar e assinar", false);
    }
  });
});

// Event listeners para o formulário e campos
formElement?.addEventListener("submit", onFormSubmit);
inputEmail?.addEventListener("blur", checkFieldsAndMaybeGeneratePix); // Valida e-mail ao perder o foco
inputName?.addEventListener("blur", checkFieldsAndMaybeGeneratePix); // Valida nome ao perder o foco
inputEmail?.addEventListener("input", () => showEmailValidation("")); // Limpa validação de e-mail ao digitar

// Atualiza os totais na UI quando o número de parcelas é alterado
uiInstallments?.addEventListener("change", () => {
  const n = getSelectedInstallments();
  updateTotalsUI(n);
});

// Função de inicialização
(function init() {
  try {
    if (inputDesc) inputDesc.value = "Plano Teste (7 Dias)";
    if (inputPlanoSlug) inputPlanoSlug.value = "teste_7_dias";
    if (inputAmountCents && !inputAmountCents.value) inputAmountCents.value = "1000";
  } catch {}

  // Inicializa os valores de total (para 1x parcela) e define a aba de cartão como padrão
  updateTotalsUI(1);
  
  // Ativa a aba de cartão por padrão na inicialização
  const cardTab = document.querySelector('[data-target="#cardPanel"]');
  const cardPanel = document.getElementById("cardPanel");
  if (cardTab && cardPanel) {
    tabsButtons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("show"));
    cardTab.classList.add("active");
    cardPanel.classList.add("show");
    currentPaymentMethod = "card";
  }
})();
