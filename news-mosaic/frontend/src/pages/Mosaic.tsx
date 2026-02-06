import { useState } from "react";
import { buildMosaic } from "../api";
import MosaicBoard from "../components/MosaicBoard";

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

  const selected = clusters.find(c => c.cluster_id === selectedId);

  return (
    <div className="layout">
      <div className="topbar">
        <div className="brand">
          <span className="logo">🧩</span>
          <h1>News Mosaic</h1>
        </div>

        <div className="search">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search topic..." />
          <button onClick={run} disabled={loading}>
            {loading ? "Building..." : "Build Mosaic"}
          </button>
        </div>
      </div>

      <div className="content">
        <div className="sidebar">
          {clusters.map(c => (
            <button
              key={c.cluster_id}
              className={"clusterBtn " + (c.cluster_id === selectedId ? "active" : "")}
              onClick={() => setSelectedId(c.cluster_id)}
            >
              <div className="clusterTitle">{c.summary.cluster_title}</div>
              <div className="clusterMeta">{c.items.length} tiles</div>
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
