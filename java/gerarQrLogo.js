// ===============================
// gerarQrLogo.js (versão atualizada 2025)
// ===============================

/**
 * Gera QRCode em um container e desenha um logo central.
 * Mantém compatibilidade com o uso atual: basta passar `texto`.
 */
function gerarQrComLogo({
  containerId = 'qrContainer',
  texto,
  tamanho = 512,
  logoUrl,
  logoProporcao = 0.22, // 22% da largura
  margem = 4
}) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Container não encontrado:', containerId);
    return;
  }
  if (!texto) {
    console.error('Parâmetro "texto" é obrigatório para gerar o QR.');
    container.innerHTML = '';
    return;
  }

  container.innerHTML = ''; // limpa

  // Cria QR base (usa a lib qrcodejs)
  new QRCode(container, {
    text: texto,
    width: tamanho,
    height: tamanho,
    correctLevel: QRCode.CorrectLevel.H,
    colorDark: '#000000',
    colorLight: '#ffffff'
  });

  // Aguarda o QR ser renderizado (canvas ou img)
  setTimeout(() => {
    let el = container.querySelector('canvas') || container.querySelector('img');
    if (!el) return;

    // Se gerou imagem, converte para canvas
    if (el.tagName.toLowerCase() === 'img') {
      const canvas = document.createElement('canvas');
      canvas.width = tamanho;
      canvas.height = tamanho;
      const ctx = canvas.getContext('2d');

      const tmp = new Image();
      tmp.onload = () => {
        ctx.drawImage(tmp, 0, 0, tamanho, tamanho);
        desenharLogo(ctx);
        container.innerHTML = '';
        container.appendChild(canvas);
      };
      tmp.src = el.src;
      return;
    }

    // Se já veio como canvas
    if (el.tagName.toLowerCase() === 'canvas') {
      const ctx = el.getContext('2d');
      desenharLogo(ctx);
    }

    // Desenha o logo central
    function desenharLogo(ctx) {
      if (!logoUrl) return;
      const lado = Math.round(tamanho * logoProporcao);
      const padding = Math.round(lado * 0.15);
      const x = Math.round((tamanho - (lado + padding * 2)) / 2);
      const y = Math.round((tamanho - (lado + padding * 2)) / 2);

      // Fundo branco atrás do logo
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, lado + padding * 2, lado + padding * 2);

      const logo = new Image();
      logo.crossOrigin = 'anonymous';
      logo.onload = () => {
        ctx.drawImage(logo, x + padding, y + padding, lado, lado);
      };
      logo.src = logoUrl;
    }
  }, 0);
}

/**
 * Constrói a URL do resolver do QR:
 *   https://<api-id>.execute-api.us-east-1.amazonaws.com/qr/resolve?u=<email>&i=<mesa>
 * Aceita parâmetros extras (ex.: { v: Date.now() }).
 */
function buildQrResolveUrl({
  apiBase = 'https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/qr/resolve',
  u, // e-mail do restaurante
  i, // identificador da mesa
  extra = {}
}) {
  if (!u) throw new Error('Parâmetro "u" (e-mail) é obrigatório.');

  // Força minúsculo e mantém o formato original (não slugifica)
  const email = String(u).trim().toLowerCase();

  const params = new URLSearchParams({ u: email });
  if (i) params.set('i', i);

  // parâmetros extras opcionais (cache-busting, analytics, etc.)
  Object.entries(extra || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });

  return `${apiBase}?${params.toString()}`;
}

/**
 * Atalho: gera o QR **já apontando para /qr/resolve**
 * Exemplo:
 * gerarQrResolveComLogo({
 *   containerId: 'qrContainer',
 *   u: 'arcardapio@gmail.com',
 *   i: 'mesa1',
 *   tamanho: 520,
 *   logoUrl: 'imagens/logo-arcardapio.png'
 * });
 */
function gerarQrResolveComLogo({
  containerId = 'qrContainer',
  apiBase = 'https://nfbnk2nku9.execute-api.us-east-1.amazonaws.com/qr/resolve',
  u,
  i,
  tamanho = 512,
  logoUrl,
  logoProporcao = 0.22,
  margem = 4,
  extra = {}
}) {
  // inclui parâmetro v=Date.now() para forçar atualização de cache
  const texto = buildQrResolveUrl({ apiBase, u, i, extra: { v: Date.now(), ...extra } });

  return gerarQrComLogo({
    containerId,
    texto,
    tamanho,
    logoUrl,
    logoProporcao,
    margem
  });
}

// ===============================
// Exemplo de uso direto
// ===============================

// gerarQrResolveComLogo({
//   containerId: 'qrContainer',
//   u: 'arcardapio@gmail.com',
//   i: 'mesa1',
//   tamanho: 520,
//   logoUrl: 'imagens/logo-arcardapio.png'
// });
