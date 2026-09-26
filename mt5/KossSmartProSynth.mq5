//+------------------------------------------------------------------+
//|                                            KossSmartProSynth.mq5 |
//|  Koss Smart Pro (Liquidité → MSS → FVG) pour MetaTrader 5,       |
//|  adapté aux indices synthétiques :                               |
//|     Weltrade : GainX / PainX       Deriv : Boom / Crash          |
//|                                                                  |
//|  Modèle : biais HTF + premium/discount → sweep d'une liquidité   |
//|  → MSS (CHoCH/BOS interne) → FVG du déplacement → entrée au      |
//|  retour dans le FVG → TP1 1R (50 % + stop à l'entrée) → TP2 sur  |
//|  la liquidité opposée.                                           |
//|                                                                  |
//|  Adaptations synthétiques :                                      |
//|   - AUCUNE session / killzone (marchés ouverts 24 h/24, 7 j/7).  |
//|   - Range asiatique remplacé par la bougie H4 précédente.        |
//|   - Famille détectée (Boom / GainX = pics vers le haut ;         |
//|     Crash / PainX = pics vers le bas) → sens autorisé = sens de  |
//|     la dérive, contre les pics.                                  |
//|   - Pics : FVG créés par un pic ignorés, pause après un pic,     |
//|     déplacement minimal en ATR.                                  |
//|   - Limites journalières (trades et perte max.) à la place des   |
//|     killzones.                                                   |
//|   - Entrée « virtuelle » au toucher (ordre au marché quand le    |
//|     prix revient dans la zone) + mode contrôle (trades inversés).|
//|                                                                  |
//|  AVERTISSEMENT : ces indices sont générés par un générateur de   |
//|  nombres aléatoires. Aucune garantie de gain. DÉMO D'ABORD.      |
//+------------------------------------------------------------------+
#property copyright   "Koss Smart"
#property version     "1.00"
#property description "Koss Smart Pro pour GainX / PainX (Weltrade) et Boom / Crash (Deriv). Démo d'abord."

#include <Trade\Trade.mqh>

//--- Listes de choix (le commentaire = texte affiché dans les paramètres)
enum ENUM_KSP_FAMILY
  {
   KFAM_AUTO   = 0, // Auto (selon le nom du symbole)
   KFAM_UP     = 1, // Pics vers le HAUT (Boom, GainX)
   KFAM_DOWN   = 2, // Pics vers le BAS (Crash, PainX)
   KFAM_OTHER  = 3  // Autre (Volatility, Jump, forex...)
  };
enum ENUM_KSP_DIR
  {
   KDIR_AUTO  = 0, // Auto (pics haut = ventes, pics bas = achats)
   KDIR_BOTH  = 1, // Achats et ventes
   KDIR_LONG  = 2, // Achats seulement
   KDIR_SHORT = 3  // Ventes seulement
  };
enum ENUM_KSP_ZONE
  {
   KZONE_FVG  = 0, // FVG
   KZONE_OB   = 1, // Order Block
   KZONE_BOTH = 2  // FVG + OB réunis
  };
enum ENUM_KSP_ENTRY
  {
   KENT_CE   = 0, // Milieu de la zone (CE, 50 %)
   KENT_EDGE = 1  // Bord de la zone (premier contact)
  };

//--- Paramètres
input group "1. Biais (timeframe supérieur)"
input ENUM_TIMEFRAMES InpHtf     = PERIOD_H1; // Timeframe du biais (M1-M5 → H1 ; M15 → H4)
input int             InpHtfLen  = 5;         // Longueur du swing HTF
input bool            InpUseBias = true;      // Trader seulement dans le sens du biais HTF
input bool            InpUsePD   = true;      // Achats en discount / ventes en premium

input group "2. Liquidité"
input bool   InpUsePDHL  = true;   // Plus haut / plus bas de la veille (PDH / PDL)
input bool   InpUseH4    = true;   // Plus haut / plus bas de la bougie H4 précédente (remplace le range asiatique)
input bool   InpUseSwing = true;   // Sommets / creux récents (BSL / SSL, EQH / EQL)
input int    InpLiqLen   = 5;      // Longueur des swings de liquidité
input double InpEqTol    = 0.1;    // Tolérance EQH / EQL (x ATR)

input group "3. Déclencheur"
input int            InpMssLen   = 3;         // Longueur des swings internes (MSS)
input int            InpSweepWin = 20;        // Délai max. sweep → MSS (bougies)
input ENUM_KSP_ZONE  InpZone     = KZONE_FVG; // Zone d'entrée
input ENUM_KSP_ENTRY InpEntry    = KENT_CE;   // Prix d'entrée
input int            InpEntryExp = 20;        // Expiration de l'ordre (bougies)
input double         InpSlAtr    = 0.1;       // Marge du stop au-delà du sweep (x ATR 14)
input double         InpMinDisp  = 1.0;       // Déplacement minimal sweep → MSS (x ATR 14)

input group "4. Indices synthétiques (pics)"
input ENUM_KSP_FAMILY InpFamily    = KFAM_AUTO; // Famille d'indice
input ENUM_KSP_DIR    InpDir       = KDIR_AUTO; // Sens autorisé
input double          InpSpikeMult = 3.0;       // Seuil de pic (x ATR 14)
input bool            InpNoSpikeFvg= true;      // Ignorer les FVG créés par un pic
input int             InpCooldown  = 5;         // Pause après un pic (bougies, 0 = off)

