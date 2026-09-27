//+------------------------------------------------------------------+
//|                                             KossSupplyZones.mq5  |
//|  Koss Supply Zones : vente sur l'escalier d'offre                 |
//|  (et achat sur l'escalier de demande).                            |
//|                                                                   |
//|  Même logique que tradingview/koss_supply_zones.pine :            |
//|   1. chaque rebond s'arrête plus bas et laisse une zone d'offre ; |
//|   2. le prix revient dans la DERNIÈRE zone ;                      |
//|   3. vente au bord inférieur, stop au-dessus, cible sur la        |
//|      liquidité sous le prix.                                      |
//|  Calcul sur bougies clôturées uniquement (pas de repaint).        |
//|  C'est un INDICATEUR : il ne passe aucun ordre.                   |
//|  Fiche : tradingview/KOSS_SUPPLY_ZONES_GUIDE.md                   |
//+------------------------------------------------------------------+
#property copyright   "Koss"
#property version     "1.00"
#property description "Koss Supply Zones : escalier d'offre / de demande, signaux, plan de trade et statistiques."
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

enum ENUM_KSZ_DIR
  {
   KSZ_AUTO = 0, // Auto (selon le symbole)
   KSZ_SELL = 1, // Ventes (zones d'offre)
   KSZ_BUY  = 2, // Achats (zones de demande)
   KSZ_BOTH = 3  // Les deux
  };
enum ENUM_KSZ_ZONE
  {
   KSZ_WICKBODY = 0, // Mèche + corps
   KSZ_FULL     = 1  // Bougie entière
  };
enum ENUM_KSZ_TGT
  {
   KSZ_NEAREST = 0, // Liquidité la plus proche (≥ R min.)
   KSZ_EXTREME = 1  // Creux / sommet le plus extrême
  };
enum ENUM_KSZ_PROFILE
  {
   KSZ_PR_AUTO   = 0, // Auto (selon l'unité de temps)
   KSZ_PR_MANUAL = 1  // Manuel (valeurs ci-dessous)
  };

//--- 1. Sens
input group "1. Sens des trades"
input ENUM_KSZ_PROFILE InpProfile = KSZ_PR_AUTO; // Profil des réglages
input ENUM_KSZ_DIR  InpDir      = KSZ_AUTO;     // Sens
//--- 2. Zones
input group "2. Zones et escalier (profil manuel)"
input int           InpSwing    = 3;            // Longueur des swings
input double        InpImp      = 1.5;          // Mouvement impulsif minimal (× ATR)
input int           InpSearch   = 20;           // Recherche de l'origine (bougies)
input ENUM_KSZ_ZONE InpZoneMd   = KSZ_WICKBODY; // Hauteur de la zone
input int           InpMinStep  = 2;            // Marches minimales de l'escalier
input int           InpMaxAge   = 150;          // Durée de vie d'une zone (bougies)
input int           InpAtrLen   = 14;           // Période ATR
//--- 3. Entrée
input group "3. Entrée"
input double        InpEntOff   = 0.1;          // Entrée : avant le bord de la zone (× ATR)
input bool          InpConfirm  = true;         // Confirmation de rejet
input int           InpConfBar  = 5;            // Délai de confirmation (bougies)
//--- 4. Stop et objectifs
input group "4. Stop et objectifs"
input double        InpSlBuf    = 0.2;          // Stop : marge au-delà de la zone (× ATR)
input double        InpTp1R     = 1.5;          // TP1 (R)
input double        InpPart     = 50;           // Part fermée à TP1 (%)
input bool          InpBE       = true;         // Stop à l'entrée après TP1
input ENUM_KSZ_TGT  InpTgtMd    = KSZ_NEAREST;  // Cible (TP2)
input double        InpMinRR    = 2.0;          // Gain / risque minimal jusqu'à TP2 (R)
input double        InpTpBuf    = 0.5;          // TP2 : marge au-delà de la liquidité (× ATR)
input double        InpNoTgtR   = 3.0;          // Sans liquidité visible : TP2 à (R), 0 = pas de trade
input double        InpEqTol    = 0.15;         // Tolérance creux / sommets égaux (× ATR)
input int           InpMaxBars  = 48;           // Durée max. d'un trade (bougies, 0 = off)
//--- 5. Taille de position
input group "5. Taille de position et coûts"
input double        InpCapital  = 0;            // Capital (USD), 0 = équité du compte
input double        InpRisk     = 1.0;          // Risque par trade (%)
input double        InpMaxSpr   = 20.0;         // Spread max. en % du risque
//--- 6. Affichage et alertes
input group "6. Affichage et alertes"
input int           InpHistory  = 5000;         // Bougies analysées au chargement
input int           InpMaxZone  = 4;            // Zones affichées par sens
input bool          InpShowEq   = true;         // Creux / sommets égaux (EQL / EQH)
input bool          InpShowTr   = true;         // Trades (entrée, stop, TP)
input int           InpKeepTr   = 5;            // Trades gardés sur le graphique
input bool          InpAlerts   = true;         // Alertes (fenêtre MT5)
input bool          InpPush     = false;        // Notifications sur le téléphone
input color         InpCSup     = C'156,39,176'; // Offre (ventes)
input color         InpCDem     = C'0,137,123';  // Demande (achats)
input color         InpCNeu     = clrGray;       // Neutre
input color         InpCLoss    = C'242,54,69';  // Stop
input color         InpCWin     = C'8,153,129';  // Objectifs

