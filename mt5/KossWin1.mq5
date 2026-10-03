//+------------------------------------------------------------------+
//|                                                    KossWin1.mq5  |
//|  KossWin1 — Smart Money sur un graphique propre (MT5).            |
//|  Même logique que tradingview/kosswin1.pine :                     |
//|   1. OB en confluence avec FVG + zones Supply / Demand            |
//|      (une couleur par type de tracé) ;                            |
//|   2. zones tracées seulement après l'inducement (IDM) ;           |
//|   3. tendance BOS / CHoCH + liquidité (BSL / SSL, EQH / EQL) ;    |
//|   4. sweep = point rouge ;                                        |
//|   5. premium / discount (1 – 0,5 – 0) selon la tendance ;         |
//|   6. signaux du setup Koss (escalier + retour + retournement).    |
//|  Bougies clôturées uniquement (pas de repaint).                   |
//|  C'est un INDICATEUR : il ne passe aucun ordre.                   |
//|  Fiche : tradingview/KOSSWIN1_GUIDE.md                            |
//+------------------------------------------------------------------+
#property copyright   "Koss"
#property version     "1.00"
#property description "KossWin1 : OB + FVG, Supply / Demand après inducement, BOS / CHoCH, liquidité, sweeps, premium / discount."
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

enum ENUM_KW_DIR
  {
   KW_AUTO = 0, // Auto (selon le symbole)
   KW_SELL = 1, // Ventes seulement
   KW_BUY  = 2, // Achats seulement
   KW_BOTH = 3  // Achats et ventes
  };
enum ENUM_KW_ENTRY
  {
   KW_ZONE = 0, // Dans la zone (OB / Supply / Demand)
   KW_ZPD  = 1  // Dans la zone ou en premium / discount
  };

input group "1. Structure (BOS / CHoCH)"
input int             InpLen      = 5;            // Swings externes (structure)
input int             InpIntLen   = 2;            // Swings internes (inducement)
input bool            InpShowStr  = true;         // Afficher BOS / CHoCH
input group "2. Zones"
input bool            InpShowOB   = true;         // Order Blocks en confluence avec FVG
input bool            InpShowFvg  = true;         // Afficher le FVG de l'OB
input bool            InpShowSD   = true;         // Zones Supply / Demand
input bool            InpReqIdm   = true;         // Tracer seulement après inducement (IDM)
input bool            InpShowIdm  = true;         // Afficher l'inducement
input double          InpDisp     = 1.5;          // Déplacement minimal (× ATR)
input int             InpMaxZ     = 3;            // Zones affichées par sens
input int             InpMaxAge   = 300;          // Durée de vie d'une zone (bougies)
input group "3. Liquidité"
input bool            InpShowLiq  = true;         // Niveaux de liquidité (BSL / SSL, EQH / EQL)
input int             InpMaxLiq   = 3;            // Niveaux par côté
input double          InpEqTol    = 0.1;          // Tolérance EQH / EQL (× ATR)
input bool            InpShowSwp  = true;         // Sweep : point rouge
input group "4. Premium / Discount"
input bool            InpShowPD   = true;         // Afficher premium / discount (1 – 0,5 – 0)
input group "5. Signaux (setup Koss)"
input bool            InpSignals  = true;         // Afficher les signaux
input ENUM_KW_DIR     InpDir      = KW_AUTO;      // Sens
input int             InpMinStep  = 2;            // Zones en escalier minimum
input ENUM_KW_ENTRY   InpEntry    = KW_ZPD;       // Zone d'entrée
input double          InpMinRR    = 1.5;          // Gain / risque minimal (R)
input bool            InpHtfOn    = true;         // Filtre : tendance de l'unité supérieure
input ENUM_TIMEFRAMES InpHtf      = PERIOD_H4;    // Unité supérieure
input bool            InpAlerts   = true;         // Alertes (fenêtre MT5)
input bool            InpPush     = false;        // Notifications sur le téléphone
input int             InpHistory  = 3000;         // Bougies analysées au chargement
input group "6. Couleurs (une par type de tracé)"
input color           CObBull     = C'0,137,123';   // OB + FVG haussier
input color           CObBear     = C'142,36,170';  // OB + FVG baissier
input color           CFvg        = C'144,164,174'; // FVG
input color           CDemand     = C'30,136,229';  // Demand
input color           CSupply     = C'239,108,0';   // Supply
input color           CBos        = C'158,158,158'; // BOS
input color           CChoch      = C'251,192,45';  // CHoCH
input color           CIdm        = C'244,143,177'; // Inducement (IDM)
input color           CLiq        = C'38,198,218';  // Liquidité
input color           CSweep      = C'255,23,68';   // Sweep (point rouge)
input color           CPrem       = C'90,40,40';    // Premium (fond)
input color           CDisc       = C'30,70,35';    // Discount (fond)
input color           CBuy        = C'46,125,50';   // Signal d'achat
input color           CSell       = C'198,40,40';   // Signal de vente

