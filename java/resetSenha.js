// resetSenha.js — COMPLETO / ATUALIZADO (ARCardápio)
// ✅ URL correta: https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com/prod/reset-password (POST)
// ✅ Sem placeholder
// ✅ Debug claro no console (pra provar que carregou o arquivo novo)
// ✅ Timeout + retry leve
// ✅ Mostra erro real retornado pela API
// ✅ Mantém seus IDs: newPassword, confirmPassword, showPassword, resetBtn, message

"use strict";

/* =========================
   BUILD (pra você ver no console se está carregando o arquivo novo)
   ========================= */
const BUILD_ID = "resetSenha.js@2026-01-06_v1";

/* =========================
   CONFIG (CERTA)
   ========================= */
const API_HOST = "https://1u3m3f6x1m.execute-api.us-east-1.amazonaws.com";
const API_STAGE = "prod";
const RESET_PATH = "/reset-password"; // POST

const TIMEOUT_MS = 12000;
const RETRIES = 2;

// Se sua Lambda exige 8, deixa 8. Se aceitar 6, pode mudar.
const MIN_PASSWORD_LEN = 6;

/* =========================
   DOM
   ========================= */
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const showPasswordCheckbox = document.getElementById("showPassword");
const resetBtn = document.getElementById("resetBtn");
const messageDiv = document.getElementById("message");

// spans do botão (do seu HTML)
const btnText = resetBtn ? resetBtn.querySelector(".btn-text") : null;
const btnLoading = resetBtn ? resetBtn.querySelector(".btn-loading") : null;

/* =========================
   URL PARAMS
   ========================= */
const urlParams = new URLSearchParams(window.location.search);
const tokenFromUrl = (urlParams.get("token") || "").trim();
const emailFromUrl = (urlParams.get("email") || "").trim().toLowerCase();

/* =========================
   HELPERS
   ========================= */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return emailRegex.test(String(email || ""));
}

function showMessage(msg, isError = false) {
  if (!messageDiv) return;
  messageDiv.textContent = msg || "";
  messageDiv.className = isError ? "error" : "success";
}

function setLoading(loading) {
  if (!resetBtn) return;

  resetBtn.disabled = !!loading;
  resetBtn.setAttribute("aria-busy", String(!!loading));

  if (btnText && btnLoading) {
    btnText.hidden = !!loading;
    btnLoading.hidden = !loading;
  }
}

function lockInputs(locked) {
  if (newPasswordInput) newPasswordInput.readOnly = !!locked;
  if (confirmPasswordInput) confirmPasswordInput.readOnly = !!locked;
  if (showPasswordCheckbox) showPasswordCheckbox.disabled = !!locked;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readJsonSafe(res) {
  try {
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json")) return await res.json();
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch {
      return { message: txt };
    }
  } catch {
    return {};
  }
}

function buildResetUrl() {
  // Garante que fica exatamente: https://.../prod/reset-password
  return `${API_HOST}/${API_STAGE}${RESET_PATH}`;
}

function mapHumanError(status, data) {
  // se a API já mandou msg, usa ela
  const apiMsg = data?.error || data?.message;
  if (apiMsg) return String(apiMsg);

  if (status === 400) return "Dados inválidos. Confira o link e a senha.";
  if (status === 401 || status === 403) return "Link inválido ou expirado. Gere um novo.";
  if (status === 404) return "Rota da API não encontrada (rota ou deploy do API Gateway).";
  if (status === 409) return "Este link já foi usado. Gere outro link.";
  if (status === 429) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (status >= 500) return "Servidor instável no momento. Tente novamente em instantes.";
  return `Erro (${status}). Tente novamente.`;
}

async function fetchWithRetry(url, options, timeoutMs, retries) {
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timer);

      // retry só em 5xx
      if (res.status >= 500 && attempt < retries) {
        await sleep(Math.min(1500 * 2 ** attempt, 5000));
        attempt++;
        continue;
      }

      return res;
    } catch (err) {
      clearTimeout(timer);

      const msg = String(err?.message || "");
      const isAbort = err?.name === "AbortError";
      const isNetwork =
        msg.includes("Failed to fetch") ||
        msg.includes("NetworkError") ||
        msg.includes("ERR_NAME_NOT_RESOLVED");

      if (attempt < retries && (isAbort || isNetwork)) {
        await sleep(Math.min(1500 * 2 ** attempt, 5000));
        attempt++;
        continue;
      }

      throw err;
    }
  }
}

