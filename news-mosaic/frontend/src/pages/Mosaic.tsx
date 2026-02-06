import { useState } from "react";
import { api, Cluster } from "../api";
import MosaicBoard from "../components/MosaicBoard";

export default function Mosaic() {
  const [q, setQ] = useState("OpenAI");
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await api.post<Cluster[]>("/mosaic", { query: q, days: 7, max_articles: 60 });
      setClusters(res.data);
      setSelected(res.data[0]?.cluster_id || "");
    } finally {
      setLoading(false);
    }
  }

  const current = clusters.find(c => c.cluster_id === selected);

  return (
    <div className="layout">
      <div className="topbar">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search topic..." />
        <button onClick={run} disabled={loading}>{loading ? "Building…" : "Build Mosaic"}</button>
      </div>

      <div className="content">
        <div className="sidebar">
          {clusters.map(c => (
            <button
              key={c.cluster_id}
              className={selected === c.cluster_id ? "clusterBtn active" : "clusterBtn"}
              onClick={() => setSelected(c.cluster_id)}
            >
              <div className="clusterTitle">{c.summary.cluster_title}</div>
              <div className="clusterMeta">{c.items.length} tiles</div>
            </button>
          ))}
        </div>

        <div className="main">
          {current ? <MosaicBoard cluster={current} /> : <div>Run a search to build a mosaic.</div>}
        </div>
      </div>
    </div>
  );
}