#define PFX "KW1_"

struct KZone
  {
   int      id;
   int      dir;      // +1 haussière, -1 baissière
   int      kind;     // 1 = OB + FVG, 2 = Supply / Demand
   double   top, bot;
   int      left, born;
   bool     hasFvg;
   double   fTop, fBot;
   int      fLeft;
   bool     hasIdm;
   double   idm;
   int      idmBar;
   bool     valid, touched, signaled, drawn;
  };
struct KLiq
  {
   int      id;
   double   price;
   int      bar;
   bool     isHigh;
  };

//--- État
KZone    Z[];
KLiq     LQ[];
int      StrIds[];
int      SwpIds[];
int      SigIds[];
double   Atr[];
int      lastDone = -1, atrDone = -1, seq = 0;
int      trend = 0;
double   swH = 0, swL = 0;
int      swHBar = -1, swLBar = -1;
bool     swHUsed = true, swLUsed = true;
double   lastIph = 0, lastIpl = 0;
int      lastIphBar = -1, lastIplBar = -1;
double   rHi = 0, rLo = 0;
int      rStart = -1, rDir = 0;
int      bullSteps = 0, bearSteps = 0;
double   prevBullBot = 0, prevBearTop = 0;
int      tchS = -1000, tchB = -1000, lastSigBar = -1000;
double   slRefS = 0, slRefB = 0;
string   lastSig = "aucun";
bool     allowSell = true, allowBuy = true, ready = false;
string   dirTxt = "";
//--- Tendance de l'unité supérieure (calcul séparé)
MqlRates HR[];
int      hDone = -1, hTrend = 0;
double   hH = 0, hL = 0;
bool     hHUsed = true, hLUsed = true;
bool     htfUsable = false;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpLen < 2 || InpIntLen < 1 || InpMaxZ < 1 || InpMaxLiq < 1)
     { Print("KossWin1 : paramètres invalides."); return(INIT_PARAMETERS_INCORRECT); }
   string s = _Symbol + " " + SymbolInfoString(_Symbol, SYMBOL_DESCRIPTION);
   StringToUpper(s);
   bool isDrop = StringFind(s, "PAINX") >= 0 || StringFind(s, "CRASH") >= 0 || StringFind(s, "PRICE DROP") >= 0;
   bool isPump = StringFind(s, "GAINX") >= 0 || StringFind(s, "BOOM") >= 0 || StringFind(s, "PRICE RISE") >= 0 || StringFind(s, "PRICE JUMP") >= 0;
   bool drop = isDrop && !isPump, pump = isPump && !isDrop;
   allowSell = InpDir == KW_SELL || InpDir == KW_BOTH || (InpDir == KW_AUTO && !pump);
   allowBuy  = InpDir == KW_BUY  || InpDir == KW_BOTH || (InpDir == KW_AUTO && !drop);
   dirTxt = allowSell && allowBuy ? "achats et ventes" : allowSell ? "ventes" : "achats";
   htfUsable = PeriodSeconds(InpHtf) > PeriodSeconds();
   IndicatorSetString(INDICATOR_SHORTNAME, "KossWin1");
   ResetAll();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { ObjectsDeleteAll(0, PFX); Comment(""); }

