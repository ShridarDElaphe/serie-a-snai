import { comboOverlaps } from "../combo";
import { formatKick, formatNum, formatPct, percent } from "../format";
import { MODEL_TOTALS, publishedPrice } from "../price-key";
import {
  blendGrid,
  capFactor,
  fasciaOf,
  fusionSentence,
  gridJoint,
  gridTotals,
  implied1x2,
  methodLambdas,
  modelWeight,
  multipleExclusion,
  outcomeProbs,
  poissonGrid,
} from "../method";
import { fold, lastName, mentionsAlias } from "../teams";
import { DATO_ASSENTE, THRESHOLDS } from "../thresholds";
import type {
  BookPrice,
  DecideInput,
  DecideResult,
  FinishedMatch,
  FusionState,
  ProposalDraft,
  SignalValue,
  StandingRow,
  TeamCardSample,
} from "../types";

type Form = {
  n: number;
  points: number;
  gf: number;
  ga: number;
  wins: number;
  draws: number;
  losses: number;
  cleanSheets: number;
  letters: string[];
};

type Side = "1X" | "X2" | "12";

const BANDS = [
  { id: "0-2", low: 0, high: 2 },
  { id: "1-3", low: 1, high: 3 },
  { id: "2-4", low: 2, high: 4 },
] as const;

export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) p *= lambda / i;
  return p;
}

export function scoreProbs(lambdaHome: number, lambdaAway: number, max = 8) {
  let p1 = 0;
  let px = 0;
  let p2 = 0;
  const total = Array.from({ length: max * 2 + 1 }, () => 0);
  for (let home = 0; home <= max; home += 1) {
    const ph = poissonPmf(home, lambdaHome);
    for (let away = 0; away <= max; away += 1) {
      const p = ph * poissonPmf(away, lambdaAway);
      if (home > away) p1 += p;
      else if (home === away) px += p;
      else p2 += p;
      total[home + away] += p;
    }
  }
  const sum = p1 + px + p2 || 1;
  return {
    p1: p1 / sum,
    px: px / sum,
    p2: p2 / sum,
    total: total.map((value) => value / sum),
  };
}

export function pickBand(mu: number): { id: string; low: number; high: number; margin: number } | null {
  const contained = BANDS.filter((band) => mu >= band.low && mu <= band.high).map((band) => ({
    ...band,
    margin: Math.min(mu - band.low, band.high - mu),
  }));
  if (!contained.length) return null;
  contained.sort((a, b) => b.margin - a.margin || a.low - b.low);
  return contained[0];
}

type ScorePred = (home: number, away: number) => boolean;

/** Probabilità congiunta sulla stessa griglia di punteggi, non il prodotto di due eventi indipendenti. */
export function scoreJoint(lambdaHome: number, lambdaAway: number, preds: ScorePred[], max = 8): number {
  let hit = 0;
  let sum = 0;
  for (let home = 0; home <= max; home += 1) {
    const ph = poissonPmf(home, lambdaHome);
    for (let away = 0; away <= max; away += 1) {
      const p = ph * poissonPmf(away, lambdaAway);
      sum += p;
      if (preds.every((pred) => pred(home, away))) hit += p;
    }
  }
  return sum ? hit / sum : 0;
}

export function bandProb(total: number[], low: number, high: number): number {
  let p = 0;
  for (let goals = low; goals <= high && goals < total.length; goals += 1) p += total[goals] ?? 0;
  return p;
}

function teamMatches(prior: FinishedMatch[], teamId: string): FinishedMatch[] {
  return prior
    .filter((match) => match.homeId === teamId || match.awayId === teamId)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

function summarize(matches: FinishedMatch[], teamId: string): Form {
  const form: Form = {
    n: 0,
    points: 0,
    gf: 0,
    ga: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    cleanSheets: 0,
    letters: [],
  };
  for (const match of matches) {
    const home = match.homeId === teamId;
    const gf = home ? match.homeGoals : match.awayGoals;
    const ga = home ? match.awayGoals : match.homeGoals;
    form.n += 1;
    form.gf += gf;
    form.ga += ga;
    if (ga === 0) form.cleanSheets += 1;
    if (gf > ga) {
      form.points += 3;
      form.wins += 1;
      form.letters.push("V");
    } else if (gf === ga) {
      form.points += 1;
      form.draws += 1;
      form.letters.push("N");
    } else {
      form.losses += 1;
      form.letters.push("P");
    }
  }
  return form;
}

function lettersOf(form: Form): string {
  if (!form.letters.length) return DATO_ASSENTE;
  return form.letters.slice(-5).join(" ");
}

export function inCrisis(form: Form): boolean {
  if (form.n < THRESHOLDS.minMatches) return false;
  const heavy =
    form.points <= THRESHOLDS.crisisMaxPoints &&
    form.ga - form.gf >= THRESHOLDS.crisisMinGoalDiffAgainst;
  const collapsed = form.losses >= THRESHOLDS.crisisMinLosses && form.points <= THRESHOLDS.crisisMaxPoints;
  return heavy || collapsed;
}

export function standingsFromResults(
  prior: FinishedMatch[],
  names: Map<string, string>,
): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const ensure = (id: string) => {
    let row = table.get(id);
    if (!row) {
      row = {
        teamId: id,
        name: names.get(id) ?? id,
        rank: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        points: 0,
      };
      table.set(id, row);
    }
    return row;
  };
  for (const match of prior) {
    const home = ensure(match.homeId);
    const away = ensure(match.awayId);
    home.played += 1;
    away.played += 1;
    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;
    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.homeGoals === match.awayGoals) {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    } else {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    }
  }
  const rows = [...table.values()].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name, "it");
  });
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return rows;
}

function avgGoals(matches: FinishedMatch[], teamId: string, side: "for" | "against"): number {
  if (!matches.length) return 0;
  let goals = 0;
  for (const match of matches) {
    const home = match.homeId === teamId;
    const gf = home ? match.homeGoals : match.awayGoals;
    const ga = home ? match.awayGoals : match.homeGoals;
    goals += side === "for" ? gf : ga;
  }
  return goals / matches.length;
}

function clampLambda(value: number): { value: number; clamped: boolean } {
  const clamped = Math.min(THRESHOLDS.lambdaClampMax, Math.max(THRESHOLDS.lambdaClampMin, value));
  return { value: clamped, clamped: clamped !== value };
}

