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
const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ===============================
// VARIÁVEIS DE AMBIENTE
// ===============================
const JWT_SECRET = process.env.JWT_SECRET;

// Bucket/prefix das métricas
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const METRICS_BUCKET =
  process.env.METRICS_BUCKET ||
  process.env.BUCKET ||
  "ar-cardapio-models";

const METRICS_PREFIX =
  process.env.METRICS_PREFIX ||
  process.env.ROOT_PREFIX ||
  "informacao";

// Onde vamos salvar os insights por tenant
// Ex: informacao/<tenantId>/insights/...
const INSIGHTS_PREFIX =
  process.env.INSIGHTS_PREFIX || `${METRICS_PREFIX}`;

// Quantos insights guardar por intervalo (para não explodir o arquivo)
const INSIGHTS_MAX_PER_INTERVAL = Number(
  process.env.INSIGHTS_MAX_PER_INTERVAL || "10"
);

// CORS
const CORS_ORIGINS = process.env.CORS_ORIGINS || "*";
const CORS_HEADERS = process.env.CORS_HEADERS || "Content-Type,Authorization";
const CORS_METHODS = process.env.CORS_METHODS || "GET,POST,OPTIONS";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const s3 = new S3Client({ region: AWS_REGION });

// Fuso horário de agregação (em minutos). Padrão: Brasil UTC-3 = -180
const DAY_MS = 24 * 60 * 60 * 1000;
const TZ_OFFSET_MINUTES = Number(process.env.METRICS_TZ_OFFSET_MINUTES ?? "-180");
const TZ_OFFSET_MS = TZ_OFFSET_MINUTES * 60 * 1000;

// ===============================
// TIMEZONE HELPERS
// ===============================
function pad2(n) {
  return String(n).padStart(2, "0");
}

function tzOffsetToIso(minutes) {
  // minutes: -180 => "-03:00"
  const sign = minutes <= 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = pad2(Math.floor(abs / 60));
  const mm = pad2(abs % 60);
  return `${sign}${hh}:${mm}`;
}

const TZ_ISO = tzOffsetToIso(TZ_OFFSET_MINUTES);

// ✅ Interpreta timestamps sem timezone como "horário local" do seu offset (Brasil -03)
// e converte para UTC real.
function parseTimestampSmart(ts) {
  if (!ts) return null;
  const s = String(ts).trim();

  // Se tem timezone (Z ou +hh:mm/-hh:mm), pode confiar no Date()
  const hasTz = /[zZ]$|[+\-]\d{2}:\d{2}$/.test(s);
  if (hasTz) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // yyyy-mm-ddTHH:MM(:SS(.ms)?)?  (sem timezone)
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
  );
  if (m) {
    const Y = Number(m[1]);
    const Mo = Number(m[2]) - 1;
    const D = Number(m[3]);
    const H = Number(m[4] || "00");
    const Mi = Number(m[5] || "00");
    const Se = Number(m[6] || "00");
    const Ms = Number(String(m[7] || "0").padEnd(3, "0"));

    // "local virtual" em UTC
    const localVirtualUtcMs = Date.UTC(Y, Mo, D, H, Mi, Se, Ms);

    // converte local -> UTC real
    const utcMs = localVirtualUtcMs - TZ_OFFSET_MS;

    const d = new Date(utcMs);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

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

function corsHeaders(extra = {}, event) {
  const origin = event?.headers?.origin || event?.headers?.Origin || "";

  const allowList = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  // Se não configurou allowlist, libera geral ("*")
  // Se configurou, responde com a origin real (se estiver na lista) ou cai na primeira da lista.
  const allowOrigin =
    allowList.length === 0
      ? "*"
      : (allowList.includes(origin) ? origin : allowList[0]);

  const headers = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    Vary: "Origin",
    ...extra
  };

  // Credentials só pode quando NÃO é "*"
  if (allowOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

function jsonResponse(event, statusCode, bodyObj, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(extraHeaders, event)
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

  let query = event.queryStringParameters || null;

  if ((!query || Object.keys(query).length === 0) && event.rawQueryString) {
    query = {};
    const pairs = event.rawQueryString.split("&");
    for (const p of pairs) {
      const [k, v] = p.split("=");
      if (!k) continue;
      query[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }

  if (!query) query = {};

  return { method, path, query };
}

// ===============================
// AUTENTICAÇÃO JWT (DASHBOARD)
// ===============================
function autenticarRequest(event) {
  const headers = event.headers || {};
  const authHeader = headers.Authorization || headers.authorization || "";

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    log("WARN", "[METRICAS] Auth 401: TOKEN_MISSING - Token JWT ausente ou mal formatado.");
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
    devices: [],
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
      likeTotal: 0,
      dislikeTotal: 0
    },
    recurrenceData: [],
    topModels: [],
    modelErrors: [],
    meta: {},
    insights: []
  };
}

// ===============================
// HELPERS DE DATA
// ===============================

function getNowLocalParts() {
  const nowLocalMs = Date.now() + TZ_OFFSET_MS;
  const dLocal = new Date(nowLocalMs); // usa UTC fields como "local virtual"
  return {
    nowLocalMs,
    dLocal,
    ymdLocal: formatYMD(dLocal),
    hour: dLocal.getUTCHours(),
    minute: dLocal.getUTCMinutes(),
    second: dLocal.getUTCSeconds()
  };
}

function parseDateParam(value) {
  if (!value) return null;

  const v = String(value).trim();

  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // dd/mm/aaaa
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
    const [d, m, y] = v.split("/").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }

  // String completa de Date do JS
  const djs = new Date(v);
  if (!isNaN(djs.getTime())) {
    return new Date(Date.UTC(djs.getFullYear(), djs.getMonth(), djs.getDate()));
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
  let utc = parseTimestampSmart(tsFromBody);
  if (!utc) utc = new Date();

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
  // ✅ pega um timestamp confiável do próprio lote/eventos
  const firstEv = Array.isArray(payload?.events) ? payload.events[0] : null;
  const tsForKey =
    tsFromBody ||
    payload?.meta?.timestamp ||
    firstEv?.timestamp ||
    firstEv?.ts ||
    new Date().toISOString();

  const lineObj = {
    tId: tenantId,
    ts: new Date().toISOString(),
    batch: payload
  };

  const bodyStr = JSON.stringify(lineObj) + "\n";
  const Key = buildMetricsKey(tenantId, tsForKey);

  await s3.send(
    new PutObjectCommand({
      Bucket: METRICS_BUCKET,
      Key,
      Body: bodyStr,
      ContentType: "application/json"
    })
  );

  const eventsCount = Array.isArray(payload.events) ? payload.events.length : 0;

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
// HELPERS – BANCO DE INSIGHTS NO S3
// ===============================
function normalizeIntervalId(startLabel, endLabel, hourLabel) {
  const raw = `${startLabel || "inicio"}_${endLabel || "fim"}_${hourLabel || "all"}`;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildInsightsKey(tenantId, startLabel, endLabel, hourLabel) {
  const baseDate =
    (startLabel && /^\d{4}-\d{2}-\d{2}$/.test(startLabel) && startLabel) ||
    (endLabel && /^\d{4}-\d{2}-\d{2}$/.test(endLabel) && endLabel) ||
    null;

  let yyyy = "0000";
  let mm = "00";
  let dd = "00";

  if (baseDate) {
    [yyyy, mm, dd] = baseDate.split("-");
  }

  const intervalId = normalizeIntervalId(startLabel, endLabel, hourLabel);

  return `${INSIGHTS_PREFIX}/${tenantId}/insights/yyyy=${yyyy}/mm=${mm}/dd=${dd}/interval-${intervalId}.json`;
}

async function loadInsightsFromS3(tenantId, startLabel, endLabel, hourLabel) {
  const Key = buildInsightsKey(tenantId, startLabel, endLabel, hourLabel);

  try {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: METRICS_BUCKET,
        Key
      })
    );
    const text = await streamToString(obj.Body);
    const parsed = text ? JSON.parse(text) : [];
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    if (
      err.name === "NoSuchKey" ||
      err.Code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return [];
    }
    log("WARN", "[METRICAS] Erro ao carregar insights do S3:", err.message);
    return [];
  }
}

// Agrupa timestamp por HORA (ex: 2025-12-10T16)
function hourBucket(ts) {
  if (!ts) return null;

  const s = String(ts);
  if (s.length >= 13) {
    return s.slice(0, 13);
  }

  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

// ✅ Timestamp do insight com offset (ex: -03:00) pra UI mostrar a hora certa
function buildInsightTimestampForInterval(startLabel, endLabel, hourLabel) {
  const fallback = new Date().toISOString();

  const baseYmd =
    (startLabel && /^\d{4}-\d{2}-\d{2}$/.test(startLabel) && startLabel) ||
    (endLabel && /^\d{4}-\d{2}-\d{2}$/.test(endLabel) && endLabel) ||
    null;

  if (!baseYmd) return fallback;

  let h = 0;
  let m = 0;

  if (hourLabel) {
    const s = String(hourLabel).trim();

    let m1 = s.match(/^(\d{1,2})$/);
    let m2 = s.match(/^(\d{1,2}):(\d{2})/);
    let m3 = s.match(/T(\d{2})(?::(\d{2}))?/);

    if (m1) {
      h = Number(m1[1]);
    } else if (m2) {
      h = Number(m2[1]);
      m = Number(m2[2]);
    } else if (m3) {
      h = Number(m3[1]);
      if (m3[2]) m = Number(m3[2]);
    }
  }

  const [y, mo, d] = baseYmd.split("-").map(Number);
  const isoLocalWithOffset = `${y}-${pad2(mo)}-${pad2(d)}T${pad2(h)}:${pad2(m)}:00${TZ_ISO}`;
  return isoLocalWithOffset;
}

// Adiciona um insight novo no arquivo do S3 (append controlado por HORA)
async function appendInsightToS3(
  tenantId,
  startLabel,
  endLabel,
  hourLabel,
  insightRecord
) {
  const Key = buildInsightsKey(tenantId, startLabel, endLabel, hourLabel);

  let current = [];
  try {
    current = await loadInsightsFromS3(tenantId, startLabel, endLabel, hourLabel);
  } catch {
    current = [];
  }

  const newBucket = hourBucket(insightRecord.timestamp);

  // SE JÁ EXISTIR INSIGHT NESSA MESMA HORA, NÃO SOBRESCREVE
  if (newBucket) {
    const exists = current.find((rec) => hourBucket(rec.timestamp) === newBucket);
    if (exists) {
      log("INFO", "[METRICAS] Já existe insight para esse intervalo/hora, não sobrescrevendo.");
      return current;
    }
  }

  current.push(insightRecord);

  current.sort((a, b) => {
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return tb.localeCompare(ta); // desc
  });

  if (current.length > INSIGHTS_MAX_PER_INTERVAL) {
    current = current.slice(0, INSIGHTS_MAX_PER_INTERVAL);
  }

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: METRICS_BUCKET,
        Key,
        Body: JSON.stringify(current, null, 2),
        ContentType: "application/json"
      })
    );

    log("INFO", "[METRICAS] Insights salvos no S3:", `${METRICS_BUCKET}/${Key}`, "qtd:", current.length);
  } catch (err) {
    log("WARN", "[METRICAS] Erro ao salvar insights no S3:", err.message);
  }

  return current;
}

