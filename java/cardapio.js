// ==============================
// cardapio.js – lógica do app com preços configuráveis
// ==============================

// 1) Configurações
const nomeRestaurante = 'restaurante-001';
let dadosPersonalizados = {};   // cache local dos preços e descrições

// 2) Dados do cardápio (nomes exibidos → arquivos .glb derivados)
const objetos3D = {
  bebidas: [
    'Heineken',
    'Redbull',
    'Absolut Vodka',
    'Champagne Lorem',
    'Jack Daniels',
    'Champagne'
  ],
  pizzas: [
    'Presunto de Parma e Rúcula',
    'Mussarela',
    'Salami'
  ],
  carnes: [
    'Bisteca Suina Grelhada',
    'Costela Bovina Cozida',
    'Paleta Cordeiro',
    'Lombo de Porco'
  ],
  lanches: [
    'Hamburguer',
    'Cheeseburger',
    'Hot Dog'
  ],
  sobremesas: [
    'Sundae',
    'Cupcake de Chocolate',
    'Rosquinha de Chocolate'
  ],
  porcoes: [
    'Batata Frita',
    'Nuggets',
    'Aneis de Cebola'
  ],
};

// 3) Busca no S3 os dados salvos pelo painel
async function carregarConfigs() {
  try {
    const url = `https://ar-menu-models.s3.amazonaws.com/configuracoes/${nomeRestaurante}-dados.json?v=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) return;
    dadosPersonalizados = await res.json();
  } catch (err) {
    console.warn('Não há dados personalizados:', err);
  }
}

// 4) Formata o preço para BRL, ou retorna um padrão
function exibirPreco(categoria, nome, defaultPreco = 0) {
  const chave = `${categoria}/${nome.toLowerCase().replace(/\s+/g, '_')}`;
  const preco = dadosPersonalizados[chave]?.preco ?? defaultPreco;
  return preco.toLocaleString('pt-BR', {
    style:    'currency',
    currency: 'BRL'
  });
}

// 5) Ao carregar a página, busca configs e inicializa o app
document.addEventListener('DOMContentLoaded', async () => {
  await carregarConfigs();
  inicializarApp();
});

function inicializarApp() {
  // elementos principais
  const btnsCategoria = document.querySelectorAll('.btn-categoria');  // ajuste se necessário
  const priceTag       = document.getElementById('priceTag');         // elemento que mostra R$ xx,xx
  const modelNameTag   = document.getElementById('modelNameTag');     // elemento que mostra o nome do item
  const setaPrev       = document.getElementById('setaPrev');
  const setaNext       = document.getElementById('setaNext');

  let categoriaAtual = null;
  let indexAtual     = 0;

  // quando clica numa categoria, exibe o primeiro item
  btnsCategoria.forEach(btn => {
    btn.addEventListener('click', () => {
      categoriaAtual = btn.dataset.categoria;
      indexAtual     = 0;
      renderizarItem();
    });
  });

  // navega para o item anterior
  setaPrev.addEventListener('click', () => {
    if (!categoriaAtual) return;
    indexAtual = (indexAtual - 1 + objetos3D[categoriaAtual].length)
               % objetos3D[categoriaAtual].length;
    renderizarItem();
  });

  // navega para o próximo item
  setaNext.addEventListener('click', () => {
    if (!categoriaAtual) return;
    indexAtual = (indexAtual + 1) % objetos3D[categoriaAtual].length;
    renderizarItem();
  });

  // função de renderização
  function renderizarItem() {
    const nome = objetos3D[categoriaAtual][indexAtual];

    // 5.1) Atualiza o texto do nome e do preço
    modelNameTag.textContent = nome;
    priceTag.textContent     = exibirPreco(categoriaAtual, nome);

    // 5.2) Atualiza a cena 3D (A-Frame)
    const cena = document.querySelector('a-scene');
    if (cena) {
      const existing = cena.querySelector('a-gltf-model');
      if (existing) existing.remove();

      const modelURL = `https://ar-menu-models.s3.amazonaws.com/${categoriaAtual}/`
                     + nome.toLowerCase().replace(/\s+/g, '_') + '.glb';

      const entity = document.createElement('a-entity');
      entity.setAttribute('gltf-model', modelURL);
      entity.setAttribute('animation', 'property: rotation; to: 0 360 0; loop: true; dur: 5000; easing: linear');
      entity.setAttribute('position', '0 1 -3');
      entity.setAttribute('scale', '1 1 1');
      cena.appendChild(entity);
    }
  }
}