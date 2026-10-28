"use client";

import Link from "next/link";
import { PickCard } from "./PickCard";
import { usePoll } from "./usePoll";
import type { MatchPayload } from "@/lib/view";

export function MatchBoard({ id }: { id: string }) {
  const { data, error } = usePoll<MatchPayload>(`/api/partita/${id}`);
  if (!data) {
    return (
      <section className="page">
        <p>{error ? "Partita non raggiungibile. Riprovo." : "Apro la partita."}</p>
      </section>
    );
  }
  if (!data.found || !data.match) {
    return (
      <section className="page">
        <p className="kicker">Partita</p>
        <h1>Questa partita non è nel calendario.</h1>
        <Link href="/" className="text-link">Torna alla giornata</Link>
      </section>
    );
  }
  const match = data.match;
  return (
    <section className="page">
      <p className={`banner ${data.sample ? "sample" : ""}`}>{data.banner}</p>
      <p className="kicker">Giornata {match.matchday ?? "dato assente"} · aggiornato {data.updatedLabel}</p>
      <div className="scorehead">
        <div>
          <h1>{match.homeName}</h1>
          <p>{match.homeRank} · {match.homeRecord}</p>
        </div>
        <div className="scorehead-mid">
          <em className={`status ${match.status.replaceAll(" ", "-")}`}>{match.status}{match.minute ? ` ${match.minute}` : ""}</em>
          <strong>{match.scoreLabel ?? match.kickoffLabel}</strong>
        </div>
        <div className="away">
          <h1>{match.awayName}</h1>
          <p>{match.awayRank} · {match.awayRecord}</p>
        </div>
      </div>
      <p className="meta">Stadio: {match.venue}. Arbitro: {match.referee}. Gol attesi: {match.expected}.</p>
      <div className="split">
        <section>
          <h2>Forma</h2>
          <p className="hint">V vittoria, N pareggio, P sconfitta. La più recente è a destra. Prima del calcio d’inizio.</p>
          <table>
            <thead>
              <tr><th></th><th>{match.homeName}</th><th>{match.awayName}</th></tr>
            </thead>
            <tbody>
              {data.form.map((row) => (
                <tr key={row.label}><th>{row.label}</th><td>{row.home}</td><td>{row.away}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h2>Tendenza</h2>
          <table>
            <thead>
              <tr><th></th><th>{match.homeName}</th><th>{match.awayName}</th></tr>
            </thead>
            <tbody>
              {data.trends.map((row) => (
                <tr key={row.label}><th>{row.label}</th><td className={row.home === "dato assente" ? "missing" : ""}>{row.home}</td><td className={row.away === "dato assente" ? "missing" : ""}>{row.away}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <section className="block">
        <h2>Indisponibili</h2>
        {data.injuryNote ? <p className={data.injuryNote === "dato assente" ? "missing" : ""}>{data.injuryNote}</p> : null}
        <div className="split">
          {data.injuries.map((team) => (
            <div key={team.team}>
              <h3>{team.team}</h3>
              {team.lines.length ? <ul>{team.lines.map((line) => <li key={line}>{line}</li>)}</ul> : null}
            </div>
          ))}
        </div>
      </section>
      <section className="block">
        <h2>Notizie</h2>
        {data.newsNote ? <p className={data.newsNote === "dato assente" ? "missing" : ""}>{data.newsNote}</p> : null}
        <ul className="news">
          {data.news.map((item) => (
            <li key={item.link}>
              <a href={item.link} target="_blank" rel="noreferrer">{item.title}</a>
              <span>{item.source} · {item.time}</span>
              {item.summary ? <p>{item.summary}</p> : null}
            </li>
          ))}
        </ul>
      </section>
      {data.suppressed.length ? (
        <section className="block">
          <h2>Nascoste nell’ultima ora</h2>
          <ul>{data.suppressed.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>
      ) : null}
      {data.markets.map((market) => (
        <section key={market.id} className="block">
          <h2>{market.label}</h2>
          {market.id === "combo" ? (
            <p className="hint">Due gambe sulla stessa griglia di punteggi: doppia chance, multigol, gol/no gol, under/over. La quota della doppia non è nel flusso, scrivila tu. Se rende pochi centesimi, non conviene.</p>
          ) : null}
          {market.note ? <p className="hint">{market.note}</p> : null}
          {market.picks.length ? (
            <div className="slip">
              {market.picks.map((pick) => <PickCard key={pick.id} pick={pick} linked={false} />)}
            </div>
          ) : (
            <p className="empty">Nessuna proposta sopra soglia.</p>
          )}
        </section>
      ))}
    </section>
  );
}
