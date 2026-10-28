import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

export type Sql = string | number | null;

type Db = InstanceType<typeof DatabaseSyncType>;

const globalDb = globalThis as unknown as { __margineDb?: Db };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  kickoff TEXT NOT NULL,
  matchday INTEGER,
  status TEXT NOT NULL,
  minute TEXT,
  home_id TEXT NOT NULL,
  home_name TEXT NOT NULL,
  away_id TEXT NOT NULL,
  away_name TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  venue TEXT,
  referee TEXT,
  summary_done INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  raw_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS standings (
  team_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  rank INTEGER NOT NULL,
  played INTEGER NOT NULL,
  won INTEGER NOT NULL,
  drawn INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  gf INTEGER NOT NULL,
  ga INTEGER NOT NULL,
  points INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  appearances INTEGER,
  sub_ins INTEGER,
  goals INTEGER,
  yellows INTEGER,
  reds INTEGER,
  fouls INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, team_id)
);
CREATE TABLE IF NOT EXISTS injuries (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  detail TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lineups (
  match_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  position TEXT,
  starter INTEGER NOT NULL,
  PRIMARY KEY (match_id, team_id, player_id)
);
CREATE TABLE IF NOT EXISTS match_cards (
  match_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  yellows INTEGER NOT NULL,
  reds INTEGER NOT NULL,
  fouls INTEGER,
  PRIMARY KEY (match_id, team_id)
);
CREATE TABLE IF NOT EXISTS match_goals (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_id TEXT,
  minute TEXT,
  penalty INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id, minute)
);
CREATE TABLE IF NOT EXISTS player_cards (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team_id TEXT,
  red INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id)
);
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  link TEXT NOT NULL,
  published_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS news_teams (
  news_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  PRIMARY KEY (news_id, team_id)
);
CREATE TABLE IF NOT EXISTS assessments (
  match_id TEXT PRIMARY KEY,
  notes_json TEXT NOT NULL,
  suppressed_json TEXT NOT NULL,
  expected_home REAL,
  expected_away REAL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  confidence TEXT NOT NULL,
  sicura INTEGER NOT NULL,
  probability REAL,
  sort_key REAL NOT NULL,
  reason TEXT NOT NULL,
  safety_note TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  form_home TEXT NOT NULL,
  form_away TEXT NOT NULL,
  origin TEXT NOT NULL,
  created_at TEXT NOT NULL,
  frozen_at TEXT,
  outcome TEXT NOT NULL,
  outcome_note TEXT,
  settled_at TEXT
);
CREATE INDEX IF NOT EXISTS proposals_match ON proposals(match_id, origin);
CREATE INDEX IF NOT EXISTS matches_kickoff ON matches(kickoff);
`;

function dataDir(): string {
  // Vercel serverless disks are read-only except /tmp, and /tmp is wiped with the instance.
  if (process.env.VERCEL) return "/tmp/margine";
  return path.join(process.cwd(), "data");
}

export function getDb(): Db {
  if (globalDb.__margineDb) return globalDb.__margineDb;
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "margine.sqlite"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  globalDb.__margineDb = db;
  return db;
}

export function run(sql: string, ...params: Sql[]) {
  return getDb().prepare(sql).run(...params);
}

export function all<T>(sql: string, ...params: Sql[]): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: Sql[]): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function metaGet(key: string): string | null {
  return get<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)?.value ?? null;
}

export function metaSet(key: string, value: string) {
  run(
    "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export function wipeDatabase() {
  const db = getDb();
  db.exec(`
    DELETE FROM proposals;
    DELETE FROM assessments;
    DELETE FROM news_teams;
    DELETE FROM news;
    DELETE FROM player_cards;
    DELETE FROM match_goals;
    DELETE FROM match_cards;
    DELETE FROM lineups;
    DELETE FROM injuries;
    DELETE FROM players;
    DELETE FROM standings;
    DELETE FROM teams;
    DELETE FROM matches;
    DELETE FROM meta;
  `);
}
