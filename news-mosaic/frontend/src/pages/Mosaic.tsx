import "./mosaic-flower.css";
import "../components/MosaicLoading.css";
import { useMemo, useState, useCallback } from "react";
import * as d3 from "d3";
import { buildMosaic } from "../api";

/* ── Types ── */
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

/* ── Helpers ── */
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

/* ── Sentiment-first sunburst data ──
   Root
   ├── positive (all positive tiles across all clusters)
   ├── neutral
   └── critical
   Each sentiment group contains tiles directly (flattened).
   This groups colors logically and reduces visual layers.
*/
type SunLeaf = { name: string; value: number; meta: any };
type SunBranch = { name: string; children: (SunLeaf | SunBranch)[]; meta?: any };
type SunNode = SunLeaf | SunBranch;

function buildSunData(query: string, clusters: Cluster[]): SunNode {
  const buckets: Record<Sentiment, SunLeaf[]> = {
    positive: [],
    neutral: [],
    critical: [],
  };

  for (const c of clusters) {
    const clusterName =
      c.summary?.cluster_title
        ? String(c.summary.cluster_title)
        : `Cluster ${c.cluster_id}`;
    for (const tile of c.items) {
      const bucket = emotionBucket(tile);
      buckets[bucket].push({
        name: tileDisplayTitle(tile),
        value: 1,
        meta: {
          kind: "tile",
          tile,
          clusterId: c.cluster_id,
          clusterName,
          bucket,
        },
      });
    }
  }

  const children: SunBranch[] = [];
  const order: Sentiment[] = ["positive", "neutral", "critical"];
  for (const s of order) {
    if (buckets[s].length > 0) {
      children.push({
        name: s,
        meta: { kind: "sentiment", sentiment: s },
        children: buckets[s],
      });
    }
  }

  return {
    name: query || "Topic",
    children,
  };
}

