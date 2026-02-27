"""
Workflow orchestration for ResearchGraph AI.

Coordinates: Papers → summaries → citations → section-aware draft
with full versioning and staleness detection baked in.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from models.paper import Paper
from models.draft import Draft, DraftStatus, SectionName
from services.ai_summarizer import generate_draft_with_citations
from services.citation_extractor import format_all_citations
from services.draft_manager import (
    AllowedCitationRegistry,
    CitationAudit,
    DraftAlert,
    DraftHistory,
    PaperMetadata,
    build_draft,
    build_synthesis_prompt_block,
    detect_outdated,
    parse_sections,
)

logger = logging.getLogger(__name__)

# ── Module-level history (swap for DB-backed store later) ────
_history = DraftHistory()


def get_history() -> DraftHistory:
    """Expose the singleton history for external consumers."""
    return _history


def _normalize_authors(raw_authors) -> List[str]:
    """
    FIX: Normalize whatever format the PDF extractor gives us into
    a clean list of "First Last" strings the registry can work with.

    Key fix over previous version:
      The old heuristic tried to detect "Last, First, Last, First" interleaved
      format by checking if the comma-part count was even and the odd-indexed
      parts looked like first names.  This misfired on inputs like:

          "Jean Pouget-Abadie, Mehdi Mirza, Bing Xu, David Warde-Farley"

      which has 4 comma-parts (even) and odd parts "Mehdi Mirza" / "David
      Warde-Farley" both start with a capital, so the heuristic concluded it
      was "Last, First" pairs and produced:

          ["Jean, Pouget-Abadie Mehdi", "Mirza Bing, Xu David"]  ← garbage

      Root cause: the check `all(" " not in p for p in even_parts)` was missing.
      In true "Last, First" format the SURNAME token is a single word (no space).
      "Jean Pouget-Abadie" contains a space, so it cannot be a bare surname.

    The fixed guard:
        all_surnames_single_word = all(" " not in p for p in even_parts)

    If any "surname" candidate contains a space we fall through to the simple
    comma-split path, which gives the correct result.
    """
    if not raw_authors:
        return []

    # Already a clean list of strings
    if isinstance(raw_authors, list):
        result = []
        for a in raw_authors:
            if isinstance(a, list):
                result.extend(str(x).strip() for x in a if str(x).strip())
            elif isinstance(a, str) and a.strip():
                result.append(a.strip())
        return result

    # Single string — may be comma-separated
    if isinstance(raw_authors, str):
        raw = raw_authors.strip()
        if not raw:
            return []

        # "A and B" format
        if " and " in raw.lower():
            parts = re.split(r"\s+and\s+", raw, flags=re.IGNORECASE)
            return [p.strip() for p in parts if p.strip()]

        parts = [p.strip() for p in raw.split(",") if p.strip()]

        if len(parts) >= 2 and len(parts) % 2 == 0:
            even_parts = parts[0::2]   # supposed last-name tokens
            odd_parts  = parts[1::2]   # supposed first-name tokens

            # FIX: A true "Last, First" surname contains NO internal spaces.
            # "Jean Pouget-Abadie" has a space → cannot be a bare surname.
            all_surnames_single_word = all(" " not in p for p in even_parts)
            all_first_names_simple   = all(
                len(p.split()) <= 2 and p[0].isupper() for p in odd_parts
            )

            if all_surnames_single_word and all_first_names_simple:
                # Looks like interleaved "Last, First" pairs — rejoin them
                return [f"{parts[i]}, {parts[i+1]}" for i in range(0, len(parts), 2)]

        # Default: treat each comma-part as one author name
        return parts

    return []


import re  # needed for _normalize_authors


def _build_registry(papers: List[Paper]) -> AllowedCitationRegistry:
    """
    Build an AllowedCitationRegistry from the uploaded papers.

    FIX: Added author normalization and detailed logging so we can
    verify the registry is being built with correct author surnames.
    The root cause of 0 citations was authors being stored in a format
    that _surname() couldn't extract correctly (e.g. "Pouget-Abadie, Jean"
    being the listed first author instead of "Goodfellow, Ian").
    """
    registry = AllowedCitationRegistry()

    for p in papers:
        try:
            year = int(p.year) if hasattr(p, "year") and p.year else 0
        except (ValueError, TypeError):
            year = 0

        # FIX: normalize authors before registering
        raw_authors = p.authors if hasattr(p, "authors") else None
        authors = _normalize_authors(raw_authors)

        # FIX: Log exactly what we're registering — makes it easy to debug
        # author mismatches between registry and AI output
        logger.info(
            "Registering paper: id=%s title='%s' raw_authors=%s "
            "normalized_authors=%s year=%s",
            p.id, p.title[:60], raw_authors, authors, year,
        )

        registry.register(PaperMetadata(
            paper_id = p.id,
            title    = p.title,
            authors  = authors,
            year     = year,
        ))

    logger.info(
        "Registry built — %d paper(s), known surnames: %s",
        registry.count,
        sorted(registry._known_surnames),
    )
    return registry


def research_to_draft_workflow(
    papers: List[Paper],
    section: str = "literature review",
    gap_ids: Optional[List[str]] = None,
    reason: Optional[str] = None,
    force: bool = False,
    citation_instruction: Optional[str] = None,
    synthesis_instruction: Optional[str] = None,
) -> Dict[str, Any]:
    """
    End-to-end research workflow:
    Papers → summaries → citations → section-aware, versioned draft.
    """
    if not papers:
        raise ValueError("No papers provided for workflow.")

    gap_ids   = gap_ids or []
    paper_ids = [p.id for p in papers]

    # ── Skip if current draft is still fresh ─────────────────
    current = _history.latest
    if current and not force:
        alerts = detect_outdated(
            draft=current,
            current_paper_ids=paper_ids,
            current_gap_ids=gap_ids,
        )
        if current.is_fresh() and not alerts:
            logger.info("Current draft v%d is still fresh — skipping.", current.version)
            return {
                "workflow": "research_to_draft",
                "skipped": True,
                "reason": "draft_still_fresh",
                "draft": current.to_dict(),
                "alerts": [],
            }

    logger.info(
        "Starting research workflow for %d papers (section=%s, reason=%s)",
        len(papers), section, reason or "initial",
    )

    # 1. Build citation registry
    registry = _build_registry(papers)

    # 2. Collect summaries
    summaries = [p.summary.to_dict() for p in papers]

    # 3. Collect & format citations
    # FIX: also include registry APA forms directly so the AI sees exactly
    # the citation strings it's allowed to use, matching what's in the registry
    citations: List[str] = []
    for p in papers:
        citations.extend(format_all_citations(p.citations, fmt="APA"))

    # Append the registry's own APA forms to make sure they're present
    for meta in registry.all_papers():
        apa = meta.apa_inline
        if apa not in citations:
            citations.append(apa)

    # 4. Build citation instruction from registry (Layer 1)
    registry_citation_instruction = registry.build_citation_instruction()

    # 5. Generate raw text from AI
    raw_text: str = generate_draft_with_citations(
        summaries             = summaries,
        citations             = citations,
        section               = section,
        citation_instruction  = citation_instruction or registry_citation_instruction,
        synthesis_instruction = synthesis_instruction,
    )

    # 6. Build Draft with registry (citation enforcement layers 2-4 run here)
    parent = _history.latest
    draft = build_draft(
        raw_text  = raw_text,
        paper_ids = paper_ids,
        registry  = registry,
        gap_ids   = gap_ids,
        parent    = parent,
        reason    = reason,
    )

    # 7. Run outdated detection
    alerts = detect_outdated(
        draft             = draft,
        current_paper_ids = paper_ids,
        current_gap_ids   = gap_ids,
        registry          = registry,
    )

    # 8. Store in version history
    _history.push(draft)

    # 9. Compute diff if there's a prior version
    diff = None
    if parent:
        diff = _history.diff_summary(parent.version, draft.version)

    # 10. Reliability panel
    reliability = registry.reliability_panel()

    logger.info(
        "Workflow complete → draft v%d [%s], status=%s, %d alert(s), leaked=%d",
        draft.version,
        draft.draft_id,
        draft.status.value,
        len(alerts),
        len(getattr(getattr(draft, "citation_audit", None), "leaked", [])),
    )

    return {
        "workflow":          "research_to_draft",
        "skipped":           False,
        "paper_count":       len(papers),
        "section":           section,
        "draft":             draft.to_dict(),
        "alerts":            [a.to_dict() for a in alerts],
        "diff":              diff,
        "reliability_panel": reliability,
    }


def regenerate_section_workflow(
    section_name: SectionName,
    papers: List[Paper],
    gap_ids: Optional[List[str]] = None,
    reason: Optional[str] = None,
    citation_instruction: Optional[str] = None,
    synthesis_instruction: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Regenerate a single section of the latest draft while keeping
    all other sections intact.
    """
    current = _history.latest
    if current is None:
        raise ValueError("No existing draft to regenerate from. Run full workflow first.")

    gap_ids   = gap_ids or []
    paper_ids = [p.id for p in papers]
    reason    = reason or f"regenerate:{section_name.value}"

    logger.info("Regenerating section '%s' of draft v%d", section_name.value, current.version)

    registry = _build_registry(papers)

    summaries = [p.summary.to_dict() for p in papers]
    citations: List[str] = []
    for p in papers:
        citations.extend(format_all_citations(p.citations, fmt="APA"))
    for meta in registry.all_papers():
        apa = meta.apa_inline
        if apa not in citations:
            citations.append(apa)

    registry_citation_instruction = registry.build_citation_instruction()

    raw_section_text: str = generate_draft_with_citations(
        summaries             = summaries,
        citations             = citations,
        section               = section_name.value,
        citation_instruction  = citation_instruction or registry_citation_instruction,
        synthesis_instruction = synthesis_instruction,
    )

    new_sections = parse_sections(
        raw_section_text,
        known_paper_ids=set(paper_ids),
        known_gap_ids=set(gap_ids),
    )

    rebuilt_sections = []
    replaced = False
    for existing in current.sections:
        if existing.name == section_name and new_sections:
            target      = new_sections[0]
            target.name = section_name
            rebuilt_sections.append(target)
            replaced = True
        else:
            rebuilt_sections.append(existing)

    if not replaced and new_sections:
        rebuilt_sections.append(new_sections[0])

    full_text = "\n\n".join(
        f"## {s.heading}\n\n{s.content}" for s in rebuilt_sections
    )

    draft = build_draft(
        raw_text  = full_text,
        paper_ids = paper_ids,
        registry  = registry,
        gap_ids   = gap_ids,
        parent    = current,
        reason    = reason,
    )
    draft.sections = rebuilt_sections

    alerts = detect_outdated(
        draft             = draft,
        current_paper_ids = paper_ids,
        current_gap_ids   = gap_ids,
        registry          = registry,
    )

    _history.push(draft)
    diff = _history.diff_summary(current.version, draft.version)

    return {
        "workflow":          "regenerate_section",
        "section":           section_name.value,
        "draft":             draft.to_dict(),
        "alerts":            [a.to_dict() for a in alerts],
        "diff":              diff,
        "reliability_panel": registry.reliability_panel(),
    }