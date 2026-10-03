"""Analyste IA (Claude) : second avis sur les signaux de la stratégie.

Choix de conception volontairement prudent :
- l'IA ne peut que CONFIRMER, RÉDUIRE ou REFUSER un signal ; elle ne peut
  jamais créer un trade ni augmenter la taille décidée par le risk manager ;
- la réponse est contrainte par un schéma JSON (sorties structurées) ;
- en cas d'erreur, de refus ou de réponse invalide, on n'achète pas
  (une panne de l'IA ne doit jamais provoquer de trade).

Le module `anthropic` n'est importé que si l'analyste est utilisé.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .data import Candle
from .strategies import Signal

MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """Tu es l'analyste de risque d'un agent de trading pédagogique qui fonctionne en simulation.
Une stratégie technique te propose un signal. Ton rôle est de jouer l'avocat du diable :
cherche les raisons de NE PAS prendre le trade (volatilité anormale, signal contre la tendance,
mouvement déjà très étendu, volume faible, configuration ambiguë).

Tu ne vois que les données fournies. Ne prétends pas connaître l'avenir ni des actualités
que tu n'as pas. Si les données ne suffisent pas pour juger, reste neutre (approve avec
size_factor modéré) plutôt que d'inventer.

Décisions possibles :
- "approve" : le signal est cohérent ; size_factor entre 0.5 et 1.0 ;
- "reduce"  : signal acceptable mais douteux ; size_factor entre 0.1 et 0.5 ;
- "reject"  : ne pas exécuter ; size_factor = 0.

Explique ton raisonnement en français, en 2 à 4 phrases simples compréhensibles par un débutant."""

DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "decision": {"type": "string", "enum": ["approve", "reduce", "reject"]},
        "size_factor": {"type": "number"},
        "explanation": {"type": "string"},
    },
    "required": ["decision", "size_factor", "explanation"],
    "additionalProperties": False,
}


@dataclass
class Review:
    decision: str
    size_factor: float
    explanation: str

    @property
    def allows_trade(self) -> bool:
        return self.decision != "reject" and self.size_factor > 0


def build_context(symbol: str, candles: list[Candle], i: int, signal: Signal, lookback: int = 30) -> str:
    """Résumé des données jusqu'à l'indice i inclus (jamais au-delà)."""
    window = candles[max(0, i - lookback + 1) : i + 1]
    rows = "\n".join(f"{c.date},{c.open:.2f},{c.high:.2f},{c.low:.2f},{c.close:.2f},{c.volume:.0f}" for c in window)
    first, last = window[0].close, window[-1].close
    atr_txt = f"{signal.atr:.4f}" if signal.atr else "inconnu"
    return (
        f"Actif : {symbol}\n"
        f"Signal proposé : {signal.action.value} (confiance {signal.confidence:.2f})\n"
        f"Raisons de la stratégie : {'; '.join(signal.reasons)}\n"
        f"ATR(14) : {atr_txt}\n"
        f"Variation sur la fenêtre : {(last / first - 1):+.2%}\n\n"
        f"Dernières bougies (date,open,high,low,close,volume) :\n{rows}"
    )


class ClaudeAnalyst:
    def __init__(self, model: str = MODEL, effort: str = "low"):
        import anthropic  # import paresseux : dépendance optionnelle

        self._anthropic = anthropic
        self.client = anthropic.Anthropic()  # lit ANTHROPIC_API_KEY ou un profil `ant auth login`
        self.model = model
        self.effort = effort

    def review(self, context: str) -> Review:
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=2000,
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=SYSTEM_PROMPT,
                output_config={
                    "effort": self.effort,
                    "format": {"type": "json_schema", "schema": DECISION_SCHEMA},
                },
                messages=[{"role": "user", "content": context}],
            )
        except self._anthropic.APIError as e:
            return Review("reject", 0.0, f"Analyste indisponible ({type(e).__name__}) : par prudence, pas de trade.")

        if response.stop_reason in ("refusal", "max_tokens"):
            return Review("reject", 0.0, f"Réponse inutilisable ({response.stop_reason}) : pas de trade.")
        text = next((b.text for b in response.content if b.type == "text"), "")
        return parse_review(text)


def parse_review(text: str) -> Review:
    try:
        data = json.loads(text)
        decision = data["decision"]
        if decision not in ("approve", "reduce", "reject"):
            raise ValueError(decision)
        factor = max(0.0, min(1.0, float(data["size_factor"])))
        if decision == "reject":
            factor = 0.0
        return Review(decision, factor, str(data["explanation"]))
    except (ValueError, KeyError, TypeError):
        return Review("reject", 0.0, "Réponse de l'analyste illisible : pas de trade.")
