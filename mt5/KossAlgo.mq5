//+------------------------------------------------------------------+
//|                                                    KossAlgo.mq5  |
//|  Koss Algo — Bougies algorithmiques avant un CHoCH (MT5).          |
//|  Même logique que tradingview/koss_algo.pine :                    |
//|  Étape 1 (D1 / H4 / H1) : bougies algo du dernier mouvement avant |
//|    un CHoCH = rectangles ORANGE ; mouvement du CHoCH = rectangle  |
//|    VERT fin.                                                       |
//|  Étape 2 (graphique M5 / M15 / M30) : bougies algo présentes dans |
//|    la zone verte et situées avant un CHoCH = rectangles orange    |
//|    pâle.                                                           |
//|  Bougie algo : corps ≥ 1,5 ATR(14) et corps ≥ 70 % de la bougie.   |
//|  Bougies clôturées uniquement. Indicateur : aucun ordre.          |
//|  Fiche : tradingview/KOSS_ALGO_GUIDE.md                           |
//+------------------------------------------------------------------+
#property copyright   "Koss"
#property version     "1.00"
#property description "Koss Algo : bougies algorithmiques avant un CHoCH (unité d'analyse + unité d'entrée)."
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

enum ENUM_KA_HTF
  {
   KA_D1 = PERIOD_D1, // Daily
   KA_H4 = PERIOD_H4, // H4
   KA_H1 = PERIOD_H1  // H1
  };

input group "1. Étape 1 : unité d'analyse"
input ENUM_KA_HTF InpHtf     = KA_H4;   // Unité d'analyse
input int         InpHtfLen  = 3;       // Swings (structure) de l'unité d'analyse
input int         InpKeepH   = 2;       // Mouvements CHoCH gardés à l'écran
input int         InpHtfBars = 1500;    // Bougies analysées (unité d'analyse)
input group "2. Étape 2 : unité d'entrée (graphique)"
input bool        InpShowLtf = true;    // Bougies algo de l'unité d'entrée
input int         InpLtfLen  = 3;       // Swings (structure) de l'unité d'entrée
input bool        InpInZone  = true;    // Seulement dans la zone verte de l'unité d'analyse
input bool        InpShowCh  = true;    // Afficher le niveau du CHoCH (unité d'entrée)
input int         InpKeepL   = 3;       // CHoCH gardés à l'écran (unité d'entrée)
input int         InpLtfBars = 3000;    // Bougies analysées (unité d'entrée)
input group "3. Bougie algorithmique"
input double      InpBodyK   = 1.5;     // Corps minimal (× ATR 14)
input double      InpRatio   = 70;      // Corps minimal (% de la bougie)
input int         InpMaxAlgo = 3;       // Bougies algo max. par mouvement (1 à 3)
input bool        InpInclImp = false;   // Chercher aussi dans la jambe du CHoCH
input group "4. Couleurs et alertes"
input color       CAlgoH     = C'255,152,0';   // Bougie algo (unité d'analyse)
input color       CAlgoL     = C'255,183,77';  // Bougie algo (unité d'entrée)
input color       CZone      = C'0,200,83';    // Mouvement CHoCH (rectangle vert)
input color       CChoch     = C'158,158,158'; // Niveau du CHoCH (unité d'entrée)
input bool        InpAlerts  = true;           // Alertes (fenêtre MT5)
input bool        InpPush    = false;          // Notifications sur le téléphone

#define PFX "KALGO_"

struct KEvent
  {
   datetime evT, bL, bR;
   double   top, bot, lvl;
   int      dir, n;
   datetime t[3];
   double   h[3], l[3];
  };

KEvent   HEv[];
KEvent   LEv[];
datetime lastBarTime = 0;
datetime lastHEvAlert = 0, lastLEvAlert = 0;
bool     firstRun = true;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpHtfLen < 2 || InpLtfLen < 2 || InpMaxAlgo < 1 || InpMaxAlgo > 3)
     { Print("Koss Algo : paramètres invalides."); return(INIT_PARAMETERS_INCORRECT); }
   IndicatorSetString(INDICATOR_SHORTNAME, "Koss Algo");
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason) { ObjectsDeleteAll(0, PFX); Comment(""); }

