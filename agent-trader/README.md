# Agent trader IA (pédagogique)

Un agent de trading algorithmique complet, écrit pour **apprendre** : chaque ligne est lisible, commentée en
français et testée. Il fonctionne **uniquement en simulation** (paper trading) : aucun ordre réel n'est envoyé.

> **À lire avant tout.** Cet outil ne vous rendra pas riche. La grande majorité des traders particuliers perdent
> de l'argent, et un modèle d'IA ne prédit pas les prix. Sur les données de démonstration, les trois stratégies
> donnent des résultats entre −6 % et +3 % sur deux ans, avec moins de 12 trades chacune : c'est trop peu pour
> conclure quoi que ce soit. Ce projet sert à comprendre comment un agent est construit et pourquoi la gestion du
> risque compte plus que le signal.

## Ce que fait l'agent

```
 bougies 0..i ──► STRATÉGIE ──► signal ──► ANALYSTE IA (option) ──► RISK MANAGER ──► COURTIER SIMULÉ
 (percevoir)      (analyser)               confirme / réduit /       taille, stop,      exécute à
                                           refuse, jamais augmente   coupe-circuit      l'ouverture i+1
                                                                                             │
                                                         journal JSONL ◄─────────────────────┘ (mémoriser)
```

| Module                 | Rôle                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `trader/data.py`       | Lecture de CSV OHLCV, générateur de données synthétiques                   |
| `trader/indicators.py` | SMA, EMA, RSI, MACD, ATR, Bandes de Bollinger (écrits à la main)           |
| `trader/strategies.py` | 3 stratégies : croisement de moyennes, RSI, combinée (tendance + momentum) |
| `trader/risk.py`       | Taille de position, stop-loss ATR, objectif de gain, coupe-circuit         |
| `trader/broker.py`     | Courtier simulé avec frais, glissement, stops et gaps                      |
| `trader/llm.py`        | Analyste Claude : second avis structuré en JSON, ne peut que freiner       |
| `trader/agent.py`      | La boucle de l'agent, commune au backtest et à la simulation               |
| `trader/metrics.py`    | Rendement, drawdown, Sharpe, taux de réussite, comparaison au buy & hold   |

## Installation

Python 3.10 ou plus. Le cœur n'utilise **que la bibliothèque standard**.

```bash
cd agent-trader
python -m unittest discover -s tests        # 18 tests
pip install anthropic                       # seulement pour l'analyste IA
```

## Utilisation

```bash
# Comparer les 3 stratégies sur des données synthétiques
python -m trader compare

# Backtest détaillé d'une stratégie, avec journal
python -m trader backtest --strategy ma_cross --verbose

# Vos propres données (CSV : date,open,high,low,close,volume, trié par date)
python -m trader backtest --csv mes_donnees.csv --strategy combined --symbol BTC-USD

# Simulation avec l'analyste Claude (payant : un appel API par signal d'achat)
export ANTHROPIC_API_KEY=...
python -m trader simulate --csv mes_donnees.csv --ai --last 120
```

Paramètres communs : `--capital`, `--fees` (0.001 = 0,1 %), `--slippage`, `--risk` (part du capital risquée par
trade), `--max-dd` (drawdown qui déclenche l'arrêt).

Pour obtenir des données réelles : export CSV depuis votre courtier, Yahoo Finance (« Historical data »), ou
l'API publique d'une plateforme crypto. Renommez les colonnes si besoin.

## Garde-fous intégrés

1. **Pas de vue sur le futur** : un signal calculé à la clôture _i_ est exécuté à l'ouverture _i+1_. Un test
   vérifie que modifier les bougies futures ne change pas les signaux passés.
2. **Coûts réalistes** : frais et glissement à chaque ordre ; stop prioritaire si stop et objectif sont touchés
   dans la même bougie ; sortie au prix d'ouverture en cas de gap.
3. **Risque borné** : 1 % du capital risqué par trade, 25 % maximum par position, arrêt total à −20 %.
4. **L'IA ne peut que freiner** : elle confirme, réduit ou refuse un achat. Une panne, un refus ou une réponse
   illisible = pas de trade. Les ventes ne passent jamais par l'IA.

## Limites, en toute franchise

- **Backtest ≠ futur.** Une stratégie optimisée sur le passé échoue souvent ensuite (surapprentissage).
- **L'IA connaît l'histoire.** Sur des données réelles anciennes, Claude a pu apprendre ce qui s'est passé :
  un backtest avec l'analyste IA sur ces dates est biaisé. Ne l'évaluez que sur des données postérieures à ses
  connaissances, ou sur des données synthétiques.
- **Position acheteuse uniquement**, un seul actif, bougies journalières.
- **Pas de connexion à un courtier réel.** C'est volontaire. Si vous en ajoutez une un jour : compte de
  démonstration d'abord, des mois de simulation, une somme que vous pouvez perdre entièrement.
- Rien ici n'est un conseil en investissement.

## Supports pédagogiques

- [Cours complet](./docs/COURS.md) : 6 chapitres, du marché à l'agent IA, avec exercices corrigés.
- [Fiche pédagogique](./docs/FICHE-PEDAGOGIQUE.md) : déroulé de séance pour un formateur.
