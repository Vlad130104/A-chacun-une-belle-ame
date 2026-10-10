import { MINUTES_MAX, SOURCE_MAX, TONS, type Mode, type Plan, type Ton } from "./claude";

/** Valide les champs communs aux routes d'écriture de script. Renvoie null si la requête est invalide. */
export function lireRequete(body: unknown): { mode: Mode; minutes: number; ton: Ton; source: string } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const mode: Mode = b.mode === "ecrire" ? "ecrire" : "adapter";
  const minutes = Number(b.minutes);
  const ton = String(b.ton);
  const source = typeof b.source === "string" ? b.source.replace(/\r/g, "").trim() : "";
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MINUTES_MAX) return null;
  if (!Object.hasOwn(TONS, ton) || !source || source.length > (mode === "ecrire" ? 3_000 : SOURCE_MAX)) return null;
  return { mode, minutes, ton: ton as Ton, source };
}

export function lirePlan(v: unknown): Plan | null {
  const p = v as Plan;
  if (!p || typeof p.titre !== "string" || !Array.isArray(p.parties) || !p.parties.length || p.parties.length > 16) return null;
  const parties = p.parties.map((x) => ({ titre: String(x?.titre ?? "").slice(0, 70), contenu: String(x?.contenu ?? "").slice(0, 800) }));
  return { titre: p.titre.slice(0, 90), parties };
}
