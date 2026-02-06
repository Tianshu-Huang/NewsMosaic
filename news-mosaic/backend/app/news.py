import httpx
import hashlib
from .models import Article
from .settings import NEWS_API_KEY
from .sample_data import SAMPLE_ARTICLES


def _make_id(title: str, source: str, published_at: str) -> str:
    raw = f"{title}|{source}|{published_at}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]

async def fetch_news(query: str, days: int, max_articles: int) -> list[Article]:
    if not NEWS_API_KEY:
    # No API key -> return mock data so the demo still works
        return SAMPLE_ARTICLES[:max_articles]


    # NewsAPI /v2/everything
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "pageSize": min(max_articles, 100),
        "sortBy": "publishedAt",
        "language": "en",
        "apiKey": NEWS_API_KEY,
    }

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()

    articles: list[Article] = []
    for a in data.get("articles", []):
        title = a.get("title") or ""
        if not title.strip():
            continue
        source = (a.get("source") or {}).get("name", "") or ""
        published_at = a.get("publishedAt", "") or ""
        snippet = a.get("description", "") or ""
        link = a.get("url", "") or ""
        if not link:
            continue
        articles.append(
            Article(
                id=_make_id(title, source, published_at),
                title=title,
                snippet=snippet,
                source=source,
                published_at=published_at,
                url=link,
            )
        )

    # 简单去重（按 title）
    seen = set()
    deduped = []
    for art in articles:
        key = art.title.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(art)

    return deduped[:max_articles]