input group "5. Objectifs"
input double InpTp1R     = 1.0;   // TP1 (en R)
input int    InpPartPct  = 50;    // Part fermée à TP1 (%)
input bool   InpMoveBE   = true;  // Stop au prix d'entrée après TP1
input double InpMinRoom  = 1.5;   // Espace min. jusqu'à la liquidité opposée (en R)
input double InpFallbackR= 2.0;   // TP2 si aucune liquidité opposée (en R)
input int    InpMaxBars  = 0;     // Durée max. d'un trade (bougies, 0 = sans limite)

input group "6. Risque et limites journalières (remplacent les killzones)"
input double InpRiskPct   = 0.5;  // Risque par trade (% du solde)
input double InpMaxLots   = 0;    // Taille max. (lots, 0 = limite du courtier)
input bool   InpAllowMin  = false;// Si taille < lot minimal : trader le lot minimal (risque plus élevé)
input int    InpMaxDay    = 3;    // Trades max. par jour
input double InpMaxLossDay= 2.0;  // Perte max. par jour (% du solde du début de journée)
input int    InpMaxSpread = 0;    // Spread max. (points, 0 = pas de limite)

input group "7. Divers"
input bool   InpControl  = false;  // MODE CONTRÔLE : inverser tous les trades
input bool   InpTrade    = true;   // Passer les ordres (false = signaux seulement)
input bool   InpDraw     = true;   // Dessiner liquidité / sweep / MSS / zone
input bool   InpAlerts   = true;   // Alertes à l'écran
input bool   InpPush     = false;  // Notifications sur le téléphone
input ulong  InpMagic    = 270926; // Numéro magique
input int    InpDeviation= 50;     // Glissement toléré (points)

#define KS_BULL clrSeaGreen
#define KS_BEAR clrCrimson
#define KS_NEUT clrGray
#define KS_PFX  "KSP_"
#define KS_WARM 500

//--- Niveau de liquidité
struct KsPool
  {
   int      id;
   double   price;
   int      side;    // 1 = au-dessus (BSL), -1 = en dessous (SSL)
   string   name;
   bool     swing;
   datetime t;
  };

//--- Ordre virtuel en attente (entrée au toucher)
struct KsPending
  {
   bool     active;
   int      id;
   int      dir;     // 1 achat, -1 vente (sens du setup)
   double   entry;
   double   sl;
   double   risk;
   double   tp1;
   double   tp2;
   datetime born;
  };

CTrade    trade;
int       atrHandle = INVALID_HANDLE;
MqlRates  R[];
double    A[];
int       RN = 0;
datetime  lastBarTime = 0;
bool      warmedUp = false;

KsPool    P[];
int       poolSeq = 0;
KsPending pend;
int       setupSeq = 0;

double    bSwX = 0, sSwX = 0;           // sweeps en attente (0 = aucun)
datetime  bSwT = 0, sSwT = 0;
string    bSwNm = "", sSwNm = "";
double    iHi = 0, iLo = 0;             // structure interne
datetime  iHiT = 0, iLoT = 0;
bool      iHiUsed = true, iLoUsed = true;
int       iTrend = 0;
double    lastLiqH = 0, lastLiqL = 0;
datetime  lastSpikeT = 0;

int       family = KFAM_OTHER;
int       dirEff = KDIR_BOTH;
string    status = "Recherche d'un sweep de liquidité";

//--- Gestion du trade en cours
double    tp1Level = 0, halfVol = 0;
bool      tp1Done = false;

//+------------------------------------------------------------------+
double   H(int i) { return R[i].high;  }
double   L(int i) { return R[i].low;   }
double   O(int i) { return R[i].open;  }
double   C(int i) { return R[i].close; }
datetime T(int i) { return R[i].time;  }
bool     Ok(int i){ return i >= 0 && i < RN; }
int      ShiftOf(datetime t) { return iBarShift(_Symbol, PERIOD_CURRENT, t, false); }
bool     IsSpike(int i) { return Ok(i + 1) && A[i + 1] > 0 && (H(i) - L(i)) > InpSpikeMult * A[i + 1]; }

//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpMssLen < 1 || InpLiqLen < 2 || InpSweepWin < 3 || InpEntryExp < 1)
      return(INIT_PARAMETERS_INCORRECT);
   atrHandle = iATR(_Symbol, PERIOD_CURRENT, 14);
   if(atrHandle == INVALID_HANDLE)
      return(INIT_FAILED);
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviation);
   trade.SetTypeFillingBySymbol(_Symbol);

   //--- Famille : Boom / GainX = pics vers le haut ; Crash / PainX = pics vers le bas
   family = (int)InpFamily;
   if(InpFamily == KFAM_AUTO)
     {
      string up = _Symbol;
      StringToUpper(up);
      if(StringFind(up, "BOOM") >= 0 || StringFind(up, "GAINX") >= 0 || StringFind(up, "GAIN X") >= 0)
         family = KFAM_UP;
      else if(StringFind(up, "CRASH") >= 0 || StringFind(up, "PAINX") >= 0 || StringFind(up, "PAIN X") >= 0)
         family = KFAM_DOWN;
      else
         family = KFAM_OTHER;
     }
   dirEff = (int)InpDir;
   if(InpDir == KDIR_AUTO)
      dirEff = (family == KFAM_UP) ? KDIR_SHORT : (family == KFAM_DOWN) ? KDIR_LONG : KDIR_BOTH;
   ZeroMemory(pend);
   PrintFormat("Koss Smart Pro Synth sur %s : %s, %s%s", _Symbol, FamilyName(), DirName(),
               InpControl ? ", MODE CONTRÔLE" : "");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0, KS_PFX);
   Comment("");
   if(atrHandle != INVALID_HANDLE)
      IndicatorRelease(atrHandle);
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   ManageTrade();
   ManagePendingTick();

   datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(t0 == 0 || t0 == lastBarTime)
      return;
   int base = 120 + InpSweepWin + 2 * (InpLiqLen + InpMssLen);
   if(!LoadData(warmedUp ? base : base + KS_WARM))
      return;
   lastBarTime = t0;

   if(!warmedUp)
     {
      //--- Préchauffage : on rejoue l'historique récent SANS trader
      int first = MathMin(KS_WARM, RN - base);
      for(int s = first; s >= 2; s--)
         ProcessBar(s, false);
      warmedUp = true;
     }
   ProcessBar(1, true);
   ShowPanel();
  }

