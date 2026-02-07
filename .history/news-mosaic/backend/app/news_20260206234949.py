import httpx
import hashlib
import json
from datetime import datetime, timedelta
from .models import Article
from .settings import (
    NEWS_API_KEY,
    GUARDIAN_API_KEY,
    NEWSDATA_API_KEY,
    REDDIT_CLIENT_ID,
    REDDIT_CLIENT_SECRET,
    ENABLE_NEWS_API,
    ENABLE_GUARDIAN,
    ENABLE_NEWSDATA,
    ENABLE_REDDIT,
    ENABLE_HACKERNEWS,
)
from .sample_data import SAMPLE_ARTICLES

def _make_id(title: str, source: str, published_at: str) -> str:
    raw = f"{title}|{source}|{published_at}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:16]

def _has_real_newsapi_key() -> bool:
    if not NEWS_API_KEY:
        return False
    k = NEWS_API_KEY.strip()
    if k.lower() in {"xxxx", "your_key_here", "replace_me"}:
        return False
    return True

# ==================== NewsAPI ====================
async def fetch_from_newsapi(query: str, max_articles: int) -> list[Article]:
    """从 NewsAPI 获取文章"""
    if not ENABLE_NEWS_API or not _has_real_newsapi_key():
        return []

    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query,
        "pageSize": min(max_articles, 100),
        "sortBy": "publishedAt",
        "language": "en",
        "apiKey": NEWS_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        articles: list[Article] = []
        for a in data.get("articles", []):
            title = a.get("title") or ""
            if not title.strip():
                continue
            source = (a.get("source") or {}).get("name", "") or "NewsAPI"
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
        return articles
    except Exception as e:
        print(f"❌ NewsAPI 错误: {e}")
        return []


# ==================== The Guardian ====================
async def fetch_from_guardian(query: str, max_articles: int) -> list[Article]:
    """从 The Guardian API 获取文章"""
    if not ENABLE_GUARDIAN:
        return []

    url = "https://open.theguardian.com/api/search"
    params = {
        "q": query,
        "page-size": min(max_articles, 200),
        "order-by": "newest",
        "api-key": GUARDIAN_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        articles: list[Article] = []
        for item in data.get("response", {}).get("results", []):
            title = item.get("webTitle", "") or ""
            if not title.strip():
                continue
            published_at = item.get("webPublicationDate", "") or ""
            link = item.get("webUrl", "") or ""
            if not link:
                continue
            snippet = item.get("fields", {}).get("trailText", "") or ""
            articles.append(
                Article(
                    id=_make_id(title, "The Guardian", published_at),
                    title=title,
                    snippet=snippet,
                    source="The Guardian",
                    published_at=published_at,
                    url=link,
                )
            )
        return articles
    except Exception as e:
        print(f"❌ The Guardian 错误: {e}")
        return []


# ==================== NewsData.io ====================
async def fetch_from_newsdata(query: str, max_articles: int) -> list[Article]:
    """从 NewsData.io 获取文章"""
    if not ENABLE_NEWSDATA:
        return []

    url = "https://newsdata.io/api/1/news"
    params = {
        "q": query,
        "pagesize": min(max_articles, 50),
        "language": "en",
        "apikey": NEWSDATA_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        articles: list[Article] = []
        for item in data.get("results", []):
            title = item.get("title", "") or ""
            if not title.strip():
                continue
            source = item.get("source_id", "") or "NewsData"
            published_at = item.get("pubDate", "") or ""
            link = item.get("link", "") or ""
            if not link:
                continue
            snippet = item.get("description", "") or ""
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
        return articles
    except Exception as e:
        print(f"❌ NewsData.io 错误: {e}")
        return []


# ==================== Reddit ====================
async def fetch_from_reddit(query: str, max_articles: int) -> list[Article]:
    """从 Reddit 获取文章（无需认证，使用公开 JSON endpoint）"""
    if not ENABLE_REDDIT:
        return []

    try:
        # Reddit 支持在 URL 后加 .json 获取公开数据，无需认证
        # 使用 old.reddit.com 的 search.json 端点
        url = "https://old.reddit.com/r/news/search.json"
        params = {
            "q": query,
            "limit": min(max_articles, 100),
            "sort": "new",
        }
        headers = {"User-Agent": "NewsMosaic/1.0"}

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params, headers=headers)
            r.raise_for_status()
            data = r.json()

        articles: list[Article] = []
        for item in data.get("data", {}).get("children", []):
            post = item.get("data", {})
            title = post.get("title", "") or ""
            if not title.strip():
                continue
            # Reddit 帖子的发布时间
            published_at = datetime.fromtimestamp(
                post.get("created_utc", 0)
            ).isoformat()
            link = f"https://reddit.com{post.get('permalink', '')}"
            snippet = post.get("selftext", "")[:500] or ""
            source = f"r/{post.get('subreddit', 'reddit')}"

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
        return articles
    except Exception as e:
        print(f"❌ Reddit 错误: {e}")
        return []


# ==================== HackerNews ====================
async def fetch_from_hackernews(query: str, max_articles: int) -> list[Article]:
    """从 HackerNews (Algolia) 获取文章"""
    if not ENABLE_HACKERNEWS:
        return []

    url = "https://hn.algolia.com/api/v1/search"
    params = {
        "query": query,
        "hitsPerPage": min(max_articles, 100),
        "numericFilters": "created_at_i>0",  # 最近的文章
    }

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.get(url, params=params)
            r.raise_for_status()
            data = r.json()

        articles: list[Article] = []
        for hit in data.get("hits", []):
            # 只获取有标题和 URL 的文章
            if hit.get("story_title"):
                title = hit.get("story_title", "")
            elif hit.get("title"):
                title = hit.get("title", "")
            else:
                continue

            if not title.strip():
                continue

            url = hit.get("story_url") or hit.get("url") or ""
            if not url:
                url = f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}"

            published_at = hit.get("created_at", "") or ""
            snippet = hit.get("story_text", "") or ""

            articles.append(
                Article(
                    id=_make_id(title, "HackerNews", published_at),
                    title=title,
                    snippet=snippet[:500] if snippet else "",
                    source="HackerNews",
                    published_at=published_at,
                    url=url,
                )
            )
        return articles
    except Exception as e:
        print(f"❌ HackerNews 错误: {e}")
        return []


