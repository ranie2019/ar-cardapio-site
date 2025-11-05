/* ==========================================================
   Métricas.js Arquivo organizado por BLOCOS (títulos azuis do dashboard)
   ========================================================== */

(function () {
/* ==========================================================
   BASE / CONFIGURAÇÃO GERAL
   ========================================================== */
const USE_MOCK = true; // Altere para false quando tiver API real
const API_BASE = "https://SEU_API_GATEWAY/dev/metricasCliente";

/* -------------------- ELEMENTOS (DOM) -------------------- */
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
  kpiInfoOpens: byId("kpiInfoOpens"), // Adicionado
  kpiInfoAvgTimeInfoBox: byId("kpiInfoAvgTimeInfoBox"), // Adicionado
  kpiModelsLoaded: byId("kpiModelsLoaded"), // Adicionado
  kpiModelsErrors: byId("kpiModelsErrors"), // Adicionado

  // Gráficos
  chartScansTotal: byId("chartScansTotal"),
  chartScansByMesa: byId("chartScansByMesa"),
  chartSessoes: byId("chartSessoes"),
  chartAvgTimeMenu: byId("chartAvgTimeMenu"),
  chartPeakHours: byId("chartPeakHours"),
  chartDevices: byId("chartDevices"),
  chartTopItems: byId("chartTopItems"),
  chartTimeByCategory: byId("chartTimeByCategory"),
  chartCategoryPopularity: byId("chartCategoryPopularity"), // Corrigido o nome da variável
  chartTimePerItem: byId("chartTimePerItem"),
  chartInfoUsage: byId("chartInfoUsage"), // Adicionado
  chartRecurrence: byId("chartRecurrence"), // Adicionado
  chartEngagementByMesa: byId("chartEngagementByMesa"), // Adicionado
  chartModelHealth: byId("chartModelHealth"), // Adicionado
  chartInfoPerItem: byId("chartInfoPerItem"), // Adicionado
  chartTopModels: byId("chartTopModels"), // Adicionado

  // Tabelas
  tbodyMesaQR: byId("tbodyMesaQR"),
  tbodySessoes: byId("tbodySessoes"),
  tableAvgTimeMenu: byId("tableAvgTimeMenu"),
  tableTopItems: byId("tableTopItems"),
  tbodyTimeByCategory: byId("tbodyTimeByCategory"),
  tableCategoryPopularity: byId("tableCategoryPopularity"), // Corrigido o nome da variável
  tableTimePerItem: byId("tableTimePerItem"), // Adicionado
  tablePeakHours: byId("tablePeakHours"), // Adicionado
  tableRecurrence: byId("tableRecurrence"), // Adicionado
  tableEngagementByMesa: byId("tableEngagementByMesa"), // Adicionado
  tableDeviceDistribution: byId("tableDeviceDistribution"), // Adicionado
  tableTopModels: byId("tableTopModels"), // Adicionado
  tableModelErrors: byId("tableModelErrors"), // Adicionado
  tableInfoPerItem: byId("tableInfoPerItem"), // Adicionado
};

/* -------------------- INSTÂNCIAS CHART ------------------- */
const charts = {
  scansTotal: null,
  scansByMesa: null,
  sessoes: null,
  avgTimeMenu: null,
  peakHours: null,
  devices: null,
  topItems: null,
  timeByCategory: null,
  categoryPopularity: null, // Corrigido o nome da variável
  timePerItem: null,
  infoUsage: null, // Adicionado
  recurrence: null, // Adicionado
  engagementByMesa: null, // Adicionado
  modelHealth: null, // Adicionado
  infoPerItem: null, // Adicionado
  topModels: null, // Adicionado
  topItems: null,   // <--- ADICIONE
};

/* ==========================================================
   UTILITÁRIOS GERAIS
   ========================================================== */
const $  = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => [...parent.querySelectorAll(sel)];

function toBR(num, opts = {}) { return new Intl.NumberFormat("pt-BR", opts).format(num); }
function pct(part, total) { return total ? `${toBR((part / total) * 100, { maximumFractionDigits: 1 })}%` : "0%"; }
function pad2(n){ return n.toString().padStart(2,"0"); }
function formatDateBR(date){ const d=(date instanceof Date)?date:new Date(date); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; }
function formatTimeBR(date){ const d=(date instanceof Date)?date:new Date(date); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function formatDurationMMSS(seconds){ seconds=Math.max(0,Math.round(seconds||0)); const m=Math.floor(seconds/60), s=seconds%60; return `${pad2(m)}:${pad2(s)}`; }
function average(arr){ return (!arr?.length)?0:arr.reduce((a,b)=>a+b,0)/arr.length; }
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function roundUpToMultiple(value,step=10){ return (step<=0)?value:Math.ceil(value/step)*step; }
function roundToNearest(value,step=10){ return (step<=0)?value:Math.round(value/step)*step; }
function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

/* ==========================================================
   DADOS MOCK / FETCH
   ========================================================== */
function generateMockDates(n=14){
  const out=[]; const today=new Date();
  for(let i=n-1;i>=0;i--){ const d=new Date(today); d.setDate(today.getDate()-i); out.push(new Date(d.getFullYear(),d.getMonth(),d.getDate())); }
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
    return { mesa:m, scans:scansPeriodo, ultimoScan:ts, avgTimeSec:randomInt(30,180), interactionsPerSession: (Math.random()*5).toFixed(1), sessions: randomInt(10, 50) };
  });

  const tempoMenu = days.map(d=>({
    periodo: formatDateBR(d),
    mediaSec:   Math.round(60 + Math.random()*180),
    medianaSec: Math.round(50 + Math.random()*150),
    amostras:   Math.round(30 + Math.random()*130),
  }));

  const picos = Array.from({length:24}).map((_,hora)=>({ hora, scans: Math.round(Math.max(0,(hora-9)*(Math.random()*6))) }));

  const devices = [
    { label:"Mobile",  value: randomInt(70,90), sessions: randomInt(100, 300), avgTimeSec: randomInt(60, 180) },
    { label:"Desktop", value: randomInt(10,30), sessions: randomInt(10, 50), avgTimeSec: randomInt(30, 90) },
    { label:"Tablet",  value: randomInt(1,5), sessions: randomInt(5, 20), avgTimeSec: randomInt(40, 120) },
  ];

  const topItems = Array.from({length:10}).map((_,i)=>({
    item:`Item ${i+1}`, views:randomInt(50,500), avgTimeSec:randomInt(10,60), category:`Categoria ${randomInt(1,5)}`, clicksInfo: randomInt(5, 50)
  })).sort((a,b)=>b.views-a.views);

  const categories = Array.from({length:5}).map((_,i)=>`Categoria ${i+1}`);
  const timeByCategory = categories.map(cat=>({
    category:cat, avgTimeSec:randomInt(30,180), sessions:randomInt(50,300), totalTimeSec:randomInt(5000,20000)
  }));
  const totalTime = sum(timeByCategory.map(c=>c.totalTimeSec));
  timeByCategory.forEach(c=> c.pctTotalTime = pct(c.totalTimeSec,totalTime));

  const topCategories = categories.map(cat=>({
    category:cat, clicks:randomInt(100,800), avgTimeSec:randomInt(30,180), totalClicks:randomInt(1000,5000)
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
    model:`Modelo ${i+1}`, views:randomInt(10,100), avgTimeSec:randomInt(5,30), errors:randomInt(0,5)
  })).sort((a,b)=>b.views-a.views);

  const modelErrors = Array.from({length:3}).map((_,i)=>({
    itemModel:`Item/Modelo ${i+1}`, error:`Erro ${i+1}`, occurrences:randomInt(1,10), last:new Date()
  }));

  return {
    rangeLabels: labels,
    daily: { scans:dailyScans, sessoes:dailySessions, unicos:dailyUniques, info:dailyInfo },
    porMesa: mesaData,
    tempoMenu, picos, devices, topItems, timeByCategory, topCategories, kpis, recurrenceData, topModels, modelErrors
  };
}

