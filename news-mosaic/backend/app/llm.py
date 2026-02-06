from typing import List
from .models import Article, Tile, ClusterSummary
from .settings import OPENAI_API_KEY

def fallback_tile(article: Article) -> Tile:
    # 最简 fallback：都当 FACT
    return Tile(article=article, tile_type="FACT", topic_tags=[], one_line_takeaway=article.title[:120], confidence=0.4)

def fallback_cluster_summary(articles: List[Article]) -> ClusterSummary:
    top = articles[0].title if articles else "Event cluster"
    timeline = []
    for a in articles[:3]:
        timeline.append({"time": a.published_at, "event": a.title[:120]})
    return ClusterSummary(
        cluster_title=top[:80],
        what_happened=top[:200],
        why_it_matters=["A quick MVP summary (LLM disabled)."],
        what_to_watch=["Enable OPENAI_API_KEY for better synthesis."],
        timeline=timeline
    )

async def classify_tiles(articles: List[Article]) -> List[Tile]:
    if not OPENAI_API_KEY:
        return [fallback_tile(a) for a in articles]

    # ✅ Hackathon 建议：先做“批量”分类以省 token（这里写单条示例，方便你们改批量）
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    tiles: List[Tile] = []
    for a in articles:
        prompt = {
            "title": a.title,
            "snippet": a.snippet,
            "source": a.source,
            "published_at": a.published_at
        }
        resp = await client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {"role":"system","content":"You label news fragments for a mosaic board. Output strict JSON only."},
                {"role":"user","content":str(prompt)}
            ],
        )
        text = resp.output_text.strip()
        # 简化：直接 eval 风险大；建议 json.loads + try/except
        import json
        try:
            data = json.loads(text)
            tiles.append(Tile(
                article=a,
                tile_type=data.get("type","FACT"),
                topic_tags=data.get("topic_tags",[]),
                one_line_takeaway=data.get("one_line_takeaway","") or a.title[:120],
                confidence=float(data.get("confidence",0.5))
            ))
        except Exception:
            tiles.append(fallback_tile(a))
    return tiles

async def summarize_cluster(articles: List[Article]) -> ClusterSummary:
    if not OPENAI_API_KEY:
        return fallback_cluster_summary(articles)

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=OPENAI_API_KEY)

    payload = {
        "items": [{"title":a.title,"snippet":a.snippet,"source":a.source,"published_at":a.published_at} for a in articles[:25]]
    }

    resp = await client.responses.create(
        model="gpt-4.1-mini",
        input=[
            {"role":"system","content":"Summarize a news cluster as a mosaic story. Output strict JSON only."},
            {"role":"user","content":str(payload)}
        ],
    )
    import json
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
