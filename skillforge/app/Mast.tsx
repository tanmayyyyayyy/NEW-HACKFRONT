export function Mast({ current }: { current?: string }) {
  return <header className="sitebar"><div className="bar-inner"><a className="identity" href="/" aria-label="SkillForge home"><span aria-hidden="true" className="mark">⌘</span> SkillForge</a>
    <nav aria-label="Site navigation"><a href="/library" aria-current={current === "library" ? "page" : undefined}>Trace library</a><a className="nav-account" href="/account">Workspace access ↗</a></nav>
  </div></header>;
}
