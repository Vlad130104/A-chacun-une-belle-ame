//+------------------------------------------------------------------+
//|                                                  KossSmartEA.mq5 |
//|   Koss Smart EA : OB + FVG + BOS/CHoCH + OTE pour MetaTrader 5    |
//|   Conversion de la stratégie Pine « Koss Smart Synth ».           |
//|                                                                  |
//|   - Détection identique : swings, BOS / CHoCH, Order Block + FVG  |
//|     responsables de la cassure, zone OTE 0.62-0.79, bougie de     |
//|     réaction (mèche de rejet ou englobante), confluence OB/FVG.   |
//|   - Adaptations indices synthétiques (Deriv, Weltrade) : famille  |
//|     d'indice, sens autorisé, détection des pics, pause, impulsion |
//|     minimale, durée maximale, MODE CONTRÔLE (trades inversés).    |
//|   - Tout est calculé à la CLÔTURE de bougie (pas de repaint).     |
//|                                                                  |
//|   AVERTISSEMENT : les indices synthétiques sont générés par un    |
//|   générateur de nombres aléatoires. Testez en démo, toujours.     |
//+------------------------------------------------------------------+
#property copyright   "Koss Smart"
#property version     "1.00"
#property description "OB + FVG + BOS/CHoCH + OTE. Tester en compte démo avant tout usage réel."

#include <Trade\Trade.mqh>

//--- Listes de choix (le commentaire est le texte affiché dans les paramètres)
enum ENUM_KS_FAMILY
  {
   FAM_AUTO     = 0, // Auto (selon le nom du symbole)
   FAM_STANDARD = 1, // Standard (forex, or, Volatility, Step...)
   FAM_BOOM     = 2, // Boom (pics vers le haut)
   FAM_CRASH    = 3, // Crash (pics vers le bas)
   FAM_SPIKES   = 4  // Autres indices à pics (Jump, GainX, PainX...)
  };
enum ENUM_KS_DIR
  {
   DIR_AUTO  = 0, // Auto (Boom = ventes, Crash = achats, autres = les deux)
   DIR_BOTH  = 1, // Achats et ventes
   DIR_LONG  = 2, // Achats seulement
   DIR_SHORT = 3  // Ventes seulement
  };
enum ENUM_KS_EXIT
  {
   EXIT_TP1   = 0, // Tout à TP1 (1R)
   EXIT_TP2   = 1, // Tout à TP2 (2R)
   EXIT_SPLIT = 2  // 50 % à TP1 + 50 % à TP2
  };

//--- Paramètres
input group "1. Structure"
input int    InpSwingLen   = 5;     // Longueur du swing (bougies de chaque côté)
input bool   InpTrendOnly  = true;  // Seulement dans le sens de la tendance (BOS, pas CHoCH)
input int    InpObLook     = 10;    // Recherche de l'OB (bougies avant l'impulsion)
input int    InpMaxLeg     = 150;   // Longueur max. de la jambe (bougies)
input int    InpMaxSetups  = 1;     // Nombre de setups suivis en même temps

input group "2. OTE et confirmation"
input double InpFibA       = 0.62;  // Fibo OTE début
input double InpFibB       = 0.79;  // Fibo OTE fin
input double InpFibM       = 0.705; // Fibo OTE ligne centrale
input bool   InpReqConf    = true;  // Confluence obligatoire (OTE touche OB ou FVG)
input double InpWickRatio  = 0.5;   // Mèche de rejet min. (part de la bougie, 0.1 à 0.9)
input int    InpExpiry     = 100;   // Expiration d'un setup (bougies)

input group "3. Indices synthétiques et pics"
input ENUM_KS_FAMILY InpFamily = FAM_AUTO; // Famille d'indice
input ENUM_KS_DIR    InpDir    = DIR_AUTO; // Sens autorisé
input double InpSpikeMult  = 4.0;   // Seuil de pic (x ATR 14)
input bool   InpAntiSpike  = true;  // Ignorer les impulsions contenant un pic
input int    InpCooldown   = 10;    // Pause après un pic (bougies, 0 = off)
input double InpMinImp     = 1.5;   // Impulsion minimale (x ATR 14)

input group "4. Filtres"
input bool            InpUseHTF    = false;     // Filtre de tendance HTF
input ENUM_TIMEFRAMES InpHtf       = PERIOD_H1; // Timeframe supérieur
input int             InpHtfLen    = 5;         // Longueur du swing HTF
input bool            InpUseSess   = false;     // Filtre de session (forex / or uniquement)
input int             InpGmtOffset = 0;         // Décalage heure serveur - GMT (heures, ex. 2 ou 3)
input int             InpS1Start   = 7;         // Session 1 : début (heure GMT)
input int             InpS1End     = 10;        // Session 1 : fin (heure GMT)
input int             InpS2Start   = 12;        // Session 2 : début (heure GMT)
input int             InpS2End     = 15;        // Session 2 : fin (heure GMT)
input int             InpMaxSpread = 0;         // Spread max. (points, 0 = pas de limite)