bool LoadData(int count)
  {
   ArraySetAsSeries(R, true);
   ArraySetAsSeries(A, true);
   int n1 = CopyRates(_Symbol, PERIOD_CURRENT, 0, count, R);
   int n2 = CopyBuffer(atrHandle, 0, 0, count, A);
   if(n1 < 100 || n2 < n1)
      return(false);
   RN = n1;
   return(true);
  }

//+------------------------------------------------------------------+
//| Analyse de la bougie clôturée s (1 = temps réel)                  |
//+------------------------------------------------------------------+
void ProcessBar(int s, bool live)
  {
   if(!Ok(s + InpSweepWin + 2 * InpLiqLen + 5))
      return;

   //--- 1. Pics
   if(IsSpike(s))
      lastSpikeT = T(s);

   //--- 2. Nouveaux niveaux de liquidité
   MqlDateTime d0, d1;
   TimeToStruct(T(s), d0);
   TimeToStruct(T(s + 1), d1);
   if(InpUsePDHL && d0.day != d1.day)
     {
      int sh = iBarShift(_Symbol, PERIOD_D1, T(s), false) + 1;
      double ph = iHigh(_Symbol, PERIOD_D1, sh), pl = iLow(_Symbol, PERIOD_D1, sh);
      if(ph > 0 && pl > 0)
        {
         AddPool(ph, 1, "PDH", false, T(s));
         AddPool(pl, -1, "PDL", false, T(s));
        }
     }
   if(InpUseH4)
     {
      int h0 = iBarShift(_Symbol, PERIOD_H4, T(s), false);
      int h1 = iBarShift(_Symbol, PERIOD_H4, T(s + 1), false);
      if(h0 != h1 && PeriodSeconds(PERIOD_CURRENT) < PeriodSeconds(PERIOD_H4))
        {
         double hh = iHigh(_Symbol, PERIOD_H4, h0 + 1), hl = iLow(_Symbol, PERIOD_H4, h0 + 1);
         if(hh > 0 && hl > 0)
           {
            AddPool(hh, 1, "H4 H", false, T(s));
            AddPool(hl, -1, "H4 L", false, T(s));
           }
        }
     }
   if(InpUseSwing)
     {
      int p = s + InpLiqLen;
      if(IsPivot(p, InpLiqLen, true))
        {
         bool eq = lastLiqH > 0 && MathAbs(H(p) - lastLiqH) <= InpEqTol * A[s];
         AddPool(eq ? MathMax(H(p), lastLiqH) : H(p), 1, eq ? "EQH" : "BSL", true, T(p));
         lastLiqH = H(p);
        }
      if(IsPivot(p, InpLiqLen, false))
        {
         bool eq = lastLiqL > 0 && MathAbs(L(p) - lastLiqL) <= InpEqTol * A[s];
         AddPool(eq ? MathMin(L(p), lastLiqL) : L(p), -1, eq ? "EQL" : "SSL", true, T(p));
         lastLiqL = L(p);
        }
     }

   //--- 3. Sweeps en attente : expiration, annulation, extrême
   if(bSwX > 0)
     {
      if(C(s) < bSwX || ShiftOf(bSwT) - s > InpSweepWin) bSwX = 0;
      else if(L(s) < bSwX) bSwX = L(s);
     }
   if(sSwX > 0)
     {
      if(C(s) > sSwX || ShiftOf(sSwT) - s > InpSweepWin) sSwX = 0;
      else if(H(s) > sSwX) sSwX = H(s);
     }

   //--- 4. Prise de liquidité : mèche au-delà + clôture en retour = SWEEP
   for(int i = ArraySize(P) - 1; i >= 0; i--)
     {
      if(P[i].side == -1 && L(s) < P[i].price)
        {
         if(C(s) > P[i].price)
           {
            bSwX = (bSwX > 0) ? MathMin(bSwX, L(s)) : L(s);
            bSwT = T(s);
            bSwNm = P[i].name;
           }
         RemovePool(i);
        }
      else if(P[i].side == 1 && H(s) > P[i].price)
        {
         if(C(s) < P[i].price)
           {
            sSwX = (sSwX > 0) ? MathMax(sSwX, H(s)) : H(s);
            sSwT = T(s);
            sSwNm = P[i].name;
           }
         RemovePool(i);
        }
      else if(InpDraw && live)
        {
         string pf = KS_PFX + "P" + IntegerToString(P[i].id) + "_";
         ObjectMove(0, pf + "L", 1, T(s), P[i].price);
         ObjectMove(0, pf + "T", 0, T(s), P[i].price);
        }
     }

   //--- 5. Ordre virtuel : expiration / invalidation à la clôture
   //       (en préchauffage, un toucher consomme l'ordre sans trader)
   if(pend.active)
     {
      bool touched = pend.dir == 1 ? L(s) <= pend.entry : H(s) >= pend.entry;
      bool gone    = pend.dir == 1 ? (H(s) >= pend.tp1 || L(s) <= pend.sl) : (L(s) <= pend.tp1 || H(s) >= pend.sl);
      bool expired = ShiftOf(pend.born) - s >= InpEntryExp;
      if(expired || (!live && (touched || gone)) || (live && gone && !touched))
         CancelPending(expired ? "expiré" : "invalidé");
     }

   //--- 6. Structure interne : MSS
   int q = s + InpMssLen;
   if(IsPivot(q, InpMssLen, true))  { iHi = H(q); iHiT = T(q); iHiUsed = false; }
   if(IsPivot(q, InpMssLen, false)) { iLo = L(q); iLoT = T(q); iLoUsed = false; }
   bool busy = HasPosition();
   if(!iHiUsed && iHi > 0 && C(s) > iHi)
     {
      iHiUsed = true;
      string txt = iTrend == -1 ? "CHoCH" : "BOS";
      iTrend = 1;
      if(bSwX > 0 && !busy)
        {
         TrySetup(s, 1, bSwX, bSwT, bSwNm, iHi, iHiT, txt, live);
         bSwX = 0;
        }
     }
   if(!iLoUsed && iLo > 0 && C(s) < iLo)
     {
      iLoUsed = true;
      string txt = iTrend == 1 ? "CHoCH" : "BOS";
      iTrend = -1;
      if(sSwX > 0 && !busy)
        {
         TrySetup(s, -1, sSwX, sSwT, sSwNm, iLo, iLoT, txt, live);
         sSwX = 0;
        }
     }

   //--- 7. État pour le panneau
   if(HasPosition())      status = "En position";
   else if(pend.active)   status = StringFormat("Ordre en attente %s à %s", pend.dir == 1 ? "ACHAT" : "VENTE", DoubleToString(pend.entry, _Digits));
   else if(bSwX > 0)      status = "Sweep " + bSwNm + " → attente MSS haussier";
   else if(sSwX > 0)      status = "Sweep " + sSwNm + " → attente MSS baissier";
   else                   status = "Recherche d'un sweep de liquidité";
  }

