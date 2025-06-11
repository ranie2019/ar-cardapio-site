// ==================== BASE URL DO BUCKET S3 ====================
const baseURL = "https://ar-menu-models.s3.us-east-1.amazonaws.com";

// ==================== CATÁLOGO DE MODELOS 3D ====================
const models = {
  inicio: [
    { path: `${baseURL}/inicio/tabua_de_carne.glb`, price: 0.00, info: null }
  ],
  bebidas: [
    { path: `${baseURL}/bebidas/absolut_vodka_1l.glb`, price: 79.90, info: `${baseURL}/informacao/absolut_vodka_1l.json` },
    { path: `${baseURL}/bebidas/champagne.glb`, price: 98.50, info: `${baseURL}/informacao/champagne.json` },
    { path: `${baseURL}/bebidas/champagne_Lorem.glb`, price: 120.00, info: `${baseURL}/informacao/champagne_Lorem.json` },
    { path: `${baseURL}/bebidas/heineken.glb`, price: 12.90, info: `${baseURL}/informacao/heineken.json` },
    { path: `${baseURL}/bebidas/jack_daniels.glb`, price: 130.00, info: `${baseURL}/informacao/jack_daniels.json` },
    { path: `${baseURL}/bebidas/redbull.glb`, price: 9.90, info: `${baseURL}/informacao/redbull.json` }
  ],
  pizzas: [
    { path: `${baseURL}/pizzas/presunto_de_Parma_e_rúcula.glb`, price: 45.00, info: `${baseURL}/informacao/presunto_de_Parma_e_rúcula.json` },
    { path: `${baseURL}/pizzas/mussarela.glb`, price: 45.00, info: `${baseURL}/informacao/mussarela.json` },
    { path: `${baseURL}/pizzas/salami.glb`, price: 45.00, info: `${baseURL}/informacao/salami.json` }
  ],
  sobremesas: [
    { path: `${baseURL}/sobremesas/cupcake_chocolate.glb`, price: 12.00, info: `${baseURL}/informacao/cupcake_chocolate.json` },
    { path: `${baseURL}/sobremesas/rosquinha_de_chocolate.glb`, price: 10.50, info: `${baseURL}/informacao/rosquinha_de_chocolate.json` },
    { path: `${baseURL}/sobremesas/sundae.glb`, price: 10.50, info: `${baseURL}/informacao/sundae.json` }
  ],
  carnes: [
    { path: `${baseURL}/carnes/bisteca_suina_grelhada.glb`, price: 20.89, info: `${baseURL}/informacao/bisteca_suina_grelhada.json` },
    { path: `${baseURL}/carnes/costela_bovina_cozida.glb`, price: 39.90, info: `${baseURL}/informacao/costela_bovina_cozida.json` },
    { path: `${baseURL}/carnes/paleta_cordeiro.glb`, price: 37.90, info: `${baseURL}/informacao/paleta_cordeiro.json` },
    { path: `${baseURL}/carnes/lombo_de_porco.glb`, price: 35.99, info: `${baseURL}/informacao/lombo_de_porco.json` }
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

// ==================== FUNÇÃO PRINCIPAL PARA CARREGAR E EXIBIR PRODUTOS ATIVOS ====================
async function carregarEExibirProdutos() {
  const statusObjetos = await carregarStatus(); // Assume que existe essa função no escopo global

  for (const categoria in models) {
    const produtos = models[categoria];

    for (const produto of produtos) {
      const relativePath = produto.path.replace(baseURL + '/', '');
      const ativo = statusObjetos.hasOwnProperty(relativePath) ? statusObjetos[relativePath] : true;

      if (!ativo) continue;

      // Carrega JSON com informações adicionais
      produto.infoData = await carregarInfoProduto(produto.info);

      // Exibe no DOM
      exibirProdutoNaTela(produto, categoria);
    }
  }
}

// ==================== FUNÇÃO DE EXEMPLO PARA EXIBIR PRODUTO NO DOM ====================
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

// ==================== INÍCIO DO PROCESSO AO CARREGAR A PÁGINA ====================
window.addEventListener('DOMContentLoaded', () => {
  carregarEExibirProdutos();
});
