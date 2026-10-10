"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardState } from "@/lib/state";

type Activity = DashboardState["activity"][number];
type Filter = "All" | "x402" | "Direct" | "Blocked" | "Deposits";

const REFRESH_MS = 10_000;
const UNIT = 10_000_000n;

const REASONS: Record<number, string> = {
  3221: "Over daily cap",
  3303: "Recipient not allowlisted",
  3016: "Agent frozen",
  3002: "Not permitted by rule",
};

/** Formats USDC base units (7 decimals) with at least 2 decimals. */
function usdc(units: string | bigint): string {
  const v = BigInt(units);
  const sign = v < 0n ? "-" : "";
  const abs = v < 0n ? -v : v;
  const whole = (abs / UNIT).toLocaleString("en-US");
  const frac = (abs % UNIT).toString().padStart(7, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${sign}$${whole}.${frac}`;
}

const toNumber = (units: string | bigint) => Number(BigInt(units)) / 1e7;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function useDashboard() {
  const [data, setData] = useState<DashboardState>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const body = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setData(body);
        setError(undefined);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return { data, error };
}

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

function SpendingChart({ data, now }: { data: DashboardState; now: number }) {
  const cap = toNumber(data.dailyCap);
  const series = useMemo(() => {
    const start = now - 24 * 3600 * 1000;
    const payments = data.activity
      .filter((a) => a.kind === "payment" && a.initiator !== "owner" && Date.parse(a.closedAt) > start)
      .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
    let total = 0;
    const points = [{ t: start, spent: 0 }];
    for (const p of payments) {
      total += toNumber(p.amount);
      points.push({ t: Date.parse(p.closedAt), spent: Number(total.toFixed(7)) });
    }
    points.push({ t: now, spent: Number(total.toFixed(7)) });
    return points;
  }, [data.activity, now]);
  const peak = Math.max(cap, series[series.length - 1].spent);

  return (
    <div className="chart-box" aria-label="Agent spend over the last 24 hours against the daily cap">
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={series} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6ce5c0" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#6ce5c0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#edf1f1" strokeDasharray="3 4" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[now - 24 * 3600 * 1000, now]}
            tickFormatter={(t: number) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            tick={{ fontSize: 9, fill: "#a9b2b5" }}
            tickLine={false}
            axisLine={false}
            tickCount={6}
          />
          <YAxis
            domain={[0, Number((peak * 1.15).toFixed(2))]}
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fontSize: 9, fill: "#a9b2b5" }}
            tickLine={false}
            axisLine={false}
            width={42}
          />
          <Tooltip
            formatter={(v) => [`$${Number(v).toFixed(2)} USDC`, "Spent"]}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
          />
          <ReferenceLine y={cap} stroke="#d98a7e" strokeDasharray="5 4" label={{ value: `Cap $${cap}`, position: "insideTopRight", fontSize: 9, fill: "#c0675b" }} />
          <Area type="stepAfter" dataKey="spent" stroke="#43cba1" strokeWidth={2.5} fill="url(#areaFill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function railOf(a: Activity): { label: string; className: string } {
  if (a.kind === "deposit") return { label: "Deposit", className: "deposit-tag" };
  if (a.initiator === "x402") return { label: "x402", className: "x402-tag" };
  if (a.initiator === "owner") return { label: "Owner", className: "owner-tag" };
  return { label: "Direct", className: "direct-tag" };
}

function ActivityTable({ rows, data, now }: { rows: Activity[]; data: DashboardState; now: number }) {
  return (
    <div className="activity-table-wrap">
      <table className="activity-table">
        <thead><tr><th>Counterparty</th><th>Rail</th><th>Amount</th><th>Result</th><th>Time</th><th>Tx</th></tr></thead>
        <tbody>
          {rows.map((a) => {
            const rail = railOf(a);
            const blocked = a.kind === "blocked";
            return (
              <tr key={a.id}>
                <td>
                  <div className="recipient">{a.label ?? short(a.counterparty)}</div>
                  <div className="activity-note">{a.kind === "deposit" ? "from " : "to "}{short(a.counterparty)}</div>
                </td>
                <td><span className={"protocol-tag " + rail.className}>{rail.label}</span></td>
                <td className="amount-cell">{(a.kind === "deposit" ? "+" : "") + usdc(a.amount)} <span>USDC</span></td>
                <td>
                  <span className={"result-tag " + (blocked ? "rejected" : "settled")}>
                    <i />{blocked ? `Blocked · ${REASONS[a.errorCode ?? 0] ?? `error #${a.errorCode}`}` : a.kind === "deposit" ? "Received" : "Settled"}
                  </span>
                </td>
                <td className="time-cell" title={new Date(a.closedAt).toLocaleString()}>{ago(a.closedAt, now)}</td>
                <td><a className="tx-link" href={`${data.explorerUrl}/tx/${a.txHash}`} target="_blank" rel="noreferrer">{a.txHash.slice(0, 6)}↗</a></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="empty-state">No activity for this filter yet.</div>}
    </div>
  );
}

function CapAlert({ data }: { data: DashboardState }) {
  if (data.frozen) {
    return (
      <div className="alert frozen" role="status">
        <span className="alert-icon">⏸</span>
        <div><strong>Agent frozen</strong><span>The owner removed the agent&apos;s signer. Payments are blocked on-chain until the owner unfreezes it.</span></div>
      </div>
    );
  }
  const cap = BigInt(data.dailyCap);
  const spent = BigInt(data.spentInWindow);
  if (cap === 0n) return null;
  const ratio = Number((spent * 10_000n) / cap) / 10_000;
  if (ratio >= 1) {
    return (
      <div className="alert danger" role="alert">
        <span className="alert-icon">!</span>
        <div><strong>Daily cap reached</strong><span>{usdc(spent)} of {usdc(cap)} spent in the rolling window. Further payments are rejected on-chain.</span></div>
      </div>
    );
  }
  if (ratio >= data.nearCapRatio) {
    return (
      <div className="alert warning" role="alert">
        <span className="alert-icon">!</span>
        <div><strong>Approaching the daily cap</strong><span>{Math.round(ratio * 100)}% used · {usdc(data.remaining)} left in the rolling window.</span></div>
      </div>
    );
  }
  return null;
}

export default function Home() {
  const { data, error } = useDashboard();
  const [filter, setFilter] = useState<Filter>("All");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    const all = data?.activity ?? [];
    switch (filter) {
      case "x402": return all.filter((a) => a.kind === "payment" && a.initiator === "x402");
      case "Direct": return all.filter((a) => a.kind === "payment" && a.initiator !== "x402");
      case "Blocked": return all.filter((a) => a.kind === "blocked");
      case "Deposits": return all.filter((a) => a.kind === "deposit");
      default: return all;
    }
  }, [data, filter]);

  const explorer = (path: string) => (data ? `${data.explorerUrl}/${path}` : "#");
  const capPct = data && BigInt(data.dailyCap) > 0n ? Number((BigInt(data.spentInWindow) * 100n) / BigInt(data.dailyCap)) : 0;
  const hours = data ? Math.round((data.periodLedgers * 5) / 3600) : 24;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Guardrail Console home">
          <span className="brand-mark"><span /></span>
          <span>guardrail<span className="brand-light">.console</span></span>
        </a>
        <div className="nav-section-label">MONITOR</div>
        <nav className="side-nav" aria-label="Sections">
          <a className="nav-link active" href="#overview"><span className="nav-icon" aria-hidden="true">◫</span><span>Overview</span></a>
          <a className="nav-link" href="#guardrails"><span className="nav-icon" aria-hidden="true">⌘</span><span>Guardrails</span></a>
          <a className="nav-link" href="#activity"><span className="nav-icon" aria-hidden="true">↗</span><span>Activity</span>{data && <span className="nav-count">{data.activity.length}</span>}</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="network-card">
          <div className="network-head"><span className={"network-dot" + (error ? "" : " live")} /> {(data?.network ?? "Stellar testnet").toUpperCase()}</div>
          <div className="network-state">Monitored smart account</div>
          <div className="network-address">{data ? short(data.account) : "Loading…"}</div>
          {data && <a className="network-button" href={explorer(`contract/${data.account}`)} target="_blank" rel="noreferrer">View on Stellar Expert <span>↗</span></a>}
        </div>
        <div className="sidebar-footer">
          <span className="footer-avatar">GC</span>
          <span><strong>Guardrail Console</strong><small>Read-only · no keys</small></span>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Agent treasury</span><b>/</b><strong>Overview</strong></div>
          <div className="topbar-actions">
            {error && data ? <span className="stale-pill"><i /> RECONNECTING</span> : <span className="live-pill"><i /> LIVE · {data ? `LEDGER ${data.ledger.toLocaleString("en-US")}` : "CONNECTING"}</span>}
          </div>
        </header>

        <div className="content-wrap">
          <section className="page-heading">
            <div>
              <div className="eyebrow">{(data?.network ?? "STELLAR TESTNET").toUpperCase()} <span>·</span> SINGLE AGENT <span>·</span> RULE {data?.ruleId ?? "–"}</div>
              <h1>Agent treasury</h1>
              <p className="page-subtitle">What the agent can spend, what it has spent, and what the ledger blocked.</p>
            </div>
            {data && (
              <span className={"agent-badge " + (data.frozen ? "frozen" : "active")}>
                <i /> {data.frozen ? "Agent frozen" : "Agent active"}
              </span>
            )}
          </section>

          {error && !data && <div className="alert danger" role="alert"><span className="alert-icon">!</span><div><strong>Live data unavailable</strong><span>{error}</span></div></div>}
          {!data && !error && <div className="loading">Loading live data from Stellar RPC…</div>}

          {data && (
            <>
              <CapAlert data={data} />

              <section className="metrics-grid" aria-label="Treasury summary">
                <MetricCard label="Treasury balance" value={usdc(data.balance)} detail="USDC held by the smart account" accent="mint" icon="$" />
                <MetricCard label={`Spent in rolling ${hours}h`} value={usdc(data.spentInWindow)} detail={`${capPct}% of ${usdc(data.dailyCap)} cap`} accent="blue" icon="↗" />
                <MetricCard label="Budget remaining" value={usdc(data.remaining)} detail={`Rolling ${data.periodLedgers.toLocaleString("en-US")}-ledger window`} accent="violet" icon="◷" />
              </section>

              <section className="middle-grid">
                <article className="panel spending-panel">
                  <div className="panel-heading">
                    <div><h2>Spending vs. cap</h2><p>Confirmed agent payments over the last 24 hours</p></div>
                    <span className={"reconcile " + (data.reconciliation.matches ? "ok" : "off")} title="Indexed agent payments in the policy window compared with the spending-limit policy's own total">
                      {data.reconciliation.matches ? "✓ Reconciled with policy" : `Index ${usdc(data.reconciliation.indexedSpent)} ≠ policy ${usdc(data.spentInWindow)}`}
                    </span>
                  </div>
                  <div className="chart-total"><strong>{usdc(data.spentInWindow)}</strong><span>of {usdc(data.dailyCap)} USDC</span></div>
                  <div className="cap-meter" aria-hidden="true"><span style={{ width: `${Math.min(100, capPct)}%` }} className={capPct >= 100 ? "full" : capPct >= data.nearCapRatio * 100 ? "near" : ""} /></div>
                  <SpendingChart data={data} now={now} />
                </article>

                <article className="panel policy-panel" id="guardrails">
                  <div className="panel-heading"><div><h2>Active guardrails</h2><p>Enforced on-chain by the smart account</p></div></div>
                  <div className={"policy-status" + (data.frozen ? " frozen" : "")}>
                    <span className="status-check">{data.frozen ? "⏸" : "✓"}</span>
                    <span><strong>{data.frozen ? "Agent frozen by owner" : "Agent rule active"}</strong><small>Context rule {data.ruleId} · USDC transfers only</small></span>
                  </div>
                  <div className="policy-rule">
                    <div className="rule-icon cap-icon">↗</div>
                    <div className="rule-copy"><strong>Rolling spend cap</strong><small>{usdc(data.dailyCap)} USDC per {data.periodLedgers.toLocaleString("en-US")} ledgers (~{hours}h) · OZ spending-limit policy</small></div>
                    <a className="rule-link" href={explorer(`contract/${data.policies.spendingLimit}`)} target="_blank" rel="noreferrer" aria-label="Spending-limit policy contract">↗</a>
                  </div>
                  <div className="policy-rule">
                    <div className="rule-icon allow-icon">⌑</div>
                    <div className="rule-copy">
                      <strong>Recipient allowlist · {data.recipients.length}</strong>
                      <small>{data.recipients.map((r) => r.label ? `${r.label} (${short(r.address)})` : short(r.address)).join(", ")}</small>
                    </div>
                    <a className="rule-link" href={explorer(`contract/${data.policies.allowlist}`)} target="_blank" rel="noreferrer" aria-label="Allowlist policy contract">↗</a>
                  </div>
                  <div className="policy-rule">
                    <div className="rule-icon owner-icon">♙</div>
                    <div className="rule-copy"><strong>Owner freeze override</strong><small>{data.frozen ? "Frozen: agent signer removed" : "Owner can remove the agent signer at any time"} · managed with the SDK, not this read-only console</small></div>
                  </div>
                </article>
              </section>

              <section className="panel activity-panel" id="activity">
                <div className="activity-heading">
                  <div><h2>Payment history</h2><p>From Stellar RPC events and failed agent transactions · every row links to Stellar Expert</p></div>
                  <div className="activity-tools">
                    <div className="filter-tabs" role="tablist" aria-label="Filter activity">
                      {(["All", "x402", "Direct", "Blocked", "Deposits"] as Filter[]).map((item) => (
                        <button key={item} className={filter === item ? "selected" : ""} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>{item}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <ActivityTable rows={rows} data={data} now={now} />
                <div className="table-foot"><span>{rows.length} of {data.activity.length} entries · indexed through ledger {data.indexedThroughLedger?.toLocaleString("en-US") ?? "–"}</span><span>Refreshes every {REFRESH_MS / 1000}s</span></div>
              </section>
            </>
          )}

          <footer className="page-footer"><span><i className={error ? "" : "live"} /> Live testnet data · read-only · no keys held</span><span>Built on Stellar <b>✳</b></span></footer>
        </div>
      </main>
    </div>
  );
}