function formTilt(last: Form, season: Form): number {
  if (last.n < 3 || season.n < THRESHOLDS.minMatches) return 1;
  const delta = (last.points / last.n - season.points / season.n) * 0.08;
  const capped = Math.max(-THRESHOLDS.formTiltMax, Math.min(THRESHOLDS.formTiltMax, delta));
  return 1 + capped;
}

function signalWord(value: boolean | null): SignalValue {
  if (value == null) return "dato assente";
  return value ? "concorde" : "contrario";
}

function safetyNote(probability: number | null, alta: boolean): string {
  if (probability == null) {
    return `I segnali ${alta ? "sono larghi" : "superano la soglia ma sono più stretti"}. La probabilità numerica è ${DATO_ASSENTE}: non viene inventata. Senza quel numero e senza una quota letta non dico se conviene puntare.`;
  }
  const high = percent(probability) >= THRESHOLDS.dcAltaPercent;
  const head = high
    ? "Probabilità stimata alta. Non basta per puntare: se la quota letta rende pochi centesimi, come 1,08, non paga il rischio di perdere la posta."
    : "Probabilità sopra la soglia, con un margine più stretto. Senza una quota letta non è conveniente, e un utile di pochi centesimi non lo diventa.";
  return `${head} Non è una vincita garantita: decidi tu.`;
}

function emptyFusion(reason: string | null = "Quote 1X2 incomplete: dato assente. Esclusa dalle multiple."): FusionState {
  return {
    market1: null,
    marketX: null,
    market2: null,
    model1: null,
    modelX: null,
    model2: null,
    weight: null,
    excludedReason: reason,
  };
}

function attackRole(position: string | null): "attacco" | "difesa" | null {
  if (!position) return null;
  const value = fold(position);
  if (/goal|portier|keeper|^g$/.test(value)) return "difesa";
  if (/defen|difens|^d$|back/.test(value)) return "difesa";
  if (/forw|attacc|striker|^f$/.test(value)) return "attacco";
  return null;
}

function leagueMu(prior: FinishedMatch[]): { muHome: number; muAway: number } | null {
  if (!prior.length) return null;
  let home = 0;
  let away = 0;
  for (const match of prior) {
    home += match.homeGoals;
    away += match.awayGoals;
  }
  return { muHome: home / prior.length, muAway: away / prior.length };
}

function isKeeper(position: string | null): boolean {
  if (!position) return false;
  const value = position.toUpperCase();
  return value === "G" || value === "GK" || value.startsWith("GOAL");
}

function freshNews(input: DecideInput) {
  const windowMs = THRESHOLDS.newsWindowMinutes * 60 * 1000;
  return input.news.filter((item) => {
    const at = Date.parse(item.publishedAt);
    if (!Number.isFinite(at)) return false;
    if (input.now - at > windowMs || at > input.now + 5 * 60 * 1000) return false;
    return item.teamIds.includes(input.homeId) || item.teamIds.includes(input.awayId);
  });
}

function shockText(item: { title: string; summary: string }): boolean {
  const text = fold(`${item.title} ${item.summary}`);
  if (/turnover|titolari a riposo|formazione rivoluz|undici di riserva|rosa corta|tanti assenti/.test(text)) {
    return true;
  }
  return (
    /champions|europa league|coppa italia/.test(text) &&
    /turnover|riserve|a riposo|congest|senza i titolari|non schiera/.test(text)
  );
}

function playerNamedInShock(text: string, name: string): boolean {
  const surname = lastName(name);
  if (!surname) return false;
  if (!/infortun|squalific|non convoc|indisponib|lesione|stiramento|problema muscol|problema fisic|lascia il ritiro/.test(fold(text))) {
    return false;
  }
  return mentionsAlias(text, surname);
}

function downgrade(draft: ProposalDraft, why: string): ProposalDraft | null {
  const next: ProposalDraft = {
    ...draft,
    sicura: false,
    reason: `${draft.reason} Notizia dell'ultima ora: ${why}. Confidenza abbassata.`,
  };
  if (next.confidence === "alta") {
    next.confidence = "media";
    return next;
  }
  return null;
}

function quotedBook(odds: BookPrice | null | undefined): { home: number; draw: number; away: number } | null {
  if (!odds || odds.home == null || odds.draw == null || odds.away == null) return null;
  if (!(odds.home > 1 && odds.draw > 1 && odds.away > 1)) return null;
  return { home: odds.home, draw: odds.draw, away: odds.away };
}

function absenceScale(input: DecideInput): { home: number; away: number; note: string } {
  let home = 1;
  let away = 1;
  const unknown: string[] = [];
  for (const injury of input.injuries) {
    const player = input.players.find(
      (item) => item.teamId === injury.teamId && mentionsAlias(item.name, lastName(injury.playerName) ?? injury.playerName),
    );
    const role = attackRole(player?.position ?? null);
    if (!player || !role) {
      unknown.push(injury.playerName);
      continue;
    }
    if (role === "attacco") {
      if (injury.teamId === input.homeId) home *= THRESHOLDS.absenceForward;
      else away *= THRESHOLDS.absenceForward;
    } else if (injury.teamId === input.homeId) away *= THRESHOLDS.absenceDefense;
    else home *= THRESHOLDS.absenceDefense;
  }
  const shock = freshNews(input).find(shockText);
  if (shock) {
    const text = fold(`${shock.title} ${shock.summary}`);
    const homeNamed = mentionsAlias(text, input.homeName);
    const awayNamed = mentionsAlias(text, input.awayName);
    if (homeNamed || !awayNamed) home *= THRESHOLDS.turnoverFactor;
    if (awayNamed || !homeNamed) away *= THRESHOLDS.turnoverFactor;
  }
  home = capFactor(home);
  away = capFactor(away);
  const coach = freshNews(input).some((item) =>
    /allenatore/.test(fold(`${item.title} ${item.summary}`)) &&
    /esoner|nuov|cambi|squalif/.test(fold(`${item.title} ${item.summary}`)),
  );
  const bits = ["Correzioni del metodo, al massimo ±20%, solo con un ruolo noto."];
  if (!input.injuries.length) bits.push("Indisponibili strutturati: dato assente, nessuna correzione.");
  else if (unknown.length) bits.push(`Ruolo non noto per ${unknown.slice(0, 3).join(", ")}: dato assente, nessuna correzione su quei nomi.`);
  if (shock) bits.push("Turnover citato nell'ultima ora: gol attesi ridotti, entro il tetto.");
  if (coach) bits.push("Allenatore cambiato o squalificato: solo avviso, i gol attesi non si muovono per questo.");
  return { home, away, note: bits.join(" ") };
}

