"use strict";

const jwt = require("jsonwebtoken");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand
} = require("@aws-sdk/client-s3");

// ========= OPENAI ==========
const OpenAI = require("openai");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const openaiClient = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

// ===============================
// VARIÁVEIS DE AMBIENTE
// ===============================
const JWT_SECRET = process.env.JWT_SECRET;

// Bucket/prefix das métricas
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const METRICS_BUCKET = process.env.METRICS_BUCKET || "ar-cardapio-models";
const METRICS_PREFIX = process.env.METRICS_PREFIX || "informacao";

// CORS
const CORS_ORIGINS = process.env.CORS_ORIGINS || "*";
const CORS_HEADERS = process.env.CORS_HEADERS || "Content-Type,Authorization";
const CORS_METHODS = process.env.CORS_METHODS || "GET,POST,OPTIONS";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const s3 = new S3Client({ region: AWS_REGION });

// Fuso horário de agregação (em minutos). Padrão: Brasil UTC-3 = -180
const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MINUTES = Number(
  process.env.METRICS_TZ_OFFSET_MINUTES ?? "-180"
);
const TZ_OFFSET_MS = TZ_OFFSET_MINUTES * 60 * 1000;

// Converte um Date em UTC para "horário local" aplicando o offset configurado
function toLocalDate(utcDate) {
  if (!(utcDate instanceof Date) || isNaN(utcDate.getTime())) return utcDate;
  return new Date(utcDate.getTime() + TZ_OFFSET_MS);
}

// ===============================
// UTILS: NORMALIZAÇÃO / LOG / CORS
// ===============================

// "ranie.black29@gmail.com" -> "ranie-black29-gmail-com"
function normalizarTenantId(valor) {
  if (!valor) return "unknown";
  return String(valor)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function log(level, ...args) {
  if (LOG_LEVEL === "info" && level === "DEBUG") return;
  const ts = new Date().toISOString();
  console.log(ts, level, ...args);
}

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGINS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    ...extra
  };
}

function jsonResponse(statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(extraHeaders)
    },
    body: JSON.stringify(bodyObj)
  };
}

// ===============================
// PARSE GENÉRICO DO EVENTO (APIGW v1/v2)
// ===============================
function parseEvent(event) {
  const method =
    event.httpMethod || event.requestContext?.http?.method || "GET";

  const path = event.path || event.rawPath || "";

  let query = event.queryStringParameters || {};
  if (!query && event.rawQueryString) {
    query = {};
    const pairs = event.rawQueryString.split("&");
    for (const p of pairs) {
      const [k, v] = p.split("=");
      if (!k) continue;
      query[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }

  return { method, path, query };
}

// ===============================
// AUTENTICAÇÃO JWT (DASHBOARD)
// ===============================
function autenticarRequest(event) {
  const headers = event.headers || {};
  const authHeader = headers.Authorization || headers.authorization || "";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    log(
      "WARN",
      "[METRICAS] Auth 401: TOKEN_MISSING - Token JWT ausente ou mal formatado."
    );
    return {
      ok: false,
      httpStatus: 401,
      code: "TOKEN_MISSING",
      message: "Token JWT ausente ou mal formatado. Faça login novamente."
    };
  }

  const token = authHeader.substring("Bearer ".length).trim();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const tenant =
      decoded.tenant ||
      decoded.tenantId ||
      decoded.sub ||
      decoded.email ||
      decoded.r;

    log("INFO", "[METRICAS] JWT válido. Tenant:", tenant);

    if (!tenant) {
      return {
        ok: false,
        httpStatus: 401,
        code: "TOKEN_INVALID",
        message: "Token JWT válido mas sem tenant. Faça login novamente."
      };
    }

    return {
      ok: true,
      tenant,
      decoded
    };
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      log("WARN", "[METRICAS] Auth 401: TOKEN_EXPIRED");
      return {
        ok: false,
        httpStatus: 401,
        code: "TOKEN_EXPIRED",
        message: "Sua sessão expirou. Faça login novamente."
      };
    }

    log("WARN", "[METRICAS] Auth 401: TOKEN_INVALID", err.message);
    return {
      ok: false,
      httpStatus: 401,
      code: "TOKEN_INVALID",
      message: "Token JWT inválido. Faça login novamente."
    };
  }
}

// ===============================
// SHAPE DAS MÉTRICAS
// ===============================
function buildEmptyMetrics() {
  return {
    rangeLabels: [],
    daily: {
      scans: [],
      sessoes: [],
      unicos: [],
      info: [],
      likes: [],
      dislikes: []
    },
    porMesa: [],
    tempoMenu: [],
    picos: [],
    devices: [], // distribuição de dispositivos
    topItems: [],
    timeByCategory: [],
    topCategories: [],
    engagementByMesa: { porMesa: [] },
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
      returnRate: 0,
      infoOpens: 0,
      infoAvgTimeInfoBox: 0,
      modelsLoaded: 0,
      modelsErrors: 0,
      // NOVOS KPIs
      likeTotal: 0,
      dislikeTotal: 0
    },
    recurrenceData: [],
    topModels: [],
    modelErrors: [],
    meta: {}
  };
}

// ===============================
// HELPERS DE DATA
// ===============================
function parseDateParam(value) {
  if (!value) return null;

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // dd/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  return null;
}

