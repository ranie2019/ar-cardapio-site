/* ==========================================================
   metricas.js 
   ========================================================== */

(function () {
  // ==================== CONFIGURAÇÃO ====================
  const USE_MOCK = true; // Altere para false quando tiver API real
  const API_BASE = "https://SEU_API_GATEWAY/dev/metricasCliente";

  // Referências de elementos do DOM
  const elements = {
    // Filtros
    periodFilter: document.getElementById("periodFilter"),
    customDateRange: document.getElementById("customDateRange"),
    startDate: document.getElementById("startDate"),
    endDate: document.getElementById("endDate"),
    applyCustomDate: document.getElementById("applyCustomDate"),
    mesaFilter: document.getElementById("mesaFilter"),
    aggregationFilter: document.getElementById("aggregationFilter"),
    applyFilters: document.getElementById("applyFilters"),

    // KPIs
    kpiTotalScans: document.getElementById("kpiTotalScans"),
    kpiSessionsUnique: document.getElementById("kpiSessionsUnique"),
    kpiAvgTimeMenu: document.getElementById("kpiAvgTimeMenu"),
    kpiAvgTimeAR: document.getElementById("kpiAvgTimeAR"),
    kpiInfoOpens: document.getElementById("kpiInfoOpens"),
    kpiInfoAvgTime: document.getElementById("kpiInfoAvgTime"),

    // Tabelas
    tableScansPerMesa: document.getElementById("tableScansPerMesa"),
    tableSessions: document.getElementById("tableSessions"),
    tableAvgTimeMenu: document.getElementById("tableAvgTimeMenu"),
    tablePeakHours: document.getElementById("tablePeakHours"),
    tableInfoUsage: document.getElementById("tableInfoUsage"),
    tableModels: document.getElementById("tableModels"),

    // Gráficos
    chartScansOverall: document.getElementById("chartScansOverall"),
    chartSessions: document.getElementById("chartSessions"),
    chartAvgTimeMenu: document.getElementById("chartAvgTimeMenu"),
    chartPeakHours: document.getElementById("chartPeakHours"),
    chartInfoUsage: document.getElementById("chartInfoUsage"),
    chartTopModels: document.getElementById("chartTopModels"),

    // Insights
    insightsList: document.getElementById("insightsList"),
  };

  // Variáveis globais para armazenar gráficos
  let charts = {
    scansOverall: null,
    sessions: null,
    avgTimeMenu: null,
    peakHours: null,
    infoUsage: null,
    topModels: null,
  };

  // ==================== UTILITÁRIOS ====================

  /**
   * Formata um número para formato legível
   */
  function formatNumber(num) {
    return (num || 0).toLocaleString("pt-BR");
  }

  /**
   * Formata segundos em formato MM:SS
   */
  function formatDurationMMSS(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  /**
   * Formata segundos em formato HH:MM
   */
  function formatDurationHHMM(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  /**
   * Gera datas mock para os últimos N dias
   */
  function generateMockDates(days = 14) {
    const dates = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date.toISOString().split("T")[0]);
    }
    return dates;
  }

  /**
   * Gera uma série de números aleatórios para mock
   */
  function generateMockSeries(dates, baseValue = 50, variance = 25) {
    return dates.map(() =>
      Math.max(0, Math.round(baseValue + (Math.random() - 0.5) * variance * 2))
    );
  }

  /**
   * Carrega Chart.js dinamicamente
   */
  function loadChartJs() {
    return new Promise((resolve, reject) => {
      if (window.Chart) return resolve();
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Falha ao carregar Chart.js"));
      document.head.appendChild(script);
    });
  }

  // ==================== DADOS MOCK ====================

  /**
   * Constrói um conjunto completo de dados mock
   */
  function buildMockData() {
    const dates = generateMockDates(14);
    const mesas = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5"];
    const scansGeral = generateMockSeries(dates, 40, 20);

    // Scans por mesa
    const scansPorMesa = mesas.map((mesa) => ({
      mesa,
      total: Math.round(40 + Math.random() * 120),
      lastScan: dates[Math.floor(Math.random() * dates.length)],
      series: generateMockSeries(dates, 10 + Math.random() * 30, 10),
    }));

    // Sessões
    const sessoes = dates.map((d) => ({
      periodo: d,
      sessoes: Math.round(20 + Math.random() * 100),
      unicos: Math.round(10 + Math.random() * 70),
    }));

    // Tempo médio no cardápio
    const tempoMenu = dates.map((d) => ({
      periodo: d,
      mediaSec: Math.round(60 + Math.random() * 180),
      medianaSec: Math.round(50 + Math.random() * 150),
      amostras: Math.round(30 + Math.random() * 130),
    }));

    // Horário de pico
    const picos = [];
    for (let hora = 10; hora <= 23; hora++) {
      picos.push({
        mes: "10",
        diaSemana: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"][
          Math.floor(Math.random() * 7)
        ],
        hora,
        scans: Math.round(Math.max(0, (hora - 9) * (Math.random() * 6))),
      });
    }

    // Uso do botão Info
    const infoUso = {
      aberturas: dates.map((d) => ({
        periodo: d,
        count: Math.round(Math.random() * 60),
      })),
      tempoTotalSec: Math.round(3000 + Math.random() * 6000),
      tempoMedioSec: Math.round(40 + Math.random() * 100),
    };

    // Modelos em AR
    const modelos = Array.from({ length: 12 }).map((_, i) => ({
      item: `Produto ${i + 1}`,
      views: Math.round(20 + Math.random() * 200),
      arEntradas: Math.round(5 + Math.random() * 100),
      conversao: Math.round(Math.random() * 100),
      tempoARSec: Math.round(30 + Math.random() * 120),
    }));
    modelos.sort((a, b) => b.arEntradas - a.arEntradas);

    // KPIs
    const kpis = {
      totalScans: scansGeral.reduce((a, b) => a + b, 0),
      sessoesUnicas: sessoes.reduce((a, b) => a + b.unicos, 0),
      tempoMedioMenuSec:
        tempoMenu.reduce((a, b) => a + b.mediaSec, 0) /
        Math.max(1, tempoMenu.length),
      tempoMedioARSec:
        modelos.reduce((a, b) => a + b.tempoARSec, 0) /
        Math.max(1, modelos.length),
      infoAberturas: infoUso.aberturas.reduce((a, b) => a + b.count, 0),
      infoTempoMedioSec: infoUso.tempoMedioSec,
    };

    // Insights
    const insights = [
      "Quarta-feira entre 19h-21h tem o maior pico de acessos.",
      "Tempo médio no cardápio aumentou 15% nos últimos 7 dias.",
      "Produto 7 é o mais visualizado em AR com 208 visualizações.",
      "Taxa de conversão para AR está em 42% para o Produto 7.",
      "Horário de pico é entre 12h-14h (almoço) e 19h-21h (jantar).",
    ];

    return {
      dates,
      mesas,
      scansGeral,
      scansPorMesa,
      sessoes,
      tempoMenu,
      picos,
      infoUso,
      modelos,
      kpis,
      insights,
    };
  }

  // ==================== FETCH DE DADOS ====================

  /**
   * Busca dados do dashboard (mock ou API)
   */
  async function fetchDashboardData(filters = {}) {
    if (USE_MOCK) {
      return buildMockData();
    }

    // Implementar chamada real à API quando necessário
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`${API_BASE}?${params}`);
      if (!response.ok) throw new Error("Erro ao buscar dados");
      return response.json();
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      return buildMockData(); // Fallback para mock
    }
  }

  // ==================== RENDERIZAÇÃO DE KPIs ====================

  /**
   * Renderiza os KPIs principais
   */
  function renderKPIs(data) {
    const { kpis } = data;

    if (elements.kpiTotalScans)
      elements.kpiTotalScans.textContent = formatNumber(kpis.totalScans);
    if (elements.kpiSessionsUnique)
      elements.kpiSessionsUnique.textContent = formatNumber(kpis.sessoesUnicas);
    if (elements.kpiAvgTimeMenu)
      elements.kpiAvgTimeMenu.textContent = formatDurationMMSS(
        kpis.tempoMedioMenuSec
      );
    if (elements.kpiAvgTimeAR)
      elements.kpiAvgTimeAR.textContent = formatDurationMMSS(
        kpis.tempoMedioARSec
      );
    if (elements.kpiInfoOpens)
      elements.kpiInfoOpens.textContent = formatNumber(kpis.infoAberturas);
    if (elements.kpiInfoAvgTime)
      elements.kpiInfoAvgTime.textContent = formatDurationMMSS(
        kpis.infoTempoMedioSec
      );
  }

  // ==================== RENDERIZAÇÃO DE GRÁFICOS ====================

  /**
   * Renderiza gráfico de scans geral
   */
  async function renderChartScansOverall(data) {
    if (!elements.chartScansOverall) return;

    await loadChartJs();

    if (charts.scansOverall) charts.scansOverall.destroy();

    const ctx = elements.chartScansOverall.getContext("2d");
    charts.scansOverall = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.dates,
        datasets: [
          {
            label: "Scans Totais",
            data: data.scansGeral,
            borderColor: "#00d9ff",
            backgroundColor: "rgba(0, 217, 255, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointBackgroundColor: "#00d9ff",
            pointBorderColor: "#0f1419",
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
          x: {
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
        },
      },
    });
  }

  /**
   * Renderiza gráfico de sessões
   */
  async function renderChartSessions(data) {
    if (!elements.chartSessions) return;

    await loadChartJs();

    if (charts.sessions) charts.sessions.destroy();

    const ctx = elements.chartSessions.getContext("2d");
    charts.sessions = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.sessoes.map((s) => s.periodo),
        datasets: [
          {
            label: "Sessões",
            data: data.sessoes.map((s) => s.sessoes),
            backgroundColor: "#00d9ff",
            borderRadius: 4,
          },
          {
            label: "Usuários Únicos",
            data: data.sessoes.map((s) => s.unicos),
            backgroundColor: "#3b82f6",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#e2e8f0", font: { size: 12 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
          x: {
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
        },
      },
    });
  }

  /**
   * Renderiza gráfico de tempo médio no cardápio
   */
  async function renderChartAvgTimeMenu(data) {
    if (!elements.chartAvgTimeMenu) return;

    await loadChartJs();

    if (charts.avgTimeMenu) charts.avgTimeMenu.destroy();

    const ctx = elements.chartAvgTimeMenu.getContext("2d");
    charts.avgTimeMenu = new Chart(ctx, {
      type: "line",
      data: {
        labels: data.tempoMenu.map((t) => t.periodo),
        datasets: [
          {
            label: "Tempo Médio",
            data: data.tempoMenu.map((t) => t.mediaSec),
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
          },
          {
            label: "Mediana",
            data: data.tempoMenu.map((t) => t.medianaSec),
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#e2e8f0", font: { size: 12 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
          x: {
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
        },
      },
    });
  }

  /**
   * Renderiza gráfico de horário de pico
   */
  async function renderChartPeakHours(data) {
    if (!elements.chartPeakHours) return;

    await loadChartJs();

    if (charts.peakHours) charts.peakHours.destroy();

    const ctx = elements.chartPeakHours.getContext("2d");
    charts.peakHours = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.picos.map((p) => `${p.hora}h`),
        datasets: [
          {
            label: "Scans por Hora",
            data: data.picos.map((p) => p.scans),
            backgroundColor: "#3b82f6",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#e2e8f0", font: { size: 12 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
          x: {
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
        },
      },
    });
  }

  /**
   * Renderiza gráfico de uso do botão Info
   */
  async function renderChartInfoUsage(data) {
    if (!elements.chartInfoUsage) return;

    await loadChartJs();

    if (charts.infoUsage) charts.infoUsage.destroy();

    const ctx = elements.chartInfoUsage.getContext("2d");
    charts.infoUsage = new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.infoUso.aberturas.map((a) => a.periodo),
        datasets: [
          {
            label: "Aberturas do Info",
            data: data.infoUso.aberturas.map((a) => a.count),
            backgroundColor: "#f59e0b",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#e2e8f0", font: { size: 12 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
          x: {
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
        },
      },
    });
  }

  /**
   * Renderiza gráfico de modelos mais exibidos
   */
  async function renderChartTopModels(data) {
    if (!elements.chartTopModels) return;

    await loadChartJs();

    if (charts.topModels) charts.topModels.destroy();

    const top5 = data.modelos.slice(0, 5);
    const ctx = elements.chartTopModels.getContext("2d");
    charts.topModels = new Chart(ctx, {
      type: "bar",
      data: {
        labels: top5.map((m) => m.item),
        datasets: [
          {
            label: "Entradas em AR",
            data: top5.map((m) => m.arEntradas),
            backgroundColor: "#00d9ff",
            borderRadius: 4,
          },
          {
            label: "Visualizações",
            data: top5.map((m) => m.views),
            backgroundColor: "#3b82f6",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            labels: { color: "#e2e8f0", font: { size: 12 } },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
          x: {
            grid: { color: "rgba(58, 68, 82, 0.3)" },
            ticks: { color: "#a0aec0" },
          },
        },
      },
    });
  }

  // ==================== RENDERIZAÇÃO DE TABELAS ====================

  /**
   * Renderiza tabela de scans por mesa
   */
  function renderTableScansPerMesa(data) {
    if (!elements.tableScansPerMesa) return;

    const totalScans = data.scansPorMesa.reduce((a, b) => a + b.total, 0);
    const rows = data.scansPorMesa
      .map(
        (mesa) => `
      <tr>
        <td>${mesa.mesa}</td>
        <td>${formatNumber(mesa.total)}</td>
        <td>${mesa.lastScan}</td>
        <td>${((mesa.total / totalScans) * 100).toFixed(1)}%</td>
      </tr>
    `
      )
      .join("");

    elements.tableScansPerMesa.innerHTML =
      rows || '<tr><td colspan="4" class="text-center">Sem dados</td></tr>';
  }

  /**
   * Renderiza tabela de sessões
   */
  function renderTableSessions(data) {
    if (!elements.tableSessions) return;

    const rows = data.sessoes
      .map(
        (s) => `
      <tr>
        <td>${s.periodo}</td>
        <td>${formatNumber(s.sessoes)}</td>
        <td>${formatNumber(s.unicos)}</td>
        <td>${(s.sessoes / Math.max(1, s.unicos)).toFixed(2)}</td>
      </tr>
    `
      )
      .join("");

    elements.tableSessions.innerHTML =
      rows || '<tr><td colspan="4" class="text-center">Sem dados</td></tr>';
  }

  /**
   * Renderiza tabela de tempo médio no cardápio
   */
  function renderTableAvgTimeMenu(data) {
    if (!elements.tableAvgTimeMenu) return;

    const rows = data.tempoMenu
      .map(
        (t) => `
      <tr>
        <td>${t.periodo}</td>
        <td>${formatDurationMMSS(t.mediaSec)}</td>
        <td>${formatDurationMMSS(t.medianaSec)}</td>
        <td>${formatNumber(t.amostras)}</td>
      </tr>
    `
      )
      .join("");

    elements.tableAvgTimeMenu.innerHTML =
      rows || '<tr><td colspan="4" class="text-center">Sem dados</td></tr>';
  }

  /**
   * Renderiza tabela de horário de pico
   */
  function renderTablePeakHours(data) {
    if (!elements.tablePeakHours) return;

    const rows = data.picos
      .slice(0, 10)
      .map(
        (p) => `
      <tr>
        <td>${p.mes}</td>
        <td>${p.diaSemana}</td>
        <td>${p.hora}:00</td>
        <td>${formatNumber(p.scans)}</td>
      </tr>
    `
      )
      .join("");

    elements.tablePeakHours.innerHTML =
      rows || '<tr><td colspan="4" class="text-center">Sem dados</td></tr>';
  }

  /**
   * Renderiza tabela de uso do Info
   */
  function renderTableInfoUsage(data) {
    if (!elements.tableInfoUsage) return;

    const rows = data.infoUso.aberturas
      .map(
        (a) => `
      <tr>
        <td>${a.periodo}</td>
        <td>${formatNumber(a.count)}</td>
        <td>${formatDurationMMSS(data.infoUso.tempoMedioSec)}</td>
        <td>${formatDurationHHMM(data.infoUso.tempoTotalSec)}</td>
      </tr>
    `
      )
      .join("");

    elements.tableInfoUsage.innerHTML =
      rows || '<tr><td colspan="4" class="text-center">Sem dados</td></tr>';
  }

  /**
   * Renderiza tabela de modelos
   */
  function renderTableModels(data) {
    if (!elements.tableModels) return;

    const rows = data.modelos
      .map(
        (m) => `
      <tr>
        <td>${m.item}</td>
        <td>${formatNumber(m.views)}</td>
        <td>${formatNumber(m.arEntradas)}</td>
        <td>${m.conversao.toFixed(1)}%</td>
        <td>${formatDurationMMSS(m.tempoARSec)}</td>
      </tr>
    `
      )
      .join("");

    elements.tableModels.innerHTML =
      rows || '<tr><td colspan="5" class="text-center">Sem dados</td></tr>';
  }

  // ==================== RENDERIZAÇÃO DE INSIGHTS ====================

  /**
   * Renderiza lista de insights
   */
  function renderInsights(data) {
    if (!elements.insightsList) return;

    const html = data.insights
      .map((insight) => `<li>${insight}</li>`)
      .join("");

    elements.insightsList.innerHTML =
      html || "<li>Nenhum insight disponível no momento.</li>";
  }

  // ==================== FUNÇÃO PRINCIPAL DE RENDERIZAÇÃO ====================

  /**
   * Renderiza todo o dashboard
   */
  async function renderDashboard(data) {
    renderKPIs(data);
    await renderChartScansOverall(data);
    await renderChartSessions(data);
    await renderChartAvgTimeMenu(data);
    await renderChartPeakHours(data);
    await renderChartInfoUsage(data);
    await renderChartTopModels(data);
    renderTableScansPerMesa(data);
    renderTableSessions(data);
    renderTableAvgTimeMenu(data);
    renderTablePeakHours(data);
    renderTableInfoUsage(data);
    renderTableModels(data);
    renderInsights(data);

    // Popular select de mesas
    if (elements.mesaFilter && data.mesas.length > 0) {
      const options = data.mesas
        .map((mesa) => `<option value="${mesa}">${mesa}</option>`)
        .join("");
      elements.mesaFilter.innerHTML = `<option value="">Todas</option>${options}`;
    }
  }

  // ==================== EVENT LISTENERS ====================

  /**
   * Alterna visibilidade do range de datas customizado
   */
  if (elements.periodFilter) {
    elements.periodFilter.addEventListener("change", (e) => {
      if (elements.customDateRange) {
        elements.customDateRange.classList.toggle(
          "hidden",
          e.target.value !== "custom"
        );
      }
    });
  }

  /**
   * Aplica filtros customizados
   */
  if (elements.applyCustomDate) {
    elements.applyCustomDate.addEventListener("click", () => {
      const start = elements.startDate?.value;
      const end = elements.endDate?.value;

      if (!start || !end) {
        alert("Por favor, selecione ambas as datas.");
        return;
      }

      if (new Date(start) > new Date(end)) {
        alert("A data de início não pode ser maior que a data de fim.");
        return;
      }

      loadAndRenderDashboard({ startDate: start, endDate: end });
    });
  }

  /**
   * Aplica todos os filtros
   */
  if (elements.applyFilters) {
    elements.applyFilters.addEventListener("click", () => {
      const filters = {
        period: elements.periodFilter?.value || "today",
        mesa: elements.mesaFilter?.value || "",
        aggregation: elements.aggregationFilter?.value || "day",
      };

      loadAndRenderDashboard(filters);
    });
  }

  // ==================== CARREGAMENTO INICIAL ====================

  /**
   * Carrega e renderiza o dashboard
   */
  async function loadAndRenderDashboard(filters = {}) {
    try {
      const data = await fetchDashboardData(filters);
      await renderDashboard(data);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      alert("Erro ao carregar dados do dashboard. Tente novamente.");
    }
  }

  /**
   * Inicializa o dashboard ao carregar a página
   */
  document.addEventListener("DOMContentLoaded", () => {
    loadAndRenderDashboard();
  });
})();