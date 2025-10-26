/* metricaapp.js — ARCardapio (métricas de uso no app do cliente final)
   - Envio em lote via sendBeacon/fetch(keepalive)
   - Buffer + persistência offline (localStorage)
   - Sessão, visibilidade, heartbeats
   - Tempo por ITEM (view time)
   - Clique no INFO + tempo aberto do painel
   - Dwell por CATEGORIA
   - Recorrência (cliente que volta a escanear)
   - Auto-bind sem alterar UI
*/

(function (global) {
  const M = {};
  const DEFAULTS = {
    endpoint: '/collectMetrics',
    flushIntervalMs: 15000,
    maxBufferSize: 25,
    persistKey: 'arcardapio_metrics_v2',
    env: 'prod',
    sampleRate: 1.0,
    anonymizeIp: true
  };

  // ----------- STATE -----------
  let config = { ...DEFAULTS };
  let buffer = [];
  let flushTimer = null;

  const session = {
    id: rid('s_'),
    startedAt: iso(),
    lastActivityAt: iso(),
    eventsCount: 0
  };

  // Controle de tempos
  let visibleSince = performance.now();
  let currentItem = null;           // { id, name, category, price }
  let currentItemStart = null;      // performance.now()

  let currentCategory = null;       // string
  let currentCategoryStart = null;  // performance.now()

  // Painel de Info
  let infoOpenSince = null;         // performance.now()
  let infoWasOpen = false;

  // Recorrência
  let recurrenceData = null;

  // ----------- UTILS -----------
  function iso(d = new Date()) { return d.toISOString(); }
  function rid(prefix = '') { return prefix + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36); }
  function safeJSON(x) { try { return JSON.stringify(x); } catch { return '{}'; } }
  function nowMs() { return performance.now(); }

  function uaInfo() {
    return {
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || null,
      language: navigator.language || null,
      screen: { w: (screen || {}).width, h: (screen || {}).height },
      viewport: { w: innerWidth || 0, h: innerHeight || 0 },
      net: (navigator && navigator.connection) ? {
        downlink: navigator.connection.downlink,
        effectiveType: navigator.connection.effectiveType,
        rtt: navigator.connection.rtt
      } : null
    };
  }

  // ----------- BUFFER -----------
  function pushEvent(ev) {
    if (Math.random() > config.sampleRate) return;
    buffer.push(ev);
    session.eventsCount++;
    persist();
    if (buffer.length >= config.maxBufferSize) flush('size_limit');
    else if (!flushTimer) flushTimer = setTimeout(() => flush('timer'), config.flushIntervalMs);
  }

  function persist() {
    try {
      localStorage.setItem(config.persistKey, safeJSON({ session, buffer, savedAt: iso() }));
    } catch (_) {}
  }

  function restore() {
    try {
      const raw = localStorage.getItem(config.persistKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.buffer)) {
        buffer = parsed.buffer.concat(buffer);
      }
    } catch (_) {}
  }

  function flush(reason = 'manual') {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!buffer.length) return;

    const payload = {
      batchId: rid('batch_'),
      session,
      reason,
      env: config.env,
      tenant: config.tenant || null,
      meta: {
        url: location.href,
        referrer: document.referrer || null,
        timestamp: iso()
      },
      events: buffer.slice()
    };

    const body = safeJSON(payload);

    // try sendBeacon
    let sent = false;
    try {
      if (navigator.sendBeacon) {
        sent = navigator.sendBeacon(config.endpoint, new Blob([body], { type: 'application/json' }));
      }
    } catch (_) { sent = false; }

    if (!sent) {
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
        mode: 'cors'
      }).then(r => {
        if (r.ok) { buffer = []; persist(); }
      }).catch(() => { /* mantém buffer para retry */ });
    } else {
      buffer = []; persist();
    }
  }

  function ev(name, payload = {}) {
    return {
      id: rid('e_'),
      name,
      timestamp: iso(),
      sessionId: session.id,
      tenant: config.tenant || null,
      table: config.table || null,
      qrId: config.qrId || null,
      ua: uaInfo(),
      payload
    };
  }

  // ----------- RECORRÊNCIA -----------
  function loadRecurrence() {
    const key = rcKey();
    let data = null;
    try { data = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    if (!data) {
      data = {
        clientId: rid('c_'),
        firstScanAt: iso(),
        lastScanAt: null,
        scansTotal: 0,
        byQr: {} // qrId => count
      };
    }
    // atualizar com este scan
    data.scansTotal += 1;
    const qr = config.qrId || '_unknown';
    data.byQr[qr] = (data.byQr[qr] || 0) + 1;
    const prevLast = data.lastScanAt ? new Date(data.lastScanAt) : null;
    data.lastScanAt = iso();
    localStorage.setItem(key, JSON.stringify(data));

    return {
      clientId: data.clientId,
      firstScanAt: data.firstScanAt,
      lastScanAt: data.lastScanAt,
      scansTotal: data.scansTotal,
      scansByQr: data.byQr[qr],
      isReturning: data.scansTotal > 1,
      daysSinceLastScan: prevLast ? Math.floor((Date.now() - prevLast.getTime()) / 86400000) : null
    };
  }
  function rcKey() {
    // Recorrência por TENANT (não cruza restaurantes diferentes)
    const t = (config.tenant || 'global').toLowerCase();
    return `arcardapio_rec_${t}`;
  }

  // ----------- ITEM VIEW TIME -----------
  function startItemTimer(item) {
    stopItemTimer('item_change'); // fecha anterior, se houver
    currentItem = item ? { ...item } : null;
    if (currentItem) currentItemStart = nowMs();
    if (currentItem) {
      pushEvent(ev('item_view_start', { item: currentItem }));
    }
  }

  function stopItemTimer(reason = 'stop') {
    if (currentItem && currentItemStart != null) {
      const durMs = Math.max(0, Math.round(nowMs() - currentItemStart));
      pushEvent(ev('item_view_end', { item: currentItem, durationMs: durMs, reason }));
    }
    currentItem = null;
    currentItemStart = null;
  }

  // ----------- CATEGORY DWELL -----------
  function startCategory(cat) {
    endCategory('category_change');
    currentCategory = cat || null;
    if (currentCategory) currentCategoryStart = nowMs();
  }
  function endCategory(reason = 'stop') {
    if (currentCategory && currentCategoryStart != null) {
      const durMs = Math.max(0, Math.round(nowMs() - currentCategoryStart));
      pushEvent(ev('category_dwell', { category: currentCategory, durationMs: durMs, reason }));
    }
    currentCategory = null;
    currentCategoryStart = null;
  }

  // ----------- INFO PANEL TIME -----------
  function infoOpened() {
    if (!infoWasOpen) {
      infoWasOpen = true;
      infoOpenSince = nowMs();
      pushEvent(ev('info_open'));
    }
  }
  function infoClosed() {
    if (infoWasOpen && infoOpenSince != null) {
      const durMs = Math.max(0, Math.round(nowMs() - infoOpenSince));
      infoWasOpen = false;
      infoOpenSince = null;
      pushEvent(ev('info_close', { durationMs: durMs }));
    }
  }

  // ----------- AUTOBIND / OBSERVERS -----------
  function bindUI() {
    // Botão de menu
    const menuBtn = document.getElementById('menuBtn');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => pushEvent(ev('menu_click')), { passive: true });
    }

    // Botões de categoria + dwell
    document.querySelectorAll('#categoryButtons .category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const label = (btn.textContent || '').trim();
        pushEvent(ev('category_click', { text: label }));
        startCategory(label);
      }, { passive: true });
    });

    // Navegação de modelos
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    if (prevBtn) prevBtn.addEventListener('click', () => pushEvent(ev('nav_prev')), { passive: true });
    if (nextBtn) nextBtn.addEventListener('click', () => pushEvent(ev('nav_next')), { passive: true });

    // Info BTN
    const infoBtn = document.getElementById('infoBtn');
    if (infoBtn) {
      infoBtn.addEventListener('click', () => {
        pushEvent(ev('info_click'));
        // A abertura/fechamento real do painel é observado abaixo
      }, { passive: true });
    }

    // Observa o painel de info abrir/fechar (mudança de style.display)
    const infoPanel = document.getElementById('infoPanel');
    if (infoPanel) {
      const obs = new MutationObserver(() => {
        const display = (infoPanel.style && infoPanel.style.display) || '';
        if (display && display.toLowerCase() !== 'none') infoOpened();
        else infoClosed();
      });
      obs.observe(infoPanel, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    // Observa mudanças no nome do produto para inferir troca de item (fallback)
    // -> Caso você chame setCurrentItem no app.js, este fallback será secundário.
    const nameEl = document.getElementById('productNameDisplay');
    if (nameEl) {
      let lastName = (nameEl.textContent || '').trim();
      const itemObs = new MutationObserver(() => {
        const newName = (nameEl.textContent || '').trim();
        if (newName && newName !== lastName) {
          // iniciamos um novo item pelo nome (id/categoria ficam nulos se não houver setCurrentItem)
          startItemTimer({ id: null, name: newName, category: null, price: null });
          lastName = newName;
        }
      });
      itemObs.observe(nameEl, { childList: true, subtree: true, characterData: true });
    }

    // Modelo carregado/erro
    const modelEl = document.getElementById('modelContainer');
    if (modelEl) {
      modelEl.addEventListener('model-loaded', () => pushEvent(ev('model_loaded')), { passive: true });
      modelEl.addEventListener('model-error', (e) => pushEvent(ev('model_error', { detail: String(e && e.detail) })), { passive: true });
    }
  }

  function bindSessionLifecycle() {
    // Abertura da página
    pushEvent(ev('page_open', {
      startUrl: location.href,
      referrer: document.referrer || null,
      initSource: config.initSource || 'app_html'
    }));

    // Status do visitante / recorrência
    recurrenceData = loadRecurrence();
    pushEvent(ev('visitor_status', { ...recurrenceData }));

    // Visibilidade
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        const visibleMs = Math.max(0, Math.round(nowMs() - visibleSince));
        pushEvent(ev('page_hidden', { visibleMs }));
        // Fechar tempos abertos
        stopItemTimer('page_hidden');
        endCategory('page_hidden');
        infoClosed();
      } else {
        visibleSince = nowMs();
        pushEvent(ev('page_visible'));
      }
    });

    // Interação básica
    const act = () => { session.lastActivityAt = iso(); pushEvent(ev('activity', { type: 'interaction' })); };
    ['click', 'touchstart', 'keydown'].forEach(evt => window.addEventListener(evt, act, { passive: true }));

    // Unload: fechar tempos e flush
    window.addEventListener('beforeunload', () => {
      const visibleMs = Math.max(0, Math.round(nowMs() - visibleSince));
      pushEvent(ev('page_unload', { visibleMs }));
      stopItemTimer('unload');
      endCategory('unload');
      infoClosed();
      flush('unload');
    });

    // Heartbeat
    setInterval(() => { pushEvent(ev('heartbeat')); }, 30000);
  }

  // ----------- PUBLIC API -----------
  M.init = function (userConfig = {}) {
    config = { ...DEFAULTS, ...(userConfig || {}) };
    restore();
    bindUI();
    bindSessionLifecycle();
    pushEvent(ev('metrics_initialized', { config }));
    return M;
  };

  M.flush = function () { flush('manual_flush'); };

  // Precisão máxima de tempo por item:
  // Chame isso no SEU app.js assim que trocar o item/modelo.
  // Ex.: MetricaApp.setCurrentItem({ id, name, category, price })
  M.setCurrentItem = function (item) {
    startItemTimer(item);
  };

  // Eventos customizáveis já existentes:
  M.trackItemView = function (item) { pushEvent(ev('item_view', { item })); };
  M.trackAddToCart = function (item, qty = 1) { pushEvent(ev('add_to_cart', { item, qty })); };
  M.trackRemoveFromCart = function (item, qty = 1) { pushEvent(ev('remove_from_cart', { item, qty })); };
  M.trackCheckout = function (order) { pushEvent(ev('checkout', { order })); };
  M.trackEvent = function (name, payload = {}) { pushEvent(ev(name, payload)); };

  // Bind básico de cliques com data-metric
  M.autoBind = function () {
    document.addEventListener('click', (e) => {
      let el = e.target;
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.metric) {
          try {
            const meta = JSON.parse(el.dataset.metric);
            M.trackEvent(meta.event || 'ui_click', { meta });
          } catch (_) {
            M.trackEvent('ui_click', { text: el.innerText ? el.innerText.slice(0, 200) : null });
          }
          break;
        }
        el = el.parentElement;
      }
    }, { passive: true });
  };

  M._getState = function () {
    return {
      config,
      session,
      buffer: buffer.slice(0, 50),
      currentItem,
      currentCategory,
      infoWasOpen
    };
  };

  // Auto-init se __AR_METRICA_INIT já existir ao carregar
  window.addEventListener('load', () => {
    if (window.__AR_METRICA_INIT && typeof window.__AR_METRICA_INIT === 'object') {
      try { M.init(window.__AR_METRICA_INIT); } catch (e) { /* noop */ }
    }
  });

  global.MetricaApp = M;
})(window);
