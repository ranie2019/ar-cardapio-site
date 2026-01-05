/* ==========================================================
   MÉTRICAS.js DASHBOARD — ARCardápio
   ========================================================== */

(function () {

/* ==========================================================
   GERAL — CONFIG, DOM, HELPERS, FETCH, CHART, INSIGHTS
   ========================================================== */

/* --------- BASE / CONFIGURAÇÃO GERAL --------- */
const USE_MOCK = false; // PRODUÇÃO: só dados reais
const API_BASE = "https://zoci6wmxqa.execute-api.us-east-1.amazonaws.com/metricas/cliente";

// ===== AUTH (hard stop) =====
function requireAuthOrRedirect() {
  const token = getMetricsAuthToken(); // você já tem essa função mais abaixo

  if (token) return true;

  // volta pra esta página depois do login
  const back = encodeURIComponent(location.pathname + location.search);
  console.warn("[METRICAS] Sem token. Redirecionando para login...");
  location.href = `/html/login.html?back=${back}`;
  return false;
}

/* --------- ELEMENTOS (DOM) --------- */
function byId(id) { return document.getElementById(id); }

const elements = {
  // Filtros
  periodFilter: byId("periodFilter"),
  startDate: byId("startDate"),
  endDate: byId("endDate"),
  filterRange: byId("filterRange"),
  btnApplyFilters: byId("btnApplyFilters"),
  clearRange: byId("clearRange"),

  // KPIs (Resumo)
  kpiScans: byId("kpiScans"),
  kpiSessoes: byId("kpiSessoes"),
  kpiUnicos: byId("kpiUnicos"),
  kpiInfoRate: byId("kpiInfoRate"),
  kpiAvgTimePerItem: byId("kpiAvgTimePerItem"),
  kpiAvgTimePerCategory: byId("kpiAvgTimePerCategory"),
  kpiInfoClicks: byId("kpiInfoClicks"),
  kpiInfoAvgTime: byId("kpiInfoAvgTime"),
  kpiActiveClients: byId("kpiActiveClients"),
  kpiNewClients: byId("kpiNewClients"),
  kpiRecurringClients: byId("kpiRecurringClients"),
  kpiReturnRate: byId("kpiReturnRate"),
  kpiInfoOpens: byId("kpiInfoOpens"),
  kpiInfoAvgTimeInfoBox: byId("kpiInfoAvgTimeInfoBox"),
  kpiModelsLoaded: byId("kpiModelsLoaded"),
  kpiModelsErrors: byId("kpiModelsErrors"),

  // LIKE (KPI + tabela + gráfico)
  cardLikeTotal: byId("kpiLikeTotal") || byId("kpi-like-total"),
  cardDislikeTotal: byId("kpiDislikeTotal") || byId("kpi-dislike-total"),
  chartLikeUsage: byId("chartLikeUsage"),
  tableLikeUsage:
    byId("tableLikeUsage") ||
    byId("tbodyLikeUsage") ||
    byId("table-like-usage-body"),

  // Gráficos
  chartScansTotal: byId("chartScansTotal"),
  chartScansByMesa: byId("chartScansByMesa"),
  chartSessoes: byId("chartSessoes"),
  chartAvgTimeMenu: byId("chartAvgTimeMenu"),
  chartPeakHours: byId("chartPeakHours"),
  chartDevices: byId("chartDevices"),
  chartTimeByCategory: byId("chartTimeByCategory"),
  chartTimePerItem: byId("chartTimePerItem"),
  chartInfoUsage: byId("chartInfoUsage"),
  chartEngagementByMesa: byId("chartEngagementByMesa"),
  chartModelHealth: byId("chartModelHealth"),
  chartInfoPerItem: byId("chartInfoPerItem"),
  chartTopModels: byId("chartTopModels"),

  // Tabelas
  tbodyMesaQR: byId("tbodyMesaQR"),
  tbodySessoes: byId("tbodySessoes"),
  tableAvgTimeMenu: byId("tbodyAvgTimeMenu") || byId("tableAvgTimeMenu"),
  tbodyTimeByCategory: byId("tbodyTimeByCategory"),
  tableTimePerItem: byId("tbodyTimePerItem") || byId("tableTimePerItem"),
  tablePeakHours: byId("tbodyPeakHours") || byId("tablePeakHours"),
  tableEngagementByMesa: byId("tbodyEngagementByMesa") || byId("tableEngagementByMesa"),
  tableDeviceDistribution: byId("tbodyDeviceDistribution") || byId("tableDeviceDistribution"),
  tableTopModels: byId("tbodyTopModels") || byId("tableTopModels"),
  tableModelErrors: byId("tbodyModelErrors") || byId("tableModelErrors"),
  tableInfoPerItem: byId("tbodyInfoPerItem") || byId("tableInfoPerItem"),


  // Insights
  insightsList: byId("insightsList"),
};

/* --------- INSTÂNCIAS CHART --------- */
const charts = {
  scansTotal: null,
  scansByMesa: null,
  sessoes: null,
  avgTimeMenu: null,
  peakHours: null,
  devices: null,
  timeByCategory: null,
  timePerItem: null,
  infoUsage: null,
  engagementByMesa: null,
  modelHealth: null,
  infoPerItem: null,
  topModels: null,
  likeUsage: null, // gráfico de likes
};

// expõe no escopo global
window.elements = elements;
window.charts = charts;

/* --------- HELPERS GERAIS --------- */
const $  = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => [...parent.querySelectorAll(sel)];

function toBR(num, opts = {}) { return new Intl.NumberFormat("pt-BR", opts).format(num); }
function pct(part, total) { return total ? `${toBR((part / total) * 100, { maximumFractionDigits: 1 })}%` : "0%"; }
function pad2(n){ return n.toString().padStart(2,"0"); }

function formatDateBR(date){
  const d=(date instanceof Date)?date:new Date(date);
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
}
function formatTimeBR(date){
  const d=(date instanceof Date)?date:new Date(date);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
// segura contra NaN:NaN
function formatTimeBRSafe(date){
  if (!date) return "--";
  const d = (date instanceof Date) ? date : new Date(date);
  if (isNaN(d.getTime())) return "--";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatDurationMMSS(seconds){
  seconds=Math.max(0,Math.round(seconds||0));
  const m=Math.floor(seconds/60), s=seconds%60;
  return `${pad2(m)}:${pad2(s)}`;
}
function average(arr){ return (!arr?.length)?0:arr.reduce((a,b)=>a+b,0)/arr.length; }
function sum(arr){ return (arr || []).reduce((a,b)=>a+(Number(b)||0), 0); }
function roundUpToMultiple(value,step=10){ return (step<=0)?value:Math.ceil(value/step)*step; }
function roundToNearest(value,step=10){ return (step<=0)?value:Math.round(value/step)*step; }
function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

/** Normaliza qualquer identificador (e-mail, nome, etc.) para o mesmo slug usado nas pastas do S3 */
function tenantKey(raw) {
  return String(raw || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/* --------- MOCK / EMPTY DATA --------- */
function generateMockDates(n=14){
  const out=[]; const today=new Date();
  for(let i=n-1;i>=0;i--){
    const d=new Date(today);
    d.setDate(today.getDate()-i);
    out.push(new Date(d.getFullYear(),d.getMonth(),d.getDate()));
  }
  return out;
}

const CATEGORY_MAP = window.CATEGORY_MAP || {
  "Categoria 1": "Bebidas",
  "Categoria 2": "Pizzas",
  "Categoria 3": "Sobremesas",
  "Categoria 4": "Carnes",
  "Categoria 5": "Lanches",
  "Categoria 6": "Diversos",

  // ✅ cobre quando vier normalizado / texto direto
  "diversos": "Diversos",
  "Diversos": "Diversos",
};


const ITEM_MAP = window.ITEM_MAP || {
  // "Item 1": "Nome real", ...
};

function mapCategoryName(raw){
  const s = String(raw ?? "").trim();
  const key = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-]+/g, "_");

  return CATEGORY_MAP[s] || CATEGORY_MAP[key] || s || "Categoria";
}


function mapItemName(raw){
  const s = String(raw ?? "").trim();
  return ITEM_MAP[s] || s || "Item";
}


function buildMockData(tenant,startDate,endDate){
  const days = generateMockDates(14).filter(d=>d>=startDate && d<=endDate);
  const labels = days.map(formatDateBR);

  const seed = tenant?.length || 7;
  const dailyScans   = days.map((_,idx)=> 10+((idx*3+seed)%20)+randomInt(0,15));
  const dailySessions= dailyScans.map(v=> Math.max(0,Math.round(v*(0.7+Math.random()*0.2))));
  const dailyUniques = dailyScans.map(v=> Math.max(0,Math.round(v*(0.45+Math.random()*0.25))));
  const dailyInfo    = dailyScans.map(v=> Math.max(0,Math.round(v*(0.12+Math.random()*0.1))));

  const mesas = Array.from({length:10}).map((_,i)=>`mesa${i+1}`);
  const mesaData = mesas.map((m)=>{
    const scansPeriodo=randomInt(8,120);
    const ts=new Date(endDate); ts.setHours(randomInt(10,22),randomInt(0,59),0,0);
    return {
      mesa:m,
      scans:scansPeriodo,
      ultimoScan:ts,
      avgTimeSec:randomInt(30,180),
      interactionsPerSession:(Math.random()*5).toFixed(1),
      sessions: randomInt(10, 50)
    };
  });

  const tempoMenu = days.map(d=>({
    periodo: formatDateBR(d),
    mediaSec:   Math.round(60 + Math.random()*180),
    medianaSec: Math.round(50 + Math.random()*150),
    amostras:   Math.round(30 + Math.random()*130),
  }));

  const picos = Array.from({length:24}).map((_,hora)=>({
    hora,
    scans: Math.round(Math.max(0,(hora-9)*(Math.random()*6)))
  }));

  const devices = [
    { label:"Mobile",  value: randomInt(70,90), sessions: randomInt(100, 300), avgTimeSec: randomInt(60, 180) },
    { label:"Desktop", value: randomInt(10,30), sessions: randomInt(10, 50), avgTimeSec: randomInt(30, 90) },
    { label:"Tablet",  value: randomInt(1,5), sessions: randomInt(5, 20), avgTimeSec: randomInt(40, 120) },
  ];

  const topItems = Array.from({length:10}).map((_,i)=>({
    item: mapItemName(`Item ${i+1}`),
    views:randomInt(50,500),
    avgTimeSec:randomInt(10,60),
    category: mapCategoryName(`Categoria ${randomInt(1,5)}`),
    clicksInfo: randomInt(5, 50),
    likes: randomInt(0, 80),
    dislikes: randomInt(0, 30),
  })).sort((a,b)=>b.views-a.views);

  const categories = Array.from({length:5}).map((_,i)=>mapCategoryName(`Categoria ${i+1}`));
  const timeByCategory = categories.map(cat=>({
    category:cat,
    avgTimeSec:randomInt(30,180),
    sessions:randomInt(50,300),
    totalTimeSec:randomInt(5000,20000)
  }));
  const totalTime = sum(timeByCategory.map(c=>c.totalTimeSec));
  timeByCategory.forEach(c=> c.pctTotalTime = pct(c.totalTimeSec,totalTime));

  const topCategories = categories.map(cat=>({
    category:cat,
    clicks:randomInt(100,800),
    avgTimeSec:randomInt(30,180),
    totalClicks:randomInt(1000,5000)
  })).sort((a,b)=>b.clicks-a.clicks);
  const totalClicks = sum(topCategories.map(c=>c.clicks));
  topCategories.forEach(c=> c.pctTotal = pct(c.clicks,totalClicks));

  const scansTotal   = sum(dailyScans);
  const sessoesTotal = sum(dailySessions);
  const unicosTotal  = sum(dailyUniques);
  const infoTotal    = sum(dailyInfo);
  const kpis = {
    scansTotal, sessoesTotal, unicosTotal, infoTotal,
    avgTimePerItem:     average(topItems.map(i=>i.avgTimeSec)),
    avgTimePerCategory: average(timeByCategory.map(c=>c.avgTimeSec)),
    infoClicks: infoTotal,
    infoAvgTime: randomInt(10,40),
    activeClients: randomInt(50,100),
    newClients: randomInt(5,15),
    recurringClients: randomInt(30,50),
    infoOpens: randomInt(50, 200),
    infoAvgTimeInfoBox: randomInt(10, 40),
    modelsLoaded: randomInt(100, 500),
    modelsErrors: randomInt(0, 10),
    likeTotal: topItems.reduce((acc,i)=>acc+(i.likes||0),0),
    dislikeTotal: topItems.reduce((acc,i)=>acc+(i.dislikes||0),0),
  };

  const recurrenceData = days.map(d => ({
    periodo: formatDateBR(d),
    newClients: randomInt(1, 5),
    returningClients: randomInt(5, 15)
  }));

  const topModels = Array.from({length:5}).map((_,i)=>({
    model:mapItemName(`Item ${i+1}`),
    views:randomInt(10,100),
    avgTimeSec:randomInt(5,30),
    errors:randomInt(0,5)
  })).sort((a,b)=>b.views-a.views);

  const modelErrors = Array.from({length:3}).map((_,i)=>({
    itemModel:mapItemName(`Item ${i+1}`),
    error:`Erro ${i+1}`,
    occurrences:randomInt(1,10),
    last:new Date()
  }));

  const insights = [
    {
      timestamp: new Date(),
      title: "Horário de pico simulado",
      detail: "Entre 19h e 21h o movimento está acima da média nestes dados mock."
    }
  ];

  return {
    rangeLabels: labels,
    daily: { scans:dailyScans, sessoes:dailySessions, unicos:dailyUniques, info:dailyInfo },
    porMesa: mesaData,
    tempoMenu, picos, devices, topItems, timeByCategory, topCategories,
    kpis, recurrenceData, topModels, modelErrors, insights
  };
}

/* Estrutura vazia quando a API falhar */
function buildEmptyData(){
  return {
    rangeLabels: [],
    daily: { scans: [], sessoes: [], unicos: [], info: [] },
    porMesa: [],
    tempoMenu: [],
    picos: [],
    devices: [],
    topItems: [],
    timeByCategory: [],
    topCategories: [],
    kpis: {
      scansTotal: 0,
      sessoesTotal: 0,
      unicosTotal: 0,
      infoTotal: 0,
      avgTimePerItem: 0,
      avgTimePerCategory: 0,
      infoClicks: 0,
      infoAvgTime: 0,
      activeClients: 0,
      newClients: 0,
      recurringClients: 0,
      infoOpens: 0,
      infoAvgTimeInfoBox: 0,
      modelsLoaded: 0,
      modelsErrors: 0,
      likeTotal: 0,
      dislikeTotal: 0,
    },
    recurrenceData: [],
    topModels: [],
    modelErrors: [],
    devicesDistribution: [],
    insights: []
  };
}

/* --------- FETCH REAL (LAMBDA) --------- */
async function fetchMetrics({ tenant, startDate, endDate }) {
  const token =
    localStorage.getItem("ar.token") ||
    sessionStorage.getItem("ar.token") ||
    localStorage.getItem("jwtToken") ||
    localStorage.getItem("token") ||
    localStorage.getItem("clienteToken") ||
    sessionStorage.getItem("jwtToken") ||
    sessionStorage.getItem("token") ||
    sessionStorage.getItem("clienteToken");

  console.log("[METRICAS] token lido?", token ? "OK" : "NENHUM");

  if (!token) {
    console.warn("[METRICAS] Não autenticado / token ausente. Dashboard ficará vazio até fazer login.");
    return buildEmptyData();
  }

  if (USE_MOCK) {
    console.warn("[METRICAS] USE_MOCK = true → usando dados falsos.");
    return buildMockData(tenant, startDate, endDate);
  }

  // SEMPRE SLUG (consistência total)
  const emailTenant = localStorage.getItem("ar.email") || sessionStorage.getItem("ar.email");
  const tenantRaw   = (emailTenant || tenant || AppState.tenant || "").trim();
  const tenantForApi = tenantKey(tenantRaw);

  console.log("[METRICAS] tenant raw =", tenantRaw, "enviado =", tenantForApi);

  try {
    const params = new URLSearchParams();
    if (tenantForApi) params.append("tenant", tenantForApi);
    if (startDate instanceof Date) params.append("startDate", formatDateBR(startDate));
    if (endDate   instanceof Date) params.append("endDate",   formatDateBR(endDate));

    const urlFinal = `${API_BASE}?${params.toString()}`;

    const res = await fetch(urlFinal, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    console.log("[METRICAS] URL chamada =", urlFinal);
    console.log("[METRICAS] status =", res.status, res.statusText);

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      console.error("[METRICAS] Erro HTTP ao buscar dados reais:", res.status, res.statusText, json);
      return buildEmptyData();
    }

    if (!json || json.ok === false) {
      console.warn("[METRICAS] API retornou erro lógico:", json && json.code, json && json.message);
      return buildEmptyData();
    }

    console.log("[METRICAS] data bruto da API:", json);
    return json;
  } catch (e) {
    console.error("[METRICAS] Erro de rede/parse ao buscar dados reais:", e);
    return buildEmptyData();
  }
}

/* --------- TOOLTIP “?” (PORTAL) --------- */
const HelpPortal = (() => {
  let el;

  function ensure() {
    if (!el) {
      el = document.createElement("div");
      el.className = "tooltip-portal";
      document.body.appendChild(el);
    }
    return el;
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), max);
  }

  function show(text, target) {
    const tip = ensure();
    tip.innerHTML = text || "";
    tip.style.display = "block";

    tip.style.left = "-9999px";
    tip.style.top  = "-9999px";

    const pad = 12;
    const trg = target.getBoundingClientRect();
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;

    let x = trg.left + (trg.width / 2);
    let y = trg.bottom + 8;

    const r = tip.getBoundingClientRect();

    x = x - (r.width / 2);
    x = clamp(x, pad, vw - pad - r.width);

    if (y + r.height > vh - pad) {
      y = trg.top - r.height - 8;
    }
    y = clamp(y, pad, vh - pad - r.height);

    tip.style.left = `${x}px`;
    tip.style.top  = `${y}px`;
    tip.style.transform = "none";
  }

  function hide() {
    if (el) el.style.display = "none";
  }

  window.addEventListener("scroll", hide, { passive: true });
  window.addEventListener("resize", hide);

  return { show, hide };
})();

function wireHelpBadges(container){
  const badges = container.querySelectorAll(".kpi-help");
  badges.forEach(badge=>{
    const tooltipText = badge.getAttribute("data-tooltip");
    if(!tooltipText) return;
    badge.addEventListener("mouseenter", ()=>HelpPortal.show(tooltipText, badge));
    badge.addEventListener("mouseleave", ()=>HelpPortal.hide());
    badge.addEventListener("focus", ()=>HelpPortal.show(tooltipText, badge));
    badge.addEventListener("blur", ()=>HelpPortal.hide());
  });
}

/* --------- CHART.JS + HELPERS DE GRÁFICO --------- */
let chartJsLoaded = false;
async function ensureChartJs(){
  if (chartJsLoaded) return;

  // se Chart já veio do <script> do HTML, só configura defaults
  if (typeof Chart !== "undefined") {
    Chart.defaults.color = "#ffffff";
    Chart.defaults.font.family = "Inter, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = "rgba(0,0,0,0.8)";
    Chart.defaults.plugins.tooltip.titleColor = "#ffffff";
    Chart.defaults.plugins.tooltip.bodyColor = "#ffffff";
    Chart.defaults.plugins.tooltip.borderColor = "#3b82f6";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 4;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    chartJsLoaded = true;
    return;
  }

  await new Promise(resolve=>{
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js";
    script.onload = ()=>{
      Chart.defaults.color = "#ffffff";
      Chart.defaults.font.family = "Inter, sans-serif";
      Chart.defaults.plugins.tooltip.backgroundColor = "rgba(0,0,0,0.8)";
      Chart.defaults.plugins.tooltip.titleColor = "#ffffff";
      Chart.defaults.plugins.tooltip.bodyColor = "#ffffff";
      Chart.defaults.plugins.tooltip.borderColor = "#3b82f6";
      Chart.defaults.plugins.tooltip.borderWidth = 1;
      Chart.defaults.plugins.tooltip.cornerRadius = 4;
      Chart.defaults.plugins.tooltip.displayColors = false;
      Chart.defaults.plugins.legend.labels.boxWidth = 12;
      Chart.defaults.plugins.legend.labels.boxHeight = 12;
      chartJsLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });
}

function hexToRgba(hex, alpha = 0.12) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(59,130,246,${alpha})`; // fallback
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildLineChart(ctx, labels, data, label, color, tooltipCallback){
  const lineColor = color || "#3b82f6";
  const fillColor = hexToRgba(lineColor, 0.12);

  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label,
        data,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
        fill: true,
        backgroundColor: fillColor,   // ✅ agora acompanha a cor da linha
        borderColor: lineColor,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: tooltipCallback || ((ctx) => ` ${ctx.parsed.y}`)
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: "rgba(255,255,255,.08)" } }
      }
    }
  });
}

// eixo X SEM números fracionados (step inteiro)
function buildBarHorizontal(ctx, labels, data, label, color){
  const numeric = (data || []).map(v => Number(v) || 0);
  const maxVal = numeric.length ? Math.max(...numeric) : 0;
  const step = maxVal <= 5 ? 1 : Math.max(1, Math.round(maxVal / 4));

  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label,
        data: numeric,
        backgroundColor: color,
        borderColor: color,
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${toBR(ctx.parsed.x)}`
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(255,255,255,.08)" },
          ticks: {
            stepSize: step || 1,
            precision: 0,
            callback: (value) => toBR(value)
          },
          suggestedMax: maxVal || 1
        },
        y: { grid: { display: false } }
      }
    }
  });
}