void ResetAll()
  {
   ObjectsDeleteAll(0, PFX);
   ArrayResize(Z, 0); ArrayResize(LQ, 0); ArrayResize(StrIds, 0); ArrayResize(SwpIds, 0); ArrayResize(SigIds, 0);
   lastDone = -1; atrDone = -1; seq = 0; trend = 0;
   swH = swL = 0; swHBar = swLBar = -1; swHUsed = swLUsed = true;
   lastIph = lastIpl = 0; lastIphBar = lastIplBar = -1;
   rHi = rLo = 0; rStart = -1; rDir = 0;
   bullSteps = bearSteps = 0; prevBullBot = prevBearTop = 0;
   tchS = tchB = lastSigBar = -1000; slRefS = slRefB = 0; lastSig = "aucun";
   hDone = -1; hTrend = 0; hH = hL = 0; hHUsed = hLUsed = true;
   ready = false;
  }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
  {
   int need = 14 + 2 * InpLen + 110;
   if(rates_total < need) return(0);
   ArraySetAsSeries(time, false); ArraySetAsSeries(open, false); ArraySetAsSeries(high, false);
   ArraySetAsSeries(low, false);  ArraySetAsSeries(close, false);
   if(prev_calculated == 0)
     {
      ResetAll();
      lastDone = MathMax(need, rates_total - InpHistory) - 1;
     }
   //--- ATR 14 (Wilder, comme ta.atr)
   if(ArraySize(Atr) < rates_total) ArrayResize(Atr, rates_total, 1000);
   for(int i = atrDone + 1; i <= rates_total - 2; i++)
     {
      double tr = i == 0 ? high[0] - low[0]
                  : MathMax(high[i] - low[i], MathMax(MathAbs(high[i] - close[i - 1]), MathAbs(low[i] - close[i - 1])));
      if(i < 13) Atr[i] = 0;
      else if(i == 13)
        {
         double sum = 0;
         for(int k = 0; k <= 13; k++)
            sum += k == 0 ? high[0] - low[0] : MathMax(high[k] - low[k], MathMax(MathAbs(high[k] - close[k - 1]), MathAbs(low[k] - close[k - 1])));
         Atr[i] = sum / 14.0;
        }
      else Atr[i] = (Atr[i - 1] * 13.0 + tr) / 14.0;
      atrDone = i;
     }
   //--- Unité supérieure : (re)chargement de l'historique
   if(InpHtfOn && htfUsable && (prev_calculated == 0 || lastDone < rates_total - 2))
     {
      // On garde l'état déjà calculé : on repartira de la bonne bougie HTF
      datetime lastT = hDone >= 0 && hDone < ArraySize(HR) ? HR[hDone].time : 0;
      int n = CopyRates(_Symbol, InpHtf, 0, 5000, HR);
      if(n > 0)
        {
         if(lastT > 0)
           {
            hDone = -1;
            for(int k = ArraySize(HR) - 1; k >= 0; k--) if(HR[k].time == lastT) { hDone = k; break; }
            if(hDone < 0) { hTrend = 0; hH = hL = 0; hHUsed = hLUsed = true; }
           }
        }
     }
   //--- Bougies clôturées pas encore traitées
   for(int i = lastDone + 1; i <= rates_total - 2; i++)
     {
      if(InpHtfOn && htfUsable) HtfUpdate(time[i] + PeriodSeconds());
      ProcessBar(i, ready, time, open, high, low, close);
      lastDone = i;
     }
   ready = true;
   DrawPD(rStart >= 0 && rStart < rates_total ? time[rStart] : 0, time[rates_total - 1]);
   ShowPanel(close[rates_total - 1]);
   return(rates_total);
  }

//+------------------------------------------------------------------+
//| Tendance HTF : traite les bougies HTF clôturées avant « endT »    |
//+------------------------------------------------------------------+
void HtfUpdate(const datetime endT)
  {
   int n = ArraySize(HR), hs = PeriodSeconds(InpHtf);
   for(int k = hDone + 1; k < n; k++)
     {
      if(HR[k].time + hs > endT) break;
      int j = k - InpLen;
      if(j - InpLen >= 0)
        {
         bool isH = true, isL = true;
         for(int m = 1; m <= InpLen; m++)
           {
            if(HR[j].high <= HR[j - m].high || HR[j].high < HR[j + m].high) isH = false;
            if(HR[j].low >= HR[j - m].low || HR[j].low > HR[j + m].low) isL = false;
           }
         if(isH) { hH = HR[j].high; hHUsed = false; }
         if(isL) { hL = HR[j].low;  hLUsed = false; }
        }
      if(!hHUsed && HR[k].close > hH) { hTrend = 1;  hHUsed = true; }
      if(!hLUsed && HR[k].close < hL) { hTrend = -1; hLUsed = true; }
      hDone = k;
     }
  }