# ==================== 主函数 - 聚合所有来源 ====================
async def fetch_news(query: str, days: int, max_articles: int) -> list[Article]:
    """从多个来源聚合新闻"""
    
    # ✅ 如果没有真实 API keys，使用示例数据
    if not (ENABLE_NEWS_API or ENABLE_GUARDIAN or ENABLE_NEWSDATA or ENABLE_REDDIT or ENABLE_HACKERNEWS):
        print("⚠️  未配置任何新闻来源，使用示例数据")
        return SAMPLE_ARTICLES[:max_articles]

    print(f"🔍 搜索查询: {query}")
    print(f"📡 启用的来源: NewsAPI={ENABLE_NEWS_API}, Guardian={ENABLE_GUARDIAN}, "
          f"NewsData={ENABLE_NEWSDATA}, Reddit={ENABLE_REDDIT}, HackerNews={ENABLE_HACKERNEWS}")

    # 并发获取所有来源的数据
    tasks = []
    
    if ENABLE_NEWS_API and _has_real_newsapi_key():
        tasks.append(fetch_from_newsapi(query, max_articles))
    if ENABLE_GUARDIAN:
        tasks.append(fetch_from_guardian(query, max_articles))
    if ENABLE_NEWSDATA:
        tasks.append(fetch_from_newsdata(query, max_articles))
    if ENABLE_REDDIT:
        tasks.append(fetch_from_reddit(query, max_articles))
    if ENABLE_HACKERNEWS:
        tasks.append(fetch_from_hackernews(query, max_articles))

    # 并发执行所有请求
    import asyncio
    results = await asyncio.gather(*tasks)

    # 合并所有结果
    all_articles: list[Article] = []
    for articles in results:
        all_articles.extend(articles)

    # 去重（按 title）
    seen = set()
    deduped = []
    for art in all_articles:
        key = art.title.strip().lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(art)

    # 按发布时间排序（最新的在前）
    deduped.sort(
        key=lambda x: x.published_at if x.published_at else "",
        reverse=True
    )

    result = deduped[:max_articles]
    print(f"✅ 共获取 {len(result)} 篇文章从 {len([r for r in results if r])} 个来源")
    
    return result
