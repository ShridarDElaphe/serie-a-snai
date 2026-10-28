"use client";

import { useMemo, useState } from "react";
import { PickCard } from "./PickCard";
import { usePoll } from "./usePoll";
import type { StoricoPayload } from "@/lib/view";

const FILTERS = [
  { id: "tutti", label: "Tutti" },
  { id: "doppia_chance", label: "Doppia chance" },
  { id: "multigol", label: "Multigol" },
  { id: "marcatore", label: "Marcatori" },
  { id: "ammonizioni", label: "Ammonizioni" },
];

export function StoricoBoard() {
  const { data, error } = usePoll<StoricoPayload>("/api/storico", 30000);
  const [filter, setFilter] = useState("tutti");
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    if (!data) return [];
    const filtered = filter === "tutti" ? data.rows : data.rows.filter((row) => row.market === filter);
    return showAll ? filtered : filtered.slice(0, 24);
  }, [data, filter, showAll]);
  const filteredCount = useMemo(() => {
    if (!data) return 0;
    return filter === "tutti" ? data.rows.length : data.rows.filter((row) => row.market === filter).length;
  }, [data, filter]);
  if (!data) {
    return <section className="page"><p>{error ? "Storico non raggiungibile. Riprovo." : "Apro lo storico."}</p></section>;
  }
  return (
    <section className="page">
      <p className={`banner ${data.sample ? "sample" : ""}`}>{data.banner}</p>
      <p className="kicker">Aggiornato {data.updatedLabel}</p>
      <h1>Storico delle proposte</h1>
      <p className="lede">{data.note}</p>
      <div className="rates">
        {data.rates.map((rate) => (
          <article key={rate.market}>
            <h2>{rate.label}</h2>
            <strong className={rate.rateLabel === "dato assente" ? "missing" : ""}>{rate.rateLabel}</strong>
            <p>{rate.hits} centrate · {rate.misses} sbagliate</p>
            <p>{rate.pending} in attesa · {rate.unverified} non verificabili</p>
          </article>
        ))}
      </div>
      <div className="filters">
        {FILTERS.map((item) => (
          <button key={item.id} type="button" className={filter === item.id ? "on" : ""} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="slip">
          {rows.map((pick) => <PickCard key={pick.id} pick={pick} />)}
        </div>
      ) : (
        <p className="empty">Ancora nessuna proposta in questo filtro.</p>
      )}
      {filteredCount > 24 ? (
        <button type="button" className="text-link more" onClick={() => setShowAll((value) => !value)}>
          {showAll ? "Mostra solo le 24 più recenti" : `Mostra tutte le ${filteredCount}`}
        </button>
      ) : null}
    </section>
  );
}
