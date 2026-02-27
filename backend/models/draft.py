"""
First-class Draft model for ResearchGraph.

A draft is structured data — not just a string of text.
Every draft knows what papers it used, what gaps it covers,
when it was created, and whether it's still fresh.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional


# ── Status enum ──────────────────────────────────────────────

class DraftStatus(str, Enum):
    """Lifecycle state of a draft."""
    FRESH    = "fresh"       # Up-to-date, nothing invalidates it
    OUTDATED = "outdated"    # A material input changed after generation
    PARTIAL  = "partial"     # Known gaps or sections still missing
    STALE    = "stale"       # Aged past a configurable TTL


# ── Section names ────────────────────────────────────────────

class SectionName(str, Enum):
    """Canonical section labels used across the system."""
    INTRO             = "introduction"
    LITERATURE_REVIEW = "literature_review"
    GAPS              = "gaps"
    DISCUSSION        = "discussion"
    FUTURE_WORK       = "future_work"
    UNKNOWN           = "unknown"


# ── Section dataclass ────────────────────────────────────────

@dataclass
class DraftSection:
    """One logical section inside a draft."""

    name: SectionName
    heading: str                              # Original heading text
    content: str                              # Body text under this heading
    paper_ids_used: List[str]   = field(default_factory=list)
    gap_ids_covered: List[str]  = field(default_factory=list)
    citation_count: int         = 0
    status: DraftStatus         = DraftStatus.FRESH

    # ── helpers ──────────────────────────────────────────────

    def content_hash(self) -> str:
        return hashlib.sha256(self.content.encode()).hexdigest()[:16]

    def to_dict(self) -> Dict:
        return {
            "name": self.name.value,
            "heading": self.heading,
            "content": self.content,
            "paper_ids_used": self.paper_ids_used,
            "gap_ids_covered": self.gap_ids_covered,
            "citation_count": self.citation_count,
            "status": self.status.value,
        }


# ── Draft dataclass ──────────────────────────────────────────

@dataclass
class Draft:
    """
    A first-class, versioned, section-aware draft.

    Fields
    ------
    text             Full concatenated text (convenience).
    sections         Ordered list of DraftSection objects.
    paper_ids_used   Global list of every paper id referenced.
    citation_count   Total citations across all sections.
    gap_ids_covered  Every gap id addressed somewhere in the draft.
    generated_at     UTC timestamp of creation.
    version          Monotonically increasing integer.
    status           Aggregate lifecycle state.
    draft_id         Unique identifier for this draft.
    parent_id        draft_id of the previous version (None for v1).
    regeneration_reason  Free-text note explaining *why* this version exists.
    """

    text: str
    sections: List[DraftSection]             = field(default_factory=list)
    paper_ids_used: List[str]                = field(default_factory=list)
    citation_count: int                      = 0
    gap_ids_covered: List[str]               = field(default_factory=list)
    generated_at: datetime                   = field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    version: int                             = 1
    status: DraftStatus                      = DraftStatus.FRESH
    draft_id: str                            = field(
        default_factory=lambda: uuid.uuid4().hex[:12],
    )
    parent_id: Optional[str]                 = None
    regeneration_reason: Optional[str]       = None

    # ── Derived helpers ──────────────────────────────────────

    def content_hash(self) -> str:
        """Deterministic fingerprint of the full text."""
        return hashlib.sha256(self.text.encode()).hexdigest()[:16]

    def get_section(self, name: SectionName) -> Optional[DraftSection]:
        for s in self.sections:
            if s.name == name:
                return s
        return None

    def section_names(self) -> List[str]:
        return [s.name.value for s in self.sections]

    def is_fresh(self) -> bool:
        return self.status == DraftStatus.FRESH

    # ── Serialisation ────────────────────────────────────────

    def to_dict(self) -> Dict:
        return {
            "draft_id": self.draft_id,
            "parent_id": self.parent_id,
            "version": self.version,
            "status": self.status.value,
            "generated_at": self.generated_at.isoformat(),
            "regeneration_reason": self.regeneration_reason,
            "text": self.text,
            "sections": [s.to_dict() for s in self.sections],
            "paper_ids_used": self.paper_ids_used,
            "citation_count": self.citation_count,
            "gap_ids_covered": self.gap_ids_covered,
            "content_hash": self.content_hash(),
        }