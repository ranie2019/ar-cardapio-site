// ==================== BASES DO BUCKET S3 ====================
const modelBaseURL = "https://ar-cardapio-models.s3.amazonaws.com";
const altBaseURL   = "https://ar-cardapio-models.s3.us-east-1.amazonaws.com";

// Helper para URLs com cache busting
function buildCandidates(relativePath) {
  const v = Date.now();
  return [
    `${modelBaseURL}/${relativePath}?v=${v}`,
    `${altBaseURL}/${relativePath}?v=${v}`,
  ];
}

// ==================== NOME DO RESTAURANTE ====================
function obterNomeRestaurante() {
  const urlParams = new URLSearchParams(window.location.search);
  return (urlParams.get("restaurante") || "restaurante-padrao").trim().toLowerCase();
}
const nomeRestaurante = obterNomeRestaurante();

// ==================== CATÁLOGO DE MODELOS 3D ====================
const models = {
  logo: [
    { path: `${modelBaseURL}/logo/tabua_de_carne.glb`, price: 0.00, info: null },
    { path: `${modelBaseURL}/logo/espetinho_do_gil_filho.glb`,  price: 0.00, info: null },
    { path: `${modelBaseURL}/logo/cubo.glb`,           price: 0.00, info: null }
  ],
  bebidas: [
    { path: `${modelBaseURL}/bebidas/champagne.glb`,     price: 98.50, info: `${modelBaseURL}/informacao/${nomeRestaurante}/champagne.json` },
    { path: `${modelBaseURL}/bebidas/heineken.glb`,      price: 12.90, info: `${modelBaseURL}/informacao/${nomeRestaurante}/heineken.json` },
    { path: `${modelBaseURL}/bebidas/jack_daniels.glb`,  price: 130.00, info: `${modelBaseURL}/informacao/${nomeRestaurante}/jack_daniels.json` },
    { path: `${modelBaseURL}/bebidas/redbull.glb`,       price: 9.90,  info: `${modelBaseURL}/informacao/${nomeRestaurante}/redbull.json` },
    { path: `${modelBaseURL}/bebidas/cerveja_imperio.glb`,    price: 9.90,  info: `${modelBaseURL}/informacao/${nomeRestaurante}/cerveja_imperio.json` },
    { path: `${modelBaseURL}/bebidas/vinho_pergola.glb`,      price: 9.90,  info: `${modelBaseURL}/informacao/${nomeRestaurante}/vinho_pergola.json` },
    { path: `${modelBaseURL}/bebidas/champagne_prestige.glb`, price: 19.90,  info: `${modelBaseURL}/informacao/${nomeRestaurante}/champagne_prestige.json` },
    { path: `${modelBaseURL}/bebidas/cerveja_corona.glb`,     price: 19.90,  info: `${modelBaseURL}/informacao/${nomeRestaurante}/cerveja_corona.json` },
    { path: `${modelBaseURL}/bebidas/cerveja_budweiser.glb`,  price: 19.90,  info: `${modelBaseURL}/informacao/${nomeRestaurante}/cerveja_budweiser.json` }
  ],
  pizzas: [
    // ✅ sem acento nos nomes de arquivo/chaves do S3
    { path: `${modelBaseURL}/pizzas/mussarela.glb`,                   price: 45.00, info: `${modelBaseURL}/informacao/${nomeRestaurante}/mussarela.json` },
    { path: `${modelBaseURL}/pizzas/salami.glb`,                      price: 45.00, info: `${modelBaseURL}/informacao/${nomeRestaurante}/salami.json` },
    { path: `${modelBaseURL}/pizzas/calabresa_com_queijo.glb`,                      price: 45.00, info: `${modelBaseURL}/informacao/${nomeRestaurante}/calabresa_com_queijo.json` }
  ],
  sobremesas: [
    { path: `${modelBaseURL}/sobremesas/cupcake_chocolate.glb`,       price: 12.00, info: `${modelBaseURL}/informacao/${nomeRestaurante}/cupcake_chocolate.json` },
    { path: `${modelBaseURL}/sobremesas/rosquinha_de_chocolate.glb`,  price: 10.50, info: `${modelBaseURL}/informacao/${nomeRestaurante}/rosquinha_de_chocolate.json` },
    { path: `${modelBaseURL}/sobremesas/sundae.glb`,                  price: 10.50, info: `${modelBaseURL}/informacao/${nomeRestaurante}/sundae.json` },
    { path: `${modelBaseURL}/sobremesas/late.glb`,                    price: 10.50, info: `${modelBaseURL}/informacao/${nomeRestaurante}/late.json` }
  ],
  carnes: [
    { path: `${modelBaseURL}/carnes/bisteca_suina_grelhada.glb`,    price: 20.89, info: `${modelBaseURL}/informacao/${nomeRestaurante}/bisteca_suina_grelhada.json` },
    { path: `${modelBaseURL}/carnes/costela_bovina_grelhada.glb`,   price: 39.90, info: `${modelBaseURL}/informacao/${nomeRestaurante}/costela_bovina_grelhada.json` },
    { path: `${modelBaseURL}/carnes/paleta_de_cordeiro.glb`,        price: 37.90, info: `${modelBaseURL}/informacao/${nomeRestaurante}/paleta_de_cordeiro.json` },
    { path: `${modelBaseURL}/carnes/lombo_de_porco.glb`,            price: 35.99, info: `${modelBaseURL}/informacao/${nomeRestaurante}/lombo_de_porco.json` },
    { path: `${modelBaseURL}/carnes/coxa_de_frango.glb`,            price: 35.99, info: `${modelBaseURL}/informacao/${nomeRestaurante}/coxa_de_frango.json` },
  ],
  lanches: [],
  porcoes: [],
  diversos: [
    { path: `${modelBaseURL}/diversos/chefe.glb`, price: 0.00, info: null },
  ]
};