function formatYMD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatLabelDM(date) {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

function buildRangeSkeleton(startDate, endDate) {
  const result = buildEmptyMetrics();
  const indexByDay = new Map();

  let current = new Date(startDate.getTime());
  const end = new Date(endDate.getTime());

  while (current <= end) {
    const ymd = formatYMD(current);
    indexByDay.set(ymd, result.rangeLabels.length);
    result.rangeLabels.push(formatLabelDM(current));
    result.daily.scans.push(0);
    result.daily.sessoes.push(0);
    result.daily.unicos.push(0);
    result.daily.info.push(0);
    result.daily.likes.push(0);
    result.daily.dislikes.push(0);

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return { result, indexByDay };
}

// ===============================
// HELPERS DE S3
// ===============================
function buildMetricsKey(tenantId, tsFromBody) {
  let utc;
  if (tsFromBody) {
    utc = new Date(tsFromBody);
    if (isNaN(utc.getTime())) {
      utc = new Date();
    }
  } else {
    utc = new Date();
  }

  // usa horário local para particionar em yyyy/mm/dd/hh
  const local = toLocalDate(utc);

  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");

  const partId =
    Date.now().toString() + "-" + Math.random().toString(36).slice(2, 10);

  return `${METRICS_PREFIX}/${tenantId}/metrics/yyyy=${yyyy}/mm=${mm}/dd=${dd}/hh=${hh}/part-${partId}.jsonl`;
}

async function saveBatchToS3(tenantId, payload, tsFromBody) {
  const lineObj = {
    tId: tenantId,
    ts: new Date().toISOString(),
    batch: payload
  };

  const bodyStr = JSON.stringify(lineObj) + "\n";
  const Key = buildMetricsKey(tenantId, tsFromBody);

  await s3.send(
    new PutObjectCommand({
      Bucket: METRICS_BUCKET,
      Key,
      Body: bodyStr,
      ContentType: "application/json"
    })
  );

  const eventsCount = Array.isArray(payload.events)
    ? payload.events.length
    : 0;

  log(
    "INFO",
    `[METRICAS] Lote salvo no S3: ${METRICS_BUCKET}/${Key} eventsCount: ${eventsCount} tenantId: ${tenantId}`
  );
}

async function listAllObjects(bucket, prefix) {
  let token;
  const keys = [];

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token
      })
    );
    if (res.Contents) {
      for (const obj of res.Contents) {
        if (obj.Key) keys.push(obj.Key);
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return keys;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ===============================
// AGREGAÇÃO DAS MÉTRICAS (GET)
// ===============================
async function aggregateMetrics(tenantId, startDate, endDate) {
  const prefix = `${METRICS_PREFIX}/${tenantId}/metrics/`;

  log(
    "INFO",
    "[METRICAS] aggregateMetrics prefix:",
    `${METRICS_BUCKET}/${prefix}`
  );

  const allKeys = await listAllObjects(METRICS_BUCKET, prefix);

  log("INFO", "[METRICAS] total de arquivos de métricas:", allKeys.length);

  const { result, indexByDay } = buildRangeSkeleton(startDate, endDate);

  // Garante arrays/dados para bloco de LIKE
  if (!Array.isArray(result.daily.likes)) {
    result.daily.likes = result.rangeLabels.map(() => 0);
  }
  if (!Array.isArray(result.daily.dislikes)) {
    result.daily.dislikes = result.rangeLabels.map(() => 0);
  }
  if (typeof result.kpis.likeTotal !== "number") {
    result.kpis.likeTotal = 0;
  }
  if (typeof result.kpis.dislikeTotal !== "number") {
    result.kpis.dislikeTotal = 0;
  }

  // range em horário LOCAL
  const startLocalMs = startDate.getTime();
  const endLocalMs = endDate.getTime() + DAY_MS - 1;

  // Sets globais
  const sessionSetGlobal = new Set();
  const clientSetGlobal = new Set();

  // Sets por dia
  const sessionByDay = new Map(); // ymd -> Set(sessionId)
  const clientByDay = new Map(); // ymd -> Set(clientId)

  // Mapa auxiliar: sessionId -> clientId
  const sessionToClient = new Map();

  // Voto único por (item, cliente)
  // key: `${itemLabel}||${clientId}` -> "like" | "dislike"
  const voteByItemUser = new Map();

  // --- agregação por mesa / QR (SCANS) ---
  const mesaStats = new Map();
  // label -> {
  //   mesa: string,
  //   scans: number,
  //   ultimoScan: string | null (ISO UTC),
  //   totalTimeMs: number,
  //   countTime: number
  // }

  // --- agregação de ENGAGEMENT por mesa ---
  const mesaEngagement = new Map();
  // label -> {
  //   mesa: string,
  //   totalTimeSec: number,
  //   totalInteractions: number,
  //   sessionsSet: Set<string>
  // }

  // --- Distribuição de dispositivos por sessão ---
  const deviceBySession = new Map();
  // sessionId -> { label, totalVisibleMs }

  function resolveMesaLabel(ev) {
    const p = ev.payload || {};
    let label =
      p.qrLabel ||
      p.mesa ||
      p.table ||
      ev.mesa ||
      ev.table ||
      ev.qrLabel ||
      ev.qrId ||
      p.qrId ||
      null;

    label = (label && String(label).trim()) || null;
    if (!label) return "QR/mesa-desconhecido";
    return label;
  }

  function ensureMesaEngagement(label) {
    let rec = mesaEngagement.get(label);
    if (!rec) {
      rec = {
        mesa: label,
        totalTimeSec: 0,
        totalInteractions: 0,
        sessionsSet: new Set()
      };
      mesaEngagement.set(label, rec);
    }
    return rec;
  }

  function registerScanMesa(ev, eventTimeMsUtc) {
    const label = resolveMesaLabel(ev);
    const current = mesaStats.get(label) || {
      mesa: label,
      scans: 0,
      ultimoScan: null,
      totalTimeMs: 0,
      countTime: 0
    };
    current.scans += 1;

    const currentLastMs = current.ultimoScan
      ? new Date(current.ultimoScan).getTime()
      : 0;
    if (!current.ultimoScan || eventTimeMsUtc > currentLastMs) {
      // último scan guardado em UTC para o front formatar em local
      current.ultimoScan = new Date(eventTimeMsUtc).toISOString();
    }
    mesaStats.set(label, current);

    // marca sessão por mesa (engajamento)
    const sessionId = ev.sessionId;
    if (sessionId) {
      const eng = ensureMesaEngagement(label);
      eng.sessionsSet.add(sessionId);
    }
  }

  function registerTimeMesa(ev, durationMs) {
    if (!durationMs || durationMs <= 0) return;
    const label = resolveMesaLabel(ev);
    const current = mesaStats.get(label) || {
      mesa: label,
      scans: 0,
      ultimoScan: null,
      totalTimeMs: 0,
      countTime: 0
    };
    current.totalTimeMs += durationMs;
    current.countTime += 1;
    mesaStats.set(label, current);

    // acumula tempo por mesa (engajamento)
    const eng = ensureMesaEngagement(label);
    eng.totalTimeSec += durationMs / 1000;
  }

  function registerInteractionMesa(ev) {
    const label = resolveMesaLabel(ev);
    const eng = ensureMesaEngagement(label);
    eng.totalInteractions += 1;
    if (ev.sessionId) eng.sessionsSet.add(ev.sessionId);
  }

  // --- Tempo Médio (Cardápio) por dia ---
  const tempoMenuByDay = new Map(); // ymd -> { durationsSec: number[] }

  // --- Horário de Pico (scans por hora) ---
  const picosMap = new Map(); // key: `${ymd}-${hour}` -> { ymd, hour, scans }

  // --- Tempo por ITEM (dwell por produto) ---
  const itemStats = new Map();
  // key -> { item: string, totalTimeMs: number, views: number }

  // --- Cliques Info por ITEM ---
  const itemInfoClicks = new Map();
  // key -> number

  function addMenuDuration(dayYmd, durationMs) {
    if (!durationMs || durationMs <= 0) return;
    const sec = durationMs / 1000;
    const agg = tempoMenuByDay.get(dayYmd) || { durationsSec: [] };
    agg.durationsSec.push(sec);
    tempoMenuByDay.set(dayYmd, agg);
  }

  function addPico(dayYmd, hour) {
    const key = `${dayYmd}-${hour}`;
    const cur = picosMap.get(key) || { ymd: dayYmd, hour, scans: 0 };
    cur.scans += 1;
    picosMap.set(key, cur);
  }

  function median(values) {
    if (!values || !values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return Math.round(sorted[mid]);
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  // label amigável pro item (usa vários campos possíveis, evitando "[object Object]")
  function resolveItemLabel(ev) {
    const p = ev.payload || {};
    let label = "";

    // 1) ID simples (melhor para bater com mapItemName no front)
    if (p.itemId && typeof p.itemId !== "object") {
      label = String(p.itemId).trim();
    }

    // 2) Campo "item" – pode ser string OU objeto completo
    if (!label && p.item) {
      const it = p.item;
      if (typeof it === "string" || typeof it === "number") {
        label = String(it).trim();
      } else if (it && typeof it === "object") {
        label =
          it.id ||
          it.itemId ||
          it.sku ||
          it.nome ||
          it.name ||
          it.title ||
          it.label ||
          it.modelName ||
          "";
      }
    }

    // 3) Outros campos diretos do payload
    if (!label && p.itemName) label = String(p.itemName).trim();
    if (!label && p.name) label = String(p.name).trim();
    if (!label && p.label) label = String(p.label).trim();
    if (!label && p.title) label = String(p.title).trim();
    if (!label && p.modelName) label = String(p.modelName).trim();

    // 4) Campo direto no evento
    if (!label && ev.item && typeof ev.item !== "object") {
      label = String(ev.item).trim();
    }

    // Sanitiza
    label = String(label || "").trim();
    if (!label || label === "[object Object]") return "item-desconhecido";
    return label;
  }

  // Classificação de dispositivo (Android / iPhone / iPad / Desktop / Outros)
  function classifyDevice(ua) {
    const devClass = String(
      ua.deviceClass || ua.device_type || ua.device || ""
    ).toLowerCase();
    const uaStr = String(ua.userAgent || ua.ua || "").toLowerCase();

    // mobile / tablet com SO conhecido
    if (devClass === "mobile" || devClass === "tablet") {
      if (uaStr.includes("android")) return "Android";
      if (uaStr.includes("iphone") || uaStr.includes("ipod")) return "iPhone";
      if (uaStr.includes("ipad")) return "iPad";
    }

    // desktop explícito
    if (devClass === "desktop" || devClass === "pc") return "Desktop";

    // fallback pelo UA direto
    if (uaStr.includes("android")) return "Android";
    if (uaStr.includes("iphone") || uaStr.includes("ipod")) return "iPhone";
    if (uaStr.includes("ipad")) return "iPad";
    if (
      uaStr.includes("windows") ||
      uaStr.includes("macintosh") ||
      uaStr.includes("linux")
    ) {
      return "Desktop";
    }

    return "Outros";
  }

  // Acumuladores de tempo globais
  let totalInfoTimeMs = 0;
  let infoReadEvents = 0;

  let totalItemTimeMs = 0;
  let itemViewEvents = 0;

  const categoryTimeMs = new Map(); // categoria -> soma ms
  const categoryViewCount = new Map(); // categoria -> qtd eventos

  let filesCount = 0;
  let eventsCount = 0;

  if (!allKeys.length) {
    result.meta = {
      tenantId,
      start: formatYMD(startDate),
      end: formatYMD(endDate),
      filesCount: 0,
      eventsCount: 0,
      tzOffsetMinutes: TZ_OFFSET_MINUTES
    };
    return result;
  }

  // ---------- Loop nos arquivos ----------
  for (const key of allKeys) {
    filesCount++;

    let obj;
    try {
      obj = await s3.send(
        new GetObjectCommand({
          Bucket: METRICS_BUCKET,
          Key: key
        })
      );
    } catch (err) {
      log(
        "WARN",
        "[METRICAS] Erro ao fazer GetObject em",
        key,
        "-",
        err.message
      );
      continue; // ignora este arquivo
    }

    let text;
    try {
      text = await streamToString(obj.Body);
    } catch (err) {
      log(
        "WARN",
        "[METRICAS] Erro ao ler stream de",
        key,
        "-",
        err.message
      );
      continue;
    }

    const lines = text.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let rec;
      try {
        rec = JSON.parse(trimmed);
      } catch {
        continue;
      }

      const batch = rec.batch || {};
      const events = Array.isArray(batch.events) ? batch.events : [];
      eventsCount += events.length;

      for (const ev of events) {
        const name = ev.name || ev.type || "unknown";
        const nameLc = String(name || "").toLowerCase();

        // --- timestamp real do evento ---
        let tsStr =
          ev.timestamp ||
          ev.ts ||
          (batch.meta && batch.meta.timestamp) ||
          rec.ts ||
          null;

        if (!tsStr) continue;

        const dUtc = new Date(tsStr);
        if (isNaN(dUtc.getTime())) continue;

        const tMsUtc = dUtc.getTime();
        const dLocal = toLocalDate(dUtc);
        const tMsLocal = dLocal.getTime();

        // filtro por data em horário LOCAL
        if (tMsLocal < startLocalMs || tMsLocal > endLocalMs) {
          continue;
        }

        const dayYmd = formatYMD(dLocal);
        const idx = indexByDay.get(dayYmd);
        if (idx === undefined) {
          continue;
        }

        // --------- Dispositivo da sessão (page_open) ----------
        if (name === "page_open") {
          const ua = ev.ua || {};
          const label = classifyDevice(ua);
          const sessionId = ev.sessionId || null;

          if (sessionId) {
            let ds = deviceBySession.get(sessionId);
            if (!ds) {
              ds = { label, totalVisibleMs: 0 };
              deviceBySession.set(sessionId, ds);
            } else if (!ds.label && label) {
              ds.label = label;
            }
          }
        }

        // --------- Scans de QR (page_open) ----------
        if (name === "page_open") {
          result.kpis.scansTotal++;
          result.daily.scans[idx] = (result.daily.scans[idx] || 0) + 1;

          const sessionId = ev.sessionId;
          if (sessionId) {
            sessionSetGlobal.add(sessionId);

            let setDia = sessionByDay.get(dayYmd);
            if (!setDia) {
              setDia = new Set();
              sessionByDay.set(dayYmd, setDia);
            }
            setDia.add(sessionId);
          }

          // mesa / QR
          registerScanMesa(ev, tMsUtc);

          // Horário de pico (usa hora LOCAL)
          const hour = dLocal.getUTCHours();
          addPico(dayYmd, hour);
        }

        // --------- Cliques no Info ----------
        if (name === "info_click") {
          result.kpis.infoClicks++;
          result.kpis.infoTotal++;
          result.daily.info[idx] = (result.daily.info[idx] || 0) + 1;

          // soma por ITEM (para topItems.clicksInfo)
          const itemLabel = resolveItemLabel(ev);
          const prev = itemInfoClicks.get(itemLabel) || 0;
          itemInfoClicks.set(itemLabel, prev + 1);
        }

        // --------- Tempo de leitura (geral) ----------
        if (name === "info_read" && ev.payload) {
          const dur = ev.payload.durationMs || ev.payload.duration || 0;
          if (typeof dur === "number" && dur > 0) {
            totalInfoTimeMs += dur;
            infoReadEvents++;
          }
        }

        // --------- Tempo por Item / Categoria ----------
        if (
          (name === "item_view" || name === "menu_item_view") &&
          ev.payload
        ) {
          const dur = ev.payload.durationMs || ev.payload.duration || 0;
          if (typeof dur === "number" && dur > 0) {
            totalItemTimeMs += dur;
            itemViewEvents++;

            // tempo por mesa (para tempo médio por mesa)
            registerTimeMesa(ev, dur);

            // tempo por categoria
            const cat = ev.payload.category || ev.payload.cat || null;
            if (cat) {
              const prevT = categoryTimeMs.get(cat) || 0;
              const prevC = categoryViewCount.get(cat) || 0;
              categoryTimeMs.set(cat, prevT + dur);
              categoryViewCount.set(cat, prevC + 1);
            }

            // tempo médio por ITEM (dwell)
            const itemLabel = resolveItemLabel(ev);
            const current = itemStats.get(itemLabel) || {
              item: itemLabel,
              totalTimeMs: 0,
              views: 0
            };
            current.totalTimeMs += dur;
            current.views += 1;
            itemStats.set(itemLabel, current);
          }
        }

        // --------- LIKE / DISLIKE (1 voto por cliente+item) ----------
        let isLikeEvent = false;
        let isDislikeEvent = false;

        const likeValueRaw =
          (ev.payload && (ev.payload.likeValue || ev.payload.value)) || "";
        const likeValue = String(likeValueRaw).toLowerCase();

        if (
          nameLc === "like" ||
          nameLc === "like_click" ||
          nameLc === "item_like"
        ) {
          if (
            likeValue === "negativo" ||
            likeValue === "dislike" ||
            likeValue === "down"
          ) {
            isDislikeEvent = true;
          } else {
            isLikeEvent = true;
          }
        } else if (
          nameLc === "dislike" ||
          nameLc === "dislike_click" ||
          nameLc === "item_dislike" ||
          nameLc.includes("dislike")
        ) {
          isDislikeEvent = true;
        } else if (nameLc.includes("like")) {
          // fallback genérico
          isLikeEvent = true;
        }

        if (isLikeEvent || isDislikeEvent) {
          // 1) Série diária (interações brutas)
          if (isLikeEvent) {
            result.daily.likes[idx] = (result.daily.likes[idx] || 0) + 1;
          } else {
            result.daily.dislikes[idx] =
              (result.daily.dislikes[idx] || 0) + 1;
          }

          // 2) Voto único por cliente+item
          const itemLabel = resolveItemLabel(ev);

          let clientId =
            (ev.payload && ev.payload.clientId) ||
            ev.clientId ||
            (ev.sessionId && sessionToClient.get(ev.sessionId)) ||
            null;

          // fallback: usa sessionId se não tiver clientId
          if (!clientId && ev.sessionId) {
            clientId = ev.sessionId;
          }

          if (clientId) {
            const keyVote = `${itemLabel}||${clientId}`;
            voteByItemUser.set(keyVote, isLikeEvent ? "like" : "dislike");
          }
        }

        // --------- Visitantes únicos / Clientes ----------
        if (name === "visitor_status" && ev.payload) {
          const clientId = ev.payload.clientId;
          if (clientId) {
            clientSetGlobal.add(clientId);

            // mapeia sessão -> cliente para uso nos likes
            if (ev.sessionId) {
              sessionToClient.set(ev.sessionId, clientId);
            }

            let setDia = clientByDay.get(dayYmd);
            if (!setDia) {
              setDia = new Set();
              clientByDay.set(dayYmd, setDia);
            }
            setDia.add(clientId);
          }
        }

        // --------- Tempo de cardápio (Tempo Médio (Cardápio)) ----------
        if (
          (name === "page_hidden" || name === "page_unload") &&
          ev.payload
        ) {
          const rawDur =
            ev.payload.visibleMs ||
            ev.payload.visible_ms ||
            ev.payload.durationMs ||
            ev.payload.duration ||
            0;
          const durMs = Number(rawDur) || 0;
          if (durMs > 0) {
            addMenuDuration(dayYmd, durMs);
          }

          // acumula tempo por dispositivo (por sessão)
          if (ev.sessionId) {
            const ds = deviceBySession.get(ev.sessionId);
            if (ds) {
              ds.totalVisibleMs += durMs;
            }
          }
        }

        // --------- INTERAÇÕES POR MESA (ENGAJAMENTO) ----------
        if (
          name === "activity" ||
          name === "info_click" ||
          name === "menu_click" ||
          name === "category_click" ||
          name === "nav_prev" ||
          name === "nav_next" ||
          name === "add_to_cart" ||
          name === "remove_from_cart" ||
          name === "checkout" ||
          nameLc.includes("like")
        ) {
          registerInteractionMesa(ev);
        }
      }
    }
  }

  // ---------- Monta porMesa a partir de mesaStats ----------
  result.porMesa = Array.from(mesaStats.values())
    .map((m) => {
      const avgTimeSec =
        m.countTime > 0
          ? Math.round(m.totalTimeMs / m.countTime / 1000)
          : 0;
      return {
        mesa: m.mesa,
        scans: m.scans,
        ultimoScan: m.ultimoScan,
        avgTimeSec
      };
    })
    .sort((a, b) => b.scans - a.scans);

  // ---------- Monta engagementByMesa (tempo + interações + sessões) ----------
  const engagementPorMesa = Array.from(mesaEngagement.values())
    .map((rec) => {
      const sessions = rec.sessionsSet ? rec.sessionsSet.size : 0;
      const avgTimeSec =
        sessions > 0 ? Math.round(rec.totalTimeSec / sessions) : 0;
      const interactionsPerSession =
        sessions > 0
          ? Number((rec.totalInteractions / sessions).toFixed(2))
          : 0;

      return {
        mesa: rec.mesa,
        avgTimeSec,
        interactionsPerSession,
        sessions
      };
    })
    .sort((a, b) => {
      if (b.sessions !== a.sessions) return b.sessions - a.sessions;
      return (b.avgTimeSec || 0) - (a.avgTimeSec || 0);
    });

  result.engagementByMesa = { porMesa: engagementPorMesa };

  // ---------- Distribuição de dispositivos ----------
  const deviceAgg = new Map();
  for (const ds of deviceBySession.values()) {
    const label = ds.label || "Outros";
    const current = deviceAgg.get(label) || {
      label,
      sessions: 0,
      totalTimeMs: 0
    };
    current.sessions += 1;
    current.totalTimeMs += ds.totalVisibleMs;
    deviceAgg.set(label, current);
  }

  result.devices = Array.from(deviceAgg.values())
    .map((d) => ({
      label: d.label,
      sessions: d.sessions,
      avgTimeSec:
        d.sessions > 0
          ? Math.round(d.totalTimeMs / d.sessions / 1000)
          : 0
    }))
    .sort((a, b) => b.sessions - a.sessions);

  // ---------- Preenche por dia: sessoes e unicos + base para retorno ----------
  const clientDaysCount = new Map(); // clientId -> qtd de dias distintos

  for (const [ymd, idx] of indexByDay.entries()) {
    const sessionsDay = sessionByDay.get(ymd);
    const clientsDay = clientByDay.get(ymd);

    if (sessionsDay) {
      result.daily.sessoes[idx] = sessionsDay.size;
    }

    if (clientsDay) {
      result.daily.unicos[idx] = clientsDay.size;

      for (const clientId of clientsDay) {
        const prev = clientDaysCount.get(clientId) || 0;
        clientDaysCount.set(clientId, prev + 1);
      }
    }
  }

  // ---------- Monta tempoMenu ----------
  result.tempoMenu = [];
  for (const [ymd, idx] of indexByDay.entries()) {
    const agg = tempoMenuByDay.get(ymd);
    if (!agg || !agg.durationsSec.length) continue;

    const arr = agg.durationsSec;
    const amostras = arr.length;
    const soma = arr.reduce((a, b) => a + b, 0);
    const mediaSec = Math.round(soma / amostras);
    const medianaSec = median(arr);

    result.tempoMenu.push({
      periodo: result.rangeLabels[idx] || ymd,
      mediaSec,
      medianaSec,
      amostras
    });
  }

  // ---------- Monta picos (Horário de Pico) ----------
  result.picos = Array.from(picosMap.values())
    .sort((a, b) => {
      if (a.ymd === b.ymd) return a.hour - b.hour;
      return a.ymd < b.ymd ? -1 : 1;
    })
    .map((p) => {
      const idx = indexByDay.get(p.ymd);
      const dateLabel =
        idx !== undefined ? result.rangeLabels[idx] : p.ymd;
      const hourLabel = `${String(p.hour).padStart(2, "0")}:00`;
      return {
        dateYmd: p.ymd,
        dateLabel,
        hora: p.hour,
        hourLabel,
        scans: p.scans
      };
    });

  // ---------- Totais globais ----------
  result.kpis.sessoesTotal = sessionSetGlobal.size;
  result.kpis.unicosTotal = clientSetGlobal.size;

  // Tempo médio de leitura (segundos)
  if (infoReadEvents > 0) {
    const avgSeconds = Math.round(totalInfoTimeMs / infoReadEvents / 1000);
    result.kpis.infoAvgTime = avgSeconds;
    result.kpis.infoAvgTimeInfoBox = avgSeconds;
  }

  // Tempo médio por item (segundos) – geral
  if (itemViewEvents > 0) {
    result.kpis.avgTimePerItem = Math.round(
      totalItemTimeMs / itemViewEvents / 1000
    );
  }

  // Tempo médio por categoria (segundos) – média das categorias
  let totalCatAvgSec = 0;
  let catCount = 0;
  for (const [cat, timeMs] of categoryTimeMs.entries()) {
    const c = categoryViewCount.get(cat) || 0;
    if (c > 0) {
      totalCatAvgSec += timeMs / c / 1000;
      catCount++;
    }
  }
  if (catCount > 0) {
    result.kpis.avgTimePerCategory = Math.round(totalCatAvgSec / catCount);
  }

  // ---------- Consolida votos únicos (like/dislike) ----------
  const itemVotes = new Map(); // item -> {likes, dislikes}

  // Preenche mapa de votos por item a partir de voteByItemUser
  for (const [key, vote] of voteByItemUser.entries()) {
    const [itemName] = key.split("||", 2);
    const agg = itemVotes.get(itemName) || { likes: 0, dislikes: 0 };

    if (vote === "like") {
      agg.likes++;
    } else if (vote === "dislike") {
      agg.dislikes++;
    }

    itemVotes.set(itemName, agg);
  }

  // Totais a partir de votos únicos (item+cliente)
  let likeTotal = 0;
  let dislikeTotal = 0;
  for (const v of itemVotes.values()) {
    likeTotal += v.likes;
    dislikeTotal += v.dislikes;
  }

  // Fallback: se não houver nenhum voto único, usa a soma bruta por dia
  if (likeTotal === 0 && Array.isArray(result.daily.likes)) {
    likeTotal = result.daily.likes.reduce(
      (acc, v) => acc + (Number(v) || 0),
      0
    );
  }
  if (dislikeTotal === 0 && Array.isArray(result.daily.dislikes)) {
    dislikeTotal = result.daily.dislikes.reduce(
      (acc, v) => acc + (Number(v) || 0),
      0
    );
  }

  result.kpis.likeTotal = likeTotal;
  result.kpis.dislikeTotal = dislikeTotal;

  // ---------- Monta timeByCategory (Tempo por Categoria) ----------
  const totalCatTimeMs = Array.from(categoryTimeMs.values()).reduce(
    (sum, v) => sum + v,
    0
  );

  result.timeByCategory = Array.from(categoryTimeMs.entries())
    .map(([cat, timeMs]) => {
      const views = categoryViewCount.get(cat) || 0;

      const avgTimeSec =
        views > 0 ? Math.round(timeMs / views / 1000) : 0;

      const pctTime =
        totalCatTimeMs > 0 ? (timeMs / totalCatTimeMs) * 100 : 0;

      return {
        category: cat,
        avgTimeSec,
        sessions: views,
        pctTime
      };
    })
    .sort((a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0));

  // ---------- topItems (inclui likes / dislikes únicos + clicksInfo) ----------
  const topItemsArr = [];
  const seenItems = new Set();

  // Itens com dwell (views/tempo)
  for (const it of itemStats.values()) {
    const votes = itemVotes.get(it.item) || { likes: 0, dislikes: 0 };
    const infoClicks = itemInfoClicks.get(it.item) || 0;

    topItemsArr.push({
      item: it.item,
      avgTimeSec:
        it.views > 0
          ? Math.round(it.totalTimeMs / it.views / 1000)
          : 0,
      views: it.views,
      likes: votes.likes,
      dislikes: votes.dislikes,
      category: null,
      clicksInfo: infoClicks
    });
    seenItems.add(it.item);
  }

  // Itens que só aparecem em votos (sem dwell)
  for (const [itemName, votes] of itemVotes.entries()) {
    if (seenItems.has(itemName)) continue;
    const infoClicks = itemInfoClicks.get(itemName) || 0;

    topItemsArr.push({
      item: itemName,
      avgTimeSec: 0,
      views: 0,
      likes: votes.likes,
      dislikes: votes.dislikes,
      category: null,
      clicksInfo: infoClicks
    });
    seenItems.add(itemName);
  }

  // Itens que só têm info_click (sem dwell nem voto)
  for (const [itemName, infoClicks] of itemInfoClicks.entries()) {
    if (seenItems.has(itemName)) continue;

    topItemsArr.push({
      item: itemName,
      avgTimeSec: 0,
      views: 0,
      likes: 0,
      dislikes: 0,
      category: null,
      clicksInfo: infoClicks
    });
    seenItems.add(itemName);
  }

  result.topItems = topItemsArr.sort((a, b) => b.avgTimeSec - a.avgTimeSec);

  // ---------- Clientes ativos / novos / recorrentes / taxa de retorno ----------
  let newClients = 0;
  let recurringClients = 0;

  for (const [, daysCount] of clientDaysCount.entries()) {
    if (daysCount <= 1) {
      newClients++;
    } else {
      recurringClients++;
    }
  }

  result.kpis.activeClients = clientSetGlobal.size;
  result.kpis.newClients = newClients;
  result.kpis.recurringClients = recurringClients;

  if (result.kpis.activeClients > 0) {
    result.kpis.returnRate = Math.round(
      (recurringClients / result.kpis.activeClients) * 100
    );
  }

  // Meta para debug / insights
  result.meta = {
    tenantId,
    start: formatYMD(startDate),
    end: formatYMD(endDate),
    filesCount,
    eventsCount,
    tzOffsetMinutes: TZ_OFFSET_MINUTES
  };

  return result;
}

// ===============================
// OPENAI – GERAÇÃO DE INSIGHTS
// ===============================
async function generateInsightsWithOpenAI(metrics, opts = {}) {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY não configurada na Lambda.");
  }

  const { startLabel, endLabel, hourLabel } = opts;

  // Resumo enxuto pra reduzir tokens
  const payload = {
    periodo: {
      inicio: startLabel,
      fim: endLabel,
      horaReferencia: hourLabel || null
    },
    kpis: metrics.kpis,
    picos: metrics.picos,
    tempoMenu: metrics.tempoMenu,
    porMesa: metrics.porMesa,
    engagementByMesa: metrics.engagementByMesa,
    timeByCategory: metrics.timeByCategory,
    topItems: (metrics.topItems || []).slice(0, 15),
    devices: metrics.devices
  };

  const systemPrompt =
    "Você é um analista de dados para restaurantes que usam o ARCardápio. " +
    "Explique em português, de forma simples, direta e útil para o dono do restaurante. " +
    "Você SEMPRE deve responder em JSON no formato: " +
    '{ "title": string, "summary": string, "status": "bom" | "neutro" | "ruim", "suggestion": string }. ' +
    'O campo "status" indica se o desempenho no período está bom, neutro ou ruim. ' +
    'Use no máximo 3 parágrafos curtos dentro de "summary".';

  const userPrompt =
    "Analise os dados de uso do ARCardápio abaixo e gere um insight para o dono do restaurante. " +
    "Foque em: movimento (scans, sessões, clientes), engajamento (tempo no cardápio, cliques em info, likes) " +
    "e itens/mesas que mais chamaram atenção. Em seguida, dê uma sugestão prática no campo suggestion.\n\n" +
    "DADOS EM JSON:\n" +
    JSON.stringify(payload);

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 220,
    temperature: 0.6
  });

  const content = completion.choices?.[0]?.message?.content || "";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    // fallback se o modelo não retornar JSON perfeito
    parsed = {
      title: "Insights de uso do ARCardápio",
      summary: content || "Não foi possível interpretar a resposta da IA.",
      status: "neutro",
      suggestion: ""
    };
  }

  return parsed;
}

