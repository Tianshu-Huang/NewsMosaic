import "../styles.css";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import * as d3 from "d3";
import { buildMosaicLite, fetchClusterSummary } from "../api";

/* ══════════════════════════════════════════
   Types
   ══════════════════════════════════════════ */
type Tile = {
  title?: string;
  url?: string;
  source?: string;
  tone?: string;
  meta?: string;
  article?: {
    id?: string;
    title?: string;
    url?: string;
    source?: string;
    published_at?: string;
  };
  one_line_takeaway?: string;
  tile_type?: string;
  [k: string]: any;
  valence?: number;
  intensity?: number;
  intensity_level?: string;
};

type Cluster = {
  cluster_id: string;
  summary?: any;
  items: Tile[];
};

type Sentiment = "positive" | "neutral" | "critical";

/* ══════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════ */
function tileDisplayTitle(tile: Tile): string {
  return tile.article?.title || tile.title || "Untitled";
}
function tileDisplayUrl(tile: Tile): string | undefined {
  return tile.article?.url || tile.url;
}
function tileDisplaySource(tile: Tile): string {
  return tile.article?.source || tile.source || "Unknown";
}
function tileDisplayTime(tile: Tile): string {
  const t = tile.article?.published_at;
  if (!t) return "";
  try {
    return new Date(t).toLocaleString();
  } catch {
    return String(t);
  }
}

function emotionBucket(tile: Tile): Sentiment {
  const v = Number(tile.valence ?? 0);
  if (v >= 0.1) return "positive";
  if (v <= -0.1) return "critical";
  return "neutral";
}