// ==================== CONFIGURAÇÕES CENTRALIZADAS ====================
const CONFIG_PATH = `informacao/${nomeRestaurante}/config.json`;
const ITEMS_PATH  = `informacao/${nomeRestaurante}/itens.json`;

// ==================== UTILS ====================
function normalizar(str) {
  return (str || "")
    .toString()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// chave canônica do item a partir do path (aceita as duas bases)
function keyFromPath(fullPath) {
  const base1 = modelBaseURL + "/";
  const base2 = altBaseURL + "/";
  let rel = fullPath;
  if (rel.startsWith(base1)) rel = rel.slice(base1.length);
  if (rel.startsWith(base2)) rel = rel.slice(base2.length);
  try { rel = decodeURI(rel); } catch {}
  return rel.toLowerCase();
}

// ==================== CONTROLE DE VISIBILIDADE (categorias) ====================
const CATEGORIAS_LABELS = {
  logo:       'Logo',
  bebidas:    'Bebidas',
  pizzas:     'Pizzas',
  sobremesas: 'Sobremesas',
  carnes:     'Carnes',
  lanches:    'Lanches',
  porcoes:    'Porções',
  Diversos:    'Diversos'
};

function etiquetarBotoesCategoria() {
  const labelsNorm = Object.fromEntries(
    Object.entries(CATEGORIAS_LABELS).map(([k, v]) => [k, normalizar(v)])
  );
  document.querySelectorAll('button, a, [role="button"], .btn, .menu-item, li').forEach((el) => {
    if (el.getAttribute('data-categoria')) return;
    const t = normalizar(el.textContent || el.innerText || "");
    for (const [cat, labelNorm] of Object.entries(labelsNorm)) {
      if (t === labelNorm) el.setAttribute('data-categoria', cat);
    }
  });
}

function esconderCategoria(categoria, label) {
  document.querySelectorAll(`[data-categoria="${categoria}"]`).forEach(el => {
    el.classList.add('categoria-desativada');
    el.style.display = 'none';
  });
  const alvoNorm = normalizar(label);
  document.querySelectorAll('button, a, [role="button"], .btn, .menu-item, li').forEach((el) => {
    const t = normalizar(el.textContent || el.innerText || "");
    if (t === alvoNorm) {
      el.classList.add('categoria-desativada');
      el.style.display = 'none';
    }
  });
}

function aplicarVisibilidade(config) {
  if (!config) return;
  etiquetarBotoesCategoria();
  Object.entries(config).forEach(([categoria, ativo]) => {
    if (ativo === false) {
      const label = CATEGORIAS_LABELS[categoria] || categoria;
      esconderCategoria(categoria, label);
    }
  });
}

// ==================== FETCH JSON ====================
async function fetchWithFallback(relativePath) {
  const urls = buildCandidates(relativePath);
  let lastErr;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
      if (response.ok) return await response.json();
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function carregarConfiguracaoDoRestaurante() {
  try {
    const config = await fetchWithFallback(CONFIG_PATH);
    if (!config || typeof config !== 'object') throw new Error('Config inválida');
    console.log('✅ Configurações carregadas:', config);
    return config;
  } catch (e) {
    console.warn('⚠️ Usando configuração padrão. Motivo:', e.message);
    return { logo: true, bebidas:true, pizzas:true, sobremesas:true, carnes:true, lanches:true, porcoes:true };
  }
}

async function carregarStatus() {
  try {
    // itens.json = listas de DESATIVADOS
    const itens = await fetchWithFallback(ITEMS_PATH);
    if (!itens) throw new Error('Lista de itens vazia');

    const desativados = {};
    for (const categoria in itens) {
      (itens[categoria] || []).forEach(slug => {
        const slugLow = (slug || '').toString().toLowerCase();
        const withAccent    = `${categoria}/${slugLow}.glb`;
        const noAccentSlug  = normalizar(slugLow);
        const noAccentKey   = `${categoria}/${noAccentSlug}.glb`;
        desativados[withAccent]  = true;
        desativados[noAccentKey] = true;
      });
    }
    console.log('✅ Itens desativados (keys):', desativados);
    return desativados; // true = desativado
  } catch (e) {
    console.warn('⚠️ Nenhum item desativado. Motivo:', e.message);
    return {};
  }
}

// ============= FILTRO GLOBAL DO CATÁLOGO (impacta o app todo) =============
function filtrarCatalogoPorConfigEStatus(config, desativadosMap) {
  for (const categoria of Object.keys(models)) {
    if (config[categoria] === false) {
      models[categoria] = [];
      continue;
    }
    const lista = models[categoria] || [];
    const filtrados = [];
    for (const produto of lista) {
      const key = keyFromPath(produto.path);
      if (desativadosMap[key]) continue; // item desativado → pula
      filtrados.push(produto);
    }
    models[categoria] = filtrados;
  }
  console.log('🧹 Catálogo filtrado:', models);
}

// ==================== MANIPULAÇÃO DE DADOS ====================
function formatProductName(filePath) {
  return filePath.split('/').pop()
    .replace('.glb', '')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

async function carregarInfoProduto(infoUrl) {
  if (!infoUrl) return null;
  try {
    const url = infoUrl + (infoUrl.includes('?') ? '&' : '?') + `v=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (e) {
    console.error('Erro ao carregar informações:', e);
    return null;
  }
}

// ==================== RENDERIZAÇÃO (grid opcional) ====================
async function carregarEExibirProdutos() {
  try {
    const [config, desativadosMap] = await Promise.all([
      carregarConfiguracaoDoRestaurante(),
      carregarStatus()
    ]);

    // 1) aplica nas categorias (UI)
    aplicarVisibilidade(config);
    setTimeout(() => aplicarVisibilidade(config), 800);

    // 2) filtra o OBJETO models global (impacta o app todo)
    filtrarCatalogoPorConfigEStatus(config, desativadosMap);

    // 3) grid de produtos (se existir na página)
    const container = document.getElementById('produtos-container');
    if (!container) return;
    container.innerHTML = '';

    for (const categoria in models) {
      if (config[categoria] === false) continue;

      for (const produto of models[categoria]) {
        const key = keyFromPath(produto.path);
        if (desativadosMap[key]) continue;

        produto.infoData = await carregarInfoProduto(produto.info);

        const card = document.createElement('div');
        card.className = 'produto-card';
        card.innerHTML = `
          <h3>${formatProductName(produto.path)}</h3>
          <p>R$ ${produto.price.toFixed(2)}</p>
          <p>${produto.infoData?.descricao || 'Sem descrição'}</p>
        `;
        container.appendChild(card);
      }
    }
  } catch (e) {
    console.error('Falha ao carregar produtos:', e);
  }
}

// ==================== INICIALIZAÇÃO ====================
document.addEventListener('DOMContentLoaded', carregarEExibirProdutos);
