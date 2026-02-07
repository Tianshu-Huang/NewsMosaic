from typing import List
from .models import Article, Tile, ClusterSummary
from .settings import GEMINI_API_KEY
import google.generativeai as genai
import json
from .emotion import emotion_scores, intensity_level


def _has_real_gemini_key() -> bool:
    # 避免占位符 "xxxx" 触发请求
    if not GEMINI_API_KEY:
        return False
    k = GEMINI_API_KEY.strip()
    if k.lower() in {"xxxx", "your_key_here", "replace_me"}:
        return False
    return True

def fallback_tile(article: Article) -> Tile:
    # 简单用规则：所有 tile 都当 FACT，takeaway 用标题
    text = f"{article.title}. {article.snippet or ''}"
    emo = emotion_scores(text)
    lvl = intensity_level(emo["intensity"])

    return Tile(
        article=article,
        tile_type="FACT",
        topic_tags=[],
        one_line_takeaway=(article.snippet or article.title)[:140],
        confidence=0.4,
        valence=emo["valence"],
        intensity=emo["intensity"],
        intensity_level=lvl,
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
    # ✅ 无 key 直接 fallback，不会调用 Gemini
    if not _has_real_gemini_key():
        return [fallback_tile(a) for a in articles]

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash")

    tiles: List[Tile] = []
    for a in articles:
        payload = {
            "title": a.title,
            "snippet": a.snippet,
            "source": a.source,
            "published_at": a.published_at,
        }
        prompt = f"""You label news fragments for a mosaic board. Output strict JSON only.

{json.dumps(payload)}

Respond with JSON containing: type (FACT/ANALYSIS/OPINION/UNVERIFIED), topic_tags (list), one_line_takeaway (string), confidence (0-1 float)."""
        
        try:
            resp = model.generate_content(prompt)
            text = resp.text.strip()
            # Extract JSON from response (may be wrapped in markdown code blocks)
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            
            emo = emotion_scores(f"{a.title}. {a.snippet or ''}")
            lvl = intensity_level(emo["intensity"])

            
            data = json.loads(text)
            tiles.append(
                Tile(
                    article=a,
                    tile_type=data.get("type", "FACT"),
                    topic_tags=data.get("topic_tags", []),
                    one_line_takeaway=data.get("one_line_takeaway", "") or a.title[:120],
                    confidence=float(data.get("confidence", 0.5)),
                    valence=emo["valence"],
                    intensity=emo["intensity"],
                    intensity_level=lvl,
                )
            )
        except Exception:
            tiles.append(fallback_tile(a))

    return tiles

async def summarize_cluster(articles: List[Article]) -> ClusterSummary:
    # ✅ 无 key 直接 fallback，不会调用 Gemini
    if not _has_real_gemini_key():
        return fallback_cluster_summary(articles)

    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel("gemini-2.0-flash")

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

    prompt = f"""Summarize a news cluster as a mosaic story. Output strict JSON only.

{json.dumps(payload)}

Respond with JSON containing: cluster_title (string), whole_story (object with what_happened, why_it_matters list, what_to_watch list), timeline (list of objects with time and event)."""

    try:
        resp = model.generate_content(prompt)
        text = resp.text.strip()
        # Extract JSON from response (may be wrapped in markdown code blocks)
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        data = json.loads(text)
        return ClusterSummary(
            cluster_title=data["cluster_title"],
            what_happened=data["whole_story"]["what_happened"],
            why_it_matters=data["whole_story"]["why_it_matters"],
            what_to_watch=data["whole_story"]["what_to_watch"],
            timeline=data["timeline"],
        )
    except Exception:
        return fallback_cluster_summary(articles)
