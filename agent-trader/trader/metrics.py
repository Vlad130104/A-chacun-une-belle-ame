"""Mesures de performance d'un backtest, et leur comparaison au « buy & hold »."""

from __future__ import annotations

import math
from dataclasses import dataclass

from .broker import Trade
from .data import Candle


@dataclass
class Report:
    start_equity: float
    end_equity: float
    total_return: float
    annual_return: float
    max_drawdown: float
    sharpe: float
    n_trades: int
    win_rate: float
    profit_factor: float
    avg_trade: float
    exposure: float
    buy_hold_return: float
    halted_on: str | None

    def to_text(self) -> str:
        pf = "∞" if math.isinf(self.profit_factor) else f"{self.profit_factor:.2f}"
        verdict = (
            "La stratégie a fait MIEUX que garder simplement l'actif."
            if self.total_return > self.buy_hold_return
            else "La stratégie a fait MOINS BIEN que garder simplement l'actif."
        )
        lines = [
            "=" * 56,
            "RÉSULTATS DU BACKTEST (simulation, pas d'argent réel)",
            "=" * 56,
            f"Capital initial          : {self.start_equity:,.2f}",
            f"Capital final            : {self.end_equity:,.2f}",
            f"Rendement total          : {self.total_return:+.2%}",
            f"Rendement annualisé      : {self.annual_return:+.2%}",
            f"Buy & hold (référence)   : {self.buy_hold_return:+.2%}",
            f"Perte max (drawdown)     : {self.max_drawdown:.2%}",
            f"Ratio de Sharpe          : {self.sharpe:.2f}",
            f"Nombre de trades         : {self.n_trades}",
            f"Trades gagnants          : {self.win_rate:.1%}",
            f"Profit factor            : {pf}",
            f"Gain moyen par trade     : {self.avg_trade:+,.2f}",
            f"Temps investi            : {self.exposure:.1%}",
        ]
        if self.halted_on:
            lines.append(f"COUPE-CIRCUIT déclenché le {self.halted_on}")
        lines += ["-" * 56, verdict]
        if self.n_trades < 30:
            lines.append(f"Attention : {self.n_trades} trades, c'est trop peu pour conclure quoi que ce soit.")
        return "\n".join(lines)


def compute(
    equity_curve: list[tuple[str, float]],
    trades: list[Trade],
    candles: list[Candle],
    start_equity: float,
    halted_on: str | None = None,
    periods_per_year: int = 252,
) -> Report:
    values = [start_equity] + [v for _, v in equity_curve]
    end = values[-1]
    total = end / start_equity - 1
    years = max(len(equity_curve) / periods_per_year, 1e-9)
    annual = (end / start_equity) ** (1 / years) - 1 if end > 0 else -1.0

    peak, mdd = values[0], 0.0
    for v in values:
        peak = max(peak, v)
        mdd = max(mdd, 1 - v / peak)

    rets = [b / a - 1 for a, b in zip(values, values[1:]) if a > 0]
    sharpe = 0.0
    if len(rets) > 1:
        mean = sum(rets) / len(rets)
        std = (sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)) ** 0.5
        sharpe = mean / std * math.sqrt(periods_per_year) if std > 0 else 0.0

    wins = [t.pnl for t in trades if t.pnl > 0]
    losses = [-t.pnl for t in trades if t.pnl <= 0]
    pf = (sum(wins) / sum(losses)) if sum(losses) > 0 else (math.inf if wins else 0.0)

    first_date = equity_curve[0][0] if equity_curve else candles[0].date
    in_period = [c for c in candles if c.date >= first_date]
    bh_start = next((candles[i - 1].close for i, c in enumerate(candles) if c.date == first_date and i > 0), in_period[0].close)
    buy_hold = candles[-1].close / bh_start - 1

    days_in = 0
    for t in trades:
        days_in += sum(1 for d, _ in equity_curve if t.entry_date <= d < t.exit_date)
    exposure = days_in / len(equity_curve) if equity_curve else 0.0

    return Report(
        start_equity=start_equity,
        end_equity=end,
        total_return=total,
        annual_return=annual,
        max_drawdown=mdd,
        sharpe=sharpe,
        n_trades=len(trades),
        win_rate=len(wins) / len(trades) if trades else 0.0,
        profit_factor=pf,
        avg_trade=sum(t.pnl for t in trades) / len(trades) if trades else 0.0,
        exposure=exposure,
        buy_hold_return=buy_hold,
        halted_on=halted_on,
    )