input group "5. Gestion du risque"
input double       InpRiskPct   = 0.5;        // Risque par trade (% du solde)
input double       InpSlAtr     = 0.1;        // Marge du stop au-delà de l'OB (x ATR 14)
input ENUM_KS_EXIT InpExit      = EXIT_SPLIT; // Sortie
input bool         InpMoveBE    = true;       // Stop au prix d'entrée après TP1 (mode 50/50)
input int          InpMaxBars   = 0;          // Durée max. d'un trade (bougies, 0 = sans limite)
input double       InpMaxLots   = 0;          // Taille max. (lots, 0 = limite du courtier)
input bool         InpAllowMin  = false;      // Si taille < lot minimal : trader le lot minimal (risque plus élevé)

input group "6. Divers"
input bool   InpControl  = false;  // MODE CONTRÔLE : inverser tous les trades
input bool   InpTrade    = true;   // Passer les ordres (false = signaux seulement)
input bool   InpDraw     = true;   // Dessiner OB / FVG / OTE / BOS sur le graphique
input bool   InpAlerts   = true;   // Alertes à l'écran
input bool   InpPush     = false;  // Notifications sur le téléphone (MT5 mobile)
input ulong  InpMagic    = 260925; // Numéro magique
input int    InpDeviation= 20;     // Glissement toléré (points)

//--- Couleurs
#define KS_BULL  clrSeaGreen
#define KS_BEAR  clrCrimson
#define KS_NEUT  clrGray
#define KS_PFX   "KS_"

//--- Un setup suivi
struct KsSetup
  {
   int      id;
   int      dir;       // 1 = achat, -1 = vente
   double   hi;        // point le plus haut de la jambe
   double   lo;        // point le plus bas de la jambe
   datetime hiT;
   datetime loT;
   double   obTop;
   double   obBot;
   datetime obT;
   double   fvgTop;
   double   fvgBot;
   datetime fvgT;
   datetime born;      // bougie de la cassure
   bool     touched;   // OTE déjà touchée
   datetime touchT;
   bool     done;      // signal déjà émis
  };

//--- État global
CTrade    trade;
int       atrHandle   = INVALID_HANDLE;
MqlRates  R[];         // bougies (index 0 = bougie en cours, 1 = dernière clôturée)
double    A[];         // ATR 14 aligné sur R
int       RN          = 0;
datetime  lastBarTime = 0;
bool      warmedUp    = false;

double    swHi = 0, swLo = 0;
datetime  swHiT = 0, swLoT = 0;
bool      swHiBroken = true, swLoBroken = true;
int       trend = 0;          // 1 haussière, -1 baissière, 0 inconnue
datetime  lastSpikeT = 0;
int       setupSeq = 0;
int       structSeq = 0;
KsSetup   S[];

int       family = FAM_STANDARD;
int       dirEff = DIR_BOTH;
double    fLo = 0.62, fHi = 0.79;

//--- Suivi du trade en cours (sortie partielle virtuelle à TP1)
double    tp1Level = 0;
double    halfVol  = 0;
bool      tp1Done  = false;

//+------------------------------------------------------------------+
//| Accès aux bougies                                                 |
//+------------------------------------------------------------------+
double   H(int i) { return R[i].high;  }
double   L(int i) { return R[i].low;   }
double   O(int i) { return R[i].open;  }
double   C(int i) { return R[i].close; }
datetime T(int i) { return R[i].time;  }
bool     Ok(int i){ return i >= 0 && i < RN; }
int      ShiftOf(datetime t) { return iBarShift(_Symbol, PERIOD_CURRENT, t, false); }

//+------------------------------------------------------------------+
//| Initialisation                                                    |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(InpSwingLen < 1 || InpObLook < 1 || InpMaxLeg < 10 || InpMaxSetups < 1)
     {
      Print("Koss Smart EA : paramètres de structure invalides.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   fLo = MathMin(InpFibA, InpFibB);
   fHi = MathMax(InpFibA, InpFibB);

   atrHandle = iATR(_Symbol, PERIOD_CURRENT, 14);
   if(atrHandle == INVALID_HANDLE)
     {
      Print("Koss Smart EA : impossible de créer l'ATR.");
      return(INIT_FAILED);
     }

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviation);
   trade.SetTypeFillingBySymbol(_Symbol);

   //--- Famille d'indice
   family = (int)InpFamily;
   if(InpFamily == FAM_AUTO)
     {
      string up = _Symbol;
      StringToUpper(up);
      if(StringFind(up, "BOOM") >= 0)       family = FAM_BOOM;
      else if(StringFind(up, "CRASH") >= 0) family = FAM_CRASH;
      else if(StringFind(up, "JUMP") >= 0 || StringFind(up, "GAINX") >= 0 ||
              StringFind(up, "PAINX") >= 0 || StringFind(up, "SPIKE") >= 0)
         family = FAM_SPIKES;
      else
         family = FAM_STANDARD;
     }
   //--- Sens autorisé
   dirEff = (int)InpDir;
   if(InpDir == DIR_AUTO)
      dirEff = (family == FAM_BOOM) ? DIR_SHORT : (family == FAM_CRASH) ? DIR_LONG : DIR_BOTH;

   PrintFormat("Koss Smart EA démarré sur %s : famille = %s, sens = %s%s",
               _Symbol, FamilyName(family), DirName(dirEff), InpControl ? ", MODE CONTRÔLE" : "");
   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   ObjectsDeleteAll(0, KS_PFX);
   Comment("");
   if(atrHandle != INVALID_HANDLE)
      IndicatorRelease(atrHandle);
  }

