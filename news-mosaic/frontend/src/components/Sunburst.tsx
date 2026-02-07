import { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

type Tile = any; // 你们现在用 any 也行，后面再补类型

type SunNode =
  | { name: string; children: SunNode[] }
  | { name: string; value: number; meta: Tile };

function bucketLabelFromTile(tile: Tile): "neutral" | "opinion" | "unverified" {
  const t = String(tile?.tile_type || "").toUpperCase();
  if (t === "FACT" || t === "ANALYSIS") return "neutral";
  if (t === "OPINION") return "opinion";
  return "unverified";
}

// “不排序”：我们用稳定随机（同一 query + 同一 cluster 标题 => 顺序稳定，但不是按热度/时间）
function stableShuffle<T>(arr: T[], seedStr: string): T[] {
  // 简易 hash -> seed
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

export default function Sunburst({
  data,
  width = 720,
  height = 520,
  onPickLeaf,
}: {
  data: any; // Mosaic.tsx 传进来的 clusters + query
  width?: number;
  height?: number;
  onPickLeaf: (tile: Tile) => void;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  const root = useMemo(() => {
    const { query, clusters } = data as { query: string; clusters: any[] };

    const children: SunNode[] = (clusters || []).map((c) => {
      const clusterName = c?.summary?.cluster_title ? String(c.summary.cluster_title) : `Cluster ${c.cluster_id}`;

      // 每个 cluster 里面 tiles “不排序”：稳定 shuffle
      const tiles = stableShuffle(c.items || [], `${query}::${clusterName}`);

      const buckets: Record<string, Tile[]> = { neutral: [], opinion: [], unverified: [] };
      for (const tile of tiles) buckets[bucketLabelFromTile(tile)].push(tile);

      const bucketNodes: SunNode[] = Object.entries(buckets)
        .filter(([, v]) => v.length > 0)
        .map(([k, v]) => ({
          name: k,
          children: v.map((tile) => ({
            name: tile?.article?.title || "Untitled",
            value: 1,
            meta: tile,
          })),
        })) as any;

      return { name: clusterName, children: bucketNodes } as any;
    });

    return d3.hierarchy({ name: query || "Topic", children } as any).sum((d: any) => d.value || 0);
  }, [data]);

  useEffect(() => {
    if (!ref.current) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const radius = Math.min(width, height) / 2 - 12;

    const partition = d3.partition<any>().size([2 * Math.PI, radius]);
    const r = partition(root);

    // color: cluster-level base hue, bucket-level adjust
    const topNames = r.children?.map((d) => d.data.name) || [];
    const color = d3.scaleOrdinal<string, string>().domain(topNames).range(d3.schemeTableau10 as any);

    const arc = d3
      .arc<any>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);

    const g = svg
      .attr("viewBox", `${-width / 2} ${-height / 2} ${width} ${height}`)
      .append("g");

    const nodes = r.descendants().filter((d) => d.depth > 0); // skip center root

    const paths = g
      .selectAll("path")
      .data(nodes)
      .enter()
      .append("path")
      .attr("d", arc as any)
      .attr("fill", (d) => {
        // depth1=cluster, depth2=bucket
        const base = d.ancestors().find((x) => x.depth === 1)?.data?.name;
        const c = color(base || "x");
        const name = String(d.data.name);

        // 简单区分 bucket：neutral/opinion/unverified
        if (name === "neutral") return d3.color(c)!.brighter(0.6).formatHex();
        if (name === "opinion") return d3.color(c)!.darker(0.2).formatHex();
        if (name === "unverified") return "#c9c9c9";
        return c;
      })
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .style("cursor", (d) => (d.children ? "default" : "pointer"))
      .on("click", (_, d) => {
        if (!d.children && (d.data as any).meta) onPickLeaf((d.data as any).meta);
      });

    paths.append("title").text((d) => {
      const leaf = (d.data as any).meta;
      if (leaf?.article?.source) {
        return `${leaf.article.title}\n${leaf.article.source} • ${leaf.article.published_at || ""}\n${leaf.one_line_takeaway || ""}`;
      }
      return d.data.name;
    });

    // 中心标题
    g.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .style("font-size", "14px")
      .style("font-weight", 600)
      .text((root.data as any).name || "Topic");
  }, [root, width, height, onPickLeaf]);

  return <svg ref={ref} style={{ width: "100%", maxWidth: width, height }} />;
}
