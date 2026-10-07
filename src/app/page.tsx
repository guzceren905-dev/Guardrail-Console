"use client";

import { useMemo, useState } from "react";

type Protocol = "x402" | "MPP Charge";
type Filter = "All activity" | Protocol;

type Activity = {
  id: string;
  protocol: Protocol;
  amount: number;
  recipient: string;
  time: string;
  result: "Settled" | "Rejected";
  note: string;
};

const activity: Activity[] = [
  { id: "demo-01", protocol: "x402", amount: 0.08, recipient: "api.orbitdata.dev", time: "2 min ago", result: "Settled", note: "Paid API request" },
  { id: "demo-02", protocol: "MPP Charge", amount: 0.12, recipient: "weather.mpp.demo", time: "18 min ago", result: "Settled", note: "Charge intent" },
  { id: "demo-03", protocol: "x402", amount: 0.45, recipient: "compute.example.dev", time: "41 min ago", result: "Rejected", note: "Recipient not allowlisted" },
  { id: "demo-04", protocol: "MPP Charge", amount: 0.05, recipient: "search.mpp.demo", time: "1 hr ago", result: "Settled", note: "Charge intent" },
];

const navItems = [
  { label: "Overview", icon: "◫", active: true },
  { label: "Activity", icon: "↗", active: false },
  { label: "Policies", icon: "⌘", active: false },
  { label: "Settings", icon: "⚙", active: false },
];

