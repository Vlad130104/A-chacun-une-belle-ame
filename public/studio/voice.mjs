// Synthèse vocale Piper exécutée dans le navigateur : rien n'est envoyé à un serveur, aucun coût par minute.
// Le texte est converti en phonèmes (espeak-ng), puis le modèle de voix (ONNX) produit l'audio.
import * as ort from "/vendor/ort/ort.wasm.min.mjs";
import createPiperPhonemize from "/vendor/piper/piper_phonemize.mjs";

ort.env.wasm.wasmPaths = "/vendor/ort/";
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1)) : 1;

export const VOICES = [
  { id: "fr_FR-siwis-medium", name: "Siwis", genre: "Femme", detail: "voix claire, la plus naturelle", parts: 3, mb: 70 },
  { id: "fr_FR-gilles-low", name: "Gilles", genre: "Homme", detail: "voix posée", parts: 3, mb: 63 },
  { id: "fr_FR-mls_1840-low", name: "Mathis", genre: "Homme", detail: "voix dynamique", parts: 3, mb: 63 },
];
export const SAMPLE_TEXT = "Salut ! Voici la voix que tu as choisie pour ta prochaine vidéo.";

const CACHE = "bachir-voix-v1";
const sessions = new Map();
const configs = new Map();
let phonemizerPromise = null;
let pending = null;

async function cachedFetch(url) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { /* cache indisponible : téléchargement simple */ }
  const hit = cache && (await cache.match(url));
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`téléchargement impossible (${res.status})`);
  if (cache) { try { await cache.put(url, res.clone()); } catch (e) { /* quota plein : on continue sans cache */ } }
  return res;
}

function phonemizer() {
  phonemizerPromise ??= createPiperPhonemize({
    print: (line) => {
      if (!pending) return;
      const done = pending;
      pending = null;
      try { done.resolve(JSON.parse(line)); } catch (e) { done.reject(e); }
    },
    printErr: () => {},
    locateFile: (file) => "/vendor/piper/" + file,
  });
  return phonemizerPromise;
}

// Identifiants calculés avec la table de la voix (comme Piper) : un phonème absent de la table est ignoré,
// ce qui reproduit les conditions d'entraînement des voix françaises publiées.
async function phonemeIds(text, cfg) {
  const mod = await phonemizer();
  const map = cfg.phoneme_id_map;
  const toIds = (phonemes) => {
    const ids = [...map["^"], ...map["_"]];
    for (const ph of phonemes) if (map[ph]) ids.push(...map[ph], ...map["_"]);
    ids.push(...map["$"]);
    return ids;
  };
  return new Promise((resolve, reject) => {
    pending = { resolve: (d) => resolve(toIds(d.phonemes || [])), reject };
    mod.callMain(["-l", cfg.espeak.voice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]);
    if (pending) { pending = null; reject(new Error("phonémisation sans résultat")); }
  });
}

/** Indique si la voix est déjà téléchargée sur cet ordinateur. */
export async function isCached(voiceId) {
  try {
    const cache = await caches.open(CACHE);
    const v = VOICES.find((x) => x.id === voiceId);
    for (let i = 0; i < v.parts; i++) if (!(await cache.match(`/voices/${voiceId}/model.part${i}`))) return false;
    return true;
  } catch (e) { return false; }
}

/** Charge une voix (téléchargée une seule fois, puis gardée en cache). onProgress(0..1). */
export async function loadVoice(voiceId, onProgress = () => {}) {
  if (sessions.has(voiceId)) return;
  const v = VOICES.find((x) => x.id === voiceId);
  if (!v) throw new Error("voix inconnue");
  const config = await (await cachedFetch(`/voices/${voiceId}/config.json`)).json();
  const blobs = [];
  for (let i = 0; i < v.parts; i++) {
    blobs.push(await (await cachedFetch(`/voices/${voiceId}/model.part${i}`)).blob());
    onProgress((i + 1) / v.parts);
  }
  const model = new Uint8Array(await new Blob(blobs).arrayBuffer());
  await phonemizer();
  sessions.set(voiceId, await ort.InferenceSession.create(model, { executionProviders: ["wasm"] }));
  configs.set(voiceId, config);
}

/** Lit un texte. speed : 1 = normal, 1.2 = plus rapide. Renvoie { pcm: Float32Array, sampleRate }. */
export async function speak(text, voiceId, speed = 1) {
  await loadVoice(voiceId);
  const session = sessions.get(voiceId), cfg = configs.get(voiceId);
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return { pcm: new Float32Array(0), sampleRate: cfg.audio.sample_rate };
  const ids = await phonemeIds(clean, cfg);
  const inf = cfg.inference || {};
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([inf.noise_scale ?? 0.667, (inf.length_scale ?? 1) / speed, inf.noise_w ?? 0.8]), [3]),
  };
  if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
  const out = await session.run(feeds);
  return { pcm: new Float32Array(out.output.data), sampleRate: cfg.audio.sample_rate };
}

/** Assemble des morceaux de PCM (avec silences) en un fichier WAV 16 bits mono. */
export function toWav(chunks, sampleRate) {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const buf = new ArrayBuffer(44 + total * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + total * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, total * 2, true);
  let o = 44;
  for (const c of chunks) {
    for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}