//+------------------------------------------------------------------+
int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
  {
   // Tout est recalculé une fois par nouvelle bougie (simple et sans repaint)
   datetime tNow = (datetime)SeriesInfoInteger(_Symbol, PERIOD_CURRENT, SERIES_LASTBAR_DATE);
   if(tNow == lastBarTime && prev_calculated > 0) return(rates_total);
   lastBarTime = tNow;
   Rebuild();
   return(rates_total);
  }

//+------------------------------------------------------------------+
//| Recalcule les deux étapes et redessine                            |
//+------------------------------------------------------------------+
void Rebuild()
  {
   ObjectsDeleteAll(0, PFX);
   ArrayResize(HEv, 0);
   ArrayResize(LEv, 0);
   bool htfOk = PeriodSeconds((ENUM_TIMEFRAMES)InpHtf) > PeriodSeconds();
   if(!htfOk)
      Comment("Koss Algo : l'unité d'analyse doit être plus grande que celle du graphique.");
   else
      Comment("");
   //--- Étape 1
   if(htfOk)
     {
      MqlRates hr[];
      ArraySetAsSeries(hr, false);
      int n = CopyRates(_Symbol, (ENUM_TIMEFRAMES)InpHtf, 0, InpHtfBars, hr);
      if(n > 30) Scan(hr, n - 1, InpHtfLen, (ENUM_TIMEFRAMES)InpHtf, HEv);   // n-1 : bougie en cours exclue
     }
   //--- Étape 2
   if(InpShowLtf)
     {
      MqlRates lr[];
      ArraySetAsSeries(lr, false);
      int n = CopyRates(_Symbol, PERIOD_CURRENT, 0, InpLtfBars, lr);
      if(n > 30) Scan(lr, n - 1, InpLtfLen, PERIOD_CURRENT, LEv);
     }
   DrawHtf();
   DrawLtf();
   firstRun = false;
  }

