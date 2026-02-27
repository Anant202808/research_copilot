"""AI-powered draft generation — Smart quota usage.

Strategy
────────
- summarize_paper()             → always extractive (zero AI quota on upload)
- extract_keywords()            → always extractive (zero AI quota on upload)
- generate_draft_with_citations() → Cerebras first, Groq as fallback

Provider priority for drafts:
  1. Cerebras — primary (highest free quota, same OpenAI-compatible API)
  2. Groq     — secondary fallback only if Cerebras fails/quota hit

No Gemini, no OpenAI — keep it simple and reliable.
"""

import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Cache ──────────────────────────────────────────────────────────────────────
_cache: Dict[str, Dict[str, Any]] = {}

CEREBRAS_MAX_TEXT_LENGTH = 50_000   # model supports 65k context; leave headroom for system prompt
GROQ_MAX_TEXT_LENGTH     = 20_000
COOLDOWN_SECONDS         = 60       # respects 30 req/min window

# ── Per-paper token budget ─────────────────────────────────────────────────────
# Cerebras: 65,536 context. Reserve ~8k for system prompt + citations block.
# Remaining ~57k split across papers so we never exceed context on multi-paper drafts.
# Formula: floor(57_000 / max(paper_count, 1)), capped at 12_000 per paper.
_CEREBRAS_CONTEXT_BUDGET  = 57_000
_MAX_CHARS_PER_PAPER      = 12_000   # hard ceiling per paper regardless of count

# ── Rate limiter (GUARD 1) ─────────────────────────────────────────────────────
# Cerebras free tier: 30 requests/minute = 1 request every 2 seconds.
# We enforce a minimum 2.1s gap between consecutive Cerebras calls so that
# retries on citation failures never burn through the 30 req/min cap.
_CEREBRAS_MIN_INTERVAL = 2.1        # seconds between calls (~28/min — safe margin)
_cerebras_last_call    = 0.0
_cerebras_rate_lock    = threading.Lock()


def _cerebras_rate_limit() -> None:
    """Block until it is safe to make the next Cerebras API call."""
    global _cerebras_last_call
    with _cerebras_rate_lock:
        elapsed = time.monotonic() - _cerebras_last_call
        wait    = _CEREBRAS_MIN_INTERVAL - elapsed
        if wait > 0:
            logger.debug("Rate limiter: sleeping %.2fs before Cerebras call.", wait)
            time.sleep(wait)
        _cerebras_last_call = time.monotonic()


# ── Draft provider order ───────────────────────────────────────────────────────
_DRAFT_PROVIDERS = ["cerebras", "groq"]

# ── Cooldown tracker ───────────────────────────────────────────────────────────
_cooldown_lock  = threading.Lock()
_cooldown_until: Dict[str, float] = {}


def _is_on_cooldown(provider: str) -> bool:
    with _cooldown_lock:
        return time.monotonic() < _cooldown_until.get(provider, 0)


def _set_cooldown(provider: str) -> None:
    resume = time.monotonic() + COOLDOWN_SECONDS
    with _cooldown_lock:
        _cooldown_until[provider] = resume
    logger.warning("Provider '%s' hit quota — cooling down for %ds.", provider, COOLDOWN_SECONDS)


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(t in msg for t in ("429", "resource_exhausted", "quota", "rate limit", "rate_limit"))


def _is_payload_too_large(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "413" in msg or "payload too large" in msg or "request too large" in msg


# ── Shared utilities ───────────────────────────────────────────────────────────

def _split_sentences(text: str) -> List[str]:
    raw = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in raw if len(s.strip()) > 10]


def _validate_summary(data: dict) -> Dict[str, Any]:
    return {
        "overview":    str(data.get("overview", "")),
        "findings":    [str(f) for f in data.get("findings", [])],
        "methodology": str(data.get("methodology", "")),
        "limitations": [str(l) for l in data.get("limitations", [])],
    }


# ── Clients ────────────────────────────────────────────────────────────────────

def _get_cerebras_client():
    api_key = os.getenv("CEREBRAS_API_KEY", "")
    if not api_key:
        logger.warning("CEREBRAS_API_KEY not set in .env")
        return None
    try:
        import httpx
        from openai import OpenAI
        return OpenAI(
            api_key     = api_key,
            base_url    = "https://api.cerebras.ai/v1",
            http_client = httpx.Client(),
            max_retries = 0,
            timeout     = 30.0,
        )
    except ImportError:
        logger.warning("openai package not installed. Run: pip install openai")
        return None
    except Exception as e:
        logger.error("Failed to initialise Cerebras client: %s", e)
        return None


