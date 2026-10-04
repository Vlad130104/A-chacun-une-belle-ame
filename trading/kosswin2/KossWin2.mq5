//+------------------------------------------------------------------+
//|                                                     KossWin2.mq5 |
//|  Structure BOS / CHoCH, liquidité, sweeps, Premium / Discount,    |
//|  Order Blocks + FVG et Supply / Demand validés par inducement.    |
//|  Même logique que KossWin2.pine (TradingView).                    |
//+------------------------------------------------------------------+
#property copyright   "KossWin2"
#property version     "1.00"
#property description "Structure BOS/CHoCH, liquidité, sweeps (point rouge), Premium/Discount, OB+FVG et Supply/Demand affichés seulement après inducement."
#property indicator_chart_window
#property indicator_buffers 3
#property indicator_plots   2
#property indicator_label1  "Sweep haut"
#property indicator_type1   DRAW_ARROW
#property indicator_color1  clrRed
#property indicator_width1  3
#property indicator_label2  "Sweep bas"
#property indicator_type2   DRAW_ARROW
#property indicator_color2  clrRed
#property indicator_width2  3

//--- Paramètres
input group "Structure"
input int    InpSwingLen    = 5;            // Force des swings (structure)
input int    InpIdmLen      = 2;            // Force des swings internes (inducement)
input bool   InpCloseBreak  = true;         // Cassure validée par la clôture (false = mèche)
input int    InpMaxLeg      = 300;          // Longueur max d'une jambe (bougies)
input int    InpMaxStruct   = 4;            // BOS / CHoCH affichés
input color  InpBullCol     = C'8,153,129'; // Couleur haussière
input color  InpBearCol     = C'242,54,69'; // Couleur baissière

input group "Zones (affichées seulement après inducement)"
input bool   InpShowOB      = true;           // Order Block + FVG
input color  InpObBullCol   = C'8,153,129';   // OB+FVG achat
input color  InpObBearCol   = C'242,54,69';   // OB+FVG vente
input bool   InpShowSD      = true;           // Demand / Supply
input color  InpDemCol      = C'41,98,255';   // Demand
input color  InpSupCol      = C'255,152,0';   // Supply
input double InpFillAlpha   = 0.28;           // Opacité du remplissage (0-1)
input int    InpObLookback  = 5;              // OB : recherche avant l'origine (bougies)
input double InpDispMult    = 1.5;            // S/D : bougie de départ >= x ATR
input int    InpBaseMax     = 3;              // S/D : bougies de base max
input bool   InpHideOverlap = true;           // Masquer une S/D qui chevauche un OB+FVG
input int    InpExpiry      = 300;            // Attente max de l'inducement (bougies)
input int    InpMaxZones    = 4;              // Zones affichées max par sens
input int    InpExtBars     = 15;             // Prolonger les zones (bougies)
input bool   InpDelTouched  = false;          // Effacer une zone après le 1er contact
input bool   InpShowIdm     = true;           // Afficher l'inducement pris (IDM)

input group "Liquidité et sweeps"
input bool   InpShowLiq     = true;           // Niveaux de liquidité (BSL / SSL / EQH / EQL)
input int    InpMaxLiq      = 3;              // Niveaux affichés par côté
input double InpEqTol       = 0.1;            // Tolérance EQH / EQL (x ATR)
input color  InpLiqCol      = clrGray;        // Couleur des niveaux
input bool   InpShowSweep   = true;           // Point rouge sur les sweeps

input group "Premium / Discount"
input bool   InpShowPD      = true;           // Afficher Premium / Discount
input color  InpPremCol     = C'242,54,69';   // Premium
input color  InpDiscCol     = C'8,153,129';   // Discount
input bool   InpShowPanel   = true;           // Panneau de tendance
input bool   InpAlerts      = true;           // Alertes (zone validée, sweep)

