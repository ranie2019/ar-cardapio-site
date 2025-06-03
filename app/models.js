// ==================== CATÁLOGO DE MODELOS 3D ====================

/**
 * Objeto que organiza todos os modelos disponíveis por categoria.
 * Cada categoria (ex: 'bebidas', 'pizzas') contém um array de objetos,
 * onde cada objeto representa um modelo 3D com:
 * - path: caminho do arquivo .glb no S3
 * - price: preço do produto
 * - info: caminho do arquivo .txt com informações adicionais no S3
 */

const baseURL = "https://ar-menu-models.s3.amazonaws.com";

const models = {
  inicio: [
    { path: `${baseURL}/inicio/tabua_de_carne.glb`, price: 0.00, info: null }
  ],
  bebidas: [
    { path: `${baseURL}/bebidas/absolut_vodka_1l.glb`, price: 79.90, info: `${baseURL}/informacoes/absolut_vodka_1l.txt` },
    { path: `${baseURL}/bebidas/champagne_Lorem.glb`, price: 120.00, info: `${baseURL}/informacoes/champagne_lorem.txt` },
    { path: `${baseURL}/bebidas/champagne.glb`, price: 98.50, info: `${baseURL}/informacoes/champagne.txt` },
    { path: `${baseURL}/bebidas/heineken.glb`, price: 12.90, info: `${baseURL}/informacoes/heineken.txt` },
    { path: `${baseURL}/bebidas/jack_daniels.glb`, price: 130.00, info: `${baseURL}/informacoes/jack_daniels.txt` },
    { path: `${baseURL}/bebidas/redbull.glb`, price: 9.90, info: `${baseURL}/informacoes/redbull.txt` }
  ],
  pizzas: [
    { path: `${baseURL}/pizzas/presunto_de_Parma_e_rúcula.glb`, price: 45.00, info: `${baseURL}/informacoes/presunto_de_Parma_e_rúcula.txt` },
    { path: `${baseURL}/pizzas/mussarela.glb`, price: 45.00, info: `${baseURL}/informacoes/mussarela.txt` },
    { path: `${baseURL}/pizzas/salami.glb`, price: 45.00, info: `${baseURL}/informacoes/salami.txt` }
  ],
  sobremesas: [
    { path: `${baseURL}/sobremesas/cupcake_chocolate.glb`, price: 12.00, info: `${baseURL}/informacoes/cupcake_chocolate.txt` },
    { path: `${baseURL}/sobremesas/rosquinha_de_chocolate.glb`, price: 10.50, info: `${baseURL}/informacoes/rosquinha_de_chocolate.txt` },
    { path: `${baseURL}/sobremesas/sundae.glb`, price: 10.50, info: `${baseURL}/informacoes/sundae.txt` }
  ],
  carnes: [
    { path: `${baseURL}/carnes/bisteca_suina_grelhada.glb`, price: 20.89, info: `${baseURL}/informacoes/bisteca_suina_grelhada.txt` },
    { path: `${baseURL}/carnes/costela_bovina_cozida.glb`, price: 39.90, info: `${baseURL}/informacoes/costela_bovina_cozida.txt` },
    { path: `${baseURL}/carnes/paleta_cordeiro.glb`, price: 37.90, info: `${baseURL}/informacoes/paleta_cordeiro.txt` },
    { path: `${baseURL}/carnes/lombo_de_porco.glb`, price: 35.99, info: `${baseURL}/informacoes/lombo_de_porco.txt` }
  ]
};


// ==================== FORMATAÇÃO DE NOMES ====================

/**
 * Formata dinamicamente o nome do produto com base no caminho do arquivo.
 * Exemplo: '.../absolut_vodka_1l.glb' => 'Absolut Vodka 1L'
 *
 * @param {string} filePath - Caminho completo do arquivo .glb
 * @returns {string} - Nome formatado do produto para exibição
 */
function formatProductName(filePath) {
  // Extrai apenas o nome do arquivo (sem caminho e sem extensão)
  let name = filePath.split('/').pop().replace('.glb', '');

  // Substitui underlines e hífens por espaços
  name = name.replace(/[_-]/g, ' ');

  // Capitaliza a primeira letra de cada palavra
  name = name.replace(/\b\w/g, char => char.toUpperCase());

  return name;
}
