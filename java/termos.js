/* =========================================================================
   termos.js  —  Interações da página “Termos de Uso”
   - Rolagem suave para âncoras do sumário
   - Destaque do item ativo no sumário conforme a rolagem
   - Numeração automática dos títulos H2 (opcional)
   - Suporte a seções colapsáveis (data-collapsible)
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------------------- Seletores base --------------------------- */
  const SELECTORS = {
    toc: ".toc",
    tocLinks: ".toc a[href^='#']",
    headings: "h2[id]" // titulos com id (para ancoragem)
  };

  const SCROLL_OFFSET = 80;      // margem visual ao rolar até o título
  const ACTIVE_CLASS  = "is-active";

  /* ------------------------------- Utils -------------------------------- */
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $  = (sel, root = document) => root.querySelector(sel);

  function smoothScrollTo(targetY, duration = 400) {
    const startY = window.scrollY || window.pageYOffset;
    const distance = targetY - startY;
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

  function getTopWithOffset(el) {
    const rect = el.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    return rect.top + scrollTop - SCROLL_OFFSET;
  }

  /* --------------------- Numeração automática (opcional) ----------------- */
  function autoNumberH2() {
    const list = $$(SELECTORS.headings);
    list.forEach((h2, i) => {
      const n = i + 1;
      // evita duplicar numeração se já existir
      if (!h2.dataset.numbered) {
        h2.dataset.numbered = "true";
        const txt = h2.textContent.trim();
        h2.textContent = `${n}. ${txt}`;
      }
    });
  }

  /* ------------------------ Destaque no sumário -------------------------- */
  function buildActiveObserver() {
    const links = $$(SELECTORS.tocLinks);
    const map = new Map(); // id -> link
    links.forEach((a) => {
      const id = decodeURIComponent(a.getAttribute("href").slice(1));
      map.set(id, a);
    });

    // limpa estado
    function clearActive() {
      links.forEach((a) => a.classList.remove(ACTIVE_CLASS));
    }

    // usa IntersectionObserver para saber o título visível
    const headings = $$(SELECTORS.headings).filter((el) =>
      map.has(el.id)
    );

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              clearActive();
              const link = map.get(id);
              if (link) link.classList.add(ACTIVE_CLASS);
            }
          });
        },
        {
          root: null,
          rootMargin: `-${SCROLL_OFFSET + 5}px 0px -60% 0px`,
          threshold: 0
        }
      );
      headings.forEach((h) => io.observe(h));
    } else {
      // fallback: atualiza em scroll
      function onScrollFallback() {
        const top = window.scrollY + SCROLL_OFFSET + 1;
        let currentId = null;
        headings.forEach((h) => {
          if (h.offsetTop <= top) currentId = h.id;
        });
        clearActive();
        if (currentId && map.get(currentId)) {
          map.get(currentId).classList.add(ACTIVE_CLASS);
        }
      }
      window.addEventListener("scroll", onScrollFallback, { passive: true });
      onScrollFallback();
    }
  }

  /* ------------------------- Rolagem suave (TOC) ------------------------- */
  function enableSmoothAnchorScroll() {
    $$(SELECTORS.tocLinks).forEach((a) => {
      a.addEventListener("click", (e) => {
        const hash = a.getAttribute("href");
        if (!hash || !hash.startsWith("#")) return;
        const target = document.getElementById(decodeURIComponent(hash.slice(1)));
        if (!target) return;

        e.preventDefault();
        const y = getTopWithOffset(target);
        smoothScrollTo(y, 450);

        // opcional: atualizar hash sem “pulo”
        history.replaceState(null, "", hash);
      });
    });
  }

  /* --------------------- Seções colapsáveis (opcional) ------------------- */
  // Para qualquer bloco com data-collapsible, cria um toggle simples
  function wireCollapsibles() {
    const blocks = $$("[data-collapsible]");
    blocks.forEach((el) => {
      const header = $("h3, h4, summary", el) || el.firstElementChild;
      const body   = $(".collapsible-body", el) || header?.nextElementSibling;
      if (!header || !body) return;

      header.style.cursor = "pointer";
      body.style.display = el.dataset.open === "true" ? "block" : "none";

      header.addEventListener("click", () => {
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        el.dataset.open = String(!isOpen);
      });
    });
  }

  /* -------------------------------- Init -------------------------------- */
  function init() {
    autoNumberH2();
    enableSmoothAnchorScroll();
    buildActiveObserver();
    wireCollapsibles();
  }

  // DOM pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