/* ── Sentiment stats ── */
function computeSentimentStats(clusters: Cluster[]) {
  let pos = 0,
    neu = 0,
    crit = 0;
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

/* ── Sentiment colors ── */
const SENTIMENT_COLORS: Record<Sentiment, { light: string; dark: string; ring: string; label: string }> = {
  positive: { light: "#dff7e6", dark: "#1b7f3a", ring: "#bfe8c8", label: "Positive" },
  neutral: { light: "#f0f0f0", dark: "#555555", ring: "#e2e2e2", label: "Neutral" },
  critical: { light: "#fde2e2", dark: "#b42318", ring: "#f3c1c1", label: "Critical" },
};

/* ── Sunburst component ── */
function Sunburst({
  data,
  query,
  stats,
  width = 600,
  height = 600,
  onPick,
  hoveredKey,
  onHover,
}: {
  data: SunNode;
  query: string;
  stats: ReturnType<typeof computeSentimentStats>;
  width?: number;
  height?: number;
  onPick: (meta: any) => void;
  hoveredKey: string | null;
  onHover: (key: string | null) => void;
}) {
  const computed = useMemo(() => {
    const radius = Math.min(width, height) / 2 - 20;
    const centerRadius = radius * 0.22;

    const root = d3
      .hierarchy<any>(data as any)
      .sum((d) => d.value || 0)
      .sort(() => 0);

    const partition = d3.partition<any>().size([2 * Math.PI, radius]);
    partition(root);

    const arc = d3
      .arc<any>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => Math.max(d.y0, centerRadius))
      .outerRadius((d) => d.y1)
      .padAngle(0.008)
      .cornerRadius(4);

    function fillFor(d: any): string {
      const name = String(d.data.name);

      // depth 1: sentiment ring
      if (d.depth === 1) {
        const s = name as Sentiment;
        return SENTIMENT_COLORS[s]?.ring || "#e6e6e6";
      }

      // depth 2: leaf tiles — color by sentiment + intensity
      const tile = d.data?.meta?.tile;
      if (!tile) return "#ddd";

      const bucket = (d.data?.meta?.bucket || "neutral") as Sentiment;
      const inten = tileIntensity01(tile);
      const colors = SENTIMENT_COLORS[bucket] || SENTIMENT_COLORS.neutral;
      return d3.interpolateRgb(colors.light, colors.dark)(inten * 0.7 + 0.15);
    }

    const nodes = root.descendants().filter((d) => d.depth > 0);

    return {
      viewBox: `${-width / 2} ${-height / 2} ${width} ${height}`,
      centerRadius,
      nodes: nodes.map((d) => {
        const key = d.data.name + "|" + d.depth + "|" + d.x0.toFixed(4);
        return {
          key,
          d,
          path: arc(d) || "",
          fill: fillFor(d),
          clickable: !!d.data?.meta,
          isLeaf: !d.children,
          sentiment:
            d.depth === 1
              ? (d.data.name as Sentiment)
              : (d.data?.meta?.bucket as Sentiment) || "neutral",
          title:
            d.depth === 2 && d.data?.meta?.tile
              ? `${tileDisplayTitle(d.data.meta.tile)}\n${tileDisplaySource(d.data.meta.tile)} · ${tileDisplayTime(d.data.meta.tile)}\n${d.data.meta.tile.one_line_takeaway || ""}`
              : String(d.data.name),
        };
      }),
    };
  }, [data, width, height]);

  return (
    <svg
      viewBox={computed.viewBox}
      width={width}
      height={height}
      aria-label="Mosaic sunburst"
      style={{ display: "block" }}
    >
      <defs>
        <filter id="tile-shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
        </filter>
      </defs>

      <g>
        {computed.nodes.map((n) => {
          const isHovered = hoveredKey === n.key;
          const scale = isHovered && n.isLeaf ? 1.08 : 1;

          // Calculate center of the arc for transform-origin
          const midAngle = (n.d.x0 + n.d.x1) / 2;
          const midRadius = (Math.max(n.d.y0, computed.centerRadius) + n.d.y1) / 2;
          const cx = Math.sin(midAngle) * midRadius;
          const cy = -Math.cos(midAngle) * midRadius;

          return (
            <path
              key={n.key}
              d={n.path}
              fill={n.fill}
              stroke={n.isLeaf ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}
              strokeWidth={n.isLeaf ? 1.5 : 2.5}
              style={{
                cursor: n.clickable ? "pointer" : "default",
                transform: isHovered && n.isLeaf
                  ? `translate(${cx * 0.06}px, ${cy * 0.06}px) scale(${scale})`
                  : "none",
                transformOrigin: `${cx}px ${cy}px`,
                transition: "transform 180ms ease, filter 180ms ease",
                filter: isHovered && n.isLeaf
                  ? "drop-shadow(0 4px 12px rgba(0,0,0,0.2))"
                  : "none",
              }}
              onMouseEnter={() => onHover(n.key)}
              onMouseLeave={() => onHover(null)}
              onClick={() => {
                if (n.clickable) onPick(n.d.data.meta);
              }}
            >
              <title>{n.title}</title>
            </path>
          );
        })}
      </g>

      {/* Center circle */}
      <circle
        cx={0}
        cy={0}
        r={computed.centerRadius}
        fill="white"
        stroke="#e8e8e8"
        strokeWidth={2}
      />

      {/* Center content: query + stats */}
      <text
        x={0}
        y={-14}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fontWeight={800}
        fill="#333"
      >
        {query.length > 18 ? query.slice(0, 16) + "…" : query}
      </text>

      <text
        x={0}
        y={6}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10}
        fill="#888"
      >
        {stats.total} articles
      </text>

      {/* Mini sentiment bars in center */}
      {(() => {
        const barWidth = computed.centerRadius * 1.2;
        const barHeight = 5;
        const y = 22;
        const startX = -barWidth / 2;
        const posW = (stats.positive.pct / 100) * barWidth;
        const neuW = (stats.neutral.pct / 100) * barWidth;
        const critW = (stats.critical.pct / 100) * barWidth;
        return (
          <g>
            <rect x={startX} y={y} width={posW} height={barHeight} rx={2.5} fill={SENTIMENT_COLORS.positive.ring} />
            <rect x={startX + posW} y={y} width={neuW} height={barHeight} rx={0} fill={SENTIMENT_COLORS.neutral.ring} />
            <rect x={startX + posW + neuW} y={y} width={critW} height={barHeight} rx={2.5} fill={SENTIMENT_COLORS.critical.ring} />
          </g>
        );
      })()}
    </svg>
  );
}

