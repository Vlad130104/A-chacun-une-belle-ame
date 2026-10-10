"use strict";
(() => {
  const MSG = {
    "1": ["Mot de passe incorrect.", ""],
    bloque: ["Trop de tentatives. Attends 15 minutes avant de réessayer.", ""],
    config: ["Le site n'est pas encore configuré (mot de passe ou secret de session manquant).", ""],
    expire: ["Ta session a expiré. Reconnecte-toi.", "info"],
    sortie: ["Tu es déconnecté.", "info"],
  };
  const code = new URLSearchParams(location.search).get("e");
  const m = code && MSG[code];
  if (!m) return;
  const el = document.getElementById("msg");
  el.textContent = m[0];
  if (m[1]) el.classList.add(m[1]);
  el.hidden = false;
})();
