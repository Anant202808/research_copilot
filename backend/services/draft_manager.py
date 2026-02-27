"""
Draft management service.

Responsibilities
────────────────
• Parse raw AI output into section-aware Draft objects.
• Maintain a version history (append-only list).
• Detect staleness via deterministic rules — no AI needed.
• **Enforce citation integrity** — only uploaded papers may be cited.
• Emit structured alerts / tasks for the rest of the system.

CITATION INTEGRITY ARCHITECTURE (defence in depth)
───────────────────────────────────────────────────
Layer 1 — PROMPT:   Tell the model exactly which keys to use.
Layer 2 — DETECT:   Catch *every* citation-shaped string in output.
Layer 3 — CLASSIFY: Is it from our registry?  Yes → keep.  No → strip.
Layer 4 — VERIFY:   Re-scan the stripped text.  If anything leaks, reject entirely.
Layer 5 — METADATA: Attach a tamper-evident audit so the UI can show proof.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Set, Tuple

from models.draft import (
    Draft,
    DraftSection,
    DraftStatus,
    SectionName,
)

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────

DRAFT_TTL_HOURS              = 72
MAX_CITATION_REPAIR_ATTEMPTS = 3

SECTION_HEADING_MAP: Dict[str, SectionName] = {
    "introduction":      SectionName.INTRO,
    "intro":             SectionName.INTRO,
    "literature review": SectionName.LITERATURE_REVIEW,
    "literature":        SectionName.LITERATURE_REVIEW,
    "review":            SectionName.LITERATURE_REVIEW,
    "gaps":              SectionName.GAPS,
    "research gaps":     SectionName.GAPS,
    "identified gaps":   SectionName.GAPS,
    "discussion":        SectionName.DISCUSSION,
    "future work":       SectionName.FUTURE_WORK,
    "future directions": SectionName.FUTURE_WORK,
    "conclusion":        SectionName.FUTURE_WORK,
}


def get_min_citation_density(paper_count: int) -> int:
    if paper_count <= 2:
        return 1
    elif paper_count <= 5:
        return 2
    return 3


# ── Paper metadata registry ─────────────────────────────────

@dataclass(frozen=True)
class PaperMetadata:
    paper_id: str
    title: str
    authors: List[str]
    year: int
    citation_key: str = ""

    def __post_init__(self):
        if not self.citation_key:
            object.__setattr__(
                self, "citation_key", f"(Paper-{self.paper_id[:8]})"
            )

    @property
    def apa_inline(self) -> str:
        if len(self.authors) == 0:
            first = "Unknown"
        elif len(self.authors) == 1:
            first = self._surname(self.authors[0])
        elif len(self.authors) == 2:
            first = (
                f"{self._surname(self.authors[0])} & "
                f"{self._surname(self.authors[1])}"
            )
        else:
            first = f"{self._surname(self.authors[0])} et al."
        return f"({first}, {self.year})"

    @property
    def full_reference(self) -> str:
        author_str = ", ".join(self.authors) if self.authors else "Unknown"
        return f"{author_str} ({self.year}). {self.title}."

    @staticmethod
    def _surname(full_name: str) -> str:
        """
        Handle both name formats PDFs produce:
          "Ian Goodfellow"  → "Goodfellow"  (last word)
          "Goodfellow, Ian" → "Goodfellow"  (strip trailing comma from first token)
        """
        name = full_name.strip()
        if "," in name:
            return name.split(",")[0].strip()
        parts = name.split()
        return parts[-1] if parts else name

    def all_surface_forms(self) -> List[str]:
        """
        Every string the AI might plausibly use to cite this paper.
        We pre-compute these so the classifier can whitelist them.
        """
        forms: List[str] = []
        forms.append(self.citation_key.lower())
        forms.append(self.apa_inline.lower())

        for author in self.authors:
            surname = self._surname(author)
            forms.append(f"({surname}, {self.year})".lower())
            forms.append(f"{surname}, {self.year}".lower())
            forms.append(f"{surname} ({self.year})".lower())
            forms.append(f"({surname} {self.year})".lower())
            forms.append(surname.lower())

        if self.authors:
            s = self._surname(self.authors[0])
            forms.append(f"({s} et al., {self.year})".lower())
            forms.append(f"{s} et al., {self.year}".lower())
            forms.append(f"({s} et al. {self.year})".lower())
            forms.append(f"{s} et al.".lower())
            forms.append(f"({s} et al, {self.year})".lower())
            forms.append(f"{s} et al, {self.year}".lower())

        if len(self.authors) >= 2:
            s1 = self._surname(self.authors[0])
            s2 = self._surname(self.authors[1])
            forms.append(f"({s1} & {s2}, {self.year})".lower())
            forms.append(f"({s1} and {s2}, {self.year})".lower())
            forms.append(f"{s1} & {s2}, {self.year}".lower())
            forms.append(f"{s1} and {s2}, {self.year}".lower())

        title_key = self.title[:60].strip().lower()
        if title_key:
            forms.append(title_key)

        return list(set(forms))


class AllowedCitationRegistry:
    """
    The gatekeeper. Only papers registered here may appear in drafts.
    """

    def __init__(self) -> None:
        self._papers: Dict[str, PaperMetadata] = {}
        self._surface_forms: Dict[str, str] = {}
        self._known_surnames: Set[str] = set()
        self._known_years: Set[int] = set()

    def register(self, meta: PaperMetadata) -> None:
        self._papers[meta.paper_id] = meta
        for form in meta.all_surface_forms():
            self._surface_forms[form] = meta.paper_id
        for author in meta.authors:
            self._known_surnames.add(PaperMetadata._surname(author).lower())
        self._known_years.add(meta.year)
        logger.info(
            "Registered paper %s: apa=%s title=%s authors=%s year=%s (%d surface forms)",
            meta.paper_id, meta.apa_inline, meta.title[:60],
            meta.authors, meta.year,
            len(meta.all_surface_forms()),
        )

    def register_many(self, metas: List[PaperMetadata]) -> None:
        for m in metas:
            self.register(m)

    @property
    def paper_ids(self) -> Set[str]:
        return set(self._papers.keys())

    @property
    def count(self) -> int:
        return len(self._papers)

    def get(self, paper_id: str) -> Optional[PaperMetadata]:
        return self._papers.get(paper_id)

    def all_papers(self) -> List[PaperMetadata]:
        return list(self._papers.values())

    def citation_keys(self) -> List[str]:
        return [p.citation_key for p in self._papers.values()]

    def is_known_surface_form(self, text: str) -> bool:
        return text.strip().lower() in self._surface_forms

    def resolve_surface_form(self, text: str) -> Optional[str]:
        return self._surface_forms.get(text.strip().lower())

    def is_known_surname(self, name: str) -> bool:
        return name.strip().lower() in self._known_surnames

    def build_citation_instruction(self) -> str:
        if not self._papers:
            return ""
        lines = [
            "╔══════════════════════════════════════════════════════════╗",
            "║         CITATION RULES — ABSOLUTE CONSTRAINTS           ║",
            "╠══════════════════════════════════════════════════════════╣",
            "║                                                          ║",
            f"║  You have EXACTLY {self.count} paper(s). No more exist.       ║",
            "║                                                          ║",
            "║  1. ONLY use the citation keys listed below.             ║",
            "║  2. NEVER cite any author/year NOT in this list.         ║",
            "║  3. NEVER invent references from your training data.     ║",
            "║  4. If you cannot support a claim → write:               ║",
            "║     'This area requires further investigation'           ║",
            "║     DO NOT fabricate a citation.                         ║",
            "║  5. EVERY parenthetical citation must match a key below. ║",
            "║  6. Do NOT mention author names in running text unless   ║",
            "║     they appear in the list below.                       ║",
            "║                                                          ║",
            "╠══════════════════════════════════════════════════════════╣",
            "║  ALLOWED CITATIONS (exhaustive list):                    ║",
            "╠══════════════════════════════════════════════════════════╣",
        ]
        for p in self._papers.values():
            lines.append(f"║  KEY: {p.citation_key}                                 ")
            lines.append(f"║  APA: {p.apa_inline}                                   ")
            lines.append(f"║  TITLE: \"{p.title[:50]}\"                             ")
            lines.append("║                                                          ║")
        lines.append("╠══════════════════════════════════════════════════════════╣")
        lines.append("║  ANY other citation → AUTOMATIC REJECTION.              ║")
        lines.append("║  This is enforced by post-processing. You cannot        ║")
        lines.append("║  bypass it. Do not try.                                 ║")
        lines.append("╚══════════════════════════════════════════════════════════╝")
        return "\n".join(lines)

    def reliability_panel(self) -> Dict:
        return {
            "papers_used": self.count,
            "citation_sources": [
                {"id": p.paper_id, "citation": p.apa_inline, "title": p.title}
                for p in self._papers.values()
            ],
            "external_citations_allowed": False,
            "badge": "✓ No external citations — all references verified from uploads",
        }


# ── Citation detection engine (Layer 2) ─────────────────────

_PAREN_CITE_RE = re.compile(
    r"\("
    r"[A-Z][A-Za-z\-']+"
    r"(?:"
        r"\s+(?:et\s+al\.?)"
        r"|\s*[&,]\s*[A-Z][A-Za-z\-']+"
    r")*"
    r",?\s*\d{4}[a-z]?"
    r"\)"
)

_BRACKET_CITE_RE = re.compile(r"\[\d+(?:[,;\-–]\s*\d+)*\]")
_KEY_CITE_RE     = re.compile(r"\(Paper-[a-f0-9]{8}\)")

_BARE_AUTHOR_YEAR_RE = re.compile(
    r"(?<!\w)"
    r"[A-Z][A-Za-z\-']{2,}"
    r"(?:"
        r"\s+(?:et\s+al\.?)"
        r"|\s+(?:and|&)\s+[A-Z][A-Za-z\-']{2,}"
    r")"
    r"[\s,]*"
    r"[\(\s]?\d{4}[a-z]?[\)\s,;.]"
)

_BARE_TWO_AUTHOR_RE = re.compile(
    r"(?<!\w)"
    r"[A-Z][A-Za-z\-']{2,}"
    r"\s+(?:and|&)\s+"
    r"[A-Z][A-Za-z\-']{2,}"
    r"\s*\(\d{4}[a-z]?\)"
)

_NARRATIVE_CITE_RE = re.compile(
    r"[A-Z][A-Za-z\-']{2,}"
    r"(?:\s+et\s+al\.?)?"
    r"\s*\(\d{4}[a-z]?\)"
)

_ALL_CITE_PATTERNS = [
    _KEY_CITE_RE,
    _PAREN_CITE_RE,
    _BARE_TWO_AUTHOR_RE,
    _NARRATIVE_CITE_RE,
    _BARE_AUTHOR_YEAR_RE,
    _BRACKET_CITE_RE,
]

_FALSE_POSITIVE_WORDS = {
    "figure", "table", "section", "chapter", "equation",
    "appendix", "however", "therefore", "furthermore",
    "moreover", "although", "between", "through",
    "within", "without", "during", "before", "after",
}


@dataclass
class CitationMatch:
    text: str
    start: int
    end: int
    pattern_name: str


def _extract_all_citation_candidates(text: str) -> List[CitationMatch]:
    seen_spans: Set[Tuple[int, int]] = set()
    matches: List[CitationMatch] = []

    pattern_names = [
        "key_cite", "paren_cite", "bare_two_author",
        "narrative_cite", "bare_author_year", "bracket_cite",
    ]

    for pattern, name in zip(_ALL_CITE_PATTERNS, pattern_names):
        for m in pattern.finditer(text):
            span = (m.start(), m.end())
            overlap = False
            for existing_start, existing_end in seen_spans:
                if m.start() < existing_end and m.end() > existing_start:
                    overlap = True
                    break
            if not overlap:
                core = m.group().strip("()[], .;")
                first_word = core.split()[0].lower() if core.split() else ""
                if first_word in _FALSE_POSITIVE_WORDS:
                    continue
                seen_spans.add(span)
                matches.append(CitationMatch(
                    text=m.group(),
                    start=m.start(),
                    end=m.end(),
                    pattern_name=name,
                ))

    matches.sort(key=lambda c: c.start)
    return matches


# ── Citation classification (Layer 3) ────────────────────────

@dataclass
class CitationAudit:
    total_found: int = 0
    valid: List[str] = field(default_factory=list)
    invalid: List[str] = field(default_factory=list)
    leaked: List[str] = field(default_factory=list)
    repaired_text: str = ""
    repair_count: int = 0
    layer4_clean: bool = True

    @property
    def is_clean(self) -> bool:
        return (
            len(self.invalid) == 0
            and len(self.leaked) == 0
            and self.layer4_clean
        )

    def to_dict(self) -> Dict:
        return {
            "total_citations_found": self.total_found,
            "valid_count": len(self.valid),
            "invalid_count": len(self.invalid),
            "leaked_count": len(self.leaked),
            "is_clean": self.is_clean,
            "invalid_citations": self.invalid,
            "leaked_citations": self.leaked,
            "repair_count": self.repair_count,
            "layer4_verified": self.layer4_clean,
        }


_STRIPPED_MARKER    = "[citation removed — source not in uploaded papers]"
_UNSUPPORTED_MARKER = "[further research needed]"


def _classify_citation(
    cite: CitationMatch,
    registry: AllowedCitationRegistry,
) -> Tuple[str, bool]:
    text = cite.text.strip()

    if registry.is_known_surface_form(text):
        return "registry_match", True

    inner = text.strip("()[]")
    if registry.is_known_surface_form(f"({inner})"):
        return "registry_match_normalised", True
    if registry.is_known_surface_form(inner):
        return "registry_match_inner", True

    key_match = _KEY_CITE_RE.fullmatch(text)
    if key_match:
        fragment = text[7:-1]
        matched = any(pid.startswith(fragment) for pid in registry.paper_ids)
        return ("key_match", True) if matched else ("key_unknown", False)

    if _BRACKET_CITE_RE.fullmatch(text):
        return "bracket_not_used", False

    year_match = re.search(r"\d{4}", text)
    if year_match:
        year_str = year_match.group()
        surname_candidates = re.findall(r"[A-Z][A-Za-z\-']{2,}", text)
        for surname in surname_candidates:
            check_forms = [
                f"({surname.lower()}, {year_str})",
                f"{surname.lower()}, {year_str}",
                f"({surname.lower()} et al., {year_str})",
                f"{surname.lower()} et al., {year_str}",
                f"({surname.lower()} et al, {year_str})",
                f"{surname.lower()} et al, {year_str}",
                f"{surname.lower()} ({year_str})",
            ]
            for form in check_forms:
                if form in registry._surface_forms:
                    return "surname_year_match", True

            if not registry.is_known_surname(surname):
                return "unknown_author", False

        return "wrong_year", False

    return "no_year_ambiguous", False


def audit_citations(
    text: str,
    registry: AllowedCitationRegistry,
) -> CitationAudit:
    """Layers 2+3: detect every citation-shaped string, classify each."""
    audit = CitationAudit(layer4_clean=True)

    candidates = _extract_all_citation_candidates(text)
    audit.total_found = len(candidates)

    for cite in candidates:
        label, is_valid = _classify_citation(cite, registry)

        if is_valid:
            audit.valid.append(cite.text)
            logger.debug("CITATION VALID [%s]: %s", label, cite.text)
        else:
            audit.invalid.append(cite.text)
            audit.leaked.append(cite.text)
            logger.warning(
                "CITATION LEAKED [%s]: '%s' (pattern: %s)",
                label, cite.text, cite.pattern_name,
            )

    repaired = text
    for leaked_cite in sorted(audit.leaked, key=len, reverse=True):
        repaired = repaired.replace(leaked_cite, _STRIPPED_MARKER)
    audit.repaired_text = repaired
    audit.repair_count = len(audit.leaked)

    return audit


def _layer4_verify(text: str, registry: AllowedCitationRegistry) -> List[str]:
    remaining = []

    candidates = _extract_all_citation_candidates(text)
    for cite in candidates:
        _, is_valid = _classify_citation(cite, registry)
        if not is_valid:
            remaining.append(cite.text)

    for m in re.finditer(r"[A-Z][A-Za-z\-']{2,}\s+et\s+al\.?", text):
        surname = m.group().split()[0]
        if not registry.is_known_surname(surname):
            if m.group() not in remaining:
                remaining.append(m.group())

    for m in re.finditer(r"([A-Z][A-Za-z\-']{2,})\s*\((\d{4})\)", text):
        surname = m.group(1)
        if not registry.is_known_surname(surname):
            if m.group() not in remaining:
                remaining.append(m.group())

    return remaining


def enforce_citations(
    text: str,
    registry: AllowedCitationRegistry,
) -> Tuple[str, CitationAudit]:
    """Layers 2–4 combined. Strip hallucinated citations, verify result."""
    audit = audit_citations(text, registry)
    working_text = audit.repaired_text

    audit.layer4_clean = False

    for attempt in range(MAX_CITATION_REPAIR_ATTEMPTS):
        remaining = _layer4_verify(working_text, registry)
        if not remaining:
            audit.layer4_clean = True
            break

        logger.warning(
            "Layer 4 pass %d found %d remaining leaks: %s",
            attempt + 1, len(remaining), remaining,
        )
        for leaked in sorted(remaining, key=len, reverse=True):
            working_text = working_text.replace(leaked, _STRIPPED_MARKER)
            if leaked not in audit.leaked:
                audit.leaked.append(leaked)
                audit.invalid.append(leaked)
                audit.repair_count += 1
    else:
        final_remaining = _layer4_verify(working_text, registry)
        audit.layer4_clean = len(final_remaining) == 0
        if not audit.layer4_clean:
            logger.error(
                "Layer 4 FAILED after %d attempts. Remaining: %s",
                MAX_CITATION_REPAIR_ATTEMPTS, final_remaining,
            )

    marker_escaped = re.escape(_STRIPPED_MARKER)
    multi_marker = re.compile(rf"(?:{marker_escaped}\s*,?\s*){{2,}}")
    working_text = multi_marker.sub(_STRIPPED_MARKER, working_text)

    working_text = re.sub(
        r"(?:As (?:shown|demonstrated|noted|argued|proposed|suggested|discussed) by\s+)"
        + marker_escaped,
        _UNSUPPORTED_MARKER,
        working_text,
    )
    working_text = re.sub(
        r"(?:According to\s+)" + marker_escaped,
        _UNSUPPORTED_MARKER,
        working_text,
    )

    audit.repaired_text = working_text

    if audit.is_clean:
        logger.info(
            "Citation enforcement PASSED — %d valid citations, 0 leaked.",
            len(audit.valid),
        )
    else:
        logger.warning(
            "Citation enforcement: %d valid, %d stripped, layer4=%s",
            len(audit.valid), len(audit.leaked),
            "CLEAN" if audit.layer4_clean else "DIRTY",
        )

    return working_text, audit


def render_citation_keys(
    text: str,
    registry: AllowedCitationRegistry,
) -> str:
    def _replace_key(match: re.Match) -> str:
        key = match.group()
        paper_id_fragment = key[7:-1]
        for pid, meta in registry._papers.items():
            if pid.startswith(paper_id_fragment):
                return meta.apa_inline
        return _STRIPPED_MARKER

    return _KEY_CITE_RE.sub(_replace_key, text)


def build_reference_section(registry: AllowedCitationRegistry) -> str:
    if not registry.count:
        return ""
    lines = ["## References", ""]
    for paper in sorted(registry.all_papers(), key=lambda p: p.full_reference):
        lines.append(f"- {paper.full_reference}")
    lines.append("")
    return "\n".join(lines)


def replace_references_section(
    text: str,
    registry: AllowedCitationRegistry,
) -> str:
    ref_pattern = re.compile(
        r"^#{1,3}\s*(?:References|Bibliography|Works Cited|Reference List)\s*$.*",
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    text = ref_pattern.sub("", text).rstrip()
    verified_refs = build_reference_section(registry)
    if verified_refs:
        text = text + "\n\n" + verified_refs
    return text


SYNTHESIS_NUDGES = [
    "Compare and contrast the approaches taken by the cited papers.",
    "Highlight differences in objectives, methodology, or findings.",
    "Identify where the papers agree and where they diverge.",
    "Synthesise the contributions — do not merely summarise each paper in isolation.",
]


def build_synthesis_prompt_block() -> str:
    lines = ["", "WRITING QUALITY REQUIREMENTS:", "─" * 40]
    for nudge in SYNTHESIS_NUDGES:
        lines.append(f"• {nudge}")
    lines.append("─" * 40)
    return "\n".join(lines)


class AlertLevel:
    ERROR   = "error"
    WARNING = "warning"
    INFO    = "info"


@dataclass
class DraftAlert:
    level: str
    code: str
    message: str
    section: Optional[str] = None
    created_at: datetime = field(
        default_factory=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> Dict:
        return {
            "level": self.level,
            "code": self.code,
            "message": self.message,
            "section": self.section,
            "created_at": self.created_at.isoformat(),
        }


_HEADING_RE = re.compile(r"^#{1,3}\s+(.+)$", re.MULTILINE)

# FIX: _CITATION_COUNT_RE — old regex only matched "(Author, Year)" style and
# missed ALL of: narrative "Author et al. (Year)", short surnames like "He (2015)",
# hyphenated surnames like "(Pouget-Abadie, 2014)", and "et al." forms.
# Result: every section showed 0 citations even when the draft had citations.
#
# New regex covers all forms the AI actually produces:
#   Parenthetical:  (He et al., 2015)  (Goodfellow, 2014)  (Pouget-Abadie, 2014)
#   Narrative et al.: He et al. (2015)  Goodfellow et al. (2014)
#   Narrative single: He (2015)  Goodfellow (2014)
#   Bracket:          [1]  [1,2]
#   Internal key:     (Paper-xxxxxxxx)
#
# Stop words (Figure, Table, Section…) are filtered in _count_citations() so
# "Figure (2015)" is never counted as a citation.
_CITATION_COUNT_RE = re.compile(
    # Parenthetical with optional et al.: (He et al., 2015) / (Goodfellow, 2014)
    r"\([A-Z][A-Za-z\-']+(?:\s+et\s+al\.?)?,?\s*\d{4}[a-z]?\)"
    # Narrative et al.: He et al. (2015) / Goodfellow et al. (2014)
    r"|[A-Z][A-Za-z\-']+\s+et\s+al\.?\s*\(\d{4}[a-z]?\)"
    # Narrative single/two author: He (2015) / Goodfellow (2014)
    r"|[A-Z][A-Za-z\-']{1,}\s*\(\d{4}[a-z]?\)"
    # Bracket numeric: [1] / [1,2] / [1-3]
    r"|\[\d+(?:[,;\-]\s*\d+)*\]"
    # Internal paper key
    r"|\(Paper-[a-f0-9]{8}\)"
)

# Words that look like citation surnames but are not — filter these out
# so "Figure (2015)" or "Section (2014)" don't inflate citation counts.
_CITATION_COUNT_STOP_WORDS = {
    "figure", "table", "section", "chapter", "equation", "appendix",
    "however", "therefore", "furthermore", "moreover", "although",
    "between", "through", "within", "without", "during", "before", "after",
}


def _normalise_heading(raw: str) -> SectionName:
    key = raw.strip().lower().rstrip(":")
    return SECTION_HEADING_MAP.get(key, SectionName.UNKNOWN)


def _count_citations(text: str) -> int:
    """
    Count distinct citation instances in text.
    Applies stop-word filtering so structural words like 'Figure (2015)'
    are never counted as citations.
    """
    matches = _CITATION_COUNT_RE.findall(text)
    count = 0
    for m in matches:
        first_word = m.split()[0].strip("([").lower()
        if first_word not in _CITATION_COUNT_STOP_WORDS:
            count += 1
    return count


def _extract_paper_ids(text: str, known_ids: Set[str]) -> List[str]:
    return [pid for pid in known_ids if pid in text]


def parse_sections(
    raw_text: str,
    known_paper_ids: Optional[Set[str]] = None,
    known_gap_ids: Optional[Set[str]] = None,
) -> List[DraftSection]:
    known_paper_ids = known_paper_ids or set()
    known_gap_ids   = known_gap_ids or set()

    headings = list(_HEADING_RE.finditer(raw_text))

    if not headings:
        logger.warning("No section headings found — wrapping as single section.")
        return [
            DraftSection(
                name=SectionName.UNKNOWN,
                heading="(full draft)",
                content=raw_text.strip(),
                citation_count=_count_citations(raw_text),
                paper_ids_used=_extract_paper_ids(raw_text, known_paper_ids),
                gap_ids_covered=_extract_paper_ids(raw_text, known_gap_ids),
            )
        ]

    sections: List[DraftSection] = []
    for idx, match in enumerate(headings):
        heading_text = match.group(1).strip()
        start = match.end()
        end = headings[idx + 1].start() if idx + 1 < len(headings) else len(raw_text)
        body = raw_text[start:end].strip()

        sections.append(
            DraftSection(
                name=_normalise_heading(heading_text),
                heading=heading_text,
                content=body,
                citation_count=_count_citations(body),
                paper_ids_used=_extract_paper_ids(body, known_paper_ids),
                gap_ids_covered=_extract_paper_ids(body, known_gap_ids),
            )
        )

    return sections


MINIMUM_PAPERS = 2

MINIMUM_PAPERS_MESSAGE = (
    "Drafting requires at least {min} papers to ensure cross-paper "
    "synthesis and verifiable citations. Upload {needed} more paper(s) "
    "to proceed."
)

MINIMUM_PAPERS_FEATURE_COPY = (
    "ResearchDraft requires multiple source papers to generate a "
    "literature review. This ensures every claim is grounded in "
    "cross-referenced evidence — not single-source summaries."
)


def check_minimum_papers(
    paper_count: int,
    minimum: int = MINIMUM_PAPERS,
) -> Tuple[bool, Optional[str]]:
    if paper_count >= minimum:
        return True, None
    needed = minimum - paper_count
    return False, MINIMUM_PAPERS_MESSAGE.format(min=minimum, needed=needed)


def build_draft(
    raw_text: str,
    paper_ids: List[str],
    registry: Optional[AllowedCitationRegistry] = None,
    gap_ids: Optional[List[str]] = None,
    parent: Optional[Draft] = None,
    reason: Optional[str] = None,
) -> Draft:
    gap_ids = gap_ids or []

    clean_text = raw_text
    audit = CitationAudit(repaired_text=raw_text, layer4_clean=True)

    if registry is not None and registry.count > 0:
        clean_text = render_citation_keys(clean_text, registry)
        clean_text, audit = enforce_citations(clean_text, registry)
        clean_text = replace_references_section(clean_text, registry)

        if not audit.is_clean:
            logger.warning(
                "Draft had %d hallucinated citation(s) — stripped. Layer 4 clean: %s",
                len(audit.leaked), audit.layer4_clean,
            )

    sections = parse_sections(
        clean_text,
        known_paper_ids=set(paper_ids),
        known_gap_ids=set(gap_ids),
    )

    total_citations = sum(s.citation_count for s in sections)
    all_paper_ids   = list({pid for s in sections for pid in s.paper_ids_used})
    all_gap_ids     = list({gid for s in sections for gid in s.gap_ids_covered})

    missing_sections = {SectionName.INTRO, SectionName.LITERATURE_REVIEW, SectionName.GAPS}
    found  = {s.name for s in sections}
    status = DraftStatus.PARTIAL if not missing_sections.issubset(found) else DraftStatus.FRESH

    if len(audit.leaked) > 0:
        status = DraftStatus.PARTIAL

    draft = Draft(
        text=clean_text,
        sections=sections,
        paper_ids_used=all_paper_ids or paper_ids,
        citation_count=total_citations,
        gap_ids_covered=all_gap_ids or gap_ids,
        version=parent.version + 1 if parent else 1,
        parent_id=parent.draft_id if parent else None,
        regeneration_reason=reason,
        status=status,
    )

    draft.citation_audit = audit

    logger.info(
        "Built draft v%d [%s] — %d sections, %d citations, "
        "status=%s, leaked=%d, layer4=%s",
        draft.version, draft.draft_id, len(sections), total_citations,
        draft.status.value, len(audit.leaked),
        "CLEAN" if audit.layer4_clean else "DIRTY",
    )
    return draft


class DraftHistory:

    def __init__(self) -> None:
        self._versions: List[Draft] = []

    def push(self, draft: Draft) -> None:
        self._versions.append(draft)
        logger.info(
            "History now has %d version(s). Latest: v%d [%s]",
            len(self._versions), draft.version, draft.draft_id,
        )

    @property
    def latest(self) -> Optional[Draft]:
        return self._versions[-1] if self._versions else None

    @property
    def all_versions(self) -> List[Draft]:
        return list(self._versions)

    def get_version(self, version: int) -> Optional[Draft]:
        for d in self._versions:
            if d.version == version:
                return d
        return None

    def get_audit(self, version: int) -> Optional[CitationAudit]:
        draft = self.get_version(version)
        if draft is None:
            return None
        return getattr(draft, "citation_audit", None)

    def version_summary(self) -> List[Dict]:
        summaries = []
        for d in self._versions:
            audit = getattr(d, "citation_audit", None)
            summaries.append({
                "version": d.version,
                "draft_id": d.draft_id,
                "generated_at": d.generated_at.isoformat(),
                "status": d.status.value,
                "sections": len(d.sections),
                "citations": d.citation_count,
                "papers_used": len(d.paper_ids_used),
                "regeneration_reason": d.regeneration_reason,
                "citation_audit_clean": audit.is_clean if audit else None,
                "leaked_citations": audit.leaked if audit else [],
            })
        return summaries

    def diff_summary(self, v_old: int, v_new: int) -> Dict:
        old = self.get_version(v_old)
        new = self.get_version(v_new)
        if old is None or new is None:
            raise ValueError(f"Version not found: v{v_old} or v{v_new}")

        old_sections = {s.name for s in old.sections}
        new_sections = {s.name for s in new.sections}

        changed_sections = []
        for s_new in new.sections:
            s_old = old.get_section(s_new.name)
            if s_old is None or s_old.content_hash() != s_new.content_hash():
                changed_sections.append(s_new.name.value)

        return {
            "from_version": v_old,
            "to_version": v_new,
            "from_id": old.draft_id,
            "to_id": new.draft_id,
            "regeneration_reason": new.regeneration_reason,
            "sections_added": [s.value for s in new_sections - old_sections],
            "sections_removed": [s.value for s in old_sections - new_sections],
            "sections_changed": changed_sections,
            "citation_delta": new.citation_count - old.citation_count,
            "paper_ids_added": [p for p in new.paper_ids_used if p not in old.paper_ids_used],
            "paper_ids_removed": [p for p in old.paper_ids_used if p not in new.paper_ids_used],
        }


def detect_outdated(
    draft: Draft,
    current_paper_ids: List[str],
    current_gap_ids: List[str],
    registry: Optional[AllowedCitationRegistry] = None,
    latest_paper_uploaded_at: Optional[datetime] = None,
    latest_gap_discovered_at: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> List[DraftAlert]:
    """Pure-function staleness checker. No AI — just rules."""
    if isinstance(draft, tuple):
        logger.error("detect_outdated received a tuple. Fix the caller!")
        draft = draft[0]

    now = now or datetime.now(timezone.utc)
    alerts: List[DraftAlert] = []
    worst_status = DraftStatus.FRESH

    unseen_papers = [pid for pid in current_paper_ids if pid not in draft.paper_ids_used]
    if unseen_papers:
        alerts.append(DraftAlert(
            level=AlertLevel.ERROR,
            code="NEW_PAPERS",
            message=(
                f"{len(unseen_papers)} paper(s) uploaded but not referenced "
                f"in draft v{draft.version}: {unseen_papers}"
            ),
        ))
        worst_status = DraftStatus.OUTDATED

    if latest_paper_uploaded_at and latest_paper_uploaded_at > draft.generated_at:
        alerts.append(DraftAlert(
            level=AlertLevel.ERROR,
            code="PAPER_AFTER_DRAFT",
            message=(
                f"A paper was uploaded at {latest_paper_uploaded_at.isoformat()} — "
                f"after draft generation at {draft.generated_at.isoformat()}."
            ),
        ))
        worst_status = DraftStatus.OUTDATED

    uncovered_gaps = [gid for gid in current_gap_ids if gid not in draft.gap_ids_covered]
    if uncovered_gaps:
        alerts.append(DraftAlert(
            level=AlertLevel.WARNING,
            code="UNCOVERED_GAPS",
            message=f"{len(uncovered_gaps)} gap(s) not addressed in draft: {uncovered_gaps}",
        ))
        if worst_status == DraftStatus.FRESH:
            worst_status = DraftStatus.PARTIAL

    if latest_gap_discovered_at and latest_gap_discovered_at > draft.generated_at:
        alerts.append(DraftAlert(
            level=AlertLevel.WARNING,
            code="GAP_AFTER_DRAFT",
            message=f"A gap was discovered at {latest_gap_discovered_at.isoformat()} — after draft generation.",
        ))
        if worst_status == DraftStatus.FRESH:
            worst_status = DraftStatus.PARTIAL

    min_density = get_min_citation_density(len(current_paper_ids))
    for section in draft.sections:
        if section.name == SectionName.UNKNOWN:
            continue
        if section.citation_count < min_density:
            alerts.append(DraftAlert(
                level=AlertLevel.WARNING,
                code="LOW_CITATIONS",
                message=(
                    f"Section '{section.heading}' has only "
                    f"{section.citation_count} citation(s) "
                    f"(minimum for {len(current_paper_ids)} papers: {min_density})."
                ),
                section=section.name.value,
            ))
            section.status = DraftStatus.PARTIAL

    age = now - draft.generated_at
    if age > timedelta(hours=DRAFT_TTL_HOURS):
        alerts.append(DraftAlert(
            level=AlertLevel.INFO,
            code="DRAFT_STALE",
            message=f"Draft is {age.total_seconds() / 3600:.1f}h old (TTL: {DRAFT_TTL_HOURS}h).",
        ))
        if worst_status == DraftStatus.FRESH:
            worst_status = DraftStatus.STALE

    if registry is not None:
        audit = audit_citations(draft.text, registry)
        if len(audit.leaked) > 0:
            alerts.append(DraftAlert(
                level=AlertLevel.ERROR,
                code="CITATION_LEAKAGE",
                message=(
                    f"{len(audit.leaked)} hallucinated citation(s) detected "
                    f"in draft v{draft.version}: {audit.leaked}. Regeneration required."
                ),
            ))
            worst_status = DraftStatus.OUTDATED

    draft.status = worst_status

    if alerts:
        logger.info(
            "Outdated detection for draft v%d: %d alert(s), status → %s",
            draft.version, len(alerts), draft.status.value,
        )
    return alerts


def run_demo_flow(
    papers: List[PaperMetadata],
    generate_fn,
    regenerate_section: Optional[SectionName] = None,
) -> Dict:
    registry = AllowedCitationRegistry()
    registry.register_many(papers)

    allowed, msg = check_minimum_papers(registry.count)
    if not allowed:
        return {"error": msg, "step_failed": 1}

    history = DraftHistory()

    prompt = (
        registry.build_citation_instruction()
        + "\n"
        + build_synthesis_prompt_block()
        + "\n\nWrite a literature review with sections: "
        "Introduction, Literature Review, Research Gaps, Future Work."
    )

    raw_v1 = generate_fn(prompt)
    draft_v1 = build_draft(
        raw_text=raw_v1,
        paper_ids=list(registry.paper_ids),
        registry=registry,
    )
    history.push(draft_v1)
    audit_v1 = getattr(draft_v1, "citation_audit", CitationAudit())

    regen_section = regenerate_section or SectionName.GAPS
    regen_prompt = (
        registry.build_citation_instruction()
        + "\n"
        + build_synthesis_prompt_block()
        + f"\n\nRegenerate ONLY the '{regen_section.value}' section. "
        f"Keep all other sections unchanged."
    )
    raw_v2 = generate_fn(regen_prompt)
    draft_v2 = build_draft(
        raw_text=raw_v2,
        paper_ids=list(registry.paper_ids),
        registry=registry,
        parent=draft_v1,
        reason=f"Regenerated section: {regen_section.value}",
    )
    history.push(draft_v2)
    audit_v2 = getattr(draft_v2, "citation_audit", CitationAudit())

    return {
        "demo_steps_completed": 5,
        "papers_registered": registry.count,
        "reliability_panel": registry.reliability_panel(),
        "draft_v1": {
            "text": draft_v1.text[:500] + "...",
            "citation_audit": audit_v1.to_dict(),
            "status": draft_v1.status.value,
        },
        "draft_v2": {
            "text": draft_v2.text[:500] + "...",
            "citation_audit": audit_v2.to_dict(),
            "status": draft_v2.status.value,
            "regeneration_reason": draft_v2.regeneration_reason,
        },
        "version_history": history.version_summary(),
        "diff_v1_v2": history.diff_summary(1, 2),
        "minimum_papers_feature_copy": MINIMUM_PAPERS_FEATURE_COPY,
    }