function priceOf(market: ProposalDraft["market"], selection: string, odds: BookPrice | null | undefined): { price: number; bookmaker: string } | null {
  return publishedPrice(market, selection, odds);
}

function explainDraft(
  input: DecideInput,
  draft: ProposalDraft,
  fusion: FusionState,
  homeRow: StandingRow | null,
  awayRow: StandingRow | null,
): string {
  const table =
    homeRow && awayRow
      ? `${input.homeName} ${homeRow.gf} gol fatti e ${homeRow.ga} subiti in ${homeRow.played} partite (${homeRow.points} punti), ${input.awayName} ${awayRow.gf}-${awayRow.ga} in ${awayRow.played} (${awayRow.points} punti). Forma ${draft.formHome} / ${draft.formAway}.`
      : `Classifica numerica: ${DATO_ASSENTE}. Forma ${draft.formHome} / ${draft.formAway}.`;
  const missing = input.injuries.length
    ? `Assenze in elenco: ${input.injuries.slice(0, 4).map((item) => item.playerName).join(", ")}.`
    : "Indisponibili nel flusso ESPN: nessuno segnalato. Eurosport e L'Angolo non hanno un campo strutturato, quindi quei nomi restano dato assente.";
  const quota = draft.quota;
  const price =
    quota != null && draft.quotaBook
      ? `Quota ${formatNum(quota, 2)} da ${draft.quotaBook}${input.odds?.readAt ? `, letta il ${formatKick(input.odds.readAt)}` : ""}. Non è la quota SNAI.`
      : `Quota di questo mercato: ${DATO_ASSENTE}. ${input.oddsNote || "Nessuna fonte ha un numero per questa riga."}`;
  const fused = fusionSentence(
    fusion.market1 != null && fusion.marketX != null && fusion.market2 != null
      ? { p1: fusion.market1, px: fusion.marketX, p2: fusion.market2 }
      : null,
    fusion.model1 != null && fusion.modelX != null && fusion.model2 != null
      ? { p1: fusion.model1, px: fusion.modelX, p2: fusion.model2 }
      : null,
    fusion.weight,
  );
  return `Perché: ${table} ${missing} ${price} ${fused}`;
}

function decorate(result: DecideResult, input: DecideInput, homeRow: StandingRow | null, awayRow: StandingRow | null): DecideResult {
  result.proposals = result.proposals.map((draft) => {
    const found = priceOf(draft.market, draft.selection, input.odds);
    const next: ProposalDraft = {
      ...draft,
      quota: found?.price ?? null,
      quotaBook: found?.bookmaker ?? null,
    };
    const fascia = next.probability == null ? DATO_ASSENTE : fasciaOf(next.probability);
    next.signals = { ...next.signals, rischio: fascia, fonte_quota: next.quotaBook ?? DATO_ASSENTE };
    next.reason = `${next.reason} ${explainDraft(input, next, result.fusion, homeRow, awayRow)}`;
    return next;
  });
  return result;
}