function buildDoughnut(ctx, labels, data){
  return new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#00d9ff", "#ef4444"],
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${toBR(ctx.parsed)}`
          }
        }
      }
    }
  });
}

/* ==========================================================
   FILTROS — TENANT, RANGE DE DATAS, ESTADO
   ========================================================== */

// Resolve o tenant usando o MESMO padrão do backend
function resolveTenantInitial() {
  const emailCandidates = [
    localStorage.getItem("ar.email"),
    sessionStorage.getItem("ar.email"),
    localStorage.getItem("arEmail"),
    sessionStorage.getItem("arEmail"),
    localStorage.getItem("email"),
    sessionStorage.getItem("email"),
  ].filter(v => v && v.trim());

  for (const v of emailCandidates) {
    const t = tenantKey(v);
    if (t) {
      console.log("[METRICAS] tenant via email", v, "=>", t);
      return t;
    }
  }

  const keys = ["ar.tenant", "tenant", "tenantId", "restaurante"];
  for (const k of keys) {
    const v = localStorage.getItem(k) || sessionStorage.getItem(k);
    if (v && v.trim()) {
      const t = tenantKey(v);
      console.log("[METRICAS] tenant via storage", k, "=", v, "=>", t);
      return t;
    }
  }

  try {
    const url = new URL(window.location.href);
    const fromTenant = url.searchParams.get("tenant");
    const fromR = url.searchParams.get("r");
    const raw = (fromTenant || fromR || "").trim();
    if (!raw) return "";

    const t = tenantKey(
      raw
        .replace(/^https?:\/\//i, "")
        .replace(/[?#].*$/, "")
        .replace(/%40/gi, "@")
    );
    console.log("[METRICAS] tenant via URL", raw, "=>", t);
    return t;
  } catch (err) {
    console.warn("[METRICAS] Não foi possível resolver tenant inicial:", err);
    return "";
  }
}

const AppState = {
  tenant: resolveTenantInitial(),
  startDate: null,
  endDate: null,
};

console.log("[METRICAS] tenant inicial:", AppState.tenant);

// flatpickr
function initFlatpickrIfAny() {
  if (typeof flatpickr === "undefined") {
    console.warn("[METRICAS] flatpickr não carregado");
    return;
  }

  const commonConfig = {
    dateFormat: "d/m/Y",
    locale: flatpickr.l10ns?.pt || "pt",
    allowInput: true,
    clickOpens: true,
    monthSelectorType: "static",
    onChange: () => {
      updateRangeInput();
    }
  };

  if (elements.startDate && !elements.startDate._flatpickr) {
    flatpickr(elements.startDate, commonConfig);
  }
  if (elements.endDate && !elements.endDate._flatpickr) {
    flatpickr(elements.endDate, commonConfig);
  }
}

function updateRangeInput() {
  const start = elements.startDate?.value;
  const end = elements.endDate?.value;
  if (elements.filterRange) {
    elements.filterRange.value = (start && end) ? `${start} a ${end}` : "";
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

// HOJE como padrão
function setDefaultTodayRange() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  AppState.startDate = today;
  AppState.endDate = today;

  const v = formatDateBR(today);
  if (elements.startDate) elements.startDate.value = v;
  if (elements.endDate) elements.endDate.value = v;
  if (elements.filterRange) elements.filterRange.value = `${v} a ${v}`;
}

// botão APLICAR
function applyFilters() {
  let startStr = elements.startDate?.value?.trim();
  let endStr   = elements.endDate?.value?.trim();

  if (!startStr || !endStr) {
    setDefaultTodayRange();
  } else {
    AppState.startDate = parseDate(startStr);
    AppState.endDate   = parseDate(endStr);
  }

  if (AppState.startDate && AppState.endDate && AppState.startDate > AppState.endDate) {
    alert("A data inicial não pode ser maior que a data final.");
    return;
  }

  updateRangeInput();
  loadAndRender();
}

// botão LIMPAR
function clearRange() {
  if (elements.startDate) elements.startDate.value = "";
  if (elements.endDate) elements.endDate.value = "";
  if (elements.filterRange) elements.filterRange.value = "";
  if (elements.periodFilter) elements.periodFilter.value = "custom";

  setDefaultTodayRange();
  loadAndRender();
}

// período rápido
function handlePeriodChange() {
  const period = elements.periodFilter?.value;
  if (!period || period === "custom") return;

  const today = new Date();
  let startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let endDate   = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  switch (period) {
    case "7d":
      startDate.setDate(startDate.getDate() - 6);
      break;
    case "15d":
      startDate.setDate(startDate.getDate() - 14);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 29);
      break;
    case "60d":
      startDate.setDate(startDate.getDate() - 59);
      break;
    case "mesAnterior":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate   = new Date(today.getFullYear(), today.getMonth(), 0);
      break;
    case "mesAtual":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    default:
      return;
  }

  if (elements.startDate) elements.startDate.value = formatDateBR(startDate);
  if (elements.endDate)   elements.endDate.value   = formatDateBR(endDate);
  updateRangeInput();

  AppState.startDate = startDate;
  AppState.endDate   = endDate;

  loadAndRender();
}

function wireFilters() {
  elements.btnApplyFilters?.addEventListener("click", applyFilters);
  elements.clearRange?.addEventListener("click", clearRange);
  elements.periodFilter?.addEventListener("change", handlePeriodChange);
}

/* ==========================================================
   RESUMO (KPIs)
   ========================================================== */
function renderKPIs(kpis){
  if (!kpis) kpis = {};

  // --------- Normaliza valores numéricos básicos ---------
  const scansTotal     = Number(kpis.scansTotal     || 0);
  const sessoesTotal   = Number(kpis.sessoesTotal   || 0);
  const unicosTotal    = Number(kpis.unicosTotal    || 0);
  const infoTotal      = Number(kpis.infoTotal      || 0); // total bruto de eventos Info
  const infoClicks     = Number(kpis.infoClicks     || infoTotal || 0);

  const avgTimePerItem     = Number(kpis.avgTimePerItem     || 0);
  const avgTimePerCategory = Number(kpis.avgTimePerCategory || 0);
  const infoAvgTime        = Number(kpis.infoAvgTime        || 0);

  const activeClients      = Number(kpis.activeClients      || 0);
  const newClients         = Number(kpis.newClients         || 0);
  const recurringClients   = Number(kpis.recurringClients   || 0);

  const infoOpens          = Number(kpis.infoOpens          || 0);
  const infoAvgTimeInfoBox = Number(kpis.infoAvgTimeInfoBox || 0);

  const modelsLoaded       = Number(kpis.modelsLoaded       || 0);
  const modelsErrors       = Number(kpis.modelsErrors       || 0);

  // --------- NOVO: Taxa de Info baseada em usuários ---------
  // Backend deve mandar algo como:
  //  - kpis.infoUsers        → qtd de usuários que clicaram Info ≥ 1x
  //  - ou kpis.infoUniqueUsers (fallback)
  const infoUsers =
    Number(
      kpis.infoUsers ??
      kpis.infoUniqueUsers ??
      0
    ) || 0;

  let infoRateValue = 0;

  if (unicosTotal > 0 && infoUsers > 0) {
    // Regra principal: % de usuários únicos que clicaram Info
    infoRateValue = (infoUsers / unicosTotal) * 100;
  } else if (scansTotal > 0 && infoTotal > 0) {
    // Fallback (enquanto o backend não mandar infoUsers):
    // usa infoTotal/scansTotal, mas sempre limitado a 100%
    infoRateValue = (infoTotal / scansTotal) * 100;
  }

  // nunca pode passar de 100%
  if (infoRateValue > 100) infoRateValue = 100;

  const infoRateDisplay =
    toBR(infoRateValue, { maximumFractionDigits: 1 }) + "%";

  // --------- Preenche os cards do Resumo ---------
  if (elements.kpiScans)
    elements.kpiScans.textContent = toBR(scansTotal);

  if (elements.kpiSessoes)
    elements.kpiSessoes.textContent = toBR(sessoesTotal);

  if (elements.kpiUnicos)
    elements.kpiUnicos.textContent = toBR(unicosTotal);

  // TAXA DE INFO (agora com regra nova)
  if (elements.kpiInfoRate)
    elements.kpiInfoRate.textContent = infoRateDisplay;

  if (elements.kpiAvgTimePerItem)
    elements.kpiAvgTimePerItem.textContent = formatDurationMMSS(avgTimePerItem);

  if (elements.kpiAvgTimePerCategory)
    elements.kpiAvgTimePerCategory.textContent = formatDurationMMSS(avgTimePerCategory);

  // Cliques no Info continua sendo o total bruto
  if (elements.kpiInfoClicks)
    elements.kpiInfoClicks.textContent = toBR(infoClicks);

  if (elements.kpiInfoAvgTime)
    elements.kpiInfoAvgTime.textContent = formatDurationMMSS(infoAvgTime);

  if (elements.kpiActiveClients)
    elements.kpiActiveClients.textContent = toBR(activeClients);

  if (elements.kpiNewClients)
    elements.kpiNewClients.textContent = toBR(newClients);

  if (elements.kpiRecurringClients)
    elements.kpiRecurringClients.textContent = toBR(recurringClients);

  if (elements.kpiReturnRate) {
    const totalClients = newClients + recurringClients;
    elements.kpiReturnRate.textContent =
      totalClients > 0 ? pct(recurringClients, totalClients) : "0%";
  }

  if (elements.kpiInfoOpens)
    elements.kpiInfoOpens.textContent = toBR(infoOpens);

  if (elements.kpiInfoAvgTimeInfoBox)
    elements.kpiInfoAvgTimeInfoBox.textContent = formatDurationMMSS(infoAvgTimeInfoBox);

  if (elements.kpiModelsLoaded)
    elements.kpiModelsLoaded.textContent = toBR(modelsLoaded);

  if (elements.kpiModelsErrors)
    elements.kpiModelsErrors.textContent = toBR(modelsErrors);

  // --------- Blocos de recorrência (se existirem) ---------
  const totalClientsRec = newClients + recurringClients;
  if (byId("kpiRecNew"))
    byId("kpiRecNew").textContent = toBR(newClients);

  if (byId("kpiRecReturning"))
    byId("kpiRecReturning").textContent = toBR(recurringClients);

  if (byId("kpiRecRate"))
    byId("kpiRecRate").textContent =
      totalClientsRec > 0 ? pct(recurringClients, totalClientsRec) : "0%";
}

/* ==========================================================
   ESCANEAMENTO TOTAL DE QR CODE 
   ========================================================== */

function renderScansTotalChart(data) {
  if (!elements.chartScansTotal) return;

  const ctx = elements.chartScansTotal.getContext("2d");

  // destruir gráfico anterior, se existir
  if (charts.scansTotal) {
    charts.scansTotal.destroy();
    charts.scansTotal = null;
  }

  // ---------- 1) Dados vindos da API ----------
  // Se vier o bloco especial de histórico (30 dias), usa ele.
  // Senão, cai no comportamento padrão (rangeLabels/daily.scans).
  const history =
    data && data.scansHistory30d && Array.isArray(data.scansHistory30d.labels)
      ? data.scansHistory30d
      : null;

  const apiLabels = history
    ? history.labels
    : (data && Array.isArray(data.rangeLabels) ? data.rangeLabels : []);

  const dailyScansRaw = history
    ? (Array.isArray(history.scans) ? history.scans : [])
    : (data && data.daily && Array.isArray(data.daily.scans)
        ? data.daily.scans
        : []);

  const dailySessionsRaw = history
    ? (Array.isArray(history.sessoes) ? history.sessoes : [])
    : (data && data.daily && Array.isArray(data.daily.sessoes)
        ? data.daily.sessoes
        : []);

  // ---------- 2) Normalização / fallback ----------
  // garante que sejam números
  let dailyScans = dailyScansRaw.map(v => Number(v) || 0);
  const dailySess = dailySessionsRaw.map(v => Number(v) || 0);

  const hasScans = dailyScans.some(v => v > 0);
  const hasSess  = dailySess.some(v => v > 0);

  // fallback: se scans vierem todos 0 mas sessões tiverem valor,
  // usa sessões como proxy de scans
  if (!hasScans && hasSess) {
    dailyScans = dailySess;
  }

  // se não tiver nenhum label, não tenta renderizar
  if (!apiLabels.length) {
    charts.scansTotal = buildLineChart(
      ctx,
      [],
      [],
      "Scans (dia)",
      "#00d9ff",
      () => " 0 scan(s)"
    );
    return;
  }

  // ---------- 3) Corta dias vazios ANTES do primeiro valor > 0 ----------
  let labels = apiLabels.slice();
  let values = dailyScans.slice();

  const firstNonZeroIdx = values.findIndex(v => v > 0);

  // Se achou algum dia com valor > 0 e ele não é o primeiro índice, corta o início
  if (firstNonZeroIdx > 0) {
    labels = labels.slice(firstNonZeroIdx);
    values = values.slice(firstNonZeroIdx);
  }

  // Se por algum motivo ficarem vazios, garante pelo menos 1 ponto
  if (!labels.length && apiLabels.length) {
    const lastIdx = apiLabels.length - 1;
    labels = [apiLabels[lastIdx]];
    values = [dailyScans[lastIdx] || 0];
  }

  // ---------- 4) Render do gráfico ----------
  charts.scansTotal = buildLineChart(
    ctx,
    labels,
    values,
    "Scans (dia)",
    "#00d9ff",
    (ctxTooltip) => ` ${toBR(ctxTooltip.parsed.y)} scan(s)`
  );
}

/* ==========================================================
   ESCANEAMENTO POR MESA / QRCODE
   ========================================================== */

// Normaliza rótulo de mesa: "mesa1" → "Mesa 1"
function formatMesaLabel(raw) {
  if (!raw) return "Mesa";

  const s = String(raw).trim();

  // "mesa1", "Mesa01", "mesa 2" → "Mesa 1" / "Mesa 2"
  const m = s.match(/^mesa\s*0*(\d+)$/i);
  if (m) return `Mesa ${m[1]}`;

  // Se não bater com o padrão, só capitaliza a primeira letra
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Helper: pega scans de qualquer formato que a API mandar
function getMesaScans(i) {
  return Number(i?.scans ?? i?.totalScans ?? i?.scanCount ?? 0) || 0;
}

// Helper: pega label de mesa
function getMesaRawLabel(i) {
  return (
    i?.mesa ||
    i?.qrLabel ||
    i?.label ||
    i?.mesaId ||
    i?.table ||
    "QR/mesa-desconhecido"
  );
}

// Helper: pega último scan
function getMesaLastScan(i) {
  return (
    i?.ultimoScan ||
    i?.lastScan ||
    i?.last ||
    i?.lastSeen ||
    i?.lastSeenAt ||
    i?.updatedAt ||
    null
  );
}

function renderTabelaMesaQR(list) {
  const tbody = elements.tbodyMesaQR;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // Total de scans (para calcular % do total)
  const totalScans = sum(safe.map(getMesaScans));

  const rows = safe.map(i => {
    const mesaLabel = formatMesaLabel(getMesaRawLabel(i));
    const scans = getMesaScans(i);
    const lastScan = getMesaLastScan(i);
    const pctTotal = totalScans > 0 ? pct(scans, totalScans) : "0%";

    return `
      <tr>
        <td>${mesaLabel}</td>
        <td style="text-align:center">${toBR(scans)}</td>
        <td style="text-align:center">${formatTimeBRSafe(lastScan)}</td>
        <td style="text-align:right">${pctTotal}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

function renderScansByMesaChart(data) {
  if (!elements.chartScansByMesa) return;

  // destrói gráfico anterior
  if (charts.scansByMesa) {
    charts.scansByMesa.destroy();
    charts.scansByMesa = null;
  }

  const list = Array.isArray(data?.porMesa) ? data.porMesa : [];
  if (!list.length) {
    // limpa canvas se não tem dados
    const ctx = elements.chartScansByMesa.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  const top = [...list]
    .map(i => ({
      label: formatMesaLabel(getMesaRawLabel(i)),
      scans: getMesaScans(i),
    }))
    .filter(x => x.scans > 0)               // se quiser mostrar zero, remove essa linha
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 10);

  if (!top.length) {
    const ctx = elements.chartScansByMesa.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  charts.scansByMesa = buildBarHorizontal(
    elements.chartScansByMesa.getContext("2d"),
    top.map(i => i.label),
    top.map(i => i.scans),
    "Scans por Mesa",
    "#00d9ff"
  );
}

/* ==========================================================
   ENGAJAMENTO POR MESA — TABELA
   ========================================================== */

function renderTabelaEngagementByMesa(list) {
  const tbody = elements.tableEngagementByMesa;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const rows = safe.map((item) => {
    // Mesmo padrão de label do card "Escaneamento por Mesa/QRCODE"
    const mesaRaw =
      item.mesa ||
      item.qrLabel ||
      item.label ||
      "QR/mesa-desconhecido";

    const mesaLabel = (typeof formatMesaLabel === "function")
      ? formatMesaLabel(mesaRaw)
      : String(mesaRaw);

    // Tempo médio em segundos (fallback seguro)
    const avgTimeSec = Number(item.avgTimeSec ?? item.avgTime ?? 0) || 0;

    // Total de sessões (aceita vários nomes, mas nunca deixa NaN)
    const sessions = Number(
      item.sessions ??
      item.sessionCount ??
      item.totalSessions ??
      item.scans ??
      item.totalScans ??
      0
    ) || 0;

    // Total de interações (cliques, infos, etc.)
    const totalInteractions = Number(
      item.totalInteractions ??
      item.interactions ??
      item.clicks ??
      0
    ) || 0;

    // ===== Interações/Sessão =====
    // Regra:
    // 1) se vier pronto (string ou number), usa;
    // 2) senão, calcula totalInteractions / sessions se der;
    // 3) se nada der, fica 0.
    let interactionsPerSession;

    const rawIps = item.interactionsPerSession;
    const ipsNumber = rawIps != null ? Number(rawIps) : NaN;

    if (!Number.isNaN(ipsNumber)) {
      interactionsPerSession = ipsNumber;
    } else if (sessions > 0 && totalInteractions > 0) {
      interactionsPerSession = totalInteractions / sessions;
    } else {
      interactionsPerSession = 0;
    }

    const interactionsPerSessionStr =
      Number.isFinite(interactionsPerSession) && interactionsPerSession > 0
        ? interactionsPerSession.toFixed(1).replace(".", ",")
        : "0";

    return `
      <tr>
        <td>${mesaLabel}</td>
        <td style="text-align:center">${formatDurationMMSS(avgTimeSec)}</td>
        <td style="text-align:center">${interactionsPerSessionStr}</td>
        <td style="text-align:right">${toBR(sessions)}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

/* ==========================================================
   ENGAJAMENTO POR MESA — GRÁFICO
   ========================================================== */

function renderEngagementByMesaChart(data) {
  if (!elements.chartEngagementByMesa) return;

  // destrói gráfico anterior se existir
  if (charts.engagementByMesa) {
    charts.engagementByMesa.destroy();
    charts.engagementByMesa = null;
  }

  const source = Array.isArray(data?.porMesa) ? data.porMesa : [];
  const canvas = elements.chartEngagementByMesa;
  const ctx = canvas.getContext("2d");

  // se não tiver dados, limpa o canvas e sai
  if (!source.length) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  // ordena pelas mesas com mais sessões e pega TOP 10
  const top = [...source]
    .sort((a, b) => {
      const sa = Number(
        a.sessions ??
        a.sessionCount ??
        a.totalSessions ??
        a.scans ??
        a.totalScans ??
        0
      ) || 0;

      const sb = Number(
        b.sessions ??
        b.sessionCount ??
        b.totalSessions ??
        b.scans ??
        b.totalScans ??
        0
      ) || 0;

      return sb - sa;
    })
    .slice(0, 10);

  const labels = top.map((item) => {
    const mesaRaw =
      item.mesa ||
      item.qrLabel ||
      item.label ||
      "QR/mesa-desconhecido";

    return (typeof formatMesaLabel === "function")
      ? formatMesaLabel(mesaRaw)
      : String(mesaRaw);
  });

  const values = top.map((item) =>
    Number(
      item.sessions ??
      item.sessionCount ??
      item.totalSessions ??
      item.scans ??
      item.totalScans ??
      0
    ) || 0
  );

  charts.engagementByMesa = buildBarHorizontal(
    ctx,
    labels,
    values,
    "Sessões",
    "#3b82f6"
  );
}


/* ==========================================================
   SESSÕES POR PERÍODO
   ========================================================== */

// helper local para acumular
function acumularArray(arr = []) {
  let soma = 0;
  return arr.map(v => {
    const n = Number(v) || 0;
    soma += n;
    return soma;
  });
}

function renderTabelaSessoes(labels, sessoes, unicos) {
  const tbody = elements.tbodySessoes;
  if (!tbody) return;

  if (!labels || !labels.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const sessoesAcum = acumularArray(sessoes || []);
  const unicosAcum  = acumularArray(unicos || []);

  const rows = labels.map((label, idx) => {
    const s = sessoesAcum[idx] || 0;
    const u = unicosAcum[idx] || 0;
    const media = u ? (s / u).toFixed(2) : "0.00";

    return `
      <tr>
        <td>${label}</td>
        <td style="text-align:center">${toBR(s)}</td>
        <td style="text-align:center">${toBR(u)}</td>
        <td style="text-align:right">${media}</td>
      </tr>`;
  }).join("");

  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

function renderSessoesChart(data) {
  if (!elements.chartSessoes) return;
  if (charts.sessoes) charts.sessoes.destroy();

  const labels   = data.rangeLabels || [];
  const sessoes  = (data.daily && data.daily.sessoes) || [];
  const sessoesAcum = acumularArray(sessoes);

  charts.sessoes = buildLineChart(
    elements.chartSessoes.getContext("2d"),
    labels,
    sessoesAcum,
    "Sessões acumuladas",
    "#3b82f6",
    (ctx) => ` ${toBR(ctx.parsed.y)} sessão(ões) acumuladas`
  );
}

/* ==========================================================
   TEMPO MÉDIO (CARDÁPIO)
   ========================================================== */

// Helper: formata o valor numérico do eixo Y em S / M / H
function formatAxisTimeShortFromSeconds(sec) {
  const total = Math.max(0, Number(sec) || 0);

  if (total === 0) return "0";

  // até 59s → mostra em segundos
  if (total < 60) {
    const v = Math.round(total);
    return `${v} S`;
  }

  // de 1min até 59min59s → mostra em minutos
  if (total < 3600) {
    const minutes = total / 60;
    const v =
      minutes < 10
        ? minutes.toFixed(1)      // ex: 1,2 M
        : Math.round(minutes).toString();
    return `${v.replace(".", ",")} M`;
  }

  // 1h ou mais → mostra em horas
  const hours = total / 3600;
  const v =
    hours < 10
      ? hours.toFixed(1)          // ex: 1,5 H
      : Math.round(hours).toString();
  return `${v.replace(".", ",")} H`;
}

// monta lista acumulada: média ponderada pelo nº de amostras
function buildTempoMenuAcumulado(list) {
  const safe = Array.isArray(list) ? list : [];
  let totalAmostras = 0;
  let somaPonderadaSec = 0;

  return safe.map((i) => {
    const am = Number(i.amostras) || 0;
    const mediaDiaSec = Number(i.mediaSec) || 0;

    totalAmostras += am;
    somaPonderadaSec += mediaDiaSec * am;

    const mediaAcumSec =
      totalAmostras > 0 ? Math.round(somaPonderadaSec / totalAmostras) : 0;

    return {
      periodo: i.periodo,
      mediaSec: mediaAcumSec,      // média global acumulada até o dia
      medianaSec: i.medianaSec,    // ainda por dia (aprox)
      amostras: totalAmostras      // amostras acumuladas
    };
  });
}

function renderTabelaTempoMenu(list) {
  const tbody = elements.tableAvgTimeMenu;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const acumulado = buildTempoMenuAcumulado(safe);

  const rows = acumulado.map((i) => `
    <tr>
      <td>${i.periodo}</td>
      <td style="text-align:center">${formatDurationMMSS(i.mediaSec)}</td>
      <td style="text-align:center">${formatDurationMMSS(i.medianaSec)}</td>
      <td style="text-align:right">${toBR(i.amostras)}</td>
    </tr>
  `).join("");

  tbody.innerHTML = rows;
}

function renderAvgTimeMenuChart(data) {
  if (!elements.chartAvgTimeMenu) return;
  if (charts.avgTimeMenu) charts.avgTimeMenu.destroy();

  const ctx = elements.chartAvgTimeMenu.getContext("2d");
  const tempoMenuBase = Array.isArray(data.tempoMenu) ? data.tempoMenu : [];
  const tempoMenu = buildTempoMenuAcumulado(tempoMenuBase);

  const labels = tempoMenu.map((i) => i.periodo);
  const values = tempoMenu.map((i) => Number(i.mediaSec || 0)); // segundos acumulados (média global)

  if (!labels.length) {
    charts.avgTimeMenu = null;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  charts.avgTimeMenu = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Tempo Médio acumulado",
          data: values,
          borderColor: "#10b981",
          backgroundColor: "rgba(16,185,129,0.15)",
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // Tooltip sempre em MM:SS bonitinho
            label: (context) => {
              const sec = context.parsed.y || 0;
              return ` ${formatDurationMMSS(sec)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "#1f2937" },
          ticks: { color: "#9ca3af" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "#1f2937" },
          ticks: {
            color: "#9ca3af",
            // Aqui entra o S / M / H no eixo
            callback: (value) =>
              formatAxisTimeShortFromSeconds(Number(value)),
          },
        },
      },
    },
  });
}

