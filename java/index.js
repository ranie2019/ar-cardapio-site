// index.js

// Espera o DOM carregar
document.addEventListener("DOMContentLoaded", () => {
  const abrirModal = document.getElementById("abrirModal");
  const fecharModal = document.getElementById("fecharModal");
  const modal = document.getElementById("modal");

  // Abre o modal
  abrirModal.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });

  // Fecha o modal
  fecharModal.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  // Fecha o modal se clicar fora do conteúdo
  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
  });
});