export function decide(input: DecideInput): DecideResult {
  const names = new Map<string, string>([
    [input.homeId, input.homeName],
    [input.awayId, input.awayName],
  ]);
  for (const match of input.prior) {
    names.set(match.homeId, match.homeName);
    names.set(match.awayId, match.awayName);
  }
  const homeAll = teamMatches(input.prior, input.homeId);
  const awayAll = teamMatches(input.prior, input.awayId);
  const homeSeason = summarize(homeAll, input.homeId);
  const awaySeason = summarize(awayAll, input.awayId);
  const homeLast = summarize(homeAll.slice(-5), input.homeId);
  const awayLast = summarize(awayAll.slice(-5), input.awayId);
  const formHome = lettersOf(homeLast);
  const formAway = lettersOf(awayLast);
  const notes: string[] = [];
  const suppressed: string[] = [];
  const proposals: ProposalDraft[] = [];
  let fusion: FusionState = emptyFusion();

  const table = input.standings ?? standingsFromResults(input.prior, names);
  const homeRow = table.find((row) => row.teamId === input.homeId) ?? null;
  const awayRow = table.find((row) => row.teamId === input.awayId) ?? null;

  if (homeAll.length < THRESHOLDS.minMatches || awayAll.length < THRESHOLDS.minMatches) {
    notes.push(
      `Doppia chance e multigol: servono almeno ${THRESHOLDS.minMatches} partite già giocate per squadra. Campione attuale ${input.homeName} ${homeAll.length}, ${input.awayName} ${awayAll.length}: ${DATO_ASSENTE}.`,
    );
  } else {
    const homeHome = homeAll.filter((match) => match.homeId === input.homeId);
    const awayAway = awayAll.filter((match) => match.awayId === input.awayId);
    const homeSplit = homeHome.length >= THRESHOLDS.minVenueMatches;
    const awaySplit = awayAway.length >= THRESHOLDS.minVenueMatches;
    const homeAttackSample = homeSplit ? homeHome : homeAll;
    const homeDefenseSample = homeSplit ? homeHome : homeAll;
    const awayAttackSample = awaySplit ? awayAway : awayAll;
    const awayDefenseSample = awaySplit ? awayAway : awayAll;

    let lambdaHome =
      (avgGoals(homeAttackSample, input.homeId, "for") +
        avgGoals(awayDefenseSample, input.awayId, "against")) /
      2;
    let lambdaAway =
      (avgGoals(awayAttackSample, input.awayId, "for") +
        avgGoals(homeDefenseSample, input.homeId, "against")) /
      2;
    const tiltHome = formTilt(homeLast, homeSeason);
    const tiltAway = formTilt(awayLast, awaySeason);
    lambdaHome *= tiltHome;
    lambdaAway *= tiltAway;
    const clampedHome = clampLambda(lambdaHome);
    const clampedAway = clampLambda(lambdaAway);
    lambdaHome = clampedHome.value;
    lambdaAway = clampedAway.value;
    const quoted = quotedBook(input.odds);
    const muLeague = leagueMu(input.prior);
    const method =
      quoted && muLeague
        ? methodLambdas({
            homeGf: homeRow?.gf ?? homeSeason.gf,
            homeGa: homeRow?.ga ?? homeSeason.ga,
            homePlayed: homeRow?.played || homeSeason.n,
            awayGf: awayRow?.gf ?? awaySeason.gf,
            awayGa: awayRow?.ga ?? awaySeason.ga,
            awayPlayed: awayRow?.played || awaySeason.n,
            muHome: muLeague.muHome,
            muAway: muLeague.muAway,
          })
        : null;
    const absence = method ? absenceScale(input) : null;
    if (method && absence) {
      lambdaHome = clampLambda(method.home * absence.home).value;
      lambdaAway = clampLambda(method.away * absence.away).value;
      if (absence.note) notes.push(absence.note);
    }
    const market = quoted ? implied1x2(quoted.home, quoted.draw, quoted.away) : null;
    const modelGrid = method ? poissonGrid(lambdaHome, lambdaAway, 7) : null;
    const model = modelGrid ? outcomeProbs(modelGrid) : null;
    const weight = model ? modelWeight(Math.min(homeRow?.played || homeSeason.n, awayRow?.played || awaySeason.n)) : null;
    const grid = modelGrid && market && weight != null ? blendGrid(modelGrid, market, weight) : null;
    const blended = grid ? outcomeProbs(grid) : null;
    const poisson = scoreProbs(lambdaHome, lambdaAway);
    const probs = blended ? { ...blended, total: gridTotals(grid as number[][]) } : poisson;
    const mu = lambdaHome + lambdaAway;
    fusion = {
      market1: market?.p1 ?? null,
      marketX: market?.px ?? null,
      market2: market?.p2 ?? null,
      model1: model?.p1 ?? null,
      modelX: model?.px ?? null,
      model2: model?.p2 ?? null,
      weight,
      excludedReason: multipleExclusion({
        oddsComplete: Boolean(quoted && market),
        lineup: (input.lineup ?? []).filter((player) => player.starter).length >= 11,
        market,
        model,
      }),
    };

    const homeVenue = summarize(homeHome, input.homeId);
    const awayVenue = summarize(awayAway, input.awayId);
    const homeCrisis = inCrisis(homeLast);
    const awayCrisis = inCrisis(awayLast);

    const tableAgrees = (side: Side): boolean | null => {
      if (!homeRow || !awayRow) return null;
      if (side === "1X") return homeRow.rank <= awayRow.rank + 2 || homeRow.points + 3 >= awayRow.points;
      if (side === "X2") return awayRow.rank <= homeRow.rank + 1 || awayRow.points + 1 >= homeRow.points;
      return Math.abs(homeRow.rank - awayRow.rank) >= 5;
    };
    const formAgrees = (side: Side): boolean | null => {
      if (side === "1X") {
        if (homeVenue.n < THRESHOLDS.minVenueMatches) return null;
        return homeVenue.points / homeVenue.n >= 1;
      }
      if (side === "X2") {
        if (awayVenue.n < THRESHOLDS.minVenueMatches) return null;
        return awayVenue.points / awayVenue.n >= 1;
      }
      if (homeVenue.n < THRESHOLDS.minVenueMatches || awayVenue.n < THRESHOLDS.minVenueMatches) return null;
      return Math.abs(homeVenue.points / homeVenue.n - awayVenue.points / awayVenue.n) >= 0.8;
    };

    const baseReason = (side: Side, probability: number, tableSignal: SignalValue, formSignal: SignalValue) => {
      const label = side === "1X" ? "1X" : side === "X2" ? "X2" : "12";
      const rank =
        homeRow && awayRow
          ? `${input.homeName} ${homeRow.rank}ª con ${homeRow.points} punti, ${input.awayName} ${awayRow.rank}ª con ${awayRow.points}`
          : DATO_ASSENTE;
      const splitNote = homeSplit && awaySplit
        ? "Le medie usano casa e trasferta."
        : "Una media casa/trasferta ha meno di due partite: si usa il complessivo e la proposta non può essere sicura.";
      const tiltNote =
        Math.abs(tiltHome - 1) >= 0.03 || Math.abs(tiltAway - 1) >= 0.03
          ? ` La forma recente sposta i gol attesi di circa ${formatNum((tiltHome - 1) * 100, 0)}% in casa e ${formatNum((tiltAway - 1) * 100, 0)}% in trasferta.`
          : "";
      const clampNote =
        clampedHome.clamped || clampedAway.clamped
          ? " Un valore estremo è stato riportato nel limite 0,25–3,2 gol, per non far pesare una sola goleada."
          : "";
      return `Probabilità stimata ${label}: ${formatPct(probability)}. Gol attesi ${formatNum(lambdaHome)}-${formatNum(lambdaAway)}. Classifica: ${rank}, segnale ${tableSignal}. Forma nel ruolo: segnale ${formSignal}. ${splitNote}${tiltNote}${clampNote}`;
    };

    const sides: { side: Side; probability: number; selection: string; crisis: boolean }[] = [
      {
        side: "1X",
        probability: probs.p1 + probs.px,
        selection: `1X — ${input.homeName} o pareggio`,
        crisis: homeCrisis,
      },
      {
        side: "X2",
        probability: probs.px + probs.p2,
        selection: `X2 — ${input.awayName} o pareggio`,
        crisis: awayCrisis,
      },
      {
        side: "12",
        probability: probs.p1 + probs.p2,
        selection: `12 — ${input.homeName} o ${input.awayName}, no pareggio`,
        crisis: (homeRow && awayRow && homeRow.rank <= awayRow.rank ? homeCrisis : awayCrisis),
      },
    ];

    for (const candidate of sides) {
      if (candidate.crisis) {
        notes.push(
          `Doppia chance ${candidate.side} non proposta: la squadra coperta è in crisi evidente nelle ultime partite.`,
        );
        continue;
      }
      if (percent(candidate.probability) < THRESHOLDS.dcMinPercent) continue;
      const tableSignal = tableAgrees(candidate.side);
      const formSignal = formAgrees(candidate.side);
      const known = [tableSignal, formSignal, true].filter((value) => value !== null);
      const disagrees = known.filter((value) => value === false).length;
      const agrees = known.filter((value) => value === true).length;
      if (disagrees >= 2) {
        notes.push(`Doppia chance ${candidate.side} scartata: almeno due segnali sono contrari.`);
        continue;
      }
      const alta =
        percent(candidate.probability) >= THRESHOLDS.dcAltaPercent && agrees >= 2 && disagrees === 0;
      const sicura = alta && tableSignal === true && formSignal === true && homeSplit && awaySplit;
      proposals.push({
        market: "doppia_chance",
        selection: candidate.selection,
        confidence: alta ? "alta" : "media",
        sicura,
        probability: candidate.probability,
        reason: `${baseReason(candidate.side, candidate.probability, signalWord(tableSignal), signalWord(formSignal))} ${
          sicura
            ? "Classifica, forma e gol concordano."
            : "Non tutti i segnali concordano, quindi non è marcata come sicura."
        }`,
        safetyNote: safetyNote(candidate.probability, alta),
        sortKey: candidate.probability,
        signals: {
          classifica: signalWord(tableSignal),
          forma: signalWord(formSignal),
          gol: "concorde",
          crisi: candidate.crisis ? "sì" : "no",
          probabilita: percent(candidate.probability),
        },
        formHome,
        formAway,
      });
    }

    const band = pickBand(mu);
    if (!band) {
      notes.push(
        `Multigol: i gol attesi sono ${formatNum(mu)}, fuori dalle fasce 0-2, 1-3 e 2-4. Nessuna proposta.`,
      );
    } else {
      const probability = bandProb(probs.total, band.low, band.high);
      const wide = band.margin >= THRESHOLDS.multigolMarginAlta;
      const alta =
        percent(probability) >= THRESHOLDS.multigolAltaPercent && band.margin >= THRESHOLDS.multigolMarginAlta;
      const pass =
        percent(probability) >= THRESHOLDS.multigolMediaPercent &&
        band.margin >= THRESHOLDS.multigolMarginMedia;
      if (!pass) {
        notes.push(
          `Multigol ${band.id}: è la fascia col margine interno più largo (${formatNum(band.margin)}), ma la probabilità stimata è ${formatPct(probability)}, sotto la soglia.`,
        );
      } else {
        const sicura = alta && homeSplit && awaySplit && wide;
        proposals.push({
          market: "multigol",
          selection: `Multigol ${band.id}`,
          confidence: alta ? "alta" : "media",
          sicura,
          probability,
          reason: `Gol attesi totali ${formatNum(mu)}. Tra le fasce che contengono quel valore si prende quella col margine interno più largo, non la più stretta: ${band.id}, margine ${formatNum(band.margin)} gol. Probabilità stimata della fascia ${formatPct(probability)}. ${
            homeSplit && awaySplit
              ? "Le medie di casa e trasferta ci sono."
              : "Manca un campione casa/trasferta sufficiente: dato assente su uno spaccato, quindi non è sicura."
          }`,
          safetyNote: safetyNote(probability, alta),
          sortKey: probability,
          signals: {
            fascia: band.id,
            margine: Number(band.margin.toFixed(2)),
            gol: "concorde",
            spaccato: homeSplit && awaySplit ? "concorde" : "dato assente",
            probabilita: percent(probability),
          },
          formHome,
          formAway,
        });
      }
    }

    proposals.push(...pricedDrafts(input, grid, market, lambdaHome, lambdaAway, formHome, formAway));
    proposals.push(...comboDrafts(input, proposals, lambdaHome, lambdaAway, formHome, formAway, grid));

    const squad = squadPicks(input, formHome, formAway, lambdaHome, lambdaAway);
    proposals.push(...squad.proposals);
    notes.push(...squad.notes);

    return decorate(
      applyNews(
        {
          proposals,
          notes,
          suppressed,
          expectedHome: lambdaHome,
          expectedAway: lambdaAway,
          formHome,
          formAway,
          fusion,
        },
        input,
      ),
      input,
      homeRow,
      awayRow,
    );
  }

  const squad = squadPicks(input, formHome, formAway, null, null);
  proposals.push(...squad.proposals);
  notes.push(...squad.notes);
  return decorate(
    applyNews(
      {
        proposals,
        notes,
        suppressed,
        expectedHome: null,
        expectedAway: null,
        formHome,
        formAway,
        fusion,
      },
      input,
    ),
    input,
    homeRow,
    awayRow,
  );
}