// ===============================
// HANDLERS
// ===============================

// GET /metricas/cliente (dashboard)
async function handleGetMetrics(event, auth, parsed) {
  const tenantRaw = auth.tenant;
  const tenantId = normalizarTenantId(tenantRaw);

  const { startDate: startRaw, endDate: endRaw } = parsed.query || {};

  let startDate = parseDateParam(startRaw);
  let endDate = parseDateParam(endRaw);

  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );

  if (!startDate) startDate = todayUTC;
  if (!endDate) endDate = todayUTC;

  if (startDate > endDate) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }

  log(
    "INFO",
    "[METRICAS] GET /metricas/cliente",
    "tenantRaw:",
    tenantRaw,
    "tenantId:",
    tenantId,
    "start:",
    formatYMD(startDate),
    "end:",
    formatYMD(endDate),
    "tzOffsetMin:",
    TZ_OFFSET_MINUTES,
    "bucket:",
    METRICS_BUCKET,
    "prefix:",
    METRICS_PREFIX
  );

  try {
    const data = await aggregateMetrics(tenantId, startDate, endDate);

    data.meta = {
      ...(data.meta || {}),
      tenantRaw,
      tenantId
    };

    return jsonResponse(200, data);
  } catch (err) {
    log("ERROR", "[METRICAS] Erro em aggregateMetrics:", err);

    const vazio = buildEmptyMetrics();
    vazio.meta = {
      error: String((err && err.message) || err),
      tenantRaw,
      tenantId,
      bucket: METRICS_BUCKET,
      prefix: METRICS_PREFIX
    };

    // Devolve 200 com base vazia para não quebrar o dashboard
    return jsonResponse(200, vazio);
  }
}

