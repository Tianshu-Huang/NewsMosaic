import { useState } from "react";
import { buildMosaic } from "./api";

export default function App() {
  const [query, setQuery] = useState("OpenAI");
  const [clusters, setClusters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    try {
      const data = await buildMosaic(query);
      setClusters(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>🧩 News Mosaic</h1>

      <div style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search topic..."
          style={{ padding: 8, width: 300 }}
        />
        <button onClick={handleSearch} style={{ marginLeft: 8 }}>
          {loading ? "Building..." : "Build Mosaic"}
        </button>
      </div>

      {clusters.map(cluster => (
        <div key={cluster.cluster_id} style={{ marginBottom: 24 }}>
          <h2>{cluster.summary.cluster_title}</h2>
          <p>{cluster.summary.what_happened}</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {cluster.items.map((tile: any) => (
              <a
                key={tile.article.id}
                href={tile.article.url}
                target="_blank"
                style={{
                  padding: 10,
                  borderRadius: 12,
                  background: "#f3f4f6",
                  textDecoration: "none",
                  color: "black",
                  fontSize: 14
                }}
              >
                {tile.article.title}
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
