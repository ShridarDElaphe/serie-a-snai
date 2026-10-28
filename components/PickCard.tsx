import Link from "next/link";
import type { PickView } from "@/lib/view";

export function PickCard({ pick, index, linked = true }: { pick: PickView; index?: number; linked?: boolean }) {
  return (
    <article className={`pick ${pick.confidence}`}>
      <div className="pick-top">
        <span className="ordinal">{index != null ? String(index + 1).padStart(2, "0") : pick.marketLabel}</span>
        <span className={`confidence ${pick.confidence}`}>{pick.confidence}</span>
        {pick.sicura ? (
          <span className="sicura" title="I segnali concordano. Non è una vincita garantita.">
            Sicura
          </span>
        ) : null}
        <span className="prob">{pick.probabilityLabel}</span>
      </div>
      <h3>{pick.selection}</h3>
      <p className="meta">
        {pick.homeName}–{pick.awayName} · {pick.kickoffLabel} · {pick.status}
        {pick.scoreLabel ? ` · ${pick.scoreLabel}` : ""}
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