//+------------------------------------------------------------------+
bool IsPivot(int p, int len, bool high)
  {
   if(p - len < 1 || !Ok(p + len))
      return(false);
   for(int k = 1; k <= len; k++)
     {
      if(high  && (H(p) <= H(p - k) || H(p) < H(p + k))) return(false);
      if(!high && (L(p) >= L(p - k) || L(p) > L(p + k))) return(false);
     }
   return(true);
  }

//+------------------------------------------------------------------+
//| Construction d'un setup après un MSS qui suit un sweep            |
//+------------------------------------------------------------------+
void TrySetup(int s, int d, double swX, datetime swT, string swNm, double mssPx, datetime mssT, string mssTxt, bool live)
  {
   int span = MathMin(ShiftOf(swT) - s, InpSweepWin + 5);
   if(span < 2 || !Ok(s + span + 2))
      return;

   //--- Déplacement minimal (le mouvement doit être franc)
   double ext = d == 1 ? H(s) : L(s);
   for(int o = 0; o <= span; o++)
      ext = d == 1 ? MathMax(ext, H(s + o)) : MathMin(ext, L(s + o));
   if(MathAbs(ext - swX) < InpMinDisp * A[s])
      return;

   //--- FVG le plus récent laissé par le déplacement (pas créé par un pic)
   int fvgOff = -1;
   for(int o = 0; o <= span - 2; o++)
     {
      bool gap = d == 1 ? (L(s + o) > H(s + o + 2) && H(s + o + 2) > swX)
                        : (H(s + o) < L(s + o + 2) && L(s + o + 2) < swX);
      if(!gap) continue;
      if(InpNoSpikeFvg && IsSpike(s + o + 1)) continue;
      fvgOff = o;
      break;
     }
   if(fvgOff < 0)
      return;
   double fT = d == 1 ? L(s + fvgOff) : L(s + fvgOff + 2);
   double fB = d == 1 ? H(s + fvgOff + 2) : H(s + fvgOff);
   //--- OB = dernière bougie opposée avant le déplacement
   int obOff = span;
   for(int o = fvgOff + 2; o <= span; o++)
      if(d == 1 ? C(s + o) < O(s + o) : C(s + o) > O(s + o)) { obOff = o; break; }
   double oT = H(s + obOff), oB = L(s + obOff);
   double zT = InpZone == KZONE_FVG ? fT : InpZone == KZONE_OB ? oT : MathMax(fT, oT);
   double zB = InpZone == KZONE_FVG ? fB : InpZone == KZONE_OB ? oB : MathMin(fB, oB);
   datetime zStart = T(s + (InpZone == KZONE_FVG ? fvgOff + 2 : obOff));

   double entry = InpEntry == KENT_CE ? (zT + zB) / 2.0 : (d == 1 ? zT : zB);
   double sl    = d == 1 ? swX - InpSlAtr * A[s] : swX + InpSlAtr * A[s];
   double risk  = MathAbs(entry - sl);
   if(risk <= 0 || (d == 1 ? !(entry < C(s) && entry > sl) : !(entry > C(s) && entry < sl)))
      return;

   //--- Liquidité opposée la plus proche = TP2 ; assez de place ?
   double tgt = 0;
   for(int i = 0; i < ArraySize(P); i++)
     {
      bool ahead = d == 1 ? (P[i].side == 1 && P[i].price > entry) : (P[i].side == -1 && P[i].price < entry);
      if(ahead && (tgt == 0 || MathAbs(P[i].price - entry) < MathAbs(tgt - entry)))
         tgt = P[i].price;
     }
   if(tgt != 0 && MathAbs(tgt - entry) < InpMinRoom * risk)
      return;

   //--- Filtres : sens autorisé, biais HTF, premium / discount, pause après pic
   if(!DirOk(d))
      return;
   double rHi = 0, rLo = 0;
   int htf = HtfInfo(T(s), rHi, rLo);
   bool htfValid = PeriodSeconds(InpHtf) > PeriodSeconds(PERIOD_CURRENT);
   if(InpUseBias && htfValid && htf != d)
      return;
   if(InpUsePD && htfValid && rHi > 0 && rLo > 0)
     {
      double mid = (rHi + rLo) / 2.0;
      if(d == 1 ? entry >= mid : entry <= mid)
         return;
     }
   if(InpCooldown > 0 && lastSpikeT > 0 && ShiftOf(lastSpikeT) - s <= InpCooldown)
      return;

   //--- Setup validé : ordre virtuel (remplace un ordre non déclenché)
   if(pend.active)
      CancelPending("remplacé");
   pend.active = true;
   pend.id     = ++setupSeq;
   pend.dir    = d;
   pend.entry  = entry;
   pend.sl     = sl;
   pend.risk   = risk;
   pend.tp1    = entry + d * InpTp1R * risk;
   pend.tp2    = tgt != 0 ? tgt : entry + d * InpFallbackR * risk;
   pend.born   = T(s);

   if(InpDraw)
     {
      color col = d == 1 ? KS_BULL : KS_BEAR;
      string pf = KS_PFX + "S" + IntegerToString(pend.id) + "_";
      datetime right = T(s) + InpEntryExp * PeriodSeconds();
      Rect(pf + "Z", zStart, zT, right, zB, col);
      Txt(pf + "Zt", zStart, zT, InpZone == KZONE_OB ? "OB" : "FVG", col, ANCHOR_LEFT_LOWER);
      TLine(pf + "M", mssT, mssPx, T(s), mssPx, KS_NEUT, STYLE_DOT);
      Txt(pf + "Mt", mssT, mssPx, mssTxt, col, d == 1 ? ANCHOR_LEFT_LOWER : ANCHOR_LEFT_UPPER);
      Txt(pf + "W", swT, swX, "x " + swNm, KS_NEUT, d == 1 ? ANCHOR_UPPER : ANCHOR_LOWER);
      TLine(pf + "E", T(s), entry, right, entry, KS_NEUT, STYLE_SOLID);
      TLine(pf + "SL", T(s), sl, right, sl, KS_BEAR, STYLE_DASH);
      TLine(pf + "T1", T(s), pend.tp1, right, pend.tp1, KS_BULL, STYLE_DOT);
      TLine(pf + "T2", T(s), pend.tp2, right, pend.tp2, KS_BULL, STYLE_DASH);
      CleanOldSetups(pend.id);
     }
   if(live)
      Notify(StringFormat("Koss Pro Synth : setup %s sur %s, entrée %s (sweep %s + %s)",
                          d == 1 ? "ACHAT" : "VENTE", _Symbol, DoubleToString(entry, _Digits), swNm, mssTxt));
  }

