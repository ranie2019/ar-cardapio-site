// ==================== BASE URL DO BUCKET S3 ====================
const modelBaseURL = "https://ar-menu-models.s3.amazonaws.com";

// ==================== NOME DO RESTAURANTE PARA CONFIG PERSONALIZADA ====================
const nomeRestaurante = 'restaurante-001';

// ==================== CATÁLOGO DE MODELOS 3D ====================
const models = {
  inicio: [
    { path: `${modelBaseURL}/inicio/tabua_de_carne.glb`, price: 0.00, info: null }
  ],
  bebidas: [
    { path: `${modelBaseURL}/bebidas/absolut_vodka.glb`, price: 79.90, info: `${modelBaseURL}/informacao/absolut_vodka.json` },
    { path: `${modelBaseURL}/bebidas/champagne.glb`, price: 98.50, info: `${modelBaseURL}/informacao/champagne.json` },
    { path: `${modelBaseURL}/bebidas/champagne_Lorem.glb`, price: 120.00, info: `${modelBaseURL}/informacao/champagne_Lorem.json` },
    { path: `${modelBaseURL}/bebidas/heineken.glb`, price: 12.90, info: `${modelBaseURL}/informacao/heineken.json` },
    { path: `${modelBaseURL}/bebidas/jack_daniels.glb`, price: 130.00, info: `${modelBaseURL}/informacao/jack_daniels.json` },
    { path: `${modelBaseURL}/bebidas/redbull.glb`, price: 9.90, info: `${modelBaseURL}/informacao/redbull.json` }
  ],
  pizzas: [
    { path: `${modelBaseURL}/pizzas/presunto_de_Parma_e_rúcula.glb`, price: 45.00, info: `${modelBaseURL}/informacao/presunto_de_Parma_e_rúcula.json` },
    { path: `${modelBaseURL}/pizzas/mussarela.glb`, price: 45.00, info: `${modelBaseURL}/informacao/mussarela.json` },
    { path: `${modelBaseURL}/pizzas/salami.glb`, price: 45.00, info: `${modelBaseURL}/informacao/salami.json` }
  ],
  sobremesas: [
    { path: `${modelBaseURL}/sobremesas/cupcake_chocolate.glb`, price: 12.00, info: `${modelBaseURL}/informacao/cupcake_chocolate.json` },
    { path: `${modelBaseURL}/sobremesas/rosquinha_de_chocolate.glb`, price: 10.50, info: `${modelBaseURL}/informacao/rosquinha_de_chocolate.json` },
    { path: `${modelBaseURL}/sobremesas/sundae.glb`, price: 10.50, info: `${modelBaseURL}/informacao/sundae.json` }
  ],
  carnes: [
    { path: `${modelBaseURL}/carnes/bisteca_suina_grelhada.glb`, price: 20.89, info: `${modelBaseURL}/informacao/bisteca_suina_grelhada.json` },
    { path: `${modelBaseURL}/carnes/costela_bovina_cozida.glb`, price: 39.90, info: `${modelBaseURL}/informacao/costela_bovina_cozida.json` },
    { path: `${modelBaseURL}/carnes/paleta_cordeiro.glb`, price: 37.90, info: `${modelBaseURL}/informacao/paleta_cordeiro.json` },
    { path: `${modelBaseURL}/carnes/lombo_de_porco.glb`, price: 35.99, info: `${modelBaseURL}/informacao/lombo_de_porco.json` }
  ]
};

// ==================== FORMATAÇÃO DE NOMES ====================
function formatProductName(filePath) {
  let name = filePath.split('/').pop().replace('.glb', '');
  name = name.replace(/[_-]/g, ' ');
  name = name.replace(/\b\w/g, char => char.toUpperCase());
  return name;
}

// ==================== FUNÇÃO PARA CARREGAR JSON DE INFORMAÇÕES ====================
async function carregarInfoProduto(infoUrl) {
  if (!infoUrl) return null;

  try {
    const response = await fetch(infoUrl);
    if (!response.ok) throw new Error('Erro ao carregar JSON: ' + response.status);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Erro ao carregar info do produto:', error);
    return null;
  }
}

// ==================== CARREGAR CONFIGURAÇÃO DO RESTAURANTE ====================
async function carregarConfiguracaoDoRestaurante() {
  const url = `${modelBaseURL}/configuracoes/${nomeRestaurante}.json`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao carregar config');
    const config = await response.json();
    return config;
  } catch (e) {
    console.warn('Sem configuração personalizada, usando padrão.');
    return null;
  }
}
async function carregarStatus() {
  const url = `https://ar-menu-models.s3.amazonaws.com/configuracoes/restaurante-001-itens.json?v=${Date.now()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Erro ao carregar status dos itens');
    const json = await response.json();

    // Converte para estrutura: { 'categoria/nome.glb': false }
    const status = {};
    for (const categoria in json) {
      if (Array.isArray(json[categoria])) {
        for (const nome of json[categoria]) {
          const nomeArquivo = nome.trim().toLowerCase().replace(/\s+/g, '_') + '.glb';
          status[`${categoria}/${nomeArquivo}`] = false;
        }
      }
    }
    return status;
  } catch (e) {
    console.warn('⚠️ Falha ao carregar status dos itens ocultos:', e);
    return {}; // assume tudo visível
  }
}

// ==================== FUNÇÃO PRINCIPAL PARA CARREGAR E EXIBIR PRODUTOS ATIVOS ====================
async function carregarEExibirProdutos() {
  const statusObjetos = await carregarStatus(); // Assume que essa função está definida em outro script
  const configuracao = await carregarConfiguracaoDoRestaurante();

  for (const categoria in models) {
    if (configuracao && configuracao[categoria] === false) continue;

    const produtos = models[categoria];

    for (const produto of produtos) {
      const relativePath = produto.path.replace(modelBaseURL + '/', '');
      const ativo = statusObjetos.hasOwnProperty(relativePath) ? statusObjetos[relativePath] : true;

      if (!ativo) continue;

      produto.infoData = await carregarInfoProduto(produto.info);
      exibirProdutoNaTela(produto, categoria);
    }
  }
}

// ==================== FUNÇÃO DE EXIBIÇÃO NO DOM ====================
function exibirProdutoNaTela(produto, categoria) {
  const container = document.getElementById('produtos-container');
  if (!container) return;

  const card = document.createElement('div');
  card.classList.add('produto-card');

  const nome = document.createElement('h3');
  nome.textContent = formatProductName(produto.path);

  const preco = document.createElement('p');
  preco.textContent = `R$ ${produto.price.toFixed(2)}`;

  const descricao = document.createElement('p');
  descricao.textContent = produto.infoData?.descricao || 'Sem descrição disponível';

  card.appendChild(nome);
  card.appendChild(preco);
  card.appendChild(descricao);

  container.appendChild(card);
}

// ==================== INÍCIO DO PROCESSO ====================
window.addEventListener('DOMContentLoaded', () => {
  carregarEExibirProdutos();
});