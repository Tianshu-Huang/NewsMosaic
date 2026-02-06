function typeClass(t: string) {
  if (t === "FACT") return "tile fact";
  if (t === "ANALYSIS") return "tile analysis";
  if (t === "OPINION") return "tile opinion";
  return "tile unverified";
}

export default function MosaicBoard({ cluster }: { cluster: any }) {
  return (
    <div>
      <h2 className="boardTitle">{cluster.summary.cluster_title}</h2>
      <p className="boardDesc">{cluster.summary.what_happened}</p>

      <div className="board">
        {cluster.items.map((tile: any) => (
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
              {tile.article.source || "Mock"} •{" "}
              {tile.article.published_at ? new Date(tile.article.published_at).toLocaleString() : ""}
            </div>
          </a>
        ))}
      </div>

      <div className="story">
        <div className="storyCol">
          <h3>Why it matters</h3>
          <ul>{cluster.summary.why_it_matters.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
        </div>

        <div className="storyCol">
          <h3>What to watch</h3>
          <ul>{cluster.summary.what_to_watch.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}
