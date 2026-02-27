"""Knowledge graph generation using NetworkX."""

import logging
import re
from typing import List, Dict, Any, Tuple

import networkx as nx

from models.paper import Paper

logger = logging.getLogger(__name__)

# Colours assigned to nodes (cycled)
NODE_COLORS = [
    "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b",
    "#10b981", "#3b82f6", "#ef4444", "#14b8a6",
]


def build_knowledge_graph(papers: List[Paper]) -> Dict[str, Any]:
    """
    Build a knowledge-graph structure from a list of papers.

    Returns:
        {
            "nodes": [ { "id", "label", "color", "size", "citationCount" }, ... ],
            "edges": [ { "from", "to", "label" }, ... ]
        }
    """
    if not papers:
        return {"nodes": [], "edges": []}

    try:
        G = nx.DiGraph()

        # Add every paper as a node
        for idx, paper in enumerate(papers):
            G.add_node(
                paper.id,
                label=_short_label(paper.title or "Untitled"),
                full_title=paper.title or "Untitled",
                color=NODE_COLORS[idx % len(NODE_COLORS)],
                year=paper.year,
            )

        # Detect edges
        edges = _detect_citation_edges(papers)
        for src, dst in edges:
            G.add_edge(src, dst, label="cites")

        # Calculate in-degree
        in_degrees = dict(G.in_degree())

        # Build output
        nodes = []
        for nid, data in G.nodes(data=True):
            citation_count = in_degrees.get(nid, 0)
            nodes.append({
                "id": nid,
                "label": data.get("label", nid),
                "color": data.get("color", "#6366f1"),
                "size": 20 + citation_count * 8,
                "citationCount": citation_count,
            })

        edge_list = []
        for src, dst, data in G.edges(data=True):
            edge_list.append({
                "from": src,
                "to": dst,
                "label": data.get("label", "cites"),
            })

        logger.info("Graph built: %d nodes, %d edges.", len(nodes), len(edge_list))
        return {"nodes": nodes, "edges": edge_list}

    except Exception as e:
        logger.exception("Graph generation failed: %s", e)
        # Return nodes without edges rather than crashing
        return {
            "nodes": [
                {
                    "id": p.id,
                    "label": _short_label(p.title or "Untitled"),
                    "color": NODE_COLORS[i % len(NODE_COLORS)],
                    "size": 20,
                    "citationCount": 0,
                }
                for i, p in enumerate(papers)
            ],
            "edges": [],
        }


def _detect_citation_edges(papers: List[Paper]) -> List[Tuple[str, str]]:
    """
    For each pair of papers, check if paper A cites paper B.
    """
    edges: List[Tuple[str, str]] = []
    title_lookup = {p.id: _normalise(p.title or "") for p in papers}

    for paper_a in papers:
        text_a = _normalise(paper_a.full_text or "")
        citation_titles_a = {
            _normalise(c.title)
            for c in (paper_a.citations or [])
            if c.title
        }

        for paper_b in papers:
            if paper_a.id == paper_b.id:
                continue

            norm_b = title_lookup[paper_b.id]
            if not norm_b:
                continue

            # Strategy 1: title substring match in full text
            if text_a and norm_b in text_a:
                edges.append((paper_a.id, paper_b.id))
                continue

            # Strategy 2: title match in extracted citations
            if any(_fuzzy_match(norm_b, ct) for ct in citation_titles_a):
                edges.append((paper_a.id, paper_b.id))
                continue

            # Strategy 3: first-author-last-name + year match
            authors_b = paper_b.authors or []
            if authors_b and (paper_a.full_text or ""):
                last_name = authors_b[0].split()[-1].lower()
                if len(last_name) >= 2:
                    pattern = rf"\b{re.escape(last_name)}\b.*?\b{paper_b.year}\b"
                    if re.search(pattern, paper_a.full_text, re.IGNORECASE):
                        edges.append((paper_a.id, paper_b.id))

    return edges


def _normalise(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _fuzzy_match(a: str, b: str, threshold: float = 0.8) -> bool:
    """Simple token-overlap fuzzy matching."""
    tokens_a = set(a.split())
    tokens_b = set(b.split())
    if not tokens_a or not tokens_b:
        return False
    overlap = len(tokens_a & tokens_b)
    max_len = max(len(tokens_a), len(tokens_b))
    return (overlap / max_len) >= threshold


def _short_label(title: str, max_len: int = 35) -> str:
    """Truncate a title for use as a node label."""
    if len(title) <= max_len:
        return title
    return title[: max_len - 3].rstrip() + "..."