//+------------------------------------------------------------------+
//| Chaque tick : gestion du trade ; chaque nouvelle bougie : analyse |
//+------------------------------------------------------------------+
void OnTick()
  {
   ManageTrade();

   datetime t0 = iTime(_Symbol, PERIOD_CURRENT, 0);
   if(t0 == 0 || t0 == lastBarTime)
      return;

   //--- Chargement des bougies et de l'ATR
   int need = warmedUp ? (InpMaxLeg + InpObLook + 2 * InpSwingLen + 60)
                       : (500 + InpMaxLeg + InpObLook + 2 * InpSwingLen + 60);
   if(!LoadData(need))
      return;   // données pas encore prêtes : on réessaiera au tick suivant
   lastBarTime = t0;

   if(!warmedUp)
     {
      //--- Préchauffage : on rejoue l'historique récent SANS trader,
      //    pour connaître la structure (swings, tendance) dès le départ.
      int first = MathMin(500, RN - (InpMaxLeg + InpObLook + 2 * InpSwingLen + 10));
      for(int s = first; s >= 2; s--)
         ProcessBar(s, false);
      warmedUp = true;
     }
   ProcessBar(1, true);
   ShowPanel();
  }

//+------------------------------------------------------------------+
bool LoadData(int count)
  {
   ArraySetAsSeries(R, true);
   ArraySetAsSeries(A, true);
   int n1 = CopyRates(_Symbol, PERIOD_CURRENT, 0, count, R);
   int n2 = CopyBuffer(atrHandle, 0, 0, count, A);
   if(n1 < 3 * InpSwingLen + 50 || n2 < n1)
      return(false);
   RN = n1;
   return(true);
  }

//+------------------------------------------------------------------+
//| Analyse d'une bougie clôturée « s »                               |
//| (s = 1 en temps réel ; s > 1 pendant le préchauffage)             |
//+------------------------------------------------------------------+
void ProcessBar(int s, bool live)
  {
   if(!Ok(s + 2 * InpSwingLen + 2))
      return;

   //--- Pics et pause
   if(A[s + 1] > 0 && (H(s) - L(s)) > InpSpikeMult * A[s + 1])
      lastSpikeT = T(s);
   bool pause = InpCooldown > 0 && lastSpikeT > 0 && (ShiftOf(lastSpikeT) - s) <= InpCooldown;

   //--- Nouveaux swings confirmés (pivot à s + longueur)
   int p = s + InpSwingLen;
   if(IsPivotHigh(p)) { swHi = H(p); swHiT = T(p); swHiBroken = false; }
   if(IsPivotLow(p))  { swLo = L(p); swLoT = T(p); swLoBroken = false; }

   //--- Suivi des setups existants
   for(int i = ArraySize(S) - 1; i >= 0; i--)
      UpdateSetup(i, s, live, pause);

   //--- Cassures
   if(!swHiBroken && swHiT > 0 && C(s) > swHi)
      OnBreak(s, 1);
   if(!swLoBroken && swLoT > 0 && C(s) < swLo)
      OnBreak(s, -1);
  }

//+------------------------------------------------------------------+
bool IsPivotHigh(int p)
  {
   if(!Ok(p + InpSwingLen) || p - InpSwingLen < 1)
      return(false);
   for(int k = 1; k <= InpSwingLen; k++)
      if(H(p) <= H(p - k) || H(p) < H(p + k))
         return(false);
   return(true);
  }
bool IsPivotLow(int p)
  {
   if(!Ok(p + InpSwingLen) || p - InpSwingLen < 1)
      return(false);
   for(int k = 1; k <= InpSwingLen; k++)
      if(L(p) >= L(p - k) || L(p) > L(p + k))
         return(false);
   return(true);
  }