//--- Types
struct Zone
  {
   int      id;
   int      dir;       // 1 = achat, -1 = vente
   int      kind;      // 0 = OB + FVG, 1 = Supply / Demand
   double   top;
   double   bottom;
   int      left;      // index de la bougie de gauche
   int      created;   // index de la bougie de cassure
   double   idm;
   int      idmBar;    // -1 = pas encore d'inducement
   bool     active;    // true = inducement pris, zone affichée
   bool     touched;
  };

struct Liq
  {
   int      id;
   double   price;
   int      bar;
   bool     isHigh;
   bool     isEq;
  };

//--- Buffers
double g_sweepHi[];
double g_sweepLo[];
double g_atr[];

//--- État
const string PFX         = "KW2_";
const int    MAX_PENDING = 40;
Zone   g_zones[];
Liq    g_liqs[];
int    g_struct[];
int    g_uid;
int    g_last;
double g_shPrice, g_slPrice;
int    g_shBar, g_slBar;
bool   g_shLive, g_slLive;
int    g_trend;
string g_lastTag;
int    g_rStart;
double g_rTop, g_rBot;
int    g_newZones;
bool   g_sweepNow;

//+------------------------------------------------------------------+
//| Outils                                                           |
//+------------------------------------------------------------------+
string Nm(const string kind, const int id) { return PFX + kind + IntegerToString(id); }

// Mélange une couleur avec le fond du graphique (simule la transparence).
color Blend(const color c, const double a)
  {
   int bg = (int)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   int ci = (int)c;
   int r  = (int)MathRound((ci & 0xFF) * a + (bg & 0xFF) * (1.0 - a));
   int g  = (int)MathRound(((ci >> 8) & 0xFF) * a + ((bg >> 8) & 0xFF) * (1.0 - a));
   int b  = (int)MathRound(((ci >> 16) & 0xFF) * a + ((bg >> 16) & 0xFF) * (1.0 - a));
   return (color)(r | (g << 8) | (b << 16));
  }

void StyleObj(const string n)
  {
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_BACK, true);
  }

void Line(const string n, datetime t1, double p1, datetime t2, double p2, color c, ENUM_LINE_STYLE st)
  {
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_TREND, 0, t1, p1, t2, p2);
   else
     {
      ObjectSetInteger(0, n, OBJPROP_TIME, 0, t1);
      ObjectSetDouble(0, n, OBJPROP_PRICE, 0, p1);
      ObjectSetInteger(0, n, OBJPROP_TIME, 1, t2);
      ObjectSetDouble(0, n, OBJPROP_PRICE, 1, p2);
     }
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_STYLE, st);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, n, OBJPROP_RAY_RIGHT, false);
   StyleObj(n);
  }

void Text(const string n, datetime t, double p, const string txt, color c, ENUM_ANCHOR_POINT anc)
  {
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_TEXT, 0, t, p);
   else
     {
      ObjectSetInteger(0, n, OBJPROP_TIME, 0, t);
      ObjectSetDouble(0, n, OBJPROP_PRICE, 0, p);
     }
   ObjectSetString(0, n, OBJPROP_TEXT, txt);
   ObjectSetString(0, n, OBJPROP_FONT, "Arial");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 7);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, anc);
   StyleObj(n);
  }

void Rect(const string n, datetime t1, double p1, datetime t2, double p2, color c, bool fill, ENUM_LINE_STYLE st)
  {
   if(ObjectFind(0, n) < 0)
      ObjectCreate(0, n, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   else
     {
      ObjectSetInteger(0, n, OBJPROP_TIME, 0, t1);
      ObjectSetDouble(0, n, OBJPROP_PRICE, 0, p1);
      ObjectSetInteger(0, n, OBJPROP_TIME, 1, t2);
      ObjectSetDouble(0, n, OBJPROP_PRICE, 1, p2);
     }
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_FILL, fill);
   ObjectSetInteger(0, n, OBJPROP_STYLE, st);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
   StyleObj(n);
  }