void CancelPending(string why)
  {
   if(!pend.active) return;
   pend.active = false;
   if(InpDraw)
      ObjectsDeleteAll(0, KS_PFX + "S" + IntegerToString(pend.id) + "_");
  }

//--- Ne garde que les dessins des 3 derniers setups
void CleanOldSetups(int id)
  {
   if(id > 3)
      ObjectsDeleteAll(0, KS_PFX + "S" + IntegerToString(id - 3) + "_");
  }

//+------------------------------------------------------------------+
//| Chaque tick : l'ordre virtuel est-il touché ?                     |
//+------------------------------------------------------------------+
void ManagePendingTick()
  {
   if(!pend.active || !warmedUp)
      return;
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(ask <= 0 || bid <= 0)
      return;
   //--- Parti sans nous (TP1 atteint) ou invalidé (stop atteint) avant l'entrée
   if((pend.dir == 1 && (bid >= pend.tp1 || bid <= pend.sl)) || (pend.dir == -1 && (ask <= pend.tp1 || ask >= pend.sl)))
     {
      CancelPending("invalidé");
      return;
     }
   bool touched = pend.dir == 1 ? ask <= pend.entry : bid >= pend.entry;
   if(!touched)
      return;
   KsPending p = pend;
   pend.active = false;       // un seul essai par setup
   OpenFromSetup(p);
  }