type ComboLeg = {
  family: "dc" | "multigol" | "gol" | "uo";
  token: string;
  marginal: number;
  pred: ScorePred;
};

function pricedDrafts(
  input: DecideInput,
  grid: number[][] | null,
  market: { p1: number; px: number; p2: number } | null,
  lambdaHome: number,
  lambdaAway: number,
  formHome: string,
  formAway: string,
): ProposalDraft[] {
  const odds = input.odds;
  if (!odds) return [];
  const fused = grid ? outcomeProbs(grid) : null;
  const drafts: ProposalDraft[] = [];
  const signs = [
    { key: "1", selection: `1 — ${input.homeName}`, probability: fused?.p1 ?? market?.p1 ?? null, quota: odds.home },
    { key: "X", selection: "X — pareggio", probability: fused?.px ?? market?.px ?? null, quota: odds.draw },
    { key: "2", selection: `2 — ${input.awayName}`, probability: fused?.p2 ?? market?.p2 ?? null, quota: odds.away },
  ];
  for (const sign of signs) {
    if (sign.quota == null) continue;
    const alta = sign.probability != null && percent(sign.probability) >= THRESHOLDS.dcAltaPercent;
    drafts.push({
      market: "segno",
      selection: sign.selection,
      confidence: alta ? "alta" : "media",
      sicura: false,
      probability: sign.probability,
      sortKey: sign.probability ?? 0,
      reason: `Segno ${sign.key}. La quota è quella letta dal bookmaker, non un prezzo equo calcolato come 1/probabilità e non una quota SNAI.`,
      safetyNote: safetyNote(sign.probability, alta),
      signals: { probabilita: sign.probability == null ? null : percent(sign.probability) },
      formHome,
      formAway,
    });
  }
  const wanted: number[] = [...MODEL_TOTALS];
  if (odds.totalLine != null && !wanted.some((line) => Math.abs(line - odds.totalLine!) < 0.01)) wanted.push(odds.totalLine);
  for (const line of wanted) {
    const overPred = (home: number, away: number) => home + away > line;
    const underPred = (home: number, away: number) => home + away < line;
    const overP = grid ? gridJoint(grid, [overPred]) : scoreJoint(lambdaHome, lambdaAway, [overPred]);
    const underP = grid ? gridJoint(grid, [underPred]) : scoreJoint(lambdaHome, lambdaAway, [underPred]);
    const label = formatNum(line, 1);
    for (const side of [
      { selection: `Over ${label}`, probability: overP },
      { selection: `Under ${label}`, probability: underP },
    ]) {
      if (!publishedPrice("under_over", side.selection, odds)) continue;
      const alta = percent(side.probability) >= THRESHOLDS.dcAltaPercent;
      drafts.push({
        market: "under_over",
        selection: side.selection,
        confidence: alta ? "alta" : "media",
        sicura: false,
        probability: side.probability,
        sortKey: side.probability,
        reason: `Linea ${label}. La quota è quella pubblicata su questa linea, non sulle altre e non un prezzo equo calcolato come 1/probabilità.`,
        safetyNote: safetyNote(side.probability, alta),
        signals: { probabilita: percent(side.probability), linea: label },
        formHome,
        formAway,
      });
    }
  }
  const golP = grid
    ? gridJoint(grid, [(home, away) => home > 0 && away > 0])
    : scoreJoint(lambdaHome, lambdaAway, [(home, away) => home > 0 && away > 0]);
  const noGolP = grid
    ? gridJoint(grid, [(home, away) => home === 0 || away === 0])
    : scoreJoint(lambdaHome, lambdaAway, [(home, away) => home === 0 || away === 0]);
  for (const side of [
    { selection: "Gol — entrambe a segno", probability: golP },
    { selection: "No gol — almeno una non segna", probability: noGolP },
  ]) {
    if (!publishedPrice("gol", side.selection, odds)) continue;
    const alta = percent(side.probability) >= THRESHOLDS.dcAltaPercent;
    drafts.push({
      market: "gol",
      selection: side.selection,
      confidence: alta ? "alta" : "media",
      sicura: false,
      probability: side.probability,
      sortKey: side.probability,
      reason: "Gol/no gol. La quota è quella pubblicata su GG o NG, non un prezzo equo e non una doppia chance travestita.",
      safetyNote: safetyNote(side.probability, alta),
      signals: { probabilita: percent(side.probability) },
      formHome,
      formAway,
    });
  }
  return drafts;
}

