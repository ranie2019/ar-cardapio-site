// ==============================
// esqueciSenha.js — Versão robusta (atualizada)
// ==============================
"use strict";

const API_CONFIG = {
  baseUrl: "https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com/prod",
  endpoints: { requestPasswordReset: "/request-password-reset" },
  timeoutMs: 12000,
  retries: 2,
  secureMode: true,
};

const form = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("email");
const emailError = document.getElementById("emailError");
const submitBtn = document.getElementById("submitBtn");
const successMessage = document.getElementById("successMessage");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_THROTTLE_MS = 1500; // protege contra envios rápidos
let lastSubmitTs = 0;

function isValidEmail(email) { return emailRegex.test(email); }

function showError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.setAttribute("role", "alert");
  el.setAttribute("aria-live", "polite");
  const label = el.previousElementSibling;
  if (label) label.classList.add("error");
}

function clearError(el) {
  if (!el) return;
  el.textContent = "";
  el.removeAttribute("role");
  el.removeAttribute("aria-live");
  const label = el.previousElementSibling;
  if (label) label.classList.remove("error");
}

function setButtonLoading(loading) {
  if (!submitBtn) return;
  submitBtn.classList.toggle("loading", loading);
  submitBtn.disabled = loading;
  submitBtn.setAttribute("aria-busy", String(loading));
}

function lockForm(locked) {
  if (!form || !emailInput) return;
  form.setAttribute("aria-busy", String(locked));
  emailInput.readOnly = locked;
}

function showSuccessMessage() {
  if (form) form.style.display = "none";
  if (successMessage) {
    successMessage.style.display = "block";
    successMessage.setAttribute("role", "status");
    successMessage.setAttribute("aria-live", "polite");
  }
}

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

// Fetch com timeout + retry (inclui retry em 5xx)
async function fetchWithResilience(url, options, { timeoutMs = 12000, retries = 2 } = {}) {
  let attempt = 0;
  const maxBackoff = 5000;
  while (true) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);

      // Se 5xx -> considerar retry (quando attempt < retries)
      if (res.status >= 500 && attempt < retries) {
        const backoff = Math.min(1500 * 2 ** attempt, maxBackoff);
        await new Promise(r => setTimeout(r, backoff));
        attempt++;
        continue;
      }

      // Retorna a resposta para o chamador (ok ou 4xx sem retry)
      return res;
    } catch (err) {
      clearTimeout(id);
      const isAbort = err?.name === "AbortError";
      const isNetwork = err?.message && (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"));
      const canRetry = isAbort || isNetwork;
      if (attempt < retries && canRetry) {
        const backoff = Math.min(1500 * 2 ** attempt, maxBackoff);
        await new Promise(r => setTimeout(r, backoff));
        attempt++;
        continue;
      }
      throw err;
    }
  }
}

async function requestPasswordReset(email) {
  const url = `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.requestPasswordReset}`;
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ email: email.trim() }),
  };

  const response = await fetchWithResilience(url, options, {
    timeoutMs: API_CONFIG.timeoutMs,
    retries: API_CONFIG.retries,
  });

  let data = {};
  try { data = await response.json(); } catch (_) { data = {}; }

  if (response.ok) return { success: true, data };
  if (response.status === 404 && API_CONFIG.secureMode) return { success: true, data: { masked: true } };

  return {
    success: false,
    error: data?.error || mapErrorMessage(response.status) || "Erro desconhecido",
    status: response.status,
  };
}

// ----- Add listeners only if DOM elements exist -----
if (form && emailInput && emailError && submitBtn && successMessage) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError(emailError);

    const now = Date.now();
    if (now - lastSubmitTs < SUBMIT_THROTTLE_MS) return;
    lastSubmitTs = now;

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

    if (submitBtn.disabled) return;

    setButtonLoading(true);
    lockForm(true);

    try {
      const result = await requestPasswordReset(email);

      if (result.success) {
        showSuccessMessage();
        return;
      }

      const msg = mapErrorMessage(result.status, result.error) || "Erro ao enviar. Tente novamente.";
      showError(emailError, msg);
      emailInput.focus();
      // opcional: console.warn para debugging
      console.warn("Forgot-password failed", result.status, result.error);
    } catch (error) {
      console.error("Erro na requisição de reset de senha:", error);
      showError(emailError, "Erro de conexão. Tente novamente.");
    } finally {
      setButtonLoading(false);
      lockForm(false);
    }
  });

  emailInput.addEventListener("input", () => {
    if (emailError.textContent) clearError(emailError);
  });

  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    try { emailInput.focus({ preventScroll: true }); } catch (_) { emailInput.focus(); }
  });
} else {
  // Proteção para evitar quebrar se script for incluído em página sem os elementos
  console.warn("esqueciSenha.js: elementos do formulário não encontrados — listeners não foram registrados.");
}
