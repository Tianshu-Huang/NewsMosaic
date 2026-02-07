import "./mosaic-flower.css";
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

function normalizeTone(raw: string): "positive" | "neutral" | "critical" {
  const t = (raw || "").toLowerCase();
  if (["positive", "pro", "support", "favorable"].some((k) => t.includes(k))) return "positive";
  if (["negative", "critical", "con", "against", "risk", "concern"].some((k) => t.includes(k))) return "critical";
  return "neutral";
}

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
        // buckets[tileTone(tile)].push(tile);
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

    function tileIntensity01_local(tile: any): number {
      const x = Number(tile?.intensity ?? 0);
      if (!Number.isFinite(x)) return 0;
      return Math.max(0, Math.min(1, x));
    }

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
      const inten = tileIntensity01_local(tile);

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

  return (
    <div className="layout">
      <div className="topbar">
        <div className="brand">
          <span className="logo">🧩</span>
          <h1>News Mosaic</h1>
        </div>

        <div className="search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topic..." />
          <button onClick={run} disabled={loading}>
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
                    <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
                      Cluster: <b>{picked.clusterName}</b> • Bucket: <b>{picked.bucket}</b>
                    </div>

                    <h2 style={{ marginTop: 0 }}>{tileDisplayTitle(pickedTile)}</h2>

                    <div style={{ opacity: 0.7, marginBottom: 8 }}>
                      {tileDisplaySource(pickedTile)} {tileDisplayTime(pickedTile) ? `• ${tileDisplayTime(pickedTile)}` : ""}
                    </div>

                    {pickedTile.one_line_takeaway ? <p style={{ lineHeight: 1.55 }}>{pickedTile.one_line_takeaway}</p> : null}

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

                    <button type="button" onClick={() => setPicked(null)}>
                      Clear
                    </button>

                    {/* optional: raw debug */}
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: "pointer", opacity: 0.75 }}>debug tile json</summary>
                      <pre style={{ fontSize: 11, maxHeight: 220, overflow: "auto", background: "#f6f6f6", padding: 10 }}>
                        {JSON.stringify(pickedTile, null, 2)}
                      </pre>
                    </details>
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
