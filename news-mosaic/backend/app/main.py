from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .models import MosaicRequest, Cluster, ClusterLite, ClusterSummaryRequest, ClusterSummary, Tile
from .news import fetch_news
from .mosaic import cluster_articles
from .llm import classify_tiles, classify_tiles_fast, summarize_cluster

app = FastAPI(title="News Mosaic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/mosaic", response_model=list[Cluster])
async def build_mosaic(req: MosaicRequest):
    articles = await fetch_news(req.query, req.days, req.max_articles)
    clustered = cluster_articles(articles)

    result: list[Cluster] = []
    for cid, items in clustered.items():
        tiles = await classify_tiles(items)
        summary = await summarize_cluster(items)
        result.append(Cluster(cluster_id=cid, items=tiles, summary=summary))

    # 让“最大/最新”的簇排在前面（简单按条数）
    result.sort(key=lambda c: len(c.items), reverse=True)
    return result

@app.post("/mosaic-lite", response_model=list[ClusterLite])
async def build_mosaic_lite(req: MosaicRequest):
    articles = await fetch_news(req.query, req.days, req.max_articles)
    clustered = cluster_articles(articles)

    result: list[ClusterLite] = []
    for cid, items in clustered.items():
        tiles = await classify_tiles_fast(items)
        result.append(ClusterLite(cluster_id=cid, items=tiles, summary=None))

    result.sort(key=lambda c: len(c.items), reverse=True)
    return result

@app.post("/cluster-summary", response_model=ClusterSummary)
async def build_cluster_summary(req: ClusterSummaryRequest):
    return await summarize_cluster(req.items)

@app.post("/cluster-tiles", response_model=list[Tile])
async def build_cluster_tiles(req: ClusterSummaryRequest):
    return await classify_tiles(req.items)
