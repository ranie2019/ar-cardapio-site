// index.js — loginCliente FINAL (Node 20/22, CommonJS)
const AWS   = require("aws-sdk");
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");

const ddb = new AWS.DynamoDB.DocumentClient();

// Tabela de clientes (aceita TBL_CLIENTES ou CLIENTES_TABLE; cai no default se não tiver)
const TABLE = process.env.TBL_CLIENTES || process.env.CLIENTES_TABLE || "cadastro_clientes";

// JWT
const JWT_SECRET   = process.env.JWT_SECRET   || "dev-secret-change-me";
const JWT_EXPIRES  = process.env.JWT_EXPIRES  || "1h";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "arcardapio";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Helpers
const norm = (v) => String(v ?? "").normalize("NFKC").trim();
const safeParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const pickS = (v) => (v && typeof v === "object" && "S" in v ? v.S : v);
const getMethod = (event) => event?.requestContext?.http?.method || event?.httpMethod || "POST";

// Aceita body string JSON | body objeto | base64 | ou campos soltos (inclui {S:"..."})
function getInput(event) {
  if (!event) return {};

  if (event.body != null) {
    if (event.isBase64Encoded === true) {
      const dec = Buffer.from(String(event.body), "base64").toString("utf8");
      const p = safeParse(dec);
      if (p) return p;
    }
    if (typeof event.body === "string") {
      const p = safeParse(event.body);
      if (p) return p;
    }
    if (typeof event.body === "object") {
      return event.body;
    }
  }

  const email = pickS(event.email);
  const senha = pickS(event.senha) ?? pickS(event.password) ?? pickS(event.senhaHash);
  return { email, senha };
}

exports.handler = async (event) => {
  const method = getMethod(event);

  // Preflight CORS
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  let statusCode = 200;
  let resp = {};

  try {
    const input = getInput(event);
    const email = norm(input.email).toLowerCase();
    const senhaIn = norm(input.senha);

    if (!email || !senhaIn) {
      statusCode = 400;
      resp = { success: false, message: "email e senha são obrigatórios." };
      return { statusCode, headers: HEADERS, body: JSON.stringify(resp) };
    }

    // Busca usuário (PK = email)
    const { Item: user } = await ddb.get({
      TableName: TABLE,
      Key: { email },
      ProjectionExpression: "email, senha, senhaHash, nome, isActive"
    }).promise();

    if (!user) {
      statusCode = 401;
      resp = { success: false, message: "Usuário não encontrado." };
      return { statusCode, headers: HEADERS, body: JSON.stringify(resp) };
    }

    // Suporta "senha" (texto) ou "senhaHash" (bcrypt)
    const senhaDb = norm(user.senha ?? user.senhaHash ?? "");
    let ok = false;

    if (/^\$2[aby]\$/.test(senhaDb)) {
      // senhaHash com bcrypt
      ok = bcrypt.compareSync(senhaIn, senhaDb);
    } else {
      // legado: senha em texto (temporário)
      ok = senhaDb === senhaIn;
    }

    if (!ok) {
      statusCode = 401;
      resp = { success: false, message: "Senha inválida." };
      return { statusCode, headers: HEADERS, body: JSON.stringify(resp) };
    }

    // Gera JWT compatível com métricas_cliente
    const payload = {
      sub: email,
      aud: JWT_AUDIENCE,
      scope: "user",
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    resp = {
      success: true,
      message: "loginCliente online",
      token,
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES,
      user: {
        email,
        name: user.nome || null,
        status: user.isActive ? "ativo" : "indefinido",
      },
    };

    return { statusCode, headers: HEADERS, body: JSON.stringify(resp) };

  } catch (err) {
    console.error("Erro interno:", err);
    statusCode = 500;
    resp = {
      success: false,
      reason: "internal_server_error",
      message: "Erro interno do servidor.",
      error: process.env.NODE_ENV === "development" ? String(err?.message || err) : undefined,
    };
    return { statusCode, headers: HEADERS, body: JSON.stringify(resp) };
  }
};