function comboDrafts(
  input: DecideInput,
  proposals: ProposalDraft[],
  lambdaHome: number,
  lambdaAway: number,
  formHome: string,
  formAway: string,
  grid: number[][] | null,
): ProposalDraft[] {
  const jointOf = (preds: ScorePred[]) => (grid ? gridJoint(grid, preds) : scoreJoint(lambdaHome, lambdaAway, preds));
  const legs: ComboLeg[] = [];
  for (const draft of proposals) {
    if (draft.market === "doppia_chance" && draft.probability != null) {
      const side: Side = draft.selection.startsWith("1X") ? "1X" : draft.selection.startsWith("X2") ? "X2" : "12";
      const pred: ScorePred = side === "1X" ? (home, away) => home >= away : side === "X2" ? (home, away) => away >= home : (home, away) => home !== away;
      legs.push({ family: "dc", token: side, marginal: draft.probability, pred });
    }
    if (draft.market === "multigol" && draft.probability != null) {
      const band = draft.selection.match(/(\d)-(\d)/);
      if (!band) continue;
      const low = Number(band[1]);
      const high = Number(band[2]);
      legs.push({
        family: "multigol",
        token: `Multigol ${low}-${high}`,
        marginal: draft.probability,
        pred: (home, away) => {
          const total = home + away;
          return total >= low && total <= high;
        },
      });
    }
  }
  const gol = jointOf([(home, away) => home > 0 && away > 0]);
  const noGol = jointOf([(home, away) => home === 0 || away === 0]);
  const goalSides = [
    { token: "Gol", marginal: gol, pred: (home: number, away: number) => home > 0 && away > 0 },
    { token: "No gol", marginal: noGol, pred: (home: number, away: number) => home === 0 || away === 0 },
  ];
  for (const leg of goalSides) {
    if (percent(leg.marginal) >= THRESHOLDS.comboGoalMinPercent) legs.push({ family: "gol", ...leg });
  }
  const lines = [1.5, 2.5, 3.5];
  const ou = lines
    .map((line) => {
      const over = jointOf([(home, away) => home + away > line]);
      const under = jointOf([(home, away) => home + away < line]);
      const label = formatNum(line, 1);
      return over >= under
        ? { token: `Over ${label}`, marginal: over, pred: (home: number, away: number) => home + away > line }
        : { token: `Under ${label}`, marginal: under, pred: (home: number, away: number) => home + away < line };
    })
    .filter((leg) => percent(leg.marginal) >= THRESHOLDS.comboLegMinPercent)
    .sort((a, b) => b.marginal - a.marginal)
    .slice(0, 2);
  for (const leg of ou) legs.push({ family: "uo", ...leg });

  const drafts: ProposalDraft[] = [];
  for (let i = 0; i < legs.length; i += 1) {
    for (let j = i + 1; j < legs.length; j += 1) {
      const left = legs[i];
      const right = legs[j];
      if (left.family === right.family) continue;
      if (comboOverlaps(left.token, right.token)) continue;
      const joint = jointOf([left.pred, right.pred]);
      if (percent(joint) < THRESHOLDS.comboMinPercent) continue;
      const alta = percent(joint) >= THRESHOLDS.comboAltaPercent;
      drafts.push({
        market: "combo",
        selection: `Doppia: ${left.token} + ${right.token}`,
        confidence: alta ? "alta" : "media",
        sicura: false,
        probability: joint,
        sortKey: joint,
        reason: `Doppia su ${input.homeName}–${input.awayName}. La probabilità è quella dei punteggi che soddisfano entrambe le gambe, non il prodotto di due eventi staccati. ${left.token} da sola ${formatPct(left.marginal)}, ${right.token} da sola ${formatPct(right.marginal)}, insieme ${formatPct(joint)}. La quota, se c'è, è quella della combinazione pubblicata. Non è il prodotto delle due quote.`,
        safetyNote: safetyNote(joint, alta),
        signals: {
          gamba1: left.token,
          gamba2: right.token,
          congiunta: percent(joint),
          probabilita: percent(joint),
        },
        formHome,
        formAway,
      });
    }
  }
  drafts.sort((a, b) => b.sortKey - a.sortKey);
  return drafts.slice(0, 12).map((draft, index) => {
    if (index >= 4 || (draft.probability ?? 0) < THRESHOLDS.comboAltaPercent / 100) {
      return { ...draft, confidence: "media" as const };
    }
    return draft;
  });
}