// GET /metricas/insights (dashboard → IA)
async function handleGetInsights(event, auth, parsed) {
  const tenantRaw = auth.tenant;
  const tenantId = normalizarTenantId(tenantRaw);

  if (!openaiClient) {
    return jsonResponse(500, {
      ok: false,
      code: "NO_OPENAI_KEY",
      message: "OPENAI_API_KEY não configurada na Lambda."
    });
  }

  const { startDate: startRaw, endDate: endRaw, hourLabel } =
    parsed.query || {};

  let startDate = parseDateParam(startRaw);
  let endDate = parseDateParam(endRaw);

  const today = new Date();
  const todayUTC = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );

  if (!startDate) startDate = todayUTC;
  if (!endDate) endDate = todayUTC;

  if (startDate > endDate) {
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }

  log(
    "INFO",
    "[METRICAS] GET /metricas/insights",
    "tenantRaw:",
    tenantRaw,
    "tenantId:",
    tenantId,
    "start:",
    formatYMD(startDate),
    "end:",
    formatYMD(endDate),
    "hourLabel:",
    hourLabel || null
  );

  try {
    const metrics = await aggregateMetrics(tenantId, startDate, endDate);

    const startLabel = formatYMD(startDate);
    const endLabel = formatYMD(endDate);

    const insight = await generateInsightsWithOpenAI(metrics, {
      startLabel,
      endLabel,
      hourLabel: hourLabel || null
    });

    return jsonResponse(200, {
      ok: true,
      tenantRaw,
      tenantId,
      period: {
        start: startLabel,
        end: endLabel,
        hourLabel: hourLabel || null
      },
      insights: insight
    });
  } catch (err) {
    log("ERROR", "[METRICAS] Erro em handleGetInsights:", err);
    return jsonResponse(500, {
      ok: false,
      code: "INSIGHTS_ERROR",
      message: "Erro ao gerar insights com IA.",
      details: String(err && err.message ? err.message : err)
    });
  }
}

