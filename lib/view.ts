export type SignalChip = { label: string; value: string };

export type PickView = {
  id: string;
  matchId: string;
  market: string;
  marketLabel: string;
  selection: string;
  confidence: "alta" | "media";
  sicura: boolean;
  probabilityLabel: string;
  reason: string;
  safetyNote: string;
  formHome: string;
  formAway: string;
  homeName: string;
  awayName: string;
  kickoffLabel: string;
  matchday: number | null;
  status: string;
  scoreLabel: string | null;
  signals: SignalChip[];
  outcome: string;
  outcomeLabel: string;
  originLabel: string;
};

export type MatchRowView = {
  id: string;
  kickoffLabel: string;
  status: string;
  minute: string | null;
  homeName: string;
  awayName: string;
  homeRank: string;
  awayRank: string;
  homeRecord: string;
  awayRecord: string;
  scoreLabel: string | null;
  venue: string;
  altaCount: number;
};

export type GiornataPayload = {
  ready: boolean;
  phase: string;
  updatedLabel: string;
  sample: boolean;
  banner: string;
  sourceNotes: string[];
  seasonLabel: string;
  slips: { matchday: number; role: string; title: string; note: string; picks: PickView[] }[];
  matchdays: { number: number; role: string; title: string; matches: MatchRowView[] }[];
  rules: string[];
};

export type MarketBlock = {
  id: string;
  label: string;
  picks: PickView[];
  note: string;
};

export type MatchPayload = {
  ready: boolean;
  found: boolean;
  sample: boolean;
  banner: string;
  updatedLabel: string;
  match: {
    id: string;
    matchday: number | null;
    kickoffLabel: string;
    status: string;
    minute: string | null;
    venue: string;
    referee: string;
    homeName: string;
    awayName: string;
    homeRank: string;
    awayRank: string;
    homeRecord: string;
    awayRecord: string;
    scoreLabel: string | null;
    expected: string;
  } | null;
  form: { label: string; home: string; away: string }[];
  trends: { label: string; home: string; away: string }[];
  injuries: { team: string; lines: string[] }[];
  injuryNote: string;
  news: { title: string; source: string; time: string; link: string; summary: string }[];
  newsNote: string;
  markets: MarketBlock[];
  suppressed: string[];
};

export type StoricoPayload = {
  ready: boolean;
  sample: boolean;
  banner: string;
  updatedLabel: string;
  note: string;
  rates: {
    market: string;
    label: string;
    hits: number;
    misses: number;
    pending: number;
    unverified: number;
    rateLabel: string;
  }[];
  rows: PickView[];
};