#define PFX "KSZ_"

//+------------------------------------------------------------------+
struct KZone
  {
   int      id;
   int      dir;      // -1 = offre (ventes), +1 = demande (achats)
   double   top;
   double   bot;
   int      born;     // bougie de création (cassure)
   int      step;     // numéro de la marche
   int      left;     // bougie d'origine
   bool     touched;
   int      touchBar;
  };
struct KLevel
  {
   int      id;
   double   price;
   int      bar;
   bool     swept;
   bool     drawn;
  };
struct KTrade
  {
   bool     open;
   int      id;
   int      dir;
   double   entry;
   double   sl;
   double   tp1;
   double   tp2;
   double   risk;
   double   rr2;
   double   cost;     // spread exprimé en R, retiré du résultat
   int      bar;
   bool     tp1Hit;
  };

//--- État
KZone    Z[];
KLevel   LowsA[];
KLevel   HighsA[];
int      HistIds[];
KTrade   Tr;
double   Atr[];
int      lastDone = -1;       // dernière bougie clôturée traitée
int      atrDone  = -1;
int      seq      = 0;        // compteur d'identifiants
int      actSup   = -1, actDem = -1;
double   lastSL = 0, lastSH = 0;
bool     slUsed = true, shUsed = true;
double   prevSupTop = 0, prevDemBot = 0;
int      supSteps = 0, demSteps = 0;
bool     allowSell = true, allowBuy = true;
string   dirTxt = "";
string   famTxt = "", profTxt = "";
//--- Réglages effectifs (profil auto ou manuel)
int      pSwing = 3, pSearch = 20, pMaxAge = 150, pConfBar = 5, pMaxBars = 48;
double   pImp = 1.5;
string   status = "Recherche d'un escalier";
bool     ready = false;
//--- Statistiques virtuelles
int      stN = 0, stWins = 0, stTp1 = 0, stTp2 = 0;
double   stSum = 0, stGWin = 0, stGLoss = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpSwing < 2 || InpSearch < 5 || InpAtrLen < 1 || InpMinStep < 1)
     {
      Print("Koss Supply Zones : paramètres invalides.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   string s = _Symbol;
   StringToUpper(s);
   // Tous les PainX (400, 600, 800, 999, 1200…) et Crash : indices qui CHUTENT → ventes.
   // Tous les GainX et Boom : indices qui MONTENT par pics → achats (sens contraire).
   s += " " + SymbolInfoString(_Symbol, SYMBOL_DESCRIPTION);
   StringToUpper(s);
   bool isDrop = StringFind(s, "PAINX") >= 0 || StringFind(s, "CRASH") >= 0 || StringFind(s, "PRICE DROP") >= 0;
   bool isPump = StringFind(s, "GAINX") >= 0 || StringFind(s, "BOOM") >= 0 || StringFind(s, "PRICE RISE") >= 0 || StringFind(s, "PRICE JUMP") >= 0;
   bool drop = isDrop && !isPump;
   bool pump = isPump && !isDrop;
   famTxt = drop ? "chutes (PainX / Crash)" : pump ? "pics haussiers (GainX / Boom)" : "autre";
   allowSell = InpDir == KSZ_SELL || InpDir == KSZ_BOTH || (InpDir == KSZ_AUTO && !pump);
   allowBuy  = InpDir == KSZ_BUY  || InpDir == KSZ_BOTH || (InpDir == KSZ_AUTO && !drop);
   //--- Profil selon l'unité de temps : 0 = M1–M5, 1 = M10–M30, 2 = H1–H4, 3 = D1 et plus
   int tfSec = PeriodSeconds();
   int band  = tfSec <= 300 ? 0 : tfSec <= 1800 ? 1 : tfSec <= 14400 ? 2 : 3;
   if(InpProfile == KSZ_PR_AUTO)
     {
      pSwing   = band == 0 ? 5 : band == 3 ? 2 : 3;
      pImp     = band == 0 ? 2.0 : band == 3 ? 1.2 : 1.5;
      pSearch  = band == 0 ? 30 : band == 3 ? 15 : 20;
      pMaxAge  = band == 0 ? 300 : band == 1 ? 150 : band == 2 ? 120 : 60;
      pConfBar = band == 0 ? 3 : band == 1 ? 5 : band == 2 ? 4 : 3;
      pMaxBars = band == 0 ? 120 : band == 1 ? 48 : band == 2 ? 36 : 20;
     }
   else
     {
      pSwing = InpSwing; pImp = InpImp; pSearch = InpSearch;
      pMaxAge = InpMaxAge; pConfBar = InpConfBar; pMaxBars = InpMaxBars;
     }
   string bandTxt = band == 0 ? "M1–M5" : band == 1 ? "M10–M30" : band == 2 ? "H1–H4" : "D1 et plus";
   profTxt = StringFormat("%s : swing %d · impulsion %.1f ATR%s", InpProfile == KSZ_PR_AUTO ? "auto " + bandTxt : "manuel",
                          pSwing, pImp, (tfSec == 1800 || tfSec == 3600) ? "" : " · à tester");
   dirTxt = allowSell && allowBuy ? "achats et ventes" : allowSell ? "ventes (offre)" : "achats (demande)";
   if(InpDir == KSZ_AUTO) dirTxt += " (auto)";
   IndicatorSetString(INDICATOR_SHORTNAME, "Koss Supply Zones");
   ResetAll();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0, PFX);
   Comment("");
  }

