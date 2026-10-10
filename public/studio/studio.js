"use strict";
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const KEY = "bachir-ia-v1";

  const FORMATS = {
    minute: { serie: "MINUTE SÉCURITÉ", label: "Minute sécurité" },
    rex: { serie: "REX INCIDENT", label: "Retour d'expérience après incident" },
    induction: { serie: "ACCUEIL SÉCURITÉ", label: "Accueil sécurité nouvel arrivant" },
    flash: { serie: "ALERTE SÉCURITÉ", label: "Alerte flash" },
  };
  const PUBLICS = {
    foreurs: "foreurs et aides-foreurs", engins: "chauffeurs et opérateurs d'engins", atelier: "mécaniciens d'atelier",
    tous: "tout le personnel du site", encadrement: "chefs d'équipe et encadrement",
  };
  const TYPES = {
    titre: { label: "Titre" },
    danger: { label: "Danger", tag: "DANGER", color: "#FFC20E", ink: "#16181B" },
    interdit: { label: "Interdit", tag: "INTERDIT", color: "#D7262D", ink: "#FFFFFF" },
    obligation: { label: "Obligation", tag: "OBLIGATOIRE", color: "#1F5FAD", ink: "#FFFFFF" },
    liste: { label: "Liste d'actions", tag: "À FAIRE" },
    chiffre: { label: "Chiffre clé" },
    cloture: { label: "Clôture / question", tag: "QUESTION DU JOUR", color: "#2E9E5B", ink: "#FFFFFF" },
  };
  const uid = () => Math.random().toString(36).slice(2, 9);

  const EXAMPLE = [
    { type: "titre", titre: "Zone d'exclusion autour de la foreuse", texte: "Personne n'entre sans l'accord du foreur.", items: [], voix: "Bonjour l'équipe. Aujourd'hui, une minute sur la zone d'exclusion autour de la foreuse.", duree: 6 },
    { type: "danger", titre: "Une seconde suffit", texte: "Tige en rotation, flexibles sous haute pression, chute d'outil. Le foreur ne te voit pas toujours.", items: [], voix: "La tige tourne, les flexibles sont sous pression, un outil peut tomber. Et depuis sa cabine, le foreur ne te voit pas toujours.", duree: 10 },
    { type: "interdit", titre: "Jamais sous la tige ni près d'un flexible", texte: "Même pour aller vite. Même pour aider.", items: [], voix: "On ne passe jamais sous la tige, on ne s'approche jamais d'un flexible en charge. Même pour aller vite, même pour rendre service.", duree: 9 },
    { type: "liste", titre: "Avant d'approcher la machine", texte: "", items: ["Contact visuel avec le foreur", "Signe d'arrêt de la rotation", "EPI complets et ajustés", "Reste hors de la ligne de tir"], voix: "Avant d'approcher : contact visuel avec le foreur, tu attends son signe d'arrêt de la rotation, tes EPI sont complets, et tu restes hors de la ligne de tir.", duree: 14 },
    { type: "chiffre", titre: "0", texte: "blessé accepté. Chacun rentre chez lui ce soir.", items: [], voix: "Notre objectif, c'est zéro blessé. Chacun rentre chez lui ce soir, sur ses deux jambes.", duree: 8 },
    { type: "cloture", titre: "Où commence la zone sur ta foreuse ?", texte: "Montre-la à ton chef d'équipe avant de démarrer le poste.", items: [], voix: "Question du jour : où commence la zone d'exclusion sur ta foreuse ? Montre-la à ton chef d'équipe avant de démarrer. Et si tu vois un danger, tu arrêtes le travail.", duree: 13 },
  ];

  const DEFAULT_STATE = {
    brief: { format: "minute", public: "foreurs", duree: "60", sujet: "Zone d'exclusion autour de la foreuse de production en fonctionnement : personne ne s'approche sans contact visuel et accord du foreur." },
    script: EXAMPLE.map((s) => (s.type === "liste" ? "Avant d'approcher la machine :\n" + s.items.map((x) => "- " + x).join("\n") : s.voix)).join("\n\n"),
    useAi: true,
    aspect: "9:16",
    brand: { nom: "Afrika Drilling CI", fin: "Tu vois un danger ? Tu arrêtes le travail.", primary: "#FFC20E", dark: "#16181B", fit: true, subs: true },
    example: true,
    scenes: EXAMPLE.map((s) => ({ ...s, id: uid() })),
  };

  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch (e) { state = null; }
  if (!state || !Array.isArray(state.scenes)) state = structuredClone(DEFAULT_STATE);
  state.brief = { ...DEFAULT_STATE.brief, ...state.brief };
  state.brand = { ...DEFAULT_STATE.brand, ...state.brand };
  if (typeof state.script !== "string") state.script = DEFAULT_STATE.script;
  if (typeof state.useAi !== "boolean") state.useAi = true;
  state.scenes.forEach((s) => { s.id = s.id || uid(); s.items = Array.isArray(s.items) ? s.items : []; });

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
    }, 300);
  }

  const media = { photos: new Map(), logo: null };
  const voiceEl = new Audio();
  voiceEl.preload = "metadata";
  let voiceLoaded = false;

  /* ---------------- Canvas ---------------- */
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const F = { disp: '"Barlow Condensed", "Arial Narrow", sans-serif', body: 'Barlow, "Segoe UI", Arial, sans-serif', mono: '"IBM Plex Mono", Menlo, monospace' };

  function timeline() {
    const base = state.scenes.map((s) => Math.max(2, Number(s.duree) || 5));
    const sum = base.reduce((a, b) => a + b, 0) || 1;
    if (state.brand.fit && voiceLoaded && isFinite(voiceEl.duration) && voiceEl.duration > 1) {
      const total = voiceEl.duration + 0.8;
      return { durs: base.map((d) => (d * total) / sum), total };
    }
    return { durs: base, total: sum };
  }

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapLines(text, maxW) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function fit(text, weight, family, size, min, maxW, maxLines) {
    let s = size, lines;
    for (;;) {
      ctx.font = `${weight} ${s}px ${family}`;
      lines = wrapLines(text, maxW);
      const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
      if ((lines.length <= maxLines && widest <= maxW) || s <= min) break;
      s -= 4;
    }
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += "…"; }
    return { lines, size: s };
  }
  function setSpacing(px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }

  function hazardBand(y, h, offset, col, dark) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, cv.width, h); ctx.clip();
    ctx.fillStyle = dark; ctx.fillRect(0, y, cv.width, h);
    ctx.fillStyle = col;
    const step = h * 2.2;
    for (let x = -step * 2 + (offset % step); x < cv.width + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, y + h); ctx.lineTo(x + h, y); ctx.lineTo(x + h + step / 2, y); ctx.lineTo(x + step / 2, y + h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function icon(type, cx, cy, r) {
    ctx.save();
    ctx.lineJoin = "round";
    if (type === "danger") {
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 1.12, cy + r * 0.85); ctx.lineTo(cx - r * 1.12, cy + r * 0.85); ctx.closePath();
      ctx.fillStyle = "#FFC20E"; ctx.fill();
      ctx.lineWidth = r * 0.12; ctx.strokeStyle = "#16181B"; ctx.stroke();
      ctx.fillStyle = "#16181B"; ctx.font = `800 ${r * 1.1}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy + r * 0.2);
    } else if (type === "interdit") {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#FFFFFF"; ctx.fill();
      ctx.lineWidth = r * 0.2; ctx.strokeStyle = "#D7262D"; ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - r * 0.64, cy - r * 0.64); ctx.lineTo(cx + r * 0.64, cy + r * 0.64); ctx.stroke();
    } else if (type === "obligation") {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = "#1F5FAD"; ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${r * 1.3}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("!", cx, cy + r * 0.06);
    } else if (type === "cloture") {
      rr(cx - r, cy - r, r * 2, r * 2, r * 0.18); ctx.fillStyle = "#2E9E5B"; ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${r * 1.4}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("?", cx, cy + r * 0.06);
    }
    ctx.restore();
  }

  function octagon(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = "#D7262D"; ctx.fill();
    ctx.lineWidth = r * 0.08; ctx.strokeStyle = "#FFFFFF"; ctx.stroke();
    ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${r * 0.62}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("STOP", cx, cy + r * 0.04);
  }

  function pill(text, x, y, bg, ink, k) {
    ctx.save();
    ctx.font = `600 ${28 * k}px ${F.mono}`; setSpacing(3 * k);
    const w = ctx.measureText(text).width + 36 * k, h = 50 * k;
    rr(x, y, w, h, 6 * k); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = ink; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(text, x + 18 * k, y + h / 2 + 1);
    ctx.restore();
    return h;
  }

  function drawCover(img, zoom) {
    const W = cv.width, H = cv.height;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }

  const chunkCache = new Map();
  function chunks(text) {
    if (chunkCache.has(text)) return chunkCache.get(text);
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const out = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if (cur.length >= 10 || (/[.,;:!?…]$/.test(w) && cur.length >= 4)) { out.push(cur.join(" ")); cur = []; }
    }
    if (cur.length) { if (out.length && cur.length < 3) out[out.length - 1] += " " + cur.join(" "); else out.push(cur.join(" ")); }
    if (chunkCache.size > 300) chunkCache.clear();
    chunkCache.set(text, out);
    return out;
  }

  function drawFrame(t) {
    const W = cv.width, H = cv.height, land = W > H;
    const k = Math.min(W, H) / 1080;
    const brand = state.brand;
    const { durs, total } = timeline();
    const PRIMARY = brand.primary || "#FFC20E", DARK = brand.dark || "#16181B";

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);

    if (!state.scenes.length) {
      ctx.fillStyle = "#FFFFFF"; ctx.font = `700 ${64 * k}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Ajoute une première scène", W / 2, H / 2);
      ctx.restore(); return;
    }

    let i = 0, acc = 0;
    while (i < durs.length - 1 && t >= acc + durs[i]) { acc += durs[i]; i++; }
    const lt = Math.max(0, t - acc), dur = durs[i], sc = state.scenes[i];
    const T = TYPES[sc.type] || TYPES.obligation;

    // Fond : photo du chantier ou halo latérite
    const img = media.photos.get(sc.id);
    if (img) {
      drawCover(img, 1.04 + 0.06 * clamp(lt / dur));
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(10,10,12,0.55)"); g.addColorStop(0.45, "rgba(10,10,12,0.72)"); g.addColorStop(1, "rgba(10,10,12,0.92)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createRadialGradient(W * 0.85, H * 0.95, 0, W * 0.85, H * 0.95, Math.max(W, H) * 0.8);
      g.addColorStop(0, "rgba(184,70,27,0.30)"); g.addColorStop(1, "rgba(184,70,27,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    const band = 22 * k;
    hazardBand(0, band, t * 40 * k, PRIMARY, DARK);
    hazardBand(H - band, band, -t * 40 * k, PRIMARY, DARK);

    const pad = (land ? 110 : 80) * k;
    const cw = W - pad * 2;

    // En-tête
    const headY = band + 46 * k;
    if (media.logo) {
      const lh = 76 * k, lw = (media.logo.naturalWidth / media.logo.naturalHeight) * lh;
      ctx.drawImage(media.logo, pad, headY - 10 * k, Math.min(lw, cw * 0.45), lh);
    } else {
      ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${28 * k}px ${F.mono}`; setSpacing(4 * k);
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(String(brand.nom || "").toUpperCase(), pad, headY + 14 * k);
    }
    ctx.fillStyle = PRIMARY; ctx.font = `600 ${26 * k}px ${F.mono}`; setSpacing(4 * k); ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText((FORMATS[state.brief.format] || FORMATS.minute).serie, W - pad, headY + 16 * k);
    setSpacing(0);

    // Apparition
    const enter = (delay) => {
      const a = easeOut((lt - delay) / 0.5);
      ctx.globalAlpha = a;
      return (1 - a) * 46 * k;
    };

    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    let y = land ? H * 0.26 : H * 0.24;

    if (sc.type === "titre") {
      let dy = enter(0);
      pill((FORMATS[state.brief.format] || FORMATS.minute).serie, pad, y + dy, PRIMARY, DARK, k);
      y += 120 * k;
      dy = enter(0.15);
      const tt = fit(String(sc.titre || "").toUpperCase(), 800, F.disp, (land ? 150 : 160) * k, 70 * k, cw, land ? 3 : 5);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${tt.size}px ${F.disp}`;
      const lh = tt.size * 0.98;
      tt.lines.forEach((l, j) => ctx.fillText(l.toUpperCase(), pad, y + dy + tt.size * 0.8 + j * lh));
      y += tt.lines.length * lh + 50 * k;
      dy = enter(0.35);
      ctx.fillStyle = PRIMARY; ctx.fillRect(pad, y + dy, 160 * k * easeOut((lt - 0.35) / 0.6), 12 * k);
      y += 70 * k;
      dy = enter(0.55);
      const st = fit(sc.texte, 500, F.body, 54 * k, 34 * k, cw, 4);
      ctx.fillStyle = "rgba(255,255,255,0.86)"; ctx.font = `500 ${st.size}px ${F.body}`;
      st.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + st.size + j * st.size * 1.3));
    } else if (sc.type === "chiffre") {
      let dy = enter(0);
      const nt = fit(sc.titre, 800, F.disp, (land ? 360 : 420) * k, 120 * k, cw, 1);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${nt.size}px ${F.disp}`;
      y += nt.size * 0.85;
      ctx.fillText(nt.lines[0] || "", pad - 8 * k, y + dy);
      y += 60 * k;
      dy = enter(0.3);
      const st = fit(sc.texte, 600, F.body, 70 * k, 40 * k, cw, 4);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${st.size}px ${F.body}`;
      st.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + st.size + j * st.size * 1.25));
    } else if (sc.type === "liste") {
      let dy = enter(0);
      pill(T.tag, pad, y + dy, PRIMARY, DARK, k);
      y += 110 * k;
      dy = enter(0.15);
      const tt = fit(String(sc.titre || "").toUpperCase(), 800, F.disp, 100 * k, 56 * k, cw, 2);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${tt.size}px ${F.disp}`;
      tt.lines.forEach((l, j) => ctx.fillText(l.toUpperCase(), pad, y + dy + tt.size * 0.8 + j * tt.size));
      y += tt.lines.length * tt.size + 50 * k;
      const items = (sc.items || []).filter(Boolean).slice(0, 5);
      const stepDelay = Math.min(0.9, (dur * 0.55) / Math.max(1, items.length));
      const box = 78 * k;
      items.forEach((it, j) => {
        const d = enter(0.5 + j * stepDelay);
        ctx.font = `600 ${50 * k}px ${F.body}`;
        const lines = fit(it, 600, F.body, 50 * k, 34 * k, cw - box - 30 * k, 2);
        const rowH = Math.max(box, lines.lines.length * lines.size * 1.2) + 26 * k;
        ctx.save(); ctx.translate(-d, 0);
        rr(pad, y, box, box, 6 * k); ctx.fillStyle = PRIMARY; ctx.fill();
        ctx.fillStyle = DARK; ctx.font = `800 ${52 * k}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(j + 1), pad + box / 2, y + box / 2 + 2 * k);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${lines.size}px ${F.body}`;
        const ty = y + box / 2 - ((lines.lines.length - 1) * lines.size * 1.2) / 2 + lines.size * 0.35;
        lines.lines.forEach((l, m) => ctx.fillText(l, pad + box + 30 * k, ty + m * lines.size * 1.2));
        ctx.restore();
        y += rowH;
      });
    } else {
      // danger, interdit, obligation, cloture
      const r = (land ? 80 : 96) * k;
      let dy = enter(0);
      icon(sc.type, pad + r * 1.12, y + r + dy, r);
      y += r * 2 + 50 * k;
      dy = enter(0.12);
      pill(T.tag || "CONSIGNE", pad, y + dy, T.color || PRIMARY, T.ink || DARK, k);
      y += 90 * k;
      dy = enter(0.25);
      const tt = fit(String(sc.titre || "").toUpperCase(), 800, F.disp, (land ? 108 : 118) * k, 60 * k, cw, land ? 2 : 4);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `800 ${tt.size}px ${F.disp}`;
      tt.lines.forEach((l, j) => ctx.fillText(l.toUpperCase(), pad, y + dy + tt.size * 0.8 + j * tt.size));
      y += tt.lines.length * tt.size + 40 * k;
      dy = enter(0.45);
      const st = fit(sc.texte, 500, F.body, 54 * k, 34 * k, cw, land ? (brand.subs ? 2 : 3) : (brand.subs ? 4 : 6));
      ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.font = `500 ${st.size}px ${F.body}`;
      st.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + st.size + j * st.size * 1.3));
      if (sc.type === "cloture" && brand.fin) {
        ctx.globalAlpha = easeOut((lt - 1.2) / 0.6);
        const or = 70 * k, by = H - band - 190 * k;
        octagon(pad + or, by, or);
        const ft = fit(brand.fin, 700, F.body, 46 * k, 28 * k, cw - or * 2 - 36 * k, 2);
        ctx.fillStyle = "#FFFFFF"; ctx.font = `700 ${ft.size}px ${F.body}`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
        const fy = by - ((ft.lines.length - 1) * ft.size * 1.2) / 2;
        ft.lines.forEach((l, j) => ctx.fillText(l, pad + or * 2 + 36 * k, fy + j * ft.size * 1.2));
      }
    }

    ctx.globalAlpha = 1; setSpacing(0);
    const barY = H - band - 46 * k;

    // Sous-titres : le script, découpé en blocs courts, calé sur la durée de la scène
    if (brand.subs && sc.voix && sc.voix.trim()) {
      const ch = chunks(sc.voix);
      const counts = ch.map((c) => c.split(" ").length);
      const tot = counts.reduce((a, b) => a + b, 0);
      let pos = clamp(lt / Math.max(0.5, dur - 0.4)) * tot, ci = 0;
      while (ci < ch.length - 1 && pos >= counts[ci]) { pos -= counts[ci]; ci++; }
      const ct = fit(ch[ci], 600, F.body, (land ? 40 : 46) * k, 28 * k, cw - 48 * k, land ? 2 : 3);
      const lh = ct.size * 1.25, boxH = ct.lines.length * lh + 34 * k;
      const bottom = sc.type === "cloture" && brand.fin ? H - band - 190 * k - 94 * k : barY - 50 * k;
      const top = bottom - boxH;
      rr(pad, top, cw, boxH, 8 * k); ctx.fillStyle = "rgba(0,0,0,0.74)"; ctx.fill();
      ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${ct.size}px ${F.body}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ct.lines.forEach((l, j) => ctx.fillText(l, W / 2, top + 17 * k + lh / 2 + j * lh));
    }

    // Pied : compteur de scènes et progression
    ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.font = `500 ${24 * k}px ${F.mono}`; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(`${String(i + 1).padStart(2, "0")} / ${String(state.scenes.length).padStart(2, "0")}`, pad, barY - 14 * k);
    ctx.fillStyle = "rgba(255,255,255,0.16)"; ctx.fillRect(pad, barY, cw, 8 * k);
    ctx.fillStyle = PRIMARY; ctx.fillRect(pad, barY, cw * clamp(t / total), 8 * k);
    ctx.restore();
  }

  /* ---------------- Lecture ---------------- */
  let playing = null; // {start, raf, resolve}
  let ac = null, audioDest = null;
  function ensureAudioGraph() {
    if (ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const src = ac.createMediaElementSource(voiceEl);
    audioDest = ac.createMediaStreamDestination();
    src.connect(audioDest);
    src.connect(ac.destination);
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function updateTimes(t) {
    const { total } = timeline();
    $("t-cur").textContent = fmt(Math.min(t, total));
    $("t-tot").textContent = fmt(total);
    $("sc-total").textContent = `${state.scenes.length} scènes · ${fmt(total)}`;
  }

  function seek(t) {
    const { total } = timeline();
    t = clamp(t, 0, total);
    $("scrub").value = String(Math.round((t / total) * 1000));
    drawFrame(t);
    updateTimes(t);
  }
  function scrubTime() { return (Number($("scrub").value) / 1000) * timeline().total; }

  function playOnce(onProgress) {
    return new Promise((resolve) => {
      const { total } = timeline();
      if (voiceLoaded) {
        ensureAudioGraph();
        if (ac && ac.state === "suspended") ac.resume();
        try { voiceEl.currentTime = 0; } catch (e) { /* ignore */ }
        voiceEl.play().catch(() => {});
      }
      const start = performance.now();
      const p = { resolve, raf: 0 };
      playing = p;
      const tick = () => {
        if (playing !== p) return;
        const t = (performance.now() - start) / 1000;
        drawFrame(t);
        $("scrub").value = String(Math.round(clamp(t / total) * 1000));
        updateTimes(t);
        if (onProgress) onProgress(clamp(t / total));
        if (t >= total) { finish(); return; }
        p.raf = requestAnimationFrame(tick);
      };
      p.raf = requestAnimationFrame(tick);
      $("btn-play").textContent = "■ Arrêter";
    });
  }
  function finish() {
    if (!playing) return;
    const p = playing;
    playing = null;
    cancelAnimationFrame(p.raf);
    voiceEl.pause();
    $("btn-play").textContent = "▶ Lire";
    p.resolve();
  }

  /* ---------------- Éditeur ---------------- */
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k in n && k !== "type" && k !== "for") n[k] = v;
      else n.setAttribute(k, v);
    }
    kids.flat().forEach((c) => c && n.append(c));
    return n;
  }
  function sceneStart(idx) {
    const { durs } = timeline();
    return durs.slice(0, idx).reduce((a, b) => a + b, 0);
  }
  function focusScene(idx) {
    if (playing || exporting) return;
    const { durs } = timeline();
    seek(sceneStart(idx) + Math.min(durs[idx] * 0.8, 3));
  }
  function changed(idx) {
    state.example = false;
    $("ex-badge").hidden = true;
    persist();
    renderPrompter();
    if (idx != null) focusScene(idx); else seek(scrubTime());
  }

  function renderScenes() {
    const list = $("scenes");
    list.replaceChildren();
    state.scenes.forEach((s, i) => {
      const id = (f) => `sc-${s.id}-${f}`;
      const typeSel = el("select", { id: id("type"), "aria-label": `Type de la scène ${i + 1}` },
        Object.entries(TYPES).map(([v, t]) => el("option", { value: v, text: t.label, selected: v === s.type })));
      const dur = el("input", { type: "number", id: id("duree"), min: "2", max: "30", step: "1", value: String(s.duree), "aria-label": "Durée en secondes" });
      const up = el("button", { type: "button", class: "icon-btn", text: "↑", "aria-label": "Monter la scène", disabled: i === 0 });
      const down = el("button", { type: "button", class: "icon-btn", text: "↓", "aria-label": "Descendre la scène", disabled: i === state.scenes.length - 1 });
      const del = el("button", { type: "button", class: "icon-btn", text: "×", "aria-label": "Supprimer la scène" });

      const titre = el("input", { type: "text", id: id("titre"), value: s.titre || "" });
      const titreLab = el("label", { class: "f" }, el("span", { text: s.type === "chiffre" ? "Chiffre ou valeur" : "Titre à l'écran" }), titre);
      const texte = el("textarea", { id: id("texte"), rows: 2 });
      texte.value = s.texte || "";
      const texteLab = el("label", { class: "f" }, el("span", { text: "Texte à l'écran" }), texte);
      const items = el("textarea", { id: id("items"), rows: 4 });
      items.value = (s.items || []).join("\n");
      const itemsLab = el("label", { class: "f" }, el("span", { text: "Actions (une par ligne, 5 max)" }), items);
      itemsLab.hidden = s.type !== "liste";
      const voix = el("textarea", { id: id("voix"), rows: 2 });
      voix.value = s.voix || "";
      const voixLab = el("label", { class: "f" }, el("span", { text: "Voix off de la scène" }), voix);

      const photoIn = el("input", { type: "file", id: id("photo"), accept: "image/*", "aria-label": "Photo de fond" });
      const thumb = el("img", { alt: "Photo de la scène", hidden: !media.photos.has(s.id) });
      if (media.photos.has(s.id)) thumb.src = media.photos.get(s.id).src;
      const rmPhoto = el("button", { type: "button", class: "btn small", text: "Retirer la photo", hidden: !media.photos.has(s.id) });
      const photo = el("div", { class: "photo" }, el("span", { text: "Photo de fond" }), thumb, photoIn, rmPhoto);

      const card = el("article", { class: "scene" },
        el("div", { class: "head" }, el("span", { class: "num", text: `Scène ${i + 1}` }), typeSel,
          el("label", { class: "dur" }, dur, "s"), el("div", { class: "tools" }, up, down, del)),
        titreLab, texteLab, itemsLab, voixLab, photo);
      card.dataset.type = s.type;
      card.addEventListener("focusin", () => focusScene(i));

      typeSel.addEventListener("change", () => {
        s.type = typeSel.value; card.dataset.type = s.type;
        itemsLab.hidden = s.type !== "liste";
        titreLab.firstChild.textContent = s.type === "chiffre" ? "Chiffre ou valeur" : "Titre à l'écran";
        changed(i);
      });
      dur.addEventListener("input", () => { s.duree = clamp(Math.round(Number(dur.value) || 5), 2, 30); changed(i); });
      titre.addEventListener("input", () => { s.titre = titre.value; changed(i); });
      texte.addEventListener("input", () => { s.texte = texte.value; changed(i); });
      items.addEventListener("input", () => { s.items = items.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5); changed(i); });
      voix.addEventListener("input", () => { s.voix = voix.value; changed(null); });
      photoIn.addEventListener("change", () => {
        const f = photoIn.files && photoIn.files[0];
        if (!f) return;
        const img = new Image();
        img.onload = () => { media.photos.set(s.id, img); thumb.src = img.src; thumb.hidden = false; rmPhoto.hidden = false; focusScene(i); };
        img.src = URL.createObjectURL(f);
      });
      rmPhoto.addEventListener("click", () => { media.photos.delete(s.id); thumb.hidden = true; rmPhoto.hidden = true; photoIn.value = ""; focusScene(i); });
      up.addEventListener("click", () => { [state.scenes[i - 1], state.scenes[i]] = [state.scenes[i], state.scenes[i - 1]]; renderScenes(); changed(i - 1); });
      down.addEventListener("click", () => { [state.scenes[i + 1], state.scenes[i]] = [state.scenes[i], state.scenes[i + 1]]; renderScenes(); changed(i + 1); });
      del.addEventListener("click", () => { media.photos.delete(s.id); state.scenes.splice(i, 1); renderScenes(); changed(null); });

      list.append(card);
    });
    $("ex-badge").hidden = !state.example;
    renderPrompter();
    updateTimes(scrubTime());
  }

  function renderPrompter() {
    const parts = state.scenes.map((s, i) => `[Scène ${i + 1}] ${s.voix || "(pas de voix)"}`);
    $("prompter").textContent = parts.join("\n\n") || "Aucune scène.";
  }

  /* ---------------- Brief et marque ---------------- */
  function bindBrief() {
    const b = state.brief;
    $("b-format").value = b.format; $("b-public").value = b.public; $("b-duree").value = String(b.duree); $("b-sujet").value = b.sujet;
    $("b-format").addEventListener("change", (e) => { b.format = e.target.value; persist(); seek(scrubTime()); });
    $("b-public").addEventListener("change", (e) => { b.public = e.target.value; persist(); });
    $("b-duree").addEventListener("change", (e) => { b.duree = e.target.value; persist(); });
    $("b-sujet").addEventListener("input", (e) => { b.sujet = e.target.value; persist(); });

    const br = state.brand;
    $("br-nom").value = br.nom; $("br-fin").value = br.fin; $("br-primary").value = br.primary; $("br-dark").value = br.dark;
    $("fit-voice").checked = !!br.fit;
    $("subs").checked = !!br.subs;
    $("subs").addEventListener("change", (e) => { br.subs = e.target.checked; persist(); seek(scrubTime()); });
    $("s-script").value = state.script;
    $("s-script").addEventListener("input", (e) => { state.script = e.target.value; persist(); });
    $("s-ai").checked = state.useAi;
    $("s-ai").addEventListener("change", (e) => { state.useAi = e.target.checked; persist(); });
    [["br-nom", "nom"], ["br-fin", "fin"], ["br-primary", "primary"], ["br-dark", "dark"]].forEach(([id, key]) =>
      $(id).addEventListener("input", (e) => { br[key] = e.target.value; persist(); seek(scrubTime()); }));
    $("fit-voice").addEventListener("change", (e) => { br.fit = e.target.checked; persist(); seek(0.5); });
    $("br-logo").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { media.logo = img; $("br-logo-prev").src = img.src; $("br-logo-prev").hidden = false; seek(scrubTime()); };
      img.src = URL.createObjectURL(f);
    });
  }

  function setAspect(a) {
    state.aspect = a;
    const land = a === "16:9";
    cv.width = land ? 1920 : 1080; cv.height = land ? 1080 : 1920;
    $("stage").classList.toggle("land", land);
    $("ar-portrait").setAttribute("aria-pressed", String(!land));
    $("ar-land").setAttribute("aria-pressed", String(land));
    persist();
    seek(scrubTime());
  }

  /* ---------------- Voix ---------------- */
  $("voice-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    voiceLoaded = false;
    voiceEl.src = URL.createObjectURL(f);
    $("voice-status").textContent = "Lecture de l'audio…";
    voiceEl.onloadedmetadata = () => {
      voiceLoaded = true;
      $("voice-status").className = "status ok";
      $("voice-status").textContent = `${f.name} · ${fmt(voiceEl.duration)}`;
      $("btn-voice-clear").hidden = false;
      seek(0.5);
    };
    voiceEl.onerror = () => {
      $("voice-status").className = "status warn";
      $("voice-status").textContent = "Ce fichier audio ne se lit pas ici. Essaie un MP3 ou un M4A.";
    };
  });
  $("btn-voice-clear").addEventListener("click", () => {
    voiceEl.pause(); voiceEl.removeAttribute("src"); voiceEl.load(); voiceLoaded = false;
    $("voice-file").value = ""; $("btn-voice-clear").hidden = true;
    $("voice-status").className = "status"; $("voice-status").textContent = "";
    seek(0.5);
  });
  $("btn-copy").addEventListener("click", () => {
    const txt = $("prompter").textContent;
    const ok = () => { $("voice-status").className = "status ok"; $("voice-status").textContent = "Texte copié."; };
    const fallback = () => {
      const r = document.createRange(); r.selectNodeContents($("prompter"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      $("voice-status").className = "status"; $("voice-status").textContent = "Texte sélectionné : copie-le avec Ctrl+C.";
    };
    try { navigator.clipboard.writeText(txt).then(ok, fallback); } catch (e) { fallback(); }
  });

  /* ---------------- Serveur Bachir IA ---------------- */
  let iaOn = false;
  const API_MSG = {
    ia_non_configuree: "L'IA n'est pas encore activée sur le serveur (clé API absente).",
    ia_saturee: "L'IA est saturée. Réessaie dans une minute.",
    trop_de_demandes: "Limite atteinte : 30 demandes à l'IA par heure. Réessaie plus tard.",
    ia_refus: "L'IA a refusé de traiter ce texte. Reformule le sujet.",
    ia_cle_invalide: "La clé API configurée sur le serveur est refusée.",
    trop_long: "Texte trop long.",
    script_invalide: "Script vide ou trop long (12 000 caractères maximum).",
    brief_invalide: "Brief incomplet ou trop long (3 000 caractères maximum).",
  };
  async function api(path, payload) {
    let res;
    try {
      res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
    } catch (e) {
      throw { code: "reseau", message: "Pas de connexion au serveur." };
    }
    if (res.status === 401) { location.href = "/connexion.html?e=expire"; throw { code: "non_connecte", message: "Session expirée." }; }
    let data = null;
    try { data = await res.json(); } catch (e) { /* réponse vide */ }
    if (!res.ok) { const code = (data && data.error) || "erreur"; throw { code, message: API_MSG[code] || "Erreur du serveur (" + res.status + ")." }; }
    return data;
  }

  /* ---------------- Génération du script ---------------- */
  function normalize(out) {
    const arr = out && Array.isArray(out.scenes) ? out.scenes : [];
    return arr.slice(0, 9).map((s) => ({
      id: uid(),
      type: TYPES[s && s.type] ? s.type : "obligation",
      titre: String((s && s.titre) || "").slice(0, 90),
      texte: String((s && s.texte) || "").slice(0, 220),
      items: Array.isArray(s && s.items) ? s.items.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 5) : [],
      voix: String((s && s.voix) || "").slice(0, 600),
      duree: clamp(Math.round(Number(s && s.duree) || 6), 3, 25),
    }));
  }

  /* ---------------- Script fourni par l'utilisateur ---------------- */
  const BULLET = /^([-•*–]|\d+[.)])\s+/;
  function shorten(s, n) {
    s = String(s || "").trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n), sp = cut.lastIndexOf(" ");
    return cut.slice(0, sp > n * 0.5 ? sp : n).replace(/[,;:]$/, "") + "…";
  }
  function wordsOf(s) { return String(s || "").toLowerCase().replace(/[’`]/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean); }
  function sameWords(a, b) { const x = wordsOf(a), y = wordsOf(b); return x.length === y.length && x.every((w, i) => w === y[i]); }
  function durFor(voix) { return clamp(Math.round(wordsOf(voix).length / 2.5 + 1.5), 4, 25); }

  // Découpage sans IA : une scène par paragraphe, ou par groupe de phrases si le script est d'un seul bloc.
  function localSplit(text) {
    const raw = String(text).replace(/\r/g, "").trim();
    if (!raw) return [];
    let blocks = raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    if (blocks.length === 1 && !raw.split("\n").some((l) => BULLET.test(l.trim()))) {
      const sentences = (raw.replace(/\n/g, " ").match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) || [raw]).map((x) => x.trim()).filter(Boolean);
      blocks = [];
      let cur = "";
      for (const s of sentences) {
        if (cur && wordsOf(cur + " " + s).length > 28) { blocks.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
      }
      if (cur) blocks.push(cur);
    }
    return blocks.slice(0, 14).map((b, i, all) => {
      const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
      const bullets = lines.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, ""));
      const head = lines.filter((l) => !BULLET.test(l)).join(" ");
      const voix = lines.map((l) => { const x = l.replace(BULLET, ""); return BULLET.test(l) && !/[.,;:!?…]$/.test(x) ? x + "." : x; }).join(" ");
      const first = (voix.match(/^[^.!?…:]+[.!?…:]?/) || [voix])[0].replace(/[.:]$/, "");
      const low = voix.toLowerCase();
      let type = "obligation";
      if (i === 0) type = "titre";
      else if (bullets.length >= 2) type = "liste";
      else if (i === all.length - 1 && voix.includes("?")) type = "cloture";
      else if (/(interdit|jamais|défendu)/.test(low)) type = "interdit";
      else if (/(danger|risque|mortel|tuer|blesser|accident)/.test(low)) type = "danger";
      return {
        id: uid(), type,
        titre: shorten(type === "liste" ? (head.replace(/:$/, "") || "À faire") : first, 60),
        texte: "",
        items: bullets.slice(0, 5).map((x) => shorten(x, 50)),
        voix,
        duree: durFor(voix),
      };
    });
  }

  function scriptStatus(msg, cls = "") { const n = $("script-status"); n.className = "status " + cls; n.textContent = msg; }

  $("btn-script").addEventListener("click", async () => {
    const text = String(state.script || "").trim();
    if (!text) { scriptStatus("Colle d'abord ton script dans la zone ci-dessus.", "warn"); return; }
    const btn = $("btn-script");
    btn.disabled = true;
    let scenes = null, note = "";
    try {
      if (state.useAi && iaOn) {
        scriptStatus("Claude découpe ton script en scènes…");
        try {
          scenes = normalize(await api("/api/decoupe", { script: text.slice(0, 12000) }));
          scenes.forEach((s) => { s.duree = durFor(s.voix); });
          if (!scenes.length) scenes = null;
        } catch (e) {
          note = " " + ((e && e.message) || "L'IA n'a pas répondu.") + " Découpage automatique simple.";
        }
      }
      if (!scenes) scenes = localSplit(text);
      media.photos.clear();
      state.scenes = scenes; state.example = false;
      persist(); renderScenes(); seek(1.5);
      const { total } = timeline();
      const same = sameWords(text.split("\n").map((l) => l.trim().replace(BULLET, "")).join(" "), scenes.map((s) => s.voix).join(" "));
      scriptStatus(`${scenes.length} scènes créées, ${fmt(total)} de vidéo. Regarde l'aperçu, puis clique sur « Exporter la vidéo ».${note}` +
        (same ? "" : " Attention : les sous-titres ne reprennent pas ton script mot pour mot. Vérifie la voix de chaque scène."), same ? "ok" : "warn");
    } finally {
      btn.disabled = false;
    }
  });
  function genStatus(msg, cls = "") { const n = $("gen-status"); n.className = "status " + cls; n.textContent = msg; }

  $("btn-gen").addEventListener("click", async () => {
    if (!iaOn) { genStatus(API_MSG.ia_non_configuree + " Écris ou modifie les scènes à la main.", "warn"); return; }
    if (!String(state.brief.sujet).trim()) { genStatus("Décris d'abord le sujet de la vidéo.", "warn"); return; }
    const btn = $("btn-gen");
    btn.disabled = true;
    genStatus("Claude rédige le script…");
    try {
      const b = state.brief;
      const out = await api("/api/script", { format: b.format, public: b.public, duree: Number(b.duree), sujet: String(b.sujet).slice(0, 3000) });
      const scenes = normalize(out);
      if (scenes.length < 2) throw { code: "invalid_json" };
      media.photos.clear();
      state.scenes = scenes; state.example = false;
      persist(); renderScenes(); seek(1.5);
      genStatus(`Script prêt : ${scenes.length} scènes. Relis chaque règle et chaque chiffre avant diffusion, tu en es responsable.`, "ok");
    } catch (e) {
      genStatus((e && e.message) || "La génération a échoué. Réessaie.", "warn");
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Export ---------------- */
  let exporting = false, lastBlob = null, lastExt = "mp4", lastUrl = null;
  function pickMime() {
    const c = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
  }
  function expStatus(msg, cls = "") { const n = $("exp-status"); n.className = "status " + cls; n.textContent = msg; }
  function slug(s) { return String(s || "video").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "video"; }

  $("btn-export").addEventListener("click", async () => {
    if (exporting) return;
    if (!state.scenes.length) { expStatus("Ajoute au moins une scène.", "warn"); return; }
    if (!window.MediaRecorder || !cv.captureStream) { expStatus("Ce navigateur ne sait pas enregistrer de vidéo. Utilise Chrome ou Edge sur ordinateur.", "warn"); return; }
    finish();
    exporting = true;
    $("btn-export").disabled = true; $("btn-play").disabled = true;
    $("meter").hidden = false; $("result").hidden = true;
    const mime = pickMime();
    expStatus("Enregistrement en temps réel. Garde cet onglet ouvert et visible.");
    try {
      const stream = cv.captureStream(30);
      if (voiceLoaded) {
        ensureAudioGraph();
        if (audioDest) stream.addTrack(audioDest.stream.getAudioTracks()[0]);
      }
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : {});
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(250);
      await playOnce((p) => { $("meter-fill").style.width = (p * 100).toFixed(1) + "%"; });
      await new Promise((r) => setTimeout(r, 300));
      rec.stop();
      await stopped;
      stream.getVideoTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mime || "video/webm";
      lastExt = type.includes("mp4") ? "mp4" : "webm";
      lastBlob = new Blob(chunks, { type });
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(lastBlob);
      $("result-video").src = lastUrl;
      $("result").hidden = false;
      const mb = (lastBlob.size / 1048576).toFixed(1);
      if (lastExt === "webm") expStatus(`Vidéo prête (${mb} Mo) au format WebM. WhatsApp ne lit pas le WebM : exporte depuis un Chrome récent pour obtenir du MP4.`, "warn");
      else expStatus(`Vidéo prête : MP4, ${mb} Mo. Clique sur « Enregistrer le fichier ».`, "ok");
    } catch (e) {
      expStatus("L'export a échoué : " + ((e && e.message) || "erreur inconnue") + ".", "warn");
    } finally {
      exporting = false;
      $("btn-export").disabled = false; $("btn-play").disabled = false;
      $("meter").hidden = true;
    }
  });

  $("btn-save").addEventListener("click", () => {
    if (!lastBlob || !lastUrl) return;
    const name = `${slug((FORMATS[state.brief.format] || FORMATS.minute).label)}-${slug(state.scenes[0] && state.scenes[0].titre)}.${lastExt}`;
    const a = document.createElement("a");
    a.href = lastUrl; a.download = name; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    expStatus(`Téléchargement lancé : ${name}`, "ok");
  });

  /* ---------------- Contrôles ---------------- */
  $("btn-play").addEventListener("click", () => {
    if (playing) { finish(); return; }
    playOnce();
  });
  $("scrub").addEventListener("input", () => { if (playing) finish(); seek(scrubTime()); });
  $("ar-portrait").addEventListener("click", () => setAspect("9:16"));
  $("ar-land").addEventListener("click", () => setAspect("16:9"));
  $("btn-add").addEventListener("click", () => {
    state.scenes.push({ id: uid(), type: "obligation", titre: "Nouvelle consigne", texte: "", items: [], voix: "", duree: 6 });
    renderScenes();
    changed(state.scenes.length - 1);
    const last = $("scenes").lastElementChild;
    if (last) last.querySelector("input[type=text]").focus();
  });

  /* ---------------- Démarrage ---------------- */
  bindBrief();
  renderScenes();
  setAspect(state.aspect === "16:9" ? "16:9" : "9:16");
  seek(2.2);

  const fontsReady = Promise.all([
    '800 80px "Barlow Condensed"', '700 40px "Barlow"', '600 40px "Barlow"', '500 40px "Barlow"', '600 24px "IBM Plex Mono"',
  ].map((f) => document.fonts.load(f).catch(() => null)));
  fontsReady.then(() => { if (!playing) seek(scrubTime()); });

  fetch("/api/statut", { credentials: "same-origin" })
    .then((r) => (r.status === 401 ? (location.href = "/connexion.html?e=expire", null) : r.json()))
    .then((d) => {
      iaOn = Boolean(d && d.ia);
      if (!iaOn) {
        $("s-ai").checked = false; $("s-ai").disabled = true;
        scriptStatus("IA non activée sur le serveur : le découpage de ton script reste automatique. L'export vidéo fonctionne.", "");
        genStatus(API_MSG.ia_non_configuree, "warn");
      }
    })
    .catch(() => { $("s-ai").checked = false; $("s-ai").disabled = true; });
})();