//+------------------------------------------------------------------+
//| Traitement d'une bougie clôturée                                  |
//+------------------------------------------------------------------+
void ProcessBar(const int i, const bool live, const datetime &t[], const double &o[],
                const double &h[], const double &l[], const double &c[])
  {
   double atr = Atr[i];
   if(atr <= 0) return;
   int ps = PeriodSeconds();

   //--- A. Swings internes (inducement)
   int ji = i - InpIntLen;
   bool newIph = false, newIpl = false;
   if(ji - InpIntLen >= 0)
     {
      if(IsPivot(ji, InpIntLen, true, h, l))  { lastIph = h[ji]; lastIphBar = ji; newIph = true; }
      if(IsPivot(ji, InpIntLen, false, h, l)) { lastIpl = l[ji]; lastIplBar = ji; newIpl = true; }
     }

   //--- B. Liquidité : sweep (mèche au-delà + clôture en retour) ou prise
   for(int k = ArraySize(LQ) - 1; k >= 0; k--)
     {
      bool hit = LQ[k].isHigh ? h[i] > LQ[k].price : l[i] < LQ[k].price;
      if(!hit) continue;
      bool sweep = LQ[k].isHigh ? c[i] < LQ[k].price : c[i] > LQ[k].price;
      if(sweep)
        {
         if(InpShowSwp) SweepDot(t[i], LQ[k].isHigh ? h[i] + 0.15 * atr : l[i] - 0.15 * atr, LQ[k].isHigh);
         if(live) Notify(StringFormat("KossWin1 %s : sweep de liquidité %s à %s", _Symbol, LQ[k].isHigh ? "haute" : "basse", Px(LQ[k].price)));
        }
      ObjectsDeleteAll(0, PFX + "L" + IntegerToString(LQ[k].id) + "_");
      RemoveLiq(k);
     }

   //--- C. Swings externes = structure + liquidité
   int j = i - InpLen;
   if(j - InpLen >= 0)
     {
      if(IsPivot(j, InpLen, true, h, l))  { swH = h[j]; swHBar = j; swHUsed = false; AddLiq(h[j], j, true, InpEqTol * atr, t, i); }
      if(IsPivot(j, InpLen, false, h, l)) { swL = l[j]; swLBar = j; swLUsed = false; AddLiq(l[j], j, false, InpEqTol * atr, t, i); }
     }

   //--- D. Cassure haussière (BOS / CHoCH)
   if(swHBar >= 0 && !swHUsed && c[i] > swH)
     {
      bool choch = trend == -1;
      trend = 1; swHUsed = true;
      StructLine(t[swHBar], t[i], swH, choch, true);
      if(choch) { bearSteps = 0; prevBearTop = 0; if(live) Notify(StringFormat("KossWin1 %s : CHoCH haussier", _Symbol)); }
      int n = MathMax(MathMin(i - swHBar, 100), 1), k0 = 0;
      double lo = l[i];
      for(int k = 1; k <= n; k++) if(l[i - k] < lo) { lo = l[i - k]; k0 = k; }
      double legHi = h[i];
      for(int k = 0; k <= k0; k++) legHi = MathMax(legHi, h[i - k]);
      rDir = 1; rLo = lo; rHi = legHi; rStart = i - k0;
      int obK = k0;
      for(int k = k0; k <= k0 + 3; k++) if(c[i - k] < o[i - k]) { obK = k; break; }
      double obTop = h[i - obK], obBot = MathMin(l[i - obK], lo);
      double fT = 0, fB = 0; int fL = -1;
      for(int jj = obK - 2; jj >= MathMax(obK - 6, 0) && jj >= 0; jj--)
         if(l[i - jj] > h[i - (jj + 2)]) { fT = l[i - jj]; fB = h[i - (jj + 2)]; fL = i - (jj + 2); break; }
      if(legHi - lo >= InpDisp * atr)
        {
         if(fL >= 0)
           {
            NewZone(1, 1, obTop, obBot, i - obK, true, fT, fB, fL, i, c[i], t);
            bullSteps = (bullSteps > 0 && prevBullBot > 0 && obBot > prevBullBot) ? bullSteps + 1 : 1;
            prevBullBot = obBot;
           }
         else
           {
            double dTop = MathMax(o[i - k0], c[i - k0]), dBot = lo;
            for(int k = MathMax(k0 - 1, 0); k <= k0 + 1; k++) { dTop = MathMax(dTop, MathMax(o[i - k], c[i - k])); dBot = MathMin(dBot, l[i - k]); }
            NewZone(1, 2, dTop, dBot, i - (k0 + 1), false, 0, 0, -1, i, c[i], t);
            bullSteps = (bullSteps > 0 && prevBullBot > 0 && dBot > prevBullBot) ? bullSteps + 1 : 1;
            prevBullBot = dBot;
           }
        }
     }
   //--- D bis. Cassure baissière (BOS / CHoCH)
   if(swLBar >= 0 && !swLUsed && c[i] < swL)
     {
      bool choch = trend == 1;
      trend = -1; swLUsed = true;
      StructLine(t[swLBar], t[i], swL, choch, false);
      if(choch) { bullSteps = 0; prevBullBot = 0; if(live) Notify(StringFormat("KossWin1 %s : CHoCH baissier", _Symbol)); }
      int n = MathMax(MathMin(i - swLBar, 100), 1), k0 = 0;
      double hi = h[i];
      for(int k = 1; k <= n; k++) if(h[i - k] > hi) { hi = h[i - k]; k0 = k; }
      double legLo = l[i];
      for(int k = 0; k <= k0; k++) legLo = MathMin(legLo, l[i - k]);
      rDir = -1; rHi = hi; rLo = legLo; rStart = i - k0;
      int obK = k0;
      for(int k = k0; k <= k0 + 3; k++) if(c[i - k] > o[i - k]) { obK = k; break; }
      double obTop = MathMax(h[i - obK], hi), obBot = l[i - obK];
      double fT = 0, fB = 0; int fL = -1;
      for(int jj = obK - 2; jj >= MathMax(obK - 6, 0) && jj >= 0; jj--)
         if(h[i - jj] < l[i - (jj + 2)]) { fT = l[i - (jj + 2)]; fB = h[i - jj]; fL = i - (jj + 2); break; }
      if(hi - legLo >= InpDisp * atr)
        {
         if(fL >= 0)
           {
            NewZone(-1, 1, obTop, obBot, i - obK, true, fT, fB, fL, i, c[i], t);
            bearSteps = (bearSteps > 0 && prevBearTop > 0 && obTop < prevBearTop) ? bearSteps + 1 : 1;
            prevBearTop = obTop;
           }
         else
           {
            double sBot = MathMin(o[i - k0], c[i - k0]), sTop = hi;
            for(int k = MathMax(k0 - 1, 0); k <= k0 + 1; k++) { sBot = MathMin(sBot, MathMin(o[i - k], c[i - k])); sTop = MathMax(sTop, h[i - k]); }
            NewZone(-1, 2, sTop, sBot, i - (k0 + 1), false, 0, 0, -1, i, c[i], t);
            bearSteps = (bearSteps > 0 && prevBearTop > 0 && sTop < prevBearTop) ? bearSteps + 1 : 1;
            prevBearTop = sTop;
           }
        }
     }

   //--- E. Plage premium / discount
   if(rDir == 1)  rHi = MathMax(rHi, h[i]);
   if(rDir == -1) rLo = MathMin(rLo, l[i]);

   //--- F. Vie des zones
   for(int k = ArraySize(Z) - 1; k >= 0; k--)
     {
      bool kill = i - Z[k].born > InpMaxAge;
      if(Z[k].dir == 1)
        {
         kill = kill || c[i] < Z[k].bot;
         if(!kill && !Z[k].valid)
           {
            if(!Z[k].hasIdm && newIpl && lastIpl > Z[k].top) { Z[k].hasIdm = true; Z[k].idm = lastIpl; Z[k].idmBar = lastIplBar; }
            if(Z[k].hasIdm && l[i] < Z[k].idm && i - InpIntLen >= Z[k].idmBar)
              { Z[k].valid = true; DrawZone(k, t, i); if(live) Notify(StringFormat("KossWin1 %s : zone haussière validée (IDM pris)", _Symbol)); }
           }
         if(!kill && Z[k].valid && !Z[k].touched && Z[k].born < i && l[i] <= Z[k].top) { Z[k].touched = true; FadeZone(k); }
        }
      else
        {
         kill = kill || c[i] > Z[k].top;
         if(!kill && !Z[k].valid)
           {
            if(!Z[k].hasIdm && newIph && lastIph < Z[k].bot) { Z[k].hasIdm = true; Z[k].idm = lastIph; Z[k].idmBar = lastIphBar; }
            if(Z[k].hasIdm && h[i] > Z[k].idm && i - InpIntLen >= Z[k].idmBar)
              { Z[k].valid = true; DrawZone(k, t, i); if(live) Notify(StringFormat("KossWin1 %s : zone baissière validée (IDM pris)", _Symbol)); }
           }
         if(!kill && Z[k].valid && !Z[k].touched && Z[k].born < i && h[i] >= Z[k].bot) { Z[k].touched = true; FadeZone(k); }
        }
      if(kill) { ObjectsDeleteAll(0, ZName(Z[k].id, "")); RemoveZone(k); }
      else if(Z[k].drawn)
        {
         ObjectMove(0, ZName(Z[k].id, "r"), 1, t[i] + 5 * ps, Z[k].bot);
         if(Z[k].hasFvg) ObjectMove(0, ZName(Z[k].id, "f"), 1, t[i] + 5 * ps, Z[k].fBot);
        }
     }
   for(int d = -1; d <= 1; d += 2)
     {
      int nv = 0, np = 0;
      for(int k = 0; k < ArraySize(Z); k++) if(Z[k].dir == d) { if(Z[k].valid) nv++; else np++; }
      if(nv > InpMaxZ || np > 6)
         for(int k = 0; k < ArraySize(Z); k++)
            if(Z[k].dir == d && ((nv > InpMaxZ && Z[k].valid) || (np > 6 && !Z[k].valid)))
              { ObjectsDeleteAll(0, ZName(Z[k].id, "")); RemoveZone(k); break; }
     }

   //--- G. Signaux du setup Koss
   if(InpSignals && rDir != 0 && rHi > rLo)
     {
      double mid = (rHi + rLo) / 2.0;
      bool htfS = !InpHtfOn || !htfUsable || hTrend == -1;
      bool htfB = !InpHtfOn || !htfUsable || hTrend == 1;
      int zS = -1, zB = -1;
      for(int k = ArraySize(Z) - 1; k >= 0; k--)
         if(Z[k].valid && !Z[k].signaled)
           {
            if(Z[k].dir == -1 && zS < 0) zS = k;
            if(Z[k].dir == 1 && zB < 0)  zB = k;
           }
      bool inZoneS = zS >= 0 && h[i] >= Z[zS].bot;
      bool inPremS = InpEntry == KW_ZPD && rDir == -1 && h[i] >= mid;
      if(inZoneS || inPremS) { tchS = i; slRefS = inZoneS ? Z[zS].top : rHi; }
      bool inZoneB = zB >= 0 && l[i] <= Z[zB].top;
      bool inDiscB = InpEntry == KW_ZPD && rDir == 1 && l[i] <= mid;
      if(inZoneB || inDiscB) { tchB = i; slRefB = inZoneB ? Z[zB].bot : rLo; }
      bool revDn = c[i] < o[i] && c[i] < l[i - 1];
      bool revUp = c[i] > o[i] && c[i] > h[i - 1];
      if(allowSell && trend == -1 && htfS && bearSteps >= InpMinStep && revDn && i - tchS <= 3 && i - lastSigBar > 5)
        {
         double sl = slRefS + 0.2 * atr, tp = rLo;
         double rr = (sl > c[i] && tp < c[i]) ? (c[i] - tp) / (sl - c[i]) : 0;
         if(rr >= InpMinRR)
           {
            Signal(false, t[i], h[i] + 0.3 * atr, c[i], sl, tp, rr, bearSteps);
            if(zS >= 0 && inZoneS) Z[zS].signaled = true;
            lastSigBar = i;
            lastSig = StringFormat("VENTE %s (%.1fR)", Px(c[i]), rr);
            if(live) Notify(StringFormat("KossWin1 %s : VENTE à %s | stop %s | objectif %s | %.1fR", _Symbol, Px(c[i]), Px(sl), Px(tp), rr));
           }
        }
      if(allowBuy && trend == 1 && htfB && bullSteps >= InpMinStep && revUp && i - tchB <= 3 && i - lastSigBar > 5)
        {
         double sl = slRefB - 0.2 * atr, tp = rHi;
         double rr = (sl < c[i] && tp > c[i]) ? (tp - c[i]) / (c[i] - sl) : 0;
         if(rr >= InpMinRR)
           {
            Signal(true, t[i], l[i] - 0.3 * atr, c[i], sl, tp, rr, bullSteps);
            if(zB >= 0 && inZoneB) Z[zB].signaled = true;
            lastSigBar = i;
            lastSig = StringFormat("ACHAT %s (%.1fR)", Px(c[i]), rr);
            if(live) Notify(StringFormat("KossWin1 %s : ACHAT à %s | stop %s | objectif %s | %.1fR", _Symbol, Px(c[i]), Px(sl), Px(tp), rr));
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Zones                                                             |
//+------------------------------------------------------------------+
void NewZone(const int dir, const int kind, const double top, const double bot, const int left,
             const bool hasFvg, const double fT, const double fB, const int fL,
             const int i, const double cl, const datetime &t[])
  {
   int n = ArraySize(Z);
   ArrayResize(Z, n + 1);
   Z[n].id = ++seq; Z[n].dir = dir; Z[n].kind = kind; Z[n].top = top; Z[n].bot = bot;
   Z[n].left = left; Z[n].born = i; Z[n].hasFvg = hasFvg; Z[n].fTop = fT; Z[n].fBot = fB; Z[n].fLeft = fL;
   Z[n].hasIdm = false; Z[n].idm = 0; Z[n].idmBar = -1;
   Z[n].valid = false; Z[n].touched = false; Z[n].signaled = false; Z[n].drawn = false;
   // Inducement déjà formé entre la zone et le prix ?
   if(dir == 1 && lastIplBar > left && lastIpl > top && lastIpl < cl)
     { Z[n].hasIdm = true; Z[n].idm = lastIpl; Z[n].idmBar = lastIplBar; }
   if(dir == -1 && lastIphBar > left && lastIph < bot && lastIph > cl)
     { Z[n].hasIdm = true; Z[n].idm = lastIph; Z[n].idmBar = lastIphBar; }
   if(!InpReqIdm) { Z[n].valid = true; DrawZone(n, t, i); }
  }

void DrawZone(const int k, const datetime &t[], const int i)
  {
   int ps = PeriodSeconds();
   bool show = Z[k].kind == 1 ? InpShowOB : InpShowSD;
   if(show)
     {
      color cz = Z[k].kind == 1 ? (Z[k].dir == 1 ? CObBull : CObBear) : (Z[k].dir == 1 ? CDemand : CSupply);
      string r = ZName(Z[k].id, "r");
      ObjectCreate(0, r, OBJ_RECTANGLE, 0, t[Z[k].left], Z[k].top, t[i] + 5 * ps, Z[k].bot);
      ObjectSetInteger(0, r, OBJPROP_COLOR, cz);
      ObjectSetInteger(0, r, OBJPROP_FILL, true);
      ObjectSetInteger(0, r, OBJPROP_BACK, true);
      ObjectSetInteger(0, r, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, r, OBJPROP_HIDDEN, true);
      Txt(ZName(Z[k].id, "t"), t[Z[k].left], Z[k].dir == 1 ? Z[k].bot : Z[k].top,
          Z[k].kind == 1 ? "OB + FVG" : (Z[k].dir == 1 ? "Demand" : "Supply"), cz,
          Z[k].dir == 1 ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER, 7);
      if(Z[k].kind == 1 && InpShowFvg && Z[k].hasFvg)
        {
         string f = ZName(Z[k].id, "f");
         ObjectCreate(0, f, OBJ_RECTANGLE, 0, t[Z[k].fLeft], Z[k].fTop, t[i] + 5 * ps, Z[k].fBot);
         ObjectSetInteger(0, f, OBJPROP_COLOR, CFvg);
         ObjectSetInteger(0, f, OBJPROP_STYLE, STYLE_DOT);
         ObjectSetInteger(0, f, OBJPROP_FILL, false);
         ObjectSetInteger(0, f, OBJPROP_BACK, true);
         ObjectSetInteger(0, f, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, f, OBJPROP_HIDDEN, true);
        }
      Z[k].drawn = true;
     }
   if(InpShowIdm && Z[k].hasIdm)
     {
      TLine(ZName(Z[k].id, "i"), t[Z[k].idmBar], Z[k].idm, t[i], Z[k].idm, CIdm, STYLE_DOT, 1);
      Txt(ZName(Z[k].id, "j"), t[i], Z[k].idm, "IDM", CIdm, ANCHOR_LEFT, 7);
     }
  }

void FadeZone(const int k)
  {
   string r = ZName(Z[k].id, "r");
   if(ObjectFind(0, r) < 0) return;
   ObjectSetInteger(0, r, OBJPROP_FILL, false);
   ObjectSetInteger(0, r, OBJPROP_STYLE, STYLE_DOT);
  }

void RemoveZone(const int k)
  {
   int n = ArraySize(Z);
   for(int m = k; m < n - 1; m++) Z[m] = Z[m + 1];
   ArrayResize(Z, n - 1);
  }

//+------------------------------------------------------------------+
//| Liquidité, structure, sweeps, signaux                             |
//+------------------------------------------------------------------+
void AddLiq(const double p, const int bar, const bool isHigh, const double tol, const datetime &t[], const int i)
  {
   bool eq = false;
   int x1 = bar;
   for(int k = 0; k < ArraySize(LQ); k++)
      if(LQ[k].isHigh == isHigh && MathAbs(LQ[k].price - p) <= tol) { eq = true; x1 = MathMin(x1, LQ[k].bar); }
   int n = ArraySize(LQ);
   ArrayResize(LQ, n + 1);
   LQ[n].id = ++seq; LQ[n].price = p; LQ[n].bar = bar; LQ[n].isHigh = isHigh;
   if(InpShowLiq)
     {
      string ln = PFX + "L" + IntegerToString(LQ[n].id) + "_l";
      TLine(ln, t[x1], p, t[i], p, CLiq, STYLE_DOT, 1);
      ObjectSetInteger(0, ln, OBJPROP_RAY_RIGHT, true);
      Txt(PFX + "L" + IntegerToString(LQ[n].id) + "_t", t[bar], p,
          eq ? (isHigh ? "EQH" : "EQL") : (isHigh ? "BSL" : "SSL"), CLiq, isHigh ? ANCHOR_LOWER : ANCHOR_UPPER, 7);
     }
   int cnt = 0;
   for(int k = 0; k < ArraySize(LQ); k++) if(LQ[k].isHigh == isHigh) cnt++;
   if(cnt > InpMaxLiq)
      for(int k = 0; k < ArraySize(LQ); k++)
         if(LQ[k].isHigh == isHigh)
           { ObjectsDeleteAll(0, PFX + "L" + IntegerToString(LQ[k].id) + "_"); RemoveLiq(k); break; }
  }

void RemoveLiq(const int k)
  {
   int n = ArraySize(LQ);
   for(int m = k; m < n - 1; m++) LQ[m] = LQ[m + 1];
   ArrayResize(LQ, n - 1);
  }

void StructLine(const datetime t1, const datetime t2, const double y, const bool choch, const bool up)
  {
   if(!InpShowStr) return;
   int id = ++seq;
   color cs = choch ? CChoch : CBos;
   TLine(PFX + "S" + IntegerToString(id) + "_l", t1, y, t2, y, cs, STYLE_DASH, choch ? 2 : 1);
   Txt(PFX + "S" + IntegerToString(id) + "_t", (datetime)(((long)t1 + (long)t2) / 2), y, choch ? "CHoCH" : "BOS", cs,
       up ? ANCHOR_LOWER : ANCHOR_UPPER, 7);
   PushRing(StrIds, id, 10, "S");
  }

void SweepDot(const datetime tt, const double y, const bool above)
  {
   int id = ++seq;
   string nm = PFX + "W" + IntegerToString(id) + "_d";
   ObjectCreate(0, nm, OBJ_ARROW, 0, tt, y);
   ObjectSetInteger(0, nm, OBJPROP_ARROWCODE, 159);          // point plein
   ObjectSetInteger(0, nm, OBJPROP_COLOR, CSweep);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, 3);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, above ? ANCHOR_BOTTOM : ANCHOR_TOP);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, nm, OBJPROP_HIDDEN, true);
   ObjectSetString(0, nm, OBJPROP_TOOLTIP, "Sweep de liquidité");
   PushRing(SwpIds, id, 60, "W");
  }

void Signal(const bool buy, const datetime tt, const double y, const double entry, const double sl,
            const double tp, const double rr, const int steps)
  {
   int id = ++seq;
   string nm = PFX + "G" + IntegerToString(id) + "_a";
   ObjectCreate(0, nm, OBJ_ARROW, 0, tt, y);
   ObjectSetInteger(0, nm, OBJPROP_ARROWCODE, buy ? 233 : 234);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, buy ? CBuy : CSell);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, 3);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, buy ? ANCHOR_TOP : ANCHOR_BOTTOM);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
   ObjectSetString(0, nm, OBJPROP_TOOLTIP, StringFormat("%s\nEntrée %s\nStop %s\nObjectif (niveau 0) %s\nGain / risque %.1fR\nEscalier : %d zones",
                   buy ? "ACHAT" : "VENTE", Px(entry), Px(sl), Px(tp), rr, steps));
   PushRing(SigIds, id, 50, "G");
  }

