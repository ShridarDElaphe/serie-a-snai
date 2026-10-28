import { THRESHOLDS } from "./thresholds";

export const RULES = [
  `Doppia chance (1X, X2, 12): entra solo se la probabilità stimata, da una Poisson sui gol recenti, è almeno ${THRESHOLDS.dcMinPercent}%. Alta da ${THRESHOLDS.dcAltaPercent}% se almeno due segnali fra classifica, forma e gol non sono contrari. Sicura solo se tutti e tre concordano, con almeno ${THRESHOLDS.minVenueMatches} partite nel ruolo casa o trasferta, e nessuna notizia contraria nell'ultima ora.`,
  `La squadra che deve reggere la doppia chance non deve essere in crisi: nelle ultime ${THRESHOLDS.minMatches} o più, al massimo ${THRESHOLDS.crisisMaxPoints} punti e almeno ${THRESHOLDS.crisisMinGoalDiffAgainst} gol di passivo, oppure ${THRESHOLDS.crisisMinLosses} sconfitte.`,
  `Multigol: si calcola la somma dei gol attesi e si sceglie, tra 0-2, 1-3 e 2-4, la fascia che la contiene con il margine interno più largo, non la più stretta. Alta se la probabilità della fascia è almeno ${THRESHOLDS.multigolAltaPercent}% e il margine è almeno ${THRESHOLDS.multigolMarginAlta.toString().replace(".", ",")} gol.`,
  `Marcatore: solo un titolare annunciato, con almeno ${THRESHOLDS.scorerMediaGoals} gol, ${THRESHOLDS.scorerMinApps} presenze e ${THRESHOLDS.scorerMediaPerApp.toString().replace(".", ",")} gol a presenza. Alta da ${THRESHOLDS.scorerAltaGoals} gol e ${THRESHOLDS.scorerAltaPerApp.toString().replace(".", ",")}. Minuti e rigori, se la fonte non li ha, restano «dato assente» e la giocata non è sicura.`,
  `Over 3,5 cartellini solo se la media delle due squadre e quella dell'arbitro stanno dalla stessa parte. Senza arbitro la proposta non c'è. Un ammonito chiede gialli e falli entrambi alti, da titolare. Una notizia dell'ultima ora su infortunio, squalifica, turnover o coppa abbassa la confidenza o nasconde la giocata.`,
  "«Sicura» vuol dire soltanto che i segnali disponibili concordano. Non è una vincita garantita e non è una quota SNAI letta dal bookmaker.",
];
