"""Courtier simulé (paper trading), en position acheteuse uniquement.

Il applique des frais et un glissement (slippage) : sans eux, un backtest
surestime toujours les gains, surtout pour les stratégies qui tradent souvent.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Position:
    quantity: float
    entry_price: float
    stop_loss: float
    take_profit: float
    entry_date: str


@dataclass
class Trade:
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    quantity: float
    pnl: float
    exit_reason: str

    @property
    def return_pct(self) -> float:
        return self.exit_price / self.entry_price - 1


@dataclass
class PaperBroker:
    cash: float = 10_000.0
    fee_rate: float = 0.001      # 0,1 % par ordre (typique d'une plateforme crypto/actions en ligne)
    slippage: float = 0.0005     # 0,05 % de prix défavorable à chaque exécution
    position: Position | None = None
    trades: list[Trade] = field(default_factory=list)

    def equity(self, price: float) -> float:
        held = self.position.quantity * price if self.position else 0.0
        return self.cash + held

    def buy(self, price: float, quantity: float, stop_loss: float, take_profit: float, when: str) -> bool:
        if self.position is not None or quantity <= 0:
            return False
        fill = price * (1 + self.slippage)
        cost = fill * quantity
        fee = cost * self.fee_rate
        if cost + fee > self.cash:
            quantity = self.cash / (fill * (1 + self.fee_rate))
            cost, fee = fill * quantity, fill * quantity * self.fee_rate
        if quantity <= 0:
            return False
        self.cash -= cost + fee
        self.position = Position(quantity, fill, stop_loss, take_profit, when)
        return True

    def sell(self, price: float, when: str, reason: str) -> Trade | None:
        pos = self.position
        if pos is None:
            return None
        fill = price * (1 - self.slippage)
        proceeds = fill * pos.quantity
        fee = proceeds * self.fee_rate
        self.cash += proceeds - fee
        entry_cost = pos.entry_price * pos.quantity * (1 + self.fee_rate)
        trade = Trade(pos.entry_date, when, pos.entry_price, fill, pos.quantity, proceeds - fee - entry_cost, reason)
        self.trades.append(trade)
        self.position = None
        return trade

    def check_exits(self, open_: float, high: float, low: float, when: str) -> Trade | None:
        """Vérifie stop-loss et take-profit pendant la bougie.

        Hypothèse prudente : si les deux sont touchés dans la même bougie,
        on suppose que le stop l'a été en premier. Si le marché ouvre déjà
        au-delà du stop (gap), on sort au prix d'ouverture, pas au stop.
        """
        pos = self.position
        if pos is None:
            return None
        if open_ <= pos.stop_loss:
            return self.sell(open_, when, "stop-loss (gap)")
        if low <= pos.stop_loss:
            return self.sell(pos.stop_loss, when, "stop-loss")
        if open_ >= pos.take_profit:
            return self.sell(open_, when, "take-profit (gap)")
        if high >= pos.take_profit:
            return self.sell(pos.take_profit, when, "take-profit")
        return None