//+------------------------------------------------------------------+
//| Ouverture de la position (normale ou inversée en mode contrôle)   |
//+------------------------------------------------------------------+
void OpenFromSetup(const KsPending &p)
  {
   string msg = StringFormat("Koss Pro Synth : ENTRÉE %s sur %s à %s", p.dir == 1 ? "ACHAT" : "VENTE",
                             _Symbol, DoubleToString(p.entry, _Digits));
   Notify(msg);
   if(!InpTrade)
      return;
   if(HasPosition())
     { Print("Entrée ignorée : position déjà ouverte."); return; }
   string why = "";
   if(!DayLimitsOk(why))
     { Print("Entrée ignorée : ", why); return; }
   if(InpCooldown > 0 && lastSpikeT > 0 && ShiftOf(lastSpikeT) <= InpCooldown)
     { Print("Entrée ignorée : pic récent (pause)."); return; }
   if(InpMaxSpread > 0 && SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) > InpMaxSpread)
     { Print("Entrée ignorée : spread trop élevé."); return; }

   bool   goLong = InpControl ? (p.dir != 1) : (p.dir == 1);
   double rr2    = MathAbs(p.tp2 - p.entry) / p.risk;
   double sl  = goLong ? p.entry - p.risk          : p.entry + p.risk;
   double tp1 = goLong ? p.entry + InpTp1R * p.risk : p.entry - InpTp1R * p.risk;
   double tp2 = goLong ? p.entry + rr2 * p.risk     : p.entry - rr2 * p.risk;
   double price = goLong ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);

   if((goLong && (price <= sl || price >= tp2)) || (!goLong && (price >= sl || price <= tp2)))
     { Print("Entrée ignorée : prix déjà au-delà du stop ou de l'objectif."); return; }
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(MathAbs(price - sl) < minDist || MathAbs(tp2 - price) < minDist)
     { Print("Entrée ignorée : stop / objectif trop proche (niveau minimal du courtier)."); return; }

   double lots = LotsForRisk(goLong, price, sl);
   if(lots <= 0)
      return;
   sl  = NormalizeDouble(sl, _Digits);
   tp2 = NormalizeDouble(tp2, _Digits);
   string cmt = "KSP1 " + DoubleToString(tp1, _Digits);
   bool ok = goLong ? trade.Buy(lots, _Symbol, 0.0, sl, tp2, cmt) : trade.Sell(lots, _Symbol, 0.0, sl, tp2, cmt);
   if(!ok || (trade.ResultRetcode() != TRADE_RETCODE_DONE && trade.ResultRetcode() != TRADE_RETCODE_PLACED))
     {
      PrintFormat("Ordre refusé : code %d (%s)", (int)trade.ResultRetcode(), trade.ResultRetcodeDescription());
      return;
     }
   tp1Level = 0; halfVol = 0; tp1Done = false;
   double part = InpPartPct / 100.0;
   if(part > 0 && part < 1)
     {
      double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double v1 = MathFloor(lots * part / step) * step;
      if(v1 >= vmin && lots - v1 >= vmin) { tp1Level = NormalizeDouble(tp1, _Digits); halfVol = v1; }
      else Print("Taille trop petite pour la sortie partielle : tout sortira à TP2.");
     }
   PrintFormat("Position ouverte : %s %.3f lots, SL %s, TP2 %s, TP1 %s%s", goLong ? "achat" : "vente", lots,
               DoubleToString(sl, _Digits), DoubleToString(tp2, _Digits), DoubleToString(tp1, _Digits),
               InpControl ? " (MODE CONTRÔLE)" : "");
  }

//+------------------------------------------------------------------+
double LotsForRisk(bool goLong, double price, double sl)
  {
   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0;
   double lossPerLot = 0;
   if(!OrderCalcProfit(goLong ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, price, sl, lossPerLot) || lossPerLot >= 0)
     { Print("Perte par lot incalculable : ordre annulé."); return(0); }
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lots = MathFloor(riskMoney / MathAbs(lossPerLot) / step) * step;
   if(InpMaxLots > 0) lots = MathMin(lots, InpMaxLots);
   lots = MathMin(lots, vmax);
   if(lots < vmin)
     {
      if(!InpAllowMin)
        {
         PrintFormat("Entrée ignorée : pour %.2f %% de risque, la taille est sous le lot minimal (%.3f).", InpRiskPct, vmin);
         return(0);
        }
      PrintFormat("Lot minimal %.3f utilisé : risque réel supérieur à %.2f %%.", vmin, InpRiskPct);
      lots = vmin;
     }
   return NormalizeDouble(lots, 8);
  }

//+------------------------------------------------------------------+
//| Limites journalières (remplacent les killzones)                  |
//+------------------------------------------------------------------+
bool DayLimitsOk(string &why)
  {
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime dayStart = StructToTime(dt);
   if(!HistorySelect(dayStart, TimeCurrent() + 60))
      return(true);
   int    entries = 0;
   double pnl = 0;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
     {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol || (ulong)HistoryDealGetInteger(tk, DEAL_MAGIC) != InpMagic)
         continue;
      long e = HistoryDealGetInteger(tk, DEAL_ENTRY);
      if(e == DEAL_ENTRY_IN)
         entries++;
      pnl += HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP) + HistoryDealGetDouble(tk, DEAL_COMMISSION);
     }
   double startBal = AccountInfoDouble(ACCOUNT_BALANCE) - pnl;
   if(entries >= InpMaxDay)
     { why = StringFormat("quota du jour atteint (%d trades)", entries); return(false); }
   if(startBal > 0 && pnl <= -InpMaxLossDay / 100.0 * startBal)
     { why = StringFormat("perte max. du jour atteinte (%.2f)", pnl); return(false); }
   return(true);
  }

