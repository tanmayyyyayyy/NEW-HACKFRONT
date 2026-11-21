import { Mast } from "./Mast";

export default function NotFound() {
  return <><Mast /><main className="outer" id="main-content"><section className="section-title">
    <h1>Page not found</h1>
    <p>This page may have moved. You can still open the workspace or browse example traces.</p>
    <div className="hero-actions"><a className="ink-button" href="/workspace">Open workspace</a><a href="/library">Trace library</a></div>
  </section></main></>;
}