void Del(const string n) { ObjectDelete(0, n); }

datetime Future(const datetime &t[], int last, int bars) { return t[last] + (datetime)(bars * PeriodSeconds()); }

bool IsPivotHigh(const double &h[], int p, int len)
  {
   if(p - len < 0)
      return false;
   for(int j = p - len; j <= p + len; j++)
     {
      if(j == p)
         continue;
      if(j < p && h[j] >= h[p])
         return false;
      if(j > p && h[j] > h[p])
         return false;
     }
   return true;
  }

bool IsPivotLow(const double &l[], int p, int len)
  {
   if(p - len < 0)
      return false;
   for(int j = p - len; j <= p + len; j++)
     {
      if(j == p)
         continue;
      if(j < p && l[j] <= l[p])
         return false;
      if(j > p && l[j] < l[p])
         return false;
     }
   return true;
  }

//+------------------------------------------------------------------+
//| Zones                                                            |
//+------------------------------------------------------------------+
color ZoneColor(const Zone &z)
  {
   if(z.kind == 0)
      return z.dir == 1 ? InpObBullCol : InpObBearCol;
   return z.dir == 1 ? InpDemCol : InpSupCol;
  }

string ZoneText(const Zone &z)
  {
   if(z.kind == 0)
      return "OB+FVG";
   return z.dir == 1 ? "Demand" : "Supply";
  }

void DeleteZoneObjects(const Zone &z)
  {
   Del(Nm("Z", z.id));
   Del(Nm("ZT", z.id));
   Del(Nm("I", z.id));
   Del(Nm("IT", z.id));
  }

void RemoveZone(int k)
  {
   DeleteZoneObjects(g_zones[k]);
   int n = ArraySize(g_zones);
   for(int j = k; j < n - 1; j++)
      g_zones[j] = g_zones[j + 1];
   ArrayResize(g_zones, n - 1);
  }

void DrawZone(const Zone &z, int i, const datetime &t[], double alpha)
  {
   color c = ZoneColor(z);
   Rect(Nm("Z", z.id), t[z.left], z.top, Future(t, i, InpExtBars), z.bottom, Blend(c, alpha), true, STYLE_SOLID);
   Text(Nm("ZT", z.id), t[z.left], z.top, ZoneText(z), c, ANCHOR_LEFT_LOWER);
  }

void ActivateZone(int k, int i, const datetime &t[])
  {
   g_zones[k].active = true;
   DrawZone(g_zones[k], i, t, InpFillAlpha);
   if(InpShowIdm)
     {
      Line(Nm("I", g_zones[k].id), t[g_zones[k].idmBar], g_zones[k].idm, t[i], g_zones[k].idm, InpLiqCol, STYLE_DOT);
      int mid = (g_zones[k].idmBar + i) / 2;
      Text(Nm("IT", g_zones[k].id), t[mid], g_zones[k].idm, "IDM", InpLiqCol, g_zones[k].dir == 1 ? ANCHOR_UPPER : ANCHOR_LOWER);
     }
  }

void EnforceCap(int dir)
  {
   int n = 0;
   for(int k = 0; k < ArraySize(g_zones); k++)
      if(g_zones[k].active && g_zones[k].dir == dir)
         n++;
   while(n > InpMaxZones)
     {
      for(int k = 0; k < ArraySize(g_zones); k++)
         if(g_zones[k].active && g_zones[k].dir == dir)
           {
            RemoveZone(k);
            break;
           }
      n--;
     }
  }

void CapPending()
  {
   int n = 0;
   for(int k = 0; k < ArraySize(g_zones); k++)
      if(!g_zones[k].active)
         n++;
   while(n > MAX_PENDING)
     {
      for(int k = 0; k < ArraySize(g_zones); k++)
         if(!g_zones[k].active)
           {
            RemoveZone(k);
            break;
           }
      n--;
     }
  }

