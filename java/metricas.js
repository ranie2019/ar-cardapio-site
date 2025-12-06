/* ==========================================================
   MÉTRICAS DASHBOARD — ARCardápio
   ========================================================== */

(function () {

/* ==========================================================
   GERAL — CONFIG, DOM, HELPERS, FETCH, CHART, INSIGHTS
   ========================================================== */

/* --------- BASE / CONFIGURAÇÃO GERAL --------- */
const USE_MOCK = false; // PRODUÇÃO: só dados reais
const API_BASE = "https://zoci6wmxqa.execute-api.us-east-1.amazonaws.com/metricas/cliente";

/* --------- MAPEAMENTO DE NOMES --------- */
const CATEGORY_MAP = {
  "Categoria 1": "Bebidas",
  "Categoria 2": "Pizzas",
  "Categoria 3": "Sobremesas",
  "Categoria 4": "Carnes",
  "Categoria 5": "Lanches",
};

const ITEM_MAP = {
  "Item 1": "Absolut Vodka",
  "Item 2": "Mussarela",
  "Item 3": "Coca-Cola",
  "Item 4": "Pizza Calabresa",
  "Item 5": "Tiramisu",
  "Item 6": "Picanha",
  "Item 7": "Sanduíche X-Tudo",
  "Item 8": "Suco de Laranja",
  "Item 9": "Brigadeiro",
  "Item 10": "Salada Caesar",
};

function mapCategoryName(genericName) {
  return CATEGORY_MAP[genericName] || genericName;
}
function mapItemName(genericName) {
  return ITEM_MAP[genericName] || genericName;
}

/* --------- ELEMENTOS (DOM) --------- */
function byId(id) { return document.getElementById(id); }

const elements = {
  // Filtros
  filterTenant: byId("filterTenant"),
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

  // 🔹 NOVO — elementos do bloco LIKE
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
  chartRecurrence: byId("chartRecurrence"),
  chartEngagementByMesa: byId("chartEngagementByMesa"),
  chartModelHealth: byId("chartModelHealth"),
  chartInfoPerItem: byId("chartInfoPerItem"),
  chartTopModels: byId("chartTopModels"),

  // Tabelas
  tbodyMesaQR: byId("tbodyMesaQR"),
  tbodySessoes: byId("tbodySessoes"),
  tableAvgTimeMenu: byId("tableAvgTimeMenu"),
  tbodyTimeByCategory: byId("tbodyTimeByCategory"),
  tableTimePerItem: byId("tableTimePerItem"),
  tablePeakHours: byId("tablePeakHours"),
  tableRecurrence: byId("tableRecurrence"),
  tableEngagementByMesa: byId("tableEngagementByMesa"),
  tableDeviceDistribution: byId("tableDeviceDistribution"),
  tableTopModels: byId("tableTopModels"),
  tableModelErrors: byId("tableModelErrors"),
  tableInfoPerItem: byId("tableInfoPerItem"),

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
  recurrence: null,
  engagementByMesa: null,
  modelHealth: null,
  infoPerItem: null,
  topModels: null,
  likeUsage: null, // 🔹 novo slot para o gráfico de likes
};

// expõe no escopo global para quem usa window.elements/window.charts
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
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
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
    clicksInfo: randomInt(5, 50)
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

  return {
    rangeLabels: labels,
    daily: { scans:dailyScans, sessoes:dailySessions, unicos:dailyUniques, info:dailyInfo },
    porMesa: mesaData,
    tempoMenu, picos, devices, topItems, timeByCategory, topCategories, kpis, recurrenceData, topModels, modelErrors
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
      modelsErrors: 0
    },
    recurrenceData: [],
    topModels: [],
    modelErrors: []
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

  const emailTenant =
    localStorage.getItem("ar.email") ||
    sessionStorage.getItem("ar.email");

  const tenantRaw  = (emailTenant || tenant || "").trim();
  const tenantSlug = tenantKey(tenantRaw);
  const tenantForApi = tenantRaw;

  console.log(
    "[METRICAS] tenant para API raw =", tenantRaw,
    "slug =", tenantSlug,
    "enviado =", tenantForApi
  );

  try {
    const params = new URLSearchParams();
    if (tenantForApi) params.append("tenant", tenantForApi);
    if (startDate instanceof Date) {
      params.append("startDate", formatDateBR(startDate));
    }
    if (endDate instanceof Date) {
      params.append("endDate", formatDateBR(endDate));
    }

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
  if(chartJsLoaded) return;
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

function buildLineChart(ctx, labels, data, label, color, tooltipCallback){
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
        backgroundColor: `rgba(59, 130, 246, 0.1)`,
        borderColor: color,
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

/* --------- INSIGHTS (fila + tooltips inline) --------- */

const MAX_INSIGHTS = 5;
const insightsQueue = [];
let insightsTimer = null;

function ensureTooltipPortal(){
  let tip = document.querySelector('.tooltip-portal');
  if (!tip){
    tip = document.createElement('div');
    tip.className = 'tooltip-portal';
    document.body.appendChild(tip);
  }
  return tip;
}
function positionTooltip(tip, x, y){
  const pad = 10;
  const rect = tip.getBoundingClientRect();
  let left = x + pad;
  let top  = y + pad;
  if (left + rect.width > window.innerWidth - 6) left = x - rect.width - pad;
  if (top + rect.height > window.innerHeight - 6) top = y - rect.height - pad;
  tip.style.left = `${left}px`;
  tip.style.top  = `${top}px`;
}
function showInlineTooltipAt(text, x, y){
  const tip = ensureTooltipPortal();
  tip.textContent = text || '';
  tip.style.display = 'block';
  positionTooltip(tip, x, y);
}
function hideInlineTooltip(){
  const tip = document.querySelector('.tooltip-portal');
  if (tip) tip.style.display = 'none';
}

function fmt2(n){ return String(n).padStart(2,'0'); }
function formatBRDate(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${fmt2(dt.getDate())}/${fmt2(dt.getMonth()+1)}/${dt.getFullYear()}`;
}
function formatTimeHM(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  return `${fmt2(dt.getHours())}:${fmt2(dt.getMinutes())}`;
}

function pushInsight({date, time, title, detail}){
  insightsQueue.push({
    id: Date.now() + Math.random(),
    date, time,
    title,
    detail: detail || title
  });
  while (insightsQueue.length > MAX_INSIGHTS) insightsQueue.shift();
  renderInsights();
}

function renderInsights(){
  const ul = elements.insightsList || document.getElementById('insightsList');
  if (!ul) return;

  ul.innerHTML = '';
  const list = [...insightsQueue].reverse();

  list.forEach(item => {
    const li  = document.createElement('li');
    li.className = 'insight-item';

    const stamp = document.createElement('span');
    stamp.className = 'insight-stamp';
    stamp.textContent = `${item.date} ${item.time}`;

    const msg = document.createElement('span');
    msg.className = 'insight-msg';
    msg.textContent = item.title;

    msg.addEventListener('mousemove', (ev) => {
      showInlineTooltipAt(item.detail, ev.clientX, ev.clientY);
    });
    msg.addEventListener('mouseenter', (ev) => {
      showInlineTooltipAt(item.detail, ev.clientX, ev.clientY);
    });
    msg.addEventListener('mouseleave', hideInlineTooltip);
    window.addEventListener('scroll', hideInlineTooltip, { passive: true });

    li.appendChild(stamp);
    li.appendChild(msg);
    ul.appendChild(li);
  });

  if (list.length === 0){
    ul.innerHTML = '<li class="insight-item"><span class="insight-stamp">—</span><span class="insight-msg">Sem insights por enquanto</span></li>';
  }
}

function buildInsightsFromMetrics(mock = false){
  const now = new Date();
  const today = formatBRDate(now);
  const out = [];

  if (window.__peakHoursMax && Number.isInteger(window.__peakHoursMax.hour)){
    out.push({
      date: today,
      time: formatTimeHM(now),
      title: `Pico de acesso às ${fmt2(window.__peakHoursMax.hour)}h`,
      detail: `Maior concentração de scans no dia foi às ${fmt2(window.__peakHoursMax.hour)}h, somando ${window.__peakHoursMax.scans} leituras.`
    });
  } else if (mock){
    const h = 18 + Math.floor(Math.random()*6);
    const v = 20 + Math.floor(Math.random()*80);
    out.push({
      date: today,
      time: formatTimeHM(now),
      title: `Pico de acesso às ${fmt2(h)}h`,
      detail: `Maior concentração de scans no dia ocorreu às ${fmt2(h)}h, totalizando ${v} leituras.`
    });
  }

  if (window.__sessionsDeltaPct != null){
    const dir = window.__sessionsDeltaPct >= 0 ? 'alta' : 'queda';
    out.push({
      date: today,
      time: formatTimeHM(now),
      title: `Sessões em ${dir} de ${Math.abs(window.__sessionsDeltaPct)}%`,
      detail: `Variação de ${window.__sessionsDeltaPct}% nas sessões em relação ao período anterior.`
    });
  }

  if (window.__infoRatePct != null){
    out.push({
      date: today,
      time: formatTimeHM(now),
      title: `Taxa de Info: ${window.__infoRatePct}%`,
      detail: `Percentual de cliques no botão Info sobre o total de scans: ${window.__infoRatePct}%.`
    });
  }

  return out;
}

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function seedMockInsights(n = 5){
  const now = new Date();
  for (let i = n - 1; i >= 0; i--){
    const d = new Date(now.getTime() - i * 60 * 60 * 1000);
    const date = formatBRDate(d);
    const time = formatTimeHM(d);

    const h = 10 + Math.floor(Math.random()*13);
    const scans = 20 + Math.floor(Math.random()*120);
    const delta = [-18,-9,-4,4,9,12,15][Math.floor(Math.random()*7)];
    const taxaInfo = (8 + Math.random()*18).toFixed(1);

    const msgs = [
      { title: `Pico de acesso às ${fmt2(h)}h`, detail:`Maior concentração de scans às ${fmt2(h)}h, total de ${scans} leituras no período.` },
      { title: `Sessões em ${delta >= 0 ? 'alta' : 'queda'} de ${Math.abs(delta)}%`, detail:`Variação de ${delta}% nas sessões em relação ao período anterior.` },
      { title: `Taxa de Info: ${taxaInfo}%`, detail:`Percentual de cliques no botão Info sobre o total de scans: ${taxaInfo}%.` }
    ];

    const m = pick(msgs);
    pushInsight({ date, time, title: m.title, detail: m.detail });
  }
}

function updateInsightGlobalsFromData(data){
  try{
    let max = { hour: 0, scans: -Infinity };
    (data.picos || []).forEach(p => { if (p.scans > max.scans) max = { hour: p.hora, scans: p.scans }; });
    window.__peakHoursMax = max.scans >= 0 ? max : null;

    const arr = (data.daily?.sessoes || []);
    if (arr.length >= 2){
      const last = arr[arr.length-1];
      const prev = arr[arr.length-2] || 0;
      const pctDelta = prev ? Math.round(((last - prev) / prev) * 100) : 0;
      window.__sessionsDeltaPct = pctDelta;
    } else {
      window.__sessionsDeltaPct = 0;
    }

    const scansT = data.kpis?.scansTotal || 0;
    const infoT  = data.kpis?.infoTotal || 0;
    window.__infoRatePct = scansT ? Math.round((infoT / scansT) * 1000) / 10 : 0;
  }catch(e){
    console.warn("updateInsightGlobalsFromData falhou:", e);
  }
}

function startInsightScheduler(data){
  updateInsightGlobalsFromData(data);

  const pack = buildInsightsFromMetrics(false);
  if (pack.length >= 5){
    pack.slice(-5).forEach(pushInsight);
  } else if (pack.length > 0){
    pack.forEach(pushInsight);
    seedMockInsights(5 - pack.length);
  } else {
    seedMockInsights(5);
  }

  if (insightsTimer) clearInterval(insightsTimer);
  insightsTimer = setInterval(() => {
    const reais = buildInsightsFromMetrics(false);
    if (reais.length > 0){
      pushInsight(reais[0]);
    } else {
      seedMockInsights(1);
    }
  }, 60 * 60 * 1000);
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

  if (!AppState.tenant) {
    const rawTenant =
      elements.filterTenant?.value?.trim() ||
      resolveTenantInitial() ||
      "";
    AppState.tenant = tenantKey(rawTenant);
  }

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

  if (elements.filterTenant) {
    elements.filterTenant.addEventListener("change", () => {
      const raw = elements.filterTenant.value?.trim() || AppState.tenant;
      AppState.tenant = tenantKey(raw);
      loadAndRender();
    });
  }
}


/* ==========================================================
   RESUMO (KPIs)
   ========================================================== */
function renderKPIs(kpis){
  if(elements.kpiScans) elements.kpiScans.textContent = toBR(kpis.scansTotal);
  if(elements.kpiSessoes) elements.kpiSessoes.textContent = toBR(kpis.sessoesTotal);
  if(elements.kpiUnicos) elements.kpiUnicos.textContent = toBR(kpis.unicosTotal);
  if(elements.kpiInfoRate) elements.kpiInfoRate.textContent = pct(kpis.infoTotal, kpis.scansTotal);
  if(elements.kpiAvgTimePerItem) elements.kpiAvgTimePerItem.textContent = formatDurationMMSS(kpis.avgTimePerItem);
  if(elements.kpiAvgTimePerCategory) elements.kpiAvgTimePerCategory.textContent = formatDurationMMSS(kpis.avgTimePerCategory);
  if(elements.kpiInfoClicks) elements.kpiInfoClicks.textContent = toBR(kpis.infoClicks);
  if(elements.kpiInfoAvgTime) elements.kpiInfoAvgTime.textContent = formatDurationMMSS(kpis.infoAvgTime);
  if(elements.kpiActiveClients) elements.kpiActiveClients.textContent = toBR(kpis.activeClients);
  if(elements.kpiNewClients) elements.kpiNewClients.textContent = toBR(kpis.newClients);
  if(elements.kpiRecurringClients) elements.kpiRecurringClients.textContent = toBR(kpis.recurringClients);
  if(elements.kpiReturnRate) elements.kpiReturnRate.textContent = pct(kpis.recurringClients, kpis.newClients + kpis.recurringClients);
  if(elements.kpiInfoOpens) elements.kpiInfoOpens.textContent = toBR(kpis.infoOpens);
  if(elements.kpiInfoAvgTimeInfoBox) elements.kpiInfoAvgTimeInfoBox.textContent = formatDurationMMSS(kpis.infoAvgTimeInfoBox);
  if(elements.kpiModelsLoaded) elements.kpiModelsLoaded.textContent = toBR(kpis.modelsLoaded);
  if(elements.kpiModelsErrors) elements.kpiModelsErrors.textContent = toBR(kpis.modelsErrors);

  const totalClients = kpis.newClients + kpis.recurringClients;
  if(byId("kpiRecNew")) byId("kpiRecNew").textContent = toBR(kpis.newClients);
  if(byId("kpiRecReturning")) byId("kpiRecReturning").textContent = toBR(kpis.recurringClients);
  if(byId("kpiRecRate")) byId("kpiRecRate").textContent = pct(kpis.recurringClients, totalClients);
}


/* ==========================================================
   ESCANEAMENTO TOTAL DE QR CODE 
   ========================================================== */

function renderScansTotalChart(data){
  if (!elements.chartScansTotal) return;
  if (charts.scansTotal) charts.scansTotal.destroy();
  charts.scansTotal = buildLineChart(
    elements.chartScansTotal.getContext("2d"),
    data.rangeLabels,
    data.daily.scans,
    "Scans (dia)",
    "#00d9ff",
    (ctx)=>` ${toBR(ctx.parsed.y)} scan(s)`
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

function renderTabelaMesaQR(list) {
  const tbody = elements.tbodyMesaQR;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  // Total de scans (para calcular % do total)
  const totalScans = sum(
    safe.map(i => Number(i.scans ?? i.totalScans ?? 0))
  );

  const rows = safe.map(i => {
    const mesaRaw =
      i.mesa ||
      i.qrLabel ||
      i.label ||
      "QR/mesa-desconhecido";

    const mesaLabel = formatMesaLabel(mesaRaw);

    // QUANTIDADE DE SCANS NO PERÍODO (não é tempo)
    const scans = Number(i.scans ?? i.totalScans ?? 0);

    // Último horário de scan
    const lastScan =
      i.ultimoScan ||
      i.lastScan ||
      i.last ||
      i.lastSeen ||
      null;

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
  if (charts.scansByMesa) charts.scansByMesa.destroy();

  const top = [...data.porMesa]
    .sort((a, b) => (b.scans ?? 0) - (a.scans ?? 0))
    .slice(0, 10);

  charts.scansByMesa = buildBarHorizontal(
    elements.chartScansByMesa.getContext("2d"),
    top.map(i => {
      const mesaRaw = i.mesa || i.qrLabel || "QR/mesa-desconhecido";
      return formatMesaLabel(mesaRaw);
    }),
    top.map(i => i.scans ?? 0),
    "Scans por Mesa",
    "#00d9ff"
  );
}

/* ==========================================================
   ENGAJAMENTO POR MESA
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

    const mesaLabel = typeof formatMesaLabel === "function"
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

    // Cálculo de Interações/Sessão:
    // 1) se vier pronto em item.interactionsPerSession e for número, usa.
    // 2) senão, calcula totalInteractions / sessions (com proteção).
    let interactionsPerSession;

    if (typeof item.interactionsPerSession === "number" &&
        !Number.isNaN(item.interactionsPerSession)) {
      interactionsPerSession = item.interactionsPerSession;
    } else if (sessions > 0) {
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

function renderEngagementByMesaChart(data) {
  if (!elements.chartEngagementByMesa) return;
  if (charts.engagementByMesa) charts.engagementByMesa.destroy();

  const source = Array.isArray(data?.porMesa) ? data.porMesa : [];
  if (!source.length) return;

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

  charts.engagementByMesa = buildBarHorizontal(
    elements.chartEngagementByMesa.getContext("2d"),
    top.map((item) => {
      const mesaRaw =
        item.mesa ||
        item.qrLabel ||
        item.label ||
        "QR/mesa-desconhecido";
      return typeof formatMesaLabel === "function"
        ? formatMesaLabel(mesaRaw)
        : String(mesaRaw);
    }),
    top.map((item) =>
      Number(
        item.sessions ??
        item.sessionCount ??
        item.totalSessions ??
        item.scans ??
        item.totalScans ??
        0
      ) || 0
    ),
    "Sessões",
    "#3b82f6"
  );
}

/* ==========================================================
   SESSÕES POR PERÍODO
   ========================================================== */

function renderTabelaSessoes(labels, sessoes, unicos){
  const tbody=elements.tbodySessoes; if(!tbody) return;
  const rows = labels.map((label,idx)=>`
    <tr>
      <td>${label}</td>
      <td style="text-align:center">${toBR(sessoes[idx] || 0)}</td>
      <td style="text-align:center">${toBR(unicos[idx] || 0)}</td>
      <td style="text-align:right">${(unicos[idx] ? (sessoes[idx] / unicos[idx]).toFixed(2) : "0.00")}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

function renderSessoesChart(data){
  if (!elements.chartSessoes) return;
  if (charts.sessoes) charts.sessoes.destroy();
  charts.sessoes = buildLineChart(
    elements.chartSessoes.getContext("2d"),
    data.rangeLabels,
    data.daily.sessoes,
    "Sessões (dia)",
    "#3b82f6",
    (ctx)=>` ${toBR(ctx.parsed.y)} sessão(ões)`
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

function renderTabelaTempoMenu(list) {
  const tbody = elements.tableAvgTimeMenu;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML =
      `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const rows = safe.map((i) => `
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
  const tempoMenu = Array.isArray(data.tempoMenu) ? data.tempoMenu : [];

  const labels = tempoMenu.map((i) => i.periodo);
  const values = tempoMenu.map((i) => Number(i.mediaSec || 0)); // segundos

  charts.avgTimeMenu = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Tempo Médio",
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

function renderTabelaPeakHours(list){
  const tbody = elements.tablePeakHours;
  if (!tbody) return;

  const ref = (AppState.endDate instanceof Date) ? AppState.endDate : new Date();
  const dataStr = formatDateBR(ref);

  const rows = [...list]
    .sort((a,b) => a.hora - b.hora)
    .map(item => `
      <tr>
        <td>${dataStr}</td>
        <td style="text-align:center">${pad2(item.hora)}h</td>
        <td style="text-align:right">${toBR(item.scans ?? 0)}</td>
      </tr>
    `).join("");

  tbody.innerHTML = rows || `<tr><td colspan="3" class="text-center">Sem dados.</td></tr>`;
}

function renderPeakHoursChart(data){
  if (!elements.chartPeakHours) return;
  if (charts.peakHours) charts.peakHours.destroy();
  const labels = data.picos.map(i=>`${i.hora}h`);
  const values = data.picos.map(i=>i.scans);
  charts.peakHours = new Chart(elements.chartPeakHours.getContext("2d"),{
    type:"bar",
    data:{ labels, datasets:[{ label:"Scans por hora", data:values, backgroundColor:"#3b82f6" }] },
    options:{ responsive:true, maintainAspectRatio:false }
  });
}


/* ==========================================================
   USO DO BOTÃO "LIKE"
   ========================================================== */

function renderLikeUsage(data) {
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

  if (!source.length) return;

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
   RECORRÊNCIA DE CLIENTES
   ========================================================== */

function renderTabelaRecurrence(list) {
  const tbody = elements.tableRecurrence;
  if (!tbody) return;

  const safe = Array.isArray(list) ? list : [];

  if (!safe.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
    return;
  }

  const rows = safe.map((item, idx) => {
    const id            = item.id || item.clientId || item.cliente || `Cliente ${idx+1}`;
    const scans         = item.scans ?? item.totalScans ?? 0;
    const lastScan      = item.lastScan || item.ultimoScan || null;
    const daysSinceLast = item.daysSinceLast ?? item.diasDesdeUltimo ?? 0;

    return `
      <tr>
        <td>${id}</td>
        <td style="text-align:center">${toBR(scans)}</td>
        <td style="text-align:center">${lastScan ? formatDateBR(lastScan) : "—"}</td>
        <td style="text-align:right">${toBR(daysSinceLast)}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rows;
}

function renderRecurrenceChart(data){
  if (!elements.chartRecurrence) return;
  if (charts.recurrence) charts.recurrence.destroy();

  const labels = data.recurrenceData.map(i=>i.periodo);
  const newClients = data.recurrenceData.map(i=>i.newClients);
  const returningClients = data.recurrenceData.map(i=>i.returningClients);

  charts.recurrence = new Chart(elements.chartRecurrence.getContext("2d"),{
    type:"line",
    data:{
      labels,
      datasets:[
        { label:"Novos", data:newClients, tension:.35, borderWidth:2, pointRadius:3, fill:false, borderColor:"#10b981", backgroundColor:"#10b981" },
        { label:"Retornando", data:returningClients, tension:.35, borderWidth:2, pointRadius:3, fill:false, borderColor:"#f59e0b", backgroundColor:"#f59e0b" }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false, interaction:{mode:"index",intersect:false},
      plugins:{ legend:{display:true, position:"top"}, tooltip:{callbacks:{label:(ctx)=>` ${ctx.dataset.label}: ${toBR(ctx.parsed.y)}`}} },
      scales:{ x:{grid:{display:false}, ticks:{maxRotation:0,autoSkip:true}},
               y:{beginAtZero:true, grid:{color:"rgba(255,255,255,.08)"}} }
    }
  });
}

/* ==========================================================
   DISPOSITIVOS USADOS
   ========================================================== */

function renderTabelaDeviceDistribution(list){
  const tbody=elements.tableDeviceDistribution; if(!tbody) return;
  const totalSessions = sum(list.map(i=>i.sessions));
  const rows = list.map(item=>`
    <tr>
      <td>${item.label}</td>
      <td style="text-align:center">${pct(item.sessions, totalSessions)}</td>
      <td style="text-align:center">${toBR(item.sessions)}</td>
      <td style="text-align:right">${formatDurationMMSS(item.avgTimeSec)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

function renderDevicesChart(data){
  if (!elements.chartDevices) return;
  if (charts.devices) charts.devices.destroy();
  charts.devices = buildDoughnut(
    elements.chartDevices.getContext("2d"),
    data.devices.map(d=>d.label),
    data.devices.map(d=>d.value)
  );
}

/* ==========================================================
   MODELOS MAIS EXIBIDOS
   ========================================================== */

function renderTabelaTopModels(list){
  const tbody=elements.tableTopModels; if(!tbody) return;
  const rows = list.map(item=>`
    <tr>
      <td>${mapItemName(item.model)}</td>
      <td style="text-align:center">${toBR(item.views)}</td>
      <td style="text-align:center">${formatDurationMMSS(item.avgTimeSec)}</td>
      <td style="text-align:right">${toBR(item.errors)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

function renderTopModelsChart(data){
  if (!elements.chartTopModels) return;
  if (charts.topModels) charts.topModels.destroy();
  const top = data.topModels.slice(0,5);
  charts.topModels = buildBarHorizontal(
    elements.chartTopModels.getContext("2d"),
    top.map(i=>i.model),
    top.map(i=>i.views),
    "Exibições",
    "#10b981"
  );
}


/* ==========================================================
   SAÚDE DOS MODELOS
   ========================================================== */

function renderTabelaModelErrors(list){
  const tbody=elements.tableModelErrors; if(!tbody) return;
  const rows = list.map(item=>`
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

  const labels = ["Carregados", "Erros"];
  const values = [data.kpis.modelsLoaded, data.kpis.modelsErrors];

  charts.modelHealth = buildDoughnut(
    elements.chartModelHealth.getContext("2d"),
    labels,
    values
  );
}

/* ==========================================================
   INSIGHTS
   ========================================================== */

async function loadAndRender() {
  if (!AppState.startDate || !AppState.endDate) {
    setDefaultTodayRange();
  }

  const data = await fetchMetrics({
    tenant:    AppState.tenant,
    startDate: AppState.startDate,
    endDate:   AppState.endDate
  });

  console.log("[METRICAS] data bruto da API:", data);

  // Resumo
  renderKPIs(data.kpis);

  // Tabelas
  renderTabelaMesaQR(data.porMesa);
  renderTabelaSessoes(data.rangeLabels, data.daily.sessoes, data.daily.unicos);
  renderTabelaTempoMenu(data.tempoMenu);
  renderTabelaTimeByCategory(data.timeByCategory);
  renderTabelaTimePerItem(data.topItems);
  renderTabelaPeakHours(data.picos);
  renderTabelaRecurrence(data.recurrenceData);
  renderTabelaEngagementByMesa(data.porMesa);
  renderTabelaDeviceDistribution(data.devices);
  renderTabelaTopModels(data.topModels);
  renderTabelaModelErrors(data.modelErrors);
  renderTabelaInfoPerItem(data.topItems);

  // Gráficos
  await ensureChartJs();
  renderScansTotalChart(data);
  renderScansByMesaChart(data);
  renderSessoesChart(data);
  renderAvgTimeMenuChart(data);
  renderPeakHoursChart(data);
  renderInfoUsageChart(data);   // ✅ agora existe
  renderTimePerItemChart(data);
  renderTimeByCategoryChart(data);
  renderInfoPerItemChart(data);
  renderRecurrenceChart(data);
  renderEngagementByMesaChart(data);
  renderDevicesChart(data);
  renderTopModelsChart(data);
  renderModelHealthChart(data);

  // USO DO BOTÃO LIKE (KPI + tabela + gráfico)
  const likeBlock = getLikeUsageBlock(data);
  if (likeBlock) {
    renderLikeUsage(likeBlock);
  }

  // Insights
  startInsightScheduler(data);
  wireHelpBadges(document);
}


/* ==========================================================
   BOOTSTRAP + AJUSTE VISUAL DE ALGUNS BLOCOS
   ========================================================== */

document.addEventListener("DOMContentLoaded", ()=>{
  if (AppState.tenant) {
    AppState.tenant = tenantKey(AppState.tenant);
  }

  if (!AppState.tenant) {
    const raw = elements.filterTenant?.value?.trim() || "";
    AppState.tenant = raw ? tenantKey(raw) : "";
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
  centerBlockByTitle(/Recorr[eê]ncia de Clientes/i, { maxWidth: '980px' });
  centerBlockByTitle(/Sa[úu]de dos Modelos/i, {});
}

document.addEventListener('DOMContentLoaded', centerSelectedKPIBlocks);

})();
