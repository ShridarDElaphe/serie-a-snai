"use client";

import Link from "next/link";
import { PickCard } from "./PickCard";
import { usePoll } from "./usePoll";
import type { GiornataPayload } from "@/lib/view";

export function GiornataBoard() {
  const { data, error } = usePoll<GiornataPayload>("/api/giornata");
  if (!data) {
    return (
      <section className="page">
        <p className="kicker">Serie A</p>
        <h1>Sto leggendo il calendario.</h1>
        <p>{error ? "Il primo contatto non è riuscito. Riprovo da solo." : "Fonti, classifica e proposte arrivano senza ricaricare la pagina."}</p>
      </section>
    );
  }
  const total = data.slips.reduce((sum, slip) => sum + slip.picks.length, 0);
  return (
    <section className="page">
      <p className={`banner ${data.sample ? "sample" : ""}`}>{data.banner}</p>
      <p className="kicker">Aggiornato {data.updatedLabel} · {data.phase}</p>
      <h1>Le proposte più prudenti</h1>
      <p className="lede">
        Solo confidenza alta, dalla più sicura alla meno sicura, per costruire una schedina cauta.
        {total === 0 ? " In questa finestra nessuna proposta supera la soglia." : ` ${total} proposte, sulla giornata di oggi e sulla successiva.`}
      </p>
      <p className="lede">{data.seasonLabel}</p>
      {data.slips.map((slip) => (
        <section key={slip.matchday} className="block">
          <header className="block-head">
            <h2>{slip.title}</h2>
            <p>{slip.note}</p>
          </header>
          {slip.picks.length ? (
            <div className="slip">
              {slip.picks.map((pick, index) => (
                <PickCard key={pick.id} pick={pick} index={index} />
              ))}
            </div>
          ) : (
            <p className="empty">Nessuna proposta ad alta confidenza. Sotto soglia, o con un segnale contrario, resta nella pagina della partita oppure non viene proprio suggerita.</p>
          )}
        </section>
      ))}
      {data.matchdays.map((day) => (
        <section key={`list-${day.number}`} className="block">
          <header className="block-head">
            <h2>Partite, giornata {day.number}</h2>
          </header>
          <div className="fixture-list">
            {day.matches.map((match) => (
              <Link key={match.id} href={`/partita/${match.id}`} className="fixture">
                <div>
                  <strong>{match.homeName}</strong>
                  <span>{match.homeRank} · {match.homeRecord}</span>
                </div>
                <div className="fixture-mid">
                  <em className={`status ${match.status.replaceAll(" ", "-")}`}>{match.status}{match.minute ? ` ${match.minute}` : ""}</em>
                  <b>{match.scoreLabel ?? match.kickoffLabel}</b>
                  {match.altaCount ? <small>{match.altaCount} alte</small> : <small>nessuna alta</small>}
                </div>
                <div className="away">
                  <strong>{match.awayName}</strong>
                  <span>{match.awayRank} · {match.awayRecord}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
      <details className="rules">
        <summary>Come vengono scelte</summary>
        {data.rules.map((rule) => (
          <p key={rule.slice(0, 24)}>{rule}</p>
        ))}
      </details>
      <ul className="sources">
        {data.sourceNotes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </section>
  );
}
