// ==============================
// cardapio.js – lógica do app com preços configuráveis
// ==============================

"use strict";

// ---------- Bases S3 ----------
const MODEL_BASES = [
  "https://ar-cardapio-models.s3.amazonaws.com",
  "https://ar-cardapio-models.s3.us-east-1.amazonaws.com",
];
const INFO_BASES = MODEL_BASES; // JSONs no mesmo bucket

// ---------- Helpers ----------
function slugify(str = "") {
  return str
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}
function fmtBRL(n = 0) {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
function getRestaurant() {
  const q = new URLSearchParams(location.search);
  const fromQS = (q.get("restaurante") || "").trim().toLowerCase();
  const fromLS = (localStorage.getItem("restaurante") || "").trim().toLowerCase();
  const out = fromQS || fromLS || "restaurante-001";
  localStorage.setItem("restaurante", out);
  return out;
}

// Nome do restaurante
const nomeRestaurante = getRestaurant();

// cache de { "<categoria>/<slug>" : { preco, descricao, ... } }
let dadosPersonalizados = {};
// mapa de itens desativados: { "categoria/slug" : true }
const desativadosMap = {};

// ------------------- Catálogo local (nomes → arquivos .glb) -------------------
const objetos3D = {
  // "logo" decide apenas o que aparece ao iniciar (não há botão no app para logo)
  logo: ["Tabua de Carne", "Cubo"],

  bebidas: ["Heineken", "Redbull", "Absolut Vodka", "Jack Daniels", "Champagne", "Vinho Pergola", "Cerveja Imperio", "Champagne Prestige", "Cerveja Corona", "Cerveja Budweiser"],
  pizzas: ["Presunto de Parma e Rúcula", "Mussarela", "Salami"],
  carnes: ["Bisteca Suina Grelhada", "Costela Bovina Cozida", "Paleta Cordeiro", "Lombo de Porco"],
  lanches: ["Hamburguer", "Cheeseburger", "Hot Dog"],
  sobremesas: ["Sundae", "Cupcake de Chocolate", "Rosquinha de Chocolate", "Late"],
  porcoes: ["Batata Frita", "Nuggets", "Aneis de Cebola"],
};

// ===================== Carregadores de S3 =====================
async function fetchWithBases(relativePath) {
  for (const base of INFO_BASES) {
    const url = `${base}/${relativePath}?v=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: "no-store", mode: "cors" });
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  return null; // silencioso
}

async function pickFirstReachable(urls) {
  // Tenta HEAD; se der CORS, usa a 1ª
  for (const u of urls) {
    try {
      const r = await fetch(u, { method: "HEAD", mode: "cors", cache: "no-store" });
      if (r.ok) return u;
    } catch (_) {}
  }
  return urls[0];
}

function buildModelCandidates(categoria, nome) {
  const file = `${slugify(nome)}.glb`;
  return MODEL_BASES.map((b) => `${b}/${categoria}/${file}`);
}
function buildLogoCandidatesFromSlug(slug) {
  return MODEL_BASES.map((b) => `${b}/logo/${slug}.glb`);
}

// ------------------- Itens desativados -------------------
async function carregarItensDesativados() {
  // informacao/<restaurante>/itens.json -> { categoria: [slug, ...] }
  const rel = `informacao/${nomeRestaurante}/itens.json`;
  const json = await fetchWithBases(rel);
  if (!json) return;

  for (const categoria in json) {
    (json[categoria] || []).forEach((slug) => {
      const s = String(slug || "").toLowerCase();
      desativadosMap[`${categoria}/${s}`] = true;
    });
  }
}
function itemDesativado(categoria, nome) {
  return !!desativadosMap[`${categoria}/${slugify(nome)}`];
}
function firstActiveIndex(categoria) {
  const lista = objetos3D[categoria] || [];
  for (let i = 0; i < lista.length; i++) {
    if (!itemDesativado(categoria, lista[i])) return i;
  }
  return 0;
}
function nextActiveIndex(lista, start, categoria, delta) {
  if (!lista.length) return 0;
  let i = start;
  let safety = 0;
  do {
    i = (i + delta + lista.length) % lista.length;
    safety++;
  } while (itemDesativado(categoria, lista[i]) && safety <= lista.length + 1);
  return i;
}

// ------------------- Preço/descrição por item -------------------
async function carregarInfoItem(categoria, nome) {
  const key = `${categoria}/${slugify(nome)}`;
  if (dadosPersonalizados[key]) return dadosPersonalizados[key];

  const rel = `informacao/${nomeRestaurante}/${slugify(nome)}.json`;
  const data = await fetchWithBases(rel);
  if (data) dadosPersonalizados[key] = data;
  return data || null;
}

// ===================== Inicialização do app =====================
document.addEventListener("DOMContentLoaded", async () => {
  // garante que o preço começa escondido (evita "R$ 0,00" piscando)
  const priceTagInit = document.getElementById("priceTag");
  if (priceTagInit) priceTagInit.style.display = "none";

  await carregarItensDesativados();
  inicializarApp();
});

function inicializarApp() {
  const btnsCategoria = document.querySelectorAll(".btn-categoria"); // NÃO incluir "logo" no app
  const priceTag = document.getElementById("priceTag");
  const modelNameTag = document.getElementById("modelNameTag");
  const setaPrev = document.getElementById("setaPrev");
  const setaNext = document.getElementById("setaNext");

  const setPrecoVisivel = (visivel) => {
    if (priceTag) priceTag.style.display = visivel ? "" : "none";
  };

  let categoriaAtual = null;
  let indexAtual = 0;

  // ---------- LOGO inicial (nome + modelo, sem preço) ----------
  mostrarLogoInicial();

  // ---------- Clique nas categorias ----------
  btnsCategoria.forEach((btn) => {
    const cat = btn?.dataset?.categoria;
    if (!cat || cat === "logo") return; // ignora se por acaso existir

    btn.addEventListener("click", () => {
      categoriaAtual = cat;
      indexAtual = firstActiveIndex(categoriaAtual);
      renderizarItem();
    });
  });

  // ---------- Navegação ----------
  setaPrev?.addEventListener("click", () => {
    if (!categoriaAtual) return;
    const lista = objetos3D[categoriaAtual] || [];
    indexAtual = nextActiveIndex(lista, indexAtual, categoriaAtual, -1);
    renderizarItem();
  });

  setaNext?.addEventListener("click", () => {
    if (!categoriaAtual) return;
    const lista = objetos3D[categoriaAtual] || [];
    indexAtual = nextActiveIndex(lista, indexAtual, categoriaAtual, +1);
    renderizarItem();
  });

  // ---------- Renderização (categorias normais) ----------
  async function renderizarItem() {
    const lista = objetos3D[categoriaAtual] || [];
    const nome = lista[indexAtual];
    if (!nome) return;

    if (modelNameTag) modelNameTag.textContent = nome;
    setPrecoVisivel(true);
    if (priceTag) priceTag.textContent = ""; // enquanto carrega

    carregarInfoItem(categoriaAtual, nome).then((info) => {
      const preco = info && typeof info.preco === "number" ? info.preco : 0;
      if (modelNameTag && modelNameTag.textContent === nome && priceTag) {
        priceTag.textContent = fmtBRL(preco);
      }
    });

    const cena = document.querySelector("a-scene");
    if (!cena) return;
    const existing = cena.querySelector("a-gltf-model, a-entity[gltf-model]");
    if (existing) existing.remove();

    const candidates = buildModelCandidates(categoriaAtual, nome);
    const modelURL = await pickFirstReachable(candidates);

    const entity = document.createElement("a-entity");
    entity.setAttribute("gltf-model", `url(${modelURL})`);
    entity.setAttribute(
      "animation",
      "property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear"
    );
    entity.setAttribute("position", "0 1 -3");
    entity.setAttribute("scale", "1 1 1");
    cena.appendChild(entity);
  }

  // ---------- Funções de escolha do logo ----------
  function logoEstaDesativado(slug) {
    return !!desativadosMap[`logo/${String(slug || "").toLowerCase()}`];
  }

  function getLogoInicial() {
    // 1) slug salvo na Home (se existir e não estiver desativado)
    const saved = localStorage.getItem("logoSelecionado");
    if (saved && !logoEstaDesativado(saved)) {
      const nomeMatch =
        (objetos3D.logo || []).find((n) => slugify(n) === saved) || saved.replace(/_/g, " ");
      return { slug: saved, nome: nomeMatch };
    }

    // 2) primeiro logo ATIVO conforme itens.json
    const lista = objetos3D.logo || [];
    for (const nome of lista) {
      const s = slugify(nome);
      if (!logoEstaDesativado(s)) return { slug: s, nome };
    }

    // 3) fallback absoluto
    const nomeFallback = lista[0] || "Tabua de Carne";
    return { slug: slugify(nomeFallback), nome: nomeFallback };
  }

  // ---------- Mostra LOGO na abertura ----------
  async function mostrarLogoInicial() {
    const cena = document.querySelector("a-scene");
    if (!cena) return;

    const { slug, nome } = getLogoInicial();

    // Nome visível, preço escondido
    if (modelNameTag) modelNameTag.textContent = nome;
    setPrecoVisivel(false);

    const existing = cena.querySelector("a-gltf-model, a-entity[gltf-model]");
    if (existing) existing.remove();

    const candidates = buildLogoCandidatesFromSlug(slug);
    const modelURL = await pickFirstReachable(candidates);

    const entity = document.createElement("a-entity");
    entity.setAttribute("gltf-model", `url(${modelURL})`);
    entity.setAttribute(
      "animation",
      "property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear"
    );
    entity.setAttribute("position", "0 1 -3");
    entity.setAttribute("scale", "1 1 1");
    cena.appendChild(entity);
  }
}
