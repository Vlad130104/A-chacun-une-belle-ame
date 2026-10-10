"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "bachir-ia-v4";

  const TYPES = {
    titre: { label: "Titre" },
    chapitre: { label: "Chapitre" },
    texte: { label: "Texte" },
    citation: { label: "Citation" },
    liste: { label: "Liste", tag: "À RETENIR" },
    chiffre: { label: "Chiffre clé" },
    alerte: { label: "Alerte", tag: "ATTENTION" },
    cta: { label: "Appel à l'action" },
  };
  const OLD_TYPES = { danger: "alerte", interdit: "alerte", obligation: "texte", cloture: "cta" };

  // Modèles visuels : couleurs, police des titres, casse, alignement et style des sous-titres.
  const TEMPLATES = {
    impact: { name: "Impact", bg: "#0B0C0F", fg: "#FFFFFF", accent: "#F5B700", ink: "#0B0C0F", title: "disp", upper: true, align: "left", caption: "box", capUpper: true },
    minimal: { name: "Minimal clair", bg: "#F4F1EA", fg: "#16140F", accent: "#E4572E", ink: "#FFFFFF", title: "disp", upper: false, align: "center", caption: "color", capUpper: false },
    neon: { name: "Néon", bg: "#07060F", gradient: ["#1A0B3D", "#07060F"], fg: "#FFFFFF", accent: "#00E5FF", ink: "#07060F", title: "disp", upper: true, align: "center", caption: "glow", capUpper: true, glow: true },
    docu: { name: "Documentaire", bg: "#121110", fg: "#F3EDE2", accent: "#C9A227", ink: "#121110", title: "serif", upper: false, align: "center", caption: "classic", capUpper: false },
    promo: { name: "Food & Promo", bg: "#B3001B", gradient: ["#D7141F", "#6E000E"], fg: "#FFFFFF", accent: "#FFD23F", ink: "#3A0008", title: "disp", upper: true, align: "left", caption: "box", capUpper: true },
    business: { name: "Business", bg: "#0E1A2B", gradient: ["#16294A", "#0A1320"], fg: "#FFFFFF", accent: "#3DA5FF", ink: "#FFFFFF", title: "body", upper: false, align: "left", caption: "classic", capUpper: false },
  };

  // Modèles de script : structures éprouvées, à compléter entre crochets.
  const SCRIPT_TEMPLATES = {
    top5: { name: "Top 5", tpl: "impact", aspect: "9:16", text: `# Top 5 [sujet] que personne ne te dit
Reste jusqu'au numéro 1 : c'est celui qui change tout.

## Numéro 5 : [idée 5]

[Explique l'idée 5 en deux phrases simples.]

## Numéro 4 : [idée 4]

[Explique l'idée 4 en deux phrases simples.]

## Numéro 3 : [idée 3]

[Explique l'idée 3 en deux phrases simples.]

## Numéro 2 : [idée 2]

[Explique l'idée 2 en deux phrases simples.]

## Numéro 1 : [idée 1]

[Explique l'idée 1 : la plus forte, avec un exemple concret.]

Lequel tu ne connaissais pas ? Dis-le en commentaire, et abonne-toi pour la suite.` },
    histoire: { name: "Storytelling", tpl: "docu", aspect: "16:9", text: `# [Titre de l'histoire]
[Phrase d'accroche : le moment où tout a basculé.]

## Le contexte

[Qui, où, quand. Deux ou trois phrases pour planter le décor.]

## Le problème

[Ce qui bloquait. Ce que la personne risquait de perdre.]

## Le tournant

[La décision ou l'événement qui a tout changé.]

## La leçon

[Ce qu'on en retient, et comment tu peux l'appliquer toi aussi.]

> [Une phrase forte à retenir] — [Auteur]

Et toi, tu aurais fait quoi à sa place ? Dis-le en commentaire.` },
    tuto: { name: "Tutoriel", tpl: "business", aspect: "16:9", text: `# Comment [obtenir tel résultat] en [nombre] étapes
À la fin de cette vidéo, tu sauras [résultat concret].

## Ce qu'il te faut

Avant de commencer :
- [Outil ou prérequis 1]
- [Outil ou prérequis 2]
- [Outil ou prérequis 3]

## Étape 1 : [action]

[Explique exactement quoi faire, et l'erreur à éviter.]

## Étape 2 : [action]

[Explique exactement quoi faire, et l'erreur à éviter.]

## Étape 3 : [action]

[Explique exactement quoi faire, et le résultat attendu.]

Tu as réussi ? Montre-moi ton résultat en commentaire, et abonne-toi pour le prochain tuto.` },
    promo: { name: "Promo restaurant", tpl: "promo", aspect: "9:16", text: `# [Nom du restaurant]
Tu as faim ? Voici ce qui t'attend chez [nom du restaurant].

[Plat vedette] : [description qui donne envie en une phrase].

[Prix] FCFA le menu [nom du menu], avec [accompagnement] et [boisson].

Nos incontournables :
- [Plat 1]
- [Plat 2]
- [Plat 3]

Livraison rapide à [quartier ou ville].

Commande maintenant au [numéro de téléphone]. Abonne-toi pour ne rater aucune promo !` },
    motivation: { name: "Motivation", tpl: "neon", aspect: "9:16", text: `# [Phrase choc sur le sujet]
Si tu regardes cette vidéo, ce n'est pas un hasard.

> [Citation inspirante] — [Auteur]

[Une courte histoire ou un constat qui touche : deux ou trois phrases.]

Trois choses à faire dès aujourd'hui :
- [Action 1]
- [Action 2]
- [Action 3]

Commence maintenant, pas demain. Écris « je commence » en commentaire.` },
    actu: { name: "Actualité", tpl: "business", aspect: "9:16", text: `# [Le fait d'actualité en une phrase]
Voici ce qui s'est passé, et pourquoi ça te concerne.

## Ce qui s'est passé

[Les faits : qui, quoi, où, quand. Vérifie chaque chiffre avant de publier.]

## Pourquoi c'est important

[Les conséquences, expliquées simplement.]

## Ce que ça change pour toi

[L'impact concret sur la vie de ton public.]

Tu en penses quoi ? Donne ton avis en commentaire.` },
  };
  const uid = () => Math.random().toString(36).slice(2, 9);

  const EXAMPLE_SCRIPT = `# 3 erreurs qui freinent ta chaîne
Ta chaîne ne décolle pas ? Voici trois erreurs que je vois partout, et comment les corriger.

## Erreur n°1 : une intro trop lente

Première erreur : l'intro trop lente. Dès la première phrase, dis ce que la personne va gagner à rester.

## Erreur n°2 : trop d'idées

1 idée forte par vidéo. Deuxième erreur : vouloir tout dire. Une vidéo, une idée forte. Le reste, garde-le pour la suivante.

## Erreur n°3 : publier au hasard

Ton rythme de publication :
- Choisis des jours fixes
- Prépare quatre vidéos d'avance
- Analyse tes chiffres chaque semaine

Alors, laquelle de ces erreurs tu fais encore ? Dis-le-moi en commentaire, et abonne-toi pour la suite.`;

  // Rythme de montage : nombre de mots lus par plan vidéo (environ 2,6 mots par seconde).
  const PACES = { rapide: { label: "Rapide", words: 9 }, normal: { label: "Normal", words: 17 }, lent: { label: "Lent", words: 32 }, unique: { label: "Un seul plan", words: 17 } };

  const DEFAULT_STATE = {
    brief: { format: "short", ton: "educatif", duree: "60", sujet: "Pourquoi la plupart des petites chaînes YouTube abandonnent avant 100 abonnés, et comment tenir." },
    script: EXAMPLE_SCRIPT,
    mediaSource: "auto",
    pace: "normal",
    aspect: "9:16",
    voice: { mode: "ia", id: "fr_FR-siwis-medium", elId: "", elName: "", model: "qualite", speed: "1" },
    template: "impact",
    brand: { primary: "#F5B700", fit: true, subs: true },
    exp: { fps: "30", quality: "high" },
    scenes: [],
  };

  let state;
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("bachir-ia-v3");
    state = raw ? JSON.parse(raw) : null;
  } catch (e) { state = null; }
  if (!state || !Array.isArray(state.scenes)) state = structuredClone(DEFAULT_STATE);
  for (const k of ["brief", "brand", "exp", "voice"]) state[k] = { ...DEFAULT_STATE[k], ...state[k] };
  if (typeof state.script !== "string") state.script = DEFAULT_STATE.script;
  if (!["auto", "video", "film"].includes(state.mediaSource)) state.mediaSource = "auto";
  if (!Object.hasOwn(PACES, state.pace)) state.pace = "normal";
  if (!["ia", "eleven", "fichier"].includes(state.voice.mode)) state.voice.mode = "ia";
  if (!["0.9", "1", "1.1", "1.2"].includes(String(state.voice.speed))) state.voice.speed = "1";
  if (state.v !== 4) { state.scenes = []; state.v = 4; } // ancien format à scènes graphiques : re-découpé au démarrage
  if (!TEMPLATES[state.template]) state.template = "impact";
  state.scenes.forEach((s) => {
    s.id = s.id || uid();
    s.items = Array.isArray(s.items) ? s.items : [];
    if (OLD_TYPES[s.type]) s.type = OLD_TYPES[s.type];
    if (!TYPES[s.type]) s.type = "texte";
    delete s.speech; // la voix n'est pas conservée d'une session à l'autre
  });
  state.brand.fit = true;

  let TL = null; // chronologie en cache, recalculée après chaque modification
  let saveTimer = null;
  function persist() {
    TL = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
    }, 400);
  }

  // Médias de la session (jamais envoyés au serveur) : fonds de scène, logo, voix
  const media = { bg: new Map(), logo: null, voiceFile: null, voiceTts: false };
  const voiceEl = new Audio();
  voiceEl.preload = "auto";
  let voiceLoaded = false;

  /* ---------------- Utilitaires ---------------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  function wordsOf(s) { return String(s || "").toLowerCase().replace(/[’`]/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }
  function slug(s) { return String(s || "video").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "video"; }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
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
  function status(id, msg, cls = "") { const n = $(id); n.className = (n.classList.contains("hint") ? "hint " : "status ") + cls; n.textContent = msg; }
  function copyText(text, onOk, onFail) {
    try { navigator.clipboard.writeText(text).then(onOk, onFail); } catch (e) { onFail(); }
  }

  /* ---------------- Chronologie ---------------- */
  function timeline() {
    if (TL) return TL;
    const base = state.scenes.map((s) => Math.max(0.5, Number(s.duree) || 5));
    const sum = base.reduce((a, b) => a + b, 0) || 1;
    let durs = base, total = sum;
    if (state.brand.fit && voiceLoaded && isFinite(voiceEl.duration) && voiceEl.duration > 1) {
      total = voiceEl.duration + 0.8;
      durs = base.map((d) => (d * total) / sum);
    }
    const starts = new Array(durs.length);
    const chap = new Array(durs.length);
    let acc = 0, c = 0;
    for (let i = 0; i < durs.length; i++) {
      starts[i] = acc; acc += durs[i];
      if (state.scenes[i].type === "chapitre") c++;
      chap[i] = c;
    }
    TL = { durs, starts, total: durs.length ? Math.max(total, acc) : 1, chap };
    return TL;
  }
  function sceneAt(t) {
    const { starts } = timeline();
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // Temps de parole d'une scène : exact avec la voix générée, estimé sinon.
  const speechOf = (sc, dur) => (sc.speech ? Math.min(sc.speech, dur) : Math.max(0.5, dur - 0.4));

  /* ---------------- Dessin ---------------- */
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const F = { disp: '"Barlow Condensed", "Arial Narrow", sans-serif', body: 'Barlow, "Segoe UI", Arial, sans-serif', mono: '"IBM Plex Mono", Menlo, monospace', serif: '"Playfair Display", Georgia, serif' };

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawCover(src, sw, sh, zoom) {
    const W = cv.width, H = cv.height;
    if (!sw || !sh) return;
    const s = Math.max(W / sw, H / sh) * zoom;
    const w = sw * s, h = sh * s;
    ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
  }

  // Vidéo de fond, bouclée si elle est plus courte que le passage.
  let activeVideo = null;
  function bgSource(bg, lt, opts) {
    if (!bg) return null;
    if (opts.bgCanvas) return { el: opts.bgCanvas, w: opts.bgCanvas.width, h: opts.bgCanvas.height };
    if (exporting) return null;
    const v = bg.el;
    const want = bg.dur ? (lt + (bg.offset || 0)) % bg.dur : 0;
    if (playing) {
      if (activeVideo !== v) {
        if (activeVideo) activeVideo.pause();
        activeVideo = v;
        try { v.currentTime = want; } catch (e) { /* pas encore prêt */ }
        v.play().catch(() => {});
      }
    } else if (Math.abs(v.currentTime - want) > 0.08) {
      try { v.currentTime = want; } catch (e) { /* pas encore prêt */ }
    }
    if (v.readyState < 2) return null;
    return { el: v, w: v.videoWidth, h: v.videoHeight };
  }

  // Sous-titres : blocs courts du texte de la voix, mot courant surligné.
  const chunkCache = new Map();
  function chunks(text) {
    const hit = chunkCache.get(text);
    if (hit) return hit;
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const out = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if (cur.length >= 6 || (/[.,;:!?…]$/.test(w) && cur.length >= 3)) { out.push(cur); cur = []; }
    }
    if (cur.length) { if (out.length && cur.length < 3) out[out.length - 1] = out[out.length - 1].concat(cur); else out.push(cur); }
    if (chunkCache.size > 5000) chunkCache.clear();
    chunkCache.set(text, out);
    return out;
  }
  function wordClock(sc, lt, dur) {
    const ch = chunks(sc.voix);
    const total = ch.reduce((a, c) => a + c.length, 0);
    if (!total) return null;
    const speak = speechOf(sc, dur);
    if (lt > speak + 0.15) return null;
    let w = Math.min(total - 1, Math.floor(clamp(lt / speak) * total));
    let ci = 0;
    while (ci < ch.length - 1 && w >= ch[ci].length) { w -= ch[ci].length; ci++; }
    return { words: ch[ci], current: w };
  }
  function drawCaptions(sc, lt, dur, W, pad, cw, k, land, PRIMARY, INK, centerY, tpl, FG, onMedia) {
    const wc = wordClock(sc, lt, dur);
    if (!wc) return;
    const condensed = tpl.capUpper && !land;
    const size = (land ? 52 : condensed ? 78 : 62) * k;
    ctx.font = condensed ? `800 ${size}px ${F.disp}` : `700 ${size}px ${F.body}`;
    const words = condensed ? wc.words.map((w) => w.toUpperCase()) : wc.words;
    const space = ctx.measureText(" ").width;
    const lines = [];
    let line = [], width = 0;
    words.forEach((w, i) => {
      const ww = ctx.measureText(w).width;
      if (line.length && width + space + ww > cw - 40 * k) { lines.push({ line, width }); line = []; width = 0; }
      width += (line.length ? space : 0) + ww;
      line.push({ w, i, ww });
    });
    if (line.length) lines.push({ line, width });
    const lh = size * 1.18;
    const top = centerY - (lines.length * lh) / 2;
    const style = land && tpl.caption !== "glow" ? "classic" : tpl.caption;
    const base = onMedia || style === "classic" ? "#FFFFFF" : FG;
    if (style === "classic") {
      const bw = Math.max(...lines.map((l) => l.width)) + 60 * k;
      rr(W / 2 - bw / 2, top - 16 * k, bw, lines.length * lh + 32 * k, 12 * k);
      ctx.fillStyle = "rgba(0,0,0,0.62)"; ctx.fill();
    }
    // Contour sombre seulement sur fond foncé ou sur image, pour rester lisible sans salir un fond clair
    const stroke = style !== "classic" && !land && (onMedia || base === "#FFFFFF");
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.lineJoin = "round";
    lines.forEach(({ line, width }, j) => {
      let x = W / 2 - width / 2;
      const y = top + j * lh + lh / 2;
      for (const { w, i, ww } of line) {
        const cur = i === wc.current;
        if (cur && style === "box") {
          rr(x - 10 * k, y - size * 0.55, ww + 20 * k, size * 1.1, 10 * k);
          ctx.fillStyle = PRIMARY; ctx.fill();
          ctx.fillStyle = INK; ctx.fillText(w, x, y + 2 * k);
        } else {
          if (stroke) { ctx.lineWidth = 9 * k; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(w, x, y + 2 * k); }
          if (cur && style === "glow") { ctx.shadowColor = PRIMARY; ctx.shadowBlur = 28 * k; }
          ctx.fillStyle = cur ? PRIMARY : base;
          ctx.fillText(w, x, y + 2 * k);
          ctx.shadowBlur = 0;
        }
        x += ww + space;
      }
    });
  }

  // Vidéo de la scène, ou celle de la scène la plus proche tant que la sienne n'est pas chargée.
  function bgFor(i) {
    const n = state.scenes.length;
    for (let d = 0; d < n; d++) {
      const a = state.scenes[i - d] && media.bg.get(state.scenes[i - d].id);
      if (a) return a;
      const b = d && state.scenes[i + d] && media.bg.get(state.scenes[i + d].id);
      if (b) return b;
    }
    return null;
  }

  // Une image : vidéo réelle plein écran, sous-titres et logo. Aucun carton ni titre graphique.
  function drawFrame(t, opts = {}) {
    const W = cv.width, H = cv.height, land = W > H;
    const k = Math.min(W, H) / 1080;
    const brand = state.brand;
    const TLc = timeline();
    const tpl = TEMPLATES[state.template] || TEMPLATES.impact;
    const PRIMARY = brand.primary || tpl.accent;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const note = (txt) => {
      ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = `600 ${44 * k}px ${F.body}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(txt, W / 2, H / 2);
    };
    if (!state.scenes.length) { note("Colle ton script, puis « Générer ma vidéo »"); ctx.restore(); return; }

    const i = sceneAt(t);
    const lt = Math.max(0, t - TLc.starts[i]), dur = TLc.durs[i], sc = state.scenes[i];
    const src = bgSource(bgFor(i), lt, opts);
    if (src) drawCover(src.el, src.w, src.h, 1);
    else if (!media.bg.size) note("Les vidéos arrivent à l'étape 3");

    if (!opts.clean && brand.subs && sc.voix && sc.voix.trim()) {
      // Voile discret sous les sous-titres, pour les lire sur n'importe quelle vidéo
      const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
      const pad = (land ? 110 : 72) * k;
      drawCaptions(sc, lt, dur, W, pad, W - pad * 2, k, land, PRIMARY, tpl.ink, land ? H - 120 * k : H * 0.74, tpl, "#FFFFFF", true);
    }
    if (media.logo) {
      const pad = (land ? 60 : 56) * k, lh = 72 * k, lw = (media.logo.naturalWidth / media.logo.naturalHeight) * lh;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(media.logo, pad, pad, Math.min(lw, W * 0.3), lh);
    }
    ctx.restore();
  }

  /* ---------------- Lecture de l'aperçu ---------------- */
  let playing = null;
  function updateTimes(t) {
    const { total } = timeline();
    $("t-cur").textContent = fmt(Math.min(t, total));
    $("t-tot").textContent = fmt(total);
    $("v-total").textContent = state.scenes.length ? fmt(total) : "";
  }
  function seek(t) {
    const { total } = timeline();
    t = clamp(t, 0, total);
    $("scrub").value = String(Math.round((t / total) * 10000));
    drawFrame(t);
    updateTimes(t);
    momentLater();
  }
  function scrubTime() { return (Number($("scrub").value) / 10000) * timeline().total; }
  function play() {
    const { total } = timeline();
    const from = scrubTime() >= total - 0.1 ? 0 : scrubTime();
    if (voiceLoaded) {
      try { voiceEl.currentTime = from; } catch (e) { /* ignore */ }
      voiceEl.play().catch(() => {});
    }
    const start = performance.now() - from * 1000;
    const p = { raf: 0 };
    playing = p;
    const step = () => {
      if (playing !== p) return;
      const t = voiceLoaded && !voiceEl.paused ? voiceEl.currentTime : (performance.now() - start) / 1000;
      drawFrame(t);
      $("scrub").value = String(Math.round(clamp(t / total) * 10000));
      updateTimes(t);
      if (t >= total) { stop(); return; }
      p.raf = requestAnimationFrame(step);
    };
    p.raf = requestAnimationFrame(step);
    $("btn-play").textContent = "❚❚";
  }
  function stop() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing = null;
    voiceEl.pause();
    if (activeVideo) { activeVideo.pause(); activeVideo = null; }
    $("btn-play").textContent = "▶";
    momentLater();
  }

  /* ---------------- Vidéos de fond ---------------- */
  async function setBackground(sc, blob, meta = {}) {
    if (!String(blob.type).startsWith("video/")) throw new Error("Seules les vidéos sont acceptées.");
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.muted = true; v.playsInline = true; v.loop = true; v.preload = "auto";
    v.src = url;
    await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => { URL.revokeObjectURL(url); ko(new Error("vidéo illisible dans ce navigateur")); }; });
    v.addEventListener("seeked", () => { if (!playing && !exporting) drawFrame(scrubTime()); });
    const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    // Clip long (film d'archives) : départ au hasard après le générique, pour varier les plans.
    const entry = { kind: "video", el: v, url, blob, dur, offset: dur > 30 ? Math.floor(dur * (0.15 + Math.random() * 0.4)) : 0, ...meta };
    clearBackground(sc);
    media.bg.set(sc.id, entry);
    return entry;
  }
  // Réutilise la vidéo d'un autre passage, en continuant le plan là où il s'était arrêté.
  function shareBackground(sc, from, offset) {
    clearBackground(sc);
    media.bg.set(sc.id, { ...from, offset: from.dur ? offset % from.dur : 0, reused: true });
  }
  function clearBackground(sc) {
    const old = media.bg.get(sc.id);
    media.bg.delete(sc.id);
    if (!old || [...media.bg.values()].some((b) => b.url === old.url)) return;
    URL.revokeObjectURL(old.url);
    old.el.pause();
    old.el.removeAttribute("src"); old.el.load();
  }

  const STOP = new Set(("le la les un une des de du d l et ou mais donc car ni que qui quoi dont où à au aux en dans par pour sur sous avec sans chez ce cet cette ces " +
    "son sa ses mon ma mes ton ta tes notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se y ne pas plus moins très tout tous toute " +
    "toutes est sont été être avoir ai as avons avez ont fait faire comme si alors aussi bien encore déjà là ici voici voilà cela ça qu n j m t s c " +
    "première premier deuxième troisième dis dit vais va vas veux peux quand comment pourquoi chaque").split(" "));
  const kwOf = (text) => [...new Set(wordsOf(text).map((w) => w.replace(/^(?:l|d|qu|j|n|s|c|m|t)'/, "")).filter((w) => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w)))];
  // Mots-clés de recherche : ceux du passage, complétés par ceux du paragraphe s'il est trop court.
  function keywords(sc) {
    if (sc.broll && sc.broll.trim()) return sc.broll.trim();
    let words = kwOf(sc.voix);
    if (words.length < 2) words = [...new Set([...words, ...kwOf(sc.ctx || sc.titre)])];
    return words.slice(0, 3).join(" ");
  }

  /* ---------------- Serveur Bachir IA ---------------- */
  let iaOn = false, brollOn = false, elevenOn = false;
  const API_MSG = {
    ia_non_configuree: "L'IA n'est pas encore activée sur le serveur (clé API absente).",
    ia_saturee: "L'IA est saturée. Réessaie dans une minute.",
    trop_de_demandes: "Limite de demandes atteinte pour cette heure. Réessaie plus tard.",
    ia_refus: "L'IA a refusé de traiter ce texte. Reformule le sujet.",
    ia_cle_invalide: "La clé API configurée sur le serveur est refusée.",
    trop_long: "Texte trop long.",
    script_invalide: "Script vide ou trop long pour l'IA (12 000 caractères maximum).",
    brief_invalide: "Brief incomplet ou trop long (3 000 caractères maximum).",
    broll_non_configure: "B-rolls automatiques non activés : ajoute la clé Pexels (gratuite) sur le serveur.",
    broll_sature: "Pexels limite les recherches : réessaie dans quelques minutes.",
    broll_erreur: "Pexels n'a pas répondu. Réessaie.",
    voix_non_configuree: "Voix ElevenLabs non activées : ajoute ELEVENLABS_API_KEY sur le serveur.",
    voix_cle_invalide: "La clé ElevenLabs configurée sur le serveur est refusée.",
    voix_quota: "Crédits ElevenLabs épuisés : recharge ton abonnement ou choisis une voix gratuite.",
    voix_saturee: "ElevenLabs limite les requêtes simultanées. Réessaie dans une minute.",
    voix_introuvable: "Cette voix n'existe plus sur ton compte ElevenLabs. Choisis-en une autre.",
    voix_erreur: "ElevenLabs n'a pas répondu. Réessaie.",
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

  /* ---------------- Vidéos réalistes : Pexels et films d'archives Wikimedia Commons ---------------- */
  const SOURCES = {
    auto: { label: "Automatique" },
    video: { label: "Vidéos réalistes (Pexels)", pexels: true },
    film: { label: "Films d'archives (Wikimedia)" },
  };
  // Sujet historique : le mode automatique passe alors sur les archives (photos et films d'époque).
  const HISTORIC = /\b(guerres?|mondiale|poilus?|tranchées?|nazis?|hitler|staline|churchill|de gaulle|napol[ée]on|débarquement|résistance|occupation|armistice|colonial[es]?|colonisation|colonies|indépendances?|empires?|empereurs?|pharaons?|antiquité|médiéval|moyen[- ]âge|révolution|monarchie|rois?|reines?|siècles?|archives?|historiques?|histoire|1[5-9]\d\d|20[0-1]\d|années (?:folles|vingt|trente|quarante|cinquante|soixante))\b/iu;
  const isHistoric = (text) => HISTORIC.test(String(text || ""));
  // Commons est surtout décrit en anglais : les mots-clés courants sont traduits pour les archives.
  const EN_PHRASES = [
    [/(?:seconde|deuxième|2e|2nde) guerre mondiale|39-45/g, "World War II"],
    [/(?:première|1re|grande) guerre(?: mondiale)?|14-18/g, "World War I"],
    [/guerre froide/g, "Cold War"], [/moyen[- ]âge/g, "Middle Ages"], [/de gaulle/g, "de Gaulle"],
    [/côte d'ivoire/g, "Ivory Coast"], [/afrique de l'ouest/g, "West Africa"],
  ];
  const EN_WORDS = {
    guerre: "war", guerres: "war", canon: "cannon", canons: "artillery", artillerie: "artillery", soldat: "soldier", soldats: "soldiers",
    char: "tank", chars: "tanks", avion: "aircraft", avions: "aircraft", bombardement: "bombing", bombardements: "bombing", bombardier: "bomber",
    navire: "ship", navires: "ships", bateau: "ship", sous: "", marin: "sailor", marins: "sailors", armée: "army", armées: "army", troupes: "troops",
    débarquement: "landing", tranchée: "trench", tranchées: "trenches", résistance: "resistance", libération: "liberation", occupation: "occupation",
    indépendance: "independence", colonial: "colonial", coloniale: "colonial", colonisation: "colonial", afrique: "Africa", africain: "African",
    africains: "African", président: "president", discours: "speech", foule: "crowd", manifestation: "demonstration", ville: "city", usine: "factory",
    ouvriers: "workers", ouvrier: "worker", paysans: "farmers", agriculture: "agriculture", train: "train", gare: "railway station", mine: "mine",
    mines: "mine", mineurs: "miners", école: "school", enfants: "children", femmes: "women", marché: "market", port: "harbour", révolution: "revolution",
    roi: "king", reine: "queen", empereur: "emperor", empire: "empire", château: "castle", église: "church", pont: "bridge", route: "road",
    voiture: "car", voitures: "cars", explosion: "explosion", incendie: "fire", ruines: "ruins", médecin: "doctor", hôpital: "hospital",
    paris: "Paris", londres: "London", allemagne: "Germany", allemand: "German", allemands: "German", français: "French", française: "French",
    américain: "American", américains: "American", soviétique: "Soviet", japon: "Japan", japonais: "Japanese", normandie: "Normandy",
    alliés: "Allied", allié: "Allied", alliées: "Allied", ennemi: "enemy", ennemis: "enemy", bataille: "battle", combat: "combat", combats: "combat",
    infanterie: "infantry", cavalerie: "cavalry", parachutistes: "paratroopers", fusil: "rifle", fusils: "rifles", mitrailleuse: "machine gun",
    prisonniers: "prisoners", réfugiés: "refugees", victoire: "victory", défilé: "parade", drapeau: "flag", plage: "beach", général: "general",
    pologne: "Poland", italie: "Italy", russie: "Russia", chine: "China", sénégal: "Senegal", ghana: "Ghana", abidjan: "Abidjan", dakar: "Dakar",
    mondiale: "world", histoire: "history", ancien: "old", ancienne: "old", interview: "interview", entretien: "interview", journaliste: "journalist",
  };
  // Renvoie la requête traduite (mots connus seulement) et la version mixte (mots inconnus gardés).
  function toEnglish(q) {
    let s = String(q || "").toLowerCase().replace(/[’`]/g, "'");
    for (const [re, en] of EN_PHRASES) s = s.replace(re, en);
    const known = [], mixed = [];
    for (const raw of s.split(/\s+/)) {
      const w = raw.replace(/^(?:l|d|qu|j|n|s|c|m|t)'/, "");
      if (!w) continue;
      const en = Object.hasOwn(EN_WORDS, w) ? EN_WORDS[w] : /^(?:[A-Z]|1[5-9]\d\d|20[0-2]\d$)/.test(w) ? w : null;
      if (en) known.push(en);
      mixed.push(en || w);
    }
    return { known: [...new Set(known)].join(" "), mixed: [...new Set(mixed)].join(" ") };
  }
  const plainText = (html) => (new DOMParser().parseFromString(String(html || ""), "text/html").body.textContent || "").replace(/\s+/g, " ").trim();
  const isFree = (lic) => /public domain|domaine public|^pd|cc0/i.test(lic || "");

  async function commonsQuery(q) {
    const p = new URLSearchParams({
      action: "query", format: "json", formatversion: "2", origin: "*", generator: "search",
      gsrsearch: `${q} filetype:video`, gsrnamespace: "6", gsrlimit: "15",
      prop: "videoinfo", viprop: "url|size|mime|extmetadata|derivatives", viurlwidth: "1280",
      viextmetadatafilter: "Artist|Credit|LicenseShortName|ObjectName|DateTimeOriginal",
    });
    let r;
    try { r = await fetch("https://commons.wikimedia.org/w/api.php?" + p, { credentials: "omit" }); }
    catch (e) { throw { code: "wm_reseau", message: "Wikimedia Commons est injoignable depuis ce réseau." }; }
    if (!r.ok) throw { code: "wm_erreur", message: "Wikimedia Commons n'a pas répondu. Réessaie." };
    const pages = (((await r.json()) || {}).query || {}).pages || [];
    pages.sort((a, b) => (a.index || 0) - (b.index || 0));
    const out = [];
    for (const pg of pages) {
      const info = pg.videoinfo && pg.videoinfo[0];
      if (!info) continue;
      const md = info.extmetadata || {};
      const credit = {
        src: "wikimedia",
        title: plainText(md.ObjectName && md.ObjectName.value) || String(pg.title || "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
        author: plainText(md.Artist && md.Artist.value) || plainText(md.Credit && md.Credit.value) || "auteur inconnu",
        license: plainText(md.LicenseShortName && md.LicenseShortName.value) || "licence à vérifier",
        page: info.descriptionurl || "",
      };
      const preview = info.thumburl ? info.thumburl.replace(/\/\d+px-([^/]+)$/, "/330px-$1") : "";
      // Seules les versions WebM se décodent partout (l'original est souvent en Ogg Theora).
      const webm = (info.derivatives || []).filter((d) => /^video\/webm/.test(d.type || "") && d.height >= 240 && /^https:\/\/upload\.wikimedia\.org\//.test(d.src || ""));
      if (!webm.length) continue;
      webm.sort((a, b) => a.height - b.height);
      const d = webm.find((x) => x.height >= 480) || webm[webm.length - 1];
      const dur = Number(info.duration) || 0;
      const mb = d.bandwidth && dur ? (d.bandwidth * dur) / 8e6 : 0;
      out.push({ key: "wm:" + pg.title, kind: "video", link: d.src, image: preview, fallback: info.thumburl, dur, mb, credit });
    }
  // Domaine public en premier : aucune obligation de crédit ni de partage à l'identique.
    return out.sort((a, b) => isFree(b.credit.license) - isFree(a.credit.license));
  }
  // Archives : requête traduite, puis élargie (moins de mots) si elle ne donne rien.
  async function commonsSearch(q) {
    const { known, mixed } = toEnglish(q);
    const tries = [...new Set([known, mixed, q, (known || mixed).split(" ")[0]])].filter(Boolean);
    for (const t of tries) {
      const res = await commonsQuery(t);
      if (res.length) return res;
    }
    return [];
  }

  let pexelsBlocked = false;
  async function pexelsSearch(q) {
    const d = await api("/api/broll/recherche", { q, orientation: state.aspect === "16:9" ? "landscape" : "portrait" });
    return (d.videos || []).map((v) => ({ key: "px:v" + v.id, kind: "video", id: v.id, fileId: v.fileId, link: v.link, image: v.image, dur: v.duration,
      credit: { src: "pexels", kind: "Vidéo", author: v.author, license: "Licence Pexels", page: v.page } }));
  }
  async function mediaSearch(q, src) {
    if (src === "film") return commonsSearch(q);
    const res = await pexelsSearch(q);
    const first = q.split(" ")[0];
    return res.length || first === q ? res : pexelsSearch(first);
  }
  async function mediaDownload(m) {
    const direct = async () => {
      const r = await fetch(m.link, { mode: "cors", credentials: "omit" });
      if (!r.ok) throw new Error("http " + r.status);
      return r.blob();
    };
    if (m.credit.src === "wikimedia") {
      try { return new Blob([await direct()], { type: "video/webm" }); }
      catch (e) { throw new Error("téléchargement impossible depuis Wikimedia Commons"); }
    }
    let b = null;
    try { b = await direct(); } catch (e) { /* téléchargement direct refusé : passage par le relais */ }
    if (!b) {
      const r = await fetch(`/api/broll/fichier?id=${encodeURIComponent(m.id)}&f=${encodeURIComponent(m.fileId)}`, { credentials: "same-origin" });
      if (!r.ok) throw new Error("téléchargement de la vidéo impossible");
      b = await r.blob();
    }
    return new Blob([b], { type: "video/mp4" });
  }
  const metaOf = (m) => ({ key: m.key, credit: m.credit });

  const historicScript = () => isHistoric(state.scenes.map((s) => s.voix).join(" ").slice(0, 20000));
  // Sources à essayer, dans l'ordre. Sujet historique : films d'archives d'abord.
  function sourcePlan(sc, historic) {
    const pex = brollOn && !pexelsBlocked;
    if (state.mediaSource === "film" || !pex) return ["film"];
    if (state.mediaSource === "video") return ["video"];
    return historic || isHistoric(sc.voix) ? ["film", "video"] : ["video", "film"];
  }
  const MAX_CLIPS = 120; // vidéos différentes gardées en mémoire au plus
  // Télécharge une vidéo pour les passages qui n'en ont pas (ou qui en réutilisent une), sans doublon.
  // `limit` : nombre de téléchargements par passage. Les passages restants reprennent la vidéo voisine.
  async function autoBroll(limit, report, { fresh = false } = {}) {
    const avoid = new Set(fresh ? [...media.bg.values()].map((b) => b.key) : []);
    if (fresh) for (const s of state.scenes) clearBackground(s);
    const used = new Set([...media.bg.values()].map((b) => b.key).filter(Boolean));
    const historic = historicScript();
    const single = state.pace === "unique";
    const room = Math.max(0, MAX_CLIPS - used.size);
    const todo = state.scenes.map((s, i) => ({ s, i }))
      .filter(({ s }) => { const b = media.bg.get(s.id); return (!b || b.reused) && keywords(s); })
      .slice(0, single ? (used.size ? 0 : 1) : Math.min(limit, room));
    const searches = new Map();
    const find = (q, src) => {
      const k = src + "|" + q;
      if (!searches.has(k)) searches.set(k, mediaSearch(q, src).catch((e) => { searches.delete(k); throw e; }));
      return searches.get(k);
    };
    let done = 0, fail = 0, lastErr = "";
    const worker = async () => {
      while (todo.length) {
        const { s: sc } = todo.shift();
        const q = single ? keywords({ voix: state.scenes.map((x) => x.voix).join(" ").slice(0, 400) }) : keywords(sc);
        let ok = false;
        for (const src of sourcePlan(sc, historic)) {
          if (src === "video" && pexelsBlocked) continue;
          try {
            // Films d'archives au-delà de 60 Mo laissés au choix manuel : trop lourds pour un ajout automatique.
            const items = (await find(q, src)).filter((m) => !(m.mb > 60));
            const pick = items.find((m) => !used.has(m.key) && !avoid.has(m.key)) || items.find((m) => !used.has(m.key));
            if (!pick) continue;
            used.add(pick.key);
            await setBackground(sc, await mediaDownload(pick), metaOf(pick));
            ok = true;
            break;
          } catch (e) {
            lastErr = (e && e.message) || "";
            if (e && e.code === "broll_sature") pexelsBlocked = true;
          }
        }
        if (ok) done++; else fail++;
        report(`Vidéos réalistes : ${done} téléchargée(s)${fail ? `, ${fail} sans résultat` : ""}…`);
      }
    };
    await Promise.all(single ? [worker()] : [worker(), worker(), worker()]);
    fillGaps();
    renderScenes();
    const own = state.scenes.filter((s) => { const b = media.bg.get(s.id); return b && !b.reused; }).length;
    return { done, fail, lastErr, reused: state.scenes.filter((s) => { const b = media.bg.get(s.id); return b && b.reused; }).length, own, empty: !media.bg.size };
  }
  // Chaque passage sans vidéo prolonge le plan du passage précédent : jamais d'écran vide.
  function fillGaps() {
    const { durs } = timeline();
    let prev = null, prevEnd = 0;
    state.scenes.forEach((s, i) => {
      const b = media.bg.get(s.id);
      if (b && !b.reused) { prev = b; prevEnd = (b.offset || 0) + durs[i]; return; }
      if (!prev) return;
      shareBackground(s, prev, prevEnd);
      prevEnd += durs[i];
    });
    // Début de vidéo sans plan : on reprend le premier disponible.
    const first = state.scenes.find((s) => media.bg.get(s.id));
    if (!first) return;
    let off = 0;
    for (const s of state.scenes) {
      if (media.bg.get(s.id)) break;
      shareBackground(s, media.bg.get(first.id), off);
      off += durs[state.scenes.indexOf(s)];
    }
  }

  // Texte de crédits à coller dans la description : obligatoire pour les licences CC BY et CC BY-SA.
  function creditsText() {
    const seen = new Set(), rows = [];
    for (const s of state.scenes) {
      const b = media.bg.get(s.id);
      if (!b || !b.credit || seen.has(b.key)) continue;
      seen.add(b.key);
      const c = b.credit;
      rows.push(c.src === "pexels" ? `${c.kind} : ${c.author || "auteur"} sur Pexels (${c.page})`
        : `« ${c.title} », ${c.author}, ${c.license}, via Wikimedia Commons (${c.page})`);
    }
    if (media.voiceTts && /siwis|mls_1840/.test(state.voice.id)) rows.push(`Voix de synthèse : Piper, voix ${state.voice.id.includes("siwis") ? "siwis" : "mls_1840"} (CC BY 4.0)`);
    return rows.length ? "Crédits images, vidéos et voix :\n" + rows.map((r) => "- " + r).join("\n") : "";
  }

  /* ---------------- Voix ---------------- */
  let voiceMod = null;
  const loadVoiceMod = () => (voiceMod ??= import("/studio/voice.mjs").catch((e) => { voiceMod = null; throw e; }));
  function wavBlob(parts, sampleRate) {
    const total = parts.reduce((a, c) => a + c.length, 0);
    const h = new DataView(new ArrayBuffer(44));
    const str = (o, s) => { for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); h.setUint32(4, 36 + total * 2, true); str(8, "WAVE"); str(12, "fmt ");
    h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
    h.setUint32(24, sampleRate, true); h.setUint32(28, sampleRate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
    str(36, "data"); h.setUint32(40, total * 2, true);
    return new Blob([h.buffer, ...parts], { type: "audio/wav" });
  }
  function toInt16(pcm) {
    const out = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-1, Math.min(1, pcm[i])) * 0x7fff;
    return out;
  }
  function setVoiceFile(file, tts) {
    stop();
    media.voiceFile = file; media.voiceTts = tts;
    voiceLoaded = false; TL = null;
    if (voiceEl.src) URL.revokeObjectURL(voiceEl.src);
    voiceEl.src = URL.createObjectURL(file);
    state.brand.fit = !tts;
    return new Promise((resolve) => {
      voiceEl.onloadedmetadata = () => {
        voiceLoaded = true; TL = null;
        $("btn-voice-clear").hidden = false;
        renderScenes(); seek(0.3);
        resolve();
      };
      voiceEl.onerror = () => { media.voiceFile = null; status("voice-status", "Ce fichier audio ne se lit pas ici. Essaie un MP3, un M4A ou un WAV.", "warn"); resolve(); };
    });
  }
  function clearVoice() {
    stop();
    voiceEl.removeAttribute("src"); voiceEl.load(); voiceLoaded = false; TL = null;
    media.voiceFile = null; media.voiceTts = false; state.brand.fit = true;
    state.scenes.forEach((s) => { delete s.speech; });
    $("voice-file").value = ""; $("btn-voice-clear").hidden = true;
    persist(); renderScenes(); seek(0.3);
  }
  // ElevenLabs : MP3 décodé par le navigateur en échantillons mono.
  const EL_RATE = 24000; // suffisant pour la parole, et deux fois moins de mémoire pour une vidéo de 2 h
  async function elevenSpeak(text, ctxText = {}) {
    let res;
    try {
      res = await fetch("/api/voix/elevenlabs", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ texte: text, voix: state.voice.elId, modele: state.voice.model, vitesse: Math.min(1.2, Number(state.voice.speed) || 1), ...ctxText }),
      });
    } catch (e) { throw { message: "Pas de connexion au serveur." }; }
    if (res.status === 401) { location.href = "/connexion.html?e=expire"; throw { message: "Session expirée." }; }
    if (!res.ok) {
      let code = "voix_erreur";
      try { code = (await res.json()).error || code; } catch (e) { /* corps vide */ }
      throw { code, message: API_MSG[code] || "ElevenLabs n'a pas répondu (" + res.status + ")." };
    }
    const ac = new OfflineAudioContext(1, 1, EL_RATE);
    const buf = await ac.decodeAudioData(await res.arrayBuffer());
    return { pcm: buf.getChannelData(0), sampleRate: buf.sampleRate };
  }

  // Une lecture par passage : la durée de chaque plan vidéo devient celle de sa phrase, plus une courte pause.
  async function generateVoice(report) {
    const eleven = state.voice.mode === "eleven";
    let speakOne, name;
    if (eleven) {
      if (!elevenOn) throw new Error(API_MSG.voix_non_configuree);
      if (!state.voice.elId) throw new Error("Choisis d'abord une voix ElevenLabs.");
      name = `ElevenLabs ${state.voice.elName || ""}`.trim();
      const list = state.scenes;
      speakOne = (i) => elevenSpeak(list[i].voix, { avant: (list[i - 1] && list[i - 1].voix || "").slice(-300), apres: (list[i + 1] && list[i + 1].voix || "").slice(0, 300) });
    } else {
      const V = await loadVoiceMod();
      const meta = V.VOICES.find((v) => v.id === state.voice.id) || V.VOICES[0];
      report(`Chargement de la voix ${meta.name}…`);
      await V.loadVoice(meta.id, (p) => report(`Téléchargement de la voix ${meta.name} : ${Math.round(p * 100)} % (une seule fois, ${meta.mb} Mo)`));
      name = meta.name;
      const speed = Number(state.voice.speed) || 1;
      speakOne = (i) => V.speak(state.scenes[i].voix, meta.id, speed);
    }
    const pause = state.aspect === "9:16" ? 0.2 : 0.35;
    const n = state.scenes.length;
    const parts = new Array(n).fill(null);
    let sr = 0, doneN = 0, next = 0;
    const began = performance.now();
    // Piper tourne dans cet onglet : un passage à la fois. ElevenLabs : deux requêtes en parallèle.
    const worker = async () => {
      while (next < n) {
        const i = next++;
        if (state.scenes[i].voix && state.scenes[i].voix.trim()) {
          const a = await speakOne(i);
          sr = a.sampleRate; parts[i] = toInt16(a.pcm);
        }
        doneN++;
        const elapsed = (performance.now() - began) / 1000, p = doneN / n;
        report(`Voix ${name} : ${Math.round(p * 100)} %` + (doneN > 2 ? ` · reste environ ${fmt(elapsed / p - elapsed)}` : ""));
        await tick();
      }
    };
    await Promise.all(eleven ? [worker(), worker()] : [worker()]);
    if (!sr) throw new Error("Le script n'a pas de texte à lire.");
    const out = [];
    state.scenes.forEach((s, i) => {
      const pcm = parts[i];
      const silence = Math.round(sr * (pcm ? pause : 1));
      if (pcm) out.push(pcm);
      out.push(new Int16Array(silence));
      s.speech = pcm ? pcm.length / sr : 0;
      s.duree = Math.round(((pcm ? pcm.length : 0) + silence) / sr * 1000) / 1000;
    });
    persist();
    await setVoiceFile(new File([wavBlob(out, sr)], "voix-bachir.wav", { type: "audio/wav" }), true);
    return { seconds: timeline().total, voice: name };
  }

  async function renderVoices() {
    const box = $("voices");
    box.replaceChildren();
    const select = (mode, id) => {
      state.voice.mode = mode;
      if (id && mode === "ia") state.voice.id = id;
      persist();
      [...box.querySelectorAll(".voice")].forEach((c) => c.setAttribute("aria-checked", String(c.dataset.mode === mode && (mode === "fichier" || c.dataset.id === (mode === "eleven" ? state.voice.elId : state.voice.id)))));
      $("own-voice").hidden = mode !== "fichier";
      $("btn-voice").hidden = mode === "fichier";
      $("el-opts").hidden = mode !== "eleven";
    };
    const card = (mode, id, title, sub, info, onListen) => {
      const kids = [el("b", { text: title }), el("small", { text: sub })];
      if (info) kids.push(info);
      let listen = null;
      if (onListen) { listen = el("button", { type: "button", class: "btn small listen", text: "▶ Écouter" }); kids.push(listen); }
      const c = el("div", { class: "voice" + (mode === "eleven" ? " el" : ""), role: "radio", tabindex: "0" }, ...kids);
      c.dataset.mode = mode; if (id) c.dataset.id = id;
      const pick = () => { if (mode === "eleven") { state.voice.elId = id; state.voice.elName = title; } select(mode, id); };
      c.addEventListener("click", (e) => { if (e.target !== listen) pick(); });
      c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
      if (listen) listen.addEventListener("click", async () => { pick(); listen.disabled = true; try { await onListen(); } finally { listen.disabled = false; } });
      return c;
    };
    const play = (a) => new Audio(URL.createObjectURL(wavBlob([toInt16(a.pcm)], a.sampleRate))).play().catch(() => {});

    // ElevenLabs en premier quand la clé est configurée : les voix les plus naturelles.
    if (elevenOn) {
      box.append(el("p", { class: "vgroup", text: "ElevenLabs · voix ultra-réalistes" }));
      const wrap = el("div", { class: "voices-el" }, el("small", { class: "hint", text: "Chargement des voix ElevenLabs…" }));
      box.append(wrap);
      fetch("/api/voix/elevenlabs", { credentials: "same-origin" })
        .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw { message: API_MSG[d.error] || "Liste des voix ElevenLabs indisponible." }; return d.voices || []; })
        .then((list) => {
          wrap.replaceChildren(...list.map((v) => card("eleven", v.id, v.name, v.detail || (v.perso ? "Ta voix clonée" : "Voix ElevenLabs"), null, async () => {
            status("voice-status", `Lecture de ${v.name}…`);
            try { play(await elevenSpeak(V_SAMPLE)); status("voice-status", ""); }
            catch (e) { status("voice-status", (e && e.message) || "Lecture impossible.", "warn"); }
          })));
          if (!list.length) wrap.textContent = "Aucune voix sur ton compte ElevenLabs : ajoute-en depuis la Voice Library.";
          if (!state.voice.elId && list[0] && state.voice.mode === "eleven") { state.voice.elId = list[0].id; state.voice.elName = list[0].name; }
          select(state.voice.mode, state.voice.mode === "ia" ? state.voice.id : null);
        })
        .catch((e) => { wrap.textContent = (e && e.message) || "Liste des voix ElevenLabs indisponible."; });
    }

    box.append(el("p", { class: "vgroup", text: "Voix gratuites · calculées sur ton ordinateur" }));
    let V = null;
    try { V = await loadVoiceMod(); } catch (e) {
      box.append(el("small", { class: "hint", text: "Le moteur de voix gratuit ne se charge pas dans ce navigateur (Chrome ou Edge à jour requis)." }));
    }
    if (V) {
      for (const v of V.VOICES) {
        const cached = await V.isCached(v.id);
        const info = el("small", { text: cached ? "Prête sur cet ordinateur" : `${v.mb} Mo à télécharger une fois` });
        box.append(card("ia", v.id, v.name, `${v.genre} · ${v.detail}`, info, async () => {
          try {
            await V.loadVoice(v.id, (p) => status("voice-status", `Téléchargement de ${v.name} : ${Math.round(p * 100)} %`));
            status("voice-status", `Lecture de ${v.name}…`);
            play(await V.speak(V_SAMPLE, v.id, Number(state.voice.speed) || 1));
            info.textContent = "Prête sur cet ordinateur";
            status("voice-status", "");
          } catch (e) {
            status("voice-status", "Impossible de charger cette voix : " + ((e && e.message) || "erreur") + ".", "warn");
          }
        }));
      }
    }
    box.append(card("fichier", null, "Ma voix", "Ton enregistrement : la voix la plus crédible"));
    if (state.voice.mode === "eleven" && !elevenOn) state.voice.mode = V ? "ia" : "fichier";
    if (state.voice.mode === "ia" && !V) state.voice.mode = "fichier";
    select(state.voice.mode, state.voice.mode === "ia" ? state.voice.id : null);
  }
  const V_SAMPLE = "Salut ! Voici la voix que tu as choisie pour ta prochaine vidéo.";

  /* ---------------- Panneau Vidéos : état global et vidéo du moment ---------------- */
  function renderScenes() {
    const n = state.scenes.length;
    const own = new Set(), reused = state.scenes.filter((s) => { const b = media.bg.get(s.id); if (b && !b.reused) own.add(b.key || b.url); return b && b.reused; }).length;
    const missing = state.scenes.filter((s) => !media.bg.has(s.id)).length;
    let note;
    if (!n) note = "Les vidéos sont choisies automatiquement quand tu génères ta vidéo.";
    else if (!media.bg.size) note = "Aucune vidéo pour l'instant : clique sur « Trouver les vidéos ».";
    else note = `${own.size} vidéo(s) réaliste(s) différente(s)` + (state.pace === "unique" ? ", un seul plan du début à la fin." : reused ? `, certaines prolongées sur ${reused} passage(s) : « Plus de variété » en ajoute.` : ", une par passage.") + (missing ? ` ${missing} passage(s) sans vidéo.` : "");
    if (!brollOn) note += " Vidéos modernes (gens, objets, interviews) : ajoute la clé Pexels sur le serveur ; en attendant, seuls les films d'archives sont disponibles.";
    $("broll-note").textContent = note;
    $("btn-broll-more").hidden = !n || state.pace === "unique";
    refreshDerived();
    updateTimes(scrubTime());
    renderMoment(true);
  }

  // Vidéo à l'endroit de la tête de lecture : remplaçable par une recherche ou par ta propre vidéo.
  let momentIdx = -1, momentTimer = null;
  function renderMoment(force = false) {
    if (!state.scenes.length) { $("moment").hidden = true; return; }
    const i = sceneAt(scrubTime());
    if (i === momentIdx && !force) return;
    momentIdx = i;
    $("moment").hidden = false;
    const s = state.scenes[i], bg = bgFor(i);
    const { starts } = timeline();
    $("cur-time").textContent = fmt(starts[i]);
    $("cur-text").textContent = "« " + String(s.voix || s.titre || "").slice(0, 140) + (String(s.voix || "").length > 140 ? "… »" : " »");
    const th = $("cur-thumb");
    th.replaceChildren();
    if (bg) {
      th.append(el("video", { src: bg.url, muted: true, playsInline: true, preload: "metadata" }));
      const c = bg.credit;
      th.title = c ? (c.src === "pexels" ? `Vidéo de ${c.author} sur Pexels` : `${c.title} · ${c.author} · ${c.license}`) : "Ta vidéo";
      th.append(el("span", { class: "tag", text: c && c.src === "wikimedia" ? "Archive" : c ? "Pexels" : "Ta vidéo" }));
    } else th.append(el("span", { text: "Pas de vidéo" }));
    $("cur-kw").value = s.broll || "";
    $("cur-kw").placeholder = keywords({ ...s, broll: "" }) || "mots-clés (ex. WW2 artillery)";
    $("cur-results").hidden = true;
  }
  const momentLater = () => { clearTimeout(momentTimer); momentTimer = setTimeout(() => { if (!playing && !exporting) renderMoment(); }, 200); };

  /* ---------------- Textes dérivés : prompteur, chapitres, plage d'export ---------------- */
  function hms(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (timeline().total >= 3600 ? `${String(h).padStart(2, "0")}:` : "") + `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  function chaptersText() {
    const { starts } = timeline();
    const rows = [];
    state.scenes.forEach((s, i) => { if (s.type === "chapitre") rows.push({ t: starts[i], titre: s.titre || "Chapitre" }); });
    if (!rows.length) return { text: "", ok: false, note: "Ajoute des scènes « Chapitre » (## dans le script) pour générer les chapitres YouTube." };
    if (rows[0].t >= 10) rows.unshift({ t: 0, titre: (state.scenes[0] && state.scenes[0].titre) || "Introduction" });
    rows[0].t = 0;
    const short = rows.some((r, j) => j < rows.length - 1 && rows[j + 1].t - r.t < 10);
    const ok = rows.length >= 3 && !short;
    const note = ok ? "Colle ces lignes dans la description YouTube." : "YouTube exige au moins 3 chapitres, le premier à 00:00, de 10 secondes minimum chacun.";
    return { text: rows.map((r) => `${hms(r.t)} ${r.titre}`).join("\n"), ok, note };
  }
  let derivedTimer = null;
  function refreshDerived() {
    clearTimeout(derivedTimer);
    derivedTimer = setTimeout(() => {
      $("prompter").textContent = state.scenes.filter((s) => s.voix).map((s) => s.voix).join("\n\n") || "Aucune voix off dans les scènes.";
      const c = chaptersText();
      $("chapters").value = c.text;
      $("chapters-note").textContent = c.note;
      $("credits").value = creditsText() || "Aucun média de Pexels ou de Wikimedia Commons dans cette vidéo.";
      fillRange();
    }, 150);
  }
  function fillRange() {
    const n = state.scenes.length;
    for (const id of ["rg-from", "rg-to"]) {
      const sel = $(id);
      const prev = sel.value;
      const { starts } = timeline();
      sel.replaceChildren(...state.scenes.map((s, i) => el("option", { value: String(i), text: `${fmt(starts[i])} · ${String(s.voix || s.titre).slice(0, 42)}` })));
      if (prev && Number(prev) < n) sel.value = prev;
      else sel.value = id === "rg-from" ? "0" : String(Math.max(0, n - 1));
    }
    rangeInfo();
  }
  function getRange() {
    if ($("rg-all").checked || !state.scenes.length) return { from: 0, to: Math.max(0, state.scenes.length - 1) };
    let a = Number($("rg-from").value) || 0, b = Number($("rg-to").value) || 0;
    if (b < a) [a, b] = [b, a];
    return { from: a, to: b };
  }
  function rangeInfo() {
    const { starts, durs } = timeline();
    if (!state.scenes.length) { $("rg-info").textContent = ""; return; }
    const { from, to } = getRange();
    const d = starts[to] + durs[to] - starts[from];
    const vertical = state.aspect === "9:16";
    let msg = `Durée exportée : ${fmt(d)}.`;
    if (vertical && d > 180) msg += " Au-delà de 3 minutes, YouTube ne le classe pas en Short (TikTok accepte jusqu'à 60 minutes).";
    $("rg-info").textContent = msg;
    $("rg-pick").hidden = $("rg-all").checked;
  }

  /* ---------------- Modèles ---------------- */
  function applyTemplate(id) {
    const t = TEMPLATES[id];
    if (!t) return;
    state.template = id;
    state.brand.primary = t.accent;
    $("br-primary").value = t.accent;
    persist();
    [...$("tpls").children].forEach((c) => c.setAttribute("aria-checked", String(c.dataset.id === id)));
    seek(scrubTime());
  }
  // Aperçu du style de sous-titres sur un fond façon vidéo.
  function renderTemplates() {
    const box = $("tpls");
    box.replaceChildren();
    for (const [id, t] of Object.entries(TEMPLATES)) {
      const prev = el("span", { class: "tprev" });
      const cap = el("span", { class: "tcap" });
      const w1 = el("span", { text: t.capUpper ? "LE MOT " : "le mot " });
      const w2 = el("span", { text: t.capUpper ? "SURLIGNÉ" : "surligné" });
      w1.style.color = "#fff";
      if (t.caption === "box") { w2.style.background = t.accent; w2.style.color = t.ink; w2.style.padding = "0 3px"; w2.style.borderRadius = "3px"; }
      else { w2.style.color = t.accent; if (t.caption === "glow") w2.style.textShadow = `0 0 8px ${t.accent}`; }
      if (t.caption === "classic") { cap.style.background = "rgba(0,0,0,.6)"; cap.style.padding = "2px 6px"; cap.style.borderRadius = "4px"; }
      cap.append(w1, w2);
      prev.append(cap);
      const card = el("button", { type: "button", class: "tpl", role: "radio", title: `Sous-titres ${t.name}` }, prev, el("span", { class: "tname", text: t.name }));
      card.dataset.id = id;
      card.setAttribute("aria-checked", String(id === state.template));
      card.addEventListener("click", () => applyTemplate(id));
      box.append(card);
    }
    const sel = $("s-model");
    sel.replaceChildren(el("option", { value: "", text: "Choisir une structure…" }),
      ...Object.entries(SCRIPT_TEMPLATES).map(([id, m]) => el("option", { value: id, text: `${m.name} · ${m.aspect === "9:16" ? "Short" : "Long"}` })));
  }
  $("btn-model").addEventListener("click", () => {
    const m = SCRIPT_TEMPLATES[$("s-model").value];
    if (!m) { status("script-status", "Choisis d'abord une structure de script.", "warn"); return; }
    const current = String(state.script || "").trim();
    if (current && current !== EXAMPLE_SCRIPT.trim() && !window.confirm("Remplacer ton script actuel par ce modèle ?")) return;
    state.script = m.text;
    $("s-script").value = m.text;
    applyTemplate(m.tpl);
    setAspect(m.aspect);
    persist();
    status("script-status", `Modèle « ${m.name} » chargé. Remplace chaque partie entre [crochets] par ton contenu, puis clique sur « Générer ma vidéo ».`, "ok");
    $("s-script").focus();
  });

  /* ---------------- Réglages ---------------- */
  function bindInputs() {
    const b = state.brief;
    $("b-format").value = b.format; $("b-ton").value = b.ton; $("b-duree").value = String(b.duree); $("b-sujet").value = b.sujet;
    $("b-format").addEventListener("change", (e) => { b.format = e.target.value; persist(); });
    $("b-ton").addEventListener("change", (e) => { b.ton = e.target.value; persist(); });
    $("b-duree").addEventListener("change", (e) => { b.duree = e.target.value; persist(); });
    $("b-sujet").addEventListener("input", (e) => { b.sujet = e.target.value; persist(); });

    const br = state.brand;
    $("br-primary").value = br.primary;
    $("subs").checked = !!br.subs;
    $("subs").addEventListener("change", (e) => { br.subs = e.target.checked; persist(); seek(scrubTime()); });
    $("s-script").value = state.script;
    $("s-script").addEventListener("input", (e) => { state.script = e.target.value; persist(); });
    $("s-source").value = state.mediaSource;
    $("s-source").addEventListener("change", (e) => { state.mediaSource = e.target.value; persist(); });
    $("s-pace").value = state.pace;
    $("s-pace").addEventListener("change", (e) => {
      state.pace = e.target.value; persist();
      status("broll-note", "Rythme changé : clique sur « Générer ma vidéo » pour remonter la vidéo à ce rythme.");
    });
    $("el-model").value = state.voice.model;
    $("el-model").addEventListener("change", (e) => { state.voice.model = e.target.value; persist(); });
    $("v-speed").value = state.voice.speed;
    $("v-speed").addEventListener("change", (e) => { state.voice.speed = e.target.value; persist(); });
    [["br-primary", "primary"]].forEach(([id, key]) =>
      $(id).addEventListener("input", (e) => { br[key] = e.target.value; persist(); seek(scrubTime()); }));
    $("br-logo").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const img = new Image();
      img.onload = () => { media.logo = img; $("br-logo-prev").src = img.src; $("br-logo-prev").hidden = false; seek(scrubTime()); };
      img.src = URL.createObjectURL(f);
    });
    $("ex-fps").value = state.exp.fps; $("ex-quality").value = state.exp.quality;
    $("ex-fps").addEventListener("change", (e) => { state.exp.fps = e.target.value; persist(); });
    $("ex-quality").addEventListener("change", (e) => { state.exp.quality = e.target.value; persist(); });
    $("rg-all").addEventListener("change", rangeInfo);
    $("rg-from").addEventListener("change", rangeInfo);
    $("rg-to").addEventListener("change", rangeInfo);
  }
  function setAspect(a) {
    state.aspect = a;
    const land = a === "16:9";
    cv.width = land ? 1920 : 1080; cv.height = land ? 1080 : 1920;
    $("stage").classList.toggle("land", land);
    $("ar-portrait").setAttribute("aria-pressed", String(!land));
    $("ar-land").setAttribute("aria-pressed", String(land));
    $("moment").classList.toggle("land", land);
    persist();
    rangeInfo();
    seek(scrubTime());
  }

  /* ---------------- Découpage du script en passages (un plan vidéo par passage) ---------------- */
  const BULLET = /^([-•*–]|\d+[.)])\s+/;
  function normalize(out) {
    const arr = out && Array.isArray(out.scenes) ? out.scenes : [];
    return arr.slice(0, 200).map((s) => ({
      type: TYPES[s && s.type] ? s.type : "texte",
      titre: String((s && s.titre) || "").slice(0, 120),
      items: Array.isArray(s && s.items) ? s.items.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 5) : [],
      voix: String((s && s.voix) || "").slice(0, 2000),
    }));
  }
  const durFor = (voix) => clamp(Math.round(wordsOf(voix).length / 2.6 + 0.6), 2, 60);
  // Tout le script est lu. Les repères (#, ##, >, -) sont retirés ; « ## » marque un chapitre YouTube.
  function segmentScript(text) {
    const raw = String(text || "").replace(/\r/g, "").trim();
    if (!raw) return [];
    const target = (PACES[state.pace] || PACES.normal).words;
    const blocks = [];
    let para = [];
    const flush = () => { if (para.length) { blocks.push({ text: para.join(" ") }); para = []; } };
    for (const line of raw.split("\n")) {
      const l = line.trim();
      if (!l) { flush(); continue; }
      const h = /^(#{1,3})\s+(.*)$/.exec(l);
      if (h) { flush(); blocks.push({ text: h[2].trim(), chapter: h[1] === "##", heading: true }); continue; }
      let x = l.replace(/^>\s?/, "");
      if (BULLET.test(x)) { x = x.replace(BULLET, ""); if (!/[.,;:!?…]$/.test(x)) x += "."; }
      para.push(x);
    }
    flush();
    const out = [];
    for (const b of blocks) {
      let t = b.text.replace(/\s+[—–-]\s+([^—–-]+)$/, ", $1.");
      if (b.heading && !/[.!?…:]$/.test(t)) t += ".";
      const sentences = (t.match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) || [t]).map((x) => x.trim()).filter(Boolean);
      // Phrases regroupées jusqu'au rythme choisi ; une phrase trop longue est coupée aux virgules.
      const pieces = [];
      for (const sen of sentences) {
        if (wordsOf(sen).length <= target * 1.6) { pieces.push(sen); continue; }
        let cur = "";
        for (const part of sen.split(/(?<=[,;:])\s+/)) {
          if (cur && wordsOf(cur + " " + part).length > target) { pieces.push(cur); cur = part; } else cur = cur ? cur + " " + part : part;
        }
        if (cur) pieces.push(cur);
      }
      let cur = "";
      const first = out.length;
      for (const pc of pieces) {
        if (cur && wordsOf(cur + " " + pc).length > target) { out.push(cur); cur = pc; } else cur = cur ? cur + " " + pc : pc;
      }
      if (cur) out.push(cur);
      for (let j = first; j < out.length; j++) {
        out[j] = { id: uid(), type: b.chapter && j === first ? "chapitre" : "texte", titre: b.heading ? b.text : "", voix: out[j], ctx: b.text.slice(0, 300), broll: "", duree: durFor(out[j]) };
      }
    }
    return out.slice(0, 4000);
  }

  function buildScenes() {
    const text = String(state.script || "").trim();
    if (!text) throw new Error("Colle d'abord ton script.");
    const scenes = segmentScript(text);
    // Les vidéos déjà téléchargées sont gardées et redistribuées sur les nouveaux passages.
    const keep = [...new Map([...media.bg.values()].filter((b) => !b.reused).map((b) => [b.url, b])).values()];
    for (const s of state.scenes) media.bg.delete(s.id);
    if (media.voiceFile) clearVoice();
    state.scenes = scenes;
    if (state.pace === "unique") keep.splice(1);
    keep.slice(0, scenes.length).forEach((b, j) => media.bg.set(scenes[Math.floor((j * scenes.length) / keep.length)].id, { ...b, reused: false }));
    for (const b of keep.slice(scenes.length)) { URL.revokeObjectURL(b.url); b.el.pause(); }
    persist(); seek(0.5);
    return scenes.length;
  }

  const stepState = (id, cls) => { $(id).className = cls; };
  $("btn-generate").addEventListener("click", async () => {
    const btn = $("btn-generate");
    btn.disabled = true;
    $("gen-steps").hidden = false;
    ["st-scenes", "st-voice", "st-broll"].forEach((id) => stepState(id, ""));
    const report = (m) => status("script-status", m);
    const notes = [];
    try {
      stepState("st-scenes", "run"); report("Préparation du texte…");
      buildScenes();
      stepState("st-scenes", "done");

      if (state.voice.mode !== "fichier") {
        stepState("st-voice", "run");
        const v = await generateVoice(report);
        stepState("st-voice", "done");
        notes.push(`Voix ${v.voice} : ${fmt(v.seconds)}.`);
      } else {
        stepState("st-voice", "skip");
        notes.push("Importe ton enregistrement dans « Voix » : la vidéo se calera dessus.");
      }

      stepState("st-broll", "run");
      const b = await autoBroll(40, report);
      stepState("st-broll", "done");
      if (b.empty) notes.push("Aucune vidéo trouvée" + (b.lastErr ? ` (${b.lastErr})` : "") + " : change de source ou importe ta vidéo dans l'étape 3.");
      else if (b.reused && state.pace !== "unique") notes.push("Clique sur « Plus de variété » pour remplacer les plans prolongés.");
      if (state.scenes.some((s) => { const x = media.bg.get(s.id); return x && x.credit && x.credit.src === "wikimedia" && !isFree(x.credit.license); }))
        notes.push("Certaines archives exigent un crédit : copie-le depuis « Publication YouTube ».");
      seek(0.3);
      status("script-status", `Vidéo prête : ${fmt(timeline().total)}. ${notes.join(" ")} Vérifie l'aperçu, puis exporte.`, b.empty ? "warn" : "ok");
    } catch (e) {
      ["st-scenes", "st-voice", "st-broll"].forEach((id) => { if ($(id).className === "run") stepState(id, ""); });
      status("script-status", (e && e.message) || "La génération a échoué.", "warn");
    } finally {
      btn.disabled = false;
    }
  });

  $("btn-voice").addEventListener("click", async () => {
    const btn = $("btn-voice");
    if (!state.scenes.length) { try { buildScenes(); } catch (e) { status("voice-status", e.message, "warn"); return; } }
    btn.disabled = true;
    try {
      const v = await generateVoice((m) => status("voice-status", m));
      fillGaps(); renderScenes();
      status("voice-status", `Voix ${v.voice} générée : ${fmt(v.seconds)}. Les vidéos sont calées dessus.`, "ok");
    } catch (e) {
      status("voice-status", "La voix n'a pas pu être générée : " + ((e && e.message) || "erreur") + ".", "warn");
    } finally { btn.disabled = false; }
  });
  $("btn-voice-clear").addEventListener("click", () => { clearVoice(); status("voice-status", "Voix retirée."); });
  $("voice-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    state.scenes.forEach((s) => { delete s.speech; });
    await setVoiceFile(f, false);
    status("voice-status", `${f.name} · ${fmt(voiceEl.duration || 0)}. Les vidéos sont calées proportionnellement sur ta voix.`, "ok");
  });
  $("btn-copy").addEventListener("click", () => {
    copyText($("prompter").textContent, () => status("voice-status", "Texte copié.", "ok"), () => {
      const r = document.createRange(); r.selectNodeContents($("prompter"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      status("voice-status", "Texte sélectionné : copie-le avec Ctrl+C.");
    });
  });
  async function brollButton(btn, opts) {
    if (!state.scenes.length) { try { buildScenes(); } catch (e) { status("broll-note", e.message, "warn"); return; } }
    btn.disabled = true;
    try {
      const b = await autoBroll(40, (m) => status("broll-note", m), opts);
      if (b.empty) status("broll-note", "Aucune vidéo trouvée" + (b.lastErr ? ` : ${b.lastErr}` : "") + ". Change de source, ou cherche avec d'autres mots-clés ci-dessous.", "warn");
      seek(scrubTime());
    } finally { btn.disabled = false; }
  }
  $("btn-broll-all").addEventListener("click", () => brollButton($("btn-broll-all"), { fresh: true }));
  $("btn-broll-more").addEventListener("click", () => brollButton($("btn-broll-more")));

  // Remplacer la vidéo du moment affiché
  $("cur-kw").addEventListener("input", (e) => { const s = state.scenes[momentIdx]; if (s) { s.broll = e.target.value; persist(); } });
  $("cur-file").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0], s = state.scenes[momentIdx];
    if (!f || !s) return;
    try { await setBackground(s, f, { key: "file:" + f.name + f.size }); fillGaps(); renderScenes(); seek(scrubTime()); }
    catch (err) { status("broll-note", err.message, "warn"); }
    e.target.value = "";
  });
  $("cur-search").addEventListener("click", async () => {
    const s = state.scenes[momentIdx];
    if (!s) return;
    const q = keywords(s);
    const results = $("cur-results"), search = $("cur-search");
    if (!q) return;
    const src = sourcePlan(s, historicScript())[0];
    search.disabled = true; results.hidden = false; results.textContent = `Recherche : ${SOURCES[src].label}…`;
    try {
      const found = await mediaSearch(q, src);
      results.replaceChildren(...found.map((m) => {
        const c = m.credit;
        const tip = c.src === "pexels" ? `Vidéo de ${c.author} sur Pexels` : `${c.title} · ${c.author} · ${c.license}${m.mb ? ` · environ ${Math.ceil(m.mb)} Mo` : ""}`;
        const img = el("img", { src: m.image, alt: c.title || q, loading: "lazy" });
        if (m.fallback) img.addEventListener("error", () => { if (img.src !== m.fallback) img.src = m.fallback; }, { once: true });
        const tags = [el("span", { class: "rtag", text: `▶${m.dur ? " " + fmt(m.dur) : ""}` })];
        if (c.src === "wikimedia") tags.push(el("span", { class: "rlic" + (isFree(c.license) ? " free" : ""), text: isFree(c.license) ? "Dom. public" : c.license }));
        const b = el("button", { type: "button", title: tip }, img, ...tags);
        b.addEventListener("click", async () => {
          results.textContent = m.mb > 60 ? `Téléchargement du film (environ ${Math.ceil(m.mb)} Mo), patiente…` : "Téléchargement…";
          try { await setBackground(s, await mediaDownload(m), metaOf(m)); fillGaps(); renderScenes(); seek(scrubTime()); }
          catch (e) { results.textContent = e.message; }
        });
        return b;
      }));
      if (!found.length) results.textContent = src === "film"
        ? "Aucun film d'archives : essaie des mots-clés en anglais (ex. « WW2 artillery », « 1960 Africa »)."
        : "Aucun résultat : essaie d'autres mots-clés (en anglais, Pexels trouve davantage).";
    } catch (e) { results.textContent = (e && e.message) || "Recherche impossible."; }
    finally { search.disabled = false; }
  });

  $("btn-gen").addEventListener("click", async () => {
    if (!iaOn) { status("gen-status", API_MSG.ia_non_configuree + " Écris ton script toi-même et colle-le ci-dessus.", "warn"); return; }
    if (!String(state.brief.sujet).trim()) { status("gen-status", "Décris d'abord le sujet de la vidéo.", "warn"); return; }
    const btn = $("btn-gen");
    btn.disabled = true;
    status("gen-status", "Claude écrit le script… (jusqu'à une minute pour une vidéo de 10 minutes)");
    try {
      const b = state.brief;
      const out = await api("/api/script", { format: b.format, ton: b.ton, duree: Number(b.duree), sujet: String(b.sujet).slice(0, 3000) });
      const scenes = normalize(out);
      if (scenes.length < 2) throw { message: "La réponse était vide. Relance la génération." };
      // Le script écrit par Claude remplace le script courant ; « Générer ma vidéo » fait le reste.
      state.script = scenes.map((s) => (s.type === "chapitre" ? `## ${s.titre}` : s.type === "liste" ? `${s.titre} :\n${s.items.map((x) => "- " + x).join("\n")}` : s.voix)).filter(Boolean).join("\n\n");
      $("s-script").value = state.script;
      setAspect(b.format === "long" ? "16:9" : "9:16");
      persist();
      status("gen-status", "Script écrit et placé dans la zone ci-dessus. Relis-le à ta façon, puis clique sur « Générer ma vidéo ».", "ok");
    } catch (e) {
      status("gen-status", (e && e.message) || "La génération a échoué. Réessaie.", "warn");
    } finally { btn.disabled = false; }
  });

  /* ---------------- Export vidéo (WebCodecs + Mediabunny) ---------------- */
  let mbPromise = null;
  const loadMB = () => (mbPromise ??= import("/vendor/mediabunny.min.mjs"));
  let exporting = false, cancelExport = null, lastBlob = null, lastUrl = null;
  const expStatus = (m, c) => status("exp-status", m, c);
  function fileBase() { const s = state.scenes[0]; return slug(s && (s.titre || s.voix.split(" ").slice(0, 7).join(" "))) + (state.aspect === "9:16" ? "-short" : ""); }

  function clipSample(s, t0, t1) {
    const sr = s.sampleRate;
    let start = 0, end = s.numberOfFrames;
    if (s.timestamp < t0) start = Math.min(end, Math.round((t0 - s.timestamp) * sr));
    if (s.timestamp + s.duration > t1) end = Math.max(start, Math.round((t1 - s.timestamp) * sr));
    if (end <= start) return null;
    const out = start > 0 || end < s.numberOfFrames ? s.trim(start, end) : s.clone();
    out.setTimestamp(Math.max(0, out.timestamp - t0));
    return out;
  }

  async function exportVideo() {
    if (exporting) return;
    if (!state.scenes.length) { expStatus("Génère d'abord ta vidéo.", "warn"); return; }
    if (!("VideoEncoder" in window)) { expStatus("Ce navigateur ne sait pas encoder de vidéo. Utilise Chrome ou Edge à jour sur ordinateur.", "warn"); return; }
    stop();
    const { starts, durs } = timeline();
    const { from, to } = getRange();
    const t0 = starts[from], t1 = starts[to] + durs[to], span = t1 - t0;
    const fps = Number(state.exp.fps) || 30;
    let MB, vcodec = null;
    try {
      MB = await loadMB();
      const q0 = state.exp.quality === "standard" ? MB.QUALITY_MEDIUM : MB.QUALITY_HIGH;
      for (const c of ["avc", "vp9"]) {
        if (await MB.canEncodeVideo(c, { width: cv.width, height: cv.height, quality: q0 })) { vcodec = c; break; }
      }
    } catch (e) { mbPromise = null; }
    if (!vcodec) { expStatus("Ce navigateur ne sait pas encoder de vidéo. Utilise Chrome ou Edge à jour sur ordinateur.", "warn"); return; }
    // H.264 + AAC en MP4 (accepté partout) ; sinon VP9 + Opus en WebM (accepté par YouTube)
    const ext = vcodec === "avc" ? "mp4" : "webm";
    const name = `${fileBase()}${from || to < state.scenes.length - 1 ? `-extrait-${Math.floor(t0)}s` : ""}.${ext}`;

    // Fichier de destination : écriture directe sur le disque si le navigateur le permet
    let writable = null;
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: `Vidéo ${ext.toUpperCase()}`, accept: { [`video/${ext}`]: [`.${ext}`] } }] });
        writable = await handle.createWritable();
      } catch (e) {
        if (e && e.name === "AbortError") { expStatus("Export annulé."); return; }
        writable = null;
      }
    }
    if (!writable && span > 20 * 60) {
      expStatus("Au-delà de 20 minutes, la vidéo doit s'écrire directement sur le disque : utilise Chrome ou Edge sur ordinateur.", "warn");
      return;
    }

    exporting = true;
    let cancelled = false;
    cancelExport = () => { cancelled = true; };
    $("btn-export").disabled = true; $("btn-play").disabled = true; $("btn-cancel").hidden = false;
    $("meter").hidden = false; $("result").hidden = true;
    $("meter-fill").style.width = "0%";
    expStatus("Préparation de l'encodeur…");

    let output = null;
    const bgReaders = new Map(); // vidéo source -> lecteur, ouvert à la demande et partagé entre passages
    let curBg = null;
    try {
      const quality = state.exp.quality === "standard" ? MB.QUALITY_MEDIUM : MB.QUALITY_HIGH;
      const target = writable ? new MB.StreamTarget(writable, { chunked: true }) : new MB.BufferTarget();
      const format = ext === "mp4" ? new MB.Mp4OutputFormat({ fastStart: writable ? false : "in-memory" }) : new MB.WebMOutputFormat();
      output = new MB.Output({ format, target });
      const video = new MB.CanvasSource(cv, { codec: vcodec, quality, keyFrameInterval: 2 });
      output.addVideoTrack(video, { frameRate: fps });

      let audio = null, sink = null, input = null, audioNote = "";
      if (media.voiceFile) {
        input = new MB.Input({ source: new MB.BlobSource(media.voiceFile), formats: MB.ALL_FORMATS });
        const track = await input.getPrimaryAudioTrack();
        if (track && (await track.canDecode())) {
          const aacOk = ext === "mp4" && (await MB.canEncodeAudio("aac", { numberOfChannels: track.numberOfChannels, sampleRate: track.sampleRate }));
          const codec = aacOk ? "aac" : "opus";
          if (ext === "mp4" && !aacOk) audioNote = " Son encodé en Opus : ce navigateur n'encode pas l'AAC. YouTube l'accepte ; pour TikTok, exporte depuis Chrome ou Edge sous Windows ou macOS.";
          sink = new MB.AudioSampleSink(track);
          audio = new MB.AudioSampleSource({ codec, quality: MB.QUALITY_HIGH });
          output.addAudioTrack(audio);
        } else {
          audioNote = " Audio illisible : vidéo exportée sans son.";
        }
      }
      await output.start();

      const N = Math.max(1, Math.round(span * fps));
      let f = 0;
      const began = performance.now();
      let lastUi = 0;
      const ui = () => {
        const now = performance.now();
        if (now - lastUi < 250) return;
        lastUi = now;
        const p = f / N;
        $("meter-fill").style.width = (p * 100).toFixed(1) + "%";
        const elp = (now - began) / 1000;
        const eta = p > 0.01 ? elp / p - elp : 0;
        expStatus(`Encodage : ${fmt(f / fps)} sur ${fmt(span)} (${Math.round(p * 100)} %)` + (eta ? ` · reste environ ${fmt(eta)}` : "") + ". Tu peux changer d'onglet.");
      };
      // Image de la vidéo du passage courant, décodée à l'image près et bouclée si le clip est plus court.
      const bgFrame = async (i) => {
        const bg = bgFor(i);
        if (!bg) return null;
        if (!curBg || curBg.i !== i) {
          if (curBg && curBg.iter) await curBg.iter.return?.();
          let rd = bgReaders.get(bg.blob);
          if (!rd) {
            const inp = new MB.Input({ source: new MB.BlobSource(bg.blob), formats: MB.ALL_FORMATS });
            const vt = await inp.getPrimaryVideoTrack();
            rd = vt && (await vt.canDecode())
              ? { inp, sink: new MB.CanvasSink(vt, { width: cv.width, height: cv.height, fit: "cover" }), dur: (await vt.computeDuration()) || bg.dur || 1 }
              : { inp };
            bgReaders.set(bg.blob, rd);
          }
          if (!rd.sink) { curBg = { i, iter: null }; return null; }
          const fStart = f, fEnd = Math.min(N, Math.ceil((starts[i] + durs[i] - t0) * fps));
          const times = function* () { for (let g = fStart; g < fEnd; g++) yield (Math.max(0, t0 + g / fps - starts[i]) + (bg.offset || 0)) % rd.dur; };
          curBg = { i, iter: rd.sink.canvasesAtTimestamps(times()) };
        }
        if (!curBg.iter) return null;
        const r = await curBg.iter.next();
        return r.done || !r.value ? null : r.value.canvas;
      };
      // Les images sont produites au rythme de l'audio : le fichier s'écrit au fil de l'eau.
      const videoUntil = async (tEnd) => {
        while (f < N && f / fps < tEnd) {
          if (cancelled) throw new Error("annulé");
          const t = t0 + f / fps;
          const bgCanvas = await bgFrame(sceneAt(t));
          drawFrame(t, { bgCanvas });
          await video.add(f / fps, 1 / fps);
          f++;
          ui();
        }
      };
      if (sink) {
        for await (const s of sink.samples(t0, t1)) {
          const c = clipSample(s, t0, t1);
          s.close();
          if (!c) continue;
          await videoUntil(c.timestamp + c.duration);
          await audio.add(c);
          c.close();
          if (cancelled) throw new Error("annulé");
        }
        audio.close();
      }
      await videoUntil(Infinity);
      video.close();
      expStatus("Finalisation du fichier…");
      await output.finalize();
      if (input) input.dispose?.();
      $("meter-fill").style.width = "100%";
      if (ext === "webm") audioNote += " Format WebM (ce navigateur n'encode pas le H.264) : YouTube l'accepte ; pour TikTok, exporte depuis Chrome ou Edge sous Windows ou macOS.";
      if (writable) {
        expStatus(`Vidéo enregistrée : ${name} (${fmt(span)}).${audioNote}`, audioNote ? "warn" : "ok");
      } else {
        lastBlob = new Blob([target.buffer], { type: `video/${ext}` });
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        lastUrl = URL.createObjectURL(lastBlob);
        $("result-video").src = lastUrl;
        $("result").hidden = false;
        $("btn-save").dataset.name = name;
        expStatus(`Vidéo prête : ${ext.toUpperCase()}, ${(lastBlob.size / 1048576).toFixed(1)} Mo. Clique sur « Enregistrer le fichier ».${audioNote}`, audioNote ? "warn" : "ok");
      }
    } catch (e) {
      try { if (output && output.state !== "finalized") await output.cancel(); } catch (x) { /* déjà arrêté */ }
      try { if (writable) await writable.abort(); } catch (x) { /* déjà fermé */ }
      const msg = (e && e.message) || "erreur inconnue";
      expStatus(cancelled ? "Export annulé. Le fichier incomplet a été supprimé." : `L'export a échoué : ${msg}.`, cancelled ? "" : "warn");
    } finally {
      try { if (curBg && curBg.iter) await curBg.iter.return?.(); } catch (x) { /* déjà terminé */ }
      for (const rd of bgReaders.values()) rd.inp.dispose?.();
      exporting = false; cancelExport = null;
      $("btn-export").disabled = false; $("btn-play").disabled = false; $("btn-cancel").hidden = true;
      $("meter").hidden = true;
      seek(scrubTime());
    }
  }
  $("btn-export").addEventListener("click", exportVideo);
  $("btn-cancel").addEventListener("click", () => { if (cancelExport) cancelExport(); });
  $("btn-save").addEventListener("click", () => {
    if (!lastBlob) return;
    saveBlob(lastBlob, $("btn-save").dataset.name || "video.mp4");
    expStatus("Téléchargement lancé.", "ok");
  });

  /* ---------------- Sous-titres, chapitres, miniature ---------------- */
  function srtTime(s) {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  }
  $("btn-srt").addEventListener("click", () => {
    const { starts, durs } = timeline();
    const { from, to } = getRange();
    const t0 = starts[from];
    const rows = [];
    for (let i = from; i <= to; i++) {
      const sc = state.scenes[i];
      if (!sc.voix || !sc.voix.trim()) continue;
      const ch = chunks(sc.voix);
      const total = ch.reduce((a, c) => a + c.length, 0);
      const speak = speechOf(sc, durs[i]);
      let w = 0;
      for (const c of ch) {
        const a = starts[i] + (w / total) * speak - t0;
        w += c.length;
        const b = starts[i] + (w / total) * speak - t0;
        rows.push(`${rows.length + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${c.join(" ")}\n`);
      }
    }
    if (!rows.length) { expStatus("Aucune voix off dans les scènes : pas de sous-titres à exporter.", "warn"); return; }
    saveBlob(new Blob([rows.join("\n")], { type: "text/plain;charset=utf-8" }), `${fileBase()}.srt`);
    expStatus("Sous-titres .srt téléchargés. Sur YouTube : Sous-titres → Importer un fichier.", "ok");
  });
  $("btn-credits").addEventListener("click", () => {
    const txt = creditsText();
    if (!txt) { expStatus("Aucun crédit à copier : pas de média Pexels ou Wikimedia dans cette vidéo."); return; }
    copyText(txt, () => expStatus("Crédits copiés : colle-les dans la description.", "ok"), () => { $("credits").select(); expStatus("Crédits sélectionnés : copie-les avec Ctrl+C."); });
  });
  $("btn-chapters").addEventListener("click", () => {
    const txt = $("chapters").value;
    if (!txt) return;
    copyText(txt, () => expStatus("Chapitres copiés.", "ok"), () => { $("chapters").select(); expStatus("Chapitres sélectionnés : copie-les avec Ctrl+C."); });
  });
  $("btn-thumb").addEventListener("click", () => {
    const prev = state.aspect;
    const was = scrubTime();
    cv.width = 1920; cv.height = 1080;
    const { starts, durs } = timeline();
    drawFrame((starts[0] || 0) + Math.min(2.5, (durs[0] || 3) * 0.9), { clean: true });
    cv.toBlob((b) => {
      if (b) saveBlob(b, `${fileBase()}-miniature.jpg`);
      if (prev !== "16:9") { cv.width = 1080; cv.height = 1920; }
      seek(was);
      expStatus("Miniature 1920×1080 téléchargée. Retouche-la si besoin : ton visage et 3 mots maximum convertissent mieux.", "ok");
    }, "image/jpeg", 0.9);
  });

  /* ---------------- Contrôles ---------------- */
  $("btn-play").addEventListener("click", () => { if (playing) stop(); else play(); });
  $("scrub").addEventListener("input", () => { if (playing) stop(); seek(scrubTime()); });
  // Changer de format change l'orientation des vidéos à chercher : on remet les vidéos à zéro.
  const switchAspect = (a) => {
    if (state.aspect === a) return;
    setAspect(a);
    if (media.bg.size) status("broll-note", "Format changé : clique sur « Changer toutes les vidéos » pour des vidéos à la bonne orientation.");
  };
  $("ar-portrait").addEventListener("click", () => switchAspect("9:16"));
  $("ar-land").addEventListener("click", () => switchAspect("16:9"));

  /* ---------------- Démarrage ---------------- */
  setTimeout(() => { loadMB().catch(() => { mbPromise = null; }); }, 1500);
  if (!state.scenes.length) state.scenes = segmentScript(state.script);
  bindInputs();
  renderTemplates();
  setAspect(state.aspect === "16:9" ? "16:9" : "9:16");
  renderScenes();
  seek(1.5);

  Promise.all(['800 80px "Barlow Condensed"', '700 40px "Barlow"', '600 40px "Barlow"'].map((f) => document.fonts.load(f).catch(() => null)))
    .then(() => { if (!playing) seek(scrubTime()); });

  fetch("/api/statut", { credentials: "same-origin" })
    .then((r) => (r.status === 401 ? (location.href = "/connexion.html?e=expire", null) : r.json()))
    .then((d) => {
      iaOn = Boolean(d && d.ia);
      brollOn = Boolean(d && d.broll);
      elevenOn = Boolean(d && d.eleven);
      if (!brollOn) {
        for (const o of $("s-source").options) if (SOURCES[o.value] && SOURCES[o.value].pexels) { o.disabled = true; o.textContent = SOURCES[o.value].label + " : clé requise"; }
        if (state.mediaSource === "video") { state.mediaSource = "auto"; $("s-source").value = "auto"; }
      }
      $("el-note").hidden = elevenOn;
      renderVoices();
      renderScenes();
    })
    .catch(() => { renderVoices(); });
})();