/* =========================
   API CALL
   ========================= */
async function confirmPasswordReset(email, token, newPassword) {
  const url = buildResetUrl();

  // PROVA que o arquivo novo carregou + qual URL ele está chamando
  console.log(`[${BUILD_ID}] POST =>`, url);

  const payload = {
    email: String(email || "").trim().toLowerCase(),
    token: String(token || "").trim(),
    newPassword: String(newPassword || ""),
  };

  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    TIMEOUT_MS,
    RETRIES
  );

  const data = await readJsonSafe(res);

  if (!res.ok) {
    return { ok: false, status: res.status, data, error: mapHumanError(res.status, data) };
  }

  // aceita vários formatos
  const okFlag = data?.ok ?? data?.success ?? true;
  if (okFlag === false) {
    return {
      ok: false,
      status: res.status,
      data,
      error: String(data?.message || data?.error || "Não foi possível redefinir."),
    };
  }

  return { ok: true, status: res.status, data };
}

/* =========================
   SHOW/HIDE PASSWORD
   ========================= */
if (showPasswordCheckbox && newPasswordInput && confirmPasswordInput) {
  showPasswordCheckbox.addEventListener("change", () => {
    const type = showPasswordCheckbox.checked ? "text" : "password";
    newPasswordInput.type = type;
    confirmPasswordInput.type = type;
  });
}

/* =========================
   GUARD INICIAL
   ========================= */
(function initialGuard() {
  console.log(`[${BUILD_ID}] carregado ✅`);

  if (!resetBtn || !messageDiv || !newPasswordInput || !confirmPasswordInput) {
    console.warn(`[${BUILD_ID}] elementos do formulário não encontrados.`);
    return;
  }

  if (!tokenFromUrl || !emailFromUrl) {
    showMessage("Link inválido (faltando token ou e-mail). Gere um novo link.", true);
    setLoading(false);
    resetBtn.disabled = true;
    lockInputs(true);
    return;
  }

  if (!isValidEmail(emailFromUrl)) {
    showMessage("Link inválido (e-mail inválido). Gere um novo link.", true);
    setLoading(false);
    resetBtn.disabled = true;
    lockInputs(true);
    return;
  }
})();

/* =========================
   CLICK HANDLER
   ========================= */
if (resetBtn) {
  resetBtn.addEventListener("click", async () => {
    if (!tokenFromUrl || !emailFromUrl || !isValidEmail(emailFromUrl)) {
      showMessage("Link inválido. Gere um novo link de redefinição.", true);
      return;
    }

    const newPassword = String(newPasswordInput?.value || "").trim();
    const confirmPassword = String(confirmPasswordInput?.value || "").trim();

    if (!newPassword || !confirmPassword) {
      showMessage("Preencha os dois campos de senha.", true);
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("As senhas não coincidem.", true);
      return;
    }

    if (newPassword.length < MIN_PASSWORD_LEN) {
      showMessage(`A senha deve ter pelo menos ${MIN_PASSWORD_LEN} caracteres.`, true);
      return;
    }

    setLoading(true);
    lockInputs(true);
    showMessage("Redefinindo sua senha...");

    try {
      const result = await confirmPasswordReset(emailFromUrl, tokenFromUrl, newPassword);

      if (result.ok) {
        showMessage("Senha redefinida com sucesso! Indo para o login...");
        setTimeout(() => {
          window.location.href = "login.html";
        }, 1200);
        return;
      }

      showMessage(result.error || "Erro ao redefinir.", true);
      console.warn(`[${BUILD_ID}] RESET FAIL:`, result.status, result.data);

      setLoading(false);
      lockInputs(false);
    } catch (err) {
      console.error(`[${BUILD_ID}] FETCH FAIL:`, err);
      showMessage(
        "Falha de conexão com a API. (normalmente é cache com JS antigo ou API Gateway não implantado)",
        true
      );
      setLoading(false);
      lockInputs(false);
    }
  });
}
