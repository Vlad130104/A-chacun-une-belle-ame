"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = "bachir-ia-v3";
  const PAGE = 20; // scènes affichées par page dans l'éditeur

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
    useAi: false,
    autoBroll: true,
    aspect: "9:16",
    voice: { mode: "ia", id: "fr_FR-siwis-medium", speed: "1" },
    brand: { nom: "Bachir IA", serie: "BACHIR IA", cta: "Abonne-toi pour ne rien rater", primary: "#F5B700", dark: "#0B0C0F", fit: true, subs: true },
    exp: { fps: "30", quality: "high" },
    example: true,
    scenes: [],
  };

  let state;
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem("bachir-ia-v2");
    state = raw ? JSON.parse(raw) : null;
  } catch (e) { state = null; }
  if (!state || !Array.isArray(state.scenes)) state = structuredClone(DEFAULT_STATE);
  for (const k of ["brief", "brand", "exp", "voice"]) state[k] = { ...DEFAULT_STATE[k], ...state[k] };
  if (typeof state.script !== "string") state.script = DEFAULT_STATE.script;
  if (typeof state.useAi !== "boolean") state.useAi = false;
  if (typeof state.autoBroll !== "boolean") state.autoBroll = true;
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
  const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
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
    ctx.font = `600 ${26 * k}px ${F.mono}`; setSpacing(3 * k);
    const w = ctx.measureText(text).width + 32 * k, h = 46 * k;
    rr(x, y, w, h, 23 * k); ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = ink; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(text, x + 16 * k, y + h / 2 + 1);
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
  }
  function drawCover(src, sw, sh, zoom) {
    const W = cv.width, H = cv.height;
    if (!sw || !sh) return;
    const s = Math.max(W / sw, H / sh) * zoom;
    const w = sw * s, h = sh * s;
    ctx.drawImage(src, (W - w) / 2, (H - h) / 2, w, h);
  }

  // Fond de scène : image (léger zoom lent) ou vidéo B-roll (bouclée si plus courte que la scène).
  let activeVideo = null;
  function bgSource(bg, lt, opts) {
    if (!bg) return null;
    if (bg.kind === "image") return { el: bg.img, w: bg.img.naturalWidth, h: bg.img.naturalHeight, still: true };
    if (opts.bgCanvas) return { el: opts.bgCanvas, w: opts.bgCanvas.width, h: opts.bgCanvas.height };
    if (exporting) return null;
    const v = bg.el;
    const want = bg.dur ? lt % bg.dur : 0;
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
  function drawCaptions(sc, lt, dur, W, pad, cw, k, land, PRIMARY, INK, centerY) {
    const wc = wordClock(sc, lt, dur);
    if (!wc) return;
    const size = (land ? 52 : 78) * k;
    ctx.font = land ? `700 ${size}px ${F.body}` : `800 ${size}px ${F.disp}`;
    const words = land ? wc.words : wc.words.map((w) => w.toUpperCase());
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
    if (land) {
      rr(pad, top - 16 * k, cw, lines.length * lh + 32 * k, 12 * k);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fill();
    }
    ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.lineJoin = "round";
    lines.forEach(({ line, width }, j) => {
      let x = W / 2 - width / 2;
      const y = top + j * lh + lh / 2;
      for (const { w, i, ww } of line) {
        if (i === wc.current) {
          rr(x - 10 * k, y - size * 0.55, ww + 20 * k, size * 1.1, 10 * k);
          ctx.fillStyle = PRIMARY; ctx.fill();
          ctx.fillStyle = INK; ctx.fillText(w, x, y + 2 * k);
        } else {
          if (!land) { ctx.lineWidth = 9 * k; ctx.strokeStyle = "rgba(0,0,0,0.85)"; ctx.strokeText(w, x, y + 2 * k); }
          ctx.fillStyle = "#FFFFFF"; ctx.fillText(w, x, y + 2 * k);
        }
        x += ww + space;
      }
    });
  }

  function drawFrame(t, opts = {}) {
    const W = cv.width, H = cv.height, land = W > H;
    const k = Math.min(W, H) / 1080;
    const brand = state.brand;
    const TLc = timeline();
    const PRIMARY = brand.primary || "#F5B700", DARK = brand.dark || "#0B0C0F", INK = "#0B0C0F";

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

    // Fond : B-roll plein écran, assombri vers le bas pour la lisibilité ; sinon aplat uni.
    const src = bgSource(media.bg.get(sc.id), lt, opts);
    const hasBg = Boolean(src);
    if (src) {
      drawCover(src.el, src.w, src.h, src.still ? 1.04 + 0.08 * clamp(lt / dur) : 1);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0.45)"); g.addColorStop(0.22, "rgba(0,0,0,0.05)");
      g.addColorStop(0.5, "rgba(0,0,0,0.25)"); g.addColorStop(1, "rgba(0,0,0,0.88)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }

    const pad = (land ? 110 : 72) * k;
    const cw = W - pad * 2;

    // Signature discrète : logo ou nom de la chaîne, chapitre en cours
    const headY = (land ? 48 : 90) * k;
    ctx.globalAlpha = 0.9;
    if (media.logo) {
      const lh = 64 * k, lw = (media.logo.naturalWidth / media.logo.naturalHeight) * lh;
      ctx.drawImage(media.logo, pad, headY - 8 * k, Math.min(lw, cw * 0.4), lh);
    } else if (brand.nom) {
      ctx.fillStyle = "#FFFFFF"; ctx.font = `700 ${30 * k}px ${F.disp}`; setSpacing(3 * k);
      ctx.textBaseline = "top"; ctx.textAlign = "left";
      ctx.fillText(String(brand.nom).toUpperCase(), pad, headY);
    }
    if (TLc.chap[i] > 0 && sc.type !== "chapitre") {
      ctx.fillStyle = PRIMARY; ctx.font = `600 ${24 * k}px ${F.mono}`; setSpacing(3 * k); ctx.textAlign = "right"; ctx.textBaseline = "top";
      ctx.fillText(`CHAPITRE ${String(TLc.chap[i]).padStart(2, "0")}`, W - pad, headY + 4 * k);
    }
    ctx.globalAlpha = 1; setSpacing(0);

    const enter = (delay) => {
      const a = easeOut((lt - delay) / 0.45);
      ctx.globalAlpha = a;
      return (1 - a) * 40 * k;
    };
    const sz = hasBg ? 0.8 : 1;
    const titleLines = (txt, size, min, max) => fit(String(txt || "").toUpperCase(), 800, F.disp, size * sz * k, min * k, cw, max);
    const drawTitle = (tt, y, dy, color = "#FFFFFF", lhK = 0.98) => {
      ctx.fillStyle = color; ctx.font = `800 ${tt.size}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      if (hasBg) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 24 * k; }
      const lh = tt.size * lhK;
      tt.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + tt.size * 0.8 + j * lh));
      ctx.shadowBlur = 0;
      return tt.lines.length * lh;
    };
    const drawBody = (txt, y, dy, size, maxLines, alpha = 0.9, weight = 500) => {
      if (!txt) return 0;
      const st = fit(txt, weight, F.body, size * sz * k, 30 * k, cw, maxLines);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.font = `${weight} ${st.size}px ${F.body}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      st.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + st.size + j * st.size * 1.3));
      return st.lines.length * st.size * 1.3;
    };

    const subs = !opts.clean && brand.subs && sc.voix && sc.voix.trim();
    // Avec un B-roll, le texte descend dans le tiers inférieur ; sans, il occupe le haut de l'écran.
    let y = hasBg ? H * 0.5 : (land ? H * 0.2 : H * 0.22);
    const bodyMax = hasBg ? 2 : land ? (subs ? 2 : 4) : (subs ? 3 : 6);
    const showBody = !(hasBg && subs);

    if (sc.type === "titre") {
      const dy = enter(0);
      if (brand.serie) { pill(String(brand.serie).toUpperCase(), pad, y + dy, PRIMARY, INK, k); y += 76 * k; }
      y += drawTitle(titleLines(sc.titre, land ? 150 : 170, 70, land ? 3 : 4), y, enter(0.12)) + 30 * k;
      ctx.globalAlpha = 1;
      ctx.fillStyle = PRIMARY; ctx.fillRect(pad, y, 150 * k * easeOut((lt - 0.3) / 0.5), 10 * k);
      y += 40 * k;
      if (showBody) drawBody(sc.texte, y, enter(0.45), 54, bodyMax);
    } else if (sc.type === "chapitre") {
      const dy = enter(0);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${(land ? 200 : 240) * sz * k}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(String(TLc.chap[i]).padStart(2, "0"), pad - 6 * k, y + dy + (land ? 165 : 195) * sz * k);
      y += (land ? 210 : 250) * sz * k;
      y += drawTitle(titleLines(sc.titre, land ? 116 : 126, 60, 3), y, enter(0.15)) + 24 * k;
      if (showBody) drawBody(sc.texte, y, enter(0.35), 50, bodyMax);
    } else if (sc.type === "citation") {
      let dy = enter(0);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${(land ? 240 : 280) * sz * k}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText("“", pad - 10 * k, y + dy + 190 * sz * k);
      y += 160 * sz * k;
      const q = fit(sc.titre, 600, F.body, (land ? 70 : 78) * sz * k, 38 * k, cw, land ? 4 : 6);
      dy = enter(0.15);
      ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${q.size}px ${F.body}`;
      q.lines.forEach((l, j) => ctx.fillText(l, pad, y + dy + q.size + j * q.size * 1.25));
      y += q.lines.length * q.size * 1.25 + 36 * k;
      if (sc.texte) {
        dy = enter(0.35);
        ctx.fillStyle = PRIMARY; ctx.font = `600 ${32 * k}px ${F.mono}`;
        ctx.fillText("— " + sc.texte, pad, y + dy + 32 * k);
      }
    } else if (sc.type === "chiffre") {
      const dy = enter(0);
      const nt = fit(sc.titre, 800, F.disp, (land ? 320 : 400) * sz * k, 110 * k, cw, 1);
      ctx.fillStyle = PRIMARY; ctx.font = `800 ${nt.size}px ${F.disp}`; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      y += nt.size * 0.85;
      ctx.fillText(nt.lines[0] || "", pad - 8 * k, y + dy);
      y += 40 * k;
      if (showBody) drawBody(sc.texte, y, enter(0.3), 66, bodyMax, 1, 600);
    } else if (sc.type === "liste") {
      const dy = enter(0);
      pill(T.tag, pad, y + dy, PRIMARY, INK, k);
      y += 72 * k;
      y += drawTitle(titleLines(sc.titre, 96, 54, 2), y, enter(0.12), "#FFFFFF", 1) + 34 * k;
      const items = (sc.items || []).filter(Boolean).slice(0, 5);
      const stepDelay = Math.min(0.9, (dur * 0.55) / Math.max(1, items.length));
      const box = 70 * k;
      items.forEach((it, j) => {
        const d = enter(0.45 + j * stepDelay);
        const lines = fit(it, 600, F.body, 48 * sz * k, 32 * k, cw - box - 28 * k, 2);
        const rowH = Math.max(box, lines.lines.length * lines.size * 1.2) + 20 * k;
        ctx.save(); ctx.translate(-d, 0);
        rr(pad, y, box, box, box / 2); ctx.fillStyle = PRIMARY; ctx.fill();
        ctx.fillStyle = INK; ctx.font = `800 ${46 * k}px ${F.disp}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(String(j + 1), pad + box / 2, y + box / 2 + 2 * k);
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#FFFFFF"; ctx.font = `600 ${lines.size}px ${F.body}`;
        const ty = y + box / 2 - ((lines.lines.length - 1) * lines.size * 1.2) / 2 + lines.size * 0.35;
        lines.lines.forEach((l, m) => ctx.fillText(l, pad + box + 28 * k, ty + m * lines.size * 1.2));
        ctx.restore();
        y += rowH;
      });
    } else if (sc.type === "alerte") {
      const r = (land ? 70 : 84) * sz * k;
      warnIcon(pad + r * 1.12, y + r + enter(0), r, PRIMARY, INK);
      y += r * 2 + 36 * k;
      pill(T.tag, pad, y + enter(0.1), PRIMARY, INK, k);
      y += 72 * k;
      y += drawTitle(titleLines(sc.titre, land ? 104 : 114, 58, 3), y, enter(0.22), "#FFFFFF", 1) + 26 * k;
      if (showBody) drawBody(sc.texte, y, enter(0.4), 52, bodyMax);
    } else if (sc.type === "cta") {
      y += drawTitle(titleLines(sc.titre, land ? 116 : 126, 58, 3), y, enter(0), "#FFFFFF", 1) + 26 * k;
      if (showBody) y += drawBody(sc.texte, y, enter(0.2), 52, 2) + 30 * k;
      ctx.globalAlpha = easeOut((lt - 0.5) / 0.45);
      const pulse = 1 + 0.04 * Math.sin(lt * 5);
      ctx.save(); ctx.translate(pad, y + 10 * k); ctx.scale(pulse, pulse);
      subscribeButton(0, 0, k);
      ctx.restore();
      y += 130 * k;
      if (brand.cta && !hasBg) drawBody(brand.cta, y, 0, 42, 2, 0.8, 600);
    } else {
      y += drawTitle(titleLines(sc.titre, land ? 104 : 116, 54, 3), y, enter(0), "#FFFFFF", 1) + 26 * k;
      if (showBody) drawBody(sc.texte, y, enter(0.25), 52, bodyMax);
    }

    ctx.globalAlpha = 1; setSpacing(0);
    if (subs) {
      const centerY = land ? H - 110 * k : (hasBg ? H * 0.82 : H * 0.78);
      drawCaptions(sc, lt, dur, W, pad, cw, k, land, PRIMARY, INK, centerY);
    }

    // Fondu d'entrée de scène et fine barre de progression
    if (i > 0 && lt < 0.22) { ctx.fillStyle = DARK; ctx.globalAlpha = 0.55 * (1 - lt / 0.22); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if (!opts.clean) {
      ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(0, H - 6 * k, W, 6 * k);
      ctx.fillStyle = PRIMARY; ctx.fillRect(0, H - 6 * k, W * clamp(t / TLc.total), 6 * k);
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
  }

  /* ---------------- Fonds de scène (images et B-rolls) ---------------- */
  async function setBackground(sc, blob, meta = {}) {
    const url = URL.createObjectURL(blob);
    let entry;
    if (String(blob.type).startsWith("image/")) {
      const img = new Image();
      await new Promise((ok, ko) => { img.onload = ok; img.onerror = () => ko(new Error("image illisible")); img.src = url; });
      entry = { kind: "image", img, url, blob, ...meta };
    } else {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.loop = true; v.preload = "auto";
      v.src = url;
      await new Promise((ok, ko) => { v.onloadeddata = ok; v.onerror = () => ko(new Error("vidéo illisible dans ce navigateur")); });
      v.addEventListener("seeked", () => { if (!playing && !exporting) drawFrame(scrubTime()); });
      entry = { kind: "video", el: v, url, blob, dur: v.duration || 1, ...meta };
    }
    clearBackground(sc);
    media.bg.set(sc.id, entry);
  }
  function clearBackground(sc) {
    const old = media.bg.get(sc.id);
    if (old) { URL.revokeObjectURL(old.url); if (old.el) old.el.pause(); }
    media.bg.delete(sc.id);
  }

  const STOP = new Set(("le la les un une des de du d l et ou mais donc car ni que qui quoi dont où à au aux en dans par pour sur sous avec sans chez ce cet cette ces " +
    "son sa ses mon ma mes ton ta tes notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te se y ne pas plus moins très tout tous toute " +
    "toutes est sont été être avoir ai as avons avez ont fait faire comme si alors aussi bien encore déjà là ici voici voilà cela ça qu n j m t s c " +
    "première premier deuxième troisième dis dit vais va vas veux peux quand comment pourquoi chaque").split(" "));
  function keywords(sc) {
    if (sc.broll && sc.broll.trim()) return sc.broll.trim();
    const words = wordsOf(`${sc.titre} ${sc.voix}`).filter((w) => w.length > 3 && !STOP.has(w) && !/^\d+$/.test(w));
    return [...new Set(words)].slice(0, 3).join(" ");
  }

  /* ---------------- Serveur Bachir IA ---------------- */
  let iaOn = false, brollOn = false;
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

  /* ---------------- B-rolls Pexels ---------------- */
  async function brollSearch(q) {
    const d = await api("/api/broll/recherche", { q, orientation: state.aspect === "16:9" ? "landscape" : "portrait" });
    return d.videos || [];
  }
  async function brollDownload(v) {
    try {
      const r = await fetch(v.link, { mode: "cors", credentials: "omit" });
      if (r.ok) return new Blob([await r.blob()], { type: "video/mp4" });
    } catch (e) { /* téléchargement direct refusé : passage par le relais */ }
    const r = await fetch(`/api/broll/fichier?id=${encodeURIComponent(v.id)}&f=${encodeURIComponent(v.fileId)}`, { credentials: "same-origin" });
    if (!r.ok) throw new Error("téléchargement du B-roll impossible");
    return new Blob([await r.blob()], { type: "video/mp4" });
  }
  // Ajoute un B-roll aux scènes sans fond (au plus `limit` par passage), sans réutiliser deux fois le même clip.
  async function autoBroll(limit, report) {
    const used = new Set([...media.bg.values()].map((b) => b.pexelsId).filter(Boolean));
    const todo = state.scenes.filter((s) => !media.bg.has(s.id) && keywords(s)).slice(0, limit);
    let done = 0, fail = 0;
    const worker = async () => {
      while (todo.length) {
        const sc = todo.shift();
        try {
          const vids = await brollSearch(keywords(sc));
          const pick = vids.find((v) => !used.has(v.id)) || vids[0];
          if (!pick) { fail++; continue; }
          used.add(pick.id);
          await setBackground(sc, await brollDownload(pick), { pexelsId: pick.id, author: pick.author });
          done++;
        } catch (e) {
          fail++;
          if (e && e.code === "broll_sature") todo.length = 0;
        }
        report(`B-rolls : ${done} ajoutés${fail ? `, ${fail} sans résultat` : ""}…`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    renderScenes();
    return { done, fail, left: state.scenes.filter((s) => !media.bg.has(s.id)).length };
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
  // Une lecture par scène : la durée de chaque scène devient celle de sa phrase, plus une courte pause.
  async function generateVoice(report) {
    const V = await loadVoiceMod();
    const id = state.voice.id, speed = Number(state.voice.speed) || 1;
    const meta = V.VOICES.find((v) => v.id === id) || V.VOICES[0];
    report(`Chargement de la voix ${meta.name}…`);
    await V.loadVoice(meta.id, (p) => report(`Téléchargement de la voix ${meta.name} : ${Math.round(p * 100)} % (une seule fois, ${meta.mb} Mo)`));
    const pause = state.aspect === "9:16" ? 0.25 : 0.45;
    const parts = [];
    let sr = 0;
    const began = performance.now();
    for (let i = 0; i < state.scenes.length; i++) {
      const s = state.scenes[i];
      let pcm = null;
      if (s.voix && s.voix.trim()) {
        const a = await V.speak(s.voix, meta.id, speed);
        sr = a.sampleRate; pcm = toInt16(a.pcm);
      }
      parts.push(pcm);
      const elapsed = (performance.now() - began) / 1000, p = (i + 1) / state.scenes.length;
      report(`Voix : scène ${i + 1} sur ${state.scenes.length}` + (i > 2 ? ` · reste environ ${fmt(elapsed / p - elapsed)}` : ""));
      await tick();
    }
    if (!sr) throw new Error("Aucune scène n'a de texte à lire.");
    const out = [];
    state.scenes.forEach((s, i) => {
      const pcm = parts[i];
      const silence = Math.round(sr * (pcm ? pause : 2));
      if (pcm) out.push(pcm);
      out.push(new Int16Array(silence));
      s.speech = pcm ? pcm.length / sr : 0;
      s.duree = Math.round(((pcm ? pcm.length : 0) + silence) / sr * 1000) / 1000;
    });
    persist();
    await setVoiceFile(new File([wavBlob(out, sr)], "voix-bachir.wav", { type: "audio/wav" }), true);
    return { seconds: timeline().total, voice: meta.name };
  }

  async function renderVoices() {
    let V;
    try { V = await loadVoiceMod(); } catch (e) {
      $("voices").textContent = "Le moteur de voix ne se charge pas dans ce navigateur. Utilise Chrome ou Edge à jour, ou importe ta propre voix.";
      state.voice.mode = "fichier"; $("own-voice").hidden = false; $("btn-voice").hidden = true; return;
    }
    const box = $("voices");
    box.replaceChildren();
    const select = (mode, id) => {
      state.voice.mode = mode; if (id) state.voice.id = id;
      persist();
      [...box.children].forEach((c) => c.setAttribute("aria-checked", String(c.dataset.mode === mode && (mode === "fichier" || c.dataset.id === state.voice.id))));
      $("own-voice").hidden = mode !== "fichier";
      $("btn-voice").hidden = mode === "fichier";
    };
    for (const v of V.VOICES) {
      const cached = await V.isCached(v.id);
      const listen = el("button", { type: "button", class: "btn small listen", text: "▶ Écouter" });
      const info = el("small", { text: cached ? "Prête sur cet ordinateur" : `${v.mb} Mo à télécharger une fois` });
      const card = el("div", { class: "voice", role: "radio", tabindex: "0" },
        el("b", { text: v.name }), el("small", { text: `${v.genre} · ${v.detail}` }), info, listen);
      card.dataset.mode = "ia"; card.dataset.id = v.id;
      card.addEventListener("click", (e) => { if (e.target !== listen) select("ia", v.id); });
      card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select("ia", v.id); } });
      listen.addEventListener("click", async () => {
        select("ia", v.id);
        listen.disabled = true;
        try {
          await V.loadVoice(v.id, (p) => status("voice-status", `Téléchargement de ${v.name} : ${Math.round(p * 100)} %`));
          status("voice-status", `Lecture de ${v.name}…`);
          const a = await V.speak(V.SAMPLE_TEXT, v.id, Number(state.voice.speed) || 1);
          new Audio(URL.createObjectURL(V.toWav([a.pcm], a.sampleRate))).play().catch(() => {});
          info.textContent = "Prête sur cet ordinateur";
          status("voice-status", "");
        } catch (e) {
          status("voice-status", "Impossible de charger cette voix : " + ((e && e.message) || "erreur") + ".", "warn");
        } finally { listen.disabled = false; }
      });
      box.append(card);
    }
    const own = el("div", { class: "voice", role: "radio", tabindex: "0" }, el("b", { text: "Ma voix" }), el("small", { text: "Ton enregistrement : la voix la plus crédible" }));
    own.dataset.mode = "fichier";
    own.addEventListener("click", () => select("fichier"));
    own.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select("fichier"); } });
    box.append(own);
    select(state.voice.mode, state.voice.id);
  }

  /* ---------------- Éditeur de scènes ---------------- */
  let page = 0;
  function focusScene(idx) {
    if (playing || exporting) return;
    const { starts, durs } = timeline();
    if (idx >= starts.length) return;
    seek(starts[idx] + Math.min(durs[idx] * 0.6, 2.5));
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
    list.classList.toggle("land", state.aspect === "16:9");
    const pages = Math.max(1, Math.ceil(state.scenes.length / PAGE));
    page = clamp(page, 0, pages - 1);
    const from = page * PAGE, to = Math.min(state.scenes.length, from + PAGE);
    const { durs } = timeline();
    for (let i = from; i < to; i++) {
      const s = state.scenes[i];
      const id = (f) => `sc-${s.id}-${f}`;
      const bg = media.bg.get(s.id);

      const thumb = el("div", { class: "thumb" });
      if (bg && bg.kind === "image") thumb.append(el("img", { src: bg.url, alt: "" }), el("span", { class: "tag", text: "Image" }));
      else if (bg) thumb.append(el("video", { src: bg.url, muted: true, playsInline: true, preload: "metadata" }), el("span", { class: "tag", text: "B-roll" }));
      else thumb.append(el("span", { text: "Pas de fond" }));

      const typeSel = el("select", { id: id("type"), "aria-label": `Type de la scène ${i + 1}` },
        Object.entries(TYPES).map(([v, t]) => el("option", { value: v, text: t.label, selected: v === s.type })));
      const durLab = el("span", { class: "dur", text: `${(durs[i] || 0).toFixed(1)} s` });
      const up = el("button", { type: "button", class: "icon-btn", text: "↑", "aria-label": "Monter la scène", disabled: i === 0 });
      const down = el("button", { type: "button", class: "icon-btn", text: "↓", "aria-label": "Descendre la scène", disabled: i === state.scenes.length - 1 });
      const del = el("button", { type: "button", class: "icon-btn", text: "×", "aria-label": "Supprimer la scène" });

      const titre = el("input", { type: "text", id: id("titre"), value: s.titre || "" });
      const titreLab = el("label", { class: "f" }, el("span", { text: titleLabel(s.type) }), titre);
      const texte = el("input", { type: "text", id: id("texte"), value: s.texte || "" });
      const texteLab = el("label", { class: "f" }, el("span", { text: texteLabel(s.type) }), texte);
      const items = el("textarea", { id: id("items"), rows: 3 });
      items.value = (s.items || []).join("\n");
      const itemsLab = el("label", { class: "f" }, el("span", { text: "Points (un par ligne, 5 max)" }), items);
      itemsLab.hidden = s.type !== "liste";
      const voix = el("textarea", { id: id("voix"), rows: 2 });
      voix.value = s.voix || "";
      const voixLab = el("label", { class: "f" }, el("span", { text: "Voix off et sous-titres" }), voix);

      const file = el("input", { type: "file", id: id("bg"), accept: "image/*,video/*", "aria-label": "Image ou vidéo de fond" });
      const kw = el("input", { type: "text", id: id("kw"), value: s.broll || "", placeholder: keywords({ ...s, broll: "" }) || "mots-clés du B-roll", "aria-label": "Mots-clés du B-roll" });
      const search = el("button", { type: "button", class: "btn small", text: "Chercher" });
      const rm = el("button", { type: "button", class: "btn small ghost", text: "Retirer le fond", hidden: !bg });
      const results = el("div", { class: "results", hidden: true });
      const mediaRow = el("div", { class: "media" }, file, ...(brollOn ? [kw, search] : []), rm);

      const card = el("article", { class: "scene" }, thumb,
        el("div", { class: "body" },
          el("div", { class: "head" }, el("span", { class: "n", text: `Scène ${i + 1}` }), typeSel, durLab, el("div", { class: "tools" }, up, down, del)),
          titreLab, texteLab, itemsLab, voixLab, mediaRow, results));
      card.addEventListener("focusin", () => focusScene(i));

      typeSel.addEventListener("change", () => {
        s.type = typeSel.value;
        itemsLab.hidden = s.type !== "liste";
        titreLab.firstChild.textContent = titleLabel(s.type);
        texteLab.firstChild.textContent = texteLabel(s.type);
        changed(i);
      });
      titre.addEventListener("input", () => { s.titre = titre.value; changed(i); });
      texte.addEventListener("input", () => { s.texte = texte.value; changed(i); });
      items.addEventListener("input", () => { s.items = items.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 5); changed(i); });
      voix.addEventListener("input", () => {
        s.voix = voix.value;
        if (media.voiceTts) status("voice-status", "Le texte a changé : clique sur « Générer la voix » pour la mettre à jour.", "warn");
        changed(null);
      });
      kw.addEventListener("input", () => { s.broll = kw.value; persist(); });
      file.addEventListener("change", async () => {
        const f = file.files && file.files[0];
        if (!f) return;
        try { await setBackground(s, f); renderScenes(); focusScene(i); }
        catch (e) { status("broll-note", e.message, "warn"); }
      });
      rm.addEventListener("click", () => { clearBackground(s); renderScenes(); focusScene(i); });
      search.addEventListener("click", async () => {
        const q = keywords(s);
        if (!q) return;
        search.disabled = true; results.hidden = false; results.textContent = "Recherche…";
        try {
          const vids = await brollSearch(q);
          results.replaceChildren(...vids.map((v) => {
            const b = el("button", { type: "button", title: `Vidéo de ${v.author} sur Pexels` }, el("img", { src: v.image, alt: `B-roll : ${q}`, loading: "lazy" }));
            b.addEventListener("click", async () => {
              results.textContent = "Téléchargement du B-roll…";
              try { await setBackground(s, await brollDownload(v), { pexelsId: v.id, author: v.author }); renderScenes(); focusScene(i); }
              catch (e) { results.textContent = e.message; }
            });
            return b;
          }));
          if (!vids.length) results.textContent = "Aucun résultat : essaie d'autres mots-clés (en français ou en anglais).";
        } catch (e) { results.textContent = (e && e.message) || "Recherche impossible."; }
        finally { search.disabled = false; }
      });
      up.addEventListener("click", () => { [state.scenes[i - 1], state.scenes[i]] = [state.scenes[i], state.scenes[i - 1]]; persist(); renderScenes(); changed(i - 1); });
      down.addEventListener("click", () => { [state.scenes[i + 1], state.scenes[i]] = [state.scenes[i], state.scenes[i + 1]]; persist(); renderScenes(); changed(i + 1); });
      del.addEventListener("click", () => { clearBackground(s); state.scenes.splice(i, 1); persist(); renderScenes(); changed(null); });

      list.append(card);
    }
    $("pager").hidden = pages < 2;
    $("pg-info").textContent = `Scènes ${state.scenes.length ? from + 1 : 0} à ${to} sur ${state.scenes.length}`;
    $("pg-prev").disabled = page === 0;
    $("pg-next").disabled = page >= pages - 1;
    $("ex-badge").hidden = !state.example;
    const missing = state.scenes.filter((s) => !media.bg.has(s.id)).length;
    $("broll-note").textContent = brollOn ? `${missing} scène(s) sans fond` : "Importe tes vidéos ou images par scène (B-rolls automatiques : clé Pexels à ajouter sur le serveur).";
    $("btn-broll-all").hidden = !brollOn;
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
    $("rg-info").textContent = msg;
    $("rg-pick").hidden = $("rg-all").checked;
  }

  /* ---------------- Réglages ---------------- */
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
    $("subs").checked = !!br.subs;
    $("subs").addEventListener("change", (e) => { br.subs = e.target.checked; persist(); seek(scrubTime()); });
    $("s-script").value = state.script;
    $("s-script").addEventListener("input", (e) => { state.script = e.target.value; persist(); });
    $("s-ai").checked = state.useAi;
    $("s-ai").addEventListener("change", (e) => { state.useAi = e.target.checked; persist(); });
    $("s-auto-broll").checked = state.autoBroll;
    $("s-auto-broll").addEventListener("change", (e) => { state.autoBroll = e.target.checked; persist(); });
    $("v-speed").value = state.voice.speed;
    $("v-speed").addEventListener("change", (e) => { state.voice.speed = e.target.value; persist(); });
    [["br-nom", "nom"], ["br-serie", "serie"], ["br-cta", "cta"], ["br-primary", "primary"], ["br-dark", "dark"]].forEach(([id, key]) =>
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
    $("scenes").classList.toggle("land", land);
    fitCache.clear();
    persist();
    rangeInfo();
    seek(scrubTime());
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
  function normalize(out) {
    const arr = out && Array.isArray(out.scenes) ? out.scenes : [];
    return arr.slice(0, 200).map((s) => ({
      id: uid(),
      type: TYPES[s && s.type] ? s.type : "texte",
      titre: String((s && s.titre) || "").slice(0, 120),
      texte: String((s && s.texte) || "").slice(0, 240),
      items: Array.isArray(s && s.items) ? s.items.map((x) => String(x).slice(0, 60)).filter(Boolean).slice(0, 5) : [],
      voix: String((s && s.voix) || "").slice(0, 2000),
      broll: "",
      duree: clamp(Math.round(Number(s && s.duree) || 6), 1, 120),
    }));
  }

  // Une scène par paragraphe ; les longs paragraphes sont coupés en scènes d'environ 30 mots.
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
    const push = (s) => scenes.push({ id: uid(), texte: "", items: [], broll: "", ...s });
    blocks.forEach((b) => {
      const lines = b.split("\n");
      const h = /^(#{1,3})\s+(.*)$/.exec(lines[0]);
      if (h) {
        push({ type: h[1] === "#" ? "titre" : "chapitre", titre: h[2].trim(), voix: "", duree: 3 });
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
      const sentences = (text.match(/[^.!?…]+[.!?…]+["»”]?|[^.!?…]+$/g) || [text]).map((x) => x.trim()).filter(Boolean);
      const parts = [];
      let cur = "";
      for (const s of sentences) {
        if (cur && wordsOf(cur + " " + s).length > 30) { parts.push(cur); cur = s; } else cur = cur ? cur + " " + s : s;
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
    if (scenes.length > 1 && scenes[0].type === "titre" && !scenes[0].voix && scenes[1].type === "texte") {
      scenes[0].texte = shorten(scenes[1].voix, 110);
      scenes[0].voix = scenes[1].voix;
      scenes[0].duree = scenes[1].duree;
      scenes.splice(1, 1);
    }
    return scenes.slice(0, 3000);
  }

  async function buildScenes() {
    const text = String(state.script || "").trim();
    if (!text) throw new Error("Colle d'abord ton script.");
    let scenes = null, note = "", viaIa = false;
    if (state.useAi && iaOn && text.length <= 12000) {
      try {
        scenes = normalize(await api("/api/decoupe", { script: text }));
        scenes.forEach((s) => { s.duree = s.voix ? durFor(s.voix) : 3; });
        if (!scenes.length) scenes = null; else viaIa = true;
      } catch (e) {
        note = " " + ((e && e.message) || "L'IA n'a pas répondu.") + " Découpage automatique.";
      }
    }
    if (!scenes) scenes = localSplit(text);
    for (const s of state.scenes) clearBackground(s);
    if (media.voiceFile) clearVoice();
    state.scenes = scenes; state.example = false; page = 0;
    persist(); renderScenes(); seek(1.2);
    const clean = (s) => s.split("\n").map((l) => l.trim().replace(BULLET, "").replace(/^#{1,3}\s+.*$/, "").replace(/^>\s?/, "")).join(" ");
    const same = !viaIa || sameWords(clean(text), scenes.map((s) => s.voix).join(" "));
    return { count: scenes.length, note: note + (same ? "" : " Vérifie la voix de chaque scène : elle ne reprend pas ton script mot pour mot.") };
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
      stepState("st-scenes", "run"); report("Découpage du script…");
      const r = await buildScenes();
      if (r.note) notes.push(r.note.trim());
      stepState("st-scenes", "done");

      if (state.voice.mode === "ia") {
        stepState("st-voice", "run");
        const v = await generateVoice(report);
        stepState("st-voice", "done");
        notes.push(`Voix ${v.voice} : ${fmt(v.seconds)}.`);
      } else {
        stepState("st-voice", "skip");
        notes.push("Importe ton enregistrement dans « Voix » : les scènes se caleront dessus.");
      }

      if (state.autoBroll && brollOn) {
        stepState("st-broll", "run");
        const b = await autoBroll(40, report);
        stepState("st-broll", "done");
        notes.push(`${b.done} B-roll(s) ajoutés${b.left ? `, ${b.left} scène(s) sans fond (relance « Trouver les B-rolls manquants » ou importe tes vidéos)` : ""}.`);
      } else {
        stepState("st-broll", "skip");
        if (state.autoBroll && !brollOn) notes.push("B-rolls automatiques non activés sur le serveur : importe tes vidéos ou images par scène.");
      }
      seek(0.3);
      status("script-status", `Vidéo prête : ${state.scenes.length} scènes, ${fmt(timeline().total)}. ${notes.join(" ")} Vérifie l'aperçu, puis exporte.`, "ok");
    } catch (e) {
      ["st-scenes", "st-voice", "st-broll"].forEach((id) => { if ($(id).className === "run") stepState(id, ""); });
      status("script-status", (e && e.message) || "La génération a échoué.", "warn");
    } finally {
      btn.disabled = false;
    }
  });

  $("btn-voice").addEventListener("click", async () => {
    const btn = $("btn-voice");
    if (!state.scenes.length) { status("voice-status", "Crée d'abord les scènes à partir de ton script.", "warn"); return; }
    btn.disabled = true;
    try {
      const v = await generateVoice((m) => status("voice-status", m));
      status("voice-status", `Voix ${v.voice} générée : ${fmt(v.seconds)}. Les scènes sont calées dessus.`, "ok");
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
    status("voice-status", `${f.name} · ${fmt(voiceEl.duration || 0)}. Les scènes sont calées proportionnellement sur ta voix.`, "ok");
  });
  $("btn-copy").addEventListener("click", () => {
    copyText($("prompter").textContent, () => status("voice-status", "Texte copié.", "ok"), () => {
      const r = document.createRange(); r.selectNodeContents($("prompter"));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      status("voice-status", "Texte sélectionné : copie-le avec Ctrl+C.");
    });
  });
  $("btn-broll-all").addEventListener("click", async () => {
    const btn = $("btn-broll-all");
    btn.disabled = true;
    try {
      const b = await autoBroll(40, (m) => status("script-status", m));
      status("script-status", `${b.done} B-roll(s) ajoutés.${b.left ? ` ${b.left} scène(s) encore sans fond : relance pour continuer.` : ""}`, "ok");
    } finally { btn.disabled = false; }
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
  function fileBase() { return slug(state.scenes[0] && state.scenes[0].titre) + (state.aspect === "9:16" ? "-short" : ""); }

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
      const q0 = state.exp.quality === "standard" ? MB.QUALITY_MEDIUM : MB.QUALITY_HIGH;
      for (const c of ["avc", "vp9"]) {
        if (await MB.canEncodeVideo(c, { width: cv.width, height: cv.height, quality: q0 })) { vcodec = c; break; }
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
    const bgReaders = new Map(); // scène -> lecteur du B-roll, ouvert à la demande
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
      // Image de B-roll de la scène courante, décodée à l'image près et bouclée si le clip est plus court.
      const bgFrame = async (i) => {
        const sc = state.scenes[i];
        const bg = media.bg.get(sc.id);
        if (!bg || bg.kind !== "video") return null;
        if (!curBg || curBg.i !== i) {
          if (curBg && curBg.iter) await curBg.iter.return?.();
          let rd = bgReaders.get(sc.id);
          if (!rd) {
            const inp = new MB.Input({ source: new MB.BlobSource(bg.blob), formats: MB.ALL_FORMATS });
            const vt = await inp.getPrimaryVideoTrack();
            rd = vt && (await vt.canDecode())
              ? { inp, sink: new MB.CanvasSink(vt, { width: cv.width, height: cv.height, fit: "cover" }), dur: (await vt.computeDuration()) || bg.dur || 1 }
              : { inp };
            bgReaders.set(sc.id, rd);
          }
          if (!rd.sink) { curBg = { i, iter: null }; return null; }
          const fStart = f, fEnd = Math.min(N, Math.ceil((starts[i] + durs[i] - t0) * fps));
          const times = function* () { for (let g = fStart; g < fEnd; g++) yield Math.max(0, t0 + g / fps - starts[i]) % rd.dur; };
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
  $("ar-portrait").addEventListener("click", () => { setAspect("9:16"); renderScenes(); });
  $("ar-land").addEventListener("click", () => { setAspect("16:9"); renderScenes(); });
  $("btn-add").addEventListener("click", () => {
    state.scenes.push({ id: uid(), type: "texte", titre: "Nouvelle scène", texte: "", items: [], voix: "", broll: "", duree: 5 });
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
  setAspect(state.aspect === "16:9" ? "16:9" : "9:16");
  renderScenes();
  seek(1.5);
  renderVoices();

  Promise.all(['800 80px "Barlow Condensed"', '700 40px "Barlow"', '600 40px "Barlow"', '500 40px "Barlow"', '600 24px "IBM Plex Mono"']
    .map((f) => document.fonts.load(f).catch(() => null)))
    .then(() => { fitCache.clear(); if (!playing) seek(scrubTime()); });

  fetch("/api/statut", { credentials: "same-origin" })
    .then((r) => (r.status === 401 ? (location.href = "/connexion.html?e=expire", null) : r.json()))
    .then((d) => {
      iaOn = Boolean(d && d.ia);
      brollOn = Boolean(d && d.broll);
      if (!iaOn) { $("s-ai").checked = false; $("s-ai").disabled = true; $("s-ai").parentElement.title = "IA non activée sur le serveur"; }
      if (!brollOn) $("s-auto-broll").parentElement.title = "Clé Pexels absente sur le serveur";
      renderScenes();
    })
    .catch(() => { $("s-ai").checked = false; $("s-ai").disabled = true; });
})();