//+------------------------------------------------------------------+
//| Tendance HTF et dernier range (swing haut / swing bas) à la date t|
//| calculés sur les bougies HTF CLÔTURÉES avant t (pas de repaint)   |
//+------------------------------------------------------------------+
int HtfInfo(datetime t, double &rangeHi, double &rangeLo)
  {
   rangeHi = 0; rangeLo = 0;
   MqlRates hr[];
   ArraySetAsSeries(hr, true);
   int n = CopyRates(_Symbol, InpHtf, t, 300, hr);
   int len = InpHtfLen;
   if(n < 2 * len + 5)
      return(0);
   double sh = 0, sl = 0;
   int tr = 0;
   for(int i = n - 1 - len; i >= 1; i--)
     {
      int p = i + len;
      if(p + len <= n - 1)
        {
         bool ph = true, pl = true;
         for(int k = 1; k <= len; k++)
           {
            if(hr[p].high <= hr[p - k].high || hr[p].high < hr[p + k].high) ph = false;
            if(hr[p].low  >= hr[p - k].low  || hr[p].low  > hr[p + k].low)  pl = false;
           }
         if(ph) { sh = hr[p].high; rangeHi = hr[p].high; }
         if(pl) { sl = hr[p].low;  rangeLo = hr[p].low;  }
        }
      if(sh > 0 && hr[i].close > sh) { tr = 1;  sh = 0; }
      if(sl > 0 && hr[i].close < sl) { tr = -1; sl = 0; }
     }
   return(tr);
  }

bool DirOk(int d)
  {
   return dirEff == KDIR_BOTH || (dirEff == KDIR_LONG && d == 1) || (dirEff == KDIR_SHORT && d == -1);
  }

//+------------------------------------------------------------------+
//| Niveaux de liquidité                                              |
//+------------------------------------------------------------------+
void AddPool(double price, int side, string name, bool swing, datetime t)
  {
   int sameSide = 0;
   for(int i = ArraySize(P) - 1; i >= 0; i--)
     {
      bool drop = false;
      if(!swing && P[i].name == name) drop = true;
      if(swing && P[i].swing && P[i].side == side)
        {
         sameSide++;
         if(sameSide >= 2) drop = true;
        }
      if(drop) RemovePool(i);
     }
   KsPool p;
   p.id = ++poolSeq; p.price = price; p.side = side; p.name = name; p.swing = swing; p.t = t;
   int n = ArraySize(P);
   ArrayResize(P, n + 1);
   P[n] = p;
   if(InpDraw)
     {
      string pf = KS_PFX + "P" + IntegerToString(p.id) + "_";
      TLine(pf + "L", t, price, t + PeriodSeconds(), price, KS_NEUT, STYLE_DOT);
      Txt(pf + "T", t + PeriodSeconds(), price, name, KS_NEUT, ANCHOR_LEFT);
     }
  }

void RemovePool(int i)
  {
   ObjectsDeleteAll(0, KS_PFX + "P" + IntegerToString(P[i].id) + "_");
   int n = ArraySize(P);
   for(int j = i; j < n - 1; j++) P[j] = P[j + 1];
   ArrayResize(P, n - 1);
  }

//+------------------------------------------------------------------+
//| Gestion de la position : TP1 partiel, stop à l'entrée, durée max. |
//+------------------------------------------------------------------+
bool SelectMyPosition(ulong &ticket)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && (ulong)PositionGetInteger(POSITION_MAGIC) == InpMagic)
        { ticket = tk; return(true); }
     }
   return(false);
  }
bool HasPosition() { ulong tk = 0; return SelectMyPosition(tk); }

void ManageTrade()
  {
   ulong tk = 0;
   if(!SelectMyPosition(tk))
     { tp1Level = 0; halfVol = 0; tp1Done = false; return; }
   bool   isLong = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
   double openPx = PositionGetDouble(POSITION_PRICE_OPEN);
   double curSl  = PositionGetDouble(POSITION_SL);
   double curTp  = PositionGetDouble(POSITION_TP);
   double vol    = PositionGetDouble(POSITION_VOLUME);

   if(InpMaxBars > 0 && ShiftOf((datetime)PositionGetInteger(POSITION_TIME)) >= InpMaxBars)
     { trade.PositionClose(tk); Print("Position fermée : durée maximale."); return; }

   //--- Après un redémarrage : TP1 relu dans le commentaire « KSP1 prix »
   if(tp1Level == 0 && !tp1Done)
     {
      string cmt = PositionGetString(POSITION_COMMENT);
      double part = InpPartPct / 100.0;
      double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double v1 = MathFloor(vol * part / step) * step;
      if(StringFind(cmt, "KSP1 ") == 0 && part > 0 && part < 1 && v1 >= vmin && vol - v1 >= vmin)
        { tp1Level = StringToDouble(StringSubstr(cmt, 5)); halfVol = v1; }
      else
         tp1Done = true;
     }
   if(tp1Done || tp1Level <= 0 || halfVol <= 0)
      return;

   double px = isLong ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(!((isLong && px >= tp1Level) || (!isLong && px <= tp1Level)))
      return;
   bool ok;
   if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
      ok = trade.PositionClosePartial(tk, halfVol);
   else
      ok = isLong ? trade.Sell(halfVol, _Symbol, 0.0, 0.0, 0.0, "KSP TP1") : trade.Buy(halfVol, _Symbol, 0.0, 0.0, 0.0, "KSP TP1");
   if(!ok)
      return;
   tp1Done = true;
   Notify("Koss Pro Synth : TP1 atteint sur " + _Symbol);
   if(InpMoveBE && SelectMyPosition(tk))
     {
      double be = NormalizeDouble(openPx, _Digits);
      bool better = isLong ? (curSl < be) : (curSl == 0 || curSl > be);
      if(better && !trade.PositionModify(tk, be, curTp))
         PrintFormat("Stop à l'entrée impossible (code %d).", (int)trade.ResultRetcode());
     }
  }

