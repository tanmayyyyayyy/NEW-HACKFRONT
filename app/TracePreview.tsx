"use client";

import { useState } from "react";
import { traceDate, type Trace } from "./collections";

export function TracePreview({ trace }: { trace: Trace }) {
  const [selected, select] = useState(trace.steps.length - 1);
  const current = trace.steps[selected];
  return (
    <section className="trace-board" aria-label="Decision timeline">
      <header><span className="repo-dot" aria-hidden="true" />{trace.repo}<span className="board-caption">Source timeline</span></header>
      <div className="map-area">
        <div className="map-route" data-selected={selected} role="group" aria-label="Select a point in the timeline">
          {trace.steps.map((step, index) => (
            <button key={step.record} type="button" aria-pressed={selected === index} onClick={() => select(index)}>
              <span>{step.record}</span>
              <strong>{index === 0 ? "Earlier record" : "Later change"}</strong>
              <time dateTime={step.date}>{traceDate(step.date)}</time>
            </button>
          ))}
        </div>
        <div className="map-detail" aria-live="polite" aria-atomic="true">
          <div className="trace-change" key={current.record}>
          <h3>{current.label}</h3>
          <p>{current.note}</p>
          <small>{current.author} · <time dateTime={current.date}>{traceDate(current.date)}</time></small>
          <a href={`https://github.com/${trace.repo}/${current.path}`} target="_blank" rel="noreferrer">Open {current.record} on GitHub ↗</a>
          </div>
        </div>
      </div>
    </section>
  );
}
