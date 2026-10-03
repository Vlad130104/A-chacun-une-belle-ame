"""Ligne de commande de l'agent trader.

Exemples :
    python -m trader generate --out data/demo.csv
    python -m trader backtest --synthetic --strategy combined
    python -m trader backtest --csv data/demo.csv --strategy ma_cross
    python -m trader compare --synthetic
    python -m trader simulate --csv data/demo.csv --ai --last 120
"""

from __future__ import annotations

import argparse
import sys

from . import data
from .agent import TradingAgent
from .broker import PaperBroker
from .metrics import compute
from .risk import RiskConfig, RiskManager
from .strategies import STRATEGIES, build


def _load(args) -> list[data.Candle]:
    if args.csv:
        return data.load_csv(args.csv)
    return data.synthetic(n=args.bars, seed=args.seed)


def _run(args, strategy_name: str, candles, analyst=None, verbose=False, journal=None):
    broker = PaperBroker(cash=args.capital, fee_rate=args.fees, slippage=args.slippage)
    risk = RiskManager(RiskConfig(risk_per_trade=args.risk, max_drawdown=args.max_dd))
    agent = TradingAgent(build(strategy_name), broker, risk, analyst=analyst, symbol=args.symbol,
                         journal_path=journal, verbose=verbose)
    result = agent.run(candles)
    return compute(result.equity_curve, broker.trades, candles, args.capital, result.halted_on)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="trader", description="Agent trader IA pédagogique (simulation uniquement).")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        src = sp.add_mutually_exclusive_group()
        src.add_argument("--csv", help="Fichier OHLCV (date,open,high,low,close,volume)")
        src.add_argument("--synthetic", action="store_true", help="Données synthétiques (défaut)")
        sp.add_argument("--bars", type=int, default=750, help="Nombre de bougies synthétiques")
        sp.add_argument("--seed", type=int, default=42)
        sp.add_argument("--symbol", default="ACTIF")
        sp.add_argument("--capital", type=float, default=10_000)
        sp.add_argument("--fees", type=float, default=0.001, help="Frais par ordre (0.001 = 0,1 %%)")
        sp.add_argument("--slippage", type=float, default=0.0005)
        sp.add_argument("--risk", type=float, default=0.01, help="Part du capital risquée par trade")
        sp.add_argument("--max-dd", type=float, default=0.20, help="Drawdown déclenchant le coupe-circuit")

    g = sub.add_parser("generate", help="Créer un CSV de données synthétiques")
    g.add_argument("--out", required=True)
    g.add_argument("--bars", type=int, default=750)
    g.add_argument("--seed", type=int, default=42)

    b = sub.add_parser("backtest", help="Tester une stratégie sur l'historique")
    common(b)
    b.add_argument("--strategy", default="combined", choices=list(STRATEGIES))
    b.add_argument("--journal", default="journal/backtest.jsonl")
    b.add_argument("--verbose", action="store_true")

    c = sub.add_parser("compare", help="Comparer toutes les stratégies")
    common(c)

    s = sub.add_parser("simulate", help="Rejouer les dernières bougies, avec l'analyste IA en option")
    common(s)
    s.add_argument("--strategy", default="combined", choices=list(STRATEGIES))
    s.add_argument("--ai", action="store_true", help="Activer l'analyste Claude (nécessite une clé API, payant)")
    s.add_argument("--last", type=int, default=0, help="Ne garder que les N dernières bougies après le préchauffage")
    s.add_argument("--journal", default="journal/simulation.jsonl")

    args = p.parse_args(argv)

    if args.cmd == "generate":
        data.save_csv(data.synthetic(n=args.bars, seed=args.seed), args.out)
        print(f"{args.bars} bougies écrites dans {args.out}")
        return 0

    candles = _load(args)

    if args.cmd == "backtest":
        report = _run(args, args.strategy, candles, verbose=args.verbose, journal=args.journal)
        print(f"Stratégie : {args.strategy} — {len(candles)} bougies ({candles[0].date} → {candles[-1].date})")
        print(report.to_text())
        print(f"Journal détaillé : {args.journal}")
        return 0

    if args.cmd == "compare":
        print(f"{'stratégie':<10} {'rendement':>10} {'buy&hold':>10} {'drawdown':>9} {'sharpe':>7} {'trades':>7} {'gagnants':>9}")
        for name in STRATEGIES:
            r = _run(args, name, candles)
            print(f"{name:<10} {r.total_return:>+10.2%} {r.buy_hold_return:>+10.2%} {r.max_drawdown:>9.2%} "
                  f"{r.sharpe:>7.2f} {r.n_trades:>7} {r.win_rate:>9.1%}")
        return 0

    if args.cmd == "simulate":
        analyst = None
        if args.ai:
            try:
                from .llm import ClaudeAnalyst
                analyst = ClaudeAnalyst()
            except ImportError:
                print("Le paquet `anthropic` n'est pas installé : pip install anthropic", file=sys.stderr)
                return 1
        if args.last:
            warmup = build(args.strategy).warmup
            candles = candles[-(args.last + warmup + 1):]
        report = _run(args, args.strategy, candles, analyst=analyst, verbose=True, journal=args.journal)
        print(report.to_text())
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
