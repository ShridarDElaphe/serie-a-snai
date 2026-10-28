export type Market = "segno" | "doppia_chance" | "under_over" | "multigol" | "marcatore" | "ammonizioni" | "combo";
export type Confidence = "alta" | "media";
export type Origin = "live" | "ricostruzione";
export type Outcome = "pending" | "hit" | "miss" | "non_verificabile" | "void";
export type MatchStatus = "non iniziata" | "in corso" | "finita" | "rinviata";

export type FinishedMatch = {
  id: string;
  kickoff: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
};

export type StandingRow = {
  teamId: string;
  name: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
};

export type PlayerSeason = {
  playerId: string;
  teamId: string;
  name: string;
  position: string | null;
  appearances: number | null;
  subIns: number | null;
  goals: number | null;
  yellows: number | null;
  reds: number | null;
  fouls: number | null;
};

export type LineupPlayer = {
  playerId: string;
  teamId: string;
  name: string;
  position: string | null;
  starter: boolean;
};

export type TeamCardSample = {
  teamId: string;
  matches: number;
  cardsPerMatch: number;
  source: "ultime" | "stagione";
};

export type RefereeSample = {
  name: string;
  matches: number;
  cardsAvg: number;
} | null;

export type NewsItem = {
  id: string;
  title: string;
  summary: string;
  link: string;
  publishedAt: string;
  source: string;
  teamIds: string[];
};

export type InjuryItem = {
  teamId: string;
  playerName: string;
  detail: string;
};

export type SignalValue = "concorde" | "contrario" | "dato assente";

export type ProposalDraft = {
  market: Market;
  selection: string;
  confidence: Confidence;
  sicura: boolean;
  /** Stima Poisson solo per doppia chance e multigol. Null se il numero non è calcolabile senza inventarlo. */
  probability: number | null;
  sortKey: number;
  /** Prezzo letto da un bookmaker. Null se la fonte non ha quel mercato: non si inventa. */
  quota?: number | null;
  quotaBook?: string | null;
  reason: string;
  safetyNote: string;
  signals: Record<string, string | number | boolean | null>;
  formHome: string;
  formAway: string;
};

export type DecideInput = {
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  kickoff: string;
  prior: FinishedMatch[];
  standings: StandingRow[] | null;
  players: PlayerSeason[];
  lineup: LineupPlayer[] | null;
  injuries: InjuryItem[];
  teamCards: TeamCardSample[];
  referee: RefereeSample;
  news: NewsItem[];
  now: number;
  allowSquad: boolean;
  /** Quote 1X2 e totale lette da una fonte. Null se nessuna fonte ha risposto con un numero. */
  odds: BookPrice | null;
  /** Fonti quote non chiamabili, in una frase. */
  oddsNote: string;
};

export type BookPrice = {
  matchId: string;
  bookmaker: string;
  source: string;
  readAt: string;
  home: number | null;
  draw: number | null;
  away: number | null;
  totalLine: number | null;
  over: number | null;
  under: number | null;
};

export type FusionState = {
  market1: number | null;
  marketX: number | null;
  market2: number | null;
  model1: number | null;
  modelX: number | null;
  model2: number | null;
  weight: number | null;
  excludedReason: string | null;
};

export type DecideResult = {
  proposals: ProposalDraft[];
  notes: string[];
  suppressed: string[];
  expectedHome: number | null;
  expectedAway: number | null;
  formHome: string;
  formAway: string;
  fusion: FusionState;
};

export type SourceState = {
  sample: boolean;
  fixtures: "espn" | "football-data" | "sample" | "assente";
  footballDataHttp: number | null;
  footballDataNote: string;
  espn: "ok" | "errore" | "non tentato";
  news: Record<string, { status: string; items: number; newest: string | null }>;
  lineups: "presenti" | "dato assente";
  referee: "presente" | "dato assente";
  injuries: "presenti" | "nessuno segnalato" | "dato assente";
  minutes: "dato assente";
  /** Esito del tentativo su ogni fonte quote del metodo. */
  odds: string[];
  updatedAt: string | null;
  matchCount: number;
  phase: string;
  error: string | null;
};
