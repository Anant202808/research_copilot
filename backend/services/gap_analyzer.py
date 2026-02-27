"""Research gap analysis — Cerebras first, Groq fallback, extractive safety net.

Strategy
────────
- Gap analysis between papers  → Cerebras → Groq → extractive
- Individual weakness analysis → Cerebras → Groq → extractive
- No Gemini, no OpenAI

Extractive fallback always succeeds — no API needed.
"""

import json
import logging
import os
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Caches ─────────────────────────────────────────────────────────────────────
_gap_cache:      Dict[str, Dict[str, Any]] = {}
_weakness_cache: Dict[str, Dict[str, Any]] = {}

CEREBRAS_MAX_TEXT_LENGTH = 32_000
GROQ_MAX_TEXT_LENGTH     = 20_000
COOLDOWN_SECONDS         = 60          # FIX: increased to respect 30 req/min window

# Minimum Jaccard similarity for two papers to be "related"
RELATEDNESS_THRESHOLD = 0.15

# ── Provider order ─────────────────────────────────────────────────────────────
_PRIORITY_PROVIDERS = ["cerebras", "groq", "extractive"]

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


def _providers_in_order() -> List[str]:
    available = [p for p in _PRIORITY_PROVIDERS if not _is_on_cooldown(p)]
    return available if available else _PRIORITY_PROVIDERS


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(t in msg for t in ("429", "resource_exhausted", "quota", "rate limit", "rate_limit"))


def _is_payload_too_large(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "413" in msg or "payload too large" in msg or "request too large" in msg


# ── Utilities ──────────────────────────────────────────────────────────────────

def _strip_markdown_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"^```\s*",     "", text)
    text = re.sub(r"\s*```$",     "", text)
    return text.strip()