// POST /metrics/ingest (app → público, sem JWT)
async function handleIngestPublic(event, parsed) {
  let body = null;

  try {
    body =
      typeof event.body === "string"
        ? JSON.parse(event.body || "{}")
        : event.body || {};
  } catch (err) {
    log("WARN", "[METRICAS] Ingest body JSON inválido:", err.message);
    return jsonResponse(400, {
      ok: false,
      code: "BAD_REQUEST",
      message: "Body JSON inválido em /metrics ingest."
    });
  }

  const emailRaw =
    (body.email ||
      (body.batch && body.batch.meta && body.batch.meta.email) ||
      "") || "";

  let tenantRaw =
    body.tId ||
    body.tenant ||
    (body.session && body.session.tenant) ||
    (body.meta && body.meta.tenant) ||
    emailRaw ||
    null;

  const tenantId = normalizarTenantId(tenantRaw);

  if (!tenantRaw) {
    log(
      "WARN",
      "[METRICAS] Ingest sem tenant nem email no payload. Usando 'unknown'.",
      JSON.stringify(body)
    );
  }

  let batchPayload = null;

  if (body.batch && Array.isArray(body.batch.events)) {
    batchPayload = body.batch;
  } else if (Array.isArray(body.events)) {
    batchPayload = { events: body.events };
  } else {
    return jsonResponse(400, {
      ok: false,
      code: "NO_EVENTS",
      message: "Nenhum evento encontrado no payload."
    });
  }

  await saveBatchToS3(tenantId, batchPayload, body.ts);

  return jsonResponse(200, {
    ok: true,
    message: "Eventos de métricas recebidos e salvos.",
    tenantId,
    email: emailRaw || null
  });
}

