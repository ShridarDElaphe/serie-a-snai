"use client";

import Link from "next/link";
import { judgeStake } from "@/lib/worth";
import type { GiornataPayload, PickView } from "@/lib/view";
import { PickCard } from "./PickCard";
import { usePoll } from "./usePoll";
import { useQuotes } from "./useQuotes";

export function GiornataBoard() {
  const { data, error } = usePoll<GiornataPayload>("/api/giornata");
  const quotes = useQuotes();
  if (!data) {
    return (
      <section className="page">
        <p className="kicker">Serie A</p>
        <h1>Sto leggendo il calendario.</h1>
        <p>{error ? "Il primo contatto non è riuscito. Riprovo da solo." : "Fonti, classifica e proposte arrivano senza ricaricare la pagina."}</p>
      </section>
    );
  }
  const split = (picks: PickView[]) => {
    const stake: PickView[] = [];
    const held: PickView[] = [];
    for (const pick of picks) {
      if (judgeStake(pick.probability, quotes[pick.id], pick.confidence).conviene) stake.push(pick);
      else held.push(pick);
    }
    return { stake, held };
  };
  const stakeCount = data.slips.reduce((sum, slip) => sum + split(slip.picks).stake.length, 0);
  const altaCount = data.slips.reduce((sum, slip) => sum + slip.picks.length, 0);
  return (
    <section className="page">
      <p className={`banner ${data.sample ? "sample" : ""}`}>{data.banner}</p>
      <p className="kicker">Aggiornato {data.updatedLabel} · {data.phase}</p>
      <h1>Cosa conviene puntare</h1>
      <p className="lede">
        La probabilità alta non basta, né su una singola né su una doppia (doppia chance con multigol, gol o under/over). Su €1 e su €2 l’utile è (quota − 1) × posta: se sono pochi centesimi, o se il valore atteso è negativo, la giocata non entra nell’elenco.
        {altaCount === 0
          ? " In questa finestra nessuna proposta supera la soglia di probabilità."
          : ` ${altaCount} proposte alte, ${stakeCount} da puntare con la quota che hai scritto.`}
      </p>
      <p className="lede">{data.seasonLabel}</p>
      {data.slips.map((slip) => (
        <section key={slip.matchday} className="block">
          <header className="block-head">
            <h2>{slip.title}</h2>
            <p>{slip.note}</p>
          </header>
          {slip.picks.length ? (
            <>
              <h3 className="slip-label">Da puntare</h3>
              {split(slip.picks).stake.length ? (
                <div className="slip">
                  {split(slip.picks).stake.map((pick, index) => (
                    <PickCard key={pick.id} pick={pick} index={index} />
                  ))}
                </div>
              ) : (
                <p className="empty">Nessuna. Senza una quota SNAI che regge il conto non entra in questo elenco.</p>
              )}
              {split(slip.picks).held.length ? (
                <>
                  <h3 className="slip-label">Non da puntare</h3>
                  <div className="slip">
                    {split(slip.picks).held.map((pick, index) => (
                      <PickCard key={pick.id} pick={pick} index={index} />
                    ))}
                  </div>
                </>
              ) : null}
            </>
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