async function fetchMetrics({tenant,startDate,endDate}){
  if (USE_MOCK){ await new Promise(r=>setTimeout(r,60)); return buildMockData(tenant,startDate,endDate); }
  try{
    const params = new URLSearchParams({ tenant, startDate:formatDateBR(startDate), endDate:formatDateBR(endDate) });
    const res = await fetch(`${API_BASE}?${params}`); if(!res.ok) throw new Error("Erro ao buscar dados");
    return res.json();
  }catch(e){
    console.error("Erro ao buscar dados:", e);
    return buildMockData(tenant,startDate,endDate);
  }
}

/* ==========================================================
   TOOLTIP “?” E CHART.JS
   ========================================================== */
const HelpPortal = (()=>{
  let el;
  function show(text, target){
    if(!el){
      el = document.createElement("div");
      el.className = "tooltip-portal";
      document.body.appendChild(el);
    }
    el.innerHTML = text;
    el.style.display = "block";
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height + 5;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.transform = "translateX(-50%)";
  }
  function hide(){
    if(el) el.style.display = "none";
  }
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
        backgroundColor: `rgba(59, 130, 246, 0.1)`, // Cor de fundo suave
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

function buildBarHorizontal(ctx, labels, data, label, color){
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label,
        data,
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
        x: { beginAtZero: true, grid: { color: "rgba(255,255,255,.08)" } },
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
   FILTROS E ESTADO
   ========================================================== */
const AppState = {
  tenant: "",
  startDate: null,
  endDate: null,
};

function wireFilters(){
  if(typeof flatpickr !== "undefined"){
    flatpickr(elements.startDate, {
      dateFormat: "d/m/Y",
      locale: "pt",
      onChange: updateRangeInput,
    });
    flatpickr(elements.endDate, {
      dateFormat: "d/m/Y",
      locale: "pt",
      onChange: updateRangeInput,
    });
  }

  elements.btnApplyFilters?.addEventListener("click", applyFilters);
  elements.clearRange?.addEventListener("click", clearRange);
  elements.periodFilter?.addEventListener("change", handlePeriodChange);
  elements.filterTenant?.addEventListener("change", applyFilters);
}

function initFlatpickrIfAny(){
  if(typeof flatpickr !== "undefined"){
    flatpickr(elements.startDate, { dateFormat: "d/m/Y", locale: "pt", onChange: updateRangeInput });
    flatpickr(elements.endDate, { dateFormat: "d/m/Y", locale: "pt", onChange: updateRangeInput });
  }
}

function updateRangeInput(){
  const start = elements.startDate?.value;
  const end = elements.endDate?.value;
  if(elements.filterRange) elements.filterRange.value = (start && end) ? `${start} a ${end}` : "";
}

function parseDate(dateStr){
  if(!dateStr) return null;
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

function applyFilters(){
  const startStr = elements.startDate?.value;
  const endStr = elements.endDate?.value;

  AppState.tenant = elements.filterTenant?.value?.trim() || "";
  AppState.startDate = parseDate(startStr);
  AppState.endDate = parseDate(endStr);

  if(AppState.startDate && AppState.endDate && AppState.startDate > AppState.endDate){
    alert("A data inicial não pode ser maior que a data final.");
    return;
  }

  loadAndRender();
}

function clearRange(){
  if(elements.startDate) elements.startDate.value = "";
  if(elements.endDate) elements.endDate.value = "";
  if(elements.filterRange) elements.filterRange.value = "";
  if(elements.periodFilter) elements.periodFilter.value = "custom";
  applyFilters();
}

function handlePeriodChange(){
  const period = elements.periodFilter?.value;
  if(period === "custom") return;

  const today = new Date();
  let startDate = new Date(today);
  let endDate = new Date(today);

  const setDates = (start, end) => {
    elements.startDate.value = formatDateBR(start);
    elements.endDate.value = formatDateBR(end);
    updateRangeInput();
    applyFilters();
  };

  switch(period){
    case "7d":
      startDate.setDate(today.getDate() - 6);
      setDates(startDate, endDate);
      break;
    case "15d":
      startDate.setDate(today.getDate() - 14);
      setDates(startDate, endDate);
      break;
    case "30d":
      startDate.setDate(today.getDate() - 29);
      setDates(startDate, endDate);
      break;
    case "60d":
      startDate.setDate(today.getDate() - 59);
      setDates(startDate, endDate);
      break;
    case "mesAnterior":
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0);
      setDates(startDate, endDate);
      break;
    case "mesAtual":
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      setDates(startDate, endDate);
      break;
  }
}

/* ==========================================================
   BLOCO: RESUMO (KPIs)
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

  // KPIs de Recorrência (para o bloco Recorrência)
  const totalClients = kpis.newClients + kpis.recurringClients;
  if(byId("kpiRecNew")) byId("kpiRecNew").textContent = toBR(kpis.newClients);
  if(byId("kpiRecReturning")) byId("kpiRecReturning").textContent = toBR(kpis.recurringClients);
  if(byId("kpiRecRate")) byId("kpiRecRate").textContent = pct(kpis.recurringClients, totalClients);
}

/* ==========================================================
   BLOCO: TABELAS
   ========================================================== */

/* tabela: Escaneamento por Mesa/QR Code */
function renderTabelaMesaQR(list){
  const tbody=elements.tbodyMesaQR; if(!tbody) return;
  const totalScans = sum(list.map(i=>i.scans));
  const rows = list.map(i=>`
    <tr>
      <td>${i.mesa}</td>
      <td style="text-align:center">${formatDurationMMSS(i.avgTimeSec)}</td>
      <td style="text-align:center">${formatTimeBR(i.ultimoScan)}</td>
      <td style="text-align:right">${pct(i.scans,totalScans)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Sessões por Período */
function renderTabelaSessoes(labels, sessoes, unicos){
  const tbody=elements.tbodySessoes; if(!tbody) return;
  const rows = labels.map((label,idx)=>`
    <tr>
      <td>${label}</td>
      <td style="text-align:center">${toBR(sessoes[idx])}</td>
      <td style="text-align:center">${toBR(unicos[idx])}</td>
      <td style="text-align:right">${(sessoes[idx] / unicos[idx]).toFixed(2)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Tempo Médio (Cardápio) */
function renderTabelaTempoMenu(list){
  const tbody=elements.tableAvgTimeMenu; if(!tbody) return;
  const rows = list.map(i=>`
    <tr>
      <td>${i.periodo}</td>
      <td style="text-align:center">${formatDurationMMSS(i.mediaSec)}</td>
      <td style="text-align:center">${formatDurationMMSS(i.medianaSec)}</td>
      <td style="text-align:right">${toBR(i.amostras)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Itens mais visualizados */
function renderTabelaTopItems(list){
  const tbody = elements.tableTopItems;  // <--- antes era elements.tbodyTopItems
  if(!tbody) return;
  const rows = list.map(i=>`
    <tr>
      <td>${i.item}</td>
      <td style="text-align:center">${toBR(i.views)}</td>
      <td style="text-align:center">${formatDurationMMSS(i.avgTimeSec)}</td>
      <td style="text-align:right">${i.category}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}


/* tabela: Tempo por Categoria */
function renderTabelaTimeByCategory(list){
  const tbody=elements.tbodyTimeByCategory; if(!tbody) return;
  const rows = list.map(i=>`
    <tr>
      <td>${i.category}</td>
      <td style="text-align:center">${formatDurationMMSS(i.avgTimeSec)}</td>
      <td style="text-align:center">${toBR(i.sessions)}</td>
      <td style="text-align:right">${i.pctTotalTime}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Categorias mais acessadas */
function renderTabelaTopCategories(list){
  const tbody=elements.tableCategoryPopularity; if(!tbody) return;
  const rows = list.map(i=>`
    <tr>
      <td>${i.category}</td>
      <td style="text-align:center">${toBR(i.clicks)}</td>
      <td style="text-align:center">${formatDurationMMSS(i.avgTimeSec)}</td>
      <td style="text-align:right">${i.pctTotal}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Tempo por Item */
function renderTabelaTimePerItem(list){
  const tbody=elements.tableTimePerItem; if(!tbody) return; // Corrigido o nome da variável
  const totalViews = sum(list.map(i=>i.views));
  const rows = list.map(i=>`
    <tr>
      <td>${i.item}</td>
      <td style="text-align:center">${formatDurationMMSS(i.avgTimeSec)}</td>
      <td style="text-align:center">${toBR(i.views)}</td>
      <td style="text-align:right">${pct(i.views,totalViews)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Horário de Pico */
function renderTabelaPeakHours(list){
  const tbody=elements.tablePeakHours; if(!tbody) return;
  // Mock data não tem Mês/Dia da Semana, então a tabela será simplificada
  const rows = list.map(item=>`
    <tr>
      <td>-</td>
      <td>-</td>
      <td style="text-align:center">${item.hora}h</td>
      <td style="text-align:right">${toBR(item.scans)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Recorrência de Clientes */
function renderTabelaRecurrence(list){
  const tbody=elements.tableRecurrence; if(!tbody) return;
  // Mock data não tem dados de cliente anônimo, então a tabela será mockada
  const mockClients = Array.from({length:5}).map((_,i)=>({
    id: `Cliente ${i+1}`, scans: randomInt(1, 10), lastScan: new Date(), daysSinceLast: randomInt(1, 30)
  }));
  const rows = mockClients.map(item=>`
    <tr>
      <td>${item.id}</td>
      <td style="text-align:center">${toBR(item.scans)}</td>
      <td style="text-align:center">${formatDateBR(item.lastScan)}</td>
      <td style="text-align:right">${toBR(item.daysSinceLast)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Engajamento por Mesa */
function renderTabelaEngagementByMesa(list){
  const tbody=elements.tableEngagementByMesa; if(!tbody) return;
  const rows = list.map(item=>`
    <tr>
      <td>${item.mesa}</td>
      <td style="text-align:center">${formatDurationMMSS(item.avgTimeSec)}</td>
      <td style="text-align:center">${item.interactionsPerSession}</td>
      <td style="text-align:right">${toBR(item.sessions)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Dispositivo Usados */
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

/* tabela: Modelos mais exibidos */
function renderTabelaTopModels(list){
  const tbody=elements.tableTopModels; if(!tbody) return;
  const rows = list.map(item=>`
    <tr>
      <td>${item.model}</td>
      <td style="text-align:center">${toBR(item.views)}</td>
      <td style="text-align:center">${formatDurationMMSS(item.avgTimeSec)}</td>
      <td style="text-align:right">${toBR(item.errors)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Saúde dos Modelos */
function renderTabelaModelErrors(list){
  const tbody=elements.tableModelErrors; if(!tbody) return;
  const rows = list.map(item=>`
    <tr>
      <td>${item.itemModel}</td>
      <td>${item.error}</td>
      <td style="text-align:center">${toBR(item.occurrences)}</td>
      <td style="text-align:right">${formatDateBR(item.last)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* tabela: Botao Info */
function renderTabelaInfoPerItem(list){
  const tbody=elements.tableInfoPerItem; if(!tbody) return;
  const totalViews = sum(list.map(i=>i.views));
  const rows = list.map(item=>`
    <tr>
      <td>${item.item}</td>
      <td style="text-align:center">${toBR(item.clicksInfo)}</td>
      <td style="text-align:center">${formatDurationMMSS(item.avgTimeSec)}</td>
      <td style="text-align:right">${toBR(item.views)}</td>
    </tr>`).join("");
  tbody.innerHTML = rows || `<tr><td colspan="4" class="text-center">Sem dados.</td></tr>`;
}

/* ==========================================================
   BLOCO: ESCANEAMENTO TOTAL DE QR CODE
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
   BLOCO: ESCANEAMENTO POR MESA/QR CODE
   ========================================================== */
function renderScansByMesaChart(data){
  if (!elements.chartScansByMesa) return;
  if (charts.scansByMesa) charts.scansByMesa.destroy();
  const top = [...data.porMesa].sort((a,b)=>b.scans-a.scans).slice(0,10);
  charts.scansByMesa = buildBarHorizontal(
    elements.chartScansByMesa.getContext("2d"),
    top.map(i=>i.mesa),
    top.map(i=>i.scans),
    "Scans por Mesa",
    "#00d9ff"
  );
}

/* ==========================================================
   BLOCO: SESSÕES POR PERÍODO
   ========================================================== */
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
   BLOCO: TEMPO MÉDIO (CARDÁPIO)
   ========================================================== */
function renderAvgTimeMenuChart(data){
  if (!elements.chartAvgTimeMenu) return;
  if (charts.avgTimeMenu) charts.avgTimeMenu.destroy();
  charts.avgTimeMenu = buildLineChart(
    elements.chartAvgTimeMenu.getContext("2d"),
    data.tempoMenu.map(i=>i.periodo),
    data.tempoMenu.map(i=>i.mediaSec),
    "Tempo Médio (s)",
    "#10b981",
    (ctx)=>` ${formatDurationMMSS(ctx.parsed.y)}`
  );
}

/* ==========================================================
   BLOCO: HORÁRIO DE PICO
   ========================================================== */
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
   BLOCO: USO DO BOTÃO "INFO"
   ========================================================== */
function renderInfoUsageChart(data){
  if (!elements.chartInfoUsage) return;
  if (charts.infoUsage) charts.infoUsage.destroy();
  charts.infoUsage = buildLineChart(
    elements.chartInfoUsage.getContext("2d"),
    data.rangeLabels,
    data.daily.info,
    "Aberturas Info (dia)",
    "#f59e0b",
    (ctx)=>` ${toBR(ctx.parsed.y)} abertura(s)`
  );
}

/* ==========================================================
   BLOCO: TEMPO POR ITEM
   ========================================================== */
function renderTimePerItemChart(data){
  if (!elements.chartTimePerItem) return;
  if (charts.timePerItem) charts.timePerItem.destroy();
  const top = data.topItems.sort((a,b)=>b.avgTimeSec-a.avgTimeSec).slice(0,10);
  charts.timePerItem = buildBarHorizontal(
    elements.chartTimePerItem.getContext("2d"),
    top.map(i=>i.item),
    top.map(i=>i.avgTimeSec),
    "Tempo médio (s)",
    "#f59e0b"
  );
}

/* ==========================================================
   BLOCO: ITENS MAIS VISUALIZADOS
   ========================================================== */
function renderTopItemsChart(data){
  if (!elements.chartTopItems) return; // CORRIGIDO
  if (charts.topItems) charts.topItems.destroy(); // CORRIGIDO
  const top = data.topItems.slice(0,10);
  charts.topItems = buildBarHorizontal( // CORRIGIDO
    elements.chartTopItems.getContext("2d"), // CORRIGIDO
    top.map(i=>i.item),
    top.map(i=>i.views),
    "Views",
    "#00d9ff"
  );
}

/* ==========================================================
   BLOCO: TEMPO POR CATEGORIA
   ========================================================== */
function renderTimeByCategoryChart(data){
  if (!elements.chartTimeByCategory) return;
  if (charts.timeByCategory) charts.timeByCategory.destroy();
  charts.timeByCategory = buildBarHorizontal(
    elements.chartTimeByCategory.getContext("2d"),
    data.timeByCategory.map(i=>i.category),
    data.timeByCategory.map(i=>i.avgTimeSec),
    "Tempo médio (s)",
    "#10b981"
  );
}

/* ==========================================================
   BLOCO: CATEGORIAS MAIS ACESSADAS
   ========================================================== */
function renderCategoryPopularityChart(data){
  const canvas = elements.chartCategoryPopularity;
  if (!canvas) return;
  if (charts.categoryPopularity) charts.categoryPopularity.destroy();

  const src = data?.topCategories || [];
  const rows = (Array.isArray(src) ? src : []).map((r) => ({
    categoria: r.category ?? r.categoria ?? r.name ?? r.label ?? '—',
    cliques:   Number(r.clicks ?? r.cliques ?? r.total ?? 0),
    tempo:     r.avgTime ?? r.tempoMedio ?? r.time ?? 0,
    pct:       Number(r.pct ?? r.percent ?? r.percentage ?? r.participacao ?? 0),
  }));

  if (!rows.length) return;

  const labels = rows.map(r => r.categoria);
  const values = rows.map(r => r.cliques);

  const idealH = Math.max(220, rows.length * 28);
  canvas.style.height = `${idealH}px`;

  charts.categoryPopularity = buildBarHorizontal(
    canvas.getContext('2d'),
    labels,
    values,
    "Cliques",
    "#00d9ff"
  );
}

/* ==========================================================
   BLOCO: BOTAO INFO (POR ITEM)
   ========================================================== */
function renderInfoPerItemChart(data){
  if (!elements.chartInfoPerItem) return;
  if (charts.infoPerItem) charts.infoPerItem.destroy();
  const top = data.topItems.sort((a,b)=>b.clicksInfo-a.clicksInfo).slice(0,10);
  charts.infoPerItem = buildBarHorizontal(
    elements.chartInfoPerItem.getContext("2d"),
    top.map(i=>i.item),
    top.map(i=>i.clicksInfo),
    "Cliques Info",
    "#3b82f6"
  );
}

/* ==========================================================
   BLOCO: RECORRÊNCIA DE CLIENTES
   ========================================================== */
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
   BLOCO: ENGAJAMENTO POR MESA
   ========================================================== */
function renderEngagementByMesaChart(data){
  if (!elements.chartEngagementByMesa) return;
  if (charts.engagementByMesa) charts.engagementByMesa.destroy();
  const top = [...data.porMesa].sort((a,b)=>b.sessions-a.sessions).slice(0,10);
  charts.engagementByMesa = buildBarHorizontal(
    elements.chartEngagementByMesa.getContext("2d"),
    top.map(i=>i.mesa),
    top.map(i=>i.sessions),
    "Sessões",
    "#3b82f6"
  );
}

/* ==========================================================
   BLOCO: DISPOSITIVOS USADOS
   ========================================================== */
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
   BLOCO: MODELOS MAIS EXIBIDOS
   ========================================================== */
function renderTopModelsChart(data){
  if (!elements.chartTopModels) return; // Corrigido o ID do elemento
  if (charts.topModels) charts.topModels.destroy(); // Corrigido o nome da instância do chart
  const top = data.topModels.slice(0,5);
  charts.topModels = buildBarHorizontal( // Corrigido o nome da instância do chart
    elements.chartTopModels.getContext("2d"), // Corrigido o ID do elemento
    top.map(i=>i.model),
    top.map(i=>i.views),
    "Exibições",
    "#10b981"
  );
}

/* ==========================================================
   BLOCO: SAÚDE DOS MODELOS
   ========================================================== */
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
   BLOCO: INSIGHTS
   ========================================================== */

// Armazena os insights gerados (máximo de 5)
const insightsQueue = [];
const MAX_INSIGHTS = 5;

/**
 * Gera um insight simulado com base nos dados.
 * Em um sistema real, esta função conteria lógica complexa de análise de dados.
 * @param {object} data - O objeto de dados retornado por fetchMetrics.
 * @returns {object} Um objeto insight { date: string, time: string, title: string, fullText: string }
 */
function generateInsight(data) {
    // Exemplo de lógica de insight: identificar o horário de pico
    const picos = data.picos.sort((a, b) => b.scans - a.scans);
    const picoHora = picos[0].hora;
    const picoScans = picos[0].scans;

    const date = formatDateBR(new Date());
    const time = formatTimeBR(new Date());
    const title = `Pico de Acesso às ${picoHora}h`;
    const fullText = `O maior volume de escaneamentos no período ocorreu às ${picoHora}h, com um total de ${picoScans} scans. Isso sugere que o horário de pico de movimento é por volta das ${picoHora}h.`;

    return { date, time, title, fullText };
}

/**
 * Adiciona um novo insight à fila e atualiza o DOM.
 * @param {object} insight - O insight a ser adicionado.
 */
function addInsightToQueue(insight) {
    // Adiciona o novo insight no início da fila
    insightsQueue.unshift(insight);

    // Mantém apenas os MAX_INSIGHTS mais recentes
    if (insightsQueue.length > MAX_INSIGHTS) {
        insightsQueue.pop();
    }

    renderInsights();
}

/**
 * Renderiza a lista de insights no DOM.
 */
function renderInsights() {
    const ul = document.getElementById('insightsList');
    if (!ul) return;

    if (insightsQueue.length === 0) {
        ul.innerHTML = '<li>Carregando…</li>'; // Mantém o "Carregando..." se a fila estiver vazia no início
        return;
    }

    const html = insightsQueue.map(insight => {
        // Formato: data horário título (tooltip com fullText)
        return `
            <li>
                <span class="insight-date">${insight.date}</span>
                <span class="insight-time">${insight.time}</span>
                <span class="insight-title" title="${insight.fullText}">${insight.title}</span>
            </li>
        `;
    }).join('');

    ul.innerHTML = html;
}

/**
 * Inicia o agendamento para gerar novos insights a cada hora.
 * @param {object} data - O objeto de dados para gerar o insight.
 */
function startInsightScheduler(data) {
    // Gera o primeiro insight imediatamente
    addInsightToQueue(generateInsight(data));

    // Define o intervalo de 1 hora (3600000 ms) para gerar novos insights
    const ONE_HOUR_MS = 3600000;
    // Para fins de demonstração/teste, vamos usar 1 minuto (60000 ms)
    const INTERVAL_MS = 60000;

    // Limpa qualquer agendamento anterior para evitar duplicidade
    if (window.insightInterval) {
        clearInterval(window.insightInterval);
    }

    window.insightInterval = setInterval(() => {
        // Em um sistema real, você chamaria fetchMetrics() aqui para obter os dados mais recentes
        // Para o mock, vamos apenas gerar um novo insight com os dados atuais (ou gerar novos dados mock)
        const newData = buildMockData(AppState.tenant, AppState.startDate, AppState.endDate);
        addInsightToQueue(generateInsight(newData));
    }, INTERVAL_MS);
}


/* ==========================================================
   BLOCO: RESUMO
   ========================================================== */
async function loadAndRender() {
  // 1) Datas padrão (quando o filtro ainda não foi definido)
  if (!AppState.startDate || !AppState.endDate) {
    const days = generateMockDates(14);
    AppState.startDate = days[0];
    AppState.endDate   = days[days.length - 1];
  }

  // 2) Buscar dados (mock ou API)
  const data = await fetchMetrics({
    tenant:    AppState.tenant,
    startDate: AppState.startDate,
    endDate:   AppState.endDate
  });

  // 3) KPIs + Tabelas
  renderKPIs(data.kpis);
  renderTabelaMesaQR(data.porMesa);
  renderTabelaSessoes(data.rangeLabels, data.daily.sessoes, data.daily.unicos);
  renderTabelaTempoMenu(data.tempoMenu);
  renderTabelaTopItems(data.topItems);
  renderTabelaTimeByCategory(data.timeByCategory);
  renderTabelaTopCategories(data.topCategories);
  renderTabelaTimePerItem(data.topItems);
  renderTabelaPeakHours(data.picos); // Adicionado
  renderTabelaRecurrence(data.recurrenceData); // Adicionado
  renderTabelaEngagementByMesa(data.porMesa); // Adicionado
  renderTabelaDeviceDistribution(data.devices); // Adicionado
  renderTabelaTopModels(data.topModels); // Adicionado
  renderTabelaModelErrors(data.modelErrors); // Adicionado
  renderTabelaInfoPerItem(data.topItems); // Adicionado

  // 4) Gráficos
  await ensureChartJs();
  renderScansTotalChart(data);        // Escaneamento Total de QR Code
  renderScansByMesaChart(data);       // Escaneamento por Mesa/QRCode
  renderSessoesChart(data);           // Sessões por Período
  renderAvgTimeMenuChart(data);       // Tempo Médio (Cardápio)
  renderPeakHoursChart(data);         // Horário de Pico
  renderInfoUsageChart(data);         // Uso do botão "Info" (Gráfico de linha)
  renderTimePerItemChart(data);       // Tempo por Item
  renderTopItemsChart(data);          // Itens mais visualizados
  renderTimeByCategoryChart(data);    // Tempo por Categoria
  renderCategoryPopularityChart(data);// Categorias mais acessadas
  renderInfoPerItemChart(data);       // Botao Info (Gráfico de barras)
  renderRecurrenceChart(data);        // Recorrência de Clientes
  renderEngagementByMesaChart(data);  // Engajamento por Mesa
  renderDevicesChart(data);           // Dispositivos Usados
  renderTopModelsChart(data);         // Modelos mais exibidos
  renderModelHealthChart(data);       // Saúde dos Modelos

  // 5) Insights (NOVO)
  startInsightScheduler(data); // <--- ADICIONADO

  // 5) Insights (NOVO)
  startInsightScheduler(data); // <--- ADICIONADO

  // 6) Tooltips “?”
  wireHelpBadges(document);
}


/* ==========================================================
   BLOCO: BOOTSTRAP
   ========================================================== */
document.addEventListener("DOMContentLoaded", ()=>{
  // Valor inicial do range se não usar flatpickr
  if (elements.filterRange && typeof flatpickr === "undefined"){
    const dates=generateMockDates(14);
    elements.filterRange.value = `${formatDateBR(dates[0])} a ${formatDateBR(dates[dates.length-1])}`;
  }

  initFlatpickrIfAny();
  wireFilters();
  wireHelpBadges(document);

  // Primeiro carregamento
  const dates=generateMockDates(14);
  AppState.startDate=dates[0];
  AppState.endDate=dates[dates.length-1];
  AppState.tenant = elements.filterTenant?.value?.trim() || "";
  loadAndRender();

  // Recalcular em resize (anti clipping)
  let t;
  window.addEventListener("resize", ()=>{
    clearTimeout(t);
    t = setTimeout(loadAndRender, 200);
  });
});

})();