// ===============================
// HANDLER PRINCIPAL
// ===============================
exports.handler = async (event) => {
  try {
    const parsed = parseEvent(event);
    const { method, path } = parsed;

    log("INFO", "[METRICAS] Evento recebido:", JSON.stringify(parsed));

    if (method === "OPTIONS") {
      return {
        statusCode: 204,
        headers: corsHeaders(),
        body: ""
      };
    }

    const isIngestRoute = path.endsWith("/ingest");

    // 1) INTAKE DO APP (PÚBLICO, SEM JWT)
    if (method === "POST" && isIngestRoute) {
      return handleIngestPublic(event, parsed);
    }

    // 2) ROTAS PROTEGIDAS (DASHBOARD)
    const auth = autenticarRequest(event);
    if (!auth.ok) {
      return jsonResponse(auth.httpStatus, {
        ok: false,
        code: auth.code,
        message: auth.message
      });
    }

    // 2.1 – dashboard consome métricas cruas
    if (
      method === "GET" &&
      (path.includes("/metricas/cliente") || path.includes("/metricasCliente"))
    ) {
      return handleGetMetrics(event, auth, parsed);
    }

    // 2.2 – dashboard consome insights IA
    if (
      method === "GET" &&
      (path.includes("/metricas/insights") || path.includes("/metricasInsights"))
    ) {
      return handleGetInsights(event, auth, parsed);
    }

    // 3) Qualquer outra rota
    return jsonResponse(404, {
      ok: false,
      code: "NOT_FOUND",
      message: "Rota não encontrada."
    });
  } catch (err) {
    log("ERROR", "[METRICAS] Crash no handler principal:", err);
    return jsonResponse(500, {
      ok: false,
      code: "UNEXPECTED_ERROR",
      message: "Erro interno nas métricas."
    });
  }
};
