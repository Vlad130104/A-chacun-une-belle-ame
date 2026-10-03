"""Gestion du risque : la partie qui décide de la survie du compte.

Une bonne stratégie avec une mauvaise gestion du risque finit à zéro.
Une stratégie moyenne avec une bonne gestion du risque survit.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RiskConfig:
    risk_per_trade: float = 0.01      # on accepte de perdre 1 % du capital si le stop est touché
    max_position_pct: float = 0.25    # une position ne dépasse jamais 25 % du capital
    atr_stop_mult: float = 2.0        # stop-loss placé à 2 ATR sous le prix d'entrée
    reward_risk: float = 2.0          # objectif de gain = 2 × la distance du stop
    max_drawdown: float = 0.20        # coupe-circuit : arrêt total à −20 % depuis le plus haut
    min_confidence: float = 0.5       # on ignore les signaux trop faibles


@dataclass
class OrderPlan:
    quantity: float
    stop_loss: float
    take_profit: float
    reason: str


class RiskManager:
    def __init__(self, config: RiskConfig | None = None):
        self.cfg = config or RiskConfig()
        self.peak_equity = 0.0
        self.halted = False

    def update(self, equity: float) -> None:
        """Met à jour le plus haut historique et déclenche le coupe-circuit si besoin."""
        self.peak_equity = max(self.peak_equity, equity)
        if self.peak_equity > 0 and self.drawdown(equity) >= self.cfg.max_drawdown:
            self.halted = True

    def drawdown(self, equity: float) -> float:
        return 0.0 if self.peak_equity <= 0 else 1 - equity / self.peak_equity

    def plan_entry(self, equity: float, cash: float, price: float, atr: float | None, confidence: float) -> OrderPlan | None:
        """Calcule la taille de position. Renvoie None si le trade est refusé."""
        if self.halted:
            return None
        if confidence < self.cfg.min_confidence:
            return None
        if atr is None or atr <= 0 or price <= 0:
            return None
        stop_distance = self.cfg.atr_stop_mult * atr
        if stop_distance >= price:
            return None
        # Taille = montant risqué / distance au stop.
        qty = (equity * self.cfg.risk_per_trade) / stop_distance
        qty = min(qty, equity * self.cfg.max_position_pct / price, cash / price)
        if qty * price < 1:  # position ridicule
            return None
        return OrderPlan(
            quantity=qty,
            stop_loss=price - stop_distance,
            take_profit=price + stop_distance * self.cfg.reward_risk,
            reason=f"risque {self.cfg.risk_per_trade:.1%} du capital, stop à {self.cfg.atr_stop_mult} ATR",
        )