/* ==========================================================
   HORÁRIO DE PICO
   ========================================================== */

// Normaliza uma linha de pico (data, hora, scans)
function normalizePeakRecord(item) {
  if (!item) return null;

  const rawDate =
    item.data ??
    item.dia ??
    item.date ??
    item.timestamp ??
    item.dateTime ??
    item.datetime ??
    null;

  let dateObj = null;

  if (rawDate instanceof Date) {
    dateObj = rawDate;
  } else if (typeof rawDate === "string") {
    let m;

    // dd/mm/aaaa
    m = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      dateObj = new Date(+yyyy, +mm - 1, +dd);
    } else {
      // aaaa-mm-dd ou aaaa-mm-ddThh:mm:ss
      m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        const [, yyyy, mm2, dd2] = m;
        dateObj = new Date(+yyyy, +mm2 - 1, +dd2);
      } else {
        // fallback: deixa o JS tentar parsear
        const tmp = new Date(rawDate);
        if (!isNaN(tmp.getTime())) dateObj = tmp;
      }
    }
  }

  let dateLabel = "--";
  let dateSort  = 0;

  if (dateObj && !isNaN(dateObj.getTime())) {
    // usa o helper que você já tem no arquivo
    dateLabel = formatDateBR(dateObj);   // ex: 11/12/2025
    dateSort  = dateObj.getTime();       // para ordenar
  }

  const hour  = Number(item.hora ?? item.hour ?? 0) || 0;
  const scans = Number(item.scans ?? item.totalScans ?? 0) || 0;

  return { dateLabel, dateSort, hour, scans };
}

