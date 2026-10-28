/** Soglie esplicite del modello. Non sono quote e non promettono un utile. */
export const THRESHOLDS = {
  dcMinPercent: 70,
  dcAltaPercent: 78,
  minMatches: 4,
  minVenueMatches: 2,
  crisisMaxPoints: 3,
  crisisMinGoalDiffAgainst: 4,
  crisisMinLosses: 4,
  lambdaClampMin: 0.25,
  lambdaClampMax: 3.2,
  formTiltMax: 0.12,
  multigolMediaPercent: 55,
  multigolAltaPercent: 62,
  multigolMarginMedia: 0.25,
  multigolMarginAlta: 0.45,
  scorerMinApps: 5,
  scorerMediaGoals: 3,
  scorerMediaPerApp: 0.35,
  scorerAltaGoals: 4,
  scorerAltaPerApp: 0.45,
  scorerAltaApps: 6,
  scorerMaxSubShare: 0.6,
  cardYellowRate: 0.4,
  cardYellows: 3,
  cardFoulRate: 1.2,
  cardAltaYellowRate: 0.5,
  cardAltaYellows: 4,
  cardAltaFoulRate: 1.5,
  cardMinApps: 5,
  overLine: 3.5,
  overExpectedMin: 4.2,
  overExpectedAlta: 4.8,
  refereeOverMin: 4.0,
  refereeOverAlta: 4.5,
  refereeMinMatches: 3,
  teamCardSampleMin: 3,
  newsWindowMinutes: 60,
  matchdaySpanHours: 108,
  matchdaySize: 10,
  /** Utile sotto questa cifra su €1 è «pochi centesimi» a fronte della posta intera. 1,08 → €0,08. */
  minProfitPerEuro: 0.1,
  /** Under/over entra in doppia solo se, da solo, è almeno a questa percentuale. */
  comboLegMinPercent: 60,
  /** Gol/no gol entra se il lato più probabile è almeno a questa percentuale. */
  comboGoalMinPercent: 48,
  /** Congiunta minima per mostrare la doppia sulla partita. */
  comboMinPercent: 40,
  /** Congiunta da questa percentuale, e tra le prime della partita: la doppia è alta in homepage. */
  comboAltaPercent: 55,
} as const;

export const DATO_ASSENTE = "dato assente";

export const MARKET_LABEL: Record<string, string> = {
  doppia_chance: "Doppia chance",
  multigol: "Multigol",
  marcatore: "Marcatore",
  ammonizioni: "Ammonizioni",
  combo: "Doppia",
};

export const OUTCOME_LABEL: Record<string, string> = {
  pending: "in attesa",
  hit: "centrata",
  miss: "sbagliata",
  non_verificabile: "non verificabile",
  void: "annullata",
};