// Garde seulement les « keep » derniers objets d'une famille
void PushRing(int &arr[], const int id, const int keep, const string tag)
  {
   int n = ArraySize(arr);
   ArrayResize(arr, n + 1);
   arr[n] = id;
   if(n + 1 > keep)
     {
      ObjectsDeleteAll(0, PFX + tag + IntegerToString(arr[0]) + "_");
      for(int m = 0; m < n; m++) arr[m] = arr[m + 1];
      ArrayResize(arr, n);
     }
  }

//+------------------------------------------------------------------+
//| Premium / Discount (niveaux 1 – 0,5 – 0)                          |
//+------------------------------------------------------------------+
void DrawPD(const datetime t1, const datetime tLast)
  {
   string nP = PFX + "PD_p", nD = PFX + "PD_d", nE = PFX + "PD_e";
   if(!InpShowPD || rDir == 0 || t1 == 0 || rHi <= rLo) { ObjectsDeleteAll(0, PFX + "PD_"); return; }
   datetime t2 = tLast + 15 * PeriodSeconds();
   double mid = (rHi + rLo) / 2.0;
   Rect(nP, t1, rHi, t2, mid, CPrem);
   Rect(nD, t1, mid, t2, rLo, CDisc);
   TLine(nE, t1, mid, t2, mid, clrGray, STYLE_DASH, 1);
   Txt(PFX + "PD_1", t2, rHi, rDir == -1 ? "1  Premium" : "0  Premium", clrGray, ANCHOR_LEFT, 7);
   Txt(PFX + "PD_5", t2, mid, "0.5", clrGray, ANCHOR_LEFT, 7);
   Txt(PFX + "PD_0", t2, rLo, rDir == -1 ? "0  Discount" : "1  Discount", clrGray, ANCHOR_LEFT, 7);
  }

