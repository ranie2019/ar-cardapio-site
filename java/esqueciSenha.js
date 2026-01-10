// ==============================
// esqueciSenha.js — Versão robusta (atualizada, sem quebrar suas lógicas)
// ==============================
"use strict";

const API_CONFIG = {
  baseUrl: "https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com/prod",

  // ✅ Mantém compatibilidade: você pode deixar só 1 string OU usar array de fallback.
  // Se o seu backend mudar, você não quebra o front.
  endpoints: {
    requestPasswordReset: [
      "/request-password-reset",     // seu endpoint atual
      "/password/reset/request"      // fallback comum (caso você tenha padronizado)
    ],
  },

  timeoutMs: 12000,
  retries: 2,

  // secureMode = true: NÃO revela se o e-mail existe (retorna "sucesso" em 404 "conta não encontrada")
  secureMode: true,
};

const form = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("email");
const emailError = document.getElementById("emailError");
const submitBtn = document.getElementById("submitBtn");
const successMessage = document.getElementById("successMessage");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_THROTTLE_MS = 1500;
let lastSubmitTs = 0;

function isValidEmail(email) {
  return emailRegex.test(email);
}

function showError(el, message) {
  if (!el) return;
  el.textContent = message || "";
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
  submitBtn.disabled = !!loading;
  submitBtn.setAttribute("aria-busy", String(!!loading));
}

function lockForm(locked) {
  if (!form || !emailInput) return;
  form.setAttribute("aria-busy", String(!!locked));
  emailInput.readOnly = !!locked;
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

// ---------- Helpers de resposta ----------
function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function readJsonSafely(response) {
  try {
    const ct = (response.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return await response.json();
    const txt = await response.text();
    return safeJsonParse(txt) || {};
  } catch {
    return {};
  }
}

function isEndpointNotFound(status, data) {
  // ✅ Diferencia:
  // - "endpoint não encontrado" (config errada) => mostrar erro
  // - "conta não encontrada" (secureMode)       => tratar como sucesso
  if (status !== 404) return false;

  const msg = String(data?.message || data?.error || "").toLowerCase();
  const route = String(data?.route || "").toLowerCase();

  // padrões comuns do seu backend / API Gateway
  if (msg.includes("endpoint não encontrado")) return true;
  if (msg.includes("endpoint nao encontrado")) return true;
  if (msg.includes("not found") && msg.includes("endpoint")) return true;
  if (route && route.includes(":/")) return true; // exemplo: "POST:/"
  return false;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// ---------- Fetch com timeout + retry ----------
async function fetchWithResilience(url, options, { timeoutMs = 12000, retries = 2 } = {}) {
  let attempt = 0;
  const maxBackoff = 5000;

  while (true) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);

      // retry apenas para 5xx
      if (res.status >= 500 && attempt < retries) {
        const backoff = Math.min(1500 * 2 ** attempt, maxBackoff);
        await new Promise(r => setTimeout(r, backoff));
        attempt++;
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(id);

      const isAbort = err?.name === "AbortError";
      const isNetwork =
        err?.message &&
        (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"));

      if (attempt < retries && (isAbort || isNetwork)) {
        const backoff = Math.min(1500 * 2 ** attempt, maxBackoff);
        await new Promise(r => setTimeout(r, backoff));
        attempt++;
        continue;
      }

      throw err;
    }
  }
}

// ---------- Request reset (com fallback de endpoint) ----------
async function requestPasswordReset(email) {
  const endpoints = API_CONFIG.endpoints.requestPasswordReset;
  const candidates = Array.isArray(endpoints) ? endpoints : [endpoints];

  const payload = { email: normalizeEmail(email) };
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(payload),
  };

  let lastResult = null;

  for (let i = 0; i < candidates.length; i++) {
    const endpoint = candidates[i];
    const url = `${API_CONFIG.baseUrl}${endpoint}`;

    const response = await fetchWithResilience(url, options, {
      timeoutMs: API_CONFIG.timeoutMs,
      retries: API_CONFIG.retries,
    });

    const data = await readJsonSafely(response);

    // ✅ 200/2xx
    if (response.ok) {
      // alguns backends retornam ok/success false mesmo com 200
      const okFlag = (data?.ok ?? data?.success ?? true);
      if (okFlag === false) {
        return {
          success: false,
          error: data?.message || data?.error || "Não foi possível enviar as instruções.",
          status: response.status,
          data,
        };
      }
      return { success: true, data };
    }

    // ✅ 404: se for endpoint inexistente, tenta o próximo fallback
    if (response.status === 404 && isEndpointNotFound(response.status, data)) {
      lastResult = {
        success: false,
        error: "Endpoint de redefinição não encontrado. Verifique a rota da API.",
        status: 404,
        data,
      };
      continue; // tenta próximo endpoint
    }

    // ✅ secureMode: se 404 for “conta não encontrada”, não revela — considera sucesso
    if (response.status === 404 && API_CONFIG.secureMode) {
      return { success: true, data: { masked: true } };
    }

    // Outros erros: retorna
    return {
      success: false,
      error: data?.error || data?.message || mapErrorMessage(response.status) || "Erro desconhecido",
      status: response.status,
      data,
    };
  }

  // Se chegou aqui, todos endpoints falharam (ex.: endpoint errado)
  return lastResult || {
    success: false,
    error: "Falha ao enviar. Verifique a configuração do endpoint.",
    status: 0,
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

    const email = normalizeEmail(emailInput.value);
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

      // Se secureMode está true, mapErrorMessage(404) retorna null,
      // mas aqui a gente já separou "endpoint não encontrado" (mostra erro).
      const msg =
        result.error ||
        mapErrorMessage(result.status) ||
        "Erro ao enviar. Tente novamente.";

      showError(emailError, msg);
      emailInput.focus();
      console.warn("Forgot-password failed", result.status, result.error, result.data);
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
  console.warn("esqueciSenha.js: elementos do formulário não encontrados — listeners não foram registrados.");
}