def _get_groq_client():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        logger.warning("GROQ_API_KEY not set in .env")
        return None
    try:
        import httpx
        from openai import OpenAI
        return OpenAI(
            api_key     = api_key,
            base_url    = "https://api.groq.com/openai/v1",
            http_client = httpx.Client(),
            max_retries = 0,
            timeout     = 20.0,
        )
    except ImportError:
        logger.warning("openai package not installed. Run: pip install openai")
        return None
    except Exception as e:
        logger.error("Failed to initialise Groq client: %s", e)
        return None


# ── Synthesis block ────────────────────────────────────────────────────────────

_SYNTHESIS_BLOCK = """- Compare and contrast the methodology and findings across all papers
- Highlight where the papers agree, where they diverge, and why that matters
- Identify what each paper contributes that the others do not
- Do NOT summarise each paper in isolation — synthesise them together"""


# ── Draft prompt ───────────────────────────────────────────────────────────────

_DRAFT_PROMPT = """You are an academic research writing assistant.

Write a complete literature review using EXACTLY these four markdown section headings in this order:

## Introduction
## Literature Review
## Research Gaps
## Future Work

STRICT STRUCTURE RULES:
- Every section MUST begin with its ## heading exactly as shown above
- Write a minimum of 2 full paragraphs per section
- Do NOT add a References or Bibliography section at the end
- Do NOT skip any of the four sections

CITATION RULES — follow exactly:
- ONLY use citations from the Available Citations list below
- Cite inline as (Author, Year) — example: (Goodfellow et al., 2014)
- NEVER invent authors or years not present in the Available Citations list
- NEVER use internal system IDs like Paper-xxxxx
- If a claim cannot be supported by the available citations, write:
  "This area requires further investigation."
  Do NOT fabricate a citation to fill the gap.

SYNTHESIS REQUIREMENTS:
{synthesis_block}

Paper Summaries:
{summaries}

Available Citations (use ONLY these):
{citations}
"""


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# summarize_paper — EXTRACTIVE ONLY, zero AI quota used on upload
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def summarize_paper(text: str) -> Dict[str, Any]:
    """
    Pure extractive summarization — no AI calls.
    All quota is saved for draft generation where AI quality matters.
    """
    cache_key = str(hash(text[:5000]))
    if cache_key in _cache:
        logger.info("summarize_paper: returning cached result.")
        return _cache[cache_key]

    result = _summarize_extractive(text)
    _cache[cache_key] = result
    logger.info("summarize_paper: extractive complete.")
    return result


def _summarize_extractive(text: str) -> Dict[str, Any]:
    return {
        "overview":    _extract_overview(text),
        "findings":    _extract_findings(text),
        "methodology": _extract_methodology(text),
        "limitations": _extract_limitations(text),
    }


def _extract_overview(text: str) -> str:
    abstract_match = re.search(
        r"abstract[:\s]*\n?(.*?)(?:\n\s*(?:1\.?\s*introduction|keywords|index terms))",
        text[:5000], re.IGNORECASE | re.DOTALL,
    )
    if abstract_match:
        abstract = re.sub(r"\s+", " ", abstract_match.group(1).strip())
        if len(abstract) > 100:
            return abstract[:800]

    sentences = _split_sentences(text)
    if not sentences:
        return "Could not generate a summary — the paper text appears empty."
    candidates = [s for s in sentences[:30] if len(s) > 50][:4]
    return " ".join(candidates) if candidates else sentences[0]


def _extract_findings(text: str) -> List[str]:
    sentences = _split_sentences(text)
    kw = re.compile(
        r"\b(result|finding|show|demonstrate|achieve|outperform|improve|"
        r"significant|accuracy|performance|state.of.the.art|surpass)\b",
        re.IGNORECASE,
    )
    found = [s for s in sentences if kw.search(s) and 30 < len(s) < 300][:5]
    if not found:
        mid = len(sentences) // 3
        found = sentences[mid: mid + 3]
    return found


