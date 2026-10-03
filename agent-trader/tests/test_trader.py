import json
import math
import tempfile
import unittest
from pathlib import Path

from trader import data
from trader.agent import TradingAgent
from trader.broker import PaperBroker
from trader.data import Candle
from trader.indicators import ema, rsi, sma
from trader.llm import Review, parse_review
from trader.metrics import compute
from trader.risk import RiskConfig, RiskManager
from trader.strategies import Action, MovingAverageCross, Signal, Strategy, build


class IndicatorsTest(unittest.TestCase):
    def test_sma(self):
        self.assertEqual(sma([1, 2, 3, 4, 5], 3), [None, None, 2.0, 3.0, 4.0])

    def test_ema_starts_with_sma(self):
        out = ema([1, 2, 3, 4], 3)
        self.assertEqual(out[:3], [None, None, 2.0])
        self.assertAlmostEqual(out[3], 3.0)

    def test_rsi_bounds(self):
        up = rsi([float(i) for i in range(30)], 14)
        self.assertEqual(up[-1], 100.0)
        mixed = rsi(data_closes(), 14)
        self.assertTrue(all(0 <= v <= 100 for v in mixed if v is not None))


def data_closes():
    return [c.close for c in data.synthetic(200, seed=1)]


class NoLookAheadTest(unittest.TestCase):
    def test_signal_ignores_future(self):
        """Modifier les bougies après i ne doit pas changer le signal à i."""
        candles = data.synthetic(300, seed=3)
        s1 = MovingAverageCross(); s1.prepare(candles)
        altered = candles[:150] + [Candle(c.date, 1, 1, 1, 1, 1) for c in candles[150:]]
        s2 = MovingAverageCross(); s2.prepare(altered)
        for i in range(s1.warmup, 150):
            self.assertEqual(s1.signal(i).action, s2.signal(i).action)


class RiskTest(unittest.TestCase):
    def test_size_respects_risk_budget(self):
        rm = RiskManager(RiskConfig(risk_per_trade=0.01, max_position_pct=1.0))
        plan = rm.plan_entry(equity=10_000, cash=10_000, price=100, atr=2, confidence=0.8)
        loss_at_stop = plan.quantity * (100 - plan.stop_loss)
        self.assertAlmostEqual(loss_at_stop, 100.0)  # 1 % de 10 000
        self.assertAlmostEqual(plan.take_profit - 100, 2 * (100 - plan.stop_loss))

    def test_position_cap(self):
        rm = RiskManager(RiskConfig(max_position_pct=0.25))
        plan = rm.plan_entry(10_000, 10_000, 100, atr=0.01, confidence=0.9)
        self.assertLessEqual(plan.quantity * 100, 2_500 + 1e-6)

    def test_rejects_weak_signal_and_halts(self):
        rm = RiskManager(RiskConfig(max_drawdown=0.2))
        self.assertIsNone(rm.plan_entry(10_000, 10_000, 100, 2, confidence=0.1))
        rm.update(10_000); rm.update(7_900)
        self.assertTrue(rm.halted)
        self.assertIsNone(rm.plan_entry(7_900, 7_900, 100, 2, 0.9))


class BrokerTest(unittest.TestCase):
    def test_round_trip_costs_money(self):
        b = PaperBroker(cash=1_000, fee_rate=0.001, slippage=0.001)
        b.buy(100, 5, 90, 120, "d1")
        t = b.sell(100, "d2", "test")
        self.assertLess(t.pnl, 0)  # prix inchangé : les frais font perdre
        self.assertLess(b.cash, 1_000)

    def test_stop_before_target_when_both_hit(self):
        b = PaperBroker(cash=1_000, fee_rate=0, slippage=0)
        b.buy(100, 1, 95, 110, "d1")
        t = b.check_exits(100, 111, 94, "d2")
        self.assertEqual(t.exit_reason, "stop-loss")
        self.assertEqual(t.exit_price, 95)

    def test_gap_down_exits_at_open(self):
        b = PaperBroker(cash=1_000, fee_rate=0, slippage=0)
        b.buy(100, 1, 95, 110, "d1")
        t = b.check_exits(90, 92, 88, "d2")
        self.assertEqual(t.exit_price, 90)


class AlwaysBuy(Strategy):
    name = "always"
    warmup = 15

    def signal(self, i):
        return Signal(Action.BUY, 0.9, ["test"], self.atr[i])


class FakeAnalyst:
    def __init__(self, review):
        self.review_obj, self.calls = review, 0

    def review(self, context):
        self.calls += 1
        return self.review_obj


class AgentTest(unittest.TestCase):
    def run_agent(self, analyst=None, strategy=None, journal=None):
        candles = data.synthetic(300, seed=7)
        broker = PaperBroker(cash=10_000)
        agent = TradingAgent(strategy or build("ma_cross"), broker, RiskManager(), analyst=analyst, journal_path=journal)
        return candles, broker, agent.run(candles)

    def test_backtest_runs_and_closes_positions(self):
        candles, broker, res = self.run_agent()
        self.assertIsNone(broker.position)
        self.assertEqual(len(res.equity_curve), len(candles) - build("ma_cross").warmup - 1)
        rep = compute(res.equity_curve, broker.trades, candles, 10_000)
        self.assertTrue(math.isfinite(rep.total_return))

    def test_ai_reject_blocks_all_entries(self):
        analyst = FakeAnalyst(Review("reject", 0.0, "non"))
        _, broker, _ = self.run_agent(analyst, AlwaysBuy())
        self.assertGreater(analyst.calls, 0)
        self.assertEqual(broker.trades, [])

    def test_ai_reduce_shrinks_size(self):
        _, full, _ = self.run_agent(FakeAnalyst(Review("approve", 1.0, "ok")), AlwaysBuy())
        _, half, _ = self.run_agent(FakeAnalyst(Review("reduce", 0.5, "bof")), AlwaysBuy())
        self.assertAlmostEqual(half.trades[0].quantity, full.trades[0].quantity * 0.5, places=6)

    def test_journal_is_jsonl(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "j.jsonl"
            self.run_agent(journal=path)
            for line in path.read_text(encoding="utf-8").splitlines():
                self.assertIn("event", json.loads(line))


class ParseReviewTest(unittest.TestCase):
    def test_valid(self):
        r = parse_review('{"decision":"reduce","size_factor":0.3,"explanation":"x"}')
        self.assertEqual((r.decision, r.size_factor), ("reduce", 0.3))

    def test_ai_cannot_increase_size(self):
        self.assertEqual(parse_review('{"decision":"approve","size_factor":5,"explanation":"x"}').size_factor, 1.0)

    def test_garbage_means_no_trade(self):
        self.assertFalse(parse_review("pas du json").allows_trade)
        self.assertFalse(parse_review('{"decision":"yolo","size_factor":1,"explanation":"x"}').allows_trade)


class CsvTest(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "x.csv"
            data.save_csv(data.synthetic(50), path)
            self.assertEqual(len(data.load_csv(path)), 50)


if __name__ == "__main__":
    unittest.main()
