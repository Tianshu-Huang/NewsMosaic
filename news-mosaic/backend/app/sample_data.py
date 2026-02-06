from .models import Article

SAMPLE_ARTICLES = [
    Article(
        id="a1",
        title="OpenAI releases new model update focused on reasoning and safety",
        snippet="The update improves reliability and introduces new tooling for developers.",
        source="TechWire",
        published_at="2026-02-06T12:00:00Z",
        url="https://example.com/openai-update",
    ),
    Article(
        id="a2",
        title="Researchers debate the environmental cost of scaling AI training",
        snippet="New estimates suggest energy use varies widely depending on hardware and datacenter mix.",
        source="Science Daily",
        published_at="2026-02-06T10:30:00Z",
        url="https://example.com/ai-energy",
    ),
    Article(
        id="a3",
        title="Major cloud providers roll out new AI security features",
        snippet="The features include better audit logs, policy controls, and incident response integrations.",
        source="CloudNews",
        published_at="2026-02-06T09:10:00Z",
        url="https://example.com/cloud-security",
    ),
    Article(
        id="a4",
        title="Startup ecosystem shifts as investors look for efficient growth",
        snippet="Founders respond by prioritizing profitability and tighter operating models.",
        source="MarketWatchers",
        published_at="2026-02-05T22:00:00Z",
        url="https://example.com/startups",
    ),
    Article(
        id="a5",
        title="Public sector explores AI guidelines for transparency",
        snippet="Draft policies emphasize documentation, evaluations, and disclosure requirements.",
        source="PolicyBrief",
        published_at="2026-02-05T18:15:00Z",
        url="https://example.com/ai-policy",
    ),
]