//+------------------------------------------------------------------+
//| Cassure de structure : dir = 1 (swing high cassé) / -1            |
//+------------------------------------------------------------------+
void OnBreak(int s, int dir)
  {
   bool choch = (trend == -dir);
   trend = dir;
   datetime swT = (dir == 1) ? swHiT : swLoT;
   double   swP = (dir == 1) ? swHi  : swLo;
   if(dir == 1) swHiBroken = true; else swLoBroken = true;

   if(InpDraw)
      DrawStruct(swT, swP, T(s), dir == 1, choch);

   //--- Limites de recherche (bornées par les données chargées)
   int span = MathMin(ShiftOf(swT) - s, InpMaxLeg);
   span = MathMin(span, RN - 1 - s - InpObLook - 3);
   if(span < 2)
      return;

   double legHi = 0, legLo = 0;
   int hiOff = 0, loOff = 0, obOff = -1, fvgOff = -1;

   if(dir == 1)
     {
      //--- Départ = plus bas depuis le swing high cassé ; extrême = plus haut ensuite
      legLo = L(s);
      for(int o = 0; o <= span; o++) if(L(s + o) < legLo) { legLo = L(s + o); loOff = o; }
      legHi = H(s);
      for(int o = 0; o <= loOff; o++) if(H(s + o) > legHi) { legHi = H(s + o); hiOff = o; }
      //--- OB = dernière bougie baissière avant l'impulsion
      for(int o = loOff; o <= loOff + InpObLook; o++) if(C(s + o) < O(s + o)) { obOff = o; break; }
      //--- FVG haussier dans l'impulsion : low[k] > high[k+2]
      for(int o = loOff - 2; o >= 0; o--) if(L(s + o) > H(s + o + 2)) { fvgOff = o; break; }
     }
   else
     {
      legHi = H(s);
      for(int o = 0; o <= span; o++) if(H(s + o) > legHi) { legHi = H(s + o); hiOff = o; }
      legLo = L(s);
      for(int o = 0; o <= hiOff; o++) if(L(s + o) < legLo) { legLo = L(s + o); loOff = o; }
      for(int o = hiOff; o <= hiOff + InpObLook; o++) if(C(s + o) > O(s + o)) { obOff = o; break; }
      for(int o = hiOff - 2; o >= 0; o--) if(H(s + o) < L(s + o + 2)) { fvgOff = o; break; }
     }

   int  startOff = (dir == 1) ? loOff : hiOff;
   bool legOk = (legHi - legLo) >= InpMinImp * A[s] && !(InpAntiSpike && HasSpike(s, startOff));
   if(obOff < 0 || fvgOff < 0 || !legOk)
      return;
   if(InpTrendOnly && choch)
      return;
   if(!DirOk(dir) || !HtfOk(dir, T(s)))
      return;

   //--- Nouveau setup
   KsSetup st;
   ZeroMemory(st);
   st.id     = ++setupSeq;
   st.dir    = dir;
   st.hi     = legHi;
   st.lo     = legLo;
   st.hiT    = T(s + hiOff);
   st.loT    = T(s + loOff);
   st.obTop  = H(s + obOff);
   st.obBot  = L(s + obOff);
   st.obT    = T(s + obOff);
   if(dir == 1) { st.fvgTop = L(s + fvgOff);     st.fvgBot = H(s + fvgOff + 2); }
   else         { st.fvgTop = L(s + fvgOff + 2); st.fvgBot = H(s + fvgOff);     }
   st.fvgT   = T(s + fvgOff + 2);
   st.born   = T(s);

   int n = ArraySize(S);
   ArrayResize(S, n + 1);
   S[n] = st;
   while(ArraySize(S) > InpMaxSetups)
     {
      DeleteSetupObjects(S[0].id);
      RemoveSetup(0);
     }
  }

//+------------------------------------------------------------------+
//| Suivi d'un setup : invalidation, OTE, signal                      |
//+------------------------------------------------------------------+
void UpdateSetup(int i, int s, bool live, bool pause)
  {
   KsSetup st = S[i];
   if(st.done)
      return;
   bool bull = (st.dir == 1);

   //--- OB mitigé, jambe invalidée ou setup expiré -> suppression
   bool invalid = bull ? (C(s) < st.obBot || C(s) < st.lo) : (C(s) > st.obTop || C(s) > st.hi);
   bool expired = (ShiftOf(st.born) - s) > InpExpiry;
   if(invalid || expired)
     {
      DeleteSetupObjects(st.id);
      RemoveSetup(i);
      return;
     }

   //--- Tant que l'OTE n'est pas touchée, l'extrême peut s'étendre
   if(!st.touched)
     {
      if(bull && H(s) > st.hi)       { st.hi = H(s); st.hiT = T(s); }
      else if(!bull && L(s) < st.lo) { st.lo = L(s); st.loT = T(s); }
     }

   double top, bot, mid;
   OteLevels(st, top, bot, mid);

   bool inZone = L(s) <= top && H(s) >= bot;
   bool zoneOk = inZone || (st.touchT > 0 && (ShiftOf(st.touchT) - s) <= 1);
   bool react  = bull ? (BullPin(s) || BullEng(s)) : (BearPin(s) || BearEng(s));
   bool conf   = !InpReqConf || Overlap(top, bot, st.obTop, st.obBot) || Overlap(top, bot, st.fvgTop, st.fvgBot);

   if(zoneOk && react && conf && !pause && DirOk(st.dir) && HtfOk(st.dir, T(s)) && SessionOk(T(s)))
     {
      double entry = C(s);
      double stop  = bull ? st.obBot - InpSlAtr * A[s] : st.obTop + InpSlAtr * A[s];
      double risk  = MathAbs(entry - stop);
      if(risk > 0 && (bull ? entry > stop : entry < stop))
        {
         st.done = true;
         if(InpDraw)
            DrawArrow(st.id, bull, T(s), bull ? L(s) : H(s));
         if(live)
            OnSignal(bull, entry, stop, risk);
        }
     }
   if(inZone)
     {
      st.touched = true;
      st.touchT  = T(s);
     }
   if(InpDraw)
      DrawSetup(st, top, bot, mid, T(s));
   S[i] = st;
  }

