"use client";

import Link from "next/link";
import { judgeStake } from "@/lib/worth";
import type { PickView } from "@/lib/view";
import { setQuote, useQuotes } from "./useQuotes";

export function PickCard({ pick, index, linked = true }: { pick: PickView; index?: number; linked?: boolean }) {
  const quotes = useQuotes();
  const raw = quotes[pick.id] ?? "";
  const judgement = judgeStake(pick.probability, raw, pick.confidence);
  return (
    <article className={`pick ${pick.confidence} ${judgement.conviene ? "conviene" : "non-conviene"}`}>
      <div className="pick-top">
        <span className="ordinal">{index != null ? String(index + 1).padStart(2, "0") : pick.marketLabel}</span>
        <span className={`confidence ${pick.confidence}`}>{pick.confidence}</span>
        <span className={`verdict ${judgement.conviene ? "ok" : "bad"}`}>{judgement.headline.replace(/\.$/, "")}</span>
        <span className="prob">{pick.probabilityLabel}</span>
      </div>
      <h3>{pick.selection}</h3>
      <p className="meta">
        {pick.homeName}–{pick.awayName} · {pick.kickoffLabel} · {pick.status}
        {pick.scoreLabel ? ` · ${pick.scoreLabel}` : ""}
      </p>
      <div className="quota-row">
        <label>
          Quota SNAI
          <input
            inputMode="decimal"
            placeholder="es. 1,50"
            aria-label={`Quota SNAI per ${pick.selection}`}
            value={raw}
            onChange={(event) => setQuote(pick.id, event.target.value)}
          />
        </label>
        <p>Poste di prova: €1 e €2. Il campo resta vuoto finché non scrivi la quota.</p>
      </div>
      <p className="worth">
        <strong>{judgement.headline}</strong> {judgement.detail}
      </p>
      <p className="reason">{pick.reason}</p>
      <p className="form-line">
        <span>Forma {pick.homeName}</span> {pick.formHome}
        <span> {pick.awayName}</span> {pick.formAway}
      </p>
      <p className="safety">{pick.safetyNote}</p>
      {pick.signals.length ? (
        <ul className="signals">
          {pick.signals.map((signal) => (
            <li key={signal.label} className={signal.value === "dato assente" ? "missing" : signal.value}>
              {signal.label}: {signal.value}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="origin">
        Esito: {pick.outcomeLabel}
        {pick.outcome !== "pending" ? ` · ${pick.originLabel}` : ""}
      </p>
      {linked ? (
        <Link href={`/partita/${pick.matchId}`} className="text-link">
          Apri la partita
        </Link>
      ) : null}
    </article>
  );
}
