"""Chargement des données de marché (bougies OHLCV).

Deux sources, toutes deux sans dépendance externe :
- un fichier CSV (colonnes date,open,high,low,close,volume) ;
- un générateur synthétique (marche aléatoire), utile pour apprendre et tester.
"""

from __future__ import annotations

import csv
import math
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


@dataclass(frozen=True)
class Candle:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


REQUIRED_COLUMNS = ("date", "open", "high", "low", "close", "volume")


def load_csv(path: str | Path) -> list[Candle]:
    """Lit un CSV OHLCV trié par date croissante."""
    candles: list[Candle] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        headers = {h.strip().lower() for h in (reader.fieldnames or [])}
        missing = [c for c in REQUIRED_COLUMNS if c not in headers]
        if missing:
            raise ValueError(f"Colonnes manquantes dans {path}: {missing}")
        for row in reader:
            row = {k.strip().lower(): v for k, v in row.items()}
            candles.append(
                Candle(
                    date=row["date"],
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row["volume"]),
                )
            )
    if len(candles) < 2:
        raise ValueError("Il faut au moins 2 bougies.")
    for a, b in zip(candles, candles[1:]):
        if b.date < a.date:
            raise ValueError("Le CSV doit être trié par date croissante.")
    return candles


def save_csv(candles: list[Candle], path: str | Path) -> None:
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(REQUIRED_COLUMNS)
        for c in candles:
            w.writerow([c.date, f"{c.open:.4f}", f"{c.high:.4f}", f"{c.low:.4f}", f"{c.close:.4f}", f"{c.volume:.0f}"])


def synthetic(
    n: int = 500,
    start_price: float = 100.0,
    drift: float = 0.0003,
    volatility: float = 0.015,
    seed: int | None = 42,
) -> list[Candle]:
    """Génère n bougies journalières par mouvement brownien géométrique.

    Attention : un marché synthétique n'a ni tendance réelle ni information.
    Une stratégie « gagnante » ici ne prouve rien sur un vrai marché.
    """
    rng = random.Random(seed)
    candles: list[Candle] = []
    price = start_price
    day = date(2024, 1, 1)
    for _ in range(n):
        ret = drift - 0.5 * volatility**2 + volatility * rng.gauss(0, 1)
        open_ = price
        close = price * math.exp(ret)
        spread = abs(rng.gauss(0, volatility / 2)) * price
        high = max(open_, close) + spread
        low = max(0.01, min(open_, close) - spread)
        volume = rng.randint(50_000, 500_000)
        candles.append(Candle(day.isoformat(), open_, high, low, close, volume))
        price = close
        day += timedelta(days=1)
    return candles
