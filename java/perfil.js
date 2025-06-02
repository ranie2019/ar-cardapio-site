// ==============================
// perfil (menu dropdown do perfil)
// ==============================

document.addEventListener('DOMContentLoaded', () => {
  const profileBtn = document.getElementById('profile-btn');
  const dropdown = document.getElementById('dropdown');

  if (profileBtn && dropdown) {
    profileBtn.addEventListener('click', () => {
      dropdown.classList.toggle('show');
    });

    // Opcional: fecha o dropdown ao clicar fora
    window.addEventListener('click', (e) => {
      if (!profileBtn.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
  }
});
