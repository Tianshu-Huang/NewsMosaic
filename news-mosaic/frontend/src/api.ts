import axios from "axios";

export const api = axios.create({
  baseURL: "http://localhost:8000",
});

export async function buildMosaic(query: string) {
  const res = await api.post("/mosaic", {
    query,
    days: 7,
    max_articles: 50,
  });
  return res.data;
}