/* --------- TABELA --------- */
function renderTabelaPeakHours(list) {
  const tbody = elements.tablePeakHours;
  if (!tbody) return;

  const arr = Array.isArray(list) ? list : [];

  if (!arr.length) {
    tbody.innerHTML =
      `<tr><td colspan="3" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const normalized = arr
    .map(normalizePeakRecord)
    .filter(Boolean);

  if (!normalized.length) {
    tbody.innerHTML =
      `<tr><td colspan="3" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // >>> DATA / HORA MAIS NOVA SEMPRE EM CIMA <<<
  normalized.sort((a, b) => {
    if (a.dateSort !== b.dateSort) return b.dateSort - a.dateSort; // data mais nova primeiro
    return b.hour - a.hour;                                        // mesma data → hora maior primeiro
  });

  const rows = normalized.map(row => `
    <tr>
      <td>${row.dateLabel}</td>
      <td style="text-align:center">${pad2(row.hour)}h</td>
      <td style="text-align:right">${toBR(row.scans)}</td>
    </tr>
  `).join("");

  tbody.innerHTML = rows;
}

/* --------- GRÁFICO --------- */
function renderPeakHoursChart(data) {
  if (!elements.chartPeakHours) return;
  if (charts.peakHours) {
    charts.peakHours.destroy();
    charts.peakHours = null;
  }

  const list = Array.isArray(data?.picos) ? data.picos : [];
  if (!list.length) {
    const ctx = elements.chartPeakHours.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  const normalized = list
    .map(normalizePeakRecord)
    .filter(Boolean);

  if (!normalized.length) {
    const ctx = elements.chartPeakHours.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  // Agrupa por hora somando scans de todos os dias
  const bucket = new Map();
  for (const rec of normalized) {
    bucket.set(rec.hour, (bucket.get(rec.hour) || 0) + rec.scans);
  }

  const hours  = Array.from(bucket.keys()).sort((a, b) => a - b);
  const labels = hours.map(h => `${pad2(h)}h`);
  const values = hours.map(h => bucket.get(h));

  charts.peakHours = new Chart(
    elements.chartPeakHours.getContext("2d"),
    {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Scans por hora",
          data: values,
          backgroundColor: "#3b82f6"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    }
  );
}

/* ==========================================================
   USO DO BOTÃO "LIKE"
   ========================================================== */

function renderLikeUsage(data) {
  if (!data) return;
  try {
    renderLikeKpis(data);
    renderTabelaLikeUsage(data);
    renderLikeUsageChart(data);
  } catch (err) {
    console.error("[METRICAS] Erro em renderLikeUsage:", err);
  }
}

// ---- KPIs (cards grandes) ----
function renderLikeKpis(data) {
  if (!data || !data.kpis) return;

  const likeTotal    = Number(data.kpis.likeTotal    || 0);
  const dislikeTotal = Number(data.kpis.dislikeTotal || 0);

  const elLike =
    (window.elements && elements.cardLikeTotal) ||
    document.getElementById("kpiLikeTotal") ||
    document.getElementById("kpi-like-total");

  const elDislike =
    (window.elements && elements.cardDislikeTotal) ||
    document.getElementById("kpiDislikeTotal") ||
    document.getElementById("kpi-dislike-total");

  if (elLike)    elLike.textContent    = toBR(likeTotal);
  if (elDislike) elDislike.textContent = toBR(dislikeTotal);
}

// ---- helper: % assinada (sempre deixa negativo quando tem mais dislike) ----
function computeSignedLikePct(item) {
  const likes    = Number(item.likes    || 0);
  const dislikes = Number(item.dislikes || 0);
  const total    = likes + dislikes;
  if (!total) return 0;

  // score em %: -100% só dislike, +100% só like
  const score = ((likes - dislikes) / total) * 100;
  // 1 casa decimal
  return Math.round(score * 10) / 10;
}

// ---- Tabela "Item / Like / Deslike / % do Like" ----
function renderTabelaLikeUsage(data) {
  const tbody =
    (window.elements && elements.tableLikeUsage) ||
    document.getElementById("tableLikeUsage") ||
    document.getElementById("table-like-usage-body");

  if (!tbody) return;

  const base = (data && Array.isArray(data.topItems)) ? data.topItems : [];

  // só itens que têm pelo menos 1 like ou dislike
  const list = base.filter(i => (Number(i.likes) || 0) || (Number(i.dislikes) || 0));

  if (!list.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // ---- ORDENAÇÃO: 1) % assinada desc  2) Likes desc  3) interações desc ----
  const sorted = [...list].sort((a, b) => {
    const pctA = computeSignedLikePct(a);
    const pctB = computeSignedLikePct(b);

    if (pctB !== pctA) return pctB - pctA; // maior primeiro

    const likesA = Number(a.likes || 0);
    const likesB = Number(b.likes || 0);
    if (likesB !== likesA) return likesB - likesA;

    const totalA = likesA + Number(a.dislikes || 0);
    const totalB = likesB + Number(b.dislikes || 0);
    return totalB - totalA;
  });

  const rows = sorted.map(i => {
    const likes    = Number(i.likes    || 0);
    const dislikes = Number(i.dislikes || 0);
    const total    = likes + dislikes;

    const signedPct = computeSignedLikePct(i);

    // cor baseada na % assinada (global, independente de e-mail)
    let color = "#9ca3af"; // cinza padrão

    if (total === 0) {
      color = "#9ca3af";         // sem interação
    } else if (signedPct > 0) {
      color = "#22c55e";         // mais like que dislike → verde
    } else if (signedPct < 0) {
      color = "#ef4444";         // mais dislike que like → vermelho
    } else {
      color = "#9ca3af";         // empate → cinza
    }

    const pctText = `${signedPct.toFixed(1).replace(".", ",")}%`;

    const rawName =
      i.item ||
      i.name ||
      i.label ||
      i.title ||
      i.modelName ||
      "Item";

    const nomeItem = typeof mapItemName === "function"
      ? mapItemName(rawName)
      : String(rawName);

    return `
      <tr>
        <td>${nomeItem}</td>
        <td style="text-align:center">${toBR(likes)}</td>
        <td style="text-align:center">${toBR(dislikes)}</td>
        <td style="text-align:right">
          <span style="color:${color}">${pctText}</span>
        </td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

// ---- Gráfico diário (linha) de likes ----
function renderLikeUsageChart(data) {
  const canvas =
    (window.elements && elements.chartLikeUsage) ||
    document.getElementById("chartLikeUsage");

  if (!canvas) return;

  if (window.charts && charts.likeUsage) {
    charts.likeUsage.destroy();
  }

  const labels = (data && data.rangeLabels) || [];
  const likes  = (data && data.daily && data.daily.likes) || [];

  const hasData =
    Array.isArray(likes) && likes.some(v => Number(v) > 0);

  if (!hasData) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (window.charts) charts.likeUsage = null;
    return;
  }

  if (!window.charts) window.charts = {};

  charts.likeUsage = buildLineChart(
    canvas.getContext("2d"),
    labels,
    likes,
    "Likes por dia",
    "#22c55e",
    (ctx) => ` ${toBR(ctx.parsed.y)} like(s)`
  );
}

// ADAPTADOR DE DADOS PARA O BLOCO DE LIKE
function getLikeUsageBlock(data) {
  if (!data) return null;

  // Se a API já mandar um bloco separado (data.likeUsage), usa ele
  if (data.likeUsage) return data.likeUsage;

  const topItems = Array.isArray(data.topItems) ? data.topItems : [];

  // Se vier kpis global do backend, usa; senão calcula pelo topItems
  const likeTotal = (data.kpis && typeof data.kpis.likeTotal === "number")
    ? data.kpis.likeTotal
    : topItems.reduce((acc, i) => acc + (Number(i.likes) || 0), 0);

  const dislikeTotal = (data.kpis && typeof data.kpis.dislikeTotal === "number")
    ? data.kpis.dislikeTotal
    : topItems.reduce((acc, i) => acc + (Number(i.dislikes) || 0), 0);

  return {
    kpis: {
      likeTotal,
      dislikeTotal,
    },
    topItems,
    daily: {
      likes: (data.daily && Array.isArray(data.daily.likes))
        ? data.daily.likes
        : [],
    },
    rangeLabels: data.rangeLabels || [],
  };
}

/* ==========================================================
   TEMPO POR ITEM
   ========================================================== */

// Helper: encurta nome só para o gráfico (tabela continua full)
function shortenItemLabel(label, max = 18) {
  const s = String(label || "");
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// Espera receber OU:
//   renderTabelaTimePerItem(data.topItems)
//   renderTabelaTimePerItem(data)   // onde data.topItems existe
function renderTabelaTimePerItem(source) {
  const tbody = elements.tableTimePerItem;
  if (!tbody) return;

  // Aceita tanto array direto quanto objeto com .topItems
  const list = Array.isArray(source)
    ? source
    : (source && Array.isArray(source.topItems) ? source.topItems : []);

  if (!list.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const totalViews = sum(list.map(i => i.views || 0));

  const rows = list.map(i => `
    <tr>
      <td>${mapItemName(i.item)}</td>
      <td style="text-align:center">
        ${formatDurationMMSS(i.avgTimeSec || 0)}
      </td>
      <td style="text-align:center">
        ${toBR(i.views || 0)}
      </td>
      <td style="text-align:right">
        ${pct(i.views || 0, totalViews)}
      </td>
    </tr>
  `).join("");

  tbody.innerHTML = rows;
}

function renderTimePerItemChart(data) {
  const canvas = elements.chartTimePerItem;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (charts.timePerItem) {
    charts.timePerItem.destroy();
    charts.timePerItem = null;
  }

  const listRaw = (data && Array.isArray(data.topItems))
    ? data.topItems
    : [];
  const top = listRaw
    .slice() // copia
    .sort((a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0))
    .slice(0, 10);

  // Se não tiver nada, desenha um gráfico "Sem dados" pra não quebrar layout
  if (!top.length) {
    charts.timePerItem = buildBarHorizontal(
      ctx,
      ["Sem dados"],
      [0],
      "Tempo médio (s)",
      "#f59e0b"
    );
    return;
  }

  // Nome completo (usado na tabela e para lógica)
  const fullNames = top.map(i => mapItemName(i.item));
  // Nome encurtado só para o eixo do gráfico
  const axisLabels = fullNames.map(n => shortenItemLabel(n, 18));
  const values     = top.map(i => i.avgTimeSec || 0);

  charts.timePerItem = buildBarHorizontal(
    ctx,
    axisLabels,
    values,
    "Tempo médio (s)",
    "#f59e0b"
  );
}

/* ==========================================================
   TEMPO POR CATEGORIA
   ========================================================== */

function renderTabelaTimeByCategory(list){
  const tbody = elements.tbodyTimeByCategory;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // base para cálculo de % quando pctTotalTime não vier da API
  const totalBase = safe.reduce((acc, i) => {
    const totalTime =
      Number(i.totalTimeSec || 0) ||
      (Number(i.avgTimeSec || 0) * Number(i.sessions || 0));
    return acc + (totalTime || 0);
  }, 0);

  // ORDEM: 1) tempo médio desc  2) sessões desc
  const sorted = [...safe].sort((a, b) => {
    const avgA = Number(a.avgTimeSec || 0);
    const avgB = Number(b.avgTimeSec || 0);

    if (avgB !== avgA) return avgB - avgA;

    const sessA = Number(a.sessions || 0);
    const sessB = Number(b.sessions || 0);
    return sessB - sessA;
  });

  const rows = sorted.map(i => {
    const categoria = mapCategoryName(i.category);

    const avgTimeSec = Number(i.avgTimeSec || 0);
    const sessions   = Number(i.sessions   || 0);

    // 1ª opção: usar o que vier pronto
    let pctStr = (i.pctTotalTime != null && i.pctTotalTime !== "undefined")
      ? String(i.pctTotalTime)
      : null;

    // 2ª opção: calcular se não tiver pctTotalTime
    if (!pctStr) {
      const totalTime =
        Number(i.totalTimeSec || 0) ||
        (avgTimeSec * sessions);

      if (totalBase > 0 && totalTime > 0) {
        const pctVal = (totalTime / totalBase) * 100;
        pctStr = `${pctVal.toFixed(1).replace(".", ",")}%`;
      } else {
        pctStr = "0%";
      }
    }

    return `
      <tr>
        <td>${categoria}</td>
        <td style="text-align:center">${formatDurationMMSS(avgTimeSec)}</td>
        <td style="text-align:center">${toBR(sessions)}</td>
        <td style="text-align:right">${pctStr}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

function renderTimeByCategoryChart(data){
  if (!elements.chartTimeByCategory) return;
  if (charts.timeByCategory) charts.timeByCategory.destroy();

  const list = Array.isArray(data.timeByCategory) ? data.timeByCategory : [];

  if (!list.length) {
    const ctx = elements.chartTimeByCategory.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    charts.timeByCategory = null;
    return;
  }

  // mesma ordem da tabela: tempo médio desc, depois sessões desc
  const sorted = [...list].sort((a, b) => {
    const avgA = Number(a.avgTimeSec || 0);
    const avgB = Number(b.avgTimeSec || 0);

    if (avgB !== avgA) return avgB - avgA;

    const sessA = Number(a.sessions || 0);
    const sessB = Number(b.sessions || 0);
    return sessB - sessA;
  });

  charts.timeByCategory = buildBarHorizontal(
    elements.chartTimeByCategory.getContext("2d"),
    sorted.map(i => mapCategoryName(i.category)),
    sorted.map(i => Number(i.avgTimeSec || 0)),
    "Tempo médio (s)",
    "#10b981"
  );
}

/* ==========================================================
   BOTÃO INFO (POR ITEM)
   ========================================================== */

function renderTabelaInfoPerItem(list){
  const tbody = elements.tableInfoPerItem;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML =
      `<tr><td colspan="3" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // helper: quantos cliques Info o item teve
  const getInfoClicks = (item) => {
    return Number(
      item.clicksInfo ??
      item.infoClicks ??
      item.infoCount ??
      item.infoOpens ??
      0
    ) || 0;
  };

  // ORDEM: 1) Cliques Info desc  2) Tempo médio (Info) desc
  const sorted = [...safe].sort((a, b) => {
    const ca = getInfoClicks(a);
    const cb = getInfoClicks(b);
    if (cb !== ca) return cb - ca;

    const ta = Number(a.avgTimeSec || 0);
    const tb = Number(b.avgTimeSec || 0);
    return tb - ta;
  });

  const rows = sorted.map(item => {
    const rawName =
      item.item ||
      item.name ||
      item.label ||
      item.title ||
      item.modelName ||
      "Item";

    const nomeItem = typeof mapItemName === "function"
      ? mapItemName(rawName)
      : String(rawName);

    const clicksInfo = getInfoClicks(item);
    const avgTimeSec = Number(item.avgTimeSec || 0);

    return `
      <tr>
        <td>${nomeItem}</td>
        <td style="text-align:center">${formatDurationMMSS(avgTimeSec)}</td>
        <td style="text-align:right">${toBR(clicksInfo)}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

function renderInfoPerItemChart(data){
  if (!elements.chartInfoPerItem) return;
  if (charts.infoPerItem) charts.infoPerItem.destroy();

  // Fonte: se existir data.infoPerItem usa ela; senão cai em data.topItems
  const source =
    (data && Array.isArray(data.infoPerItem) && data.infoPerItem.length)
      ? data.infoPerItem
      : (data && Array.isArray(data.topItems) ? data.topItems : []);

  if (!source.length) {
    const ctx = elements.chartInfoPerItem.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    charts.infoPerItem = null;
    return;
  }

  const getInfoClicks = (item) => {
    return Number(
      item.clicksInfo ??
      item.infoClicks ??
      item.infoCount ??
      item.infoOpens ??
      0
    ) || 0;
  };

  // mesma ordenação da tabela: cliques desc, depois tempo médio desc
  const sorted = [...source].sort((a, b) => {
    const ca = getInfoClicks(a);
    const cb = getInfoClicks(b);
    if (cb !== ca) return cb - ca;

    const ta = Number(a.avgTimeSec || 0);
    const tb = Number(b.avgTimeSec || 0);
    return tb - ta;
  });

  const top = sorted.slice(0, 10);

  charts.infoPerItem = buildBarHorizontal(
    elements.chartInfoPerItem.getContext("2d"),
    top.map(i => {
      const rawName =
        i.item ||
        i.name ||
        i.label ||
        i.title ||
        i.modelName ||
        "Item";

      const nomeItem = typeof mapItemName === "function"
        ? mapItemName(rawName)
        : String(rawName);

      return (typeof shortenItemLabel === "function")
        ? shortenItemLabel(nomeItem, 18)
        : nomeItem;
    }),
    top.map(i => getInfoClicks(i)),
    "Cliques Info",
    "#3b82f6"
  );
}

/* ==========================================================
   USO GERAL DO BOTÃO INFO (SÉRIE DIÁRIA)
   ========================================================== */

function renderInfoUsageChart(data){
  const canvas = elements.chartInfoUsage;
  if (!canvas) return;

  if (charts.infoUsage) {
    charts.infoUsage.destroy();
    charts.infoUsage = null;
  }

  const labels = (data && data.rangeLabels) || [];
  const infoSeries =
    (data && data.daily && Array.isArray(data.daily.info))
      ? data.daily.info
      : [];

  const hasData = infoSeries.some(v => Number(v) > 0);
  if (!hasData){
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }

  charts.infoUsage = buildLineChart(
    canvas.getContext("2d"),
    labels,
    infoSeries,
    "Cliques no Info (dia)",
    "#f97316",
    (ctx) => ` ${toBR(ctx.parsed.y)} clique(s)`
  );
}

/* ==========================================================
   DISPOSITIVOS USADOS
   ========================================================== */

function renderTabelaDeviceDistribution(list) {
  const tbody = elements.tableDeviceDistribution;
  if (!tbody) return;

  // Garante array
  const arr = Array.isArray(list) ? list : [];

  if (!arr.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // Como a API pode mandar com nomes diferentes, tratamos tudo aqui
  const getSessions = (d) => Number(
    d.sessions ??
    d.sessionCount ??
    d.totalSessions ??
    d.scans ??
    d.totalScans ??
    0
  ) || 0;

  const totalSessions = arr.reduce((acc, d) => acc + getSessions(d), 0);

  const rows = arr.map((item) => {
    const label =
      item.label ||
      item.device ||
      item.deviceClass ||
      item.type ||
      "Desconhecido";

    const sessions    = getSessions(item);
    // AQUI: média por sessão (já vem do Lambda)
    const avgTimeSec  = Number(item.avgTimeSec ?? item.avgTime ?? 0) || 0;
    const percent     = totalSessions ? pct(sessions, totalSessions) : "0%";

    return `
      <tr>
        <td>${label}</td>
        <td style="text-align:center">${percent}</td>
        <td style="text-align:center">${toBR(sessions)}</td>
        <td style="text-align:right">${formatDurationMMSS(avgTimeSec)}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

function renderDevicesChart(data) {
  const canvas = elements.chartDevices;
  if (!canvas) return;

  if (charts.devices) {
    charts.devices.destroy();
    charts.devices = null;
  }

  // Aceita vários formatos de saída da API
  const list = Array.isArray(data?.devices)
    ? data.devices
    : (Array.isArray(data?.deviceDistribution)
        ? data.deviceDistribution
        : []);

  if (!list.length) {
    // nada de dispositivo → não desenha gráfico
    return;
  }

  const getLabel = (d) =>
    d.label ||
    d.device ||
    d.deviceClass ||
    d.type ||
    "Desconhecido";

  const getValue = (d) => {
    if (d.value != null) return Number(d.value) || 0;
    // se não tiver "value", usa sessões como peso
    return Number(
      d.sessions ??
      d.sessionCount ??
      d.totalSessions ??
      d.scans ??
      d.totalScans ??
      0
    ) || 0;
  };

  const labels = list.map(getLabel);
  const values = list.map(getValue);

  // Se tudo for zero, não faz sentido desenhar donut
  if (!values.some(v => v > 0)) return;

  charts.devices = buildDoughnut(
    canvas.getContext("2d"),
    labels,
    values
  );
}

/* ==========================================================
   MODELOS MAIS EXIBIDOS
   ========================================================== */

// Normaliza + ORDENA (mais exibido → menos exibido)
function getTopModelsList(data) {
  const d = data || {};
  let list = [];

  // 1) Se o backend mandar topModels, usa
  if (Array.isArray(d.topModels) && d.topModels.length) {
    list = d.topModels.map((m) => ({
      model:
        m.model ||
        m.item ||
        m.id ||
        m.itemId ||
        m.slug ||
        "Desconhecido",
      views: Number(m.views ?? m.viewCount ?? m.scans ?? 0) || 0,
      avgTimeSec: Number(m.avgTimeSec ?? m.avgTime ?? 0) || 0,
      errors: Number(m.errors ?? m.errorCount ?? 0) || 0
    }));
  } else if (Array.isArray(d.topItems) && d.topItems.length) {
    // 2) Fallback: monta a partir de topItems
    list = d.topItems.map((it) => ({
      model:
        it.item ||
        it.model ||
        it.id ||
        it.itemId ||
        it.slug ||
        "Desconhecido",
      views: Number(it.views ?? it.viewCount ?? it.scans ?? 0) || 0,
      avgTimeSec: Number(it.avgTimeSec ?? it.avgTime ?? 0) || 0,
      errors: 0
    }));
  }

  return list
    .filter(x => x.views > 0 || x.errors > 0)
    .sort((a, b) => {
      const vDiff = (b.views || 0) - (a.views || 0);
      if (vDiff !== 0) return vDiff;
      return (b.avgTimeSec || 0) - (a.avgTimeSec || 0);
    });
}

// AGORA NÃO VAMOS USAR A TABELA → LIMPA O TBODY
function renderTabelaTopModels(data) {
  const tbody = elements.tableTopModels;
  if (!tbody) return;

  // some tudo que tinha na parte de baixo
  tbody.innerHTML = "";
}

function renderTopModelsChart(data) {
  const canvas = elements.chartTopModels;
  if (!canvas) return;

  if (charts.topModels) {
    charts.topModels.destroy();
    charts.topModels = null;
  }

  const list = getTopModelsList(data);
  const top = list.slice(0, 10); // TOP 10 AGORA

  if (!top.length) return;

  charts.topModels = buildBarHorizontal(
    canvas.getContext("2d"),
    top.map(i => mapItemName(i.model)),
    top.map(i => i.views),
    "Exibições",
    "#10b981"
  );
}

/* ==========================================================
   SAÚDE DOS MODELOS
   ========================================================== */

function renderTabelaModelErrors(list){
  const tbody=elements.tableModelErrors; if(!tbody) return;
  const safe = Array.isArray(list) ? list : [];
  if (!safe.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const rows = safe.map(item=>`
    <tr>
      <td>${mapItemName(item.itemModel)}</td>
      <td>${item.error}</td>
      <td style="text-align:center">${toBR(item.occurrences)}</td>
      <td style="text-align:right">${formatDateBR(item.last)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

function renderModelHealthChart(data){
  if (!elements.chartModelHealth) return;
  if (charts.modelHealth) charts.modelHealth.destroy();

  const kpis = data.kpis || {};
  const labels = ["Carregados", "Erros"];
  const values = [kpis.modelsLoaded || 0, kpis.modelsErrors || 0];

  if (!values[0] && !values[1]) {
    const ctx = elements.chartModelHealth.getContext("2d");
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    charts.modelHealth = null;
    return;
  }

  charts.modelHealth = buildDoughnut(
    elements.chartModelHealth.getContext("2d"),
    labels,
    values
  );
}

/* ==========================================================
   INSIGHTS — FILA + TOOLTIP INLINE
   ========================================================== */

const MAX_INSIGHTS = 10; // exibir até 10 linhas
const insightsQueue = [];
let insightsTimer = null;

// pega token de auth (tenta alguns nomes comuns)
function getMetricsAuthToken() {
  try {
    return (
      sessionStorage.getItem("ar.token")      ||
      localStorage.getItem("ar.token")       ||
      sessionStorage.getItem("clienteToken") ||
      localStorage.getItem("clienteToken")   ||
      sessionStorage.getItem("jwtToken")     ||
      localStorage.getItem("jwtToken")       ||
      sessionStorage.getItem("token")        ||
      localStorage.getItem("token")
    );
  } catch {
    return null;
  }
}

/* ---------------------- TOOLTIP DOS INSIGHTS ---------------------- */

// tooltip separado só para INSIGHTS (não conflita com HelpPortal)
function ensureInsightTooltipPortal() {
  let tip = document.querySelector(".insight-tooltip-portal");
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "insight-tooltip-portal";
    tip.style.position = "fixed";
    tip.style.zIndex = "9999";
    tip.style.maxWidth = "320px";
    tip.style.background = "rgba(15,23,42,0.95)";
    tip.style.color = "#e5e7eb";
    tip.style.fontSize = "0.8rem";
    tip.style.lineHeight = "1.4";
    tip.style.padding = "8px 10px";
    tip.style.borderRadius = "6px";
    tip.style.border = "1px solid rgba(148,163,184,0.4)";
    tip.style.boxShadow = "0 10px 30px rgba(0,0,0,0.4)";
    tip.style.pointerEvents = "none";
    tip.style.display = "none";

    // linha nova: respeita \n como quebra de linha
    tip.style.whiteSpace = "pre-line";

    document.body.appendChild(tip);
  }
  return tip;
}


function positionInsightTooltip(tip, x, y) {
  const pad = 10;
  const rect = tip.getBoundingClientRect();
  let left = x + pad;
  let top  = y + pad;

  if (left + rect.width > window.innerWidth - 6) {
    left = x - rect.width - pad;
  }
  if (top + rect.height > window.innerHeight - 6) {
    top = y - rect.height - pad;
  }

  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}

function formatInsightDetail(raw) {
  if (!raw) return "";
  let s = String(raw).trim();

  // quebra em linhas
  const parts = s.split(/\r?\n+/);

  if (parts.length > 1) {
    const first = parts[0].trim();

    // se a primeira linha parece ser título com data, remove
    const looksLikeHeader =
      /an[áa]lise/i.test(first) ||      // começa com "Análise..."
      /\d{1,2}\/\d{1,2}/.test(first);   // contém data tipo 10/12

    if (looksLikeHeader) {
      parts.shift(); // tira a primeira linha
    }

    s = parts.join("\n").trim();
  }

  return s || raw;
}

function showInsightTooltipAt(text, x, y) {
  const tip = ensureInsightTooltipPortal();
  const formatted = formatInsightDetail(text);
  tip.textContent = formatted || "";
  tip.style.display = "block";
  positionInsightTooltip(tip, x, y);
}

function hideInsightTooltip() {
  const tip = document.querySelector(".insight-tooltip-portal");
  if (tip) tip.style.display = "none";
}

// some scroll/resize esconde o tooltip
window.addEventListener("scroll", hideInsightTooltip, { passive: true });
window.addEventListener("resize", hideInsightTooltip, { passive: true });

/* ---------------------- FILA + RENDERIZAÇÃO ---------------------- */

function pushInsight({ date, time, title, detail }) {
  // novo insight entra sempre no topo da fila
  insightsQueue.unshift({
    id: Date.now() + Math.random(),
    date,
    time,
    title,
    detail: detail || title
  });

  // se passar de MAX_INSIGHTS, remove os MAIS ANTIGOS (fim da fila)
  while (insightsQueue.length > MAX_INSIGHTS) {
    insightsQueue.pop();
  }

  renderInsights();
}

function renderInsights() {
  const ul =
    (window.elements && elements.insightsList) ||
    document.getElementById("insightsList");

  if (!ul) return;

  ul.innerHTML = "";

  // fila já está com MAIS NOVOS primeiro
  const list = [...insightsQueue];

  if (!list.length) {
    ul.innerHTML =
      '<li class="insight-item">' +
        '<span class="insight-stamp">--/--/---- --:--</span>' +
        '<span class="insight-msg">Sem insights por enquanto</span>' +
      "</li>";
    return;
  }

  list.forEach((item) => {
    const li  = document.createElement("li");
    li.className = "insight-item";

    const stamp = document.createElement("span");
    stamp.className = "insight-stamp";

    // força sempre HH:00 (coluna criada no minuto 0)
    let hourText = "--:--";
    if (item.time && item.time !== "--") {
      const hh = String(item.time).slice(0, 2); // pega só a hora
      hourText = `${hh}:00`;
    }

    stamp.textContent = `${item.date} ${hourText}`;

    const msg = document.createElement("span");
    msg.className = "insight-msg";
    msg.textContent = item.title;

    msg.addEventListener("mouseenter", (ev) => {
      showInsightTooltipAt(item.detail, ev.clientX, ev.clientY);
    });
    msg.addEventListener("mousemove", (ev) => {
      showInsightTooltipAt(item.detail, ev.clientX, ev.clientY);
    });
    msg.addEventListener("mouseleave", hideInsightTooltip);

    li.appendChild(stamp);
    li.appendChild(msg);
    ul.appendChild(li);
  });
}

/**
 * Recebe o payload da API (/metricas/insights),
 * normaliza e joga na fila (insightsQueue).
 * NÃO gera texto no front, só usa o que veio do backend.
 */
function startInsightScheduler(data) {
  if (insightsTimer) {
    clearInterval(insightsTimer);
    insightsTimer = null;
  }

  // limpa fila atual
  insightsQueue.length = 0;

  // aceita tanto { insights: [...] } quanto um array direto [...]
  const listRaw = Array.isArray(data)
    ? data
    : (data && Array.isArray(data.insights) ? data.insights : []);

  console.log("[INSIGHTS] lista bruta recebida pelo startInsightScheduler:", listRaw);

  if (!listRaw.length) {
    // nada veio da API → mostra mensagem padrão
    renderInsights();
    return;
  }

  const now = Date.now();

  const normalized = listRaw
    .map((raw) => {
      const tsRaw =
        raw.timestamp ||
        raw.ts ||
        raw.dateTime ||
        raw.datetime ||
        raw.dataHora ||
        raw.data ||
        raw.date ||
        null;

      const ts = tsRaw ? new Date(tsRaw).getTime() : now;
      if (Number.isNaN(ts)) return null;

      const d = new Date(ts);

      const title =
        raw.title ||
        raw.titulo ||
        raw.heading ||
        "Insight";

      // resumo dos dados
      const summary =
        raw.detail ||
        raw.summary ||
        raw.text ||
        raw.texto ||
        raw.descricao ||
        raw.description ||
        "";

      // dica funcional (opcional)
      const suggestion =
        raw.suggestion ||
        raw.sugestao ||
        raw.recommendation ||
        "";

      let detail = summary || title;
      if (suggestion) {
        detail += "\n\nComo usar isso na prática:\n" + suggestion;
      }

      return {
        ts,
        date: formatDateBR(d),     // helpers já existem no arquivo
        time: formatTimeBRSafe(d),
        title,
        detail
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)  // mais recente primeiro
    .slice(0, MAX_INSIGHTS);      // no máximo 10

  normalized.forEach((it) => {
    insightsQueue.push({
      id: it.ts + Math.random(),
      date: it.date,
      time: it.time,
      title: it.title,
      detail: it.detail
    });
  });

  renderInsights();
}

/* ---------------------- CHAMADA À API /metricas/insights ---------------------- */

async function fetchInsightsFromApi() {
  const token = getMetricsAuthToken();

  // mesma lógica de tenant usada no fetchMetrics
  const emailTenant =
    localStorage.getItem("ar.email") ||
    sessionStorage.getItem("ar.email");

  const tenantRaw = (emailTenant || AppState.tenant || "").trim();
  const tenantForApi = tenantKey(tenantRaw);

  // monta URL com base no API_BASE atual
  let base = "";
  try {
    if (typeof API_BASE === "string" && API_BASE.length) {
      base = API_BASE;
    }
  } catch {
    base = "";
  }

  let apiInsights;
  if (base) {
    // troca .../cliente por .../insights
    apiInsights = base.replace(/\/cliente$/i, "/insights");
  } else {
    // fallback relativo (se algum dia precisar)
    apiInsights = "/metricas/insights";
  }

  const params = new URLSearchParams();

  // datas no MESMO formato que o backend espera (dd/mm/aaaa)
  if (AppState.startDate instanceof Date) {
    params.set("startDate", formatDateBR(AppState.startDate));
  }
  if (AppState.endDate instanceof Date) {
    params.set("endDate", formatDateBR(AppState.endDate));
  }

  // tenant igual ao usado no /metricas/cliente
  if (tenantForApi) {
    params.set("tenant", tenantForApi);
  }

  const url = `${apiInsights}?${params.toString()}`;

  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  console.log("[INSIGHTS] chamando endpoint:", url);

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers
    });

    console.log("[INSIGHTS] status da resposta:", resp.status, resp.statusText);

    if (!resp.ok) {
      console.warn(
        "[METRICAS] Falha ao buscar /metricas/insights:",
        resp.status,
        resp.statusText
      );
      return { insights: [] };
    }

    const json = await resp.json().catch(() => null);

    console.log("[INSIGHTS] resposta bruta da API:", json);

    // se vier um array direto, normaliza para { insights: [...] }
    if (Array.isArray(json)) {
      return { insights: json };
    }

    return json || { insights: [] };
  } catch (err) {
    console.error("[METRICAS] Erro de rede em /metricas/insights:", err);
    return { insights: [] };
  }
}

/* ---------------------- ORQUESTRADOR: BUSCA GPT + RENDER ---------------------- */

// Essa é a função que você vai chamar no dashboard.
// Ela só consome o texto que o GPT gerou na Lambda (/metricas/insights)
// e joga na fila/tooltip — nada é criado no front.
async function loadInsightsWithGPT() {
  try {
    const data = await fetchInsightsFromApi(); // chama a rota que usa OpenAI no backend
    startInsightScheduler(data);               // normaliza e exibe
  } catch (err) {
    console.error("[INSIGHTS] Erro ao carregar insights:", err);
    startInsightScheduler({ insights: [] });
  }
}

/* ==========================================================
   LOAD & RENDER INTEGRADO AO DASHBOARD
   ========================================================== */

function safeRender(name, fn){
  try { fn(); }
  catch(e){ console.error(`[METRICAS] Quebrou em ${name}:`, e); }
}

async function loadAndRender() {
  if (!AppState.startDate || !AppState.endDate) setDefaultTodayRange();

  try {
    await ensureChartJs();
  } catch (e) {
    console.error("[METRICAS] Falha ao carregar Chart.js:", e);
  }

  let data = buildEmptyData();

  try {
    data = await fetchMetrics({
      tenant:    AppState.tenant,
      startDate: AppState.startDate,
      endDate:   AppState.endDate
    });
  } catch (err) {
    console.error("[METRICAS] Erro ao buscar métricas:", err);
    data = buildEmptyData();
  }

  console.log("[METRICAS] data bruto da API:", data);
  console.log("[DEBUG porMesa]", data?.porMesa);

  AppState.metricsData = data;

  // KPIs
  safeRender("renderKPIs", () => renderKPIs(data.kpis || {}));

  // Tabelas
  safeRender("renderTabelaMesaQR", () => renderTabelaMesaQR(data.porMesa || []));
  safeRender("renderTabelaSessoes", () => renderTabelaSessoes(
    data.rangeLabels || [],
    (data.daily && data.daily.sessoes) || [],
    (data.daily && data.daily.unicos) || []
  ));
  safeRender("renderTabelaTempoMenu", () => renderTabelaTempoMenu(data.tempoMenu || []));
  safeRender("renderTabelaTimeByCategory", () => renderTabelaTimeByCategory(data.timeByCategory || []));
  safeRender("renderTabelaTimePerItem", () => renderTabelaTimePerItem(data.topItems || []));
  safeRender("renderTabelaPeakHours", () => renderTabelaPeakHours(data.picos || []));
  safeRender("renderTabelaEngagementByMesa", () => renderTabelaEngagementByMesa(data.porMesa || []));
  safeRender("renderTabelaDeviceDistribution", () => renderTabelaDeviceDistribution(data.devices || []));
  safeRender("renderTabelaTopModels", () => renderTabelaTopModels(data)); // <- IMPORTANTE
  safeRender("renderTabelaModelErrors", () => renderTabelaModelErrors(data.modelErrors || []));
  safeRender("renderTabelaInfoPerItem", () => renderTabelaInfoPerItem(
    (Array.isArray(data.infoPerItem) && data.infoPerItem.length) ? data.infoPerItem : (data.topItems || [])
  ));

  // Like
  safeRender("renderLikeUsage", () => {
    const likeBlock = getLikeUsageBlock(data);
    renderLikeUsage(likeBlock);
  });

  // Gráficos
  safeRender("renderScansTotalChart", () => renderScansTotalChart(data));
  safeRender("renderScansByMesaChart", () => renderScansByMesaChart(data));
  safeRender("renderSessoesChart", () => renderSessoesChart(data));
  safeRender("renderAvgTimeMenuChart", () => renderAvgTimeMenuChart(data));
  safeRender("renderPeakHoursChart", () => renderPeakHoursChart(data));
  safeRender("renderDevicesChart", () => renderDevicesChart(data));
  safeRender("renderTimeByCategoryChart", () => renderTimeByCategoryChart(data));
  safeRender("renderTimePerItemChart", () => renderTimePerItemChart(data));
  safeRender("renderInfoPerItemChart", () => renderInfoPerItemChart(data));
  safeRender("renderInfoUsageChart", () => renderInfoUsageChart(data));
  safeRender("renderTopModelsChart", () => renderTopModelsChart(data));
  safeRender("renderModelHealthChart", () => renderModelHealthChart(data));
  safeRender("renderEngagementByMesaChart", () => renderEngagementByMesaChart(data));

  // Insights
  try {
    const insightsData = await fetchInsightsFromApi();
    startInsightScheduler(insightsData);
  } catch (err) {
    console.error("[INSIGHTS] Erro ao carregar:", err);
    startInsightScheduler({ insights: [] });
  }
}

/* ==========================================================
   BOOTSTRAP + AJUSTE VISUAL DE ALGUNS BLOCOS
   ========================================================== */

document.addEventListener("DOMContentLoaded", ()=>{
  // ✅ trava tudo aqui se não tiver login
  if (!requireAuthOrRedirect()) return;

  // normaliza tenant
  if (AppState.tenant) {
    AppState.tenant = tenantKey(AppState.tenant);
  }

  initFlatpickrIfAny();
  wireFilters();
  wireHelpBadges(document);

  setDefaultTodayRange();
  loadAndRender();

  let t;
  window.addEventListener("resize", ()=>{
    clearTimeout(t);
    t = setTimeout(loadAndRender, 200);
  });
});

// Centralização de alguns blocos KPI
function centerBlockByTitle(titleRegex, styleObj = {}) {
  const sections = document.querySelectorAll('.chart-section');
  for (const section of sections) {
    const titleEl = section.querySelector('h2, .section-title, header h2, .card-title');
    if (!titleEl) continue;
    const txt = (titleEl.textContent || '').trim();
    if (!titleRegex.test(txt)) continue;

    const kpiContainer =
      section.querySelector('.kpi-grid, .kpi-row, .kpi-wrap, .metrics-row, .cards, .cards-row') ||
      section.querySelector('.kpi-card')?.parentElement;

    if (!kpiContainer) continue;

    kpiContainer.style.display = 'flex';
    kpiContainer.style.flexWrap = 'wrap';
    kpiContainer.style.justifyContent = 'center';
    kpiContainer.style.gap = '2rem';
    kpiContainer.style.width = '100%';
    kpiContainer.style.marginInline = 'auto';

    Object.entries(styleObj).forEach(([k, v]) => (kpiContainer.style[k] = v));

    kpiContainer.querySelectorAll('.kpi-card, .card, .metric-card')
      .forEach(el => (el.style.textAlign = 'center'));
  }
}

function centerSelectedKPIBlocks() {
  centerBlockByTitle(/Uso do bot[aã]o/i, { gap: '1.5rem' });
  centerBlockByTitle(/Sa[úu]de dos Modelos/i, {});
}

document.addEventListener('DOMContentLoaded', centerSelectedKPIBlocks);

})();