void ResetAll()
  {
   ObjectsDeleteAll(0, PFX);
   ArrayResize(Z, 0);
   ArrayResize(LowsA, 0);
   ArrayResize(HighsA, 0);
   ArrayResize(HistIds, 0);
   ZeroMemory(Tr);
   Tr.open = false;
   lastDone = -1; atrDone = -1; seq = 0;
   actSup = -1; actDem = -1;
   lastSL = 0; lastSH = 0; slUsed = true; shUsed = true;
   prevSupTop = 0; prevDemBot = 0; supSteps = 0; demSteps = 0;
   status = "Recherche d'un escalier";
   stN = 0; stWins = 0; stTp1 = 0; stTp2 = 0; stSum = 0; stGWin = 0; stGLoss = 0;
   ready = false;
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total,
                const int prev_calculated,
                const datetime &time[],
                const double &open[],
                const double &high[],
                const double &low[],
                const double &close[],
                const long &tick_volume[],
                const long &volume[],
                const int &spread[])
  {
   int need = InpAtrLen + 2 * pSwing + pSearch + 10;
   if(rates_total < need) return(0);
   ArraySetAsSeries(time, false);
   ArraySetAsSeries(open, false);
   ArraySetAsSeries(high, false);
   ArraySetAsSeries(low, false);
   ArraySetAsSeries(close, false);
   ArraySetAsSeries(spread, false);

   if(prev_calculated == 0)
     {
      ResetAll();
      lastDone = MathMax(need, rates_total - InpHistory) - 1;
     }
   //--- ATR (moyenne de Wilder, comme ta.atr de TradingView), bougies clôturées
   if(ArraySize(Atr) < rates_total) ArrayResize(Atr, rates_total, 1000);
   for(int i = atrDone + 1; i <= rates_total - 2; i++)
     {
      if(i < InpAtrLen - 1) Atr[i] = 0;
      else if(i == InpAtrLen - 1)
        {
         double sum = 0;
         for(int k = 0; k < InpAtrLen; k++) sum += TrueRange(i - k, high, low, close);
         Atr[i] = sum / InpAtrLen;
        }
      else Atr[i] = (Atr[i - 1] * (InpAtrLen - 1) + TrueRange(i, high, low, close)) / InpAtrLen;
      atrDone = i;
     }
   //--- Bougies clôturées pas encore traitées
   for(int i = lastDone + 1; i <= rates_total - 2; i++)
     {
      ProcessBar(i, ready, time, open, high, low, close, spread);
      lastDone = i;
     }
   ready = true;
   ShowPanel(close[rates_total - 1]);
   return(rates_total);
  }

