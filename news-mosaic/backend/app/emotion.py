from nltk.sentiment import SentimentIntensityAnalyzer

_sia = SentimentIntensityAnalyzer()

def emotion_scores(text: str) -> dict:
    s = _sia.polarity_scores(text or "")
    valence = float(s["compound"])      # [-1, 1]
    intensity = min(1.0, abs(valence))  # [0, 1]
    return {"valence": valence, "intensity": intensity}

def intensity_level(intensity: float) -> str:
    if intensity < 0.15: return "CALM"
    if intensity < 0.35: return "LOW"
    if intensity < 0.60: return "MEDIUM"
    if intensity < 0.80: return "HIGH"
    return "EXTREME"