void AddPending(int dir, int kind, double top, double bottom, int left, int created)
  {
   int n = ArraySize(g_zones);
   ArrayResize(g_zones, n + 1);
   g_zones[n].id      = ++g_uid;
   g_zones[n].dir     = dir;
   g_zones[n].kind    = kind;
   g_zones[n].top     = top;
   g_zones[n].bottom  = bottom;
   g_zones[n].left    = left;
   g_zones[n].created = created;
   g_zones[n].idm     = 0.0;
   g_zones[n].idmBar  = -1;
   g_zones[n].active  = false;
   g_zones[n].touched = false;
  }

// Zones (en attente) nées de la jambe [o .. i] qui vient de casser la structure.
void CreateZones(int dir, int o, int i, const double &op[], const double &h[], const double &l[], const double &c[])
  {
   bool   bull  = dir == 1;
   bool   hasOb = false;
   double obTop = 0.0, obBot = 0.0;
//--- 1) Order Block + FVG
   if(InpShowOB && i - o >= 2)
     {
      int fvg = -1;
      for(int j = o + 1; j <= i - 1; j++)
        {
         bool gap = bull ? l[j + 1] > h[j - 1] : h[j + 1] < l[j - 1];
         if(gap)
           {
            fvg = j;
            break;
           }
        }
      if(fvg >= 0)
        {
         int k    = -1;
         int kmin = MathMax(0, o - InpObLookback);
         for(int m = fvg - 1; m >= kmin; m--)
            if(bull ? c[m] < op[m] : c[m] > op[m])
              {
               k = m;
               break;
              }
         if(k < 0)
            k = o;
         hasOb = true;
         obTop = h[k];
         obBot = l[k];
         AddPending(dir, 0, obTop, obBot, k, i);
        }
     }
//--- 2) Supply / Demand
   if(InpShowSD)
     {
      for(int j = o; j <= i; j++)
        {
         double rng = h[j] - l[j];
         if(rng <= 0.0)
            continue;
         bool dep = rng >= InpDispMult * g_atr[j] && MathAbs(c[j] - op[j]) / rng >= 0.6 && (bull ? c[j] > op[j] : c[j] < op[j]);
         if(!dep)
            continue;
         int    cnt  = 0;
         double bTop = 0.0, bBot = 0.0;
         for(int m = 1; m <= InpBaseMax && j - m >= 0; m++)
           {
            int    b  = j - m;
            double br = h[b] - l[b];
            if(br > 0.0 && MathAbs(c[b] - op[b]) / br <= 0.5)
              {
               bTop = cnt == 0 ? h[b] : MathMax(bTop, h[b]);
               bBot = cnt == 0 ? l[b] : MathMin(bBot, l[b]);
               cnt++;
              }
            else
               break;
           }
         if(cnt > 0)
           {
            bool overlap = hasOb && bTop >= obBot && bBot <= obTop;
            if(!(InpHideOverlap && overlap))
               AddPending(dir, 1, bTop, bBot, j - cnt, i);
            break;
           }
        }
     }
   CapPending();
  }

//+------------------------------------------------------------------+
//| Liquidité et structure                                           |
//+------------------------------------------------------------------+
string LiqText(const Liq &q)
  {
   if(q.isEq)
      return q.isHigh ? "EQH" : "EQL";
   return q.isHigh ? "BSL" : "SSL";
  }

void RemoveLiq(int k)
  {
   Del(Nm("L", g_liqs[k].id));
   Del(Nm("LT", g_liqs[k].id));
   int n = ArraySize(g_liqs);
   for(int j = k; j < n - 1; j++)
      g_liqs[j] = g_liqs[j + 1];
   ArrayResize(g_liqs, n - 1);
  }

void DrawLiq(const Liq &q, int i, const datetime &t[])
  {
   if(!InpShowLiq)
      return;
   datetime x2 = Future(t, i, 5);
   Line(Nm("L", q.id), t[q.bar], q.price, x2, q.price, InpLiqCol, STYLE_DASH);
   Text(Nm("LT", q.id), x2, q.price, LiqText(q), InpLiqCol, ANCHOR_LEFT);
  }

