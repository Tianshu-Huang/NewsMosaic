import "./mosaic-flower.css";
import "../components/MosaicLoading.css"
import { useMemo, useState } from "react";
import * as d3 from "d3";
import { buildMosaic } from "../api";

type Tile = {
  title?: string; // optional fallback
  url?: string;
  source?: string;
  tone?: string; // optional (positive/neutral/critical or similar)
  meta?: string;
  article?: {
    id?: string;
    title?: string;
    url?: string;
    source?: string;
    published_at?: string;
  };
  one_line_takeaway?: string;
  tile_type?: string; // FACT / ANALYSIS / OPINION / ...
  [k: string]: any;
  valence?: number;        // [-1, 1]
  intensity?: number;      // [0, 1]
  intensity_level?: string;
};

type Cluster = {
  cluster_id: string;
  summary?: any;
  items: Tile[];
};

type SunNode =
  | { name: string; children: SunNode[] }
  | { name: string; value: number; meta: any };

// stable shuffle so we avoid implicit ranking but still keep UI consistent per query
function stableShuffle<T>(arr: T[], seedStr: string): T[] {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;

  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

function emotionBucket(tile: Tile): "positive" | "neutral" | "critical" {
  const v = Number(tile.valence ?? 0);
  if (v >= 0.10) return "positive";
  if (v <= -0.10) return "critical";
  return "neutral";
}

function tileIntensity01(tile: Tile): number {
  const x = Number(tile.intensity ?? 0);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function buildSunData(query: string, clusters: Cluster[]): SunNode {
  return {
    name: query || "Topic",
    children: (clusters || []).map((c) => {
      const clusterName = c.summary?.cluster_title ? String(c.summary.cluster_title) : `Cluster ${c.cluster_id}`;

      const tiles = stableShuffle(c.items || [], `${query}::${clusterName}`);
      const buckets: Record<"positive" | "neutral" | "critical", Tile[]> = {
        positive: [],
        neutral: [],
        critical: [],
      };

      for (const tile of tiles) {
        buckets[emotionBucket(tile)].push(tile);
      }

      return {
        name: clusterName,
        children: (["positive", "neutral", "critical"] as const)
          .filter((k) => buckets[k].length > 0)
          .map((k) => ({
            name: k,
            children: buckets[k].map((tile) => ({
              name: tileDisplayTitle(tile),
              value: 1,
              meta: { tile, clusterId: c.cluster_id, clusterName, bucket: k },
            })),
          })),
      };
    }),
  };
}

/**
 * Minimal inline Sunburst (no extra file).
 * Click a leaf -> calls onPick(meta)
 */
function Sunburst({
  data,
  width = 740,
  height = 520,
  onPick,
}: {
  data: SunNode;
  width?: number;
  height?: number;
  onPick: (meta: any) => void;
}) {
  const svg = useMemo(() => {
    const w = width;
    const h = height;
    const radius = Math.min(w, h) / 2 - 14;

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
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);

    function fillFor(d: any) {
      const name = String(d.data.name);

      // depth1: cluster ring
      if (d.depth === 1) return "#f2f2f2";

      // depth2: bucket ring
      if (d.depth === 2) {
        if (name === "positive") return "#bfe8c8";
        if (name === "neutral") return "#e6e6e6";
        if (name === "critical") return "#f3c1c1";
        return "#e6e6e6";
      }

      // depth3: leaf tiles
      const tile = d.data?.meta?.tile;
      if (!tile) return "#ddd";

      const bucket = (d.data?.meta?.bucket || "neutral") as "positive" | "neutral" | "critical";
      const inten = tileIntensity01(tile);

      const light =
        bucket === "positive" ? "#dff7e6" :
        bucket === "critical" ? "#fde2e2" :
        "#f0f0f0";

      const dark =
        bucket === "positive" ? "#1b7f3a" :
        bucket === "critical" ? "#b42318" :
        "#555555";

      return d3.interpolateRgb(light, dark)(inten);
    }

    const nodes = root.descendants().filter((d) => d.depth > 0);
    console.log("sunburst root children", root.children?.length, "nodes", nodes.length);


    return {
      viewBox: `${-w / 2} ${-h / 2} ${w} ${h}`,
      nodes: nodes.map((d) => ({
        key: d.data.name + "|" + d.depth + "|" + d.x0 + "|" + d.y0,
        d,
        path: arc(d) || "",
        fill: fillFor(d),
        clickable: !d.children && !!d.data?.meta,
        title:
          !d.children && d.data?.meta?.tile
            ? `${tileDisplayTitle(d.data.meta.tile)}\n${tileDisplaySource(d.data.meta.tile)} • ${tileDisplayTime(
                d.data.meta.tile
              )}\n${d.data.meta.tile.one_line_takeaway || ""}`
            : String(d.data.name),
      })),
      centerText: String((data as any).name || "Topic"),
    };
  }, [data, width, height]);

  return (
    <svg viewBox={svg.viewBox} width={width} height={height} aria-label="Mosaic sunburst">
      <g>
        {svg.nodes.map((n) => (
          <path
            key={n.key}
            d={n.path}
            fill={n.fill}
            stroke="#ffffff"
            strokeWidth={0.6}
            onClick={() => {
              if (n.clickable) onPick(n.d.data.meta);
            }}
            style={{ cursor: n.clickable ? "pointer" : "default" }}
          >
            <title>{n.title}</title>
          </path>
        ))}
      </g>
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={13}
        fontWeight={600}
        fill="#444"
      >
        {svg.centerText}
      </text>
    </svg>
  );
}

/* -----------------------------
   Mosaic Loading Overlay (inline)
   - Zero deps, pure CSS animation
------------------------------ */

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

  // NEW: fish-scale flip controls
  flipAxis: "x" | "y"; // rotateX or rotateY
  amp: number;         // rotation amplitude (deg)
  phase: number;       // phase offset (s)
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
        let w = 1;
        let h = 1;
        if (pick > 0.88) {
          w = 2;
          h = 2;
        } else if (pick > 0.74) {
          w = 2;
          h = 1;
        } else if (pick > 0.60) {
          w = 1;
          h = 2;
        }

        if (c + w > cols) w = 1;
        if (r + h > rows) h = 1;

        for (let rr = r; rr < r + h; rr++) {
          for (let cc = c; cc < c + w; cc++) {
            used.add(key(cc, rr));
          }
        }

        const hue = Math.floor(rand() * 360);
        const sat = clamp(55 + rand() * 25, 45, 85);
        const lig = clamp(32 + rand() * 28, 26, 64);
        const flipAxis = rand() > 0.5 ? "y" : "x";
        const amp = 10 + rand() * 18;     // 10~28deg
        const phase = rand() * 1.6;       // 0~1.6s

        list.push({
          id: `${c}-${r}`,
          x: c,
          y: r,
          w,
          h,
          hue,
          sat,
          lig,
          delay: rand() * 0.8,
          dur: 1.8 + rand() * 1.8,

          flipAxis,
          amp,
          phase,
        });
      }
    }

    return { cols, rows, list };
  }, [seed]);

  // inline styles so you don't need a new css file
  const css = `
  .ml-wrap{position:fixed;inset:0;z-index:9999;pointer-events:none;opacity:0;transition:opacity 220ms ease;
    background:radial-gradient(1100px 680px at 10% 5%, #ffffff 0%, #f4f6fb 35%, #eef1f7 70%, #e8ebf2 100%);}
  .ml-wrap.is-on{opacity:1}
  .ml-grid{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);
    gap:10px;padding:18px;}
  .ml-tile{grid-column:calc(var(--x) + 1)/span var(--w);grid-row:calc(var(--y) + 1)/span var(--h);border-radius:16px;overflow:hidden;
    box-shadow:0 10px 30px rgba(20,24,35,.10),0 2px 8px rgba(20,24,35,.08);transform:translateZ(0);}
  .ml-inner{width:100%;height:100%;
    background:radial-gradient(420px 240px at 25% 20%, rgba(255,255,255,.55), rgba(255,255,255,0) 55%),
    linear-gradient(135deg,hsla(var(--hue),var(--sat),calc(var(--lig) + 14%),.92),hsla(calc(var(--hue) + 22),calc(var(--sat) - 10%),calc(var(--lig) - 4%),.92));
    border:1px solid rgba(255,255,255,.55);backdrop-filter:blur(10px);
    animation:mlPulse var(--t) ease-in-out var(--d) infinite;}
  @keyframes mlPulse{0%{transform:translateY(0) scale(1);opacity:.88;filter:blur(0) saturate(1.05)}
    35%{transform:translateY(-4px) scale(1.01);opacity:1;filter:blur(0) saturate(1.12)}
    70%{transform:translateY(3px) scale(.995);opacity:.92;filter:blur(.2px) saturate(1.05)}
    100%{transform:translateY(0) scale(1);opacity:.88;filter:blur(0) saturate(1.05)}}
  .ml-sweep{position:absolute;inset:-40%;background:linear-gradient(135deg, rgba(255,255,255,0) 35%, rgba(255,255,255,.55) 50%, rgba(255,255,255,0) 65%);
    transform:translateX(-35%) translateY(-35%);animation:mlSweep 1.9s ease-in-out infinite;opacity:.25;pointer-events:none;}
  @keyframes mlSweep{0%{transform:translateX(-35%) translateY(-35%)}50%{transform:translateX(10%) translateY(10%)}100%{transform:translateX(45%) translateY(45%)}}
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
        <div
          className="ml-grid"
          style={
            {
              ["--cols" as any]: tiles.cols,
              ["--rows" as any]: tiles.rows,
            } as React.CSSProperties
          }
        >
          {tiles.list.map((t) => (
            <div
              key={t.id}
              className="ml-tile"
              style={
                {
                  ["--x" as any]: t.x,
                  ["--y" as any]: t.y,
                  ["--w" as any]: t.w,
                  ["--h" as any]: t.h,
                  ["--hue" as any]: t.hue,
                  ["--sat" as any]: `${t.sat}%`,
                  ["--lig" as any]: `${t.lig}%`,
                  ["--d" as any]: `${t.delay}s`,
                  ["--t" as any]: `${t.dur}s`,

                   // NEW
                  ["--amp" as any]: `${t.amp}deg`,
                  ["--ph" as any]: `${t.phase}s`,
                  ["--axis" as any]: t.flipAxis,
                } as React.CSSProperties
              }
            >
              <div className="ml-inner" />
            </div>
          ))}
        </div>

        <div className="ml-sweep" />
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

/* -----------------------------
   Page
------------------------------ */

export default function Mosaic() {
  const [query, setQuery] = useState("OpenAI");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [loading, setLoading] = useState(false);

  // clicked leaf info
  const [picked, setPicked] = useState<any | null>(null);

  async function run() {
    setLoading(true);
    try {
      const data = await buildMosaic(query);
      setClusters(data || []);
      setPicked(null);
    } finally {
      setLoading(false);
    }
  }

  const sunData = useMemo(() => buildSunData(query, clusters), [query, clusters]);
  const pickedTile: Tile | null = picked?.tile || null;

  // 让 loading 的配色“跟 query 绑定”——同一关键词颜色稳定
  const loadingSeed = useMemo(() => {
    let s = 2026;
    for (let i = 0; i < query.length; i++) s = (s * 31 + query.charCodeAt(i)) >>> 0;
    return s;
  }, [query]);

  return (
    <div className="layout">
      {/* ✅ Loading 覆盖层：直接放在页面最顶层 */}
      <MosaicLoading loading={loading} label={loading ? "Building mosaic…" : ""} seed={loadingSeed} />

      <div className="topbar">
        <div className="brand">
          <span className="logo">🧩</span>
          <h1>News Mosaic</h1>
        </div>

        <div className="search" style={{ width: "200%" }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topic..." />
          <button
            onClick={run}
            disabled={loading}
            style={{
              fontSize: loading ? "18px" : "16px",
              fontWeight: loading ? 800 : 600,
              letterSpacing: "0.6px",
            }}
          >
            {loading ? "Building..." : "Build Mosaic"}
          </button>
        </div>
      </div>

      <div className="content">
        {/* No sidebar (avoid any implied ranking / ordering) */}
        <div className="main" style={{ width: "100%" }}>
          {clusters.length > 0 ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 420px",
                gap: 16,
                alignItems: "start",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Sunburst data={sunData} onPick={(meta) => setPicked(meta)} />
              </div>

              <div style={{ borderLeft: "1px solid #eee", paddingLeft: 16 }}>
                {!pickedTile ? (
                  <div className="empty">
                    <div className="emptyTitle">Click a slice to read a different angle.</div>
                    <div className="emptySub">No ranking. Explore the mosaic.</div>
                    <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7, lineHeight: 1.6 }}>
                      Buckets: <b>positive</b> / <b>neutral</b> / <b>critical</b> (based on tile.tone/meta/takeaway).
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
                        Cluster: <b>{picked.clusterName}</b> • Bucket: <b>{picked.bucket}</b>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPicked(null)}
                        aria-label="Close details"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 999,
                          border: "1px solid #e6e6e6",
                          background: "#fff",
                          cursor: "pointer",
                          lineHeight: "26px",
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </div>

                    <h2 style={{ marginTop: 0 }}>{tileDisplayTitle(pickedTile)}</h2>

                    <div style={{ opacity: 0.7, marginBottom: 8 }}>
                      {tileDisplaySource(pickedTile)}{" "}
                      {tileDisplayTime(pickedTile) ? `• ${tileDisplayTime(pickedTile)}` : ""}
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