def _extract_methodology(text: str) -> str:
    sentences = _split_sentences(text)
    kw = re.compile(
        r"\b(method|approach|propose|architecture|model|train|dataset|"
        r"experiment|framework|algorithm|network|layer)\b",
        re.IGNORECASE,
    )
    sents = [s for s in sentences if kw.search(s) and 30 < len(s) < 300][:3]
    return " ".join(sents) if sents else "Methodology details not extracted."


def _extract_limitations(text: str) -> List[str]:
    sentences = _split_sentences(text)
    kw = re.compile(
        r"\b(limit|drawback|shortcoming|challenge|future work|weakness|"
        r"caveat|constraint|however|although|despite)\b",
        re.IGNORECASE,
    )
    found = [s for s in sentences if kw.search(s) and 20 < len(s) < 300][:4]
    return found if found else ["Limitations not explicitly identified in the extracted text."]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# extract_keywords — EXTRACTIVE ONLY, zero AI quota used
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def extract_keywords(text: str) -> List[str]:
    """Pure extractive — no AI calls."""
    return _keywords_extractive(text)


def _keywords_extractive(text: str) -> List[str]:
    m = re.search(
        r"(?:keywords?|key\s+words?|index\s+terms?)[:\s]*([^\n]+)",
        text[:5000], re.IGNORECASE,
    )
    if m:
        kws = [k.strip().strip(".,;—") for k in re.split(r"[;,•·|]", m.group(1)) if k.strip()]
        kws = [k for k in kws if 2 < len(k) < 50]
        if len(kws) >= 2:
            return kws[:10]

    stop = {
        "the","a","an","and","or","but","in","on","at","to","for","of","with",
        "by","from","is","are","was","were","be","been","being","have","has",
        "had","do","does","did","will","would","could","should","may","might",
        "shall","can","this","that","these","those","it","its","we","our",
        "they","their","he","she","which","who","whom","where","when","how",
        "what","if","not","no","nor","as","than","also","more","most","such",
        "each","every","all","both","few","many","some","any","other","into",
        "through","during","before","after","above","below","between","under",
        "over","about","then","so","very","just","because","while","however",
        "therefore","thus","hence","et","al","fig","figure","table","section",
        "paper","study","using","used","use","based","approach","proposed",
        "show","shows","shown","result","results","method","methods",
    }
    words = re.findall(r"\b[a-zA-Z]{4,}\b", text.lower())
    freq: Dict[str, int] = {}
    for w in words:
        if w not in stop:
            freq[w] = freq.get(w, 0) + 1
    return [w for w, _ in sorted(freq.items(), key=lambda x: x[1], reverse=True)[:8]]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# generate_draft_with_citations — AI HERE ONLY (Cerebras → Groq)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _strip_paper_ids(text: str) -> str:
    """Remove lines containing Paper-xxxxx IDs from instructions."""
    if not text:
        return text
    return "\n".join(
        l for l in text.split("\n")
        if not re.search(r"Paper-[a-f0-9]{6,}", l)
    )


def _clean_draft_output(text: str) -> str:
    """Remove any leaked Paper-IDs from AI output."""
    text = re.sub(r"\(Paper-[a-f0-9]{6,}\)", "(Author, Year)", text)
    text = re.sub(r"Paper-[a-f0-9]{6,}", "", text)
    return text.strip()