//+------------------------------------------------------------------+
void OteLevels(const KsSetup &st, double &top, double &bot, double &mid)
  {
   double rng = st.hi - st.lo;
   if(st.dir == 1)
     {
      top = st.hi - fLo * rng;
      bot = st.hi - fHi * rng;
      mid = st.hi - InpFibM * rng;
     }
   else
     {
      top = st.lo + fHi * rng;
      bot = st.lo + fLo * rng;
      mid = st.lo + InpFibM * rng;
     }
  }

bool Overlap(double aTop, double aBot, double bTop, double bBot) { return aBot <= bTop && bBot <= aTop; }

//--- Bougies de réaction
bool BullPin(int s)
  {
   double rng = H(s) - L(s);
   return rng > 0 && (MathMin(O(s), C(s)) - L(s)) >= InpWickRatio * rng && C(s) > L(s) + 0.5 * rng;
  }
bool BearPin(int s)
  {
   double rng = H(s) - L(s);
   return rng > 0 && (H(s) - MathMax(O(s), C(s))) >= InpWickRatio * rng && C(s) < H(s) - 0.5 * rng;
  }
bool BullEng(int s) { return C(s) > O(s) && C(s + 1) < O(s + 1) && C(s) >= O(s + 1) && O(s) <= C(s + 1); }
bool BearEng(int s) { return C(s) < O(s) && C(s + 1) > O(s + 1) && C(s) <= O(s + 1) && O(s) >= C(s + 1); }

//--- Un pic est-il présent entre s et s + toOff ?
bool HasSpike(int s, int toOff)
  {
   for(int o = 0; o <= toOff; o++)
     {
      int i = s + o;
      if(!Ok(i + 1))
         break;
      if(A[i + 1] > 0 && (H(i) - L(i)) > InpSpikeMult * A[i + 1])
         return(true);
     }
   return(false);
  }

bool DirOk(int dir)
  {
   return dirEff == DIR_BOTH || (dirEff == DIR_LONG && dir == 1) || (dirEff == DIR_SHORT && dir == -1);
  }

//--- Filtre de session (heures GMT)
bool InHours(int h, int a, int b) { return (a <= b) ? (h >= a && h < b) : (h >= a || h < b); }
bool SessionOk(datetime t)
  {
   if(!InpUseSess)
      return(true);
   MqlDateTime d;
   TimeToStruct(t - InpGmtOffset * 3600, d);
   return InHours(d.hour, InpS1Start, InpS1End) || InHours(d.hour, InpS2Start, InpS2End);
  }

//+------------------------------------------------------------------+
//| Tendance HTF à la date t : cassure du dernier swing, calculée     |
//| sur les bougies HTF déjà CLÔTURÉES avant t (pas de repaint).      |
//+------------------------------------------------------------------+
int HtfTrendAt(datetime t)
  {
   MqlRates hr[];
   ArraySetAsSeries(hr, true);
   int n = CopyRates(_Symbol, InpHtf, t, 300, hr);
   int len = InpHtfLen;
   if(n < 2 * len + 5)
      return(0);
   double sh = 0, sl = 0;
   bool shOn = false, slOn = false;
   int tr = 0;
   //--- hr[0] = bougie HTF qui contient t (pas encore clôturée) : exclue
   for(int i = n - 1 - len; i >= 1; i--)
     {
      int p = i + len;   // pivot confirmé à la bougie i
      if(p + len <= n - 1)
        {
         bool ph = true, pl = true;
         for(int k = 1; k <= len; k++)
           {
            if(hr[p].high <= hr[p - k].high || hr[p].high < hr[p + k].high) ph = false;
            if(hr[p].low  >= hr[p - k].low  || hr[p].low  > hr[p + k].low)  pl = false;
           }
         if(ph) { sh = hr[p].high; shOn = true; }
         if(pl) { sl = hr[p].low;  slOn = true; }
        }
      if(shOn && hr[i].close > sh) { tr = 1;  shOn = false; }
      if(slOn && hr[i].close < sl) { tr = -1; slOn = false; }
     }
   return(tr);
  }

