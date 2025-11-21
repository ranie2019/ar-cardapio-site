const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });

const BUCKET = process.env.BUCKET || "ar-cardapio-models";
const ROOT_PREFIX = (process.env.ROOT_PREFIX || "informacao").replace(/^\/+|\/+$/g, "");
const JWT_SECRET = process.env.JWT_SECRET || "";
const MAX_EVENTS = Number(process.env.MAX_EVENTS_PER_BATCH || 100);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGINS || "*",
    "Access-Control-Allow-Headers": process.env.CORS_HEADERS || "Content-Type,Authorization",
    "Access-Control-Allow-Methods": process.env.CORS_METHODS || "OPTIONS,POST"
  };
}
const ok  = (b) => ({ statusCode: 200, headers: corsHeaders(), body: JSON.stringify(b) });
const bad = (c,m)=> ({ statusCode: c, headers: corsHeaders(), body: JSON.stringify({ error:m }) });

function normTenant(v){
  return String(v||"").toLowerCase().replace(/@/g,"-").replace(/\./g,"-").replace(/[^a-z0-9\-]/g,"-");
}

exports.handler = async (event) => {
  if (event?.requestContext?.http?.method === "OPTIONS") return ok({});

  try {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    if (!auth.startsWith("Bearer ")) return bad(401, "Authorization ausente.");
    if (!JWT_SECRET) return bad(500, "JWT_SECRET não configurado.");

    let decoded;
    try { decoded = jwt.verify(auth.slice(7), JWT_SECRET); }
    catch { return bad(401, "Token inválido."); }

    const tenantId = decoded.tenantId || decoded.userId || decoded.sub || decoded.email;
    if (!tenantId) return bad(401, "tenantId/email não encontrado no token.");

    let body = event.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { return bad(400, "JSON inválido."); } }

    const events = Array.isArray(body?.events) ? body.events : [];
    if (!events.length) return bad(400, "Envie 'events' (array).");
    if (events.length > MAX_EVENTS) return bad(413, `Máximo de ${MAX_EVENTS} eventos por lote.`);

    const now = new Date();
    const yyyy = String(now.getUTCFullYear()).padStart(4,"0");
    const mm   = String(now.getUTCMonth()+1).padStart(2,"0");
    const dd   = String(now.getUTCDate()).padStart(2,"0");
    const hh   = String(now.getUTCHours()).padStart(2,"0");
    const key = `${ROOT_PREFIX}/${normTenant(tenantId)}/metrics/yyyy=${yyyy}/mm=${mm}/dd=${dd}/hh=${hh}/part-${randomUUID()}.jsonl`;

    const lines = events.map(e => JSON.stringify({
      tenantId,
      ts: typeof e.ts === "number" ? e.ts : Math.floor(Date.now()/1000),
      ...e
    })).join("\n") + "\n";

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: key, Body: lines, ContentType: "application/x-ndjson"
    }));

    return ok({ accepted: events.length, key });
  } catch (err) {
    console.error(err);
    return bad(500, "Falha ao ingerir eventos.");
  }
};