//+------------------------------------------------------------------+
//| Traitement d'une bougie clôturée                                  |
//+------------------------------------------------------------------+
void ProcessBar(const int i, const bool live, const datetime &t[], const double &o[],
                const double &h[], const double &l[], const double &c[], const int &sp[])
  {
   double atr = Atr[i];
   if(atr <= 0) return;
   double part = InpPart / 100.0;
   int    ps   = PeriodSeconds();

   //--- A. Gestion du trade virtuel en cours
   if(Tr.open && i > Tr.bar)
     {
      bool isS   = Tr.dir == -1;
      bool hitSl = isS ? h[i] >= Tr.sl  : l[i] <= Tr.sl;
      bool hitT1 = isS ? l[i] <= Tr.tp1 : h[i] >= Tr.tp1;
      bool hitT2 = isS ? l[i] <= Tr.tp2 : h[i] >= Tr.tp2;
      bool   done = false;
      double res = 0, px = 0;
      if(hitSl)
        {
         // Hypothèse prudente : stop et objectif sur la même bougie = stop.
         res  = Tr.tp1Hit ? part * InpTp1R + (1 - part) * (InpBE ? 0.0 : -1.0) : -1.0;
         px   = Tr.sl; done = true;
         status = Tr.tp1Hit ? "Trade clos : stop à l'entrée après TP1" : "Trade clos : stop touché";
        }
      else
        {
         if(!Tr.tp1Hit && hitT1)
           {
            Tr.tp1Hit = true;
            stTp1++;
            status = StringFormat("TP1 atteint : %.0f %% fermés%s", InpPart, InpBE ? ", stop à l'entrée" : "");
            if(live) Notify(StringFormat("Koss Supply Zones %s : TP1 atteint (%s)", _Symbol, Px(Tr.tp1)));
            if(InpBE)
              {
               Tr.sl = Tr.entry;
               if(InpShowTr) TLine(TName(Tr.id, "s"), t[Tr.bar], Tr.sl, t[i] + ps, Tr.sl, InpCLoss, STYLE_DASH, 1);
              }
           }
         if(hitT2)
           {
            res = part * InpTp1R + (1 - part) * Tr.rr2;
            px  = Tr.tp2; done = true;
            stTp2++;
            status = "Trade clos : TP2 atteint";
           }
         else if(pMaxBars > 0 && i - Tr.bar >= pMaxBars)
           {
            double x = isS ? (Tr.entry - c[i]) / Tr.risk : (c[i] - Tr.entry) / Tr.risk;
            res = Tr.tp1Hit ? part * InpTp1R + (1 - part) * x : x;
            px  = c[i]; done = true;
            status = "Trade clos : durée maximale";
           }
        }
      if(done) CloseTrade(res, px, i, t, live);
      else if(InpShowTr) ExtendTrade(i, t);
     }

   //--- B. Vie des zones : cassure (clôture au-delà) ou expiration
   for(int k = ArraySize(Z) - 1; k >= 0; k--)
     {
      if(Z[k].born >= i) continue;
      bool inval = Z[k].dir == -1 ? c[i] > Z[k].top : c[i] < Z[k].bot;
      bool old   = i - Z[k].born > pMaxAge;
      if(inval || old)
        {
         ObjectsDeleteAll(0, ZName(Z[k].id, ""));
         if(Z[k].id == actSup) actSup = -1;
         if(Z[k].id == actDem) actDem = -1;
         if(inval && Z[k].dir == -1) { supSteps = 0; prevSupTop = 0; status = "Zone d'offre cassée : escalier remis à zéro"; }
         if(inval && Z[k].dir == 1)  { demSteps = 0; prevDemBot = 0; status = "Zone de demande cassée : escalier remis à zéro"; }
         RemoveZone(k);
        }
      else
         ObjectMove(0, ZName(Z[k].id, "r"), 1, t[i] + 3 * ps, Z[k].bot);
     }

   //--- C. Liquidité : niveaux pris, nouveaux creux / sommets
   Sweep(LowsA, true, l[i], i, t);
   Sweep(HighsA, false, h[i], i, t);
   int j = i - pSwing;
   if(j - pSwing >= 0)
     {
      if(IsPivot(j, false, h, l)) { lastSL = l[j]; slUsed = false; AddLevel(LowsA, l[j], j, true, InpEqTol * atr, t); }
      if(IsPivot(j, true, h, l))  { lastSH = h[j]; shUsed = false; AddLevel(HighsA, h[j], j, false, InpEqTol * atr, t); }
     }

   //--- D. Nouvelle zone d'offre : clôture sous le dernier creux
   if(allowSell && lastSL > 0 && !slUsed && c[i] < lastSL)
     {
      slUsed = true;
      int hIdx = 1; double hh = h[i - 1];
      for(int k = 2; k <= pSearch; k++) if(h[i - k] > hh) { hh = h[i - k]; hIdx = k; }
      int ob = -1;
      for(int k = hIdx; k <= hIdx + 3; k++) if(ob < 0 && c[i - k] > o[i - k]) ob = k;
      int src = ob >= 0 ? ob : hIdx;
      double top = hh;
      double bot = InpZoneMd == KSZ_FULL ? l[i - src] : (ob >= 0 ? o[i - ob] : MathMin(o[i - hIdx], c[i - hIdx]));
      if(top - bot < 0.15 * atr) bot = top - 0.15 * atr;
      if(top - c[i] >= pImp * atr)
        {
         supSteps   = (supSteps > 0 && prevSupTop > 0 && top < prevSupTop) ? supSteps + 1 : 1;
         prevSupTop = top;
         NewZone(-1, top, bot, i, supSteps, i - src, t);
         if(live) Notify(StringFormat("Koss Supply Zones %s : nouvelle zone d'offre (marche %d)", _Symbol, supSteps));
        }
     }
   //--- D bis. Nouvelle zone de demande : clôture au-dessus du dernier sommet
   if(allowBuy && lastSH > 0 && !shUsed && c[i] > lastSH)
     {
      shUsed = true;
      int lIdx = 1; double ll = l[i - 1];
      for(int k = 2; k <= pSearch; k++) if(l[i - k] < ll) { ll = l[i - k]; lIdx = k; }
      int ob = -1;
      for(int k = lIdx; k <= lIdx + 3; k++) if(ob < 0 && c[i - k] < o[i - k]) ob = k;
      int src = ob >= 0 ? ob : lIdx;
      double bot = ll;
      double top = InpZoneMd == KSZ_FULL ? h[i - src] : (ob >= 0 ? o[i - ob] : MathMax(o[i - lIdx], c[i - lIdx]));
      if(top - bot < 0.15 * atr) top = bot + 0.15 * atr;
      if(c[i] - bot >= pImp * atr)
        {
         demSteps   = (demSteps > 0 && prevDemBot > 0 && bot > prevDemBot) ? demSteps + 1 : 1;
         prevDemBot = bot;
         NewZone(1, top, bot, i, demSteps, i - src, t);
         if(live) Notify(StringFormat("Koss Supply Zones %s : nouvelle zone de demande (marche %d)", _Symbol, demSteps));
        }
     }

   //--- E. Signaux : retour dans la dernière zone
   if(allowSell) CheckSignal(-1, i, live, atr, t, o, h, l, c, sp);
   if(allowBuy)  CheckSignal(1, i, live, atr, t, o, h, l, c, sp);
  }

