export function BrandMark() {
  return <svg className="mark" aria-hidden="true" width="30" height="30" viewBox="0 0 30 30" fill="none">
    <rect width="30" height="30" rx="8" fill="currentColor" />
    <path d="M8 20h4l6-10h4M8 10h3l2 3m4 4 2 3h3" stroke="#1c130e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function Mast({ current }: { current?: string }) {
  return <header className="sitebar">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="bar-inner">
      <a className="identity" href="/" aria-label="SkillForge home"><BrandMark />SkillForge</a>
      <nav aria-label="Site navigation">
        <a href="/workspace" aria-current={current === "workspace" ? "page" : undefined}>Workspace</a>
        <a href="/graph" aria-current={current === "graph" ? "page" : undefined}>Graph</a>
        <a href="/library" aria-current={current === "library" ? "page" : undefined}>Trace library</a>
      </nav>
      <a className="nav-account" href="/account" aria-current={current === "account" ? "page" : undefined}>Workspace access <span className="arrow" aria-hidden="true" /></a>
    </div>
  </header>;
}

export function Footer() {
  return <footer className="site-footer">
    <div className="outer footer-inner">
      <a className="identity" href="/"><BrandMark />SkillForge</a>
      <nav aria-label="Footer navigation">
        <a href="/workspace">Workspace</a>
        <a href="/graph">Graph</a>
        <a href="/library">Trace library</a>
        <a href="https://github.com/tanmayyyyayyy/NEW-HACKFRONT" target="_blank" rel="noreferrer">Source on GitHub</a>
      </nav>
    </div>
  </footer>;
}
