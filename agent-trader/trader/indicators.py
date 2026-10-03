"""Indicateurs techniques, écrits à la main pour être lus et compris.

Chaque fonction renvoie une liste de même longueur que l'entrée ; les
premières valeurs, qui ne peuvent pas encore être calculées, valent None.
"""

from __future__ import annotations

from typing import Optional, Sequence

Series = list[Optional[float]]


def sma(values: Sequence[float], period: int) -> Series:
    """Moyenne mobile simple : moyenne des `period` dernières valeurs."""
    if period <= 0:
        raise ValueError("period doit être > 0")
    out: Series = [None] * len(values)
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= period:
            total -= values[i - period]
        if i >= period - 1:
            out[i] = total / period
    return out


def ema(values: Sequence[float], period: int) -> Series:
    """Moyenne mobile exponentielle : réagit plus vite que la SMA."""
    if period <= 0:
        raise ValueError("period doit être > 0")
    out: Series = [None] * len(values)
    if len(values) < period:
        return out
    k = 2 / (period + 1)
    prev = sum(values[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def rsi(values: Sequence[float], period: int = 14) -> Series:
    """RSI de Wilder (0 à 100). >70 : suracheté, <30 : survendu."""
    out: Series = [None] * len(values)
    if len(values) <= period:
        return out
    gains = losses = 0.0
    for i in range(1, period + 1):
        diff = values[i] - values[i - 1]
        gains += max(diff, 0)
        losses += max(-diff, 0)
    avg_gain, avg_loss = gains / period, losses / period

    def _rsi(g: float, l: float) -> float:
        if l == 0:
            return 100.0 if g > 0 else 50.0
        return 100 - 100 / (1 + g / l)

    out[period] = _rsi(avg_gain, avg_loss)
    for i in range(period + 1, len(values)):
        diff = values[i] - values[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(diff, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-diff, 0)) / period
        out[i] = _rsi(avg_gain, avg_loss)
    return out


def macd(values: Sequence[float], fast: int = 12, slow: int = 26, signal: int = 9) -> tuple[Series, Series, Series]:
    """MACD = EMA rapide − EMA lente ; signal = EMA du MACD ; histogramme = écart."""
    ef, es = ema(values, fast), ema(values, slow)
    line: Series = [f - s if f is not None and s is not None else None for f, s in zip(ef, es)]
    start = next((i for i, v in enumerate(line) if v is not None), len(line))
    sig_part = ema([v for v in line[start:] if v is not None], signal) if start < len(line) else []
    sig: Series = [None] * start + list(sig_part)
    hist: Series = [m - s if m is not None and s is not None else None for m, s in zip(line, sig)]
    return line, sig, hist


def atr(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], period: int = 14) -> Series:
    """Average True Range : amplitude moyenne d'une bougie (mesure de volatilité)."""
    trs: list[float] = []
    for i in range(len(closes)):
        if i == 0:
            trs.append(highs[0] - lows[0])
        else:
            trs.append(max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1])))
    out: Series = [None] * len(closes)
    if len(trs) < period:
        return out
    prev = sum(trs[:period]) / period
    out[period - 1] = prev
    for i in range(period, len(trs)):
        prev = (prev * (period - 1) + trs[i]) / period
        out[i] = prev
    return out


def bollinger(values: Sequence[float], period: int = 20, k: float = 2.0) -> tuple[Series, Series, Series]:
    """Bandes de Bollinger : moyenne ± k écarts-types."""
    mid = sma(values, period)
    upper: Series = [None] * len(values)
    lower: Series = [None] * len(values)
    for i in range(period - 1, len(values)):
        window = values[i - period + 1 : i + 1]
        m = mid[i]
        assert m is not None
        std = (sum((x - m) ** 2 for x in window) / period) ** 0.5
        upper[i], lower[i] = m + k * std, m - k * std
    return upper, mid, lower