//+------------------------------------------------------------------+
//| Retour dans la zone active, confirmation, entrée                  |
//+------------------------------------------------------------------+
void CheckSignal(const int dir, const int i, const bool live, const double atr, const datetime &t[],
                 const double &o[], const double &h[], const double &l[], const double &c[], const int &sp[])
  {
   int id = dir == -1 ? actSup : actDem;
   int k  = FindZone(id);
   if(k < 0 || Z[k].born >= i) return;
   bool   isS  = dir == -1;
   double eLvl = isS ? Z[k].bot - InpEntOff * atr : Z[k].top + InpEntOff * atr;
   if(!Z[k].touched && (isS ? h[i] >= eLvl : l[i] <= eLvl))
     {
      Z[k].touched  = true;
      Z[k].touchBar = i;
      status = StringFormat("Prix dans la zone %s : %s", isS ? "d'offre" : "de demande", InpConfirm ? "attente de la confirmation" : "entrée");
      if(live) Notify(StringFormat("Koss Supply Zones %s : prix dans la zone %s active", _Symbol, isS ? "d'offre" : "de demande"));
     }
   if(!Z[k].touched) return;

   bool   done  = false;
   double entry = 0;
   if(Tr.open)
     { done = true; status = "Zone touchée pendant un trade : ignorée"; }
   else if(!InpConfirm)
     { entry = isS ? MathMax(eLvl, o[i]) : MathMin(eLvl, o[i]); done = true; }
   else if(isS ? (c[i] < eLvl && c[i] < o[i]) : (c[i] > eLvl && c[i] > o[i]))
     { entry = c[i]; done = true; }
   else if(i - Z[k].touchBar >= pConfBar - 1)
     { done = true; status = "Pas de confirmation : zone abandonnée"; }

   if(entry > 0)
     {
      double sl   = isS ? Z[k].top + InpSlBuf * atr : Z[k].bot - InpSlBuf * atr;
      double risk = isS ? sl - entry : entry - sl;
      // Spread de la bougie (historique du courtier), sinon spread actuel
      double spr  = (sp[i] > 0 ? sp[i] : (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD)) * _Point;
      bool   sprOk = risk > 0 && 100.0 * spr / risk <= InpMaxSpr;
      double tp2  = (risk > 0 && Z[k].step >= InpMinStep && sprOk) ? Target(dir, entry, risk, atr) : 0;
      if(risk <= 0 || Z[k].step < InpMinStep || !sprOk || tp2 <= 0)
         status = Z[k].step < InpMinStep ? StringFormat("Setup ignoré : escalier trop court (%d marche)", Z[k].step)
                  : !sprOk ? StringFormat("Setup ignoré : spread > %.0f %% du risque", InpMaxSpr)
                  : StringFormat("Setup ignoré : cible à moins de %.1fR", InpMinRR);
      else
        {
         double tp1 = isS ? entry - InpTp1R * risk : entry + InpTp1R * risk;
         if((isS && tp1 <= tp2) || (!isS && tp1 >= tp2)) tp1 = (entry + tp2) / 2.0;
         Tr.open = true; Tr.id = ++seq; Tr.dir = dir; Tr.entry = entry; Tr.sl = sl;
         Tr.tp1 = tp1; Tr.tp2 = tp2; Tr.risk = risk; Tr.rr2 = MathAbs(tp2 - entry) / risk;
         Tr.bar = i; Tr.tp1Hit = false; Tr.cost = spr / risk;
         if(InpShowTr) DrawTrade(Z[k].step, i, t);
         status = isS ? "VENTE en cours" : "ACHAT en cours";
         if(live)
            Notify(StringFormat("Koss Supply Zones %s : %s à %s | stop %s | TP1 %s | TP2 %s (%.1fR) | lot %.2f",
                                _Symbol, isS ? "VENTE" : "ACHAT", Px(entry), Px(sl), Px(tp1), Px(tp2), Tr.rr2, LotFor(risk)));
         // Entrée au toucher : le stop peut être touché sur la même bougie
         if(!InpConfirm && (isS ? h[i] >= sl : l[i] <= sl))
           {
            CloseTrade(-1.0, sl, i, t, live);
            status = "Trade clos : stop touché sur la bougie d'entrée";
           }
        }
     }
   if(done)
     {
      ZoneStyle(k, false);
      if(isS) actSup = -1; else actDem = -1;
     }
  }