// ===============================
// NOVA LÓGICA: ROLLUP CUMULATIVO POR HORA (TOP 10)
// ===============================
const INSIGHTS_ROLLUP_LABEL = "rollup";

function buildMetricsDayPrefix(tenantId, ymd) {
  const [yyyy, mm, dd] = String(ymd).split("-");
  return `${METRICS_PREFIX}/${tenantId}/metrics/yyyy=${yyyy}/mm=${mm}/dd=${dd}/`;
}

function localMsFromYmdHm(ymd, hh, mm = 0, ss = 0) {
  // "local virtual" (coerente com toLocalDate)
  const [y, mo, d] = String(ymd).split("-").map(Number);
  return Date.UTC(y, mo - 1, d, Number(hh) || 0, Number(mm) || 0, Number(ss) || 0);
}

async function listHoursWithDataForDay(tenantId, ymd) {
  const dayPrefix = buildMetricsDayPrefix(tenantId, ymd);
  const keys = await listAllObjects(METRICS_BUCKET, dayPrefix);

  const hours = new Set();
  for (const k of keys) {
    const m = k.match(/\/hh=(\d{2})\//);
    if (m && m[1]) hours.add(m[1]);
  }
  return Array.from(hours).sort(); // asc
}

function computeBoundaryHoursFromDataHours(hoursWithData) {
  // data em "22" -> precisa do insight "23" (cobre até 22:59)
  const out = new Set();
  for (const hStr of hoursWithData) {
    const h = Number(hStr);
    if (!Number.isFinite(h)) continue;
    const b = h + 1;
    if (b >= 1 && b <= 23) out.add(pad2(b));
    // h=23 => b=24 (viraria dia seguinte). Se quiser, dá pra implementar depois.
  }
  return Array.from(out).sort(); // asc
}

// ===============================
// INSIGHTS REGRAS (SEM IA)
// ===============================
function buildInsightsFromAggregated(agg, { startDate, endDate } = {}) {
  const insights = [];
  const nowIso = new Date().toISOString();

  const kpis = agg.kpis || {};
  const picos = Array.isArray(agg.picos) ? agg.picos : [];
  const topItems = Array.isArray(agg.topItems) ? agg.topItems : [];
  const timeByCategory = Array.isArray(agg.timeByCategory) ? agg.timeByCategory : [];
  const devices = Array.isArray(agg.devices) ? agg.devices : [];

  let periodLabel = "";
  if (startDate && endDate) {
    const same = startDate.getTime() === endDate.getTime();
    if (same) periodLabel = `no dia ${formatYMD(startDate)}`;
    else periodLabel = `no período de ${formatYMD(startDate)} a ${formatYMD(endDate)}`;
  }

  const scans = kpis.scansTotal || 0;
  const sessoes = kpis.sessoesTotal || 0;
  const unicos = kpis.unicosTotal || 0;
  const infoTotal = kpis.infoTotal || kpis.infoClicks || 0;

  if (scans > 0 && infoTotal > 0) {
    const rate = (infoTotal / scans) * 100;
    insights.push({
      timestamp: nowIso,
      title: `Botão Info usado em ${rate.toFixed(1)}% dos scans`,
      detail: `Foram ${infoTotal} cliques no botão Info em ${scans} scans ${periodLabel}. Isso mostra que os clientes estão buscando detalhes dos itens.`
    });
  }

  if (sessoes > 0 && unicos > 0) {
    const media = sessoes / unicos;
    insights.push({
      timestamp: nowIso,
      title: `Clientes voltando ao cardápio`,
      detail: `Você teve ${unicos} clientes únicos em ${sessoes} sessões ${periodLabel}, média de ${media.toFixed(1)} sessões por cliente.`
    });
  }

  if (picos.length) {
    const best = [...picos].reduce((a, b) => (b.scans || 0) > (a.scans || 0) ? b : a);
    if (best && best.scans > 0) {
      const hourStr = String(best.hora).padStart(2, "0");
      insights.push({
        timestamp: nowIso,
        title: `Horário de pico às ${hourStr}h`,
        detail: `O maior volume de scans foi às ${hourStr}h, com ${best.scans} scans ${periodLabel}. Esse é um bom horário para destacar promoções.`
      });
    }
  }

  if (topItems.length) {
    const topByTime = [...topItems].sort((a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0))[0];
    if (topByTime && topByTime.avgTimeSec > 0) {
      insights.push({
        timestamp: nowIso,
        title: `Item mais observado: ${topByTime.item}`,
        detail: `"${topByTime.item}" tem o maior tempo médio de visualização (${Math.round(topByTime.avgTimeSec)}s) ${periodLabel}. Considere usar esse item em destaque ou combos.`
      });
    }

    const voted = topItems
      .filter((i) => (i.likes || 0) + (i.dislikes || 0) > 0)
      .map((i) => {
        const likes = i.likes || 0;
        const dislikes = i.dislikes || 0;
        const total = likes + dislikes;
        const score = total > 0 ? ((likes - dislikes) / total) * 100 : 0;
        return { ...i, score, total };
      });

    if (voted.length) {
      voted.sort((a, b) => b.score - a.score);
      const bestVote = voted[0];
      const likeRate =
        bestVote.total > 0 ? ((bestVote.likes || 0) / bestVote.total) * 100 : 0;

      insights.push({
        timestamp: nowIso,
        title: `Item melhor avaliado: ${bestVote.item}`,
        detail: `"${bestVote.item}" recebeu ${bestVote.total} avaliações, com ${likeRate.toFixed(1)}% positivas.`
      });
    }
  }

  if (timeByCategory.length) {
    const bestCat = [...timeByCategory].sort((a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0))[0];
    if (bestCat && bestCat.avgTimeSec > 0) {
      insights.push({
        timestamp: nowIso,
        title: `Categoria mais explorada: ${bestCat.category}`,
        detail: `A categoria "${bestCat.category}" tem o maior tempo médio por sessão (${Math.round(bestCat.avgTimeSec)}s).`
      });
    }
  }

  if (devices.length) {
    const topDev = [...devices].sort((a, b) => (b.sessions || 0) - (a.sessions || 0))[0];
    if (topDev && topDev.sessions > 0) {
      insights.push({
        timestamp: nowIso,
        title: `Dispositivo dominante: ${topDev.label}`,
        detail: `${topDev.sessions} sessões foram feitas em ${topDev.label}. Priorize a experiência desse dispositivo.`
      });
    }
  }

  return insights.slice(0, 10);
}

// ===============================
// HELPER – NORMALIZAR TEXTO DE INSIGHT PARA TOOLTIP
// ===============================
function normalizeInsightDetail(raw) {
  if (!raw) return "";

  let text = String(raw).trim();

  if (text.startsWith("```")) {
    const fenceMatch = text.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      text = fenceMatch[1].trim();
    }
  }

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      const slice = text.slice(first, last + 1);
      try {
        parsed = JSON.parse(slice);
      } catch {
        parsed = null;
      }
    }
  }

  if (parsed && typeof parsed === "object") {
    const parts = [];
    if (parsed.title) parts.push(String(parsed.title));
    if (parsed.summary) parts.push(String(parsed.summary));
    if (parsed.suggestion) parts.push(String(parsed.suggestion));
    text = parts.join(" ");
  }

  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/[ \t]+/g, " ");
  text = text.trim();
  text = text.replace(/([.!?])\s+/g, "$1\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}

// ===============================
// AGREGAÇÃO DAS MÉTRICAS (GET)
// ✅ atualizado: aceita opts (prefixOverride/startLocalMs/endLocalMs)
// ===============================
async function aggregateMetrics(tenantId, startDate, endDate, opts = {}) {
  let allKeys = [];
  if (opts.prefixOverride) {
    allKeys = await listAllObjects(METRICS_BUCKET, opts.prefixOverride);
  } else {
    // lista só o range de dias
    let cur = new Date(startDate.getTime());
    const end = new Date(endDate.getTime());
    while (cur <= end) {
      const ymd = formatYMD(cur);
      const dayPrefix = buildMetricsDayPrefix(tenantId, ymd);
      const keysDay = await listAllObjects(METRICS_BUCKET, dayPrefix);
      allKeys.push(...keysDay);
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const debugPrefix = opts.prefixOverride || `${METRICS_PREFIX}/${tenantId}/metrics/`;
  log("INFO", "[METRICAS] aggregateMetrics prefix:", `${METRICS_BUCKET}/${debugPrefix}`);
  log("INFO", "[METRICAS] total de arquivos de métricas:", allKeys.length);

  const { result, indexByDay } = buildRangeSkeleton(startDate, endDate);

  if (!Array.isArray(result.daily.likes)) result.daily.likes = result.rangeLabels.map(() => 0);
  if (!Array.isArray(result.daily.dislikes)) result.daily.dislikes = result.rangeLabels.map(() => 0);
  if (typeof result.kpis.likeTotal !== "number") result.kpis.likeTotal = 0;
  if (typeof result.kpis.dislikeTotal !== "number") result.kpis.dislikeTotal = 0;

  const startLocalMs =
    (typeof opts.startLocalMs === "number") ? opts.startLocalMs : startDate.getTime();

  const endLocalMs =
    (typeof opts.endLocalMs === "number") ? opts.endLocalMs : (endDate.getTime() + DAY_MS - 1);

  const sessionSetGlobal = new Set();
  const clientSetGlobal = new Set();

  const sessionByDay = new Map();
  const clientByDay = new Map();

  const sessionToClient = new Map();

  const voteByItemUser = new Map();

  const mesaStats = new Map();
  const mesaEngagement = new Map();
  const deviceBySession = new Map();

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

    const currentLastMs = current.ultimoScan ? new Date(current.ultimoScan).getTime() : 0;
    if (!current.ultimoScan || eventTimeMsUtc > currentLastMs) {
      current.ultimoScan = new Date(eventTimeMsUtc).toISOString();
    }
    mesaStats.set(label, current);

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

    const eng = ensureMesaEngagement(label);
    eng.totalTimeSec += durationMs / 1000;
  }

  function registerInteractionMesa(ev) {
    const label = resolveMesaLabel(ev);
    const eng = ensureMesaEngagement(label);
    eng.totalInteractions += 1;
    if (ev.sessionId) eng.sessionsSet.add(ev.sessionId);
  }

  const tempoMenuByDay = new Map();
  const picosMap = new Map();
  const itemStats = new Map();
  const itemInfoClicks = new Map();

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

  function resolveItemLabel(ev) {
    const p = ev.payload || {};
    let label = "";

    if (p.itemId && typeof p.itemId !== "object") {
      label = String(p.itemId).trim();
    }

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

    if (!label && p.itemName) label = String(p.itemName).trim();
    if (!label && p.name) label = String(p.name).trim();
    if (!label && p.label) label = String(p.label).trim();
    if (!label && p.title) label = String(p.title).trim();
    if (!label && p.modelName) label = String(p.modelName).trim();

    if (!label && ev.item && typeof ev.item !== "object") {
      label = String(ev.item).trim();
    }

    label = String(label || "").trim();
    if (!label || label === "[object Object]") return "item-desconhecido";
    return label;
  }

  function classifyDevice(ua) {
    const devClass = String(ua.deviceClass || ua.device_type || ua.device || "").toLowerCase();
    const uaStr = String(ua.userAgent || ua.ua || "").toLowerCase();

    if (devClass === "mobile" || devClass === "tablet") {
      if (uaStr.includes("android")) return "Android";
      if (uaStr.includes("iphone") || uaStr.includes("ipod")) return "iPhone";
      if (uaStr.includes("ipad")) return "iPad";
    }

    if (devClass === "desktop" || devClass === "pc") return "Desktop";

    if (uaStr.includes("android")) return "Android";
    if (uaStr.includes("iphone") || uaStr.includes("ipod")) return "iPhone";
    if (uaStr.includes("ipad")) return "iPad";
    if (uaStr.includes("windows") || uaStr.includes("macintosh") || uaStr.includes("linux")) {
      return "Desktop";
    }

    return "Outros";
  }

  let totalInfoTimeMs = 0;
  let infoReadEvents = 0;

  let totalItemTimeMs = 0;
  let itemViewEvents = 0;

  const categoryTimeMs = new Map();
  const categoryViewCount = new Map();

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

  for (const key of allKeys) {
    filesCount++;

    let obj;
    try {
      obj = await s3.send(new GetObjectCommand({ Bucket: METRICS_BUCKET, Key: key }));
    } catch (err) {
      log("WARN", "[METRICAS] Erro ao fazer GetObject em", key, "-", err.message);
      continue;
    }

    let text;
    try {
      text = await streamToString(obj.Body);
    } catch (err) {
      log("WARN", "[METRICAS] Erro ao ler stream de", key, "-", err.message);
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

        let tsStr =
          ev.timestamp ||
          ev.ts ||
          (batch.meta && batch.meta.timestamp) ||
          rec.ts ||
          null;

        if (!tsStr) continue;

        const dUtc = parseTimestampSmart(tsStr);
        if (!dUtc || isNaN(dUtc.getTime())) continue;

        const tMsUtc = dUtc.getTime();
        const dLocal = toLocalDate(dUtc);
        const tMsLocal = dLocal.getTime();

        if (tMsLocal < startLocalMs || tMsLocal > endLocalMs) continue;

        const dayYmd = formatYMD(dLocal);
        const idx = indexByDay.get(dayYmd);
        if (idx === undefined) continue;

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

          registerScanMesa(ev, tMsUtc);

          const hour = dLocal.getUTCHours();
          addPico(dayYmd, hour);
        }

        if (name === "info_click") {
          result.kpis.infoClicks++;
          result.kpis.infoTotal++;
          result.daily.info[idx] = (result.daily.info[idx] || 0) + 1;

          const itemLabel = resolveItemLabel(ev);
          const prev = itemInfoClicks.get(itemLabel) || 0;
          itemInfoClicks.set(itemLabel, prev + 1);
        }

        if (name === "info_read" && ev.payload) {
          const dur = ev.payload.durationMs || ev.payload.duration || 0;
          if (typeof dur === "number" && dur > 0) {
            totalInfoTimeMs += dur;
            infoReadEvents++;
          }
        }

        if ((name === "item_view" || name === "menu_item_view") && ev.payload) {
          const dur = ev.payload.durationMs || ev.payload.duration || 0;
          if (typeof dur === "number" && dur > 0) {
            totalItemTimeMs += dur;
            itemViewEvents++;

            registerTimeMesa(ev, dur);

            const cat = ev.payload.category || ev.payload.cat || null;
            if (cat) {
              const prevT = categoryTimeMs.get(cat) || 0;
              const prevC = categoryViewCount.get(cat) || 0;
              categoryTimeMs.set(cat, prevT + dur);
              categoryViewCount.set(cat, prevC + 1);
            }

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

        let isLikeEvent = false;
        let isDislikeEvent = false;

        const likeValueRaw =
          (ev.payload && (ev.payload.likeValue || ev.payload.value)) || "";
        const likeValue = String(likeValueRaw).toLowerCase();

        if (nameLc === "like" || nameLc === "like_click" || nameLc === "item_like") {
          if (likeValue === "negativo" || likeValue === "dislike" || likeValue === "down") {
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
          isLikeEvent = true;
        }

        if (isLikeEvent || isDislikeEvent) {
          if (isLikeEvent) {
            result.daily.likes[idx] = (result.daily.likes[idx] || 0) + 1;
          } else {
            result.daily.dislikes[idx] = (result.daily.dislikes[idx] || 0) + 1;
          }

          const itemLabel = resolveItemLabel(ev);

          let clientId =
            (ev.payload && ev.payload.clientId) ||
            ev.clientId ||
            (ev.sessionId && sessionToClient.get(ev.sessionId)) ||
            null;

          if (!clientId && ev.sessionId) {
            clientId = ev.sessionId;
          }

          if (clientId) {
            const keyVote = `${itemLabel}||${clientId}`;
            voteByItemUser.set(keyVote, isLikeEvent ? "like" : "dislike");
          }
        }

        if (name === "visitor_status" && ev.payload) {
          const clientId = ev.payload.clientId;
          if (clientId) {
            clientSetGlobal.add(clientId);

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

        if ((name === "page_hidden" || name === "page_unload") && ev.payload) {
          const rawDur =
            ev.payload.visibleMs ||
            ev.payload.visible_ms ||
            ev.payload.durationMs ||
            ev.payload.duration ||
            0;
          const durMs = Number(rawDur) || 0;
          if (durMs > 0) addMenuDuration(dayYmd, durMs);

          if (ev.sessionId) {
            const ds = deviceBySession.get(ev.sessionId);
            if (ds) ds.totalVisibleMs += durMs;
          }
        }

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

  result.porMesa = Array.from(mesaStats.values())
    .map((m) => {
      const avgTimeSec = m.countTime > 0 ? Math.round(m.totalTimeMs / m.countTime / 1000) : 0;

      const eng = mesaEngagement.get(m.mesa);
      const sessions = eng && eng.sessionsSet ? eng.sessionsSet.size : 0;
      const interactionsPerSession =
        eng && sessions > 0 ? Number((eng.totalInteractions / sessions).toFixed(2)) : 0;

      return {
        mesa: m.mesa,
        scans: m.scans,
        ultimoScan: m.ultimoScan,
        avgTimeSec,
        sessions,
        totalInteractions: eng ? eng.totalInteractions : 0,
        interactionsPerSession
      };
    })
    .sort((a, b) => b.scans - a.scans);

  const engagementPorMesa = Array.from(mesaEngagement.values())
    .map((rec) => {
      const sessions = rec.sessionsSet ? rec.sessionsSet.size : 0;
      const avgTimeSec = sessions > 0 ? Math.round(rec.totalTimeSec / sessions) : 0;
      const interactionsPerSession =
        sessions > 0 ? Number((rec.totalInteractions / sessions).toFixed(2)) : 0;

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
      avgTimeSec: d.sessions > 0 ? Math.round(d.totalTimeMs / d.sessions / 1000) : 0
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const clientDaysCount = new Map();

  for (const [ymd, idx] of indexByDay.entries()) {
    const sessionsDay = sessionByDay.get(ymd);
    const clientsDay = clientByDay.get(ymd);

    if (sessionsDay) result.daily.sessoes[idx] = sessionsDay.size;

    if (clientsDay) {
      result.daily.unicos[idx] = clientsDay.size;

      for (const clientId of clientsDay) {
        const prev = clientDaysCount.get(clientId) || 0;
        clientDaysCount.set(clientId, prev + 1);
      }
    }
  }

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

  result.picos = Array.from(picosMap.values())
    .sort((a, b) => {
      if (a.ymd === b.ymd) return b.hour - a.hour;
      return a.ymd < b.ymd ? 1 : -1;
    })
    .map((p) => {
      const idx = indexByDay.get(p.ymd);
      const dateLabel = idx !== undefined ? result.rangeLabels[idx] : p.ymd;
      const hourLabel = `${String(p.hour).padStart(2, "0")}:00`;

      return {
        data: p.ymd,
        dateYmd: p.ymd,
        dateLabel,
        hora: p.hour,
        hourLabel,
        scans: p.scans
      };
    });

  result.kpis.sessoesTotal = sessionSetGlobal.size;
  result.kpis.unicosTotal = clientSetGlobal.size;

  if (infoReadEvents > 0) {
    const avgSeconds = Math.round(totalInfoTimeMs / infoReadEvents / 1000);
    result.kpis.infoAvgTime = avgSeconds;
    result.kpis.infoAvgTimeInfoBox = avgSeconds;
  }

  if (itemViewEvents > 0) {
    result.kpis.avgTimePerItem = Math.round(totalItemTimeMs / itemViewEvents / 1000);
  }

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

  const itemVotes = new Map();

  for (const [key, vote] of voteByItemUser.entries()) {
    const [itemName] = key.split("||", 2);
    const agg = itemVotes.get(itemName) || { likes: 0, dislikes: 0 };

    if (vote === "like") agg.likes++;
    else if (vote === "dislike") agg.dislikes++;

    itemVotes.set(itemName, agg);
  }

  let likeTotal = 0;
  let dislikeTotal = 0;
  for (const v of itemVotes.values()) {
    likeTotal += v.likes;
    dislikeTotal += v.dislikes;
  }

  if (likeTotal === 0 && Array.isArray(result.daily.likes)) {
    likeTotal = result.daily.likes.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }
  if (dislikeTotal === 0 && Array.isArray(result.daily.dislikes)) {
    dislikeTotal = result.daily.dislikes.reduce((acc, v) => acc + (Number(v) || 0), 0);
  }

  result.kpis.likeTotal = likeTotal;
  result.kpis.dislikeTotal = dislikeTotal;

  const totalCatTimeMs = Array.from(categoryTimeMs.values()).reduce((sum, v) => sum + v, 0);

  result.timeByCategory = Array.from(categoryTimeMs.entries())
    .map(([cat, timeMs]) => {
      const views = categoryViewCount.get(cat) || 0;

      const avgTimeSec = views > 0 ? Math.round(timeMs / views / 1000) : 0;

      const pctTime = totalCatTimeMs > 0 ? (timeMs / totalCatTimeMs) * 100 : 0;

      return {
        category: cat,
        avgTimeSec,
        sessions: views,
        pctTime
      };
    })
    .sort((a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0));

  const topItemsArr = [];
  const seenItems = new Set();

  for (const it of itemStats.values()) {
    const votes = itemVotes.get(it.item) || { likes: 0, dislikes: 0 };
    const infoClicks = itemInfoClicks.get(it.item) || 0;

    topItemsArr.push({
      item: it.item,
      avgTimeSec: it.views > 0 ? Math.round(it.totalTimeMs / it.views / 1000) : 0,
      views: it.views,
      likes: votes.likes,
      dislikes: votes.dislikes,
      category: null,
      clicksInfo: infoClicks
    });
    seenItems.add(it.item);
  }

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

  for (const [itemName, infoClicks] of itemInfoClicks.entries()) {
    if (seenItems.has(itemName)) continue;

    topItemsArr.push({
      item: itemName,
      avgTimeSec: 0,
      views: 0,
      likes: 0,
      dislikes: 0,
      category: null,
      clicksInfo
    });
    seenItems.add(itemName);
  }

  result.topItems = topItemsArr.sort((a, b) => b.avgTimeSec - a.avgTimeSec);

  let newClients = 0;
  let recurringClients = 0;

  for (const [, daysCount] of clientDaysCount.entries()) {
    if (daysCount <= 1) newClients++;
    else recurringClients++;
  }

  result.kpis.activeClients = clientSetGlobal.size;
  result.kpis.newClients = newClients;
  result.kpis.recurringClients = recurringClients;

  if (result.kpis.activeClients > 0) {
    result.kpis.returnRate = Math.round((recurringClients / result.kpis.activeClients) * 100);
  }

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
// HISTÓRICO DE SCANS (ÚLTIMOS 30 DIAS)
// ===============================
async function aggregateScansHistory30d(tenantId, referenceDate) {
  const refUtc = new Date(Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate()
  ));

  const startUtc = new Date(refUtc.getTime() - 29 * DAY_MS);

  const { result, indexByDay } = buildRangeSkeleton(startUtc, refUtc);

  const prefix = `${METRICS_PREFIX}/${tenantId}/metrics/`;
  const allKeys = await listAllObjects(METRICS_BUCKET, prefix);
  const startMs = startUtc.getTime();
  const endMs = refUtc.getTime() + DAY_MS - 1;

  const sessionByDay = new Map();
  const clientByDay = new Map();

  for (const key of allKeys) {
    let obj;
    try {
      obj = await s3.send(new GetObjectCommand({ Bucket: METRICS_BUCKET, Key: key }));
    } catch (err) {
      log("WARN", "[METRICAS][30d] GetObject erro", key, "-", err.message);
      continue;
    }

    let text;
    try {
      text = await streamToString(obj.Body);
    } catch (err) {
      log("WARN", "[METRICAS][30d] stream erro", key, "-", err.message);
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

      for (const ev of events) {
        const name = ev.name || ev.type || "unknown";

        let tsStr =
          ev.timestamp ||
          ev.ts ||
          (batch.meta && batch.meta.timestamp) ||
          rec.ts ||
          null;
        if (!tsStr) continue;

        const dUtc = parseTimestampSmart(tsStr);
        if (!dUtc || isNaN(dUtc.getTime())) continue;

        const dLocal = toLocalDate(dUtc);
        const tMsLocal = dLocal.getTime();
        if (tMsLocal < startMs || tMsLocal > endMs) continue;

        const dayYmd = formatYMD(dLocal);
        const idx = indexByDay.get(dayYmd);
        if (idx === undefined) continue;

        if (name === "page_open") {
          result.daily.scans[idx] = (result.daily.scans[idx] || 0) + 1;

          const sessionId = ev.sessionId;
          if (sessionId) {
            let setDia = sessionByDay.get(dayYmd);
            if (!setDia) {
              setDia = new Set();
              sessionByDay.set(dayYmd, setDia);
            }
            setDia.add(sessionId);
          }
        }

        if (name === "visitor_status" && ev.payload && ev.payload.clientId) {
          const clientId = ev.payload.clientId;
          let setDia = clientByDay.get(dayYmd);
          if (!setDia) {
            setDia = new Set();
            clientByDay.set(dayYmd, setDia);
          }
          setDia.add(clientId);
        }
      }
    }
  }

  for (const [ymd, idx] of indexByDay.entries()) {
    const sess = sessionByDay.get(ymd);
    const cli = clientByDay.get(ymd);

    if (sess) result.daily.sessoes[idx] = sess.size;
    if (cli) result.daily.unicos[idx] = cli.size;
  }

  return {
    labels: result.rangeLabels,
    scans: result.daily.scans,
    sessoes: result.daily.sessoes,
    unicos: result.daily.unicos
  };
}

// ===============================
// OPENAI – GERAÇÃO DE INSIGHTS
// ===============================
async function generateInsightsWithOpenAI(metrics, opts = {}) {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY não configurada na Lambda.");
  }

  const { startLabel, endLabel, hourLabel } = opts;

  const kpis = metrics.kpis || {};
  const daily = metrics.daily || {};
  const rangeLabels = metrics.rangeLabels || [];

  const payload = {
    periodo: {
      inicio: startLabel || null,
      fim: endLabel || null,
      horaReferencia: hourLabel || null
    },
    resumo: { ...kpis },
    escaneamentoTotal: {
      scansTotal: kpis.scansTotal ?? 0,
      sessoesTotal: kpis.sessoesTotal ?? 0,
      unicosTotal: kpis.unicosTotal ?? 0
    },
    escaneamentoPorMesa: metrics.porMesa || [],
    engajamentoPorMesa: metrics.engagementByMesa || { porMesa: [] },
    sessoesPorPeriodo: {
      labels: rangeLabels,
      sessoes: daily.sessoes || [],
      unicos: daily.unicos || []
    },
    tempoMedioCardapio: metrics.tempoMenu || [],
    horariosDePico: metrics.picos || [],
    likes: {
      totalLikes: kpis.likeTotal ?? 0,
      totalDislikes: kpis.dislikeTotal ?? 0,
      dailyLikes: daily.likes || [],
      dailyDislikes: daily.dislikes || [],
      labels: rangeLabels
    },
    tempoPorCategoria: metrics.timeByCategory || [],
    botaoInfo: {
      totalClicks: (kpis.infoTotal ?? kpis.infoClicks) ?? 0,
      infoClicks: kpis.infoClicks ?? 0,
      avgTimeSec: kpis.infoAvgTime ?? kpis.infoAvgTimeInfoBox ?? 0,
      dailyInfoClicks: daily.info || [],
      labels: rangeLabels
    },
    tempoPorItem: (metrics.topItems || []).slice(0, 30).map(i => ({
      item: i.item,
      avgTimeSec: i.avgTimeSec ?? 0,
      views: i.views ?? 0,
      likes: i.likes ?? 0,
      dislikes: i.dislikes ?? 0,
      categoria: i.category ?? null,
      clicksInfo: i.clicksInfo ?? 0
    })),
    dispositivos: metrics.devices || [],
    modelosMaisExibidos: (metrics.topModels || []).slice(0, 30),
    meta: {
      labels: rangeLabels,
      filesCount: metrics.meta?.filesCount ?? null,
      eventsCount: metrics.meta?.eventsCount ?? null
    }
  };

  const systemPrompt =
    "Você é um analista de dados para restaurantes que usam o ARCardápio. " +
    "Você recebe um JSON com TODOS os blocos do dashboard. " +
    "Sem rodeios, foque em coisas práticas para o dono do restaurante. " +
    "Responda SEMPRE em JSON EXATO no formato: " +
    "{\"title\": string, \"summary\": string, \"status\": \"bom\" | \"neutro\" | \"ruim\", \"suggestion\": string}. " +
    "Nada de markdown, nada de ```json, nada de texto fora do JSON. " +
    "Use no máximo 3 parágrafos curtos em \"summary\".";

  const userPrompt =
    "Gere um ÚNICO insight consolidado usando os blocos abaixo. " +
    "Considere: movimento, engajamento, percepção (Like/Dislike) e horários de pico. " +
    "Em \"summary\" explique o que está acontecendo. " +
    "Em \"suggestion\" traga ações concretas. " +
    "Responda apenas com o JSON pedido.\n\n" +
    "DADOS DO DASHBOARD EM JSON:\n" +
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

  let content = completion.choices?.[0]?.message?.content || "";
  content = content.trim();

  if (content.startsWith("```")) {
    const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      content = fenceMatch[1].trim();
    }
  }

  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const first = content.indexOf("{");
    const last = content.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
      const slice = content.slice(first, last + 1);
      try {
        parsed = JSON.parse(slice);
      } catch {
        parsed = null;
      }
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      title: "Insights de uso do ARCardápio",
      summary: content || "Não foi possível interpretar a resposta da IA.",
      status: "neutro",
      suggestion: ""
    };
  }

  return parsed;
}

// ===============================
// ✅ ROLLUP: cria o ÚLTIMO bloco faltante (ex: 23:00) sem explodir custo
// ===============================
async function ensureRollupInsightsForDay(tenantId, ymd, { backfill = false } = {}) {
  let currentList = await loadInsightsFromS3(tenantId, ymd, ymd, INSIGHTS_ROLLUP_LABEL);
  if (!Array.isArray(currentList)) currentList = [];

  const existingBuckets = new Set(
    currentList.map(r => hourBucket(r?.timestamp)).filter(Boolean)
  );

  const hoursWithData = await listHoursWithDataForDay(tenantId, ymd);
  let boundaryHours = computeBoundaryHoursFromDataHours(hoursWithData);

  // ✅ HOJE: só pode gerar hora FECHADA (nunca futuro)
  const nowParts = getNowLocalParts();
  const todayYmdLocal = nowParts.ymdLocal;

  if (ymd === todayYmdLocal) {
    // Ex: 00:30 => hour=0 => não gera nada
    // Ex: 01:05 => hour=1 => pode gerar "01" (cobre 00:00-00:59)
    boundaryHours = boundaryHours.filter(h => Number(h) <= nowParts.hour);
  }

  // pega só o mais recente faltando (ou backfill)
  const hoursToTry = Array.from(new Set(boundaryHours))
    .sort((a, b) => Number(b) - Number(a)); // desc

  const maxToCreate = backfill ? INSIGHTS_MAX_PER_INTERVAL : 1;
  let created = 0;

  if (!hoursToTry.length) return currentList;

  const startMsDay = localMsFromYmdHm(ymd, "00", 0, 0);

  for (const bh of hoursToTry) {
    const bucketNeeded = `${ymd}T${bh}`;
    if (existingBuckets.has(bucketNeeded)) continue;

    const endMs = localMsFromYmdHm(ymd, bh, 0, 0) - 1;

    // ✅ nunca gerar bucket do futuro (hoje)
    const boundaryMs = localMsFromYmdHm(ymd, bh, 0, 0);
    if (ymd === todayYmdLocal && boundaryMs > nowParts.nowLocalMs) continue;

    const dayDate = parseDateParam(ymd) || new Date();
    const dayPrefix = buildMetricsDayPrefix(tenantId, ymd);

    const metricsWindow = await aggregateMetrics(
      tenantId,
      dayDate,
      dayDate,
      {
        prefixOverride: dayPrefix,
        startLocalMs: startMsDay,
        endLocalMs: endMs
      }
    );

    const evCount = metricsWindow?.meta?.eventsCount || 0;
    const scans = metricsWindow?.kpis?.scansTotal || 0;
    const tsInterval = buildInsightTimestampForInterval(ymd, ymd, bh);

    // sem dados -> cria bloco neutro
    if (!evCount && !scans) {
      const insightRecord = {
        timestamp: tsInterval,
        title: `Sem movimento até ${bh}:00`,
        detail: normalizeInsightDetail(
          `Sem movimento até ${bh}:00.\nNenhum scan foi registrado hoje até esse horário.`
        ),
        status: "neutro",
        suggestion: "Se isso for inesperado, confira QR visível, internet e se o app está enviando eventos."
      };

      currentList = await appendInsightToS3(tenantId, ymd, ymd, INSIGHTS_ROLLUP_LABEL, insightRecord);
      existingBuckets.add(bucketNeeded);
      created++;
      if (created >= maxToCreate) break;
      continue;
    }

    // com dados -> tenta IA, se falhar faz fallback
    let insightBase = null;
    if (openaiClient) {
      try {
        insightBase = await generateInsightsWithOpenAI(metricsWindow, {
          startLabel: ymd,
          endLabel: ymd,
          hourLabel: bh
        });
      } catch (e) {
        log("WARN", "[METRICAS] OpenAI falhou no rollup:", e.message);
        insightBase = null;
      }
    }

    if (!insightBase) {
      const insightRecord = {
        timestamp: tsInterval,
        title: `Resumo até ${bh}:00`,
        detail: normalizeInsightDetail(
          `Até ${bh}:00 houve ${scans} scans.\nVeja Horário de Pico e Mesa/Engajamento pra entender onde concentrou o movimento.`
        ),
        status: "neutro",
        suggestion: "Se quiser textos automáticos mais ricos, valide OPENAI_API_KEY e limites."
      };
      currentList = await appendInsightToS3(tenantId, ymd, ymd, INSIGHTS_ROLLUP_LABEL, insightRecord);
      existingBuckets.add(bucketNeeded);
      created++;
      if (created >= maxToCreate) break;
      continue;
    }

    const baseTitle = insightBase.title || "Insight de uso do ARCardápio";
    const combinedText =
      `${baseTitle}\n` +
      `${insightBase.summary || ""} ` +
      `${insightBase.suggestion || ""}`;

    const insightRecord = {
      timestamp: tsInterval,
      title: baseTitle,
      detail: normalizeInsightDetail(combinedText),
      status: insightBase.status || "neutro",
      suggestion: insightBase.suggestion || ""
    };

    currentList = await appendInsightToS3(tenantId, ymd, ymd, INSIGHTS_ROLLUP_LABEL, insightRecord);
    existingBuckets.add(bucketNeeded);
    created++;
    if (created >= maxToCreate) break;
  }

  return currentList;
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

  // ✅ "Hoje" respeitando o offset configurado (ex: Brasil -03)
  const nowLocal = toLocalDate(new Date());
  const todayUTC = new Date(Date.UTC(
    nowLocal.getUTCFullYear(),
    nowLocal.getUTCMonth(),
    nowLocal.getUTCDate()
  ));

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
    "startRaw:",
    startRaw,
    "endRaw:",
    endRaw,
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

    // ✅ se o range inclui HOJE, garante que o último bloco (ex 23) exista
    const todayYmdLocal = formatYMD(toLocalDate(new Date()));
    const startYmd = formatYMD(startDate);
    const endYmd = formatYMD(endDate);
    if (todayYmdLocal >= startYmd && todayYmdLocal <= endYmd) {
      await ensureRollupInsightsForDay(tenantId, todayYmdLocal, { backfill: false });
    }

    // ✅ tenta entregar rollup salvo. Se não tiver, cai no insight simples.
    const merged = [];
    {
      let cur = new Date(startDate.getTime());
      const end = new Date(endDate.getTime());
      while (cur <= end) {
        const ymd = formatYMD(cur);
        const dayList = await loadInsightsFromS3(tenantId, ymd, ymd, INSIGHTS_ROLLUP_LABEL);
        if (Array.isArray(dayList) && dayList.length) merged.push(...dayList);
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    merged.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
    const byHour = new Map();
    for (const rec of merged) {
      const hb = hourBucket(rec?.timestamp);
      if (!hb) continue;
      if (!byHour.has(hb)) byHour.set(hb, rec);
    }

    const rollupFinal = Array.from(byHour.values())
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
      .slice(0, INSIGHTS_MAX_PER_INTERVAL);

    data.insights = rollupFinal.length
      ? rollupFinal
      : buildInsightsFromAggregated(data, { startDate, endDate });

    data.meta = {
      ...(data.meta || {}),
      tenantRaw,
      tenantId
    };

    log("INFO", "[METRICAS] insights enviados:", Array.isArray(data.insights) ? data.insights.length : 0);

    return jsonResponse(event, 200, data);
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

    return jsonResponse(event, 200, vazio);
  }
}

// ===============================
// GET/POST /metricas/insights (dashboard → IA)
// FUNCIONAL: barato, sem loop absurdo, POST funciona, sem 500 se IA falhar
// ===============================
async function handleInsights(event, auth, parsed) {
  const tenantRaw = auth.tenant;
  const tenantId = normalizarTenantId(tenantRaw);

  const httpMethod = event.httpMethod || event.requestContext?.http?.method || "GET";

  // ---------------------------
  // 1) POST com métricas no body (usa e funciona)
  // ---------------------------
  if (httpMethod === "POST" && event.body) {
    let body = null;
    try {
      body = typeof event.body === "string" ? JSON.parse(event.body) : (event.body || {});
    } catch (e) {
      return jsonResponse(event, 400, { ok: false, code: "BAD_BODY", message: "Body JSON inválido." });
    }

    const metricsFromBody =
      (body && (body.kpis || body.daily || body.timeByCategory) ? body :
      (body.metrics && (body.metrics.kpis || body.metrics.daily || body.metrics.timeByCategory) ? body.metrics : null));

    const range = body.range || {};
    const startLabel = range.startDate || range.start || range.inicio || null;
    const endLabel   = range.endDate   || range.end   || range.fim    || null;
    const hourLabel  = range.hourLabel || body.hourLabel || range.horaReferencia || null;

    if (!metricsFromBody) {
      return jsonResponse(event, 400, { ok: false, code: "NO_METRICS", message: "POST sem métricas no body." });
    }

    // tenta IA; se falhar, fallback SEM IA
    let insightBase = null;
    if (openaiClient) {
      try {
        insightBase = await generateInsightsWithOpenAI(metricsFromBody, { startLabel, endLabel, hourLabel });
      } catch (e) {
        log("WARN", "[INSIGHTS] OpenAI falhou (POST):", e.message);
        insightBase = null;
      }
    }

    if (!insightBase) {
      const fallback = buildInsightsFromAggregated(metricsFromBody, {});
      const best = fallback[0] || {
        timestamp: new Date().toISOString(),
        title: "Insights do ARCardápio",
        detail: "Sem IA: não foi possível gerar insight automático.",
        status: "neutro",
        suggestion: ""
      };

      return jsonResponse(event, 200, {
        ok: true,
        tenantRaw,
        tenantId,
        period: { start: startLabel, end: endLabel, mode: "post-body" },
        insights: [best]
      });
    }

    const ts = buildInsightTimestampForInterval(startLabel || "", endLabel || "", hourLabel || "");
    const combinedText =
      `${insightBase.title || "Insight de uso do ARCardápio"}\n` +
      `${insightBase.summary || ""} ${insightBase.suggestion || ""}`;

    return jsonResponse(event, 200, {
      ok: true,
      tenantRaw,
      tenantId,
      period: { start: startLabel, end: endLabel, mode: "post-body" },
      insights: [{
        timestamp: ts,
        title: insightBase.title || "Insight de uso do ARCardápio",
        detail: normalizeInsightDetail(combinedText),
        status: insightBase.status || "neutro",
        suggestion: insightBase.suggestion || ""
      }]
    });
  }

  // ---------------------------
  // 2) GET / modo AUTO barato: usa rollup existente + cria só o necessário
  // ---------------------------
  const { startDate: startRaw, endDate: endRaw, backfill } = parsed.query || {};
  let startDate = parseDateParam(startRaw);
  let endDate = parseDateParam(endRaw);

  const nowLocal = toLocalDate(new Date());
  const todayUTC = new Date(Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()));

  if (!startDate) startDate = todayUTC;
  if (!endDate) endDate = todayUTC;
  if (startDate > endDate) [startDate, endDate] = [endDate, startDate];

  const startLabel = formatYMD(startDate);
  const endLabel = formatYMD(endDate);
  const doBackfill = String(backfill || "").trim() === "1";

  // lista dias
  const days = [];
  {
    let cur = new Date(startDate.getTime());
    const end = new Date(endDate.getTime());
    while (cur <= end) {
      days.push(formatYMD(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  const merged = [];
  const todayYmdLocal = formatYMD(toLocalDate(new Date()));

  for (const ymd of days) {
    // só gera rollup no HOJE (ou backfill=1). Barato e controlado.
    if (doBackfill || ymd === todayYmdLocal) {
      try {
        await ensureRollupInsightsForDay(tenantId, ymd, { backfill: doBackfill });
      } catch (e) {
        log("WARN", "[INSIGHTS] ensureRollup falhou:", e.message);
      }
    }

    const dayList = await loadInsightsFromS3(tenantId, ymd, ymd, INSIGHTS_ROLLUP_LABEL);
    if (Array.isArray(dayList) && dayList.length) merged.push(...dayList);
  }

  merged.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

  // dedup por hora
  const byHour = new Map();
  for (const rec of merged) {
    const hb = hourBucket(rec?.timestamp);
    if (!hb) continue;
    if (!byHour.has(hb)) byHour.set(hb, rec);
  }

  const finalList = Array.from(byHour.values())
    .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
    .slice(0, INSIGHTS_MAX_PER_INTERVAL);

  return jsonResponse(event, 200, {
    ok: true,
    tenantRaw,
    tenantId,
    period: { start: startLabel, end: endLabel, mode: "rollup-cheap" },
    insights: finalList
  });
}

// POST /metrics/ingest (app → público, sem JWT)
async function handleIngestPublic(event, parsed) {
  let body = null;

  try {
    body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
  } catch (err) {
    log("WARN", "[METRICAS] Ingest body JSON inválido:", err.message);
    return jsonResponse(event, 400, {
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
    log("WARN", "[METRICAS] Ingest sem tenant nem email no payload. Usando 'unknown'.", JSON.stringify(body));
  }

  let batchPayload = null;

  if (body.batch && Array.isArray(body.batch.events)) {
    batchPayload = body.batch;
  } else if (Array.isArray(body.events)) {
    batchPayload = { events: body.events };
  } else {
    return jsonResponse(event, 400, {
      ok: false,
      code: "NO_EVENTS",
      message: "Nenhum evento encontrado no payload."
    });
  }

  await saveBatchToS3(tenantId, batchPayload, body.ts);

  return jsonResponse(event, 200, {
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
      return { statusCode: 204, headers: corsHeaders({}, event), body: "" };
    }

    const isIngestRoute = path.endsWith("/ingest");
    const isInsightsRoute =
      path.includes("/metricas/insights") ||
      path.includes("/metricasInsights");

    if (method === "POST" && isIngestRoute) {
      return handleIngestPublic(event, parsed);
    }

    const auth = autenticarRequest(event);
    if (!auth.ok) {
      return jsonResponse(event, auth.httpStatus, {
        ok: false,
        code: auth.code,
        message: auth.message
      });
    }

    if (
      method === "GET" &&
      (path.includes("/metricas/cliente") || path.includes("/metricasCliente"))
    ) {
      return handleGetMetrics(event, auth, parsed);
    }

    if ((method === "GET" || method === "POST") && isInsightsRoute) {
      return handleInsights(event, auth, parsed);
    }

    return jsonResponse(event, 404, {
      ok: false,
      code: "NOT_FOUND",
      message: "Rota não encontrada."
    });
  } catch (err) {
    log("ERROR", "[METRICAS] Crash no handler principal:", err);
    return jsonResponse(event, 500, {
      ok: false,
      code: "UNEXPECTED_ERROR",
      message: "Erro interno nas métricas."
    });
  }
};
