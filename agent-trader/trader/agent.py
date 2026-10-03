"""L'agent : la boucle Percevoir → Analyser → Décider → Agir → Mémoriser.

À chaque bougie i :
1. PERCEVOIR  — l'agent ne connaît que les bougies 0..i ;
2. ANALYSER   — la stratégie calcule un signal ;
3. DÉCIDER    — (option) l'analyste IA confirme/réduit/refuse, puis le
                 risk manager calcule la taille et les stops ;
4. AGIR       — l'ordre est exécuté à l'OUVERTURE de la bougie i+1
                 (on ne peut pas trader au prix de clôture qu'on vient de lire) ;
5. MÉMORISER  — chaque décision est écrite dans un journal JSONL.

La même boucle sert au backtest et à la simulation « en direct ».
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Protocol

from .broker import PaperBroker
from .data import Candle
from .llm import Review, build_context
from .risk import RiskManager
from .strategies import Action, Strategy


class Analyst(Protocol):
    def review(self, context: str) -> Review: ...


@dataclass
class RunResult:
    equity_curve: list[tuple[str, float]] = field(default_factory=list)
    decisions: list[dict] = field(default_factory=list)
    halted_on: str | None = None


class TradingAgent:
    def __init__(
        self,
        strategy: Strategy,
        broker: PaperBroker,
        risk: RiskManager,
        analyst: Analyst | None = None,
        symbol: str = "ACTIF",
        journal_path: str | Path | None = None,
        verbose: bool = False,
    ):
        self.strategy, self.broker, self.risk, self.analyst = strategy, broker, risk, analyst
        self.symbol, self.verbose = symbol, verbose
        self.journal_path = Path(journal_path) if journal_path else None
        if self.journal_path:
            self.journal_path.parent.mkdir(parents=True, exist_ok=True)
            self.journal_path.write_text("", encoding="utf-8")

    def _log(self, entry: dict, result: RunResult) -> None:
        result.decisions.append(entry)
        if self.journal_path:
            with self.journal_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        if self.verbose:
            print(f"[{entry['date']}] {entry['event']}: {entry.get('detail', '')}")

    def run(self, candles: list[Candle]) -> RunResult:
        self.strategy.prepare(candles)
        result = RunResult()
        start = max(self.strategy.warmup, 1)
        if start >= len(candles) - 1:
            raise ValueError(f"Pas assez de données : la stratégie demande {start + 2} bougies minimum.")

        self.risk.update(self.broker.equity(candles[start].close))
        for i in range(start, len(candles) - 1):
            today, nxt = candles[i], candles[i + 1]

            # 1-2. Percevoir et analyser (données 0..i uniquement)
            sig = self.strategy.signal(i)
            pending: tuple[str, float] | None = None  # ("BUY", facteur) ou ("SELL", 0)

            # 3. Décider
            if sig.action == Action.BUY and self.broker.position is None and not self.risk.halted:
                factor = 1.0
                if self.analyst is not None:
                    review = self.analyst.review(build_context(self.symbol, candles, i, sig))
                    self._log({"date": today.date, "event": "ANALYSE_IA", "decision": review.decision,
                               "size_factor": review.size_factor, "detail": review.explanation}, result)
                    factor = review.size_factor if review.allows_trade else 0.0
                if factor > 0:
                    pending = ("BUY", factor)
            elif sig.action == Action.SELL and self.broker.position is not None:
                # Les sorties ne passent pas par l'IA : on ne bloque jamais une réduction du risque.
                pending = ("SELL", 0.0)

            # 4. Agir à l'ouverture de la bougie suivante
            if pending and pending[0] == "BUY":
                equity = self.broker.equity(nxt.open)
                plan = self.risk.plan_entry(equity, self.broker.cash, nxt.open, sig.atr, sig.confidence)
                if plan is None:
                    self._log({"date": nxt.date, "event": "REFUS_RISQUE", "detail": "; ".join(sig.reasons)}, result)
                else:
                    qty = plan.quantity * pending[1]
                    if self.broker.buy(nxt.open, qty, plan.stop_loss, plan.take_profit, nxt.date):
                        pos = self.broker.position
                        self._log({"date": nxt.date, "event": "ACHAT", "price": round(pos.entry_price, 4),
                                   "quantity": round(pos.quantity, 6), "stop_loss": round(plan.stop_loss, 4),
                                   "take_profit": round(plan.take_profit, 4),
                                   "detail": "; ".join(sig.reasons) + f" — {plan.reason}"}, result)
            elif pending and pending[0] == "SELL":
                trade = self.broker.sell(nxt.open, nxt.date, "signal de vente")
                if trade:
                    self._log({"date": nxt.date, "event": "VENTE", **_trade_dict(trade),
                               "detail": "; ".join(sig.reasons)}, result)

            # Stops pendant la bougie suivante
            trade = self.broker.check_exits(nxt.open, nxt.high, nxt.low, nxt.date)
            if trade:
                self._log({"date": nxt.date, "event": "SORTIE", **_trade_dict(trade), "detail": trade.exit_reason}, result)

            # 5. Mémoriser la valeur du portefeuille et surveiller le coupe-circuit
            equity = self.broker.equity(nxt.close)
            result.equity_curve.append((nxt.date, equity))
            was_halted = self.risk.halted
            self.risk.update(equity)
            if self.risk.halted and not was_halted:
                result.halted_on = nxt.date
                self._log({"date": nxt.date, "event": "COUPE_CIRCUIT",
                           "detail": f"drawdown {self.risk.drawdown(equity):.1%} ≥ {self.risk.cfg.max_drawdown:.0%} : arrêt du trading"}, result)
                trade = self.broker.sell(nxt.close, nxt.date, "coupe-circuit")
                if trade:
                    result.equity_curve[-1] = (nxt.date, self.broker.equity(nxt.close))

        # Clôture finale pour que les statistiques comptent la position ouverte.
        if self.broker.position is not None:
            last = candles[-1]
            trade = self.broker.sell(last.close, last.date, "fin de période")
            if trade:
                self._log({"date": last.date, "event": "VENTE", **_trade_dict(trade), "detail": "fin de période"}, result)
                result.equity_curve[-1] = (last.date, self.broker.equity(last.close))
        return result


def _trade_dict(trade) -> dict:
    d = asdict(trade)
    d["pnl"] = round(d["pnl"], 2)
    d["return_pct"] = round(trade.return_pct * 100, 2)
    return d