//+------------------------------------------------------------------+
//| Cible TP2 : liquidité non prise au-delà de l'entrée               |
//+------------------------------------------------------------------+
double Target(const int dir, const double entry, const double risk, const double atr)
  {
   double best = 0;
   int    cnt  = 0;
   int    n    = dir == -1 ? ArraySize(LowsA) : ArraySize(HighsA);
   for(int k = 0; k < n; k++)
     {
      KLevel lv;
      if(dir == -1) lv = LowsA[k]; else lv = HighsA[k];
      if(lv.swept || (dir == -1 ? lv.price >= entry : lv.price <= entry)) continue;
      cnt++;
      double tgt = dir == -1 ? lv.price - InpTpBuf * atr : lv.price + InpTpBuf * atr;
      if(MathAbs(entry - tgt) / risk < InpMinRR) continue;
      bool better = InpTgtMd == KSZ_NEAREST ? (dir == -1 ? tgt > best : tgt < best)
                    : (dir == -1 ? tgt < best : tgt > best);
      if(best == 0 || better) best = tgt;
     }
   if(best == 0 && cnt == 0 && InpNoTgtR > 0)
      best = dir == -1 ? entry - InpNoTgtR * risk : entry + InpNoTgtR * risk;
   return(best);
  }

//+------------------------------------------------------------------+
//| Trades virtuels                                                   |
//+------------------------------------------------------------------+
void CloseTrade(const double gross, const double px, const int i, const datetime &t[], const bool live)
  {
   double res = gross - Tr.cost;   // résultat net de spread
   Tr.open = false;
   stN++; stSum += res;
   if(res > 0) { stWins++; stGWin += res; } else stGLoss -= res;
   if(InpShowTr)
     {
      ExtendTrade(i, t);
      ObjectMove(0, TName(Tr.id, "e"), 1, t[i], Tr.entry);
      ObjectMove(0, TName(Tr.id, "s"), 1, t[i], Tr.sl);
      ObjectMove(0, TName(Tr.id, "1"), 1, t[i], Tr.tp1);
      ObjectMove(0, TName(Tr.id, "2"), 1, t[i], Tr.tp2);
      Txt(TName(Tr.id, "r"), t[i], px, RTxt(res), res > 0 ? InpCWin : res < 0 ? InpCLoss : InpCNeu, ANCHOR_LEFT, 9);
     }
   if(live) Notify(StringFormat("Koss Supply Zones %s : trade clos %s", _Symbol, RTxt(res)));
   int n = ArraySize(HistIds);
   ArrayResize(HistIds, n + 1);
   HistIds[n] = Tr.id;
   if(n + 1 > InpKeepTr)
     {
      ObjectsDeleteAll(0, TName(HistIds[0], ""));
      for(int k = 0; k < n; k++) HistIds[k] = HistIds[k + 1];
      ArrayResize(HistIds, n);
     }
  }

void DrawTrade(const int step, const int i, const datetime &t[])
  {
   color c = Tr.dir == -1 ? InpCSup : InpCDem;
   datetime t2 = t[i] + PeriodSeconds();
   TLine(TName(Tr.id, "e"), t[i], Tr.entry, t2, Tr.entry, c, STYLE_SOLID, 2);
   TLine(TName(Tr.id, "s"), t[i], Tr.sl, t2, Tr.sl, InpCLoss, STYLE_DASH, 1);
   TLine(TName(Tr.id, "1"), t[i], Tr.tp1, t2, Tr.tp1, InpCWin, STYLE_DOT, 1);
   TLine(TName(Tr.id, "2"), t[i], Tr.tp2, t2, Tr.tp2, InpCWin, STYLE_DASH, 1);
   Txt(TName(Tr.id, "l"), t[i], Tr.entry,
       StringFormat("%s · marche %d · entrée %s · stop %s · TP2 %s (%.1fR) · lot %.2f",
                    Tr.dir == -1 ? "VENTE" : "ACHAT", step, Px(Tr.entry), Px(Tr.sl), Px(Tr.tp2), Tr.rr2, LotFor(Tr.risk)),
       c, ANCHOR_RIGHT_LOWER, 8);
  }

void ExtendTrade(const int i, const datetime &t[])
  {
   datetime t2 = t[i] + PeriodSeconds();
   ObjectMove(0, TName(Tr.id, "e"), 1, t2, Tr.entry);
   ObjectMove(0, TName(Tr.id, "s"), 1, t2, Tr.sl);
   ObjectMove(0, TName(Tr.id, "1"), 1, t2, Tr.tp1);
   ObjectMove(0, TName(Tr.id, "2"), 1, t2, Tr.tp2);
  }