function squadPicks(
  input: DecideInput,
  formHome: string,
  formAway: string,
  lambdaHome: number | null,
  lambdaAway: number | null,
): { proposals: ProposalDraft[]; notes: string[] } {
  const notes: string[] = [];
  const proposals: ProposalDraft[] = [];
  if (!input.allowSquad) {
    notes.push("Marcatori e ammonizioni individuali non sono ricostruiti sul passato: i tabellini di oggi includerebbero gol già fatti.");
    return { proposals, notes };
  }

  const starters = (input.lineup ?? []).filter((player) => player.starter);
  const lineupReady = starters.length >= 11;
  if (!lineupReady) {
    notes.push(`Formazione: ${DATO_ASSENTE}. Nessun marcatore e nessun ammonito proposti senza i titolari attesi.`);
  }

  const injured = (name: string, teamId: string) =>
    input.injuries.some(
      (item) => item.teamId === teamId && mentionsAlias(item.playerName, lastName(name) ?? name),
    );

  if (lineupReady) {
    const scorers = starters
      .filter((player) => !isKeeper(player.position))
      .map((player) => {
        const season = input.players.find((item) => item.playerId === player.playerId && item.teamId === player.teamId);
        return { player, season };
      })
      .filter((item) => item.season && item.season.goals != null && item.season.appearances != null)
      .filter((item) => {
        const season = item.season!;
        const apps = season.appearances!;
        const goals = season.goals!;
        if (apps < THRESHOLDS.scorerMinApps || goals < THRESHOLDS.scorerMediaGoals) return false;
        if (goals / apps < THRESHOLDS.scorerMediaPerApp) return false;
        if (season.subIns != null && season.subIns / apps > THRESHOLDS.scorerMaxSubShare) return false;
        return !injured(item.player.name, item.player.teamId);
      })
      .sort((a, b) => b.season!.goals! / b.season!.appearances! - a.season!.goals! / a.season!.appearances!);

    const chosen: typeof scorers = [];
    for (const teamId of [input.homeId, input.awayId]) {
      const best = scorers.find((item) => item.player.teamId === teamId);
      if (best) chosen.push(best);
    }
    if (!chosen.length) {
      notes.push("Marcatori: nessun titolare con un rendimento stabile sopra la soglia.");
    }
    for (const item of chosen) {
      const season = item.season!;
      const apps = season.appearances!;
      const goals = season.goals!;
      const rate = goals / apps;
      const alta =
        goals >= THRESHOLDS.scorerAltaGoals &&
        rate >= THRESHOLDS.scorerAltaPerApp &&
        apps >= THRESHOLDS.scorerAltaApps;
      const teamName = item.player.teamId === input.homeId ? input.homeName : input.awayName;
      proposals.push({
        market: "marcatore",
        selection: `Marcatore: ${item.player.name}`,
        confidence: alta ? "alta" : "media",
        sicura: false,
        probability: null,
        sortKey: 0.45 + Math.min(rate, 1) * 0.05,
        reason: `${item.player.name} (${teamName}) è tra i titolari attesi. In stagione: ${goals} gol in ${apps} presenze${
          season.subIns == null ? ` (subentri: ${DATO_ASSENTE})` : `, ${season.subIns} da subentrato`
        }, ${formatNum(rate, 2)} gol a presenza. Rigori: ${DATO_ASSENTE}. Minuti recenti: ${DATO_ASSENTE}. Senza i minuti la probabilità non viene stimata e la giocata non è sicura.`,
        safetyNote: safetyNote(null, alta),
        signals: {
          titolare: "concorde",
          gol: "concorde",
          minuti: "dato assente",
          rigori: "dato assente",
          probabilita: "dato assente",
        },
        formHome,
        formAway,
      });
    }
  }

  const homeCards = input.teamCards.find((item) => item.teamId === input.homeId) ?? null;
  const awayCards = input.teamCards.find((item) => item.teamId === input.awayId) ?? null;
  if (!homeCards || !awayCards || homeCards.matches < THRESHOLDS.teamCardSampleMin || awayCards.matches < THRESHOLDS.teamCardSampleMin) {
    notes.push(`Ammonizioni, over partita: media cartellini ${DATO_ASSENTE}.`);
  } else if (!input.referee || input.referee.matches < THRESHOLDS.refereeMinMatches) {
    notes.push(
      `Ammonizioni, over partita: media squadre ${formatNum(homeCards.cardsPerMatch)} e ${formatNum(awayCards.cardsPerMatch)} a gara. Arbitro: ${DATO_ASSENTE}. Niente over senza il segnale dell'arbitro dalla stessa parte.`,
    );
  } else {
    const expected = homeCards.cardsPerMatch + awayCards.cardsPerMatch;
    const teamsOver = expected >= THRESHOLDS.overExpectedMin;
    const refereeOver = input.referee.cardsAvg >= THRESHOLDS.refereeOverMin;
    if (teamsOver && refereeOver) {
      const alta = expected >= THRESHOLDS.overExpectedAlta && input.referee.cardsAvg >= THRESHOLDS.refereeOverAlta;
      proposals.push({
        market: "ammonizioni",
        selection: "Over 3,5 cartellini",
        confidence: alta ? "alta" : "media",
        sicura: alta,
        probability: null,
        sortKey: alta ? 0.5 : 0.42,
        reason: `Cartellini attesi circa ${formatNum(expected)} (giallo = 1, rosso = 2), somma delle medie di ${input.homeName} e ${input.awayName}. Arbitro ${input.referee.name}: media ${formatNum(input.referee.cardsAvg)} su ${input.referee.matches} gare. I due segnali indicano entrambi l'over ${formatNum(THRESHOLDS.overLine, 1)}. La probabilità dell'over è ${DATO_ASSENTE}: non viene inventata da queste due medie.`,
        safetyNote: safetyNote(null, alta),
        signals: {
          squadre: "concorde",
          arbitro: "concorde",
          probabilita: "dato assente",
        },
        formHome,
        formAway,
      });
    } else {
      notes.push(
        `Over cartellini non proposto: squadre ${teamsOver ? "sopra" : "sotto"} la linea, arbitro ${refereeOver ? "sopra" : "sotto"}. I segnali non concordano.`,
      );
    }
  }

  if (lineupReady) {
    const booked = starters
      .filter((player) => !isKeeper(player.position))
      .map((player) => ({ player, season: input.players.find((item) => item.playerId === player.playerId) }))
      .filter((item) => item.season?.yellows != null && item.season.appearances != null && item.season.fouls != null)
      .filter((item) => {
        const season = item.season!;
        const apps = season.appearances!;
        if (apps < THRESHOLDS.cardMinApps) return false;
        const yellowRate = season.yellows! / apps;
        const foulRate = season.fouls! / apps;
        return yellowRate >= THRESHOLDS.cardYellowRate && season.yellows! >= THRESHOLDS.cardYellows && foulRate >= THRESHOLDS.cardFoulRate;
      })
      .filter((item) => !injured(item.player.name, item.player.teamId))
      .sort((a, b) => b.season!.yellows! / b.season!.appearances! - a.season!.yellows! / a.season!.appearances!);
    const best = booked[0];
    if (!best) {
      notes.push("Ammonizioni, giocatore: nessun titolare con gialli e falli entrambi sopra soglia.");
    } else {
      const season = best.season!;
      const apps = season.appearances!;
      const yellowRate = season.yellows! / apps;
      const foulRate = season.fouls! / apps;
      const alta =
        yellowRate >= THRESHOLDS.cardAltaYellowRate &&
        season.yellows! >= THRESHOLDS.cardAltaYellows &&
        foulRate >= THRESHOLDS.cardAltaFoulRate;
      const teamAgrees =
        homeCards && awayCards
          ? homeCards.cardsPerMatch + awayCards.cardsPerMatch >= THRESHOLDS.overExpectedMin
          : null;
      const refereeAgrees = input.referee ? input.referee.cardsAvg >= THRESHOLDS.refereeOverMin : null;
      const sicura = alta && teamAgrees === true && refereeAgrees !== false && input.referee != null;
      proposals.push({
        market: "ammonizioni",
        selection: `Ammonito: ${best.player.name}`,
        confidence: alta ? "alta" : "media",
        sicura,
        probability: null,
        sortKey: 0.4,
        reason: `${best.player.name} è titolare atteso: ${season.yellows} gialli in ${apps} presenze (${formatNum(yellowRate, 2)} a gara) e ${formatNum(foulRate, 2)} falli a presenza. I due segnali personali concordano. Minuti: ${DATO_ASSENTE}. Probabilità numerica: ${DATO_ASSENTE}. ${
          input.referee ? `Arbitro ${input.referee.name}.` : `Arbitro: ${DATO_ASSENTE}.`
        } ${sicura ? "Anche il contesto partita va dalla stessa parte." : "Senza l'accordo di tutti i segnali non è sicura."}`,
        safetyNote: safetyNote(null, alta),
        signals: {
          gialli: "concorde",
          falli: "concorde",
          squadre: teamAgrees == null ? "dato assente" : teamAgrees ? "concorde" : "contrario",
          arbitro: refereeAgrees == null ? "dato assente" : refereeAgrees ? "concorde" : "contrario",
          minuti: "dato assente",
        },
        formHome,
        formAway,
      });
    }
  }

  if (lambdaHome == null || lambdaAway == null) {
    notes.push(`Gol attesi: ${DATO_ASSENTE}.`);
  }
  return { proposals, notes };
}

