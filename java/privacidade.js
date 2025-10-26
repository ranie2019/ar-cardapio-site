// privacidade.js – navegação da Política de Privacidade (clean)

// IIFE para não vazar variáveis globais
(function () {
  const SELECTORS = {
    toc: ".toc",
    toclinks: '.toc a[href^="#"]',
    headings: 'h2[id]', // cria âncoras nos subtítulos numerados
  };

  const SCROLL_OFFSET = 80; // margem visual ao rolar para um título
  const ACTIVE_CLASS = "is-active";

  // ---------- utils ----------
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $ = (sel, root = document) => root.querySelector(sel);

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

  // ---------- TOC: rolagem suave ----------
  function bindTocSmoothScroll() {
    $$(SELECTORS.toclinks).forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const id = decodeURIComponent(a.getAttribute("href") || "").replace("#", "");
        const el = document.getElementById(id);
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.pageYOffset - SCROLL_OFFSET;
        history.pushState(null, "", `#${id}`);
        smoothScrollTo(y, 450);
      });
    });
  }

  // ---------- Ativar item do sumário conforme a seção visível ----------
  function observeHeadingsActiveState() {
    const linksById = new Map();
    $$(SELECTORS.toclinks).forEach((a) => {
      const id = decodeURIComponent(a.getAttribute("href") || "").replace("#", "");
      if (id) linksById.set(id, a);
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id;
          const link = linksById.get(id);
          if (!link) return;
          if (entry.isIntersecting) {
            // remove e adiciona classe ativa
            $$(SELECTORS.toclinks).forEach((x) => x.classList.remove(ACTIVE_CLASS));
            link.classList.add(ACTIVE_CLASS);
          }
        });
      },
      {
        rootMargin: `-${SCROLL_OFFSET + 10}px 0px -70% 0px`,
        threshold: [0, 1.0],
      }
    );

    $$(SELECTORS.headings).forEach((h) => io.observe(h));
  }

  // ---------- Numerar subtítulos automaticamente (opcional) ----------
  function numberHeadings() {
    let n = 0;
    $$(SELECTORS.headings).forEach((h) => {
      n += 1;
      if (!h.id) {
        // cria id previsível
        const slug =
          (h.textContent || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^\w]+/g, "-")
            .replace(/^-+|-+$/g, "") || `secao-${n}`;
        h.id = slug;
      }
      // prefixo visual 1., 2., 3. …
      if (!h.dataset.numbered) {
        h.dataset.numbered = "1";
        h.innerHTML = `<span class="h-num">${n}.</span> ${h.innerHTML}`;
      }
    });
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", () => {
    numberHeadings();
    bindTocSmoothScroll();
    observeHeadingsActiveState();
  });
})();