//+------------------------------------------------------------------+
//| Zones                                                             |
//+------------------------------------------------------------------+
void NewZone(const int dir, const double top, const double bot, const int i, const int step, const int left, const datetime &t[])
  {
   // L'ancienne zone active du même sens passe en arrière-plan
   int old = FindZone(dir == -1 ? actSup : actDem);
   if(old >= 0) ZoneStyle(old, false);
   int n = ArraySize(Z);
   ArrayResize(Z, n + 1);
   Z[n].id = ++seq; Z[n].dir = dir; Z[n].top = top; Z[n].bot = bot; Z[n].born = i;
   Z[n].step = step; Z[n].left = left; Z[n].touched = false; Z[n].touchBar = -1;
   color c = dir == -1 ? InpCSup : InpCDem;
   string r = ZName(Z[n].id, "r");
   ObjectCreate(0, r, OBJ_RECTANGLE, 0, t[left], top, t[i] + 3 * PeriodSeconds(), bot);
   ObjectSetInteger(0, r, OBJPROP_COLOR, c);
   ObjectSetInteger(0, r, OBJPROP_BACK, true);
   ObjectSetInteger(0, r, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, r, OBJPROP_HIDDEN, true);
   Txt(ZName(Z[n].id, "t"), t[left], dir == -1 ? top : bot,
       StringFormat("%s · marche %d", dir == -1 ? "Offre" : "Demande", step), c, dir == -1 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER, 8);
   ZoneStyle(n, true);
   if(dir == -1) { actSup = Z[n].id; status = StringFormat("Nouvelle zone d'offre (marche %d)", step); }
   else          { actDem = Z[n].id; status = StringFormat("Nouvelle zone de demande (marche %d)", step); }
   // Nettoyage : garder InpMaxZone zones par sens
   int cnt = 0;
   for(int k = 0; k < ArraySize(Z); k++) if(Z[k].dir == dir) cnt++;
   if(cnt > InpMaxZone)
      for(int k = 0; k < ArraySize(Z); k++)
         if(Z[k].dir == dir) { ObjectsDeleteAll(0, ZName(Z[k].id, "")); RemoveZone(k); break; }
  }

void ZoneStyle(const int k, const bool active)
  {
   string r = ZName(Z[k].id, "r");
   ObjectSetInteger(0, r, OBJPROP_FILL, active);
   ObjectSetInteger(0, r, OBJPROP_STYLE, active ? STYLE_SOLID : STYLE_DOT);
   ObjectSetInteger(0, r, OBJPROP_WIDTH, 1);
  }

int FindZone(const int id)
  {
   if(id < 0) return(-1);
   for(int k = 0; k < ArraySize(Z); k++) if(Z[k].id == id) return(k);
   return(-1);
  }

void RemoveZone(const int k)
  {
   int n = ArraySize(Z);
   for(int m = k; m < n - 1; m++) Z[m] = Z[m + 1];
   ArrayResize(Z, n - 1);
  }

//+------------------------------------------------------------------+
//| Liquidité                                                         |
//+------------------------------------------------------------------+
bool IsPivot(const int j, const bool isHigh, const double &h[], const double &l[])
  {
   for(int k = 1; k <= pSwing; k++)
     {
      if(isHigh && (h[j] <= h[j - k] || h[j] < h[j + k])) return(false);
      if(!isHigh && (l[j] >= l[j - k] || l[j] > l[j + k])) return(false);
     }
   return(true);
  }

void AddLevel(KLevel &arr[], const double p, const int bar, const bool isLow, const double tol, const datetime &t[])
  {
   int n = ArraySize(arr);
   ArrayResize(arr, n + 1);
   arr[n].id = ++seq; arr[n].price = p; arr[n].bar = bar; arr[n].swept = false; arr[n].drawn = false;
   if(InpShowEq)
      for(int k = 0; k < n; k++)
         if(!arr[k].swept && MathAbs(arr[k].price - p) <= tol)
           {
            string ln = PFX + "L" + IntegerToString(arr[n].id) + "_l";
            TLine(ln, t[arr[k].bar], arr[k].price, t[bar], arr[k].price, InpCNeu, STYLE_DASH, 1);
            ObjectSetInteger(0, ln, OBJPROP_RAY_RIGHT, true);
            Txt(PFX + "L" + IntegerToString(arr[n].id) + "_t", t[bar], arr[k].price, isLow ? "EQL" : "EQH", InpCNeu,
                isLow ? ANCHOR_UPPER : ANCHOR_LOWER, 7);
            arr[n].drawn = true;
            break;
           }
   if(n + 1 > 30)
     {
      ObjectsDeleteAll(0, PFX + "L" + IntegerToString(arr[0].id) + "_");
      for(int k = 0; k < n; k++) arr[k] = arr[k + 1];
      ArrayResize(arr, n);
     }
  }

void Sweep(KLevel &arr[], const bool isLow, const double px, const int i, const datetime &t[])
  {
   for(int k = 0; k < ArraySize(arr); k++)
     {
      if(arr[k].swept || (isLow ? px >= arr[k].price : px <= arr[k].price)) continue;
      arr[k].swept = true;
      if(arr[k].drawn)
        {
         string ln = PFX + "L" + IntegerToString(arr[k].id) + "_l";
         ObjectSetInteger(0, ln, OBJPROP_RAY_RIGHT, false);
         ObjectMove(0, ln, 1, t[i], arr[k].price);
         ObjectSetInteger(0, ln, OBJPROP_STYLE, STYLE_DOT);
        }
     }
  }

