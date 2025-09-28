// ==============================
// esqueciSenha.js — Versão robusta
// ==============================
"use strict";

// ---- Config da API ----
const API_CONFIG = {
  baseUrl: "https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com/prod",
  endpoints: { requestPasswordReset: "/request-password-reset" },
  timeoutMs: 12000,
  retries: 2, // tentativas extras em 5xx/timeout
  secureMode: true, // true => não revela se email existe (404 vira sucesso genérico)
};

// ---- DOM ----
const form = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("email");
const emailError = document.getElementById("emailError");
const submitBtn = document.getElementById("submitBtn");
const successMessage = document.getElementById("successMessage");

// ---- Util ----
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return emailRegex.test(email);
}

function showError(el, message) {
  el.textContent = message;
  // acessibilidade: descreve o erro
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "polite");
  // estilização (label anterior)
  const label = el.previousElementSibling;
  if (label) label.classList.add("error");
}

function clearError(el) {
  el.textContent = "";
  el.removeAttribute("role");
  el.removeAttribute("aria-live");
  const label = el.previousElementSibling;
  if (label) label.classList.remove("error");
}

function setButtonLoading(loading) {
  submitBtn.classList.toggle("loading", loading);
  submitBtn.disabled = loading;
  submitBtn.setAttribute("aria-busy", String(loading));
}

function lockForm(locked) {
  form.setAttribute("aria-busy", String(locked));
  emailInput.readOnly = locked;
}

function showSuccessMessage() {
  form.style.display = "none";
  successMessage.style.display = "block";
  successMessage.setAttribute("role", "status");
  successMessage.setAttribute("aria-live", "polite");
}

// Map de mensagens mais claras por status
function mapErrorMessage(status, fallback = "Erro ao enviar. Tente novamente.") {
  if (status === 400) return "E-mail inválido.";
  if (status === 401 || status === 403) return "Não autorizado. Verifique a configuração.";
  if (status === 404) return API_CONFIG.secureMode ? null : "Conta não encontrada.";
  if (status === 409) return "Já existe um pedido recente. Verifique seu e-mail.";
  if (status === 422) return "Dados incompletos. Confira o e-mail.";
  if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (status >= 500) return "Serviço indisponível no momento. Tente novamente em instantes.";
  return fallback;
}

// Fetch com timeout + retry exponencial para 5xx/timeouts
async function fetchWithResilience(url, options, { timeoutMs, retries }) {
  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      const isAbort = err?.name === "AbortError";
      const canRetry = isAbort || err?.message?.includes("Failed to fetch");
      if (attempt < retries && canRetry) {
        // backoff exponencial
        const backoff = Math.min(1500 * 2 ** attempt, 5000);
        await new Promise(r => setTimeout(r, backoff));
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

// ---- Chamada à API ----
async function requestPasswordReset(email) {
  const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.requestPasswordReset}`;
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Evita cache agressivo de CDN intermediária
    cache: "no-store",
    body: JSON.stringify({ email: email.trim() }),
  };

  const response = await fetchWithResilience(url, options, {
    timeoutMs: API_CONFIG.timeoutMs,
    retries: API_CONFIG.retries,
  });

  // Tenta parsear JSON com segurança
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  // Fluxo seguro: 200/201/202 => sucesso; 404 => sucesso genérico (se secureMode)
  if (response.ok) return { success: true, data };
  if (response.status === 404 && API_CONFIG.secureMode) return { success: true, data: { masked: true } };

  // Caso de erro visível
  return {
    success: false,
    error: data?.error || mapErrorMessage(response.status) || "Erro desconhecido",
    status: response.status,
  };
}

// ---- Listeners ----
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError(emailError);

  const email = emailInput.value.trim();

  if (!email) {
    showError(emailError, "Por favor, digite seu e-mail.");
    emailInput.focus();
    return;
  }
  if (!isValidEmail(email)) {
    showError(emailError, "Por favor, digite um e-mail válido.");
    emailInput.focus();
    return;
  }

  // Evita duplo submit
  if (submitBtn.disabled) return;

  setButtonLoading(true);
  lockForm(true);

  try {
    const result = await requestPasswordReset(email);

    if (result.success) {
      showSuccessMessage();
      return;
    }

    // Erro tratável
    const msg = mapErrorMessage(result.status, result.error) || "Erro ao enviar. Tente novamente.";
    showError(emailError, msg);
    emailInput.focus();
  } catch (error) {
    console.error("Erro:", error);
    showError(emailError, "Erro de conexão. Tente novamente.");
  } finally {
    setButtonLoading(false);
    lockForm(false);
  }
});

// Limpa erro ao digitar
emailInput.addEventListener("input", () => {
  if (emailError.textContent) clearError(emailError);
});

// Submeter com Enter de modo consistente
emailInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault(); // evita duplo submit
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
  }
});

// Focus inicial
document.addEventListener("DOMContentLoaded", () => {
  emailInput.focus({ preventScroll: true });
});