function tileIntensity01(tile: Tile): number {
  const x = Number(tile.intensity ?? 0);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/* ══════════════════════════════════════════
   Sunburst data — sentiment-first hierarchy
   Root → positive | neutral | critical → tiles
   ══════════════════════════════════════════ */
type SunLeaf = { name: string; value: number; meta: any };
type SunBranch = { name: string; children: (SunLeaf | SunBranch)[]; meta?: any };
type SunNode = SunLeaf | SunBranch;

function buildSunData(query: string, clusters: Cluster[]): SunNode {
  const buckets: Record<Sentiment, SunLeaf[]> = { positive: [], neutral: [], critical: [] };

  for (const c of clusters) {
      const clusterName =
        c.summary?.cluster_title && c.summary.cluster_title !== "Summary"
          ? String(c.summary.cluster_title)
          : "";
    for (const tile of c.items) {
      const bucket = emotionBucket(tile);
      buckets[bucket].push({
        name: tileDisplayTitle(tile),
        value: 1,
        meta: { kind: "tile", tile, clusterId: c.cluster_id, clusterName, bucket },
      });
    }
  }

  const children: SunBranch[] = [];
  for (const s of ["positive", "neutral", "critical"] as Sentiment[]) {
    if (buckets[s].length > 0) {
      children.push({ name: s, meta: { kind: "sentiment", sentiment: s }, children: buckets[s] });
    }
  }
  return { name: query || "Topic", children };
}

/* ══════════════════════════════════════════
   Sentiment stats
   ══════════════════════════════════════════ */
function computeSentimentStats(clusters: Cluster[]) {
  let pos = 0, neu = 0, crit = 0;
  for (const c of clusters) {
    for (const t of c.items) {
      const b = emotionBucket(t);
      if (b === "positive") pos++;
      else if (b === "critical") crit++;
      else neu++;
    }
  }
  const total = pos + neu + crit || 1;
  return {
    positive: { count: pos, pct: Math.round((pos / total) * 100) },
    neutral: { count: neu, pct: Math.round((neu / total) * 100) },
    critical: { count: crit, pct: Math.round((crit / total) * 100) },
    total: pos + neu + crit,
  };
}

/* ══════════════════════════════════════════
   Design tokens — refined, mosaic-inspired
   ══════════════════════════════════════════ */
const SENTIMENT = {
  positive: { light: "#e3f5ea", mid: "#86d9a1", dark: "#248a49", ring: "#a8e4bb", label: "Positive" },
  neutral:  { light: "#eeece8", mid: "#c5c1ba", dark: "#6b6760", ring: "#d6d2cc", label: "Neutral" },
  critical: { light: "#fce4e1", mid: "#f0a09a", dark: "#c0352c", ring: "#f0b5b0", label: "Critical" },
} as const;

const THEME = {
  accent: "#b79df3",
  accentHover: "#8f66e6",
  accentRing: "#e1d7fb",
  accentRgb: "183,157,243",
  accentText: "#ffffff",
};

/* ══════════════════════════════════════════
   Sunburst
   ══════════════════════════════════════════ */
function Sunburst({
  data, query, stats, width = 520, height = 520, onPick, hoveredKey, onHover,
}: {
  data: SunNode; query: string; stats: ReturnType<typeof computeSentimentStats>;
  width?: number; height?: number;
  onPick: (meta: any) => void; hoveredKey: string | null; onHover: (key: string | null) => void;
}) {
  const computed = useMemo(() => {
    const radius = Math.min(width, height) / 2 - 16;
    const centerR = radius * 0.24;

    const root = d3.hierarchy<any>(data as any).sum((d) => d.value || 0).sort(() => 0);
    const partition = d3.partition<any>().size([2 * Math.PI, radius]);
    partition(root);

    const arc = d3.arc<any>()
      .startAngle((d) => d.x0).endAngle((d) => d.x1)
      .innerRadius((d) => Math.max(d.y0, centerR)).outerRadius((d) => d.y1)
      .padAngle(0.012).cornerRadius(3);

    function fillFor(d: any): string {
      if (d.depth === 1) {
        const s = d.data.name as Sentiment;
        return SENTIMENT[s]?.ring || "#ddd";
      }
      const tile = d.data?.meta?.tile;
      if (!tile) return "#ddd";
      const bucket = (d.data?.meta?.bucket || "neutral") as Sentiment;
      const inten = tileIntensity01(tile);
      const c = SENTIMENT[bucket] || SENTIMENT.neutral;
      return d3.interpolateRgb(c.light, c.dark)(inten * 0.6 + 0.18);
    }

    const nodes = root.descendants().filter((d) => d.depth > 0);
    return {
      vb: `${-width / 2} ${-height / 2} ${width} ${height}`,
      centerR,
      nodes: nodes.map((d) => {
        const key = `${d.data.name}|${d.depth}|${d.x0.toFixed(4)}`;
        const midA = (d.x0 + d.x1) / 2;
        const midR = (Math.max(d.y0, centerR) + d.y1) / 2;
        return {
          key, d, path: arc(d) || "", fill: fillFor(d),
          clickable: !!d.data?.meta, isLeaf: !d.children,
          cx: Math.sin(midA) * midR, cy: -Math.cos(midA) * midR,
          title: d.depth === 2 && d.data?.meta?.tile
            ? `${tileDisplayTitle(d.data.meta.tile)}\n${tileDisplaySource(d.data.meta.tile)} · ${tileDisplayTime(d.data.meta.tile)}\n${d.data.meta.tile.one_line_takeaway || ""}`
            : String(d.data.name),
        };
      }),
    };
  }, [data, width, height]);

  return (
    <svg viewBox={computed.vb} width={width} height={height} style={{ display: "block" }}>
      <g>
        {computed.nodes.map((n) => {
          const hov = hoveredKey === n.key && n.isLeaf;
          return (
            <path key={n.key} d={n.path} fill={n.fill}
              stroke={n.isLeaf ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.85)"}
              strokeWidth={n.isLeaf ? 1.2 : 2}
              style={{
                cursor: n.clickable ? "pointer" : "default",
                transform: hov ? `translate(${n.cx * 0.05}px, ${n.cy * 0.05}px) scale(1.06)` : "none",
                transformOrigin: `${n.cx}px ${n.cy}px`,
                transition: "transform 200ms cubic-bezier(.34,1.56,.64,1), filter 200ms ease",
                filter: hov ? "drop-shadow(0 3px 10px rgba(0,0,0,0.18)) brightness(1.08)" : "none",
              }}
              onMouseEnter={() => onHover(n.key)}
              onMouseLeave={() => onHover(null)}
              onClick={() => { if (n.clickable) onPick(n.d.data.meta); }}
            >
              <title>{n.title}</title>
            </path>
          );
        })}
      </g>

      {/* Center circle — frosted glass look */}
      <circle cx={0} cy={0} r={computed.centerR} fill="rgba(255,255,255,0.92)"
        stroke="rgba(0,0,0,0.06)" strokeWidth={1} />

      {/* Query text */}
      <text x={0} y={-12} textAnchor="middle" dominantBaseline="middle"
        fontSize={13} fontWeight={700} fill="#1d1d1f"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        style={{ letterSpacing: "-0.2px" }}>
        {query.length > 14 ? query.slice(0, 13) + "\u2026" : query}
      </text>

      <text x={0} y={6} textAnchor="middle" dominantBaseline="middle"
        fontSize={10} fill="#8e8e93"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif">
        {stats.total} articles
      </text>

      {/* Mini sentiment bar */}
      {(() => {
        const bw = computed.centerR * 1.1;
        const bh = 4;
        const by = 20;
        const sx = -bw / 2;
        const pw = (stats.positive.pct / 100) * bw;
        const nw = (stats.neutral.pct / 100) * bw;
        const cw = (stats.critical.pct / 100) * bw;
        return (
          <g>
            <rect x={sx} y={by} width={pw || 0} height={bh} rx={2} fill={SENTIMENT.positive.mid} />
            <rect x={sx + pw} y={by} width={nw || 0} height={bh} fill={SENTIMENT.neutral.mid} />
            <rect x={sx + pw + nw} y={by} width={cw || 0} height={bh} rx={2} fill={SENTIMENT.critical.mid} />
          </g>
        );
      })()}
    </svg>
  );
}

/* ══════════════════════════════════════════
   Sentiment Legend
   ══════════════════════════════════════════ */
function SentimentLegend({ stats }: { stats: ReturnType<typeof computeSentimentStats> }) {
  const items = [
    { key: "positive" as const, ...SENTIMENT.positive, ...stats.positive },
    { key: "neutral" as const, ...SENTIMENT.neutral, ...stats.neutral },
    { key: "critical" as const, ...SENTIMENT.critical, ...stats.critical },
  ];
  return (
    <div style={{
      display: "flex", gap: 24, justifyContent: "center",
      padding: "8px 0",
    }}>
      {items.map((it) => (
        <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{
            width: 10, height: 10, borderRadius: 3,
            background: `linear-gradient(135deg, ${it.mid}, ${it.dark})`,
          }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "#6e6e73" }}>
            {it.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1d1d1f" }}>
            {it.pct}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   Loading Overlay — mosaic animation
   ══════════════════════════════════════════ */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

function MosaicLoading({ loading, seed }: { loading: boolean; seed: number }) {
  const tiles = useMemo(() => {
    const cols = 14, rows = 9;
    const rand = mulberry32(seed);
    const list: { id: string; x: number; y: number; w: number; h: number; hue: number; sat: number; lig: number; delay: number; dur: number }[] = [];
    const used = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (used.has(key(c, r))) continue;
        const pick = rand();
        let w = 1, h = 1;
        if (pick > 0.88) { w = 2; h = 2; } else if (pick > 0.74) { w = 2; } else if (pick > 0.60) { h = 2; }
        if (c + w > cols) w = 1;
        if (r + h > rows) h = 1;
        for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) used.add(key(cc, rr));
        list.push({
          id: `${c}-${r}`, x: c, y: r, w, h,
          hue: Math.floor(rand() * 360), sat: clamp(55 + rand() * 25, 45, 85), lig: clamp(32 + rand() * 28, 26, 64),
          delay: rand() * 0.8, dur: 1.8 + rand() * 1.8,
        });
      }
    }
    return { cols, rows, list };
  }, [seed]);

  const css = `
  .ml-wrap{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;transition:opacity 220ms ease;
    background:radial-gradient(1100px 680px at 10% 5%, #ffffff 0%, #f4f6fb 35%, #eef1f7 70%, #e8ebf2 100%);}
  .ml-wrap.is-on{opacity:1}
  .ml-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);gap:4px;padding:4px;}
  .ml-tile{grid-column:calc(var(--x) + 1)/span var(--w);grid-row:calc(var(--y) + 1)/span var(--h);border-radius:14px;overflow:hidden;
    box-shadow:0 10px 30px rgba(20,24,35,.10),0 2px 8px rgba(20,24,35,.08);}
  .ml-inner{width:100%;height:100%;
    background:radial-gradient(420px 240px at 25% 20%, rgba(255,255,255,.55), rgba(255,255,255,0) 55%),
    linear-gradient(135deg,hsla(var(--hue),var(--sat),calc(var(--lig) + 14%),.92),hsla(calc(var(--hue) + 22),calc(var(--sat) - 10%),calc(var(--lig) - 4%),.92));
    border:1px solid rgba(255,255,255,.55);backdrop-filter:blur(10px);
    animation:mlP var(--t) ease-in-out var(--d) infinite;}
  @keyframes mlP{0%{transform:translateY(0) scale(1);opacity:.88;filter:blur(0) saturate(1.05)}
    35%{transform:translateY(-4px) scale(1.01);opacity:1;filter:blur(0) saturate(1.12)}
    70%{transform:translateY(3px) scale(.995);opacity:.92;filter:blur(.2px) saturate(1.05)}
    100%{transform:translateY(0) scale(1);opacity:.88;filter:blur(0) saturate(1.05)}}
  .ml-ctr{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;}
  .ml-pill{display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border-radius:999px;
    background:rgba(255,255,255,.82);border:1px solid rgba(0,0,0,.06);
    box-shadow:0 12px 40px rgba(0,0,0,.10);backdrop-filter:blur(16px);
    font-weight:700;font-size:14px;letter-spacing:-.1px;color:#1d1d1f;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
  .ml-dot{width:8px;height:8px;border-radius:999px;background:var(--accent,${THEME.accent});
    animation:mlD .9s ease-in-out infinite;}
  @keyframes mlD{0%,100%{transform:scale(.85);opacity:.6}50%{transform:scale(1.2);opacity:1}}
  .ml-sub{margin-top:8px;font-size:12px;color:#8e8e93;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
  `;

  return (
    <>
      <style>{css}</style>
      <div className={`ml-wrap ${loading ? "is-on" : ""}`} aria-hidden={!loading}>
        <div className="ml-grid" style={{ ["--cols" as any]: tiles.cols, ["--rows" as any]: tiles.rows } as React.CSSProperties}>
          {tiles.list.map((t) => (
            <div key={t.id} className="ml-tile" style={{
              ["--x" as any]: t.x, ["--y" as any]: t.y, ["--w" as any]: t.w, ["--h" as any]: t.h,
              ["--hue" as any]: t.hue, ["--sat" as any]: `${t.sat}%`, ["--lig" as any]: `${t.lig}%`,
              ["--d" as any]: `${t.delay}s`, ["--t" as any]: `${t.dur}s`,
            } as React.CSSProperties}>
              <div className="ml-inner" />
            </div>
          ))}
        </div>
        <div className="ml-ctr">
          <div className="ml-pill"><span className="ml-dot" />Building mosaic…</div>
          <div className="ml-sub">Gathering & clustering articles</div>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   Landing Page
   ══════════════════════════════════════════ */
function LandingPage({ onSearch }: { onSearch: (q: string) => void }) {
  const [input, setInput] = useState("");
  const tiles = useMemo(() => {
    const cols = 16, rows = 10, rand = mulberry32(2026);
    const list: { id: string; x: number; y: number; w: number; h: number; hue: number; sat: number; lig: number; delay: number; dur: number }[] = [];
    const used = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (used.has(key(c, r))) continue;
        const pick = rand();
        let w = 1, h = 1;
        if (pick > 0.86) { w = 2; h = 2; } else if (pick > 0.72) { w = 2; } else if (pick > 0.58) { h = 2; }
        if (c + w > cols) w = 1; if (r + h > rows) h = 1;
        for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) used.add(key(cc, rr));
        list.push({
          id: `${c}-${r}`, x: c, y: r, w, h,
          hue: Math.floor(rand() * 360), sat: clamp(55 + rand() * 30, 45, 85), lig: clamp(35 + rand() * 25, 28, 62),
          delay: rand() * 0.8, dur: 2.6 + rand() * 2.6,
        });
      }
    }
    return { cols, rows, list };
  }, []);

  const submit = useCallback(() => { const q = input.trim(); if (q) onSearch(q); }, [input, onSearch]);

  const css = `
  .ld-wrap{position:fixed;inset:0;z-index:100;overflow:hidden;
    background:radial-gradient(ellipse at 20% 20%, #f8f9fd 0%, #eef1f7 50%, #e4e8f0 100%);}
  .ld-grid{position:absolute;inset:0;display:grid;
    grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);
    gap:4px;padding:4px;opacity:0.38;}
  .ld-tile{grid-column:calc(var(--x) + 1)/span var(--w);grid-row:calc(var(--y) + 1)/span var(--h);
    border-radius:12px;overflow:hidden;
    box-shadow:0 8px 24px rgba(20,24,35,.08);}
  .ld-ti{width:100%;height:100%;
    background:radial-gradient(300px 180px at 25% 20%, rgba(255,255,255,.5), rgba(255,255,255,0) 55%),
    linear-gradient(135deg,hsla(var(--hue),var(--sat),calc(var(--lig) + 12%),.85),hsla(calc(var(--hue) + 20),calc(var(--sat) - 8%),calc(var(--lig) - 3%),.85));
    border:1px solid rgba(255,255,255,.45);
    animation:ldF var(--t) ease-in-out var(--d) infinite;}
  @keyframes ldF{0%{transform:translateY(0) scale(1);opacity:.85}
    35%{transform:translateY(-3px) scale(1.005);opacity:1}
    70%{transform:translateY(2px) scale(.998);opacity:.9}
    100%{transform:translateY(0) scale(1);opacity:.85}}

  .ld-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;}
  .ld-card{padding:52px 60px;border-radius:28px;
    background:rgba(255,255,255,.82);border:1px solid rgba(255,255,255,.7);
    box-shadow:0 24px 80px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.03);
    backdrop-filter:blur(24px) saturate(1.6);-webkit-backdrop-filter:blur(24px) saturate(1.6);
    text-align:center;max-width:480px;width:88%;}
  .ld-icon{font-size:44px;margin-bottom:12px;}
  .ld-title{font-size:36px;font-weight:800;letter-spacing:-1.2px;
    color:#1d1d1f;margin:0 0 6px;line-height:1.1;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif;}
  .ld-sub{font-size:15px;color:#8e8e93;margin:0 0 32px;line-height:1.6;font-weight:400;}
  .ld-search{display:flex;border-radius:14px;overflow:hidden;
    border:2px solid rgba(0,0,0,.06);background:#fff;
    box-shadow:0 4px 20px rgba(0,0,0,.05);transition:border-color 200ms ease,box-shadow 200ms ease;}
  .ld-search:focus-within{border-color:${THEME.accent};box-shadow:0 4px 20px rgba(${THEME.accentRgb},.12);}
  .ld-input{flex:1;padding:14px 18px;border:none;outline:none;font-size:16px;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:transparent;color:#1d1d1f;}
  .ld-input::placeholder{color:#c7c7cc;}
  .ld-btn{padding:14px 26px;border:none;
    background:${THEME.accent};color:${THEME.accentText};
    font-size:15px;font-weight:600;cursor:pointer;
    font-family:-apple-system,BlinkMacSystemFont,sans-serif;
    transition:background 150ms ease;}
  .ld-btn:hover{background:${THEME.accentHover};}
  .ld-hint{margin-top:14px;font-size:11px;color:#c7c7cc;font-weight:500;letter-spacing:.2px;}
  `;

  return (
    <>
      <style>{css}</style>
      <div className="ld-wrap">
        <div className="ld-grid" style={{ ["--cols" as any]: tiles.cols, ["--rows" as any]: tiles.rows } as React.CSSProperties}>
          {tiles.list.map((t) => (
            <div key={t.id} className="ld-tile" style={{
              ["--x" as any]: t.x, ["--y" as any]: t.y, ["--w" as any]: t.w, ["--h" as any]: t.h,
              ["--hue" as any]: t.hue, ["--sat" as any]: `${t.sat}%`, ["--lig" as any]: `${t.lig}%`,
              ["--d" as any]: `${t.delay}s`, ["--t" as any]: `${t.dur}s`,
            } as React.CSSProperties}>
              <div className="ld-ti" />
            </div>
          ))}
        </div>
        <div className="ld-center">
          <div className="ld-card">
            <div className="ld-icon">&#x1F9E9;</div>
            <h1 className="ld-title">News Mosaic</h1>
            <p className="ld-sub">
              See the full picture. Enter a topic and we'll piece together<br />
              the story from multiple sources and perspectives.
            </p>
            <div className="ld-search">
              <input className="ld-input" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="Search any topic…"
                autoFocus />
              <button className="ld-btn" onClick={submit}>Search</button>
            </div>
            <div className="ld-hint">Try "artificial intelligence", "climate change", or any topic</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════
   Cluster Card — interactive, expandable
   ══════════════════════════════════════════ */
function ClusterCard({
  cluster, isExpanded, onToggle, onPickTile, summaryLoading,
}: {
  cluster: Cluster; isExpanded: boolean;
  onToggle: () => void; onPickTile: (tile: Tile, clusterName: string, clusterId: string) => void;
  summaryLoading: boolean;
}) {
  const clusterName =
    cluster.summary?.cluster_title && cluster.summary.cluster_title !== "Summary"
      ? String(cluster.summary.cluster_title)
      : "";
  const sentimentBreakdown = useMemo(() => {
    let p = 0, n = 0, c = 0;
    for (const t of cluster.items) {
      const b = emotionBucket(t);
      if (b === "positive") p++; else if (b === "critical") c++; else n++;
    }
    return { positive: p, neutral: n, critical: c };
  }, [cluster.items]);

  return (
    <div style={{
      borderRadius: 14, overflow: "hidden",
      background: "rgba(255,255,255,0.72)",
      border: isExpanded ? `1px solid ${THEME.accentRing}` : "1px solid rgba(0,0,0,0.06)",
      boxShadow: isExpanded ? `0 4px 20px rgba(${THEME.accentRgb},0.10)` : "0 1px 3px rgba(0,0,0,0.04)",
      transition: "all 200ms ease",
    }}>
      {/* Header — always visible, clickable */}
      <div onClick={onToggle} style={{
        padding: "12px 16px", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 12,
        transition: "background 150ms ease",
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 14, color: "#1d1d1f", lineHeight: 1.3 }}>
            {clusterName ? (
              clusterName
            ) : summaryLoading ? (
              <span style={{ opacity: 0.65 }}>Loading summary...</span>
            ) : (
              ""
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: "#8e8e93" }}>
              {cluster.items.length} articles
            </span>
            {/* Mini sentiment dots */}
            <div style={{ display: "flex", gap: 3 }}>
              {sentimentBreakdown.positive > 0 && (
                <div style={{ width: 6, height: 6, borderRadius: 3, background: SENTIMENT.positive.mid }}
                  title={`${sentimentBreakdown.positive} positive`} />
              )}
              {sentimentBreakdown.neutral > 0 && (
                <div style={{ width: 6, height: 6, borderRadius: 3, background: SENTIMENT.neutral.mid }}
                  title={`${sentimentBreakdown.neutral} neutral`} />
              )}
              {sentimentBreakdown.critical > 0 && (
                <div style={{ width: 6, height: 6, borderRadius: 3, background: SENTIMENT.critical.mid }}
                  title={`${sentimentBreakdown.critical} critical`} />
              )}
            </div>
          </div>
        </div>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isExpanded ? `rgba(${THEME.accentRgb},0.10)` : "rgba(0,0,0,0.04)",
          color: isExpanded ? THEME.accent : "#8e8e93",
          fontSize: 12, fontWeight: 700,
          transition: "transform 200ms ease",
          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
        }}>
          ›
        </div>
      </div>

      {/* Expanded content — article list */}
      <div style={{
        maxHeight: isExpanded ? 400 : 0,
        opacity: isExpanded ? 1 : 0,
        overflow: isExpanded ? "auto" : "hidden",
        transition: "max-height 300ms cubic-bezier(.4,0,.2,1), opacity 200ms ease",
      }}>
        {/* Summary */}
        {summaryLoading && !cluster.summary?.what_happened && (
          <div style={{
            padding: "0 16px 10px",
            fontSize: 12, lineHeight: 1.5, color: "#8e8e93",
          }}>
            Loading summary…
          </div>
        )}
        {cluster.summary?.what_happened && (
          <div style={{
            padding: "0 16px 10px",
            fontSize: 13, lineHeight: 1.5, color: "#6e6e73",
          }}>
            {cluster.summary.what_happened}
          </div>
        )}

        {/* Article list */}
        <div style={{ padding: "0 12px 12px" }}>
          {cluster.items.slice(0, 8).map((tile, i) => {
            const sentiment = emotionBucket(tile);
            return (
              <div key={tile.article?.id || i}
                onClick={(e) => { e.stopPropagation(); onPickTile(tile, clusterName, cluster.cluster_id); }}
                style={{
                  padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                  display: "flex", alignItems: "flex-start", gap: 8,
                  transition: "background 120ms ease",
                  marginBottom: 2,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <div style={{
                  width: 4, height: 4, borderRadius: 2, marginTop: 7, flexShrink: 0,
                  background: SENTIMENT[sentiment].mid,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 500, color: "#1d1d1f", lineHeight: 1.35,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {tileDisplayTitle(tile)}
                  </div>
                  <div style={{ fontSize: 11, color: "#aeaeb2", marginTop: 2 }}>
                    {tileDisplaySource(tile)}
                  </div>
                </div>
              </div>
            );
          })}
          {cluster.items.length > 8 && (
            <div style={{ padding: "4px 10px", fontSize: 11, color: "#aeaeb2" }}>
              +{cluster.items.length - 8} more articles
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Article Detail Panel
   ══════════════════════════════════════════ */
function ArticleDetail({ tile, picked, onClose }: { tile: Tile; picked: any; onClose: () => void }) {
  const sentiment = emotionBucket(tile);
  const sentimentColor = SENTIMENT[sentiment];

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8e8e93" }}>
          <span>{picked.clusterName}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span style={{
            padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
            background: sentimentColor.light, color: sentimentColor.dark,
          }}>
            {sentiment}
          </span>
        </div>
        <button onClick={onClose} style={{
          width: 28, height: 28, borderRadius: 8,
          border: "1px solid rgba(0,0,0,0.06)", background: "rgba(0,0,0,0.02)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, color: "#8e8e93", transition: "all 120ms ease",
          padding: 0, lineHeight: 1,
        }}>
          ×
        </button>
      </div>

      {/* Title */}
      <h2 style={{
        margin: "0 0 8px", fontSize: 20, fontWeight: 700,
        letterSpacing: "-0.3px", lineHeight: 1.3, color: "#1d1d1f",
      }}>
        {tileDisplayTitle(tile)}
      </h2>

      {/* Meta */}
      <div style={{ fontSize: 13, color: "#8e8e93", marginBottom: 16 }}>
        {tileDisplaySource(tile)}
        {tileDisplayTime(tile) ? ` · ${tileDisplayTime(tile)}` : ""}
      </div>

      {/* Takeaway */}
      {tile.one_line_takeaway && (
        <p style={{
          margin: "0 0 16px", lineHeight: 1.6, fontSize: 14, color: "#3a3a3c",
          padding: "12px 14px", borderRadius: 10,
          background: "rgba(0,0,0,0.02)", borderLeft: `3px solid ${sentimentColor.mid}`,
        }}>
          {tile.one_line_takeaway}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tile.tile_type && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
            background: "rgba(0,0,0,0.04)", color: "#6e6e73", textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            {tile.tile_type}
          </span>
        )}
        {tileDisplayUrl(tile) && (
          <a href={tileDisplayUrl(tile)} target="_blank" rel="noreferrer" style={{
            fontSize: 13, fontWeight: 600, color: THEME.accent,
            textDecoration: "none", display: "flex", alignItems: "center", gap: 4,
          }}>
            Read full article <span style={{ fontSize: 11 }}>&#x2197;</span>
          </a>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════ */
export default function Mosaic() {
  const [page, setPage] = useState<"landing" | "mosaic">("landing");
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<Record<string, boolean>>({});
  const [autoLoadAllSummaries, setAutoLoadAllSummaries] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const run = useCallback(async (q: string) => {
    setLoading(true);
    setPicked(null);
    setExpandedCluster(null);
    setSummaryLoading({});
    setAutoLoadAllSummaries(false);
    try {
      const data = await buildMosaicLite(q);
      setClusters(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const ensureSummary = useCallback(async (cluster: Cluster) => {
    if (!cluster || cluster.summary) return;
    const id = cluster.cluster_id;
    if (summaryLoading[id]) return;

    const items = (cluster.items || []).map((t) => t.article).filter(Boolean);
    if (items.length === 0) return;

    setSummaryLoading((s) => ({ ...s, [id]: true }));
    try {
      const summary = await fetchClusterSummary(items);
      setClusters((prev) =>
        prev.map((c) => (c.cluster_id === id ? { ...c, summary } : c))
      );
    } finally {
      setSummaryLoading((s) => ({ ...s, [id]: false }));
    }
  }, [summaryLoading]);

  // Prefetch first cluster summary as soon as clusters render
  useEffect(() => {
    if (page !== "mosaic") return;
    if (loading) return;
    if (!clusters || clusters.length === 0) return;
    ensureSummary(clusters[0]);
  }, [page, loading, clusters, ensureSummary]);

  // When the first cluster title arrives, start loading the rest sequentially
  useEffect(() => {
    if (page !== "mosaic") return;
    if (!clusters || clusters.length === 0) return;
    if (autoLoadAllSummaries) return;
    if (clusters[0]?.summary?.cluster_title) {
      setAutoLoadAllSummaries(true);
    }
  }, [page, clusters, autoLoadAllSummaries]);

  // Sequentially load remaining summaries
  useEffect(() => {
    if (page !== "mosaic") return;
    if (!autoLoadAllSummaries) return;
    if (!clusters || clusters.length === 0) return;

    const next = clusters.find((c) => !c.summary && !summaryLoading[c.cluster_id]);
    if (next) ensureSummary(next);
  }, [page, autoLoadAllSummaries, clusters, summaryLoading, ensureSummary]);


  const handleLandingSearch = useCallback((q: string) => {
    setQuery(q);
    setLastQuery(q);
    setPage("mosaic");
    run(q);
  }, [run]);

  const handleTopbarSearch = useCallback(() => {
    const q = query.trim();
    if (q) {
      setLastQuery(q);
      run(q);
    }
  }, [query, run]);

  const handleBack = useCallback(() => {
    setPage("landing");
    setClusters([]);
    setPicked(null);
    // Don't clear query — it persists as placeholder reference
  }, []);

  const sunData = useMemo(() => buildSunData(query, clusters), [query, clusters]);
  const stats = useMemo(() => computeSentimentStats(clusters), [clusters]);
  const pickedTile: Tile | null = picked?.tile || null;

  const loadingSeed = useMemo(() => {
    let s = 2026;
    for (let i = 0; i < query.length; i++) s = (s * 31 + query.charCodeAt(i)) >>> 0;
    return s;
  }, [query]);

  // Search input: show previous query grayed out when not focused and empty
  const showGrayQuery = !searchFocused && query === lastQuery && query.length > 0;

  if (page === "landing") {
    return <LandingPage onSearch={handleLandingSearch} />;
  }

  return (
    <div className="layout">
      <MosaicLoading loading={loading} seed={loadingSeed} />

      {/* ── Top bar ── */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="back-btn" onClick={handleBack} title="Back to home">
            <span style={{ fontSize: 16, lineHeight: 1 }}>&#x2190;</span>
            <span>Home</span>
          </button>
          <div className="brand" onClick={handleBack}>
            <span className="logo">&#x1F9E9;</span>
            <h1>News Mosaic</h1>
          </div>
        </div>

        <div className="search">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTopbarSearch(); }}
            onFocus={() => { setSearchFocused(true); }}
            onBlur={() => { setSearchFocused(false); }}
            placeholder="Search another topic…"
            style={{
              color: showGrayQuery ? "#aeaeb2" : undefined,
            }}
          />
          <button onClick={handleTopbarSearch} disabled={loading}>
            {loading ? "Building…" : "Search"}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="content">
        <div className="main" style={{ width: "100%" }}>
          {clusters.length > 0 ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(480px, 560px) minmax(360px, 480px)",
              justifyContent: "center",
              gap: 32,
              alignItems: "start",
              maxWidth: 1100,
              margin: "0 auto",
            }}>
              {/* ── Left: Sunburst + legend ── */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <Sunburst
                  data={sunData} query={query} stats={stats}
                  width={500} height={500}
                  onPick={(meta) => {
                    if (!meta) return;
                    if (meta.kind === "tile") setPicked(meta);
                    else setPicked(null);
                  }}
                  hoveredKey={hoveredKey} onHover={setHoveredKey}
                />
                <SentimentLegend stats={stats} />
              </div>

              {/* ── Right: Detail panel ── */}
              <div style={{
                position: "sticky", top: 80,
              }}>
                {pickedTile ? (
                  <div style={{
                    padding: "20px 24px", borderRadius: 18,
                    background: "rgba(255,255,255,0.78)",
                    border: "1px solid rgba(0,0,0,0.06)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.06)",
                    backdropFilter: "blur(12px)",
                  }}>
                    <ArticleDetail tile={pickedTile} picked={picked} onClose={() => setPicked(null)} />
                  </div>
                ) : (
                  <div>
                    {/* Cluster cards — the main right-panel content */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: "#aeaeb2",
                        textTransform: "uppercase", letterSpacing: "0.8px",
                        padding: "0 4px", marginBottom: 2,
                      }}>
                        Story Clusters · {clusters.length} found
                      </div>
                      <div style={{ fontSize: 12, color: "#8e8e93", padding: "0 4px", marginBottom: 6, lineHeight: 1.5 }}>
                        Click a cluster to browse articles, or click tiles on the chart for details.
                      </div>
                      {clusters.map((c) => (
                        <ClusterCard key={c.cluster_id}
                          cluster={c}
                          isExpanded={expandedCluster === c.cluster_id}
                          onToggle={() => {
                            const next = expandedCluster === c.cluster_id ? null : c.cluster_id;
                            setExpandedCluster(next);
                            if (next) ensureSummary(c);
                          }}
                          summaryLoading={!!summaryLoading[c.cluster_id]}
                          onPickTile={(tile, clusterName, clusterId) => {
                            setPicked({
                              kind: "tile", tile, clusterName, clusterId,
                              bucket: emotionBucket(tile),
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">
              <div className="emptyTitle">Search a topic to build your mosaic</div>
              <div className="emptySub">We'll piece together stories from multiple sources.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