//+------------------------------------------------------------------+
//| Statistiques de l'EA sur ce symbole (historique du compte)        |
//+------------------------------------------------------------------+
void Stats(int &closed, int &wins, double &net, double &pf)
  {
   closed = 0; wins = 0; net = 0; pf = 0;
   if(!HistorySelect(0, TimeCurrent() + 60))
      return;
   ulong  ids[];
   double res[];
   for(int i = 0; i < HistoryDealsTotal(); i++)
     {
      ulong tk = HistoryDealGetTicket(i);
      if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol || (ulong)HistoryDealGetInteger(tk, DEAL_MAGIC) != InpMagic)
         continue;
      ulong pid = (ulong)HistoryDealGetInteger(tk, DEAL_POSITION_ID);
      double v = HistoryDealGetDouble(tk, DEAL_PROFIT) + HistoryDealGetDouble(tk, DEAL_SWAP) + HistoryDealGetDouble(tk, DEAL_COMMISSION);
      int k = -1;
      for(int j = 0; j < ArraySize(ids); j++) if(ids[j] == pid) { k = j; break; }
      if(k < 0) { k = ArraySize(ids); ArrayResize(ids, k + 1); ArrayResize(res, k + 1); ids[k] = pid; res[k] = 0; }
      res[k] += v;
     }
   double gp = 0, gl = 0;
   for(int j = 0; j < ArraySize(ids); j++)
     {
      if(PositionSelectByTicket(ids[j])) continue;   // encore ouverte
      closed++;
      net += res[j];
      if(res[j] > 0) { wins++; gp += res[j]; } else gl -= res[j];
     }
   pf = gl > 0 ? gp / gl : 0;
  }

//+------------------------------------------------------------------+
//| Dessins                                                           |
//+------------------------------------------------------------------+
void Rect(string name, datetime t1, double p1, datetime t2, double p2, color c)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_FILL, false);
   ObjectSetInteger(0, name, OBJPROP_BACK, true);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }
void TLine(string name, datetime t1, double p1, datetime t2, double p2, color c, ENUM_LINE_STYLE st)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
   else { ObjectMove(0, name, 0, t1, p1); ObjectMove(0, name, 1, t2, p2); }
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_STYLE, st);
   ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
   ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }
void Txt(string name, datetime t, double p, string text, color c, ENUM_ANCHOR_POINT anchor)
  {
   if(ObjectFind(0, name) < 0) ObjectCreate(0, name, OBJ_TEXT, 0, t, p);
   else ObjectMove(0, name, 0, t, p);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//+------------------------------------------------------------------+
void Notify(string msg)
  {
   Print(msg);
   if(InpAlerts) Alert(msg);
   if(InpPush)   SendNotification(msg);
  }

string FamilyName()
  {
   return family == KFAM_UP ? "pics vers le haut (Boom / GainX)" : family == KFAM_DOWN ? "pics vers le bas (Crash / PainX)" : "autre indice";
  }
string DirName()
  {
   return dirEff == KDIR_LONG ? "achats seulement" : dirEff == KDIR_SHORT ? "ventes seulement" : "achats et ventes";
  }

void ShowPanel()
  {
   double rHi = 0, rLo = 0;
   int htf = HtfInfo(TimeCurrent(), rHi, rLo);
   string bias = htf == 1 ? "haussier" : htf == -1 ? "baissier" : "indéfini";
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   string pd = (rHi > 0 && rLo > 0) ? (bid < (rHi + rLo) / 2.0 ? "DISCOUNT" : "PREMIUM") : "–";
   string why = "";
   bool dayOk = DayLimitsOk(why);
   int closed, wins; double net, pf;
   Stats(closed, wins, net, pf);
   bool cool = InpCooldown > 0 && lastSpikeT > 0 && ShiftOf(lastSpikeT) <= InpCooldown;
   Comment(StringFormat(
      "Koss Smart Pro Synth  |  %s : %s, %s%s\n"
      "Biais %s : %s  |  Prix en %s%s\n"
      "État : %s\n"
      "Journée : %s\n"
      "Stats EA : %d trades · réussite %s · résultat %.2f · profit factor %s",
      _Symbol, FamilyName(), DirName(), InpControl ? "  |  MODE CONTRÔLE" : "",
      EnumToString(InpHtf), bias, pd, cool ? "  |  PAUSE (pic récent)" : "",
      status,
      dayOk ? "trading autorisé" : "STOP – " + why,
      closed, closed > 0 ? DoubleToString(100.0 * wins / closed, 0) + " %" : "–", net,
      pf > 0 ? DoubleToString(pf, 2) : "–"));
  }
//+------------------------------------------------------------------+