//+------------------------------------------------------------------+
//| Moteur : structure, CHoCH et bougies algo                         |
//+------------------------------------------------------------------+
void Scan(const MqlRates &r[], const int n, const int len, const ENUM_TIMEFRAMES tf, KEvent &ev[])
  {
   double atr[];
   ArrayResize(atr, n);
   for(int i = 0; i < n; i++)
     {
      double tr = i == 0 ? r[0].high - r[0].low
                  : MathMax(r[i].high - r[i].low, MathMax(MathAbs(r[i].high - r[i - 1].close), MathAbs(r[i].low - r[i - 1].close)));
      if(i < 13) atr[i] = 0;
      else if(i == 13)
        {
         double s = 0;
         for(int k = 0; k <= 13; k++)
            s += k == 0 ? r[0].high - r[0].low : MathMax(r[k].high - r[k].low, MathMax(MathAbs(r[k].high - r[k - 1].close), MathAbs(r[k].low - r[k - 1].close)));
         atr[i] = s / 14.0;
        }
      else atr[i] = (atr[i - 1] * 13.0 + tr) / 14.0;
     }
   int tr = 0, shB = -1, slB = -1;
   double sh = 0, sl = 0;
   bool shU = true, slU = true;
   int ps = PeriodSeconds(tf);
   for(int i = 2 * len; i < n; i++)
     {
      int j = i - len;
      if(IsPivot(r, j, len, true))  { sh = r[j].high; shB = j; shU = false; }
      if(IsPivot(r, j, len, false)) { sl = r[j].low;  slB = j; slU = false; }
      int up = 0;
      if(shB >= 0 && !shU && r[i].close > sh)      { shU = true; up = 1; }
      else if(slB >= 0 && !slU && r[i].close < sl) { slU = true; up = -1; }
      if(up == 0) continue;
      bool choch = tr == -up;
      tr = up;
      if(!choch || atr[i] <= 0) continue;
      int start = MathMax(up == 1 ? shB : slB, i - 150);
      // Extrême du dernier mouvement
      int x = i;
      double ext = up == 1 ? r[i].low : r[i].high, oppo = up == 1 ? r[i].high : r[i].low;
      for(int k = start; k <= i; k++)
        {
         if(up == 1) { if(r[k].low < ext) { ext = r[k].low; x = k; }  oppo = MathMax(oppo, r[k].high); }
         else        { if(r[k].high > ext) { ext = r[k].high; x = k; } oppo = MathMin(oppo, r[k].low); }
        }
      // Bougies algo : les plus grands corps
      double b[3] = {0, 0, 0};
      int    kk[3] = {-1, -1, -1};
      int last = InpInclImp ? i : x;
      for(int k = start; k <= last; k++)
        {
         bool inLeg = k <= x;
         bool wantBear = (up == 1) == inLeg;
         double body = MathAbs(r[k].close - r[k].open), rng = r[k].high - r[k].low;
         bool okDir = wantBear ? r[k].close < r[k].open : r[k].close > r[k].open;
         if(!okDir || rng <= 0 || body < InpBodyK * atr[k] || body < InpRatio / 100.0 * rng) continue;
         for(int m = 0; m < 3; m++)
            if(body > b[m])
              {
               for(int q = 2; q > m; q--) { b[q] = b[q - 1]; kk[q] = kk[q - 1]; }
               b[m] = body; kk[m] = k;
               break;
              }
        }
      int e = ArraySize(ev);
      ArrayResize(ev, e + 1);
      ev[e].evT = r[i].time; ev[e].bL = r[start].time; ev[e].bR = r[i].time + ps;
      ev[e].top = up == 1 ? oppo : ext; ev[e].bot = up == 1 ? ext : oppo;
      ev[e].lvl = up == 1 ? sh : sl; ev[e].dir = up; ev[e].n = 0;
      for(int m = 0; m < 3; m++)
        {
         ev[e].t[m] = 0; ev[e].h[m] = 0; ev[e].l[m] = 0;
         if(kk[m] >= 0 && m < InpMaxAlgo)
           { ev[e].t[m] = r[kk[m]].time; ev[e].h[m] = r[kk[m]].high; ev[e].l[m] = r[kk[m]].low; ev[e].n++; }
        }
     }
  }

bool IsPivot(const MqlRates &r[], const int j, const int len, const bool isHigh)
  {
   for(int k = 1; k <= len; k++)
     {
      if(isHigh && (r[j].high <= r[j - k].high || r[j].high < r[j + k].high)) return(false);
      if(!isHigh && (r[j].low >= r[j - k].low || r[j].low > r[j + k].low)) return(false);
     }
   return(true);
  }

//+------------------------------------------------------------------+
//| Dessins                                                           |
//+------------------------------------------------------------------+
void DrawHtf()
  {
   int n = ArraySize(HEv);
   if(n == 0) return;
   string tfTxt = InpHtf == KA_D1 ? "D1" : InpHtf == KA_H4 ? "H4" : "H1";
   int hs = PeriodSeconds((ENUM_TIMEFRAMES)InpHtf);
   for(int e = MathMax(0, n - InpKeepH); e < n; e++)
     {
      string z = PFX + "H" + IntegerToString(e) + "_z";
      Rect(z, HEv[e].bL, HEv[e].top, HEv[e].bR, HEv[e].bot, CZone, false, STYLE_SOLID);
      Txt(PFX + "H" + IntegerToString(e) + "_zt", HEv[e].bL, HEv[e].dir == 1 ? HEv[e].top : HEv[e].bot,
          "CHoCH " + tfTxt + (HEv[e].dir == 1 ? " ▲" : " ▼"), CZone, HEv[e].dir == 1 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER);
      for(int m = 0; m < 3; m++)
        {
         if(HEv[e].t[m] == 0) continue;
         Rect(PFX + "H" + IntegerToString(e) + "_a" + IntegerToString(m), HEv[e].t[m], HEv[e].h[m], HEv[e].t[m] + hs, HEv[e].l[m], CAlgoH, true, STYLE_SOLID);
         if(m == 0) Txt(PFX + "H" + IntegerToString(e) + "_at", HEv[e].t[m], HEv[e].h[m], "Algo " + tfTxt, CAlgoH, ANCHOR_LEFT_LOWER);
        }
     }
   // Alerte sur un nouvel événement (pas au premier chargement)
   if(!firstRun && HEv[n - 1].evT != lastHEvAlert)
      Notify(StringFormat("Koss Algo %s : nouveau CHoCH %s avec %d bougie(s) algo", _Symbol, tfTxt, HEv[n - 1].n));
   lastHEvAlert = HEv[n - 1].evT;
  }