def _build_summary_block(summaries: List[Dict[str, Any]]) -> str:
    """
    GUARD 2 — Per-paper token budget.

    Cerebras has a 65,536 token context window. With system prompt +
    citations block taking ~8k, we have ~57k left for paper summaries.
    We divide that budget equally across all papers, capping each at
    _MAX_CHARS_PER_PAPER characters to prevent any single paper from
    dominating and pushing the total over the context limit.

    Example: 5 papers → 57,000 / 5 = 11,400 chars each (under 12k cap).
             2 papers → 57,000 / 2 = 28,500 → capped at 12,000 each.
    """
    paper_count  = max(len(summaries), 1)
    budget_each  = min(
        _CEREBRAS_CONTEXT_BUDGET // paper_count,
        _MAX_CHARS_PER_PAPER,
    )
    logger.info(
        "Summary block: %d paper(s), %d chars/paper budget.",
        paper_count, budget_each,
    )

    blocks = []
    for i, s in enumerate(summaries):
        overview   = s.get("overview",    "")[:budget_each // 2]
        findings   = "; ".join(s.get("findings",   []))[:budget_each // 4]
        methodology= s.get("methodology", "")[:budget_each // 4]
        blocks.append(
            f"Paper {i+1}:\n"
            f"  Overview: {overview}\n"
            f"  Key findings: {findings}\n"
            f"  Methodology: {methodology}"
        )

    return "\n\n".join(blocks)


def generate_draft_with_citations(
    summaries: List[Dict[str, Any]],
    citations: List[str],
    section: str = "literature review",
    citation_instruction: Optional[str] = None,
    synthesis_instruction: Optional[str] = None,
) -> str:
    """
    Generate a literature review using AI.
    Cerebras is tried first (higher quota), Groq is the fallback.
    This is the ONLY function in this module that uses AI.
    """
    # GUARD 2: build token-budgeted summary block
    text_block = _build_summary_block(summaries)

    citations_block  = "\n".join(citations)[:4000]
    synthesis_block  = _strip_paper_ids(synthesis_instruction or "").strip() or _SYNTHESIS_BLOCK

    prompt = _DRAFT_PROMPT.format(
        summaries       = text_block,
        citations       = citations_block,
        synthesis_block = synthesis_block,
    )

    if citation_instruction:
        safe_ci = _strip_paper_ids(citation_instruction).strip()
        if safe_ci:
            prompt += f"\n\nADDITIONAL CITATION CONSTRAINTS:\n{safe_ci}"

    for provider in _DRAFT_PROVIDERS:
        if _is_on_cooldown(provider):
            logger.info("generate_draft: '%s' on cooldown — skipping.", provider)
            continue

        logger.info("generate_draft: trying provider '%s'", provider)

        result = (
            _draft_with_cerebras(prompt)
            if provider == "cerebras"
            else _draft_with_groq(prompt)
        )

        if result:
            return _clean_draft_output(result)

    logger.error("generate_draft: all providers failed.")
    return (
        "Draft generation temporarily unavailable. "
        "Please wait 60 seconds and try again. "
        "If this persists, check CEREBRAS_API_KEY and GROQ_API_KEY in your .env file."
    )


def _draft_with_cerebras(prompt: str) -> Optional[str]:
    if _is_on_cooldown("cerebras"):
        return None
    try:
        client = _get_cerebras_client()
        if not client:
            return None

        # GUARD 1: enforce minimum interval between Cerebras calls
        _cerebras_rate_limit()

        logger.info("Sending draft request to Cerebras...")
        response = client.chat.completions.create(
            model    = "gpt-oss-120b",
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an academic research writing assistant. "
                        "Always structure output with ## markdown headings. "
                        "Always cite as (Author, Year). "
                        "NEVER use internal IDs like Paper-xxxxx. "
                        "NEVER invent citations not provided to you."
                    ),
                },
                {"role": "user", "content": prompt[:CEREBRAS_MAX_TEXT_LENGTH]},
            ],
            temperature = 0.4,
            max_tokens  = 2500,
        )
        text = (response.choices[0].message.content or "").strip()
        logger.info("Cerebras draft generation successful.")
        return text or None
    except Exception as e:
        if _is_payload_too_large(e):
            logger.warning("Cerebras 413 — payload too large.")
        elif _is_quota_error(e):
            _set_cooldown("cerebras")
        else:
            logger.warning("Cerebras draft generation failed: %s", e)
        return None


def _draft_with_groq(prompt: str) -> Optional[str]:
    if _is_on_cooldown("groq"):
        return None
    try:
        client = _get_groq_client()
        if not client:
            return None
        logger.info("Sending draft request to Groq (fallback)...")
        response = client.chat.completions.create(
            model    = "llama-3.3-70b-versatile",
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an academic research writing assistant. "
                        "Always structure output with ## markdown headings. "
                        "Always cite as (Author, Year). "
                        "NEVER use internal IDs like Paper-xxxxx. "
                        "NEVER invent citations not provided to you."
                    ),
                },
                {"role": "user", "content": prompt[:GROQ_MAX_TEXT_LENGTH]},
            ],
            temperature = 0.4,
            max_tokens  = 2500,
        )
        text = (response.choices[0].message.content or "").strip()
        logger.info("Groq draft generation successful.")
        return text or None
    except Exception as e:
        if _is_payload_too_large(e):
            logger.warning("Groq 413 — payload too large.")
        elif _is_quota_error(e):
            _set_cooldown("groq")
        else:
            logger.warning("Groq draft generation failed: %s", e)
        return None