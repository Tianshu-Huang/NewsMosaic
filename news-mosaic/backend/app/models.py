from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Literal

TileType = Literal["FACT", "ANALYSIS", "OPINION", "UNVERIFIED"]

class Article(BaseModel):
    id: str
    title: str
    snippet: str = ""
    source: str = ""
    published_at: str = ""
    url: HttpUrl

class MosaicRequest(BaseModel):
    query: str
    days: int = 7
    max_articles: int = 60

class Tile(BaseModel):
    article: Article
    tile_type: TileType
    topic_tags: List[str] = []
    one_line_takeaway: str = ""
    confidence: float = 0.5
    valence: float = 0.0
    intensity: float = 0.0
    intensity_level: str = "CALM"

class ClusterSummary(BaseModel):
    cluster_title: str
    what_happened: str
    why_it_matters: List[str]
    what_to_watch: List[str]
    timeline: List[dict]  # [{"time": "...", "event": "..."}]

class Cluster(BaseModel):
    cluster_id: str
    items: List[Tile]
    summary: ClusterSummary

class ClusterLite(BaseModel):
    cluster_id: str
    items: List[Tile]
    summary: Optional[ClusterSummary] = None

class ClusterSummaryRequest(BaseModel):
    items: List[Article]
