"use client";

import Link from "next/link";
import { judgeStake } from "@/lib/worth";
import type { GiornataPayload, MatchRowView, PickView } from "@/lib/view";
import { PickCard } from "./PickCard";
import { sortPicks } from "./sortPicks";
import { usePoll } from "./usePoll";

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
  const worthCount = (picks: PickView[]) =>
    picks.filter((pick) => judgeStake(pick.probability, pick.quotaRaw, pick.confidence).conviene).length;
  const stakeCount = data.slips.reduce((sum, slip) => sum + worthCount(slip.picks), 0);
  const pickCount = data.slips.reduce((sum, slip) => sum + slip.picks.length, 0);
  const groupsFor = (day: number, picks: PickView[]) => {
    const fixtures = data.matchdays.find((item) => item.number === day)?.matches ?? [];
    const seen = new Set<string>();
    const groups: { match: MatchRowView; picks: PickView[] }[] = [];
    for (const match of fixtures) {
      const mine = sortPicks(picks.filter((pick) => pick.matchId === match.id));
      if (!mine.length) continue;
      seen.add(match.id);
      groups.push({ match, picks: mine });
    }
    for (const pick of picks) {
      if (seen.has(pick.matchId)) continue;
      seen.add(pick.matchId);
      const mine = sortPicks(picks.filter((item) => item.matchId === pick.matchId));
      groups.push({
        match: {
          id: pick.matchId,
          kickoffLabel: pick.kickoffLabel,
          status: pick.status,
          minute: null,
          homeName: pick.homeName,
          awayName: pick.awayName,
          homeRank: "",
          awayRank: "",
          homeRecord: "",
          awayRecord: "",
          scoreLabel: pick.scoreLabel,
          venue: "",
          altaCount: 0,
        },
        picks: mine,
      });
    }
    return groups;
  };
  return (
    <section className="page">
      <p className={`banner ${data.sample ? "sample" : ""}`}>{data.banner}</p>
      <p className="kicker">Aggiornato {data.updatedLabel} · {data.phase}</p>
      <h1>Cosa conviene puntare</h1>
      <p className="lede">
        Le giocate restano raggruppate per partita. La quota arriva da una fonte, se la fonte risponde: non c’è un campo da compilare. Su €1 e su €2 l’utile è (quota − 1) × posta. Pochi centesimi, come 1,08, o un valore atteso negativo, non diventano una giocata da puntare.
        {pickCount === 0
          ? " In questa finestra nessuna proposta supera la soglia."
          : ` ${pickCount} proposte, ${stakeCount} da puntare sul prezzo letto.`}
      </p>
      <p className="lede">{data.seasonLabel}</p>
      <section className="block">
        <header className="block-head">
          <h2>Schedine del metodo</h2>
          <p>Prudente, equilibrata, coraggiosa. Al massimo cinque eventi, dal meno probabile al più probabile. La quota della multipla è il prodotto delle quote lette.</p>
        </header>
        <div className="schedine">
          {data.schedine.map((slip) => (
            <article key={slip.id} className={`schedina ${slip.conviene ? "conviene" : "non-conviene"}`}>
              <h3>{slip.title}</h3>
              <p className={`verdict ${slip.conviene ? "ok" : "bad"}`}>{slip.headline.replace(/\.$/, "")}</p>
              <p>{slip.note}</p>
              {slip.events.length ? (
                <ol>
                  {slip.events.map((event) => (
                    <li key={`${slip.id}-${event.matchId}-${event.selection}`}>
                      <Link href={`/partita/${event.matchId}`}>{event.label}</Link>
                      {": "}
                      {event.selection} · {event.probabilityLabel} · quota {event.quotaLabel}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="empty">Nessun evento in questa fascia.</p>
              )}
              <p className="worth">
                <strong>{slip.probabilityLabel}</strong> insieme · quota {slip.quotaLabel}. {slip.detail}
              </p>
            </article>
          ))}
        </div>
      </section>
      {data.slips.map((slip) => (
        <section key={slip.matchday} className="block">
          <header className="block-head">
            <h2>{slip.title}</h2>
            <p>{slip.note}</p>
          </header>
          {slip.picks.length ? (
            groupsFor(slip.matchday, slip.picks).map((group) => (
              <section key={group.match.id} className="match-group">
                <h3>
                  {group.match.homeName}–{group.match.awayName}
                </h3>
                <p className="hint">
                  {group.match.status}
                  {group.match.scoreLabel ? ` · ${group.match.scoreLabel}` : ` · ${group.match.kickoffLabel}`}
                  {" · "}
                  {worthCount(group.picks) === 0
                    ? "Nessuna di queste conviene sul prezzo letto."
                    : `${worthCount(group.picks)} da puntare sul prezzo letto.`}
                </p>
                <div className="slip">
                  {group.picks.map((pick, index) => (
                    <PickCard key={pick.id} pick={pick} index={index} />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <p className="empty">Nessuna proposta sopra soglia. Resta nella pagina della partita oppure non viene proprio suggerita.</p>
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