function applyNews(result: DecideResult, input: DecideInput): DecideResult {
  const fresh = freshNews(input);
  if (!fresh.length) return result;
  const shock = fresh.find(shockText);
  const text = fresh.map((item) => `${item.title}. ${item.summary}`).join(" ");
  const kept: ProposalDraft[] = [];
  for (const draft of result.proposals) {
    let next: ProposalDraft | null = draft;
    if (draft.market === "marcatore" || draft.selection.startsWith("Ammonito:")) {
      const name = draft.selection.split(":").slice(1).join(":").trim();
      if (playerNamedInShock(text, name) || shock) {
        result.suppressed.push(`${draft.selection} nascosta: una notizia dell'ultima ora contraddice i titolari o lo segnala indisponibile («${(shock ?? fresh[0]).title}»).`);
        continue;
      }
    } else if (shock) {
      next = downgrade(draft, `«${shock.title}»`);
      if (!next) {
        result.suppressed.push(`${draft.selection} nascosta dopo la notizia «${shock.title}».`);
        continue;
      }
    }
    const injuredStar = input.players.find(
      (player) =>
        (player.teamId === input.homeId || player.teamId === input.awayId) &&
        (player.goals ?? 0) >= THRESHOLDS.scorerAltaGoals &&
        playerNamedInShock(text, player.name),
    );
    if (injuredStar && next && (next.market === "doppia_chance" || next.market === "multigol" || next.market === "combo")) {
      next = downgrade(next, `${injuredStar.name} è citato come indisponibile`);
      if (!next) {
        result.suppressed.push(`${draft.selection} nascosta: un marcatore stabile risulta indisponibile nell'ultima ora.`);
        continue;
      }
    }
    if (next) kept.push(next);
  }
  result.proposals = kept;
  return result;
}

export function cardSampleFromCounts(
  teamId: string,
  recent: { cards: number }[],
  seasonCards: number | null,
  seasonMatches: number | null,
): TeamCardSample | null {
  if (recent.length >= THRESHOLDS.teamCardSampleMin) {
    const cards = recent.reduce((sum, item) => sum + item.cards, 0);
    return { teamId, matches: recent.length, cardsPerMatch: cards / recent.length, source: "ultime" };
  }
  if (seasonCards != null && seasonMatches != null && seasonMatches >= THRESHOLDS.minMatches) {
    return {
      teamId,
      matches: seasonMatches,
      cardsPerMatch: seasonCards / seasonMatches,
      source: "stagione",
    };
  }
  return null;
}
