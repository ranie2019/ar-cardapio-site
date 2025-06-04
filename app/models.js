// ==================== CATÁLOGO DE MODELOS 3D ====================

/**
 * Objeto que organiza todos os modelos disponíveis por categoria.
 * Cada categoria (ex: 'bebidas', 'pizzas') contém um array de objetos,
 * onde cada objeto representa um modelo 3D com:
 * - path: caminho do arquivo .glb
 * - price: preço do produto
 * - info: caminho do arquivo .txt com informações adicionais
 */
const models = {
  inicio: [
    { path: 'objetos3d/inicio/tabua_de_carne.glb', price: 0.00, info: null }
  ],
  bebidas: [
    { path: 'objetos3d/bebidas/absolut_vodka_1l.glb', price: 79.90, info: 'informacoes/absolut_vodka_1l.txt' },
    { path: 'objetos3d/bebidas/champagne_Lorem.glb', price: 120.00, info: 'informacoes/champagne_lorem.txt' },
    { path: 'objetos3d/bebidas/champagne.glb', price: 98.50, info: 'informacoes/champagne.txt' },
    { path: 'objetos3d/bebidas/heineken.glb', price: 12.90, info: 'informacoes/heineken.txt' },
    { path: 'objetos3d/bebidas/jack_daniels.glb', price: 130.00, info: 'informacoes/jack_daniels.txt' },
    { path: 'objetos3d/bebidas/redbull.glb', price: 9.90, info: 'informacoes/redbull.txt' }
  ],
  pizzas: [
    { path: 'objetos3d/pizzas/presunto_de_Parma_e_rúcula.glb', price: 45.00, info: 'informacoes/presunto_de_Parma_e_rúcula.txt' },
    { path: 'objetos3d/pizzas/mussarela.glb', price: 45.00, info: 'informacoes/mussarela.txt' },
    { path: 'objetos3d/pizzas/salami.glb', price: 45.00, info: 'informacoes/salami.txt' },
  ],
  sobremesas: [
    { path: 'objetos3d/sobremesas/cupcake_chocolate.glb', price: 12.00, info: 'informacoes/cupcake_chocolate.txt' },
    { path: 'objetos3d/sobremesas/rosquinha_de_chocolate.glb', price: 10.50, info: 'informacoes/rosquinha_de_chocolate.txt' },
    { path: 'objetos3d/sobremesas/sundae.glb', price: 10.50, info: 'informacoes/sundae.txt' }
  ],
  carnes: [
    { path: 'objetos3d/carnes/bisteca_suina_grelhada.glb', price: 20.89, info: 'informacoes/bisteca_suina_grelhada.txt' },
    { path: 'objetos3d/carnes/costela_bovina_cozida.glb', price: 39.90, info: 'informacoes/costela_bovina_cozida.txt' },
    { path: 'objetos3d/carnes/paleta_cordeiro.glb', price: 37.90, info: 'informacoes/paleta_cordeiro.txt' },
    { path: 'objetos3d/carnes/lombo_porco.glb', price: 35.99, info: 'informacoes/lombo_porco.txt' }
  ]
};



// ==================== FORMATAÇÃO DE NOMES ====================

/**
 * Formata dinamicamente o nome do produto com base no caminho do arquivo.
 * Exemplo: 'objetos3d/bebidas/absolut_vodka_1l.glb' => 'Absolut Vodka 1L'
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