function MetricCard({ label, value, detail, accent, icon }: {
  label: string; value: string; detail: string; accent: "mint" | "blue" | "violet"; icon: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span className="metric-label">{label}</span>
        <span className={"metric-icon " + accent}>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function SpendingChart() {
  return (
    <div className="chart-wrap" aria-label="Sample spending trend for the last 24 hours">
      <div className="chart-y-labels"><span>$0.50</span><span>$0.35</span><span>$0.20</span><span>$0.05</span></div>
      <svg className="chart" viewBox="0 0 680 220" role="img" aria-label="Sample spending trend">
        <defs>
          <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#6ce5c0" stopOpacity=".25" />
            <stop offset="100%" stopColor="#6ce5c0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="chart-grid" d="M0 24H680 M0 78H680 M0 132H680 M0 186H680" />
        <path className="chart-area" d="M0 164 C34 160 40 126 80 136 S122 154 160 120 S205 116 240 122 S290 82 320 104 S362 137 400 92 S444 76 480 88 S524 110 560 66 S610 87 640 48 S667 62 680 34 L680 205 L0 205Z" />
        <path className="chart-line" d="M0 164 C34 160 40 126 80 136 S122 154 160 120 S205 116 240 122 S290 82 320 104 S362 137 400 92 S444 76 480 88 S524 110 560 66 S610 87 640 48 S667 62 680 34" />
        <circle className="chart-dot" cx="680" cy="34" r="5" />
      </svg>
      <div className="chart-x-labels"><span>12 AM</span><span>4 AM</span><span>8 AM</span><span>12 PM</span><span>4 PM</span><span>8 PM</span><span>Now</span></div>
    </div>
  );
}

function ActivityTable({ rows }: { rows: Activity[] }) {
  return (
    <div className="activity-table-wrap">
      <table className="activity-table">
        <thead><tr><th>Payment</th><th>Protocol</th><th>Amount</th><th>Result</th><th>Time</th></tr></thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td><div className="recipient">{item.recipient}</div><div className="activity-note">{item.note}</div></td>
              <td><span className={"protocol-tag " + (item.protocol === "x402" ? "x402-tag" : "mpp-tag")}>{item.protocol}</span></td>
              <td className="amount-cell">{"$" + item.amount.toFixed(2)} <span>USDC</span></td>
              <td><span className={"result-tag " + (item.result === "Settled" ? "settled" : "rejected")}><i />{item.result}</span></td>
              <td className="time-cell">{item.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty-state">No sample activity for this filter.</div>}
    </div>
  );
}

export default function Home() {
  const [filter, setFilter] = useState<Filter>("All activity");
  const [range, setRange] = useState("24 hours");
  const rows = useMemo(
    () => activity.filter((item) => filter === "All activity" || item.protocol === filter),
    [filter],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Guardrail Console home">
          <span className="brand-mark"><span /></span>
          <span>guardrail<span className="brand-light">.console</span></span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch">
          <span className="workspace-avatar">A</span>
          <span className="workspace-copy"><strong>Agent Treasury</strong><small>Demo workspace</small></span>
          <span className="chevron">⌄</span>
        </button>
        <div className="nav-section-label">MONITOR</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <a className={"nav-link" + (item.active ? " active" : "")} href={item.active ? "#overview" : "#"} key={item.label} aria-current={item.active ? "page" : undefined}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.label === "Activity" && <span className="nav-count">4</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="network-card">
          <div className="network-head"><span className="network-dot" /> STELLAR TESTNET</div>
          <div className="network-state">Wallet not connected</div>
          <div className="network-address">No account selected</div>
          <button className="network-button" disabled>Connect account <span>↗</span></button>
        </div>
        <div className="sidebar-footer">
          <span className="footer-avatar">GC</span>
          <span><strong>Guardrail Console</strong><small>Preview build</small></span>
          <span className="more">•••</span>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><b>/</b><strong>Overview</strong></div>
          <div className="topbar-actions">
            <span className="preview-pill"><i /> PREVIEW MODE</span>
            <button className="help-button" aria-label="Help">?</button>
            <span className="user-avatar">GC</span>
          </div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow">STELLAR TESTNET <span>·</span> SINGLE AGENT</div>
              <h1>Agent treasury</h1>
              <p className="page-subtitle">A clear view of what your agent can spend, and where it goes.</p>
            </div>
            <button className="revoke-button" disabled title="Connect a wallet to manage agent authorization"><span>⏸</span> Revoke agent access</button>
          </section>

          <div className="preview-notice">
            <span className="notice-icon">i</span>
            <div><strong>Preview data</strong><span>This screen uses sample activity. No wallet is connected and no live Stellar data is shown.</span></div>
            <span className="notice-close" aria-hidden="true">×</span>
          </div>

          <section className="metrics-grid" aria-label="Treasury summary">
            <MetricCard label="Treasury balance" value="$1,284.60" detail="Sample balance · USDC" accent="mint" icon="$" />
            <MetricCard label="Spent in rolling 24h" value="$0.70" detail="Sample policy cap: $500.00" accent="blue" icon="↗" />
            <MetricCard label="Budget remaining" value="$499.30" detail="Rolling 24-hour window" accent="violet" icon="◷" />
          </section>

          <section className="middle-grid">
            <article className="panel spending-panel">
              <div className="panel-heading">
                <div><h2>Spending activity</h2><p>Sample confirmed payments over time</p></div>
                <label className="select-wrap"><span className="sr-only">Chart time range</span><select value={range} onChange={(event) => setRange(event.target.value)}><option>24 hours</option><option>7 days</option></select><span className="select-chevron">⌄</span></label>
              </div>
              <div className="chart-total"><strong>$0.70</strong><span>sample USDC spend</span></div>
              <SpendingChart />
            </article>

            <article className="panel policy-panel">
              <div className="panel-heading"><div><h2>Active guardrails</h2><p>Sample smart account policy</p></div><button className="icon-button" aria-label="Policy options">•••</button></div>
              <div className="policy-status"><span className="status-check">✓</span><span><strong>Policy active</strong><small>Sample configuration</small></span></div>
              <div className="policy-rule"><div className="rule-icon cap-icon">↗</div><div className="rule-copy"><strong>Rolling spend cap</strong><small>$500.00 USDC per 24h</small></div><span className="rule-check">✓</span></div>
              <div className="policy-rule"><div className="rule-icon allow-icon">⌑</div><div className="rule-copy"><strong>Recipient allowlist</strong><small>4 approved destinations</small></div><span className="rule-check">✓</span></div>
              <div className="policy-rule"><div className="rule-icon owner-icon">♙</div><div className="rule-copy"><strong>Owner emergency revoke</strong><small>Agent authorization can be removed</small></div><span className="rule-check">✓</span></div>
              <button className="text-action" disabled>Manage policy <span>→</span></button>
            </article>
          </section>

          <section className="panel activity-panel">
            <div className="activity-heading">
              <div><h2>Recent payments</h2><p>Sample events · no on-chain transaction links</p></div>
              <div className="activity-tools">
                <div className="filter-tabs" role="tablist" aria-label="Filter by protocol">
                  {(["All activity", "x402", "MPP Charge"] as Filter[]).map((item) => (
                    <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>{item}</button>
                  ))}
                </div>
                <button className="export-button" disabled>Export <span>⇩</span></button>
              </div>
            </div>
            <ActivityTable rows={rows} />
            <div className="table-foot"><span>Showing sample data</span><button disabled>View all activity <span>→</span></button></div>
          </section>

          <footer className="page-footer"><span><i /> Sample data · read-only preview</span><span>Built on Stellar <b>✳</b></span></footer>
        </div>
      </main>
    </div>
  );
}
