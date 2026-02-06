from typing import List
from .models import Article, Tile, ClusterSummary
from .settings import OPENAI_API_KEY

def _has_real_openai_key() -> bool:
    # 避免占位符 "xxxx" 触发请求
    if not OPENAI_API_KEY:
        return False
    k = OPENAI_API_KEY.strip()
    if k.lower() in {"xxxx", "your_key_here", "replace_me"}:
        return False
    # OpenAI key 通常以 "sk-" 开头（不是严格校验，但足够防误用）
    if not k.startswith("sk-"):
        return False
    return True

def fallback_tile(article: Article) -> Tile:
    # 简单用规则：所有 tile 都当 FACT，takeaway 用标题
    return Tile(
        article=article,
        tile_type="FACT",
        topic_tags=[],
        one_line_takeaway=(article.snippet or article.title)[:140],
        confidence=0.4,
    )

def fallback_cluster_summary(articles: List[Article]) -> ClusterSummary:
    # 纯规则 summary：取最新一条标题当 cluster title，timeline 取前3条
    title = articles[0].title if articles else "Event cluster"
    timeline = [{"time": a.published_at, "event": a.title[:120]} for a in articles[:3]]
    return ClusterSummary(
        cluster_title=title[:80],
        what_happened=(articles[0].snippet or articles[0].title)[:240] if articles else "No items.",
        why_it_matters=[
            "This is a mock summary (LLM disabled).",
            "Add OPENAI_API_KEY to enable richer synthesis.",
        ],
        what_to_watch=[
            "Enable OpenAI for stance/type labeling and better timeline extraction."
        ],
        timeline=timeline,
    )

async def classify_tiles(articles: List[Article]) -> List[Tile]:
    # ✅ 无 key 直接 fallback，不会调用 OpenAI
    if not _has_real_openai_key():
        return [fallback_tile(a) for a in articles]

    # 有真实 key 才调用 OpenAI
    from openai import AsyncOpenAI
    import json

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    tiles: List[Tile] = []
    for a in articles:
        payload = {
            "title": a.title,
            "snippet": a.snippet,
            "source": a.source,
            "published_at": a.published_at,
        }
        resp = await client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {"role": "system", "content": "You label news fragments for a mosaic board. Output strict JSON only."},
                {"role": "user", "content": json.dumps(payload)},
            ],
        )
        text = resp.output_text.strip()
        try:
            data = json.loads(text)
            tiles.append(
                Tile(
                    article=a,
                    tile_type=data.get("type", "FACT"),
                    topic_tags=data.get("topic_tags", []),
                    one_line_takeaway=data.get("one_line_takeaway", "") or a.title[:120],
                    confidence=float(data.get("confidence", 0.5)),
                )
            )
        except Exception:
            tiles.append(fallback_tile(a))

    return tiles

async def summarize_cluster(articles: List[Article]) -> ClusterSummary:
    # ✅ 无 key 直接 fallback，不会调用 OpenAI
    if not _has_real_openai_key():
        return fallback_cluster_summary(articles)

    from openai import AsyncOpenAI
    import json

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    payload = {
        "items": [
            {
                "title": a.title,
                "snippet": a.snippet,
                "source": a.source,
                "published_at": a.published_at,
            }
            for a in articles[:25]
        ]
    }

    resp = await client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {"role": "system", "content": "Summarize a news cluster as a mosaic story. Output strict JSON only."},
            {"role": "user", "content": json.dumps(payload)},
        ],
    )

    try:
        data = json.loads(resp.output_text.strip())
        return ClusterSummary(
            cluster_title=data["cluster_title"],
            what_happened=data["whole_story"]["what_happened"],
            why_it_matters=data["whole_story"]["why_it_matters"],
            what_to_watch=data["whole_story"]["what_to_watch"],
            timeline=data["timeline"],
        )
    except Exception:
        return fallback_cluster_summary(articles)
