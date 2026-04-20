"""
Singleton sentiment analysis engine.
Primary:  lxyuan/distilbert-base-multilingual-cased-sentiments-student (Apache 2.0)
          ~270MB, multilingual (English + Hindi), ~13ms/sentence on CPU
Fallback: VADER (NLTK, MIT) — active during model warm-up or load failure
"""
import threading
import logging
import random

logger = logging.getLogger(__name__)

MODEL_NAME = "lxyuan/distilbert-base-multilingual-cased-sentiments-student"

SUGGESTIONS = {
    "positive": [
        "Customer is satisfied — great time to confirm resolution and close warmly.",
        "Positive tone detected — reinforce the solution and offer a clear summary.",
        "Good rapport — consider upselling or asking for feedback before closing.",
    ],
    "negative": [
        "Customer sounds frustrated — acknowledge the issue and empathise first.",
        "Negative sentiment detected — escalate if unresolved within 2 minutes.",
        "Offer a concrete resolution timeline to de-escalate the situation.",
        "Avoid technical jargon — speak plainly and show you understand the problem.",
    ],
    "neutral": [
        "Neutral tone — stay focused, gather information, and confirm understanding.",
        "Conversation is neutral — progress toward a clear next step.",
        "Ask open-ended questions to understand the customer's underlying need.",
    ],
}


class SentimentEngine:
    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self._pipeline = None   # transformers pipeline (set after background load)
        self._vader = None      # VADER fallback (set immediately)
        self._init_vader()
        # Begin background model load so first real request is fast
        threading.Thread(target=self._load_model, daemon=True).start()

    @classmethod
    def get(cls) -> "SentimentEngine":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _init_vader(self):
        try:
            import nltk
            nltk.download("vader_lexicon", quiet=True)
            from nltk.sentiment.vader import SentimentIntensityAnalyzer
            self._vader = SentimentIntensityAnalyzer()
            logger.info("[Sentiment] VADER fallback ready")
        except Exception as e:
            logger.warning("[Sentiment] VADER init failed: %s", e)

    def _load_model(self):
        try:
            from transformers import pipeline as hf_pipeline
            self._pipeline = hf_pipeline(
                "text-classification",
                model=MODEL_NAME,
                top_k=None,        # return scores for all labels
                truncation=True,
                max_length=512,
            )
            logger.info("[Sentiment] ML model loaded: %s", MODEL_NAME)
        except Exception as e:
            logger.error("[Sentiment] Model load failed — VADER only: %s", e)

    def analyze(self, text: str) -> dict:
        """
        Analyse sentiment of a single text string.

        Returns dict with keys:
          label      — "positive" | "negative" | "neutral"
          score      — float 0.0-1.0 (confidence)
          display    — "HAPPY" | "ANGRY" | "NEUTRAL"
          suggestion — actionable agent hint string
          source     — "ml" | "vader" | "keyword"
        """
        text = text.strip()
        if not text:
            return self._result("neutral", 0.5, "none")
        if self._pipeline is not None:
            return self._ml_analyze(text)
        elif self._vader is not None:
            return self._vader_analyze(text)
        return self._keyword_analyze(text)

    def _ml_analyze(self, text: str) -> dict:
        try:
            results = self._pipeline(text)[0]   # list of {label, score}
            best = max(results, key=lambda x: x["score"])
            label = best["label"].lower()
            return self._result(label, round(best["score"], 4), "ml")
        except Exception as e:
            logger.warning("[Sentiment] ML inference error: %s", e)
            return self._vader_analyze(text)

    def _vader_analyze(self, text: str) -> dict:
        scores = self._vader.polarity_scores(text)
        c = scores["compound"]
        if c >= 0.05:
            label, score = "positive", round((c + 1) / 2, 4)
        elif c <= -0.05:
            label, score = "negative", round((1 - c) / 2, 4)
        else:
            label, score = "neutral", 0.5
        return self._result(label, score, "vader")

    def _keyword_analyze(self, text: str) -> dict:
        _POS = {"great", "thanks", "thank", "good", "excellent", "happy", "resolved", "satisfied"}
        _NEG = {"bad", "terrible", "angry", "frustrated", "problem", "error", "worst", "hate"}
        words = set(text.lower().split())
        pos, neg = len(words & _POS), len(words & _NEG)
        label = "positive" if pos > neg else "negative" if neg > pos else "neutral"
        return self._result(label, 0.6, "keyword")

    def _result(self, label: str, score: float, source: str) -> dict:
        display_map = {"positive": "HAPPY", "negative": "ANGRY", "neutral": "NEUTRAL"}
        return {
            "label":      label,
            "score":      score,
            "display":    display_map.get(label, "NEUTRAL"),
            "suggestion": random.choice(SUGGESTIONS.get(label, SUGGESTIONS["neutral"])),
            "source":     source,
        }

    def score_to_float(self, label: str, score: float) -> float:
        """Convert label + confidence score to a -1.0 to +1.0 float for averaging."""
        if label == "positive":
            return score
        if label == "negative":
            return -score
        return 0.0