bool HtfOk(int dir, datetime t)
  {
   if(!InpUseHTF || PeriodSeconds(InpHtf) <= PeriodSeconds(PERIOD_CURRENT))
      return(true);
   return HtfTrendAt(t) == dir;
  }

//+------------------------------------------------------------------+
void RemoveSetup(int i)
  {
   int n = ArraySize(S);
   for(int j = i; j < n - 1; j++)
      S[j] = S[j + 1];
   ArrayResize(S, n - 1);
  }

//+------------------------------------------------------------------+
//| Signal : alerte + ordre                                           |
//+------------------------------------------------------------------+
void OnSignal(bool bull, double entry, double stop, double risk)
  {
   string msg = StringFormat("Koss Smart : %s sur %s à %s", bull ? "ACHAT" : "VENTE", _Symbol,
                             DoubleToString(entry, _Digits));
   if(InpAlerts) Alert(msg);
   if(InpPush)   SendNotification(msg);
   Print(msg);

   if(!InpTrade)
      return;
   if(HasPosition())
     {
      Print("Signal ignoré : une position est déjà ouverte.");
      return;
     }
   if(InpMaxSpread > 0)
     {
      long spr = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
      if(spr > InpMaxSpread)
        {
         PrintFormat("Signal ignoré : spread %d > %d points.", (int)spr, InpMaxSpread);
         return;
        }
     }

   //--- Mode contrôle : sens inversé, mêmes distances
   bool   goLong = InpControl ? !bull : bull;
   double sl  = goLong ? entry - risk     : entry + risk;
   double tp1 = goLong ? entry + risk     : entry - risk;
   double tp2 = goLong ? entry + 2 * risk : entry - 2 * risk;
   double tp  = (InpExit == EXIT_TP1) ? tp1 : tp2;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double price = goLong ? ask : bid;

   //--- Le prix a-t-il déjà dépassé le stop ou l'objectif depuis la clôture ?
   if((goLong && (price <= sl || price >= tp)) || (!goLong && (price >= sl || price <= tp)))
     {
      Print("Signal ignoré : le prix actuel est déjà au-delà du stop ou de l'objectif.");
      return;
     }
   //--- Distance minimale imposée par le courtier
   double minDist = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   if(MathAbs(price - sl) < minDist || MathAbs(tp - price) < minDist)
     {
      Print("Signal ignoré : stop ou objectif trop proche (niveau minimal du courtier).");
      return;
     }

   double lots = LotsForRisk(goLong, price, sl);
   if(lots <= 0)
      return;

   sl = NormalizeDouble(sl, _Digits);
   tp = NormalizeDouble(tp, _Digits);
   string cmt = "KS1 " + DoubleToString(tp1, _Digits);   // TP1 mémorisé dans le commentaire

   bool ok = goLong ? trade.Buy(lots, _Symbol, 0.0, sl, tp, cmt)
                    : trade.Sell(lots, _Symbol, 0.0, sl, tp, cmt);
   if(!ok || (trade.ResultRetcode() != TRADE_RETCODE_DONE && trade.ResultRetcode() != TRADE_RETCODE_PLACED))
     {
      PrintFormat("Ordre refusé : code %d (%s)", (int)trade.ResultRetcode(), trade.ResultRetcodeDescription());
      return;
     }

   //--- Préparation de la sortie partielle à TP1 (mode 50/50)
   tp1Level = 0;
   halfVol  = 0;
   tp1Done  = false;
   if(InpExit == EXIT_SPLIT)
     {
      double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
      double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
      double half = MathFloor(lots / 2.0 / step) * step;
      if(half >= vmin && lots - half >= vmin)
        {
         tp1Level = NormalizeDouble(tp1, _Digits);
         halfVol  = half;
        }
      else
         Print("Taille trop petite pour couper en deux : tout sortira à TP2.");
     }
   PrintFormat("Position ouverte : %s %.2f lots, SL %s, TP %s%s", goLong ? "achat" : "vente", lots,
               DoubleToString(sl, _Digits), DoubleToString(tp, _Digits),
               halfVol > 0 ? ", TP1 (50 %) " + DoubleToString(tp1Level, _Digits) : "");
  }

//+------------------------------------------------------------------+
//| Taille de position pour risquer InpRiskPct % du solde             |
//+------------------------------------------------------------------+
double LotsForRisk(bool goLong, double price, double sl)
  {
   double riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * InpRiskPct / 100.0;
   double lossPerLot = 0;
   if(!OrderCalcProfit(goLong ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, _Symbol, 1.0, price, sl, lossPerLot) || lossPerLot >= 0)
     {
      Print("Impossible de calculer la perte par lot : ordre annulé.");
      return(0);
     }
   double lots = riskMoney / MathAbs(lossPerLot);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   lots = MathFloor(lots / step) * step;
   if(InpMaxLots > 0)
      lots = MathMin(lots, InpMaxLots);
   lots = MathMin(lots, vmax);
   if(lots < vmin)
     {
      if(InpAllowMin)
        {
         PrintFormat("Taille calculée < lot minimal : lot minimal %.3f utilisé (risque réel plus élevé que %.2f %%).", vmin, InpRiskPct);
         lots = vmin;
        }
      else
        {
         PrintFormat("Signal ignoré : la taille pour %.2f %% de risque est inférieure au lot minimal (%.3f).", InpRiskPct, vmin);
         return(0);
        }
     }
   return NormalizeDouble(lots, 8);
  }

