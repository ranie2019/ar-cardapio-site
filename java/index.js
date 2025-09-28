document.addEventListener("DOMContentLoaded", () => {
  const abrirModal = document.getElementById("abrirModal");
  const fecharModal = document.getElementById("fecharModal");
  const modal = document.getElementById("modal");

  abrirModal.addEventListener("click", () => {
    modal.classList.remove("hidden");
  });

  fecharModal.addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
    }
  });

  // ====== Envio de formulário com banner de sucesso (sem redirecionar) ======
  const form = document.getElementById("form-contato");
  const mensagem = document.getElementById("mensagem-sucesso");

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const formData = new FormData(form);

    fetch("https://formsubmit.co/ajax/arcardapio@gmail.com", {
      method: "POST",
      headers: { 'Accept': 'application/json' },
      body: formData
    })
    .then(response => {
      if (response.ok) {
        form.reset();
        mensagem.style.display = "block";

        setTimeout(() => {
          mensagem.style.display = "none";
        }, 5000); // Esconde após 3 segundos
      } else {
        alert("Erro ao enviar o formulário. Tente novamente.");
      }
    })
    .catch(error => {
      console.error("Erro:", error);
      alert("Erro de rede. Verifique sua conexão.");
    });
  });
});