void AddLiq(double price, int b, bool isHigh, int i, const datetime &t[])
  {
   for(int k = 0; k < ArraySize(g_liqs); k++)
      if(g_liqs[k].isHigh == isHigh && MathAbs(g_liqs[k].price - price) <= InpEqTol * g_atr[i])
        {
         g_liqs[k].isEq  = true;
         g_liqs[k].price = isHigh ? MathMax(g_liqs[k].price, price) : MathMin(g_liqs[k].price, price);
         DrawLiq(g_liqs[k], i, t);
         return;
        }
   int n = ArraySize(g_liqs);
   ArrayResize(g_liqs, n + 1);
   g_liqs[n].id     = ++g_uid;
   g_liqs[n].price  = price;
   g_liqs[n].bar    = b;
   g_liqs[n].isHigh = isHigh;
   g_liqs[n].isEq   = false;
   DrawLiq(g_liqs[n], i, t);
   int cnt = 0;
   for(int k = 0; k < ArraySize(g_liqs); k++)
      if(g_liqs[k].isHigh == isHigh)
         cnt++;
   if(cnt > InpMaxLiq)
      for(int k = 0; k < ArraySize(g_liqs); k++)
         if(g_liqs[k].isHigh == isHigh)
           {
            RemoveLiq(k);
            break;
           }
  }

void DrawStruct(int fromBar, int i, double price, const string tag, int dir, const datetime &t[])
  {
   if(InpMaxStruct <= 0)
      return;
   int    id = ++g_uid;
   color  c  = dir == 1 ? InpBullCol : InpBearCol;
   Line(Nm("S", id), t[fromBar], price, t[i], price, c, STYLE_DASH);
   Text(Nm("ST", id), t[(fromBar + i) / 2], price, tag, c, dir == 1 ? ANCHOR_LOWER : ANCHOR_UPPER);
   int n = ArraySize(g_struct);
   ArrayResize(g_struct, n + 1);
   g_struct[n] = id;
   if(n + 1 > InpMaxStruct)
     {
      Del(Nm("S", g_struct[0]));
      Del(Nm("ST", g_struct[0]));
      ArrayRemove(g_struct, 0, 1);
     }
  }

