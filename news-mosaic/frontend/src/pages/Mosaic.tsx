import "./mosaic-flower.css";
import { useState } from "react";
import { buildMosaic } from "../api";
import MosaicBoard from "../components/MosaicBoard";

export function RadialRing({
  title,
  items,
  onPick,
}: {
  title: string;
  items: Array<{ title: string; meta?: string; url?: string }>;
  onPick: (it: { title: string; meta?: string; url?: string }) => void;
}) {
  const palette = [
    "linear-gradient(135deg, rgba(120,190,255,0.75), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(255,140,180,0.72), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(255,200,90,0.75), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(120,230,170,0.70), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(170,160,255,0.70), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(255,155,95,0.72), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(90,220,220,0.70), rgba(255,255,255,0.35))",
    "linear-gradient(135deg, rgba(210,120,255,0.70), rgba(255,255,255,0.35))",
  ];

  const petals = items.slice(0, 8);
  const step = 360 / Math.max(1, petals.length);

  return (
    <div className="nm-radial">
      <div className="nm-radial-center">
        <div>
          {title}
          <span className="sub">Pick a petal</span>
        </div>
      </div>

      <div className="nm-petals">
        {petals.map((it, i) => {
          const ang = `${i * step}deg`;
          return (
            <button
              key={i}
              className="nm-petal"
              style={{
                ["--ang" as any]: ang,
                ["--delay" as any]: `${i * 35}ms`,
                ["--petal-bg" as any]: palette[i % palette.length],
              }}
              onClick={() => onPick(it)}
              type="button"
              title={it.title}
            >
              <div className="nm-petal-inner">
                <span className="nm-petal-dot" />
                <div className="nm-petal-title">{it.title}</div>
                <div className="nm-petal-meta">{it.meta ?? ""}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Mosaic() {
  const [query, setQuery] = useState("OpenAI");
  const [clusters, setClusters] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const data = await buildMosaic(query);
      setClusters(data);
      setSelectedId(data?.[0]?.cluster_id ?? "");
    } finally {
      setLoading(false);
    }
  }

  const selected = clusters.find((c) => c.cluster_id === selectedId);

  return (
  <div className="layout">
    <div className="topbar">
      <div className="brand">
        <span className="logo">🧩</span>
        <h1>News Mosaic</h1>
      </div>

      <div className="search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topic..."
        />
        <button onClick={run} disabled={loading}>
          {loading ? "Building..." : "Build Mosaic"}
        </button>
      </div>
    </div>

    <div className="content">
      <div className="sidebar">
        {clusters.map((c) => (
          <button
            key={c.cluster_id}
            className={"clusterBtn " + (c.cluster_id === selectedId ? "active" : "")}
            onClick={() => setSelectedId(c.cluster_id)}
            type="button"
          >
            <div className="clusterTitle">{c.summary?.cluster_title ?? "Untitled"}</div>
            <div className="clusterMeta">{c.items?.length ?? 0} tiles</div>
          </button>
        ))}
      </div>

      <div className="main">
        {selected ? (
          <MosaicBoard cluster={selected} />
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
