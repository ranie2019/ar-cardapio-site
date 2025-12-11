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
  // Ex.: "Wed Dec 03 2025 00:00:00 GMT-0300 (Horário Padrão de Brasília)"
  const djs = new Date(v);
  if (!isNaN(djs.getTime())) {
    return new Date(
      Date.UTC(djs.getFullYear(), djs.getMonth(), djs.getDate())
    );
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
// HELPERS – BANCO DE INSIGHTS NO S3
// ===============================

// Normaliza um identificador de intervalo (start/end/hour) para usar no S3
function normalizeIntervalId(startLabel, endLabel, hourLabel) {
  const raw = `${startLabel || "inicio"}_${endLabel || "fim"}_${hourLabel || "all"}`;
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// Monta a chave do S3 para os insights de um intervalo
// Ex: informacao/<tenantId>/insights/yyyy=2025/mm=12/dd=09/interval-<id>.json
function buildInsightsKey(tenantId, startLabel, endLabel, hourLabel) {
  // tenta usar uma data no formato yyyy-mm-dd para a pasta (se tiver)
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

// Lê insights já salvos para esse intervalo (se existir arquivo)
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
    // Se não existir o arquivo, só volta lista vazia
    if (
      err.name === "NoSuchKey" ||
      err.Code === "NoSuchKey" ||
      err.$metadata?.httpStatusCode === 404
    ) {
      return [];
    }
    log(
      "WARN",
      "[METRICAS] Erro ao carregar insights do S3:",
      err.message
    );
    return [];
  }
}

// Agrupa timestamp por HORA (ex: 2025-12-10T16)
function hourBucket(ts) {
  if (!ts) return null;

  // se for ISO, esse slice já resolve bem (YYYY-MM-DDTHH)
  const s = String(ts);
  if (s.length >= 13) {
    return s.slice(0, 13);
  }

  // fallback: tenta converter pra Date
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;

  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

// Monta um timestamp baseado no intervalo (start/end + hora)
function buildInsightTimestampForInterval(startLabel, endLabel, hourLabel) {
  // se não tiver nenhuma info, cai no "agora"
  const fallback = new Date().toISOString();

  // tenta achar uma data base no formato yyyy-mm-dd
  const baseYmd =
    (startLabel && /^\d{4}-\d{2}-\d{2}$/.test(startLabel) && startLabel) ||
    (endLabel && /^\d{4}-\d{2}-\d{2}$/.test(endLabel) && endLabel) ||
    null;

  if (!baseYmd) return fallback;

  let h = 0;
  let m = 0;

  if (hourLabel) {
    const s = String(hourLabel).trim();

    // "13"
    let m1 = s.match(/^(\d{1,2})$/);
    // "13:00" ou "13:30"
    let m2 = s.match(/^(\d{1,2}):(\d{2})/);
    // "2025-12-11T13" ou "2025-12-11T13:00"
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
  const dt = new Date(Date.UTC(y, mo - 1, d, h, m, 0));
  return dt.toISOString();
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
    current = await loadInsightsFromS3(
      tenantId,
      startLabel,
      endLabel,
      hourLabel
    );
  } catch {
    current = [];
  }

  const newBucket = hourBucket(insightRecord.timestamp);

  // SE JÁ EXISTIR INSIGHT NESSA MESMA HORA, NÃO SOBRESCREVE
  if (newBucket) {
    const exists = current.find(
      (rec) => hourBucket(rec.timestamp) === newBucket
    );
    if (exists) {
      log(
        "INFO",
        "[METRICAS] Já existe insight para esse intervalo/hora, não sobrescrevendo."
      );
      // Mantém a lista como está (horário antigo não muda)
      return current;
    }
  }

  // Adiciona o novo insight
  current.push(insightRecord);

  // Ordena do MAIS NOVO para o MAIS ANTIGO
  current.sort((a, b) => {
    const ta = a.timestamp || "";
    const tb = b.timestamp || "";
    return tb.localeCompare(ta); // desc
  });

  // Limita quantidade por intervalo
  if (current.length > INSIGHTS_MAX_PER_INTERVAL) {
    current = current.slice(0, INSIGHTS_MAX_PER_INTERVAL);
  }

  // Salva no S3
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: METRICS_BUCKET,
        Key,
        Body: JSON.stringify(current, null, 2),
        ContentType: "application/json"
      })
    );

    log(
      "INFO",
      "[METRICAS] Insights salvos no S3:",
      `${METRICS_BUCKET}/${Key}`,
      "qtd:",
      current.length
    );
  } catch (err) {
    log(
      "WARN",
      "[METRICAS] Erro ao salvar insights no S3:",
      err.message
    );
  }

  // Lista já deduplicada e ordenada (mais novo em cima)
  return current;
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
  const timeByCategory = Array.isArray(agg.timeByCategory)
    ? agg.timeByCategory
    : [];
  const devices = Array.isArray(agg.devices) ? agg.devices : [];

  let periodLabel = "";
  if (startDate && endDate) {
    const same = startDate.getTime() === endDate.getTime();
    if (same) {
      periodLabel = `no dia ${formatYMD(startDate)}`;
    } else {
      periodLabel = `no período de ${formatYMD(startDate)} a ${formatYMD(
        endDate
      )}`;
    }
  }

  const scans = kpis.scansTotal || 0;
  const sessoes = kpis.sessoesTotal || 0;
  const unicos = kpis.unicosTotal || 0;
  const infoTotal = kpis.infoTotal || kpis.infoClicks || 0;

  // 1) Uso do botão Info
  if (scans > 0 && infoTotal > 0) {
    const rate = (infoTotal / scans) * 100;
    insights.push({
      timestamp: nowIso,
      title: `Botão Info usado em ${rate.toFixed(1)}% dos scans`,
      detail: `Foram ${infoTotal} cliques no botão Info em ${scans} scans ${periodLabel}. Isso mostra que os clientes estão buscando detalhes dos itens.`
    });
  }

  // 2) Sessões por cliente (retorno)
  if (sessoes > 0 && unicos > 0) {
    const media = sessoes / unicos;
    insights.push({
      timestamp: nowIso,
      title: `Clientes voltando ao cardápio`,
      detail: `Você teve ${unicos} clientes únicos em ${sessoes} sessões ${periodLabel}, média de ${media.toFixed(
        1
      )} sessões por cliente.`
    });
  }

  // 3) Horário de pico
  if (picos.length) {
    const best = [...picos].reduce((a, b) =>
      (b.scans || 0) > (a.scans || 0) ? b : a
    );
    if (best && best.scans > 0) {
      const hourStr = String(best.hora).padStart(2, "0");
      insights.push({
        timestamp: nowIso,
        title: `Horário de pico às ${hourStr}h`,
        detail: `O maior volume de scans foi às ${hourStr}h, com ${best.scans} scans ${periodLabel}. Esse é um bom horário para destacar promoções.`
      });
    }
  }

  // 4) Item mais observado
  if (topItems.length) {
    const topByTime = [...topItems].sort(
      (a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0)
    )[0];
    if (topByTime && topByTime.avgTimeSec > 0) {
      insights.push({
        timestamp: nowIso,
        title: `Item mais observado: ${topByTime.item}`,
        detail: `"${topByTime.item}" tem o maior tempo médio de visualização (${Math.round(
          topByTime.avgTimeSec
        )}s) ${periodLabel}. Considere usar esse item em destaque ou combos.`
      });
    }

    // 5) Item melhor avaliado (like vs dislike)
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
        bestVote.total > 0
          ? ((bestVote.likes || 0) / bestVote.total) * 100
          : 0;

      insights.push({
        timestamp: nowIso,
        title: `Item melhor avaliado: ${bestVote.item}`,
        detail: `"${bestVote.item}" recebeu ${bestVote.total} avaliações, com ${likeRate.toFixed(
          1
        )}% positivas.`
      });
    }
  }

  // 6) Categoria com maior tempo médio
  if (timeByCategory.length) {
    const bestCat = [...timeByCategory].sort(
      (a, b) => (b.avgTimeSec || 0) - (a.avgTimeSec || 0)
    )[0];
    if (bestCat && bestCat.avgTimeSec > 0) {
      insights.push({
        timestamp: nowIso,
        title: `Categoria mais explorada: ${bestCat.category}`,
        detail: `A categoria "${bestCat.category}" tem o maior tempo médio por sessão (${Math.round(
          bestCat.avgTimeSec
        )}s).`
      });
    }
  }

  // 7) Dispositivo dominante
  if (devices.length) {
    const topDev = [...devices].sort(
      (a, b) => (b.sessions || 0) - (a.sessions || 0)
    )[0];
    if (topDev && topDev.sessions > 0) {
      insights.push({
        timestamp: nowIso,
        title: `Dispositivo dominante: ${topDev.label}`,
        detail: `${topDev.sessions} sessões foram feitas em ${topDev.label}. Priorize a experiência desse dispositivo.`
      });
    }
  }

  // Não cria insight genérico.
  return insights.slice(0, 10);
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

  const startLocalMs = startDate.getTime();
  const endLocalMs = endDate.getTime() + DAY_MS - 1;

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

    const currentLastMs = current.ultimoScan
      ? new Date(current.ultimoScan).getTime()
      : 0;
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
    const devClass = String(
      ua.deviceClass || ua.device_type || ua.device || ""
    ).toLowerCase();
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
    if (
      uaStr.includes("windows") ||
      uaStr.includes("macintosh") ||
      uaStr.includes("linux")
    ) {
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
      continue;
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

        if (tMsLocal < startLocalMs || tMsLocal > endLocalMs) {
          continue;
        }

        const dayYmd = formatYMD(dLocal);
        const idx = indexByDay.get(dayYmd);
        if (idx === undefined) {
          continue;
        }

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

        if (
          (name === "item_view" || name === "menu_item_view") &&
          ev.payload
        ) {
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
          isLikeEvent = true;
        }

        if (isLikeEvent || isDislikeEvent) {
          if (isLikeEvent) {
            result.daily.likes[idx] = (result.daily.likes[idx] || 0) + 1;
          } else {
            result.daily.dislikes[idx] =
              (result.daily.dislikes[idx] || 0) + 1;
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

          if (ev.sessionId) {
            const ds = deviceBySession.get(ev.sessionId);
            if (ds) {
              ds.totalVisibleMs += durMs;
            }
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
      const avgTimeSec =
        m.countTime > 0
          ? Math.round(m.totalTimeMs / m.countTime / 1000)
          : 0;

      // pega os dados de engajamento calculados em mesaEngagement
      const eng = mesaEngagement.get(m.mesa);
      const sessions = eng && eng.sessionsSet ? eng.sessionsSet.size : 0;
      const interactionsPerSession =
        eng && sessions > 0
          ? Number((eng.totalInteractions / sessions).toFixed(2))
          : 0;

      return {
        mesa: m.mesa,
        scans: m.scans,
        ultimoScan: m.ultimoScan,
        avgTimeSec,
        // >>> campos usados pelo dashboard de Engajamento <<<
        sessions,
        totalInteractions: eng ? eng.totalInteractions : 0,
        interactionsPerSession
      };
    })
    .sort((a, b) => b.scans - a.scans);

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

  const clientDaysCount = new Map();

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

  // picos: agora inclui a data verdadeira de cada dia e já vem ordenado
  // do mais novo para o mais antigo (data/hora mais recente em cima)
  result.picos = Array.from(picosMap.values())
    .sort((a, b) => {
      if (a.ymd === b.ymd) {
        // mesma data → hora desc
        return b.hour - a.hour;
      }
      // datas diferentes → a mais nova primeiro
      return a.ymd < b.ymd ? 1 : -1;
    })
    .map((p) => {
      const idx = indexByDay.get(p.ymd);
      const dateLabel =
        idx !== undefined ? result.rangeLabels[idx] : p.ymd;
      const hourLabel = `${String(p.hour).padStart(2, "0")}:00`;

      return {
        // NOVO: data em formato yyyy-mm-dd para o front usar
        data: p.ymd,
        // mantém os campos antigos para não quebrar nada
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
    result.kpis.avgTimePerItem = Math.round(
      totalItemTimeMs / itemViewEvents / 1000
    );
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

    if (vote === "like") {
      agg.likes++;
    } else if (vote === "dislike") {
      agg.dislikes++;
    }

    itemVotes.set(itemName, agg);
  }

  let likeTotal = 0;
  let dislikeTotal = 0;
  for (const v of itemVotes.values()) {
    likeTotal += v.likes;
    dislikeTotal += v.dislikes;
  }

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

  const topItemsArr = [];
  const seenItems = new Set();

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
// HISTÓRICO DE SCANS (ÚLTIMOS 30 DIAS) – EXCLUSIVO DO GRÁFICO DE ESCANEAMENTO
// ===============================
async function aggregateScansHistory30d(tenantId, referenceDate) {
  // normaliza a data de referência (zera hora em UTC)
  const refUtc = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate()
    )
  );

  // últimos 30 dias (inclui hoje)
  const startUtc = new Date(refUtc.getTime() - 29 * DAY_MS);

  // monta skeleton com labels e arrays de scans/sessoes/unicos
  const { result, indexByDay } = buildRangeSkeleton(startUtc, refUtc);

  const prefix   = `${METRICS_PREFIX}/${tenantId}/metrics/`;
  const allKeys  = await listAllObjects(METRICS_BUCKET, prefix);
  const startMs  = startUtc.getTime();
  const endMs    = refUtc.getTime() + DAY_MS - 1;

  const sessionByDay = new Map();
  const clientByDay  = new Map();

  for (const key of allKeys) {
    let obj;
    try {
      obj = await s3.send(
        new GetObjectCommand({
          Bucket: METRICS_BUCKET,
          Key: key
        })
      );
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

      const batch  = rec.batch || {};
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

        const dUtc = new Date(tsStr);
        if (isNaN(dUtc.getTime())) continue;

        const dLocal   = toLocalDate(dUtc);
        const tMsLocal = dLocal.getTime();
        if (tMsLocal < startMs || tMsLocal > endMs) continue;

        const dayYmd = formatYMD(dLocal);
        const idx    = indexByDay.get(dayYmd);
        if (idx === undefined) continue;

        // ---- SCANS (apenas page_open) ----
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

        // ---- ÚNICOS (visitor_status) ----
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

  // fecha sessoes/unicos por dia
  for (const [ymd, idx] of indexByDay.entries()) {
    const sess = sessionByDay.get(ymd);
    const cli  = clientByDay.get(ymd);

    if (sess) result.daily.sessoes[idx] = sess.size;
    if (cli)  result.daily.unicos[idx]  = cli.size;
  }

  // só o que o front precisa
  return {
    labels:  result.rangeLabels,
    scans:   result.daily.scans,
    sessoes: result.daily.sessoes,
    unicos:  result.daily.unicos
  };
}

// ===============================
// OPENAI – GERAÇÃO DE INSIGHTS (rota dedicada /metricas/insights)
// ===============================
async function generateInsightsWithOpenAI(metrics, opts = {}) {
  if (!openaiClient) {
    throw new Error("OPENAI_API_KEY não configurada na Lambda.");
  }

  const { startLabel, endLabel, hourLabel } = opts;

  const kpis         = metrics.kpis  || {};
  const daily        = metrics.daily || {};
  const rangeLabels  = metrics.rangeLabels || [];

  const payload = {
    periodo: {
      inicio:        startLabel || null,
      fim:           endLabel   || null,
      horaReferencia: hourLabel || null
    },

    resumo: { ...kpis },

    escaneamentoTotal: {
      scansTotal:   kpis.scansTotal   ?? 0,
      sessoesTotal: kpis.sessoesTotal ?? 0,
      unicosTotal:  kpis.unicosTotal  ?? 0
    },

    escaneamentoPorMesa: metrics.porMesa || [],

    engajamentoPorMesa: metrics.engagementByMesa || { porMesa: [] },

    sessoesPorPeriodo: {
      labels:   rangeLabels,
      sessoes:  daily.sessoes || [],
      unicos:   daily.unicos  || []
    },

    tempoMedioCardapio: metrics.tempoMenu || [],

    horariosDePico: metrics.picos || [],

    likes: {
      totalLikes:     kpis.likeTotal    ?? 0,
      totalDislikes:  kpis.dislikeTotal ?? 0,
      dailyLikes:     daily.likes       || [],
      dailyDislikes:  daily.dislikes    || [],
      labels:         rangeLabels
    },

    tempoPorCategoria: metrics.timeByCategory || [],

    botaoInfo: {
      totalClicks:      (kpis.infoTotal ?? kpis.infoClicks) ?? 0,
      infoClicks:       kpis.infoClicks ?? 0,
      avgTimeSec:       kpis.infoAvgTime ?? kpis.infoAvgTimeInfoBox ?? 0,
      dailyInfoClicks:  daily.info || [],
      labels:           rangeLabels
    },

    tempoPorItem: (metrics.topItems || []).slice(0, 30).map(i => ({
      item:       i.item,
      avgTimeSec: i.avgTimeSec ?? 0,
      views:      i.views      ?? 0,
      likes:      i.likes      ?? 0,
      dislikes:   i.dislikes   ?? 0,
      categoria:  i.category   ?? null,
      clicksInfo: i.clicksInfo ?? 0
    })),

    dispositivos:        metrics.devices    || [],
    modelosMaisExibidos: (metrics.topModels || []).slice(0, 30),

    meta: {
      labels:      rangeLabels,
      filesCount:  metrics.meta?.filesCount  ?? null,
      eventsCount: metrics.meta?.eventsCount ?? null
    }
  };

  const systemPrompt =
    "Você é um analista de dados para restaurantes que usam o ARCardápio. " +
    "Você recebe um JSON com TODOS os blocos do dashboard. " +
    "Sem rodeios, foque em coisas práticas para o dono do restaurante. " +
    "Responda SEMPRE em JSON EXATO no formato: " +
    '{\"title\": string, \"summary\": string, \"status\": \"bom\" | \"neutro\" | \"ruim\", \"suggestion\": string}. ' +
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

  // --- LIMPEZA: remove ```json ... ``` se vier ---
  if (content.startsWith("```")) {
    const fenceMatch = content.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      content = fenceMatch[1].trim();
    }
  }

  // tenta parsear direto
  let parsed = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    // fallback: pega só o trecho entre { ... }
    const first = content.indexOf("{");
    const last  = content.lastIndexOf("}");
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
    // último fallback: usa texto bruto
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

    data.insights = buildInsightsFromAggregated(data, { startDate, endDate });

    data.meta = {
      ...(data.meta || {}),
      tenantRaw,
      tenantId
    };

    log(
      "INFO",
      "[METRICAS] insights gerados para dashboard:",
      Array.isArray(data.insights) ? data.insights.length : 0
    );

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

    return jsonResponse(200, vazio);
  }
}

// GET/POST /metricas/insights (dashboard → IA)
async function handleInsights(event, auth, parsed) {
  const tenantRaw = auth.tenant;
  const tenantId = normalizarTenantId(tenantRaw);

  if (!openaiClient) {
    return jsonResponse(500, {
      ok: false,
      code: "NO_OPENAI_KEY",
      message: "OPENAI_API_KEY não configurada na Lambda."
    });
  }

  const httpMethod =
    event.httpMethod || event.requestContext?.http?.method || "GET";

  let metricsFromBody = null;
  let startLabel = null;
  let endLabel = null;
  let hourLabel = null;

  // 1) Tenta ler métricas do body (POST)
  if (httpMethod === "POST" && event.body) {
    try {
      const body =
        typeof event.body === "string"
          ? JSON.parse(event.body)
          : event.body || {};

      if (body && (body.kpis || body.daily || body.timeByCategory)) {
        metricsFromBody = body;
      } else if (
        body.metrics &&
        (body.metrics.kpis ||
          body.metrics.daily ||
          body.metrics.timeByCategory)
      ) {
        metricsFromBody = body.metrics;
      }

      if (body.range) {
        startLabel =
          body.range.startDate ||
          body.range.start ||
          body.range.inicio ||
          null;
        endLabel =
          body.range.endDate ||
          body.range.end ||
          body.range.fim ||
          null;
        hourLabel =
          body.range.hourLabel ||
          body.hourLabel ||
          body.range.horaReferencia ||
          null;
      } else {
        hourLabel = body.hourLabel || null;
      }
    } catch (e) {
      log(
        "WARN",
        "[METRICAS] body inválido em /metricas/insights (POST):",
        e.message
      );
    }
  }

  // 2) Decide de onde vêm as métricas
  let metrics;

  if (!metricsFromBody) {
    const {
      startDate: startRaw,
      endDate: endRaw,
      hourLabel: hourQuery
    } = parsed.query || {};

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

    hourLabel = hourLabel || hourQuery || null;

    log(
      "INFO",
      "[METRICAS] INSIGHTS via agregação S3",
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
      "hourLabel:",
      hourLabel || null
    );

    metrics = await aggregateMetrics(tenantId, startDate, endDate);

    startLabel = startLabel || formatYMD(startDate);
    endLabel = endLabel || formatYMD(endDate);
  } else {
    metrics = metricsFromBody;
    log(
      "INFO",
      "[METRICAS] INSIGHTS usando métricas do body (POST)",
      "tenantId:",
      tenantId
    );
  }

  // 3) Gera insight com OpenAI + salva no S3 (1 por hora, mais novo em cima)
  try {
    const insightBase = await generateInsightsWithOpenAI(metrics, {
      startLabel,
      endLabel,
      hourLabel: hourLabel || null
    });

        // timestamp alinhado com o intervalo (start/end + hora)
    const tsInterval = buildInsightTimestampForInterval(
      startLabel || null,
      endLabel || null,
      hourLabel || null
    );

    // Monta primeira linha com título + data (se tiver)
    let dateTag = null;
    if (startLabel && /^\d{4}-\d{2}-\d{2}$/.test(startLabel)) {
      const [y, m, d] = startLabel.split("-");
      dateTag = `${d}/${m}`;
    }

    const baseTitle = insightBase.title || "Insight de uso do ARCardápio";
    let headerLine = baseTitle;
    if (dateTag) {
      headerLine = `${baseTitle} em ${dateTag},`;
    }

    let combinedText = headerLine + "\n";
    if (insightBase.summary) {
      combinedText += insightBase.summary + " ";
    }
    if (insightBase.suggestion) {
      combinedText += insightBase.suggestion;
    }

    const detailFormatted = normalizeInsightDetail(combinedText);

    const insightRecord = {
      timestamp: tsInterval, // <-- AGORA usa o horário do intervalo
      title: baseTitle,
      detail: detailFormatted,
      status: insightBase.status || "neutro",
      suggestion: insightBase.suggestion || ""
    };

    const updatedList = await appendInsightToS3(
      tenantId,
      startLabel || null,
      endLabel || null,
      hourLabel || null,
      insightRecord
    );

    return jsonResponse(200, {
      ok: true,
      tenantRaw,
      tenantId,
      period: {
        start: startLabel || null,
        end: endLabel || null,
        hourLabel: hourLabel || null
      },
      insights: updatedList
    });
  } catch (err) {
    log("ERROR", "[METRICAS] Erro em handleInsights:", err);
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
// HELPER – NORMALIZAR TEXTO DE INSIGHT PARA TOOLTIP
// ===============================
function normalizeInsightDetail(raw) {
  if (!raw) return "";

  let text = String(raw).trim();

  // 1) Remove fences ```...``` se vierem
  if (text.startsWith("```")) {
    const fenceMatch = text.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      text = fenceMatch[1].trim();
    }
  }

  // 2) Tenta extrair title/summary/suggestion se o conteúdo for JSON
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
    if (parsed.title)      parts.push(String(parsed.title));
    if (parsed.summary)    parts.push(String(parsed.summary));
    if (parsed.suggestion) parts.push(String(parsed.suggestion));
    text = parts.join(" ");
  }

  // 3) Normaliza espaços mas preserva quebras de linha
  text = text.replace(/\r\n/g, "\n");    // padroniza EOL
  text = text.replace(/[ \t]+/g, " ");   // múltiplos espaços → 1 espaço
  text = text.trim();

  // 4) Quebra em linhas por frase (. ? !)
  text = text.replace(/([.!?])\s+/g, "$1\n");

  // 5) Evita muitas linhas em branco seguidas
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
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
    const isInsightsRoute =
      path.includes("/metricas/insights") ||
      path.includes("/metricasInsights");

    if (method === "POST" && isIngestRoute) {
      return handleIngestPublic(event, parsed);
    }

    const auth = autenticarRequest(event);
    if (!auth.ok) {
      return jsonResponse(auth.httpStatus, {
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