//+------------------------------------------------------------------+
//| Moteur : une bougie clôturée                                     |
//+------------------------------------------------------------------+
void ProcessBar(int i, const datetime &t[], const double &op[], const double &h[], const double &l[], const double &c[])
  {
//--- A) Range de la dernière jambe
   if(g_rStart >= 0)
     {
      g_rTop = MathMax(g_rTop, h[i]);
      g_rBot = MathMin(g_rBot, l[i]);
     }

//--- B) Liquidité : prise ou sweep
   for(int k = ArraySize(g_liqs) - 1; k >= 0; k--)
     {
      double p   = g_liqs[k].price;
      bool   hi  = g_liqs[k].isHigh;
      bool   hit = hi ? h[i] > p : l[i] < p;
      if(!hit)
         continue;
      if(InpShowSweep && hi && c[i] < p)
        {
         g_sweepHi[i] = h[i];
         g_sweepNow   = true;
        }
      if(InpShowSweep && !hi && c[i] > p)
        {
         g_sweepLo[i] = l[i];
         g_sweepNow   = true;
        }
      RemoveLiq(k);
     }

//--- C) Vie des zones
   for(int k = ArraySize(g_zones) - 1; k >= 0; k--)
     {
      bool bull    = g_zones[k].dir == 1;
      bool invalid = bull ? c[i] < g_zones[k].bottom : c[i] > g_zones[k].top;
      bool inZone  = bull ? l[i] <= g_zones[k].top : h[i] >= g_zones[k].bottom;
      bool kill    = false;
      bool justOn  = false;
      if(invalid)
         kill = true;
      else
        {
         if(!g_zones[k].active)
           {
            if(i - g_zones[k].created > InpExpiry)
               kill = true;
            else
               if(g_zones[k].idmBar < 0)
                  kill = inZone;   // retour dans la zone sans inducement : rejetée
               else
                  if(bull ? l[i] < g_zones[k].idm : h[i] > g_zones[k].idm)
                    {
                     ActivateZone(k, i, t);
                     justOn = true;
                     g_newZones++;
                    }
           }
         if(g_zones[k].active && inZone && !g_zones[k].touched)
           {
            g_zones[k].touched = true;
            if(InpDelTouched && !justOn)
               kill = true;
            else
               DrawZone(g_zones[k], i, t, InpFillAlpha * 0.55);
           }
        }
      if(kill)
         RemoveZone(k);
     }
   EnforceCap(1);
   EnforceCap(-1);

//--- D) Inducement : premier repli interne après la cassure
   if(i >= 2 * InpIdmLen)
     {
      int  p   = i - InpIdmLen;
      bool isH = IsPivotHigh(h, p, InpIdmLen);
      bool isL = IsPivotLow(l, p, InpIdmLen);
      if(isH || isL)
         for(int k = 0; k < ArraySize(g_zones); k++)
           {
            if(g_zones[k].active || g_zones[k].idmBar >= 0 || p <= g_zones[k].created)
               continue;
            if(g_zones[k].dir == 1 && isL && l[p] > g_zones[k].top)
              {
               g_zones[k].idm    = l[p];
               g_zones[k].idmBar = p;
              }
            else
               if(g_zones[k].dir == -1 && isH && h[p] < g_zones[k].bottom)
                 {
                  g_zones[k].idm    = h[p];
                  g_zones[k].idmBar = p;
                 }
           }
     }

//--- E) Nouveaux swings de structure (= niveaux de liquidité)
   if(i >= 2 * InpSwingLen)
     {
      int p = i - InpSwingLen;
      if(IsPivotHigh(h, p, InpSwingLen))
        {
         g_shPrice = h[p];
         g_shBar   = p;
         g_shLive  = true;
         AddLiq(h[p], p, true, i, t);
        }
      if(IsPivotLow(l, p, InpSwingLen))
        {
         g_slPrice = l[p];
         g_slBar   = p;
         g_slLive  = true;
         AddLiq(l[p], p, false, i, t);
        }
     }

//--- F) BOS / CHoCH
   double upSrc = InpCloseBreak ? c[i] : h[i];
   double dnSrc = InpCloseBreak ? c[i] : l[i];
   if(g_shLive && upSrc > g_shPrice)
     {
      g_shLive = false;
      string tag = g_trend == -1 ? "CHoCH" : "BOS";
      g_trend   = 1;
      g_lastTag = tag;
      DrawStruct(g_shBar, i, g_shPrice, tag, 1, t);
      if(i - g_shBar <= InpMaxLeg)
        {
         int    o   = g_shBar;
         double ext = l[g_shBar];
         for(int k = g_shBar; k <= i; k++)
            if(l[k] <= ext)
              {
               ext = l[k];
               o   = k;
              }
         double top = h[o];
         for(int k = o; k <= i; k++)
            top = MathMax(top, h[k]);
         g_rStart = o;
         g_rBot   = ext;
         g_rTop   = top;
         CreateZones(1, o, i, op, h, l, c);
        }
     }
   else
      if(g_slLive && dnSrc < g_slPrice)
        {
         g_slLive = false;
         string tag = g_trend == 1 ? "CHoCH" : "BOS";
         g_trend   = -1;
         g_lastTag = tag;
         DrawStruct(g_slBar, i, g_slPrice, tag, -1, t);
         if(i - g_slBar <= InpMaxLeg)
           {
            int    o   = g_slBar;
            double ext = h[g_slBar];
            for(int k = g_slBar; k <= i; k++)
               if(h[k] >= ext)
                 {
                  ext = h[k];
                  o   = k;
                 }
            double bot = l[o];
            for(int k = o; k <= i; k++)
               bot = MathMin(bot, l[k]);
            g_rStart = o;
            g_rTop   = ext;
            g_rBot   = bot;
            CreateZones(-1, o, i, op, h, l, c);
           }
        }
  }

