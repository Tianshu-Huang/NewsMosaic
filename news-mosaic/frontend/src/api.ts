import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8000",
});

export type TileType = "FACT" | "ANALYSIS" | "OPINION" | "UNVERIFIED";

export interface Article {
  id: string;
  title: string;
  snippet: string;
  source: string;
  published_at: string;
  url: string;
}

export interface Tile {
  article: Article;
  tile_type: TileType;
  topic_tags: string[];
  one_line_takeaway: string;
  confidence: number;
}

export interface ClusterSummary {
  cluster_title: string;
  what_happened: string;
  why_it_matters: string[];
  what_to_watch: string[];
  timeline: { time: string; event: string }[];
}

export interface Cluster {
  cluster_id: string;
  items: Tile[];
  summary: ClusterSummary;
}