//+------------------------------------------------------------------+
//| Outils                                                            |
//+------------------------------------------------------------------+
bool IsPivot(const int j, const int len, const bool isHigh, const double &h[], const double &l[])
  {
   for(int k = 1; k <= len; k++)
     {
      if(isHigh && (h[j] <= h[j - k] || h[j] < h[j + k])) return(false);
      if(!isHigh && (l[j] >= l[j - k] || l[j] > l[j + k])) return(false);
     }
   return(true);
  }

string ZName(const int id, const string sfx) { return PFX + "Z" + IntegerToString(id) + "_" + sfx; }
string Px(const double p) { return DoubleToString(p, _Digits); }

void Rect(const string name, const datetime t1, const double p1, const datetime t2, const double p2, const color cr)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, cr);
   ObjectSetInteger(0, name, OBJPROP_FILL, true);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void TLine(const string name, const datetime t1, const double p1, const datetime t2, const double p2,
           const color cr, const ENUM_LINE_STYLE st, const int w)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, cr);
   ObjectSetInteger(0, name, OBJPROP_STYLE, st);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, w);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void Txt(const string name, const datetime tt, const double p, const string text, const color cr,
         const ENUM_ANCHOR_POINT anchor, const int size)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TEXT, 0, tt, p);
   else ObjectMove(0, name, 0, tt, p);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, cr);
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

string TrTxt(const int tr) { return tr == 1 ? "haussière" : tr == -1 ? "baissière" : "–"; }

void ShowPanel(const double price)
  {
   double mid = (rHi + rLo) / 2.0;
   string pd = (rDir == 0 || rHi <= rLo) ? "–" : price >= mid ? "PREMIUM" : "DISCOUNT";
   string htf = !InpHtfOn ? "filtre désactivé" : !htfUsable ? "unité trop petite" : TrTxt(hTrend);
   Comment(StringFormat(
      "KossWin1  |  %s  |  signaux : %s\n"
      "Tendance %s : %s  |  Tendance %s : %s\n"
      "Prix en %s  |  Escalier offre / demande : %d / %d\n"
      "Dernier signal : %s",
      _Symbol, dirTxt,
      StringSubstr(EnumToString((ENUM_TIMEFRAMES)Period()), 7), TrTxt(trend),
      StringSubstr(EnumToString(InpHtf), 7), htf,
      pd, bearSteps, bullSteps, lastSig));
  }
//+------------------------------------------------------------------+
