"use client";
import { useState } from "react";
import { collections } from "./collections";
export function TracePreview() {
  const [selected, change] = useState(0);
  const trail = collections[0];
  return <section className="trace-board" aria-label="Interactive decision preview">
    <header><span className="repo-dot" /> AppFuton / Futon <span className="board-caption">Decision map</span></header>
    <div className="map-area"><div className="map-route">{trail.records.map((r,i) =>
      <button key={r} type="button" aria-pressed={selected === i} onClick={() => change(i)}><span>{r}</span><strong>{trail.labels[i]}</strong></button>)}</div>
      <div className="map-detail" key={selected}><small>{trail.dates[selected]} · PoonHarpoon</small><p>{trail.notes[selected]}</p>
        <a href={"https://github.com/AppFuton/Futon/"+trail.links[selected]} target="_blank" rel="noreferrer">Inspect source ↗</a></div></div>
  </section>;
}
