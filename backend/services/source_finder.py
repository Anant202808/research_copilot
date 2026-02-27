"""
Source Finder — Semantic Scholar API integration.
Finds related papers based on title, keywords, or abstract.
No API key required for basic usage.
"""

import logging
import time
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

SEMANTIC_SCHOLAR_BASE = "https://api.semanticscholar.org/graph/v1"
REQUEST_TIMEOUT = 10
MAX_RESULTS = 10

# Fields to fetch from Semantic Scholar
PAPER_FIELDS = "paperId,title,authors,year,abstract,citationCount,openAccessPdf,externalIds,url"


def find_related_papers(
    title: str = "",
    keywords: Optional[List[str]] = None,
    abstract: str = "",
    limit: int = MAX_RESULTS,
) -> List[Dict[str, Any]]:
    """
    Main entry point. Searches Semantic Scholar for related papers.
    Tries title first, falls back to keywords if no results.
    """
    keywords = keywords or []
    results = []

    # Strategy 1: Search by title
    if title:
        results = _search_by_query(title, limit)

    # Strategy 2: Fallback to top keywords if title search fails
    if not results and keywords:
        query = " ".join(keywords[:5])
        results = _search_by_query(query, limit)

    # Strategy 3: Fallback to first sentence of abstract
    if not results and abstract:
        query = abstract[:200]
        results = _search_by_query(query, limit)

    logger.info("find_related_papers: found %d results.", len(results))
    return results


def _search_by_query(query: str, limit: int) -> List[Dict[str, Any]]:
    """Search Semantic Scholar by a query string."""
    try:
        url = f"{SEMANTIC_SCHOLAR_BASE}/paper/search"
        params = {
            "query": query,
            "limit": limit,
            "fields": PAPER_FIELDS,
        }
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

        if response.status_code == 429:
            logger.warning("Semantic Scholar rate limit hit — waiting 5s.")
            time.sleep(5)
            response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

        if response.status_code != 200:
            logger.error("Semantic Scholar returned %d.", response.status_code)
            return []

        data = response.json()
        papers = data.get("data", [])
        return [_format_paper(p) for p in papers if p.get("title")]

    except requests.exceptions.Timeout:
        logger.error("Semantic Scholar request timed out.")
        return []
    except requests.exceptions.ConnectionError:
        logger.error("Could not connect to Semantic Scholar.")
        return []
    except Exception as e:
        logger.error("Semantic Scholar search failed: %s", e)
        return []


def get_paper_details(semantic_id: str) -> Optional[Dict[str, Any]]:
    """Fetch full details for a single paper by Semantic Scholar ID."""
    try:
        url = f"{SEMANTIC_SCHOLAR_BASE}/paper/{semantic_id}"
        params = {"fields": PAPER_FIELDS}
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

        if response.status_code != 200:
            logger.error("Could not fetch paper %s: %d", semantic_id, response.status_code)
            return None

        return _format_paper(response.json())

    except Exception as e:
        logger.error("get_paper_details failed: %s", e)
        return None


def get_citing_papers(semantic_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Get papers that cite the given paper."""
    try:
        url = f"{SEMANTIC_SCHOLAR_BASE}/paper/{semantic_id}/citations"
        params = {
            "fields": PAPER_FIELDS,
            "limit": limit,
        }
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

        if response.status_code != 200:
            return []

        data = response.json()
        return [
            _format_paper(item["citingPaper"])
            for item in data.get("data", [])
            if item.get("citingPaper", {}).get("title")
        ]

    except Exception as e:
        logger.error("get_citing_papers failed: %s", e)
        return []


def get_referenced_papers(semantic_id: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Get papers referenced by the given paper."""
    try:
        url = f"{SEMANTIC_SCHOLAR_BASE}/paper/{semantic_id}/references"
        params = {
            "fields": PAPER_FIELDS,
            "limit": limit,
        }
        response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)

        if response.status_code != 200:
            return []

        data = response.json()
        return [
            _format_paper(item["citedPaper"])
            for item in data.get("data", [])
            if item.get("citedPaper", {}).get("title")
        ]

    except Exception as e:
        logger.error("get_referenced_papers failed: %s", e)
        return []


def _format_paper(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize a Semantic Scholar paper object into our format."""
    authors = raw.get("authors") or []
    pdf_info = raw.get("openAccessPdf") or {}

    return {
        "semantic_id":     raw.get("paperId", ""),
        "title":           raw.get("title", "Unknown Title"),
        "authors":         [a.get("name", "") for a in authors],
        "year":            raw.get("year"),
        "abstract":        raw.get("abstract") or "",
        "citation_count":  raw.get("citationCount", 0),
        "pdf_url":         pdf_info.get("url") or "",
        "url":             raw.get("url") or "",
        "doi":             (raw.get("externalIds") or {}).get("DOI", ""),
    }