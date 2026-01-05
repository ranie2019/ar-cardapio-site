// ==============================
// index.js (ATUALIZADO / ROBUSTO)
// - Não quebra se modal não existir
// - Limpa a URL se vier poluída (?Nome=...)
// - Garante que o submit NUNCA vire querystring
// - Envio via POST (FormSubmit AJAX) com validação + fallback de erro
// ==============================

document.addEventListener("DOMContentLoaded", () => {
  // ======================
  // (0) LIMPAR URL (se veio com dados na querystring)
  // ======================
  (function cleanUrlQuery() {
    try {
      const u = new URL(window.location.href);

      // remove qualquer coisa que tenha vindo por GET antigo
      // (mantém outras params úteis, se você tiver, tipo utm_*)
      const removeKeys = [
        "Nome", "Email", "Telefone", "Setor", "Observações",
        "nome", "email", "telefone", "setor", "observacoes", "observações",
        "Setor da empresa", "Setor+da+empresa"
      ];

      let changed = false;
      for (const k of removeKeys) {
        if (u.searchParams.has(k)) {
          u.searchParams.delete(k);
          changed = true;
        }
      }

      // também limpa qualquer querystring inteira se você quiser ser mais agressivo:
      // (descomente se não usa UTM nem nada)
      // if (u.search) { u.search = ""; changed = true; }

      if (changed) {
        const newUrl = u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash;
        history.replaceState({}, document.title, newUrl);
      }
    } catch (_) {}
  })();

  // ======================
  // MODAL (com guards)
  // ======================
  const abrirModal = document.getElementById("abrirModal");
  const fecharModal = document.getElementById("fecharModal");
  const modal = document.getElementById("modal");

  const openModal = () => modal && modal.classList.remove("hidden");
  const closeModal = () => modal && modal.classList.add("hidden");

  if (abrirModal && modal) abrirModal.addEventListener("click", openModal);
  if (fecharModal && modal) fecharModal.addEventListener("click", closeModal);

  if (modal) {
    window.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  // ======================
  // FORM CONTATO
  // ======================
  const form = document.getElementById("form-contato");
  const mensagem = document.getElementById("mensagem-sucesso");

  // Se não existe form nessa página, sai sem quebrar o resto
  if (!form) return;

  // ✅ trava o "GET na URL" mesmo se o HTML estiver errado
  form.setAttribute("method", "post");
  form.setAttribute("action", "https://formsubmit.co/arcardapio@gmail.com");

  const ENDPOINT = "https://formsubmit.co/ajax/arcardapio@gmail.com";

  const submitBtn =
    form.querySelector('button[type="submit"]') ||
    form.querySelector('input[type="submit"]');

  function showSuccess() {
    if (!mensagem) return;
    mensagem.style.display = "block";
    setTimeout(() => (mensagem.style.display = "none"), 5000);
  }

  function setSending(isSending) {
    if (!submitBtn) return;
    submitBtn.disabled = !!isSending;
    if (submitBtn.tagName.toLowerCase() === "button") {
      submitBtn.dataset._txt = submitBtn.dataset._txt || submitBtn.textContent;
      submitBtn.textContent = isSending ? "Enviando..." : submitBtn.dataset._txt;
    }
  }

  function getFieldValue(nameOrId) {
    const el =
      form.querySelector(`[name="${nameOrId}"]`) ||
      document.getElementById(nameOrId);
    return (el && String(el.value || "").trim()) || "";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  // garante que esses hiddens existam (não quebra se já existem no HTML)
  function ensureHidden(name, value) {
    let input = form.querySelector(`input[name="${name}"]`);
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      form.appendChild(input);
    }
    input.value = value;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault(); // ✅ impede reload/URL com querystring

    // Honeypot (se tiver no HTML)
    const honey = form.querySelector('input[name="_honey"]');
    if (honey && honey.value.trim()) return;

    // Lê valores (compatível com seus names atuais e também com os antigos)
    const nome = getFieldValue("nome") || getFieldValue("Nome");
    const email = getFieldValue("email") || getFieldValue("Email");
    const telefone = getFieldValue("telefone") || getFieldValue("Telefone");
    const setor = getFieldValue("setor") || getFieldValue("Setor") || getFieldValue("Setor da empresa");
    const obs = getFieldValue("observacoes") || getFieldValue("Observações") || getFieldValue("observações");

    if (!nome || !email || !telefone) {
      alert("Preencha Nome, E-mail e Telefone.");
      return;
    }
    if (!isValidEmail(email)) {
      alert("E-mail inválido.");
      return;
    }

    // configura extras padrão (melhor entregabilidade e organização)
    ensureHidden("_subject", `Novo contato — ${nome}`);
    ensureHidden("_captcha", "false");
    ensureHidden("_template", "table");
    ensureHidden("_replyto", email); // pra você responder direto no cliente

    const formData = new FormData(form);

    // força campos padrão (sem duplicar se já existem)
    if (!formData.has("nome") && nome) formData.append("nome", nome);
    if (!formData.has("email") && email) formData.append("email", email);
    if (!formData.has("telefone") && telefone) formData.append("telefone", telefone);
    if (!formData.has("setor") && setor) formData.append("setor", setor);
    if (!formData.has("observacoes") && obs) formData.append("observacoes", obs);

    setSending(true);

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: formData,
      });

      const json = await response.json().catch(() => null);

      // FormSubmit costuma retornar {success:"true", message:"..."}
      const ok =
        response.ok &&
        json &&
        (json.success === true ||
          json.success === "true" ||
          /sent|success/i.test(json.message || ""));

      if (!ok) {
        console.error("[CONTATO] Falhou:", response.status, json);
        alert("Erro ao enviar o formulário. Verifique e tente novamente.");
        return;
      }

      form.reset();

      // limpa URL de novo por segurança (se algum navegador fez coisa estranha)
      try {
        const u = new URL(window.location.href);
        if (u.search) history.replaceState({}, document.title, u.pathname + u.hash);
      } catch (_) {}

      showSuccess();
    } catch (error) {
      console.error("[CONTATO] Erro de rede:", error);
      alert("Erro de rede. Verifique sua conexão.");
    } finally {
      setSending(false);
    }
  });
});