/* ── Loading overlay ── */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

type LoadingTile = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hue: number;
  sat: number;
  lig: number;
  delay: number;
  dur: number;
};

function MosaicLoading({ loading, label, seed }: { loading: boolean; label?: string; seed: number }) {
  const tiles = useMemo(() => {
    const cols = 14;
    const rows = 9;
    const rand = mulberry32(seed);
    const list: LoadingTile[] = [];
    const used = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (used.has(key(c, r))) continue;
        const pick = rand();
        let w = 1, h = 1;
        if (pick > 0.88) { w = 2; h = 2; }
        else if (pick > 0.74) { w = 2; h = 1; }
        else if (pick > 0.60) { w = 1; h = 2; }
        if (c + w > cols) w = 1;
        if (r + h > rows) h = 1;
        for (let rr = r; rr < r + h; rr++)
          for (let cc = c; cc < c + w; cc++)
            used.add(key(cc, rr));

        list.push({
          id: `${c}-${r}`,
          x: c, y: r, w, h,
          hue: Math.floor(rand() * 360),
          sat: clamp(55 + rand() * 25, 45, 85),
          lig: clamp(32 + rand() * 28, 26, 64),
          delay: rand() * 0.8,
          dur: 1.8 + rand() * 1.8,
        });
      }
    }
    return { cols, rows, list };
  }, [seed]);

  const css = `
  .ml-wrap{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;transition:opacity 220ms ease;
    background:radial-gradient(1100px 680px at 10% 5%, #ffffff 0%, #f4f6fb 35%, #eef1f7 70%, #e8ebf2 100%);}
  .ml-wrap.is-on{opacity:1}
  .ml-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);gap:10px;padding:18px;}
  .ml-tile{grid-column:calc(var(--x) + 1)/span var(--w);grid-row:calc(var(--y) + 1)/span var(--h);border-radius:16px;overflow:hidden;
    box-shadow:0 10px 30px rgba(20,24,35,.10),0 2px 8px rgba(20,24,35,.08);}
  .ml-inner{width:100%;height:100%;
    background:radial-gradient(420px 240px at 25% 20%, rgba(255,255,255,.55), rgba(255,255,255,0) 55%),
    linear-gradient(135deg,hsla(var(--hue),var(--sat),calc(var(--lig) + 14%),.92),hsla(calc(var(--hue) + 22),calc(var(--sat) - 10%),calc(var(--lig) - 4%),.92));
    border:1px solid rgba(255,255,255,.55);backdrop-filter:blur(10px);
    animation:mlPulse var(--t) ease-in-out var(--d) infinite;}
  @keyframes mlPulse{0%{transform:translateY(0) scale(1);opacity:.88}
    35%{transform:translateY(-4px) scale(1.01);opacity:1}
    70%{transform:translateY(3px) scale(.995);opacity:.92}
    100%{transform:translateY(0) scale(1);opacity:.88}}
  .ml-center{position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);text-align:center;pointer-events:none;}
  .ml-pill{display:inline-flex;align-items:center;gap:10px;padding:12px 14px;border-radius:999px;background:rgba(255,255,255,.72);
    border:1px solid rgba(18,20,28,.10);box-shadow:0 18px 50px rgba(20,24,35,.12);backdrop-filter:blur(12px);
    font-weight:900;letter-spacing:.02em;color:rgba(18,20,28,.72);}
  .ml-dot{width:10px;height:10px;border-radius:999px;background:linear-gradient(135deg,#ff4fd8,#7c5cff);box-shadow:0 6px 18px rgba(124,92,255,.25);
    animation:mlDot .9s ease-in-out infinite;}
  @keyframes mlDot{0%,100%{transform:scale(.9);opacity:.7}50%{transform:scale(1.15);opacity:1}}
  .ml-sub{margin-top:10px;font-size:12px;color:rgba(18,20,28,.55)}
  .ml-vignette{position:absolute;inset:-40px;pointer-events:none;background:radial-gradient(1200px 650px at 50% 40%, rgba(0,0,0,0) 58%, rgba(0,0,0,.10) 100%);}
  `;

  return (
    <>
      <style>{css}</style>
      <div className={`ml-wrap ${loading ? "is-on" : ""}`} aria-hidden={!loading}>
        <div className="ml-grid" style={{ ["--cols" as any]: tiles.cols, ["--rows" as any]: tiles.rows } as React.CSSProperties}>
          {tiles.list.map((t) => (
            <div key={t.id} className="ml-tile"
              style={{
                ["--x" as any]: t.x, ["--y" as any]: t.y,
                ["--w" as any]: t.w, ["--h" as any]: t.h,
                ["--hue" as any]: t.hue, ["--sat" as any]: `${t.sat}%`,
                ["--lig" as any]: `${t.lig}%`, ["--d" as any]: `${t.delay}s`,
                ["--t" as any]: `${t.dur}s`,
              } as React.CSSProperties}
            >
              <div className="ml-inner" />
            </div>
          ))}
        </div>
        <div className="ml-center">
          <div className="ml-pill">
            <span className="ml-dot" />
            {label || "Building mosaic…"}
          </div>
          <div className="ml-sub">Fetching clusters & building tiles…</div>
        </div>
        <div className="ml-vignette" />
      </div>
    </>
  );
}