//+------------------------------------------------------------------+
//| Outils                                                            |
//+------------------------------------------------------------------+
double TrueRange(const int i, const double &h[], const double &l[], const double &c[])
  {
   if(i == 0) return(h[0] - l[0]);
   return(MathMax(h[i] - l[i], MathMax(MathAbs(h[i] - c[i - 1]), MathAbs(l[i] - c[i - 1]))));
  }
string ZName(const int id, const string suffix) { return PFX + "Z" + IntegerToString(id) + "_" + suffix; }
string TName(const int id, const string suffix) { return PFX + "T" + IntegerToString(id) + "_" + suffix; }
string Px(const double p) { return DoubleToString(p, _Digits); }
string RTxt(const double r) { return (r >= 0 ? "+" : "") + DoubleToString(r, 2) + "R"; }

// Lot pour risquer InpRisk % du capital sur la distance « risk » (en prix)
double LotFor(const double risk)
  {
   double cap = InpCapital > 0 ? InpCapital : AccountInfoDouble(ACCOUNT_EQUITY);
   double tv  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double ts  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tv <= 0 || ts <= 0 || risk <= 0) return(0);
   double lots = cap * InpRisk / 100.0 / (risk / ts * tv);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step > 0) lots = MathFloor(lots / step) * step;
   return(lots);
  }

void TLine(const string name, const datetime t1, const double p1, const datetime t2, const double p2,
           const color c, const ENUM_LINE_STYLE st, const int w)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_STYLE, st);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, w);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void Txt(const string name, const datetime t, const double p, const string text, const color c,
         const ENUM_ANCHOR_POINT anchor, const int size)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TEXT, 0, t, p);
   else ObjectMove(0, name, 0, t, p);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void Notify(const string msg)
  {
   Print(msg);
   if(InpAlerts) Alert(msg);
   if(InpPush)   SendNotification(msg);
  }

//+------------------------------------------------------------------+
//| Panneau (en haut à gauche)                                        |
//+------------------------------------------------------------------+
void ShowPanel(const double price)
  {
   string plan = "aucune zone active";
   int ks = FindZone(actSup), kd = FindZone(actDem);
   int k  = ks >= 0 && kd >= 0 ? (Z[ks].born > Z[kd].born ? ks : kd) : (ks >= 0 ? ks : kd);
   if(k >= 0 && lastDone >= 0 && Atr[lastDone] > 0)
     {
      double atr = Atr[lastDone];
      bool   s   = Z[k].dir == -1;
      double e   = s ? Z[k].bot - InpEntOff * atr : Z[k].top + InpEntOff * atr;
      double sl  = s ? Z[k].top + InpSlBuf * atr : Z[k].bot - InpSlBuf * atr;
      plan = StringFormat("zone %s %s – %s (marche %d)  |  %s %s, stop %s, lot %.2f pour %.1f %%",
                          s ? "d'offre" : "de demande", Px(Z[k].bot), Px(Z[k].top), Z[k].step,
                          s ? "vente" : "achat", Px(e), Px(sl), LotFor(MathAbs(e - sl)), InpRisk);
     }
   string trade = Tr.open ? StringFormat("%s %s  |  stop %s  |  TP1 %s%s  |  TP2 %s",
                                         Tr.dir == -1 ? "VENTE" : "ACHAT", Px(Tr.entry), Px(Tr.sl), Px(Tr.tp1),
                                         Tr.tp1Hit ? " ✔" : "", Px(Tr.tp2)) : "aucun";
   Comment(StringFormat(
      "Koss Supply Zones  |  %s : %s  |  indice : %s\n"
      "Profil %s\n"
      "Escalier d'offre : %s  |  Escalier de demande : %s  (minimum %d)\n"
      "Plan : %s\n"
      "Trade virtuel : %s\n"
      "État : %s\n"
      "Stats nettes de spread (%d bougies) : %d trades · réussite %s · TP1 %s · TP2 %s · espérance %s · total %s · profit factor %s",
      _Symbol, dirTxt, famTxt, profTxt,
      allowSell ? IntegerToString(supSteps) + " marche(s)" : "–",
      allowBuy ? IntegerToString(demSteps) + " marche(s)" : "–", InpMinStep,
      plan, trade, status, InpHistory,
      stN, stN > 0 ? DoubleToString(100.0 * stWins / stN, 0) + " %" : "–",
      stN > 0 ? DoubleToString(100.0 * stTp1 / stN, 0) + " %" : "–",
      stN > 0 ? DoubleToString(100.0 * stTp2 / stN, 0) + " %" : "–",
      stN > 0 ? RTxt(stSum / stN) : "–", stN > 0 ? RTxt(stSum) : "–",
      stGLoss > 0 ? DoubleToString(stGWin / stGLoss, 2) : (stN > 0 ? "∞" : "–")));
  }
//+------------------------------------------------------------------+