//+------------------------------------------------------------------+
//| Affichage sur la dernière bougie                                 |
//+------------------------------------------------------------------+
void Refresh(int last, const double &c[], const datetime &t[])
  {
   for(int k = 0; k < ArraySize(g_zones); k++)
      if(g_zones[k].active)
         ObjectSetInteger(0, Nm("Z", g_zones[k].id), OBJPROP_TIME, 1, Future(t, last, InpExtBars));
   for(int k = 0; k < ArraySize(g_liqs); k++)
      DrawLiq(g_liqs[k], last, t);

//--- Premium / Discount : la moitié utile selon la tendance est en trait plein
   if(InpShowPD && g_rStart >= 0)
     {
      double   eq = (g_rTop + g_rBot) / 2.0;
      datetime x1 = t[g_rStart];
      datetime x2 = Future(t, last, InpExtBars);
      Rect(PFX + "PD_P", x1, g_rTop, x2, eq, InpPremCol, false, g_trend == -1 ? STYLE_SOLID : STYLE_DOT);
      Rect(PFX + "PD_D", x1, eq, x2, g_rBot, InpDiscCol, false, g_trend == 1 ? STYLE_SOLID : STYLE_DOT);
      Line(PFX + "PD_E", x1, eq, x2, eq, InpLiqCol, STYLE_DOT);
      Text(PFX + "PD_PT", x1, g_rTop, "Premium", InpPremCol, ANCHOR_LEFT_LOWER);
      Text(PFX + "PD_DT", x1, g_rBot, "Discount", InpDiscCol, ANCHOR_LEFT_UPPER);
     }

//--- Panneau de tendance
   if(InpShowPanel)
     {
      string tTxt  = g_trend == 1 ? "HAUSSIERE" : (g_trend == -1 ? "BAISSIERE" : "INDEFINIE");
      color  tCol  = g_trend == 1 ? InpBullCol : (g_trend == -1 ? InpBearCol : InpLiqCol);
      string where = g_rStart < 0 ? "-" : (c[last] > (g_rTop + g_rBot) / 2.0 ? "Premium" : "Discount");
      string lines[2];
      lines[0] = "KossWin2 · Tendance " + tTxt + " (" + g_lastTag + ")";
      lines[1] = "Prix en zone " + where;
      for(int k = 0; k < 2; k++)
        {
         string n = PFX + "PANEL" + IntegerToString(k);
         if(ObjectFind(0, n) < 0)
            ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
         ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_RIGHT_UPPER);
         ObjectSetInteger(0, n, OBJPROP_ANCHOR, ANCHOR_RIGHT_UPPER);
         ObjectSetInteger(0, n, OBJPROP_XDISTANCE, 10);
         ObjectSetInteger(0, n, OBJPROP_YDISTANCE, 20 + 16 * k);
         ObjectSetString(0, n, OBJPROP_TEXT, lines[k]);
         ObjectSetString(0, n, OBJPROP_FONT, "Arial");
         ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 9);
         ObjectSetInteger(0, n, OBJPROP_COLOR, k == 0 ? tCol : InpLiqCol);
         ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
         ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
        }
     }
  }

//+------------------------------------------------------------------+
void ResetAll()
  {
   ObjectsDeleteAll(0, PFX);
   ArrayResize(g_zones, 0);
   ArrayResize(g_liqs, 0);
   ArrayResize(g_struct, 0);
   g_uid     = 0;
   g_last    = -1;
   g_shPrice = 0.0;
   g_slPrice = 0.0;
   g_shBar   = -1;
   g_slBar   = -1;
   g_shLive  = false;
   g_slLive  = false;
   g_trend   = 0;
   g_lastTag = "-";
   g_rStart  = -1;
   g_rTop    = 0.0;
   g_rBot    = 0.0;
  }