/* ── Sentiment Legend with percentages ── */
function SentimentLegend({ stats }: { stats: ReturnType<typeof computeSentimentStats> }) {
  const items: { key: Sentiment; label: string; color: string; pct: number; count: number }[] = [
    { key: "positive", label: "Positive", color: SENTIMENT_COLORS.positive.ring, pct: stats.positive.pct, count: stats.positive.count },
    { key: "neutral", label: "Neutral", color: SENTIMENT_COLORS.neutral.ring, pct: stats.neutral.pct, count: stats.neutral.count },
    { key: "critical", label: "Critical", color: SENTIMENT_COLORS.critical.ring, pct: stats.critical.pct, count: stats.critical.count },
  ];

  return (
    <div style={{
      display: "flex", gap: 20, justifyContent: "center",
      padding: "10px 20px", borderRadius: 14,
      background: "rgba(255,255,255,0.85)",
      border: "1px solid rgba(0,0,0,0.06)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
      backdropFilter: "blur(6px)",
    }}>
      {items.map((it) => (
        <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 12, height: 12, borderRadius: 3,
            background: it.color,
            border: "1px solid rgba(0,0,0,0.1)",
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#444" }}>
            {it.label}
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>
            {it.pct}%
          </span>
          <span style={{ fontSize: 11, color: "#999" }}>
            ({it.count})
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── Landing Page ── */
function LandingPage({ onSearch }: { onSearch: (q: string) => void }) {
  const [input, setInput] = useState("");
  const seed = 2026;
  const tiles = useMemo(() => {
    const cols = 16;
    const rows = 10;
    const rand = mulberry32(seed);
    const list: { id: string; x: number; y: number; w: number; h: number; hue: number; sat: number; lig: number; delay: number; dur: number }[] = [];
    const used = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (used.has(key(c, r))) continue;
        const pick = rand();
        let w = 1, h = 1;
        if (pick > 0.86) { w = 2; h = 2; }
        else if (pick > 0.72) { w = 2; h = 1; }
        else if (pick > 0.58) { w = 1; h = 2; }
        if (c + w > cols) w = 1;
        if (r + h > rows) h = 1;
        for (let rr = r; rr < r + h; rr++)
          for (let cc = c; cc < c + w; cc++)
            used.add(key(cc, rr));
        list.push({
          id: `${c}-${r}`, x: c, y: r, w, h,
          hue: Math.floor(rand() * 360),
          sat: clamp(55 + rand() * 30, 45, 85),
          lig: clamp(35 + rand() * 25, 28, 62),
          delay: rand() * 0.8,
          dur: 2.6 + rand() * 2.6,
        });
      }
    }
    return { cols, rows, list };
  }, []);

  const handleSubmit = useCallback(() => {
    const q = input.trim();
    if (q) onSearch(q);
  }, [input, onSearch]);

  const landingCss = `
  .landing-wrap{position:fixed;inset:0;z-index:100;overflow:hidden;
    background:radial-gradient(ellipse at 20% 20%, #f8f9fd 0%, #eef1f7 50%, #e4e8f0 100%);}
  .landing-grid{position:absolute;inset:0;display:grid;
    grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);
    gap:8px;padding:14px;opacity:0.35;}
  .landing-tile{grid-column:calc(var(--x)+1)/span var(--w);grid-row:calc(var(--y)+1)/span var(--h);
    border-radius:14px;overflow:hidden;
    box-shadow:0 8px 24px rgba(20,24,35,.08);}
  .landing-tile-inner{width:100%;height:100%;
    background:radial-gradient(300px 180px at 25% 20%, rgba(255,255,255,.5), rgba(255,255,255,0) 55%),
    linear-gradient(135deg,hsla(var(--hue),var(--sat),calc(var(--lig)+12%),.85),hsla(calc(var(--hue)+20),calc(var(--sat)-8%),calc(var(--lig)-3%),.85));
    border:1px solid rgba(255,255,255,.45);
    animation:landingFloat var(--t) ease-in-out var(--d) infinite;}
  @keyframes landingFloat{0%{transform:translateY(0) scale(1);opacity:.85}
    50%{transform:translateY(-3px) scale(1.005);opacity:1}
    100%{transform:translateY(0) scale(1);opacity:.85}}
  .landing-center{position:absolute;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;z-index:10;}
  .landing-glass{padding:48px 56px;border-radius:28px;
    background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.6);
    box-shadow:0 24px 60px rgba(0,0,0,.10),0 0 0 1px rgba(0,0,0,.04);
    backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
    text-align:center;max-width:520px;width:90%;}
  .landing-badge{display:inline-block;padding:4px 14px;border-radius:999px;
    background:linear-gradient(135deg,rgba(124,92,255,.12),rgba(255,79,216,.10));
    color:#7c5cff;font-size:11px;font-weight:800;letter-spacing:1.5px;margin-bottom:16px;}
  .landing-title{font-size:42px;font-weight:900;letter-spacing:-1px;
    color:#1a1a2e;margin:0 0 8px;line-height:1.1;}
  .landing-sub{font-size:15px;color:#666;margin:0 0 28px;line-height:1.5;}
  .landing-search{display:flex;gap:0;border-radius:16px;overflow:hidden;
    border:2px solid rgba(0,0,0,.08);background:#fff;
    box-shadow:0 8px 28px rgba(0,0,0,.06);}
  .landing-input{flex:1;padding:14px 18px;border:none;outline:none;font-size:16px;
    font-family:inherit;background:transparent;color:#222;}
  .landing-btn{padding:14px 28px;border:none;
    background:linear-gradient(135deg,#7c5cff,#5a3fd6);color:white;
    font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;
    transition:opacity 150ms ease;}
  .landing-btn:hover{opacity:0.9;}
  .landing-hint{margin-top:16px;font-size:12px;color:#999;}
  .landing-vignette{position:absolute;inset:-40px;pointer-events:none;
    background:radial-gradient(1200px 700px at 50% 40%, transparent 50%, rgba(0,0,0,.06) 100%);}
  `;

  return (
    <>
      <style>{landingCss}</style>
      <div className="landing-wrap">
        <div className="landing-grid"
          style={{ ["--cols" as any]: tiles.cols, ["--rows" as any]: tiles.rows } as React.CSSProperties}>
          {tiles.list.map((t) => (
            <div key={t.id} className="landing-tile"
              style={{
                ["--x" as any]: t.x, ["--y" as any]: t.y,
                ["--w" as any]: t.w, ["--h" as any]: t.h,
                ["--hue" as any]: t.hue, ["--sat" as any]: `${t.sat}%`,
                ["--lig" as any]: `${t.lig}%`, ["--d" as any]: `${t.delay}s`,
                ["--t" as any]: `${t.dur}s`,
              } as React.CSSProperties}>
              <div className="landing-tile-inner" />
            </div>
          ))}
        </div>
        <div className="landing-center">
          <div className="landing-glass">
            <div className="landing-badge">MOSAIC MODE</div>
            <h1 className="landing-title">News Mosaic</h1>
            <p className="landing-sub">
              Enter a topic to build your mosaic.<br />
              Fragments become something whole.
            </p>
            <div className="landing-search">
              <input
                className="landing-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="e.g. artificial intelligence, climate change..."
                autoFocus
              />
              <button className="landing-btn" onClick={handleSubmit}>
                Build Mosaic
              </button>
            </div>
            <div className="landing-hint">
              Press Enter or click Build Mosaic to start
            </div>
          </div>
        </div>
        <div className="landing-vignette" />
      </div>
    </>
  );
}

/* ── Main Page ── */
export default function Mosaic() {
  const [page, setPage] = useState<"landing" | "mosaic">("landing");
  const [query, setQuery] = useState("");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<any | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const run = useCallback(async (q: string) => {
    setLoading(true);
    setPicked(null);
    try {
      const data = await buildMosaic(q);
      setClusters(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleLandingSearch = useCallback((q: string) => {
    setQuery(q);
    setPage("mosaic");
    run(q);
  }, [run]);

  const handleTopbarSearch = useCallback(() => {
    if (query.trim()) run(query.trim());
  }, [query, run]);

  const sunData = useMemo(() => buildSunData(query, clusters), [query, clusters]);
  const stats = useMemo(() => computeSentimentStats(clusters), [clusters]);
  const pickedTile: Tile | null = picked?.tile || null;

  const loadingSeed = useMemo(() => {
    let s = 2026;
    for (let i = 0; i < query.length; i++) s = (s * 31 + query.charCodeAt(i)) >>> 0;
    return s;
  }, [query]);

  // Find the cluster for the picked tile
  const pickedCluster = picked?.clusterId
    ? clusters.find((c) => c.cluster_id === picked.clusterId)
    : null;

  if (page === "landing") {
    return <LandingPage onSearch={handleLandingSearch} />;
  }

  return (
    <div className="layout">
      <MosaicLoading loading={loading} label="Building mosaic…" seed={loadingSeed} />

      <div className="topbar">
        <div className="brand" style={{ cursor: "pointer" }} onClick={() => setPage("landing")}>
          <span className="logo" role="img" aria-label="mosaic">&#x1F9E9;</span>
          <h1>News Mosaic</h1>
        </div>

        <div className="search" style={{ maxWidth: 720, width: "100%" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleTopbarSearch(); }}
            placeholder="Search topic..."
          />
          <button onClick={handleTopbarSearch} disabled={loading}
            style={{ fontSize: loading ? "18px" : "16px", fontWeight: loading ? 800 : 600 }}>
            {loading ? "Building..." : "Build Mosaic"}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="main" style={{ width: "100%" }}>
          {clusters.length > 0 ? (
            <div style={{
              display: "grid",
              gridTemplateColumns: "minmax(580px, 660px) minmax(380px, 520px)",
              justifyContent: "center",
              gap: 24,
              alignItems: "start",
            }}>
              {/* Left: Sunburst + legend */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <Sunburst
                  data={sunData}
                  query={query}
                  stats={stats}
                  width={580}
                  height={580}
                  onPick={(meta) => {
                    if (!meta) return;
                    if (meta.kind === "tile") {
                      setPicked(meta);
                    } else if (meta.kind === "sentiment") {
                      setPicked(null);
                    }
                  }}
                  hoveredKey={hoveredKey}
                  onHover={setHoveredKey}
                />
                <SentimentLegend stats={stats} />
              </div>

              {/* Right: detail panel */}
              <div style={{ borderLeft: "1px solid #eee", paddingLeft: 20 }}>
                {pickedTile ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
                        Cluster: <b>{picked.clusterName}</b> · Sentiment: <b style={{
                          color: SENTIMENT_COLORS[picked.bucket as Sentiment]?.dark || "#555"
                        }}>{picked.bucket}</b>
                      </div>
                      <button type="button" onClick={() => setPicked(null)} aria-label="Close details"
                        style={{
                          width: 28, height: 28, borderRadius: 999,
                          border: "1px solid #e6e6e6", background: "#fff",
                          cursor: "pointer", lineHeight: "26px", padding: 0, flexShrink: 0,
                        }}>
                        ×
                      </button>
                    </div>

                    <h2 style={{ marginTop: 0 }}>{tileDisplayTitle(pickedTile)}</h2>

                    <div style={{ opacity: 0.7, marginBottom: 8 }}>
                      {tileDisplaySource(pickedTile)}{" "}
                      {tileDisplayTime(pickedTile) ? `· ${tileDisplayTime(pickedTile)}` : ""}
                    </div>

                    {pickedTile.one_line_takeaway ? (
                      <p style={{ lineHeight: 1.55 }}>{pickedTile.one_line_takeaway}</p>
                    ) : null}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
                      {pickedTile.tile_type ? (
                        <span style={{ fontSize: 12, padding: "4px 8px", borderRadius: 999, background: "#f2f2f2" }}>
                          {pickedTile.tile_type}
                        </span>
                      ) : null}
                      {tileDisplayUrl(pickedTile) ? (
                        <a href={tileDisplayUrl(pickedTile)} target="_blank" rel="noreferrer">
                          Open article ↗
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div>
                    {pickedCluster ? (
                      <div>
                        <h2 style={{ marginTop: 0 }}>
                          {pickedCluster.summary?.cluster_title || `Cluster ${pickedCluster.cluster_id}`}
                        </h2>
                        {pickedCluster.summary?.what_happened ? (
                          <p style={{ lineHeight: 1.55 }}>{pickedCluster.summary.what_happened}</p>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ paddingTop: 40, textAlign: "center" }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>&#x1F9E9;</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#333", marginBottom: 8 }}>
                          Explore the mosaic
                        </div>
                        <div style={{ fontSize: 14, color: "#888", lineHeight: 1.6 }}>
                          Hover over tiles to preview.<br />
                          Click any tile to read details.
                        </div>

                        {/* Cluster list */}
                        <div style={{ marginTop: 28, textAlign: "left" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#999", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>
                            Clusters found
                          </div>
                          {clusters.map((c) => (
                            <div key={c.cluster_id} style={{
                              padding: "10px 14px", borderRadius: 12,
                              background: "#fafafa", border: "1px solid #eee",
                              marginBottom: 8, cursor: "default",
                            }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>
                                {c.summary?.cluster_title || `Cluster ${c.cluster_id}`}
                              </div>
                              <div style={{ fontSize: 12, color: "#888", marginTop: 4 }}>
                                {c.items.length} articles
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="empty">
              <div className="emptyTitle">Enter with fragments. Leave with something whole.</div>
              <div className="emptySub">Search a topic to build your mosaic.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
