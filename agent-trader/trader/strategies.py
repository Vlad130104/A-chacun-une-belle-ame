"""Stratégies : transforment des bougies en signal ACHAT / VENTE / ATTENTE.

Règle d'or : à l'indice i, une stratégie ne regarde que les bougies 0..i.
Lire la bougie i+1 serait « voir le futur » (biais d'anticipation) et
rendrait tout backtest faussement brillant.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .data import Candle
from .indicators import atr, ema, macd, rsi, sma


class Action(str, Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


@dataclass
class Signal:
    action: Action
    confidence: float  # 0..1
    reasons: list[str] = field(default_factory=list)
    atr: float | None = None


class Strategy:
    name = "base"
    warmup = 1

    def prepare(self, candles: list[Candle]) -> None:
        """Pré-calcule les indicateurs (chaque valeur i ne dépend que de 0..i)."""
        self.closes = [c.close for c in candles]
        self.atr = atr([c.high for c in candles], [c.low for c in candles], self.closes, 14)

    def signal(self, i: int) -> Signal:  # pragma: no cover - interface
        raise NotImplementedError


class MovingAverageCross(Strategy):
    """Suivi de tendance : achat quand la moyenne courte croise au-dessus de la longue."""

    name = "ma_cross"

    def __init__(self, fast: int = 20, slow: int = 50):
        if fast >= slow:
            raise ValueError("fast doit être < slow")
        self.fast, self.slow = fast, slow
        self.warmup = slow + 1

    def prepare(self, candles: list[Candle]) -> None:
        super().prepare(candles)
        self.f, self.s = sma(self.closes, self.fast), sma(self.closes, self.slow)

    def signal(self, i: int) -> Signal:
        f0, s0, f1, s1 = self.f[i - 1], self.s[i - 1], self.f[i], self.s[i]
        if None in (f0, s0, f1, s1):
            return Signal(Action.HOLD, 0.0, ["Pas assez d'historique"])
        gap = abs(f1 - s1) / s1
        conf = min(1.0, 0.5 + gap * 20)
        if f0 <= s0 and f1 > s1:
            return Signal(Action.BUY, conf, [f"SMA{self.fast} croise au-dessus de SMA{self.slow}"], self.atr[i])
        if f0 >= s0 and f1 < s1:
            return Signal(Action.SELL, conf, [f"SMA{self.fast} croise sous SMA{self.slow}"], self.atr[i])
        return Signal(Action.HOLD, 0.0, ["Pas de croisement"], self.atr[i])


class RsiMeanReversion(Strategy):
    """Retour à la moyenne : achat en survente, vente en surachat."""

    name = "rsi"

    def __init__(self, period: int = 14, low: float = 30, high: float = 70):
        self.period, self.low, self.high = period, low, high
        self.warmup = period + 2

    def prepare(self, candles: list[Candle]) -> None:
        super().prepare(candles)
        self.r = rsi(self.closes, self.period)

    def signal(self, i: int) -> Signal:
        r0, r1 = self.r[i - 1], self.r[i]
        if r0 is None or r1 is None:
            return Signal(Action.HOLD, 0.0, ["Pas assez d'historique"])
        if r0 < self.low <= r1:
            return Signal(Action.BUY, min(1.0, 0.5 + (self.low - r0) / 30), [f"RSI sort de la survente ({r1:.1f})"], self.atr[i])
        if r0 > self.high >= r1:
            return Signal(Action.SELL, min(1.0, 0.5 + (r0 - self.high) / 30), [f"RSI sort du surachat ({r1:.1f})"], self.atr[i])
        return Signal(Action.HOLD, 0.0, [f"RSI neutre ({r1:.1f})"], self.atr[i])


class Combined(Strategy):
    """Vote : tendance (EMA50/200) + momentum (MACD) + filtre RSI.

    Achat seulement si la tendance de fond est haussière, que le MACD
    croise vers le haut et que le RSI n'est pas déjà en surachat.
    """

    name = "combined"
    warmup = 201

    def prepare(self, candles: list[Candle]) -> None:
        super().prepare(candles)
        self.e50, self.e200 = ema(self.closes, 50), ema(self.closes, 200)
        self.m, self.ms, _ = macd(self.closes)
        self.r = rsi(self.closes, 14)

    def signal(self, i: int) -> Signal:
        vals = (self.e50[i], self.e200[i], self.m[i - 1], self.ms[i - 1], self.m[i], self.ms[i], self.r[i])
        if any(v is None for v in vals):
            return Signal(Action.HOLD, 0.0, ["Pas assez d'historique"])
        e50, e200, m0, s0, m1, s1, r = vals
        uptrend = e50 > e200
        cross_up, cross_down = m0 <= s0 and m1 > s1, m0 >= s0 and m1 < s1
        reasons = [
            f"Tendance {'haussière' if uptrend else 'baissière'} (EMA50 {'>' if uptrend else '<'} EMA200)",
            f"RSI {r:.1f}",
        ]
        if uptrend and cross_up and r < 70:
            return Signal(Action.BUY, 0.7 if r < 60 else 0.55, reasons + ["MACD croise au-dessus du signal"], self.atr[i])
        if cross_down or (not uptrend and m1 < s1) or r > 80:
            return Signal(Action.SELL, 0.6, reasons + ["Momentum ou tendance qui se retourne"], self.atr[i])
        return Signal(Action.HOLD, 0.0, reasons, self.atr[i])


STRATEGIES = {cls.name: cls for cls in (MovingAverageCross, RsiMeanReversion, Combined)}


def build(name: str) -> Strategy:
    try:
        return STRATEGIES[name]()
    except KeyError:
        raise ValueError(f"Stratégie inconnue « {name} ». Choix : {', '.join(STRATEGIES)}") from None
