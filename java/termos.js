/* =========================================================================
   termos.js — Interações da página “Termos de Uso” (robusto + clean)
   - Rolagem suave para âncoras do sumário (com offset)
   - Destaque do item ativo no sumário (scroll-spy estável)
   - Numeração automática dos H2 (sem duplicar e sem quebrar IDs)
   - Suporte a blocos colapsáveis (data-collapsible)
   - Suporte a hash inicial + voltar/avançar (hashchange)
   - Respeita prefers-reduced-motion
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------------------- Seletores base --------------------------- */
  const SELECTORS = {
    toc: ".toc",
    tocLinks: ".toc a[href^='#']",
    headings: "h2[id]"
  };

  const SCROLL_OFFSET = 80;
  const ACTIVE_CLASS = "is-active";

  /* ------------------------------- Utils -------------------------------- */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function safeDecode(str) {
    try {
      return decodeURIComponent(str);
    } catch {
      return str;
    }
  }

  function getIdFromHref(href) {
    const raw = safeDecode(String(href || ""));
    if (!raw.startsWith("#")) return "";
    return raw.slice(1).trim();
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function getTopWithOffset(el) {
    const rect = el.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    return rect.top + scrollTop - SCROLL_OFFSET;
  }

  function smoothScrollTo(targetY, duration = 450) {
    const startY = window.scrollY || window.pageYOffset || 0;
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const endY = clamp(targetY, 0, maxY);

    if (prefersReducedMotion || duration <= 0) {
      window.scrollTo(0, endY);
      return;
    }

    const distance = endY - startY;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      // easeInOutCubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      window.scrollTo(0, startY + distance * eased);
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function scrollToEl(el, { updateHash = true, smooth = true } = {}) {
    if (!el) return;
    const y = getTopWithOffset(el);

    if (updateHash && el.id) {
      // pushState mantém histórico (melhor do que replaceState em navegação)
      history.pushState(null, "", `#${encodeURIComponent(el.id)}`);
    }

    smoothScrollTo(y, smooth ? 450 : 0);
  }

  /* --------------------- Numeração automática (opcional) ----------------- */
  // Mantém IDs intactos e evita duplicar (usa dataset + span .h-num)
  function autoNumberH2() {
    const list = $$(SELECTORS.headings);
    if (!list.length) return;

    let n = 0;
    list.forEach((h2) => {
      n += 1;

      // evita duplicar
      if (h2.dataset.numbered) return;
      h2.dataset.numbered = "true";

      // injeta prefixo sem destruir HTML interno
      h2.innerHTML = `<span class="h-num">${n}.</span> ${h2.innerHTML}`;
    });
  }

  /* ------------------------ Destaque no sumário -------------------------- */
  function buildActiveObserver() {
    const links = $$(SELECTORS.tocLinks);
    if (!links.length) return;

    const map = new Map(); // id -> link
    links.forEach((a) => {
      const id = getIdFromHref(a.getAttribute("href"));
      if (id) map.set(id, a);
    });

    const headings = $$(SELECTORS.headings).filter((el) => map.has(el.id));
    if (!headings.length) return;

    let activeId = "";

    function clearActive() {
      links.forEach((a) => a.classList.remove(ACTIVE_CLASS));
    }

    function setActive(id) {
      if (!id || id === activeId) return;
      const link = map.get(id);
      if (!link) return;
      clearActive();
      link.classList.add(ACTIVE_CLASS);
      activeId = id;
    }

    // Scroll-spy estável: usa posição dos headings (mais previsível que IO “piscando”)
    function getCurrentSectionId() {
      const threshold = SCROLL_OFFSET + 6;
      let current = headings[0].id;

      for (const h of headings) {
        const top = h.getBoundingClientRect().top;
        if (top <= threshold) current = h.id;
        else break;
      }
      return current;
    }

    // rAF throttle
    let ticking = false;
    function update() {
      ticking = false;
      setActive(getCurrentSectionId());
    }
    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    // Atualiza em scroll/resize
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    // Inicial
    requestUpdate();

    return { requestUpdate, setActive };
  }

  /* ------------------------- Rolagem suave (TOC) ------------------------- */
  function enableSmoothAnchorScroll() {
    const links = $$(SELECTORS.tocLinks);
    if (!links.length) return;

    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        // respeita abrir em nova aba/janela
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        const id = getIdFromHref(a.getAttribute("href"));
        if (!id) return;

        const target = document.getElementById(id);
        if (!target) return;

        e.preventDefault();
        scrollToEl(target, { updateHash: true, smooth: true });
      });
    });
  }

  /* --------------------- Seções colapsáveis (opcional) ------------------- */
  // Para qualquer bloco com data-collapsible, cria um toggle simples
  function wireCollapsibles() {
    const blocks = $$("[data-collapsible]");
    if (!blocks.length) return;

    blocks.forEach((el) => {
      const header = $("h3, h4, summary", el) || el.firstElementChild;
      const body = $(".collapsible-body", el) || (header ? header.nextElementSibling : null);
      if (!header || !body) return;

      const isInitiallyOpen = String(el.dataset.open || "").toLowerCase() === "true";

      header.style.cursor = "pointer";
      body.style.display = isInitiallyOpen ? "block" : "none";
      el.dataset.open = String(isInitiallyOpen);

      header.addEventListener("click", () => {
        const isOpen = el.dataset.open === "true";
        body.style.display = isOpen ? "none" : "block";
        el.dataset.open = String(!isOpen);
      });
    });
  }

  /* ------------------- Hash inicial + voltar/avançar --------------------- */
  function handleInitialHash() {
    const id = getIdFromHref(location.hash);
    if (!id) return;

    const target = document.getElementById(id);
    if (!target) return;

    // espera layout/fonts
    requestAnimationFrame(() => {
      scrollToEl(target, { updateHash: false, smooth: false });
    });
  }

  function bindHashChange() {
    window.addEventListener("hashchange", () => {
      const id = getIdFromHref(location.hash);
      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      scrollToEl(target, { updateHash: false, smooth: true });
    });
  }

  /* -------------------------------- Init -------------------------------- */
  function init() {
    autoNumberH2();
    enableSmoothAnchorScroll();
    buildActiveObserver();
    wireCollapsibles();
    bindHashChange();
    handleInitialHash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
