// privacidade.js — navegação da Política de Privacidade (clean + robusto)
// - Scroll suave com offset
// - Destaque do item ativo no sumário (scroll-spy estável)
// - Numeração automática dos H2 (sem duplicar)
// - Suporte a hash inicial + voltar/avançar (hashchange)
// - Respeita "prefers-reduced-motion"

(function () {
  const SELECTORS = {
    toc: ".toc",
    toclinks: '.toc a[href^="#"]',
    headings: "h2[id]",
  };

  const SCROLL_OFFSET = 80;
  const ACTIVE_CLASS = "is-active";

  // ---------- utils ----------
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
    const y = el.getBoundingClientRect().top + (window.pageYOffset || 0) - SCROLL_OFFSET;
    if (updateHash && el.id) history.pushState(null, "", `#${encodeURIComponent(el.id)}`);
    smoothScrollTo(y, smooth ? 450 : 0);
  }

  // ---------- Numerar subtítulos automaticamente ----------
  function numberHeadings(headings) {
    let n = 0;

    headings.forEach((h) => {
      n += 1;

      // garante id (mas não troca se já existir)
      if (!h.id) {
        const slug =
          (h.textContent || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w]+/g, "-")
            .replace(/^-+|-+$/g, "") || `secao-${n}`;
        h.id = slug;
      }

      // prefixo visual 1., 2., 3. ...
      if (!h.dataset.numbered) {
        h.dataset.numbered = "1";
        // evita quebrar conteúdo interno já existente
        h.innerHTML = `<span class="h-num">${n}.</span> ${h.innerHTML}`;
      }
    });
  }

  // ---------- TOC: rolagem suave ----------
  function bindTocSmoothScroll(links) {
    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        // deixa abrir em nova aba/janela normalmente
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

        const id = getIdFromHref(a.getAttribute("href"));
        if (!id) return;

        const el = document.getElementById(id);
        if (!el) return;

        e.preventDefault();
        scrollToEl(el, { updateHash: true, smooth: true });
      });
    });
  }

  // ---------- Ativar item do sumário conforme seção visível (scroll-spy) ----------
  function setupActiveState(links, headings) {
    const linksById = new Map();
    links.forEach((a) => {
      const id = getIdFromHref(a.getAttribute("href"));
      if (id) linksById.set(id, a);
    });

    let activeId = "";

    function setActive(id) {
      if (!id || id === activeId) return;
      const link = linksById.get(id);
      if (!link) return;

      links.forEach((x) => x.classList.remove(ACTIVE_CLASS));
      link.classList.add(ACTIVE_CLASS);
      activeId = id;
    }

    function getCurrentSectionId() {
      // pega o último heading cujo topo já passou do offset
      let current = headings[0] ? headings[0].id : "";
      const threshold = SCROLL_OFFSET + 6;

      for (const h of headings) {
        const top = h.getBoundingClientRect().top;
        if (top <= threshold) current = h.id;
        else break;
      }
      return current;
    }

    // throttle por rAF (evita rodar 200x por segundo)
    let ticking = false;
    function update() {
      ticking = false;
      const id = getCurrentSectionId();
      if (id) setActive(id);
    }
    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    // também atualiza quando o hash muda (voltar/avançar)
    window.addEventListener("hashchange", () => {
      const id = getIdFromHref(location.hash);
      const el = id ? document.getElementById(id) : null;
      if (el) scrollToEl(el, { updateHash: false, smooth: true });
      requestUpdate();
    });

    // primeira ativação
    requestUpdate();

    return { setActive, requestUpdate };
  }

  // ---------- Hash inicial: aplica offset ao carregar ----------
  function handleInitialHash() {
    const id = getIdFromHref(location.hash);
    if (!id) return;

    const el = document.getElementById(id);
    if (!el) return;

    // espera layout (fonts etc.) antes de rolar
    requestAnimationFrame(() => {
      scrollToEl(el, { updateHash: false, smooth: false });
    });
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    const tocLinks = $$(SELECTORS.toclinks);
    const headings = $$(SELECTORS.headings);

    // se não tiver headings/TOC, sai sem erro
    if (headings.length) numberHeadings(headings);
    if (tocLinks.length) bindTocSmoothScroll(tocLinks);
    if (tocLinks.length && headings.length) setupActiveState(tocLinks, headings);

    handleInitialHash();
  });
})();