//+------------------------------------------------------------------+
//| Position de cet EA sur ce symbole                                 |
//+------------------------------------------------------------------+
bool SelectMyPosition(ulong &ticket)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && (ulong)PositionGetInteger(POSITION_MAGIC) == InpMagic)
        {
         ticket = tk;
         return(true);
        }
     }
   return(false);
  }
bool HasPosition() { ulong tk = 0; return SelectMyPosition(tk); }

//+------------------------------------------------------------------+
//| Gestion du trade à chaque tick : TP1 partiel, break-even, durée   |
//+------------------------------------------------------------------+
void ManageTrade()
  {
   ulong tk = 0;
   if(!SelectMyPosition(tk))
     {
      tp1Level = 0; halfVol = 0; tp1Done = false;
      return;
     }
   bool   isLong = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY;
   double openPx = PositionGetDouble(POSITION_PRICE_OPEN);
   double curSl  = PositionGetDouble(POSITION_SL);
   double curTp  = PositionGetDouble(POSITION_TP);
   double vol    = PositionGetDouble(POSITION_VOLUME);

   //--- Durée maximale
   if(InpMaxBars > 0)
     {
      int barsIn = ShiftOf((datetime)PositionGetInteger(POSITION_TIME));
      if(barsIn >= InpMaxBars)
        {
         trade.PositionClose(tk);
         Print("Position fermée : durée maximale atteinte.");
         return;
        }
     }

   //--- Après un redémarrage de l'EA : TP1 relu dans le commentaire
   if(InpExit == EXIT_SPLIT && tp1Level == 0 && !tp1Done)
     {
      string cmt = PositionGetString(POSITION_COMMENT);
      if(StringFind(cmt, "KS1 ") == 0)
        {
         double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
         double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
         double half = MathFloor(vol / 2.0 / step) * step;
         double lvl  = StringToDouble(StringSubstr(cmt, 4));
         if(lvl > 0 && half >= vmin && vol - half >= vmin)
           {
            tp1Level = lvl;
            halfVol  = half;
           }
         else
            tp1Done = true;   // pas de partiel possible : on n'y revient plus
        }
     }

   //--- Sortie partielle à TP1, puis stop au prix d'entrée
   if(InpExit == EXIT_SPLIT && !tp1Done && tp1Level > 0 && halfVol > 0)
     {
      double px = isLong ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      if((isLong && px >= tp1Level) || (!isLong && px <= tp1Level))
        {
         bool ok;
         if(AccountInfoInteger(ACCOUNT_MARGIN_MODE) == ACCOUNT_MARGIN_MODE_RETAIL_HEDGING)
            ok = trade.PositionClosePartial(tk, halfVol);
         else   // compte « netting » : ordre inverse de la moitié du volume
            ok = isLong ? trade.Sell(halfVol, _Symbol, 0.0, 0.0, 0.0, "KS TP1")
                        : trade.Buy(halfVol, _Symbol, 0.0, 0.0, 0.0, "KS TP1");
         if(ok)
           {
            tp1Done = true;
            Print("TP1 atteint : 50 % de la position fermée.");
            if(InpMoveBE && SelectMyPosition(tk))
              {
               double be = NormalizeDouble(openPx, _Digits);
               bool better = isLong ? (curSl < be) : (curSl == 0 || curSl > be);
               if(better && !trade.PositionModify(tk, be, curTp))
                  PrintFormat("Stop au prix d'entrée impossible (code %d).", (int)trade.ResultRetcode());
              }
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Dessins                                                           |
//+------------------------------------------------------------------+
void Rect(string name, datetime t1, double p1, datetime t2, double p2, color c, ENUM_LINE_STYLE st)
  {
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
      ObjectSetInteger(0, name, OBJPROP_COLOR, c);
      ObjectSetInteger(0, name, OBJPROP_STYLE, st);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, name, OBJPROP_FILL, false);
      ObjectSetInteger(0, name, OBJPROP_BACK, true);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
   else
     {
      ObjectMove(0, name, 0, t1, p1);
      ObjectMove(0, name, 1, t2, p2);
     }
  }

void TLine(string name, datetime t1, double p1, datetime t2, double p2, color c, ENUM_LINE_STYLE st)
  {
   if(ObjectFind(0, name) < 0)
     {
      ObjectCreate(0, name, OBJ_TREND, 0, t1, p1, t2, p2);
      ObjectSetInteger(0, name, OBJPROP_COLOR, c);
      ObjectSetInteger(0, name, OBJPROP_STYLE, st);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, name, OBJPROP_RAY_RIGHT, false);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
     }
   else
     {
      ObjectMove(0, name, 0, t1, p1);
      ObjectMove(0, name, 1, t2, p2);
     }
  }

void Txt(string name, datetime t, double p, string text, color c, ENUM_ANCHOR_POINT anchor)
  {
   if(ObjectFind(0, name) < 0)
      ObjectCreate(0, name, OBJ_TEXT, 0, t, p);
   else
      ObjectMove(0, name, 0, t, p);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
   ObjectSetInteger(0, name, OBJPROP_COLOR, c);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, 8);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, anchor);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

void DrawSetup(const KsSetup &st, double top, double bot, double mid, datetime tNow)
  {
   string   pf    = KS_PFX + "S" + IntegerToString(st.id) + "_";
   color    col   = (st.dir == 1) ? KS_BULL : KS_BEAR;
   datetime right = tNow + 5 * PeriodSeconds();
   datetime oteL  = (st.dir == 1) ? st.hiT : st.loT;
   Rect(pf + "OB",  st.obT,  st.obTop,  right, st.obBot,  col, STYLE_SOLID);
   Txt(pf + "OBt",  st.obT,  st.obTop,  "OB",  col, ANCHOR_LEFT_LOWER);
   Rect(pf + "FVG", st.fvgT, st.fvgTop, right, st.fvgBot, col, STYLE_DOT);
   Txt(pf + "FVGt", right,   st.fvgTop, "FVG", col, ANCHOR_RIGHT_LOWER);
   Rect(pf + "OTE", oteL,    top,       right, bot,       KS_NEUT, STYLE_DASH);
   TLine(pf + "MID", oteL,   mid,       right, mid,       KS_NEUT, STYLE_DOT);
   Txt(pf + "OTEt", right,   top,       "OTE", KS_NEUT, ANCHOR_RIGHT_LOWER);
  }

void DeleteSetupObjects(int id)
  {
   ObjectsDeleteAll(0, KS_PFX + "S" + IntegerToString(id) + "_");
  }

void DrawArrow(int id, bool bull, datetime t, double p)
  {
   string name = KS_PFX + "A" + IntegerToString(id);
   if(ObjectFind(0, name) >= 0)
      return;
   ObjectCreate(0, name, bull ? OBJ_ARROW_BUY : OBJ_ARROW_SELL, 0, t, p);
   ObjectSetInteger(0, name, OBJPROP_COLOR, bull ? KS_BULL : KS_BEAR);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, bull ? ANCHOR_TOP : ANCHOR_BOTTOM);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
  }

