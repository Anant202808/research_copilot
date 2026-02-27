"""
Tests for the draft system — model, parsing, versioning, staleness.
All deterministic. No AI calls.
"""

import pytest
from datetime import datetime, timezone, timedelta

from models.draft import Draft, DraftSection, DraftStatus, SectionName
from services.draft_manager import (
    DraftHistory,
    build_draft,
    detect_outdated,
    parse_sections,
    MIN_CITATION_DENSITY,
    DRAFT_TTL_HOURS,
)


# ── Fixtures ─────────────────────────────────────────────────

SAMPLE_RAW = """\
# Introduction

This paper examines recent trends (Smith, 2023).

## Literature Review

Several studies (Jones et al., 2022) and (Lee & Park, 2021) have explored
the topic in depth. Paper p001 is particularly relevant.

## Gaps

Gap g01 remains unaddressed in the current literature.

## Discussion

The findings suggest (Wang, 2020) that further work is needed. p002.

## Future Work

We propose extending this to cover gap g02.
"""

PAPER_IDS = ["p001", "p002", "p003"]
GAP_IDS   = ["g01", "g02", "g03"]


# ── Section parsing ──────────────────────────────────────────

class TestParseSections:
    def test_finds_all_headings(self):
        sections = parse_sections(SAMPLE_RAW, set(PAPER_IDS), set(GAP_IDS))
        assert len(sections) == 5

    def test_maps_section_names(self):
        sections = parse_sections(SAMPLE_RAW, set(PAPER_IDS), set(GAP_IDS))
        names = [s.name for s in sections]
        assert SectionName.INTRO in names
        assert SectionName.LITERATURE_REVIEW in names
        assert SectionName.GAPS in names

    def test_counts_citations(self):
        sections = parse_sections(SAMPLE_RAW, set(PAPER_IDS), set(GAP_IDS))
        lit_review = [s for s in sections if s.name == SectionName.LITERATURE_REVIEW][0]
        assert lit_review.citation_count >= 2

    def test_extracts_paper_ids(self):
        sections = parse_sections(SAMPLE_RAW, set(PAPER_IDS), set(GAP_IDS))
        lit_review = [s for s in sections if s.name == SectionName.LITERATURE_REVIEW][0]
        assert "p001" in lit_review.paper_ids_used

    def test_extracts_gap_ids(self):
        sections = parse_sections(SAMPLE_RAW, set(PAPER_IDS), set(GAP_IDS))
        gaps_section = [s for s in sections if s.name == SectionName.GAPS][0]
        assert "g01" in gaps_section.gap_ids_covered

    def test_no_headings_graceful(self):
        sections = parse_sections("Just plain text.", set(), set())
        assert len(sections) == 1
        assert sections[0].name == SectionName.UNKNOWN


# ── Draft builder ────────────────────────────────────────────

class TestBuildDraft:
    def test_version_starts_at_1(self):
        draft = build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS)
        assert draft.version == 1
        assert draft.parent_id is None

    def test_version_increments(self):
        v1 = build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS)
        v2 = build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS, parent=v1, reason="added paper")
        assert v2.version == 2
        assert v2.parent_id == v1.draft_id
        assert v2.regeneration_reason == "added paper"

    def test_aggregates_citations(self):
        draft = build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS)
        assert draft.citation_count >= 3

    def test_to_dict_roundtrip(self):
        draft = build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS)
        d = draft.to_dict()
        assert d["version"] == 1
        assert isinstance(d["sections"], list)
        assert "content_hash" in d


# ── Version history ──────────────────────────────────────────

class TestDraftHistory:
    def test_push_and_latest(self):
        h = DraftHistory()
        d1 = build_draft(SAMPLE_RAW, PAPER_IDS)
        h.push(d1)
        assert h.latest is d1

    def test_diff_summary(self):
        h = DraftHistory()
        d1 = build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS)
        h.push(d1)

        modified = SAMPLE_RAW.replace("Introduction", "Introduction (Revised)")
        d2 = build_draft(modified, PAPER_IDS + ["p004"], GAP_IDS, parent=d1, reason="new paper")
        h.push(d2)

        diff = h.diff_summary(1, 2)
        assert diff["from_version"] == 1
        assert diff["to_version"] == 2
        assert "p004" in diff["paper_ids_added"]

    def test_get_version(self):
        h = DraftHistory()
        d1 = build_draft("text", ["p1"])
        h.push(d1)
        assert h.get_version(1) is d1
        assert h.get_version(99) is None


# ── Outdated detection ───────────────────────────────────────

class TestOutdatedDetection:
    def _make_draft(self, **kwargs) -> Draft:
        return build_draft(SAMPLE_RAW, PAPER_IDS, GAP_IDS, **kwargs)

    def test_fresh_when_nothing_changed(self):
        draft = self._make_draft()
        alerts = detect_outdated(draft, PAPER_IDS, GAP_IDS)
        assert draft.status == DraftStatus.FRESH
        # only low-citation warnings possible
        assert all(a.code != "NEW_PAPERS" for a in alerts)

    def test_outdated_on_new_paper(self):
        draft = self._make_draft()
        alerts = detect_outdated(draft, PAPER_IDS + ["p_new"], GAP_IDS)
        assert draft.status == DraftStatus.OUTDATED
        codes = [a.code for a in alerts]
        assert "NEW_PAPERS" in codes

    def test_outdated_on_paper_uploaded_after(self):
        draft = self._make_draft()
        future = draft.generated_at + timedelta(hours=1)
        alerts = detect_outdated(
            draft, PAPER_IDS, GAP_IDS,
            latest_paper_uploaded_at=future,
        )
        assert draft.status == DraftStatus.OUTDATED

    def test_partial_on_new_gap(self):
        draft = self._make_draft()
        alerts = detect_outdated(draft, PAPER_IDS, GAP_IDS + ["g_new"])
        assert draft.status in (DraftStatus.PARTIAL, DraftStatus.OUTDATED)
        codes = [a.code for a in alerts]
        assert "UNCOVERED_GAPS" in codes

    def test_stale_after_ttl(self):
        draft = self._make_draft()
        future = draft.generated_at + timedelta(hours=DRAFT_TTL_HOURS + 1)
        alerts = detect_outdated(draft, PAPER_IDS, GAP_IDS, now=future)
        codes = [a.code for a in alerts]
        assert "DRAFT_STALE" in codes

    def test_low_citation_warning(self):
        sparse = "# Introduction\n\nNo references here at all."
        draft = build_draft(sparse, PAPER_IDS, GAP_IDS)
        alerts = detect_outdated(draft, PAPER_IDS, GAP_IDS)
        codes = [a.code for a in alerts]
        assert "LOW_CITATIONS" in codes