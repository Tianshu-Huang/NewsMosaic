from typing import List
import math
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.cluster import KMeans
from .models import Article

def choose_k(n: int) -> int:
    return min(8, max(3, round(n / 10)))

def cluster_articles(articles: List[Article]) -> dict[str, List[Article]]:
    texts = [(a.title + " " + (a.snippet or "")) for a in articles]
    vec = TfidfVectorizer(stop_words="english", max_features=5000)
    X = vec.fit_transform(texts)

    k = choose_k(len(articles))
    km = KMeans(n_clusters=k, n_init="auto", random_state=42)
    labels = km.fit_predict(X)

    clusters: dict[str, List[Article]] = {}
    for art, lab in zip(articles, labels):
        cid = f"c{lab}"
        clusters.setdefault(cid, []).append(art)

    # 每簇按时间倒序（字符串ISO一般可直接比；更严谨可 parse）
    for cid in clusters:
        clusters[cid].sort(key=lambda a: a.published_at or "", reverse=True)

    return clusters