//--- BOS / CHoCH : on ne garde que les 3 derniers
void DrawStruct(datetime t1, double p, datetime t2, bool bull, bool choch)
  {
   structSeq++;
   string pf = KS_PFX + "B" + IntegerToString(structSeq) + "_";
   TLine(pf + "L", t1, p, t2, p, KS_NEUT, STYLE_DOT);
   datetime tm = (datetime)(t1 + (t2 - t1) / 2);
   Txt(pf + "T", tm, p, choch ? "CHoCH" : "BOS", bull ? KS_BULL : KS_BEAR, bull ? ANCHOR_LOWER : ANCHOR_UPPER);
   if(structSeq > 3)
      ObjectsDeleteAll(0, KS_PFX + "B" + IntegerToString(structSeq - 3) + "_");
  }

//+------------------------------------------------------------------+
//| Panneau d'information (coin haut gauche)                          |
//+------------------------------------------------------------------+
string FamilyName(int f)
  {
   switch(f)
     {
      case FAM_BOOM:   return "Boom";
      case FAM_CRASH:  return "Crash";
      case FAM_SPIKES: return "Indice à pics";
      default:         return "Standard";
     }
  }
string DirName(int d)
  {
   switch(d)
     {
      case DIR_LONG:  return "achats seulement";
      case DIR_SHORT: return "ventes seulement";
      default:        return "achats et ventes";
     }
  }
void ShowPanel()
  {
   string htf = "off";
   if(InpUseHTF)
     {
      int tr = HtfTrendAt(TimeCurrent());
      htf = (tr == 1) ? "haussière" : (tr == -1) ? "baissière" : "indéfinie";
     }
   string pos = HasPosition() ? "position ouverte" : "aucune position";
   Comment(StringFormat("Koss Smart EA  |  %s : %s, %s\nTendance : %s  |  HTF : %s\nSetups suivis : %d  |  %s%s%s",
                        _Symbol, FamilyName(family), DirName(dirEff),
                        (trend == 1) ? "haussière" : (trend == -1) ? "baissière" : "indéfinie", htf,
                        ArraySize(S), pos,
                        InpTrade ? "" : "  |  SIGNAUX SEULEMENT",
                        InpControl ? "  |  MODE CONTRÔLE" : ""));
  }
//+------------------------------------------------------------------+
