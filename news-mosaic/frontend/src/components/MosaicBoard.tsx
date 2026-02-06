import { Cluster, Tile } from "../api";

function typeClass(t: string) {
  // 不指定具体颜色也行，但 demo 会更炫；你们也可换成 Tailwind 配色
  if (t === "FACT") return "tile fact";
  if (t === "ANALYSIS") return "tile analysis";
  if (t === "OPINION") return "tile opinion";
  return "tile unverified";
}

export default function MosaicBoard({ cluster }: { cluster: Cluster }) {
  return (
    <div>
      <h2 style={{ margin: "0 0 8px 0" }}>{cluster.summary.cluster_title}</h2>
      <p style={{ marginTop: 0, opacity: 0.85 }}>{cluster.summary.what_happened}</p>

      <div className="board">
        {cluster.items.map((tile: Tile) => (
          <a
            key={tile.article.id}
            className={typeClass(tile.tile_type)}
            href={tile.article.url}
            target="_blank"
            rel="noreferrer"
            title={`${tile.one_line_takeaway}\n${tile.article.source} • ${tile.article.published_at}`}
          >
            <div className="tileTitle">{tile.article.title}</div>
            <div className="tileMeta">
              {tile.article.source} • {new Date(tile.article.published_at).toLocaleString()}
            </div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 6 }}>Why it matters</h3>
        <ul>{cluster.summary.why_it_matters.map((x, i) => <li key={i}>{x}</li>)}</ul>

        <h3 style={{ marginBottom: 6 }}>What to watch</h3>
        <ul>{cluster.summary.what_to_watch.map((x, i) => <li key={i}>{x}</li>)}</ul>

        <h3 style={{ marginBottom: 6 }}>Timeline</h3>
        <ul>{cluster.summary.timeline.map((t, i) => <li key={i}><b>{t.time}</b> — {t.event}</li>)}</ul>
      </div>
    </div>
  );
}
