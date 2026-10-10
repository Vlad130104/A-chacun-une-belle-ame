"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "bachir-ia-v2";
  const PAGE = 25; // scènes affichées par page dans l'éditeur

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
  const TONS = {
    educatif: "éducatif et clair", motivation: "motivant et direct", histoire: "storytelling captivant",
    humour: "léger avec de l'humour", actu: "analyse d'actualité",
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

  const DEFAULT_STATE = {
    brief: { format: "short", ton: "educatif", duree: "60", sujet: "Pourquoi la plupart des petites chaînes YouTube abandonnent avant 100 abonnés, et comment tenir." },
    script: EXAMPLE_SCRIPT,
    useAi: true,
    aspect: "9:16",
    brand: { nom: "Bachir IA", serie: "BACHIR IA", cta: "Abonne-toi pour ne rien rater", primary: "#F5B700", dark: "#0F1013", fit: true, subs: true },
    exp: { fps: "30", quality: "high" },
    example: true,
    scenes: [],
  };

  let state;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? JSON.parse(raw) : null;
  } catch (e) { state = null; }
  if (!state || !Array.isArray(state.scenes)) state = structuredClone(DEFAULT_STATE);
  state.brief = { ...DEFAULT_STATE.brief, ...state.brief };
  state.brand = { ...DEFAULT_STATE.brand, ...state.brand };
  state.exp = { ...DEFAULT_STATE.exp, ...state.exp };
  if (typeof state.script !== "string") state.script = DEFAULT_STATE.script;
  if (typeof state.useAi !== "boolean") state.useAi = true;
  state.scenes.forEach((s) => {
    s.id = s.id || uid();
    s.items = Array.isArray(s.items) ? s.items : [];
    if (OLD_TYPES[s.type]) s.type = OLD_TYPES[s.type];
    if (!TYPES[s.type]) s.type = "texte";
  });

  let TL = null; // chronologie en cache, recalculée après chaque modification
  let saveTimer = null;
  function persist() {
    TL = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* stockage indisponible */ }
    }, 400);
  }

  const media = { photos: new Map(), logo: null, voiceFile: null };
  const voiceEl = new Audio();
  voiceEl.preload = "metadata";
  let voiceLoaded = false;

  /* ---------------- Utilitaires ---------------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  function wordsOf(s) { return String(s || "").toLowerCase().replace(/[’`]/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    const n = m ? parseInt(m[1], 16) : 0xf5b700;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function slug(s) { return String(s || "video").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "video"; }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  /* ---------------- Chronologie ---------------- */
  function timeline() {
    if (TL) return TL;
    const base = state.scenes.map((s) => Math.max(1, Number(s.duree) || 5));
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
    TL = { durs, starts, total: durs.length ? total : 1, chap };
    return TL;
  }
  function sceneAt(t) {
    const { starts } = timeline();
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }

  /* ---------------- Dessin ---------------- */
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  const F = { disp: '"Barlow Condensed", "Arial Narrow", sans-serif', body: 'Barlow, "Segoe UI", Arial, sans-serif', mono: '"IBM Plex Mono", Menlo, monospace' };

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
  const fitCache = new Map();
  function fit(text, weight, family, size, min, maxW, maxLines) {
    const key = `${weight}|${family}|${size}|${min}|${maxW}|${maxLines}|${text}`;
    const hit = fitCache.get(key);
    if (hit) return hit;
    let s = size, lines;
    for (;;) {
      ctx.font = `${weight} ${s}px ${family}`;
      lines = wrapLines(text, maxW);
      const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
      if ((lines.length <= maxLines && widest <= maxW) || s <= min) break;
      s -= 4;
    }
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] += "…"; }
    const out = { lines, size: s };
    if (fitCache.size > 4000) fitCache.clear();
    fitCache.set(key, out);
    return out;
  }
  function setSpacing(px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }

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
  function warnIcon(cx, cy, r, col, ink) {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 1.12, cy + r * 0.85); ctx.lineTo(cx - r * 1.12, cy + r * 0.85); ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = ink; ctx.font = `800 ${r * 1.1}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("!", cx, cy + r * 0.2);
    ctx.restore();
  }
  function subscribeButton(x, y, k) {
    ctx.save();
    ctx.font = `700 ${40 * k}px ${F.body}`;
    const label = "S'ABONNER";
    const w = ctx.measureText(label).width + 140 * k, h = 92 * k;
    rr(x, y, w, h, 46 * k); ctx.fillStyle = "#E62117"; ctx.fill();
    // cloche
    const bx = x + 56 * k, by = y + h / 2;
    ctx.fillStyle = "#FFFFFF";
    ctx.beginPath();
    ctx.moveTo(bx - 18 * k, by + 12 * k);
    ctx.quadraticCurveTo(bx - 18 * k, by - 22 * k, bx, by - 22 * k);
    ctx.quadraticCurveTo(bx + 18 * k, by - 22 * k, bx + 18 * k, by + 12 * k);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(bx - 22 * k, by + 10 * k, 44 * k, 5 * k);
    ctx.beginPath(); ctx.arc(bx, by + 21 * k, 5 * k, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(label, x + 96 * k, y + h / 2 + 2 * k);
    ctx.restore();
    return h;
  }
  function drawCover(img, zoom) {
    const W = cv.width, H = cv.height;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * zoom;
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }

  // Sous-titres : blocs courts du texte de la voix, calés sur la durée de la scène.
  const chunkCache = new Map();
  function chunks(text) {
    const hit = chunkCache.get(text);
    if (hit) return hit;
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const out = [];
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if (cur.length >= 8 || (/[.,;:!?…]$/.test(w) && cur.length >= 3)) { out.push(cur); cur = []; }
    }
    if (cur.length) { if (out.length && cur.length < 3) out[out.length - 1] = out[out.length - 1].concat(cur); else out.push(cur); }
    if (chunkCache.size > 5000) chunkCache.clear();
    chunkCache.set(text, out);
    return out;
  }
  // Position d'un mot dans la scène : proportionnelle au nombre de mots.
  function wordClock(sc, lt, dur) {
    const ch = chunks(sc.voix);
    const total = ch.reduce((a, c) => a + c.length, 0);
    if (!total) return null;
    const speak = Math.max(0.5, dur - 0.4);
    let w = Math.min(total - 1, Math.floor(clamp(lt / speak) * total));
    let ci = 0;
    while (ci < ch.length - 1 && w >= ch[ci].length) { w -= ch[ci].length; ci++; }
    return { words: ch[ci], current: w };
  }

  function drawSubtitles(sc, lt, dur, W, H, pad, cw, k, land, PRIMARY, bottom) {
    const wc = wordClock(sc, lt, dur);
    if (!wc) return;
    const size = (land ? 44 : 64) * k;
    ctx.font = `700 ${size}px ${F.body}`;
    // Lignes, en gardant l'index de chaque mot pour surligner le mot prononcé
    const lines = [];
    let line = [], idx = 0;
    for (const w of wc.words) {
      const test = line.map((x) => x.w).concat(w).join(" ");
      if (line.length && ctx.measureText(test).width > cw - 60 * k) { lines.push(line); line = []; }
      line.push({ w, i: idx++ });
    }
    if (line.length) lines.push(line);
    const show = lines.slice(0, 3);
    const lh = size * 1.22;
    const blockH = show.length * lh;
    const top = bottom - blockH;
    if (land) {
      rr(pad, top - 18 * k, cw, blockH + 36 * k, 10 * k);
      ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.fill();
    }
    ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.lineJoin = "round";
    show.forEach((ln, j) => {
      const text = ln.map((x) => x.w).join(" ");
      let x = W / 2 - ctx.measureText(text).width / 2;
      const y = top + j * lh + lh / 2;
      for (const { w, i } of ln) {
        const ww = ctx.measureText(w).width;
        if (!land) { ctx.lineWidth = 10 * k; ctx.strokeStyle = "rgba(0,0,0,0.9)"; ctx.strokeText(w, x, y); }
        ctx.fillStyle = i === wc.current ? PRIMARY : "#FFFFFF";
        ctx.fillText(w, x, y);
        x += ww + ctx.measureText(" ").width;
      }
    });
  }

  function drawFrame(t, opts = {}) {
    const W = cv.width, H = cv.height, land = W > H;
    const k = Math.min(W, H) / 1080;
    const brand = state.brand;
    const TLc = timeline();
    const PRIMARY = brand.primary || "#F5B700", DARK = brand.dark || "#0F1013";
    const INK = "#0F1013";

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; setSpacing(0);
    ctx.fillStyle = DARK; ctx.fillRect(0, 0, W, H);

    if (!state.scenes.length) {
      ctx.fillStyle = "#FFFFFF"; ctx.font = `700 ${64 * k}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Colle ton script pour commencer", W / 2, H / 2);
      ctx.restore(); return;
    }

    const i = sceneAt(t);
    const lt = Math.max(0, t - TLc.starts[i]), dur = TLc.durs[i], sc = state.scenes[i];
    const T = TYPES[sc.type] || TYPES.texte;

    // Fond : photo plein écran ou halo de la couleur principale
    const img = media.photos.get(sc.id);
    if (img) {
      drawCover(img, 1.04 + 0.08 * clamp(lt / dur));
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(8,8,10,0.45)"); g.addColorStop(0.5, "rgba(8,8,10,0.62)"); g.addColorStop(1, "rgba(8,8,10,0.9)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      const g = ctx.createRadialGradient(W * 0.85, H * 0.9, 0, W * 0.85, H * 0.9, Math.max(W, H) * 0.85);
      g.addColorStop(0, hexToRgba(PRIMARY, 0.22)); g.addColorStop(1, hexToRgba(PRIMARY, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    const pad = (land ? 110 : 80) * k;
    const cw = W - pad * 2;

    // En-tête : nom de la chaîne et série
    ctx.fillStyle = PRIMARY; ctx.fillRect(0, 0, W, 8 * k);
    const headY = (land ? 46 : 70) * k;
    if (media.logo) {
      const lh = 72 * k, lw = (media.logo.naturalWidth / media.logo.naturalHeight) * lh;
      ctx.drawImage(media.logo, pad, headY - 12 * k, Math.min(lw, cw * 0.45), lh);
    } else {
      ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${28 * k}px ${F.mono}`; setSpacing(4 * k);
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(String(brand.nom || "").toUpperCase(), pad, headY + 10 * k);
    }
    if (sc.type === "chapitre" || TLc.chap[i] > 0) {
      ctx.fillStyle = PRIMARY; ctx.font = `600 ${26 * k}px ${F.mono}`; setSpacing(4 * k); ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillText(`CHAPITRE ${String(TLc.chap[i]).padStart(2, "0")}`, W - pad, headY + 12 * k);
    }
    setSpacing(0);

    const enter = (delay) => {
      const a = easeOut((lt - delay) / 0.5);
      ctx.globalAlpha = a;
      return (1 - a) * 46 * k;
    };
    const titleLines = (txt, size, min, max) => fit(String(txt || "").toUpperCase(), 800, F.disp, size * k, min * k, cw, max);
    const drawTitle = (tt, y, dy, color = "#FFFFFF", lhK = 0.98) => {
      ctx.fillStyle = color; ctx.font = `800 ${tt.size}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      const lh = tt.size * lhK;
      tt.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + tt.size * 0.8 + j * lh));
      return tt.lines.length * lh;
    };
    const drawBody = (txt, y, dy, size, maxLines, alpha = 0.88, weight = 500) => {
      if (!txt) return 0;
      const st = fit(txt, weight, F.body, size * k, 32 * k, cw, maxLines);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.font = `${weight} ${st.size}px ${F.body}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      st.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + st.size + j * st.size * 1.3));
      return st.lines.length * st.size * 1.3;
    };

    const subs = !opts.clean && brand.subs && sc.voix && sc.voix.trim();
    const barY = H - (land ? 40 : 70) * k;
    let y = land ? H * 0.22 : H * 0.2;
    const bodyMax = land ? (subs ? 2 : 4) : (subs ? 3 : 6);

    if (sc.type === "titre") {
      let dy = enter(0);
      if (brand.serie) { pill(String(brand.serie).toUpperCase(), pad, y + dy, PRIMARY, INK, k); y += 110 * k; }
      dy = enter(0.15);
      y += drawTitle(titleLines(sc.titre, land ? 150 : 170, 70, land ? 3 : 5), y, dy) + 40 * k;
      dy = enter(0.35);
      ctx.fillStyle = PRIMARY; ctx.fillRect(pad, y + dy, 160 * k * easeOut((lt - 0.35) / 0.6), 12 * k);
      y += 60 * k;
      drawBody(sc.texte, y, enter(0.55), 56, bodyMax);
    } else if (sc.type === "chapitre") {
      let dy = enter(0);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${(land ? 220 : 260) * k}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(String(TLc.chap[i]).padStart(2, "0"), pad - 6 * k, y + dy + (land ? 180 : 210) * k);
      y += (land ? 230 : 270) * k;
      dy = enter(0.2);
      y += drawTitle(titleLines(sc.titre, land ? 120 : 130, 60, land ? 2 : 4), y, dy) + 30 * k;
      drawBody(sc.texte, y, enter(0.4), 52, bodyMax);
    } else if (sc.type === "citation") {
      let dy = enter(0);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${(land ? 260 : 300) * k}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("“", pad - 10 * k, y + dy + 200 * k);
      y += 170 * k;
      dy = enter(0.15);
      const q = fit(sc.titre, 600, F.body, (land ? 72 : 80) * k, 40 * k, cw, land ? 4 : 7);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${q.size}px ${F.body}`;
      q.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + q.size + j * q.size * 1.25));
      y += q.lines.length * q.size * 1.25 + 40 * k;
      if (sc.texte) {
        dy = enter(0.4);
        ctx.fillStyle = PRIMARY; ctx.font = `600 ${34 * k}px ${F.mono}`;
        ctx.fillText("— " + sc.texte, pad, y + dy + 34 * k);
      }
    } else if (sc.type === "chiffre") {
      let dy = enter(0);
      const nt = fit(sc.titre, 800, F.disp, (land ? 340 : 420) * k, 120 * k, cw, 1);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${nt.size}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      y += nt.size * 0.85;
      ctx.fillText(nt.lines[0] || "", pad - 8 * k, y + dy);
      y += 50 * k;
      drawBody(sc.texte, y, enter(0.3), 70, bodyMax, 1, 600);
    } else if (sc.type === "liste") {
      let dy = enter(0);
      pill(T.tag, pad, y + dy, PRIMARY, INK, k);
      y += 100 * k;
      y += drawTitle(titleLines(sc.titre, 100, 56, 2), y, enter(0.15), "#FFFFFF", 1) + 40 * k;
      const items = (sc.items || []).filter(Boolean).slice(0, 5);
      const stepDelay = Math.min(0.9, (dur * 0.55) / Math.max(1, items.length));
      const box = 78 * k;
      items.forEach((it, j) => {
        const d = enter(0.5 + j * stepDelay);
        const lines = fit(it, 600, F.body, 50 * k, 34 * k, cw - box - 30 * k, 2);
        const rowH = Math.max(box, lines.lines.length * lines.size * 1.2) + 24 * k;
        ctx.save(); ctx.translate(-d, 0);
        rr(pad, y, box, box, 8 * k); ctx.fillStyle = PRIMARY; ctx.fill();
        ctx.fillStyle = INK; ctx.font = `800 ${52 * k}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(j + 1), pad + box / 2, y + box / 2 + 2 * k);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${lines.size}px ${F.body}`;
        const ty = y + box / 2 - ((lines.lines.length - 1) * lines.size * 1.2) / 2 + lines.size * 0.35;
        lines.lines.forEach((l, m) => ctx.fillText(l, pad + box + 30 * k, ty + m * lines.size * 1.2));
        ctx.restore();
        y += rowH;
      });
    } else if (sc.type === "alerte") {
      const r = (land ? 76 : 92) * k;
      let dy = enter(0);
      warnIcon(pad + r * 1.12, y + r + dy, r, PRIMARY, INK);
      y += r * 2 + 40 * k;
      dy = enter(0.12);
      pill(T.tag, pad, y + dy, PRIMARY, INK, k);
      y += 90 * k;
      y += drawTitle(titleLines(sc.titre, land ? 108 : 118, 60, land ? 2 : 4), y, enter(0.25), "#FFFFFF", 1) + 30 * k;
      drawBody(sc.texte, y, enter(0.45), 54, bodyMax);
    } else if (sc.type === "cta") {
      let dy = enter(0);
      y += drawTitle(titleLines(sc.titre, land ? 120 : 130, 60, land ? 3 : 4), y, dy, "#FFFFFF", 1) + 30 * k;
      y += drawBody(sc.texte, y, enter(0.2), 54, 3) + 50 * k;
      ctx.globalAlpha = easeOut((lt - 0.6) / 0.5);
      const pulse = 1 + 0.04 * Math.sin(lt * 5);
      ctx.save(); ctx.translate(pad, y); ctx.scale(pulse, pulse);
      subscribeButton(0, 0, k);
      ctx.restore();
      y += 130 * k;
      if (brand.cta) drawBody(brand.cta, y, 0, 44, 2, 0.8, 600);
    } else {
      // texte
      let dy = enter(0);
      y += drawTitle(titleLines(sc.titre, land ? 110 : 120, 56, land ? 3 : 4), y, dy, "#FFFFFF", 1) + 36 * k;
      dy = enter(0.3);
      ctx.fillStyle = PRIMARY; ctx.fillRect(pad, y + dy - 10 * k, 120 * k, 10 * k);
      y += 30 * k;
      drawBody(sc.texte, y, dy, 54, bodyMax);
    }

    ctx.globalAlpha = 1; setSpacing(0);
    if (subs) {
      const bottom = land ? barY - 40 * k : H * 0.86;
      drawSubtitles(sc, lt, dur, W, H, pad, cw, k, land, PRIMARY, bottom);
    }

    // Barre de progression (absente de la miniature)
    if (!opts.clean) {
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(pad, barY, cw, 8 * k);
      ctx.fillStyle = PRIMARY; ctx.fillRect(pad, barY, cw * clamp(t / TLc.total), 8 * k);
    }
    ctx.restore();
  }

  /* ---------------- Lecture de l'aperçu ---------------- */
  let playing = null;
  function updateTimes(t) {
    const { total } = timeline();
    $("t-cur").textContent = fmt(Math.min(t, total));
    $("t-tot").textContent = fmt(total);
    $("sc-total").textContent = `${state.scenes.length} scènes · ${fmt(total)}`;
  }
  function seek(t) {
    const { total } = timeline();
    t = clamp(t, 0, total);
    $("scrub").value = String(Math.round((t / total) * 10000));
    drawFrame(t);
    updateTimes(t);
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
    const tick = () => {
      if (playing !== p) return;
      const t = voiceLoaded && !voiceEl.paused ? voiceEl.currentTime : (performance.now() - start) / 1000;
      drawFrame(t);
      $("scrub").value = String(Math.round(clamp(t / total) * 10000));
      updateTimes(t);
      if (t >= total) { stop(); return; }
      p.raf = requestAnimationFrame(tick);
    };
    p.raf = requestAnimationFrame(tick);
    $("btn-play").textContent = "■ Arrêter";
  }
  function stop() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing = null;
    voiceEl.pause();
    $("btn-play").textContent = "▶ Lire";
  }

  /* ---------------- Éditeur de scènes ---------------- */
  let page = 0;
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
  function focusScene(idx) {
    if (playing || exporting) return;
    const { starts, durs } = timeline();
    if (idx >= starts.length) return;
    seek(starts[idx] + Math.min(durs[idx] * 0.8, 3));
  }
  function changed(idx) {
    state.example = false;
    $("ex-badge").hidden = true;
    persist();
    refreshDerived();
    if (idx != null) focusScene(idx); else seek(scrubTime());
  }
  const titleLabel = (type) => (type === "chiffre" ? "Chiffre ou valeur" : type === "citation" ? "Citation" : "Titre à l'écran");
  const texteLabel = (type) => (type === "citation" ? "Auteur" : "Texte à l'écran");

  function renderScenes() {
    const list = $("scenes");
    list.replaceChildren();
    const pages = Math.max(1, Math.ceil(state.scenes.length / PAGE));
    page = clamp(page, 0, pages - 1);
    const from = page * PAGE, to = Math.min(state.scenes.length, from + PAGE);
    for (let i = from; i < to; i++) {
      const s = state.scenes[i];
      const id = (f) => `sc-${s.id}-${f}`;
      const typeSel = el("select", { id: id("type"), "aria-label": `Type de la scène ${i + 1}` },
        Object.entries(TYPES).map(([v, t]) => el("option", { value: v, text: t.label, selected: v === s.type })));
      const dur = el("input", { type: "number", id: id("duree"), min: "1", max: "120", step: "1", value: String(s.duree), "aria-label": "Durée en secondes" });
      const up = el("button", { type: "button", class: "icon-btn", text: "↑", "aria-label": "Monter la scène", disabled: i === 0 });
      const down = el("button", { type: "button", class: "icon-btn", text: "↓", "aria-label": "Descendre la scène", disabled: i === state.scenes.length - 1 });
      const del = el("button", { type: "button", class: "icon-btn", text: "×", "aria-label": "Supprimer la scène" });

      const titre = el("input", { type: "text", id: id("titre"), value: s.titre || "" });
      const titreLab = el("label", { class: "f" }, el("span", { text: titleLabel(s.type) }), titre);
      const texte = el("textarea", { id: id("texte"), rows: 2 });
      texte.value = s.texte || "";
      const texteLab = el("label", { class: "f" }, el("span", { text: texteLabel(s.type) }), texte);
      const items = el("textarea", { id: id("items"), rows: 4 });
      items.value = (s.items || []).join("\n");
      const itemsLab = el("label", { class: "f" }, el("span", { text: "Points (un par ligne, 5 max)" }), items);
      itemsLab.hidden = s.type !== "liste";
      const voix = el("textarea", { id: id("voix"), rows: 2 });
      voix.value = s.voix || "";
      const voixLab = el("label", { class: "f" }, el("span", { text: "Voix off et sous-titres" }), voix);

      const photoIn = el("input", { type: "file", id: id("photo"), accept: "image/*", "aria-label": "Image de fond" });
      const thumb = el("img", { alt: "Image de la scène", hidden: !media.photos.has(s.id) });
      if (media.photos.has(s.id)) thumb.src = media.photos.get(s.id).src;
      const rmPhoto = el("button", { type: "button", class: "btn small", text: "Retirer l'image", hidden: !media.photos.has(s.id) });
      const photo = el("div", { class: "photo" }, el("span", { text: "Image de fond" }), thumb, photoIn, rmPhoto);

      const card = el("article", { class: "scene" },
        el("div", { class: "head" }, el("span", { class: "num", text: `Scène ${i + 1}` }), typeSel,
          el("label", { class: "dur" }, dur, "s"), el("div", { class: "tools" }, up, down, del)),
        titreLab, texteLab, itemsLab, voixLab, photo);
      card.dataset.type = s.type;
      card.addEventListener("focusin", () => focusScene(i));

      typeSel.addEventListener("change", () => {
        s.type = typeSel.value; card.dataset.type = s.type;
        itemsLab.hidden = s.type !== "liste";
        titreLab.firstChild.textContent = titleLabel(s.type);
        texteLab.firstChild.textContent = texteLabel(s.type);
        changed(i);
      });
      dur.addEventListener("input", () => { s.duree = clamp(Math.round(Number(dur.value) || 5), 1, 120); changed(i); });
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
      up.addEventListener("click", () => { [state.scenes[i - 1], state.scenes[i]] = [state.scenes[i], state.scenes[i - 1]]; persist(); renderScenes(); changed(i - 1); });
      down.addEventListener("click", () => { [state.scenes[i + 1], state.scenes[i]] = [state.scenes[i], state.scenes[i + 1]]; persist(); renderScenes(); changed(i + 1); });
      del.addEventListener("click", () => { media.photos.delete(s.id); state.scenes.splice(i, 1); persist(); renderScenes(); changed(null); });

      list.append(card);
    }
    $("pager").hidden = pages < 2;
    $("pg-info").textContent = `Scènes ${state.scenes.length ? from + 1 : 0} à ${to} sur ${state.scenes.length}`;
    $("pg-prev").disabled = page === 0;
    $("pg-next").disabled = page >= pages - 1;
    $("ex-badge").hidden = !state.example;
    refreshDerived();
    updateTimes(scrubTime());
  }

  /* ---------------- Textes dérivés : prompteur, chapitres, plage d'export ---------------- */
  function hms(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (timeline().total >= 3600 ? `${String(h).padStart(2, "0")}:` : "") + `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  function chaptersText() {
    const { starts } = timeline();
    const rows = [];
    state.scenes.forEach((s, i) => {
      if (s.type === "chapitre") rows.push({ t: starts[i], titre: s.titre || `Chapitre` });
    });
    if (!rows.length) return { text: "", ok: false, note: "Ajoute des scènes « Chapitre » (## dans le script) pour générer les chapitres YouTube." };
    if (rows[0].t >= 10) rows.unshift({ t: 0, titre: (state.scenes[0] && state.scenes[0].titre) || "Introduction" });
    rows[0].t = 0;
    const short = rows.some((r, j) => j < rows.length - 1 && rows[j + 1].t - r.t < 10);
    const ok = rows.length >= 3 && !short;
    const note = ok ? "Colle ces lignes dans la description YouTube."
      : "YouTube exige au moins 3 chapitres, le premier à 00:00, de 10 secondes minimum chacun.";
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
      $("chapters-note").className = "note" + (c.text && !c.ok ? " warn" : "");
      fillRange();
    }, 150);
  }
  function fillRange() {
    const n = state.scenes.length;
    for (const id of ["rg-from", "rg-to"]) {
      const sel = $(id);
      const prev = sel.value;
      sel.replaceChildren(...state.scenes.map((s, i) => el("option", { value: String(i), text: `${i + 1}. ${String(s.titre || TYPES[s.type].label).slice(0, 40)}` })));
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
    if (vertical && d > 3600) msg += " Trop long pour TikTok.";
    $("rg-info").textContent = msg;
    $("rg-info").className = "note" + (vertical && d > 180 ? " warn" : "");
    $("rg-pick").hidden = $("rg-all").checked;
  }

  /* ---------------- Marque et réglages ---------------- */
  function bindInputs() {
    const b = state.brief;
    $("b-format").value = b.format; $("b-ton").value = b.ton; $("b-duree").value = String(b.duree); $("b-sujet").value = b.sujet;
    $("b-format").addEventListener("change", (e) => { b.format = e.target.value; persist(); });
    $("b-ton").addEventListener("change", (e) => { b.ton = e.target.value; persist(); });
    $("b-duree").addEventListener("change", (e) => { b.duree = e.target.value; persist(); });
    $("b-sujet").addEventListener("input", (e) => { b.sujet = e.target.value; persist(); });

    const br = state.brand;
    $("br-nom").value = br.nom; $("br-serie").value = br.serie; $("br-cta").value = br.cta;
    $("br-primary").value = br.primary; $("br-dark").value = br.dark;
    $("fit-voice").checked = !!br.fit;
    $("subs").checked = !!br.subs;
    $("subs").addEventListener("change", (e) => { br.subs = e.target.checked; persist(); seek(scrubTime()); });
    $("s-script").value = state.script;
    $("s-script").addEventListener("input", (e) => { state.script = e.target.value; persist(); });
    $("s-ai").checked = state.useAi;
    $("s-ai").addEventListener("change", (e) => { state.useAi = e.target.checked; persist(); });
    [["br-nom", "nom"], ["br-serie", "serie"], ["br-cta", "cta"], ["br-primary", "primary"], ["br-dark", "dark"]].forEach(([id, key]) =>
      $(id).addEventListener("input", (e) => { br[key] = e.target.value; persist(); seek(scrubTime()); }));
    $("fit-voice").addEventListener("change", (e) => { br.fit = e.target.checked; persist(); refreshDerived(); seek(0.5); });
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
    $("pg-prev").addEventListener("click", () => { page--; renderScenes(); $("h-scenes").scrollIntoView(); });
    $("pg-next").addEventListener("click", () => { page++; renderScenes(); $("h-scenes").scrollIntoView(); });
  }

  function setAspect(a) {
    state.aspect = a;
    const land = a === "16:9";
    cv.width = land ? 1920 : 1080; cv.height = land ? 1080 : 1920;
    $("stage").classList.toggle("land", land);
    $("ar-portrait").setAttribute("aria-pressed", String(!land));
    $("ar-land").setAttribute("aria-pressed", String(land));
    fitCache.clear();
    persist();
    rangeInfo();
    seek(scrubTime());
  }

  /* ---------------- Voix off ---------------- */
  function voiceStatus(msg, cls = "") { const n = $("voice-status"); n.className = "status " + cls; n.textContent = msg; }
  $("voice-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    voiceLoaded = false; TL = null;
    media.voiceFile = f;
    voiceEl.src = URL.createObjectURL(f);
    voiceStatus("Lecture de l'audio…");
    voiceEl.onloadedmetadata = () => {
      voiceLoaded = true; TL = null;
      voiceStatus(`${f.name} · ${fmt(voiceEl.duration)}`, "ok");
      $("btn-voice-clear").hidden = false;
      refreshDerived();
      seek(0.5);
    };
    voiceEl.onerror = () => { media.voiceFile = null; voiceStatus("Ce fichier audio ne se lit pas ici. Essaie un MP3, un M4A ou un WAV.", "warn"); };
  });
  $("btn-voice-clear").addEventListener("click", () => {
    voiceEl.pause(); voiceEl.removeAttribute("src"); voiceEl.load(); voiceLoaded = false; TL = null;
    media.voiceFile = null;
    $("voice-file").value = ""; $("btn-voice-clear").hidden = true;
    voiceStatus("");
    refreshDerived();
    seek(0.5);
  });
  function copyText(text, onOk, onFail) {
    try { navigator.clipboard.writeText(text).then(onOk, onFail); } catch (e) { onFail(); }
  }
  $("btn-copy").addEventListener("click", () => {
    copyText($("prompter").textContent, () => voiceStatus("Texte copié.", "ok"), () => {
      const r = document.createRange(); r.selectNodeContents($("prompter"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      voiceStatus("Texte sélectionné : copie-le avec Ctrl+C.");
    });
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
    script_invalide: "Script vide ou trop long pour l'IA (12 000 caractères maximum).",
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
  function normalize(out) {
    const arr = out && Array.isArray(out.scenes) ? out.scenes : [];
    return arr.slice(0, 200).map((s) => ({
      id: uid(),
      type: TYPES[s && s.type] ? s.type : "texte",
      titre: String((s && s.titre) || "").slice(0, 120),
      texte: String((s && s.texte) || "").slice(0, 240),
      items: Array.isArray(s && s.items) ? s.items.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 5) : [],
      voix: String((s && s.voix) || "").slice(0, 2000),
      duree: clamp(Math.round(Number(s && s.duree) || 6), 1, 120),
    }));
  }

  /* ---------------- Découpage du script ---------------- */
  const BULLET = /^([-•*–]|\d+[.)])\s+/;
  const NUMBER_LEAD = /^(\d[\d\s.,]*\s?(?:%|ans|fois|jours|heures|minutes|millions?|milliards?|k|m|€|fcfa|\$)?)\s+(.+)$/i;
  function shorten(s, n) {
    s = String(s || "").trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n), sp = cut.lastIndexOf(" ");
    return cut.slice(0, sp > n * 0.5 ? sp : n).replace(/[,;:]$/, "") + "…";
  }
  function sameWords(a, b) { const x = wordsOf(a), y = wordsOf(b); return x.length === y.length && x.every((w, i) => w === y[i]); }
  function durFor(voix) { return clamp(Math.round(wordsOf(voix).length / 2.5 + 1), 3, 60); }
  function firstSentence(s) { return (String(s).match(/^[^.!?…:]+[.!?…:]?/) || [s])[0].replace(/[.:]$/, ""); }

  // Une scène par paragraphe ; les longs paragraphes sont coupés en scènes d'environ 40 mots.
  // Repères : « # » titre, « ## » chapitre, « > » citation, « - » liste.
  function localSplit(text) {
    const raw = String(text).replace(/\r/g, "").trim();
    if (!raw) return [];
    const blocks = [];
    let para = [];
    const flush = () => { if (para.length) { blocks.push(para.join("\n")); para = []; } };
    for (const line of raw.split("\n")) {
      const l = line.trim();
      if (!l) { flush(); continue; }
      if (/^#{1,3}\s+/.test(l)) { flush(); blocks.push(l); continue; }
      para.push(l);
    }
    flush();

    const scenes = [];
    const push = (s) => scenes.push({ id: uid(), texte: "", items: [], ...s });
    blocks.forEach((b) => {
      const lines = b.split("\n");
      const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
      if (h) {
        const titre = h[2].trim();
        if (h[1] === "#") push({ type: "titre", titre, voix: "", duree: 3 });
        else push({ type: "chapitre", titre, voix: "", duree: 3 });
        return;
      }
      if (lines.every((l) => l.startsWith(">"))) {
        const q = lines.map((l) => l.replace(/^>\s?/, "")).join(" ");
        const m = /^(.*?)\s+[—–-]\s+([^—–-]+)$/.exec(q);
        push({ type: "citation", titre: m ? m[1] : q, texte: m ? m[2] : "", voix: m ? m[1] : q, duree: durFor(q) });
        return;
      }
      const bullets = lines.filter((l) => BULLET.test(l)).map((l) => l.replace(BULLET, ""));
      if (bullets.length >= 2) {
        const head = lines.filter((l) => !BULLET.test(l)).join(" ");
        const voix = lines.map((l) => { const x = l.replace(BULLET, ""); return BULLET.test(l) && !/[.,;:!?…]$/.test(x) ? x + "." : x; }).join(" ");
        push({ type: "liste", titre: shorten(head.replace(/:$/, "") || "À retenir", 60), items: bullets.slice(0, 5).map((x) => shorten(x, 50)), voix, duree: durFor(voix) });
        return;
      }
      const text = lines.join(" ");
      // Long paragraphe : on coupe aux fins de phrase, environ 40 mots par scène
      const sentences = (text.match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) || [text]).map((x) => x.trim()).filter(Boolean);
      const parts = [];
      let cur = "";
      for (const s of sentences) {
        if (cur && wordsOf(cur + " " + s).length > 40) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
      }
      if (cur) parts.push(cur);
      parts.forEach((p) => {
        const num = wordsOf(p).length <= 30 ? NUMBER_LEAD.exec(p) : null;
        if (num) push({ type: "chiffre", titre: num[1].trim(), texte: shorten(num[2], 110), voix: p, duree: durFor(p) });
        else push({ type: "texte", titre: shorten(firstSentence(p), 70), voix: p, duree: durFor(p) });
      });
    });
    if (scenes.length && scenes[0].type === "texte") scenes[0].type = "titre";
    const last = scenes[scenes.length - 1];
    if (last && last.type === "texte" && /(\?|abonne|commentaire|partage)/i.test(last.voix)) last.type = "cta";
    // Un « # titre » sans phrase propre reprend le paragraphe suivant comme sous-titre et voix
    if (scenes.length > 1 && scenes[0].type === "titre" && !scenes[0].voix && scenes[1].type === "texte") {
      scenes[0].texte = shorten(scenes[1].voix, 110);
      scenes[0].voix = scenes[1].voix;
      scenes[0].duree = scenes[1].duree;
      scenes.splice(1, 1);
    }
    return scenes.slice(0, 3000);
  }

  function scriptStatus(msg, cls = "") { const n = $("script-status"); n.className = "status " + cls; n.textContent = msg; }
  $("btn-script").addEventListener("click", async () => {
    const text = String(state.script || "").trim();
    if (!text) { scriptStatus("Colle d'abord ton script dans la zone ci-dessus.", "warn"); return; }
    const btn = $("btn-script");
    btn.disabled = true;
    let scenes = null, note = "", viaIa = false;
    try {
      if (state.useAi && iaOn && text.length <= 12000) {
        scriptStatus("Claude découpe ton script en scènes…");
        try {
          scenes = normalize(await api("/api/decoupe", { script: text }));
          scenes.forEach((s) => { s.duree = s.voix ? durFor(s.voix) : 3; });
          if (!scenes.length) scenes = null; else viaIa = true;
        } catch (e) {
          note = " " + ((e && e.message) || "L'IA n'a pas répondu.") + " Découpage automatique.";
        }
      } else if (state.useAi && iaOn) {
        note = " Script long : découpage automatique (l'IA traite jusqu'à 12 000 caractères).";
      }
      if (!scenes) scenes = localSplit(text);
      media.photos.clear();
      state.scenes = scenes; state.example = false; page = 0;
      persist(); renderScenes(); seek(1.5);
      const { total } = timeline();
      const clean = (s) => s.split("\n").map((l) => l.trim().replace(BULLET, "").replace(/^#{1,3}\s+.*$/, "").replace(/^>\s?/, "")).join(" ");
      const same = !viaIa || sameWords(clean(text), scenes.map((s) => s.voix).join(" "));
      scriptStatus(`${scenes.length} scènes créées, ${fmt(total)} de vidéo. Vérifie l'aperçu, puis exporte.${note}` +
        (same ? "" : " Vérifie la voix de chaque scène : elle ne reprend pas ton script mot pour mot."), same ? "ok" : "");
    } finally {
      btn.disabled = false;
    }
  });
  function genStatus(msg, cls = "") { const n = $("gen-status"); n.className = "status " + cls; n.textContent = msg; }
  $("btn-gen").addEventListener("click", async () => {
    if (!iaOn) { genStatus(API_MSG.ia_non_configuree + " Écris ton script toi-même et colle-le ci-dessus.", "warn"); return; }
    if (!String(state.brief.sujet).trim()) { genStatus("Décris d'abord le sujet de la vidéo.", "warn"); return; }
    const btn = $("btn-gen");
    btn.disabled = true;
    genStatus("Claude écrit le script… (jusqu'à une minute pour une vidéo de 10 minutes)");
    try {
      const b = state.brief;
      const out = await api("/api/script", { format: b.format, ton: b.ton, duree: Number(b.duree), sujet: String(b.sujet).slice(0, 3000) });
      const scenes = normalize(out);
      if (scenes.length < 2) throw { message: "La réponse était vide. Relance la génération." };
      media.photos.clear();
      state.scenes = scenes; state.example = false; page = 0;
      setAspect(b.format === "long" ? "16:9" : "9:16");
      persist(); renderScenes(); seek(1.5);
      genStatus(`Script prêt : ${scenes.length} scènes. Relis-le et mets-le à ta façon de parler avant de publier.`, "ok");
    } catch (e) {
      genStatus((e && e.message) || "La génération a échoué. Réessaie.", "warn");
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------------- Export vidéo (WebCodecs + Mediabunny) ---------------- */
  // Chargé en arrière-plan pour que le choix du fichier reste lié au clic (exigence du navigateur).
  let mbPromise = null;
  const loadMB = () => (mbPromise ??= import("/vendor/mediabunny.min.mjs"));
  let exporting = false, cancelExport = null, lastBlob = null, lastUrl = null;
  function expStatus(msg, cls = "") { const n = $("exp-status"); n.className = "status " + cls; n.textContent = msg; }
  function fileBase() { return slug(state.scenes[0] && state.scenes[0].titre) + (state.aspect === "9:16" ? "-short" : ""); }

  // Coupe un échantillon audio à la fenêtre [t0, t1[ et le recale à partir de 0.
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
    if (!state.scenes.length) { expStatus("Ajoute au moins une scène.", "warn"); return; }
    if (!("VideoEncoder" in window)) { expStatus("Ce navigateur ne sait pas encoder de vidéo. Utilise Chrome ou Edge à jour sur ordinateur.", "warn"); return; }
    stop();
    const { starts, durs } = timeline();
    const { from, to } = getRange();
    const t0 = starts[from], t1 = starts[to] + durs[to], span = t1 - t0;
    const fps = Number(state.exp.fps) || 30;
    let MB, vcodec = null;
    try {
      MB = await loadMB();
      const quality0 = state.exp.quality === "standard" ? MB.QUALITY_MEDIUM : MB.QUALITY_HIGH;
      for (const c of ["avc", "vp9"]) {
        if (await MB.canEncodeVideo(c, { width: cv.width, height: cv.height, quality: quality0 })) { vcodec = c; break; }
      }
    } catch (e) { mbPromise = null; }
    if (!vcodec) { expStatus("Ce navigateur ne sait pas encoder de vidéo. Utilise Chrome ou Edge à jour sur ordinateur.", "warn"); return; }
    // H.264 + AAC en MP4 (accepté partout) ; sinon VP9 + Opus en WebM (accepté par YouTube)
    const ext = vcodec === "avc" ? "mp4" : "webm";
    const name = `${fileBase()}${from || to < state.scenes.length - 1 ? `-scenes-${from + 1}-${to + 1}` : ""}.${ext}`;

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
        const el = (now - began) / 1000;
        const eta = p > 0.01 ? el / p - el : 0;
        expStatus(`Encodage : ${fmt(f / fps)} sur ${fmt(span)} (${Math.round(p * 100)} %)` + (eta ? ` · reste environ ${fmt(eta)}` : "") + ". Tu peux changer d'onglet.");
      };
      // Les images sont produites au rythme de l'audio : le fichier s'écrit au fil de l'eau, sans tout garder en mémoire.
      const videoUntil = async (tEnd) => {
        while (f < N && f / fps < tEnd) {
          if (cancelled) throw new Error("annulé");
          drawFrame(t0 + f / fps);
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
      const speak = Math.max(0.5, durs[i] - 0.4);
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
  $("btn-chapters").addEventListener("click", () => {
    const txt = $("chapters").value;
    if (!txt) return;
    copyText(txt, () => expStatus("Chapitres copiés.", "ok"), () => { $("chapters").select(); expStatus("Chapitres sélectionnés : copie-les avec Ctrl+C."); });
  });
  $("btn-thumb").addEventListener("click", () => {
    const prev = state.aspect;
    const was = scrubTime();
    cv.width = 1920; cv.height = 1080; fitCache.clear();
    const { starts, durs } = timeline();
    drawFrame((starts[0] || 0) + Math.min(2.5, (durs[0] || 3) * 0.9), { clean: true });
    cv.toBlob((b) => {
      if (b) saveBlob(b, `${fileBase()}-miniature.jpg`);
      if (prev !== "16:9") { cv.width = 1080; cv.height = 1920; fitCache.clear(); }
      seek(was);
      expStatus("Miniature 1920×1080 téléchargée. Retouche-la si besoin : ton visage et 3 mots maximum convertissent mieux.", "ok");
    }, "image/jpeg", 0.9);
  });

  /* ---------------- Contrôles ---------------- */
  $("btn-play").addEventListener("click", () => { if (playing) stop(); else play(); });
  $("scrub").addEventListener("input", () => { if (playing) stop(); seek(scrubTime()); });
  $("ar-portrait").addEventListener("click", () => setAspect("9:16"));
  $("ar-land").addEventListener("click", () => setAspect("16:9"));
  $("btn-add").addEventListener("click", () => {
    state.scenes.push({ id: uid(), type: "texte", titre: "Nouvelle scène", texte: "", items: [], voix: "", duree: 6 });
    page = Math.floor((state.scenes.length - 1) / PAGE);
    persist(); renderScenes();
    changed(state.scenes.length - 1);
    const last = $("scenes").lastElementChild;
    if (last) last.querySelector("input[type=text]").focus();
  });

  /* ---------------- Démarrage ---------------- */
  setTimeout(() => { loadMB().catch(() => { mbPromise = null; }); }, 1500);
  if (!state.scenes.length) state.scenes = localSplit(state.script);
  bindInputs();
  renderScenes();
  setAspect(state.aspect === "16:9" ? "16:9" : "9:16");
  seek(2.2);

  Promise.all(['800 80px "Barlow Condensed"', '700 40px "Barlow"', '600 40px "Barlow"', '500 40px "Barlow"', '600 24px "IBM Plex Mono"']
    .map((f) => document.fonts.load(f).catch(() => null)))
    .then(() => { fitCache.clear(); if (!playing) seek(scrubTime()); });

  fetch("/api/statut", { credentials: "same-origin" })
    .then((r) => (r.status === 401 ? (location.href = "/connexion.html?e=expire", null) : r.json()))
    .then((d) => {
      iaOn = Boolean(d && d.ia);
      if (!iaOn) {
        $("s-ai").checked = false; $("s-ai").disabled = true;
        genStatus(API_MSG.ia_non_configuree, "warn");
      }
    })
    .catch(() => { $("s-ai").checked = false; $("s-ai").disabled = true; });
})();