void DrawLtf()
  {
   int n = ArraySize(LEv);
   if(n == 0) return;
   int ps = PeriodSeconds(), drawn = 0, hn = ArraySize(HEv);
   datetime newest = 0;
   // On parcourt du plus récent au plus ancien et on garde InpKeepL CHoCH avec bougies algo
   for(int e = n - 1; e >= 0 && drawn < InpKeepL; e--)
     {
      // Zone verte active à ce moment : dernier événement de l'unité d'analyse clôturé avant ce CHoCH
      double zT = 0, zB = 0; datetime zL = 0; bool hasZone = false;
      for(int h = hn - 1; h >= 0; h--)
         if(HEv[h].bR <= LEv[e].evT) { zT = HEv[h].top; zB = HEv[h].bot; zL = HEv[h].bL; hasZone = true; break; }
      int cnt = 0;
      for(int m = 0; m < 3; m++)
        {
         if(LEv[e].t[m] == 0) continue;
         if(InpInZone && (!hasZone || LEv[e].h[m] < zB || LEv[e].l[m] > zT || LEv[e].t[m] < zL)) continue;
         Rect(PFX + "L" + IntegerToString(e) + "_a" + IntegerToString(m), LEv[e].t[m], LEv[e].h[m], LEv[e].t[m] + ps, LEv[e].l[m], CAlgoL, false, STYLE_SOLID);
         if(cnt == 0) Txt(PFX + "L" + IntegerToString(e) + "_at", LEv[e].t[m], LEv[e].h[m], "algo", CAlgoL, ANCHOR_LEFT_LOWER);
         cnt++;
        }
      if(cnt == 0) continue;
      drawn++;
      if(newest == 0) newest = LEv[e].evT;
      if(InpShowCh)
        {
         string ln = PFX + "L" + IntegerToString(e) + "_c";
         ObjectCreate(0, ln, OBJ_TREND, 0, LEv[e].bL, LEv[e].lvl, LEv[e].evT, LEv[e].lvl);
         ObjectSetInteger(0, ln, OBJPROP_COLOR, CChoch);
         ObjectSetInteger(0, ln, OBJPROP_STYLE, STYLE_DASH);
         ObjectSetInteger(0, ln, OBJPROP_RAY_RIGHT, false);
         ObjectSetInteger(0, ln, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, ln, OBJPROP_HIDDEN, true);
         Txt(PFX + "L" + IntegerToString(e) + "_ct", LEv[e].evT, LEv[e].lvl, "CHoCH", CChoch,
             LEv[e].dir == 1 ? ANCHOR_LOWER : ANCHOR_UPPER);
        }
     }
   if(!firstRun && newest != 0 && newest != lastLEvAlert)
      Notify(StringFormat("Koss Algo %s : bougies algo avant un CHoCH dans la zone verte", _Symbol));
   if(newest != 0) lastLEvAlert = newest;
  }

void Rect(const string name, const datetime t1, const double p1, const datetime t2, const double p2,
          const color c, const bool fill, const ENUM_LINE_STYLE st)
  {
   ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_FILL, fill);
   ObjectSetInteger(0, name, OBJPROP_STYLE, st);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void Txt(const string name, const datetime t, const double p, const string text, const color c, const ENUM_ANCHOR_POINT anchor)
  {
   ObjectCreate(0, name, OBJ_TEXT, 0, t, p);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 7);
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
