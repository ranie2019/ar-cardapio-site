// =============================
// planoExpirado.js
// =============================

// Obtém os parâmetros da URL
const params = new URLSearchParams(location.search);
const email = params.get("u") || "";
const status = params.get("status") || "expirado";

// Mostra o e-mail (se existir)
const info = document.getElementById("emailInfo");
if (email) {
  info.innerText = `Conta: ${decodeURIComponent(email)}`;
}

// Define o link de renovação — ajuste se tiver página de planos diferente
const renovar = document.getElementById("renovarLink");
if (email) {
  renovar.href = `https://site-arcardapio.s3.us-east-1.amazonaws.com/html/plano.html?u=${encodeURIComponent(email)}`;
} else {
  renovar.href = `https://site-arcardapio.s3.us-east-1.amazonaws.com/html/plano.html`;
}

// Impede o usuário de voltar para o app
window.history.pushState(null, '', location.href);
window.addEventListener('popstate', () => {
  window.history.pushState(null, '', location.href);
});