def _robust_json_parse(text: str) -> dict:
    """
    FIX: Cerebras sometimes returns JSON with trailing commas or minor
    formatting errors that cause json.loads() to fail at char 3872+.
    Try progressively more aggressive fixes before giving up.
    """
    text = _strip_markdown_fences(text)

    # Attempt 1: straight parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Attempt 2: remove trailing commas before ] or }
    cleaned = re.sub(r",\s*([}\]])", r"\1", text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Attempt 3: extract the outermost JSON object
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Attempt 4: remove single-line comments (// ...)
    no_comments = re.sub(r"//[^\n]*", "", cleaned)
    try:
        return json.loads(no_comments)
    except json.JSONDecodeError:
        pass

    # All attempts failed — re-raise with original text for logging
    raise json.JSONDecodeError("All JSON parse attempts failed", text, 0)


def _split_sentences(text: str) -> List[str]:
    raw = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in raw if len(s.strip()) > 10]


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
        logger.warning("openai package not installed.")
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
        logger.warning("openai package not installed.")
        return None
    except Exception as e:
        logger.error("Failed to initialise Groq client: %s", e)
        return None


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SMART GROUPING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _get_paper_keyword_set(paper) -> set:
    words = set()
    for k in paper.keywords:
        words.update(k.lower().split())
    for w in paper.title.lower().split():
        if len(w) > 3:
            words.add(w)
    return words


def _relatedness_score(paper_a, paper_b) -> float:
    set_a = _get_paper_keyword_set(paper_a)
    set_b = _get_paper_keyword_set(paper_b)
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def group_papers_by_relatedness(papers) -> Tuple[List[List], List]:
    if len(papers) <= 1:
        return [papers] if papers else [], []

    n        = len(papers)
    assigned = [False] * n
    groups   = []

    for i in range(n):
        if assigned[i]:
            continue
        group = [papers[i]]
        assigned[i] = True
        for j in range(i + 1, n):
            if assigned[j]:
                continue
            for gp in group:
                if _relatedness_score(gp, papers[j]) >= RELATEDNESS_THRESHOLD:
                    group.append(papers[j])
                    assigned[j] = True
                    break
        groups.append(group)

    related_groups    = [g for g in groups if len(g) >= 2]
    unrelated_singles = [g[0] for g in groups if len(g) == 1]

    logger.info(
        "Paper grouping: %d related group(s), %d unrelated single(s).",
        len(related_groups), len(unrelated_singles),
    )
    return related_groups, unrelated_singles


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# INDIVIDUAL PAPER WEAKNESS FINDER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_WEAKNESS_PROMPT = """You are a critical academic reviewer. Analyze this research paper and identify its specific weaknesses.

Focus ONLY on what is missing or weak in THIS paper.

Paper details:
Title: {title}
Authors: {authors}
Year: {year}
Abstract: {abstract}
Full text excerpt: {text}

Produce a JSON object with exactly these keys:
- "missing_experiments": Array of strings
- "unsupported_claims": Array of strings
- "ignored_factors": Array of strings
- "unanswered_questions": Array of strings
- "dataset_weaknesses": Array of strings
- "overall_weakness_summary": string (2-3 sentences)
- "severity": "high" | "medium" | "low"

CRITICAL: Respond ONLY with valid JSON. No trailing commas. No comments. No markdown fences.
"""


def analyze_paper_weaknesses(paper) -> Dict[str, Any]:
    cache_key = f"weakness_{paper.id}"
    if cache_key in _weakness_cache:
        return _weakness_cache[cache_key]

    for provider in _providers_in_order():
        logger.info("analyze_weaknesses: trying '%s' for '%s'.", provider, paper.title)

        if provider == "cerebras":
            result = _weaknesses_with_cerebras(paper)
        elif provider == "groq":
            result = _weaknesses_with_groq(paper)
        elif provider == "extractive":
            result = _weaknesses_extractive(paper)
        else:
            result = None

        if result is not None:
            logger.info("analyze_weaknesses: succeeded with '%s'.", provider)
            _weakness_cache[cache_key] = result
            return result

        logger.warning("analyze_weaknesses: '%s' failed, trying next.", provider)

    fallback = _weaknesses_extractive(paper)
    _weakness_cache[cache_key] = fallback
    return fallback


def _build_weakness_prompt(paper) -> str:
    full_text = ""
    if hasattr(paper, "full_text") and paper.full_text:
        full_text = paper.full_text[:3000]
    elif hasattr(paper, "summary") and paper.summary:
        full_text = paper.summary.overview
    return _WEAKNESS_PROMPT.format(
        title    = paper.title,
        authors  = ", ".join(paper.authors) if paper.authors else "Unknown",
        year     = paper.year,
        abstract = paper.abstract[:800],
        text     = full_text,
    )


def _validate_weakness_result(data: dict) -> Dict[str, Any]:
    severity = data.get("severity", "medium")
    return {
        "missing_experiments":      [str(x) for x in data.get("missing_experiments", [])],
        "unsupported_claims":       [str(x) for x in data.get("unsupported_claims", [])],
        "ignored_factors":          [str(x) for x in data.get("ignored_factors", [])],
        "unanswered_questions":     [str(x) for x in data.get("unanswered_questions", [])],
        "dataset_weaknesses":       [str(x) for x in data.get("dataset_weaknesses", [])],
        "overall_weakness_summary": str(data.get("overall_weakness_summary", "")),
        "severity":                 severity if severity in ("high", "medium", "low") else "medium",
    }


def _weaknesses_with_cerebras(paper) -> Optional[Dict[str, Any]]:
    if _is_on_cooldown("cerebras"):
        return None
    try:
        client = _get_cerebras_client()
        if not client:
            return None
        prompt   = _build_weakness_prompt(paper)
        response = client.chat.completions.create(
            model    = "gpt-oss-120b",
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a critical academic reviewer. "
                        "Respond ONLY with valid JSON. "
                        "No trailing commas. No comments. No markdown fences."
                    ),
                },
                {"role": "user", "content": prompt[:CEREBRAS_MAX_TEXT_LENGTH]},
            ],
            temperature = 0.3,
            max_tokens  = 1024,
        )
        content = response.choices[0].message.content or ""
        # FIX: use robust parser instead of bare json.loads()
        return _validate_weakness_result(_robust_json_parse(content))
    except json.JSONDecodeError as e:
        logger.error("Cerebras weakness JSON parse error: %s", e)
        return None
    except Exception as e:
        if _is_payload_too_large(e):
            logger.warning("Cerebras 413 for weakness analysis.")
        elif _is_quota_error(e):
            _set_cooldown("cerebras")
        else:
            logger.error("Cerebras weakness analysis failed: %s", e)
        return None


def _weaknesses_with_groq(paper) -> Optional[Dict[str, Any]]:
    if _is_on_cooldown("groq"):
        return None
    try:
        client = _get_groq_client()
        if not client:
            return None
        prompt   = _build_weakness_prompt(paper)
        response = client.chat.completions.create(
            model    = "llama-3.3-70b-versatile",   # FIX: updated from decommissioned llama3-70b-versatile
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are a critical academic reviewer. "
                        "Respond ONLY with valid JSON. "
                        "No trailing commas. No comments. No markdown fences."
                    ),
                },
                {"role": "user", "content": prompt[:GROQ_MAX_TEXT_LENGTH]},
            ],
            temperature = 0.3,
            max_tokens  = 1024,
        )
        content = response.choices[0].message.content or ""
        # FIX: use robust parser instead of bare json.loads()
        return _validate_weakness_result(_robust_json_parse(content))
    except json.JSONDecodeError as e:
        logger.error("Groq weakness JSON parse error: %s", e)
        return None
    except Exception as e:
        if _is_payload_too_large(e):
            logger.warning("Groq 413 for weakness analysis.")
        elif _is_quota_error(e):
            _set_cooldown("groq")
        else:
            logger.error("Groq weakness analysis failed: %s", e)
        return None


def _weaknesses_extractive(paper) -> Dict[str, Any]:
    sentences = []
    if hasattr(paper, "full_text") and paper.full_text:
        sentences = _split_sentences(paper.full_text)
    elif hasattr(paper, "summary") and paper.summary and paper.summary.limitations:
        return {
            "missing_experiments":      [],
            "unsupported_claims":       [],
            "ignored_factors":          [],
            "unanswered_questions":     [],
            "dataset_weaknesses":       [],
            "overall_weakness_summary": " ".join(paper.summary.limitations[:2]),
            "severity":                 "medium",
        }

    def _pick(pattern):
        kw = re.compile(pattern, re.IGNORECASE)
        return [s for s in sentences if kw.search(s) and 30 < len(s) < 250][:3]

    return {
        "missing_experiments":      _pick(r"\b(experiment|evaluat|benchmark|test|compar|ablat)\w*\b") or ["No specific missing experiments identified."],
        "unsupported_claims":       _pick(r"\b(claim|assert|argue|suggest|hypothes)\w*\b")           or ["No specific unsupported claims identified."],
        "ignored_factors":          _pick(r"\b(limit|constrain|caveat|drawback|shortcoming)\w*\b")    or ["No specific ignored factors identified."],
        "unanswered_questions":     _pick(r"\b(future work|remain|open question|unexplored)\w*\b")    or ["No specific unanswered questions identified."],
        "dataset_weaknesses":       _pick(r"\b(dataset|sample size|corpus|annotati|label)\w*\b")      or ["No specific dataset weaknesses identified."],
        "overall_weakness_summary": (
            f'"{paper.title}" has identifiable areas that could be strengthened. '
            "Extractive analysis found potential gaps in experimental coverage "
            "and claims that may benefit from additional evidence."
        ),
        "severity": "medium",
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN PUBLIC API — find_research_gaps
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def find_research_gaps(papers) -> Dict[str, Any]:
    if not papers:
        return {"groups": [], "unrelated_papers": [], "individual_weaknesses": {}, "warning": None}

    paper_ids = sorted([p.id for p in papers])
    cache_key = str(hash(tuple(paper_ids)))
    if cache_key in _gap_cache:
        logger.info("find_research_gaps: returning cached result.")
        return _gap_cache[cache_key]

    # Step 1: Group papers by relatedness
    related_groups, unrelated_singles = group_papers_by_relatedness(papers)

    # Step 2: Cross-paper gap analysis per group
    groups_result = []
    for group in related_groups:
        logger.info("Analyzing gap group: %s", [p.title for p in group])
        gap_data = _analyze_group_gaps(group)
        groups_result.append({
            "papers":                  [p.title for p in group],
            "paper_ids":               [p.id for p in group],
            "related":                 True,
            "common_topics":           gap_data.get("common_topics", []),
            "gaps":                    gap_data.get("gaps", []),
            "research_questions":      gap_data.get("research_questions", []),
            "methodology_differences": gap_data.get("methodology_differences", []),
        })

    # Step 3: Individual weakness analysis for every paper
    individual_weaknesses = {}
    for paper in papers:
        logger.info("Individual weakness analysis: %s", paper.title)
        individual_weaknesses[paper.id] = {
            "title":    paper.title,
            "analysis": analyze_paper_weaknesses(paper),
        }

    # Step 4: Warning for unrelated papers
    warning = None
    if unrelated_singles:
        titles  = ", ".join(f'"{p.title}"' for p in unrelated_singles)
        warning = (
            f"The following paper(s) are not closely related to any other uploaded paper "
            f"and were excluded from cross-paper gap analysis: {titles}. "
            f"Their individual weaknesses are still analyzed below."
        )

    result = {
        "groups":                groups_result,
        "unrelated_papers":      [p.title for p in unrelated_singles],
        "individual_weaknesses": individual_weaknesses,
        "warning":               warning,
    }
    _gap_cache[cache_key] = result
    return result


# ── Group gap analysis ─────────────────────────────────────────────────────────

_GAP_PROMPT = """You are an expert research analyst. Analyze these RELATED research papers and identify research gaps between them.

Papers:
{papers_text}

Produce a JSON object with exactly these keys:
- "common_topics": Array of strings — topics shared across multiple papers.
- "gaps": Array of objects, each with:
    - "topic": string
    - "description": string
    - "severity": "high" | "medium" | "low"
    - "evidence": Array of objects with:
        - "paper_id": string
        - "paper_title": string
        - "citation_path": array of strings
        - "missing_links": array of strings
        - "explanation": string
- "research_questions": Array of objects with:
    - "question": string
    - "relevance": string
- "methodology_differences": Array of strings.

CRITICAL: Respond ONLY with valid JSON. No trailing commas. No comments. No markdown fences.
"""


def _build_papers_text(papers) -> str:
    parts = []
    for i, p in enumerate(papers, 1):
        lines = [
            f"--- Paper {i} ---",
            f"ID: {p.id}",
            f"Title: {p.title}",
            f"Authors: {', '.join(p.authors)}",
            f"Year: {p.year}",
            f"Keywords: {', '.join(p.keywords)}",
            f"Abstract: {p.abstract[:500]}",
        ]
        if hasattr(p, "summary") and p.summary:
            lines.append(f"Overview: {p.summary.overview[:500]}")
            lines.append(f"Methodology: {p.summary.methodology[:300]}")
            if p.summary.findings:
                lines.append(f"Findings: {'; '.join(p.summary.findings[:3])}")
            if p.summary.limitations:
                lines.append(f"Limitations: {'; '.join(p.summary.limitations[:3])}")
        if hasattr(p, "full_text") and p.full_text:
            lines.append(f"Full text excerpt: {p.full_text[:800]}")
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


def _analyze_group_gaps(papers) -> Dict[str, Any]:
    for provider in _providers_in_order():
        logger.info("_analyze_group_gaps: trying '%s'", provider)

        if provider == "cerebras":
            result = _gaps_with_cerebras(papers)
        elif provider == "groq":
            result = _gaps_with_groq(papers)
        elif provider == "extractive":
            result = _gaps_extractive(papers)
        else:
            result = None

        if result is not None:
            return result

        logger.warning("_analyze_group_gaps: '%s' failed, trying next.", provider)

    return _gaps_extractive(papers)


def _gaps_with_cerebras(papers) -> Optional[Dict[str, Any]]:
    if _is_on_cooldown("cerebras"):
        return None
    try:
        client = _get_cerebras_client()
        if not client:
            return None
        papers_text = _build_papers_text(papers)[:CEREBRAS_MAX_TEXT_LENGTH]
        prompt      = _GAP_PROMPT.format(papers_text=papers_text)
        logger.info("Sending gap analysis to Cerebras for %d papers...", len(papers))
        response = client.chat.completions.create(
            model    = "gpt-oss-120b",
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an expert research analyst. "
                        "Respond ONLY with valid JSON. "
                        "No trailing commas. No comments. No markdown fences."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature = 0.3,
            max_tokens  = 2048,
        )
        content = response.choices[0].message.content or ""
        # FIX: use robust parser — Cerebras returned malformed JSON at char 3872
        result  = _validate_gap_result(_robust_json_parse(content))
        logger.info("Cerebras gap analysis OK: %d gaps.", len(result.get("gaps", [])))
        return result
    except json.JSONDecodeError as e:
        logger.error("Cerebras gap JSON parse error (all attempts failed): %s", e)
        return None
    except Exception as e:
        if _is_payload_too_large(e):
            logger.warning("Cerebras 413 for gap analysis.")
        elif _is_quota_error(e):
            _set_cooldown("cerebras")
        else:
            logger.error("Cerebras gap analysis failed: %s", e)
        return None


def _gaps_with_groq(papers) -> Optional[Dict[str, Any]]:
    if _is_on_cooldown("groq"):
        return None
    try:
        client = _get_groq_client()
        if not client:
            return None
        papers_text = _build_papers_text(papers)[:GROQ_MAX_TEXT_LENGTH]
        prompt      = _GAP_PROMPT.format(papers_text=papers_text)
        logger.info("Sending gap analysis to Groq for %d papers...", len(papers))
        response = client.chat.completions.create(
            model    = "llama-3.3-70b-versatile",   # FIX: was decommissioned llama3-70b-8192
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an expert research analyst. "
                        "Respond ONLY with valid JSON. "
                        "No trailing commas. No comments. No markdown fences."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature = 0.3,
            max_tokens  = 2048,
        )
        content = response.choices[0].message.content or ""
        # FIX: use robust parser
        result  = _validate_gap_result(_robust_json_parse(content))
        logger.info("Groq gap analysis OK: %d gaps.", len(result.get("gaps", [])))
        return result
    except json.JSONDecodeError as e:
        logger.error("Groq gap JSON parse error (all attempts failed): %s", e)
        return None
    except Exception as e:
        if _is_payload_too_large(e):
            logger.warning("Groq 413 for gap analysis.")
        elif _is_quota_error(e):
            _set_cooldown("groq")
        else:
            logger.error("Groq gap analysis failed: %s", e)
        return None


def _gaps_extractive(papers) -> Dict[str, Any]:
    all_keywords:      Dict[str, int] = {}
    keyword_paper_map: Dict[str, set] = {}

    for p in papers:
        for k in p.keywords:
            k_lower = k.lower().strip()
            if k_lower:
                all_keywords[k_lower] = all_keywords.get(k_lower, 0) + 1
                keyword_paper_map.setdefault(k_lower, set()).add(p.id)

    common_topics = [k for k, c in sorted(all_keywords.items(), key=lambda x: -x[1]) if c >= 2]
    unique_topics = [k for k, c in all_keywords.items() if c == 1]
    top_keywords  = [k for k, _ in sorted(all_keywords.items(), key=lambda x: -x[1])][:10]

    gaps = []
    for i in range(len(top_keywords)):
        if len(gaps) >= 3:
            break
        for j in range(i + 1, len(top_keywords)):
            if len(gaps) >= 3:
                break
            kw_a, kw_b = top_keywords[i], top_keywords[j]
            pa = keyword_paper_map.get(kw_a, set())
            pb = keyword_paper_map.get(kw_b, set())
            if not (pa & pb) and pa and pb:
                related = [p for p in papers if p.id in (pa | pb)]
                gaps.append({
                    "topic":       f"{kw_a} ↔ {kw_b} Integration",
                    "description": f'"{kw_a}" and "{kw_b}" appear across papers but never together.',
                    "severity":    "high",
                    "evidence": [{
                        "paper_id":      p.id,
                        "paper_title":   p.title,
                        "citation_path": [p.title, "→", "related work"],
                        "missing_links": [f"{kw_a} and {kw_b} integration"],
                        "explanation":   f'"{p.title}" does not explore the intersection of {kw_a} and {kw_b}.',
                    } for p in related[:3]],
                })

    if unique_topics:
        isolated = [p for p in papers if any(k.lower() in unique_topics for k in p.keywords)]
        gaps.append({
            "topic":       "Isolated Research Threads",
            "description": f"{', '.join(unique_topics[:4])} appear in only one paper — potentially underexplored.",
            "severity":    "low",
            "evidence": [{
                "paper_id":      p.id,
                "paper_title":   p.title,
                "citation_path": [p.title],
                "missing_links": ["broader investigation"],
                "explanation":   f'"{p.title}" introduces unique topics not covered by other papers.',
            } for p in isolated[:2]],
        })

    rqs = []
    if len(common_topics) >= 2:
        rqs.append({
            "question":  f"How do {common_topics[0]} and {common_topics[1]} interact?",
            "relevance": f"Most frequent shared themes across {len(papers)} papers.",
        })
    if unique_topics:
        rqs.append({
            "question":  f'Is "{unique_topics[0]}" an emerging direction worth deeper investigation?',
            "relevance": "Appears in only one paper — potential early signal.",
        })
    rqs.append({
        "question":  "What methodological improvements could strengthen findings across these papers?",
        "relevance": "Cross-paper methodology comparison.",
    })

    methodology_diffs = []
    for p in papers[:3]:
        if hasattr(p, "summary") and p.summary and p.summary.methodology:
            methodology_diffs.append(f"{p.title}: {p.summary.methodology[:150]}")

    return {
        "common_topics":           common_topics,
        "gaps":                    gaps,
        "research_questions":      rqs,
        "methodology_differences": methodology_diffs or ["Methodology comparison requires more detailed analysis."],
    }


# ── Validation ─────────────────────────────────────────────────────────────────

def _validate_gap_result(data: dict) -> Dict[str, Any]:
    gaps = []
    for g in data.get("gaps", []):
        severity = g.get("severity", "medium")
        gaps.append({
            "topic":       str(g.get("topic", "")),
            "description": str(g.get("description", "")),
            "severity":    severity if severity in ("high", "medium", "low") else "medium",
            "evidence": [{
                "paper_id":      str(e.get("paper_id", "")),
                "paper_title":   str(e.get("paper_title", "")),
                "citation_path": list(e.get("citation_path", [])),
                "missing_links": list(e.get("missing_links", [])),
                "explanation":   str(e.get("explanation", "")),
            } for e in g.get("evidence", [])],
        })
    return {
        "common_topics": [str(t) for t in data.get("common_topics", [])],
        "gaps":          gaps,
        "research_questions": [
            {"question": str(q.get("question", "")), "relevance": str(q.get("relevance", ""))}
            for q in data.get("research_questions", [])
        ],
        "methodology_differences": [str(d) for d in data.get("methodology_differences", [])],
    }