// ATR 14 de Wilder (même calcul que ta.atr de TradingView).
void ComputeAtr(int i, const double &h[], const double &l[], const double &c[])
  {
   const int per = 14;
   double tr = i == 0 ? h[i] - l[i] : MathMax(h[i] - l[i], MathMax(MathAbs(h[i] - c[i - 1]), MathAbs(l[i] - c[i - 1])));
   if(i < per - 1)
      g_atr[i] = 0.0;
   else
      if(i == per - 1)
        {
         double s = 0.0;
         for(int k = 0; k < per; k++)
            s += k == 0 ? h[k] - l[k] : MathMax(h[k] - l[k], MathMax(MathAbs(h[k] - c[k - 1]), MathAbs(l[k] - c[k - 1])));
         g_atr[i] = s / per;
        }
      else
         g_atr[i] = (g_atr[i - 1] * (per - 1) + tr) / per;
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   SetIndexBuffer(0, g_sweepHi, INDICATOR_DATA);
   SetIndexBuffer(1, g_sweepLo, INDICATOR_DATA);
   SetIndexBuffer(2, g_atr, INDICATOR_CALCULATIONS);
   ArraySetAsSeries(g_sweepHi, false);
   ArraySetAsSeries(g_sweepLo, false);
   ArraySetAsSeries(g_atr, false);
   PlotIndexSetInteger(0, PLOT_ARROW, 159);
   PlotIndexSetInteger(1, PLOT_ARROW, 159);
   PlotIndexSetInteger(0, PLOT_ARROW_SHIFT, -12);
   PlotIndexSetInteger(1, PLOT_ARROW_SHIFT, 12);
   PlotIndexSetDouble(0, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   PlotIndexSetDouble(1, PLOT_EMPTY_VALUE, EMPTY_VALUE);
   IndicatorSetString(INDICATOR_SHORTNAME, "KossWin2");
   ResetAll();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0, PFX);
   ChartRedraw();
  }

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
   ArraySetAsSeries(time, false);
   ArraySetAsSeries(open, false);
   ArraySetAsSeries(high, false);
   ArraySetAsSeries(low, false);
   ArraySetAsSeries(close, false);
   if(rates_total < 2 * InpSwingLen + 20)
      return 0;

   if(prev_calculated == 0)
     {
      ResetAll();
      ArrayInitialize(g_sweepHi, EMPTY_VALUE);
      ArrayInitialize(g_sweepLo, EMPTY_VALUE);
     }

//--- Uniquement les bougies clôturées : aucun repaint
   int lastClosed = rates_total - 2;
   g_newZones = 0;
   g_sweepNow = false;
   for(int i = g_last + 1; i <= lastClosed; i++)
     {
      ComputeAtr(i, high, low, close);
      g_sweepHi[i] = EMPTY_VALUE;
      g_sweepLo[i] = EMPTY_VALUE;
      ProcessBar(i, time, open, high, low, close);
      g_last = i;
     }
   ComputeAtr(rates_total - 1, high, low, close);
   g_sweepHi[rates_total - 1] = EMPTY_VALUE;
   g_sweepLo[rates_total - 1] = EMPTY_VALUE;

   if(InpAlerts && prev_calculated > 0)
     {
      if(g_newZones > 0)
         Alert("KossWin2 : ", g_newZones, " zone(s) validée(s) par inducement — ", _Symbol, " ", EnumToString(_Period));
      if(g_sweepNow)
         Alert("KossWin2 : sweep de liquidité — ", _Symbol, " ", EnumToString(_Period));
     }

   Refresh(rates_total - 1, close, time);
   ChartRedraw();
   return rates_total;
  }
//+------------------------------------------------------------------+
