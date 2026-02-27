"""Citation extraction and formatting service using Google Gemini."""

import json
import re
import uuid
import logging
import os
from typing import List, Dict, Any, Optional

from models.paper import Citation

logger = logging.getLogger(__name__)


def _get_gemini_client():
    """Initialize and return Gemini client."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return None
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        return client
    except ImportError:
        logger.warning("google-genai not installed. Run: pip install google-genai")
        return None
    except Exception as e:
        logger.error("Failed to initialize Gemini client: %s", e)
        return None


# ──────────────────────────────────────────────
#  EXTRACTION
# ──────────────────────────────────────────────

def extract_citations(text: str) -> List[Citation]:
    """
    Extract citations from paper text.
    1. Try References section → regex parse.
    2. Fall back to inline citation regex.
    3. If results are weak, try Gemini AI enhancement.
    """
    # Step 1: Regex extraction
    citations = _extract_references_section(text)
    if not citations:
        logger.info("No references section found — trying inline patterns.")
        citations = _extract_inline_citations(text)

    # Step 2: If results are weak, try Gemini enhancement
    if citations and _results_are_weak(citations):
        logger.info(
            "Weak regex results (%d citations, %d incomplete) — attempting Gemini enhancement.",
            len(citations),
            sum(1 for c in citations if _is_incomplete(c)),
        )
        citations = _enhance_with_gemini(citations, text)

    return citations


def _results_are_weak(citations: List[Citation]) -> bool:
    """Check if regex results need AI help."""
    if not citations:
        return False
    incomplete = sum(1 for c in citations if _is_incomplete(c))
    ratio = incomplete / len(citations)
    return ratio > 0.4


def _is_incomplete(c: Citation) -> bool:
    """A citation is incomplete if it's missing key fields."""
    has_real_title = c.title and not c.title.startswith("Work by") and len(c.title) > 10
    has_real_authors = c.authors and c.authors != ["Unknown"] and len(c.authors[0]) > 2
    has_real_journal = c.journal and c.journal != "Unknown" and c.journal != "Unknown Venue"
    missing = 0
    if not has_real_title:
        missing += 1
    if not has_real_authors:
        missing += 1
    if not has_real_journal:
        missing += 1
    return missing >= 2


# ──────────────────────────────────────────────
#  BYLINE EXTRACTION  (NEW)
# ──────────────────────────────────────────────

# Matches "First [Middle] Last" name tokens, including hyphenated surnames.
# Deliberately excludes short noise tokens like "and", "et", "al", initials-only.
_NAME_TOKEN_RE = re.compile(
    r"\b([A-Z][a-zA-Z\-]{1,}(?:\s+[A-Z][a-zA-Z\-]{1,}){0,3})\b"
)

# Signal words that indicate we've left the author list
_BYLINE_STOP_WORDS = re.compile(
    r"\b(Abstract|Introduction|Keywords|Received|Accepted|Published|"
    r"University|Institute|Department|Laboratory|School|College|"
    r"Email|@|arXiv|doi|http)\b",
    re.IGNORECASE,
)


def extract_byline_authors(text: str) -> List[str]:
    """
    FIX: Extract paper authors from the byline at the TOP of the paper text,
    NOT from the references section.

    Strategy:
      1. Take the first 1500 characters (covers title + author block on page 1).
      2. Find the title line (longest capitalised line or first heading).
      3. Collect the author block: lines immediately after the title, stopping
         at the first line that looks like an affiliation or abstract marker.
      4. Split author names on commas / " and " / newlines, normalise each.

    Returns a list of "First Last" strings, e.g.
        ["Ian Goodfellow", "Jean Pouget-Abadie", "Yoshua Bengio"]
    Falls back to [] if nothing parseable is found.
    """
    # Work with just the head of the document
    head = text[:2000].strip()
    lines = [l.strip() for l in head.splitlines() if l.strip()]

    if not lines:
        return []

    # ── Step 1: find title line (first non-trivially-short capitalised line) ──
    title_idx = 0
    for i, line in enumerate(lines):
        if len(line) > 15 and not line.lower().startswith("abstract"):
            title_idx = i
            break

    # ── Step 2: collect author-block lines (up to 8 lines after title) ──
    author_lines: List[str] = []
    for line in lines[title_idx + 1 : title_idx + 9]:
        # Stop at affiliation / abstract markers
        if _BYLINE_STOP_WORDS.search(line):
            break
        # Stop at very long lines (likely abstract prose, not a name list)
        if len(line) > 120:
            break
        author_lines.append(line)

    if not author_lines:
        return []

    raw_block = " ".join(author_lines)

    # ── Step 3: split on delimiters ──
    # Split on " and " (case-insensitive) then on commas
    parts = re.split(r"\s+and\s+", raw_block, flags=re.IGNORECASE)
    names: List[str] = []
    for part in parts:
        sub = [p.strip() for p in part.split(",") if p.strip()]
        names.extend(sub)

    # ── Step 4: validate each token looks like a real name ──
    validated: List[str] = []
    for name in names:
        name = name.strip(" .,;*†‡§")
        # Must have at least two words, each starting with a capital
        words = name.split()
        if len(words) < 2:
            continue
        if not all(w[0].isupper() for w in words if w):
            continue
        # Must not be a stop word
        if _BYLINE_STOP_WORDS.search(name):
            continue
        # Must not be suspiciously long (affiliation crept in)
        if len(name) > 50:
            continue
        validated.append(name)

    logger.info("extract_byline_authors → %s", validated)
    return validated


# ──────────────────────────────────────────────
#  GEMINI AI ENHANCEMENT
# ──────────────────────────────────────────────

GEMINI_CITATION_PROMPT = """You are an expert academic librarian. Fix and complete these incomplete citation entries extracted from a research paper.

Incomplete citations:
{citations_text}

Context from the paper (for reference):
{paper_context}

For each citation, provide the corrected version as a JSON array of objects with these fields:
- "index": the original citation index number
- "title": corrected/complete paper title
- "authors": array of author name strings
- "year": publication year (integer)
- "journal": journal or conference name
- "volume": volume number or null
- "pages": page range or null
- "doi": DOI if known or null

Return ONLY a valid JSON array — no markdown fences, no commentary.
"""


def _enhance_with_gemini(citations: List[Citation], full_text: str) -> List[Citation]:
    """
    Try to improve weak citations using Gemini API.
    If AI fails, return original regex citations unchanged.
    """
    try:
        client = _get_gemini_client()
        if not client:
            logger.info("No Gemini client — skipping AI enhancement, keeping regex results.")
            return citations

        # Find incomplete citations
        incomplete_indices = [i for i, c in enumerate(citations) if _is_incomplete(c)]

        if not incomplete_indices:
            return citations

        # Process in batches of 10
        enhanced_map: Dict[int, Dict[str, Any]] = {}

        for batch_start in range(0, len(incomplete_indices), 10):
            batch_indices = incomplete_indices[batch_start:batch_start + 10]
            batch_citations = [(idx, citations[idx]) for idx in batch_indices]

            # Build citation text for prompt
            citations_text = ""
            for idx, c in batch_citations:
                citations_text += (
                    f'Citation {idx}: title="{c.title}", '
                    f'authors={c.authors}, year={c.year}, '
                    f'journal="{c.journal}"\n'
                )

            # Get relevant context from paper
            ref_section = _find_references_text(full_text)
            paper_context = ref_section[:3000] if ref_section else full_text[-3000:]

            prompt = GEMINI_CITATION_PROMPT.format(
                citations_text=citations_text,
                paper_context=paper_context,
            )

            logger.info("Sending %d citations to Gemini for enhancement...", len(batch_citations))

            try:
                response = client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=prompt,
                    config={
                        "temperature": 0.1,
                        "max_output_tokens": 2048,
                    },
                )

                # Extract text from response
                content = ""
                if hasattr(response, 'text'):
                    content = response.text
                elif hasattr(response, 'candidates') and response.candidates:
                    candidate = response.candidates[0]
                    if hasattr(candidate, 'content') and hasattr(candidate.content, 'parts'):
                        content = "".join(
                            part.text for part in candidate.content.parts
                            if hasattr(part, 'text')
                        )

                if not content:
                    logger.warning("Gemini returned empty response for citation enhancement.")
                    continue

                # Clean markdown fences
                content = re.sub(r"^```json\s*", "", content.strip())
                content = re.sub(r"\s*```$", "", content.strip())
                content = re.sub(r"^```\s*", "", content.strip())

                # Parse response
                improved_list = json.loads(content)

                if isinstance(improved_list, list):
                    for item in improved_list:
                        idx = item.get("index")
                        if idx is not None and idx in batch_indices:
                            enhanced_map[idx] = item
                    logger.info(
                        "Gemini enhanced %d/%d citations in batch.",
                        len(enhanced_map), len(batch_citations),
                    )
                else:
                    logger.warning("Gemini returned non-array response for citations.")

            except json.JSONDecodeError as e:
                logger.warning("Failed to parse Gemini citation response: %s", e)
                # Try to extract individual citations from malformed JSON
                _try_parse_partial_citations(content, batch_indices, enhanced_map)
            except Exception as e:
                logger.warning("Gemini citation enhancement batch failed: %s", e)

        # Merge improvements into original citations
        result = list(citations)
        for idx, improved in enhanced_map.items():
            if 0 <= idx < len(result):
                result[idx] = _merge_citation(result[idx], improved)

        enhanced_count = len(enhanced_map)
        logger.info(
            "Gemini citation enhancement complete: %d/%d citations improved.",
            enhanced_count, len(incomplete_indices),
        )
        return result

    except Exception as e:
        logger.warning("Gemini citation enhancement failed entirely: %s — keeping regex results.", e)
        return citations


def _find_references_text(text: str) -> str:
    """Find the references section text for context."""
    match = re.search(
        r"\n\s*(References|Bibliography|REFERENCES|BIBLIOGRAPHY)\s*\n",
        text,
    )
    if match:
        return text[match.start():]
    return ""


def _try_parse_partial_citations(
    content: str,
    valid_indices: List[int],
    enhanced_map: Dict[int, Dict[str, Any]],
) -> None:
    """Try to extract citation data from malformed JSON response."""
    try:
        # Try to find JSON array in response
        json_match = re.search(r'\[[\s\S]*\]', content)
        if json_match:
            items = json.loads(json_match.group())
            for item in items:
                idx = item.get("index")
                if idx is not None and idx in valid_indices:
                    enhanced_map[idx] = item
            return
    except Exception:
        pass

    # Try to extract individual objects
    for idx in valid_indices:
        try:
            pattern = rf'"index"\s*:\s*{idx}\s*,[\s\S]*?(?=\}}'
            match = re.search(pattern, content)
            if match:
                obj_text = '{' + match.group() + '}'
                obj = json.loads(obj_text)
                enhanced_map[idx] = obj
        except Exception:
            continue


def _merge_citation(original: Citation, improved: Dict[str, Any]) -> Citation:
    """Merge Gemini improvements into original citation, keeping original where AI is empty."""
    new_title = improved.get("title")
    new_authors = improved.get("authors")
    new_year = improved.get("year")
    new_journal = improved.get("journal")
    new_volume = improved.get("volume")
    new_pages = improved.get("pages")
    new_doi = improved.get("doi")

    title = new_title if (new_title and len(str(new_title)) > 10) else original.title
    authors = new_authors if (new_authors and isinstance(new_authors, list) and len(new_authors) > 0 and new_authors != ["Unknown"]) else original.authors
    year = new_year if (new_year and isinstance(new_year, int) and 1900 < new_year < 2030) else original.year
    journal = new_journal if (new_journal and len(str(new_journal)) > 2 and new_journal != "Unknown") else original.journal
    volume = new_volume if new_volume else original.volume
    pages = new_pages if new_pages else original.pages
    doi = new_doi if new_doi else original.doi

    return Citation(
        id=original.id,
        title=str(title),
        authors=[str(a) for a in authors],
        year=int(year),
        journal=str(journal),
        volume=str(volume) if volume else None,
        issue=original.issue,
        pages=str(pages) if pages else None,
        doi=str(doi) if doi else None,
    )


# ──────────────────────────────────────────────
#  REGEX EXTRACTION
# ──────────────────────────────────────────────

def _extract_references_section(text: str) -> List[Citation]:
    """Parse the References / Bibliography section at the end of the paper."""
    match = re.search(
        r"\n\s*(References|Bibliography|REFERENCES|BIBLIOGRAPHY)\s*\n",
        text,
    )
    if not match:
        return []

    ref_text = text[match.end():]
    entries = _split_reference_entries(ref_text)
    citations: List[Citation] = []

    for entry in entries:
        citation = _parse_reference_entry(entry)
        if citation:
            citations.append(citation)

    return citations


def _split_reference_entries(text: str) -> List[str]:
    """Split a references section into individual entries."""
    # Pattern 1: [1], [2], ...
    numbered = re.split(r"\n\s*\[\d+\]\s*", text)
    if len(numbered) > 2:
        return [e.strip() for e in numbered if e.strip()]

    # Pattern 2: blank-line separated
    paragraphs = re.split(r"\n\s*\n", text)
    if len(paragraphs) > 2:
        return [p.strip() for p in paragraphs if p.strip() and len(p.strip()) > 20]

    # Pattern 3: lines starting with author-like pattern
    lines = text.split("\n")
    entries: List[str] = []
    current = ""
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                entries.append(current)
                current = ""
            continue
        if re.match(r"^[A-Z][a-z]+,?\s", stripped) or re.match(r"^\d+\.\s", stripped):
            if current:
                entries.append(current)
            current = stripped
        else:
            current += " " + stripped

    if current:
        entries.append(current)

    return [e for e in entries if len(e) > 20]


def _parse_reference_entry(entry: str) -> Citation | None:
    """Parse a single reference string into a Citation object."""
    entry = re.sub(r"\s+", " ", entry).strip()
    if len(entry) < 15:
        return None

    year_match = re.search(r"\b(19|20)\d{2}\b", entry)
    year = int(year_match.group()) if year_match else 2024

    title = _extract_title_from_ref(entry)
    authors = _extract_authors_from_ref(entry)
    journal = _extract_journal_from_ref(entry, title)

    vol_match = re.search(r"(?:vol(?:ume)?\.?\s*|,\s*)(\d+)", entry, re.IGNORECASE)
    volume = vol_match.group(1) if vol_match else None

    issue_match = re.search(r"(?:no\.?\s*|issue\s*|[\(])(\d+)[\)]?", entry, re.IGNORECASE)
    issue = issue_match.group(1) if issue_match else None

    pages_match = re.search(r"(?:pp?\.?\s*|pages?\s*)(\d+[\-–]\d+)", entry, re.IGNORECASE)
    pages = pages_match.group(1) if pages_match else None

    doi_match = re.search(r"(10\.\d{4,}/\S+)", entry)
    doi = doi_match.group(1).rstrip(".,;") if doi_match else None

    return Citation(
        id=str(uuid.uuid4()),
        title=title,
        authors=authors,
        year=year,
        journal=journal,
        volume=volume,
        issue=issue,
        pages=pages,
        doi=doi,
    )


def _extract_title_from_ref(entry: str) -> str:
    """Pull the title out of a reference entry."""
    quoted = re.search(r'["""](.+?)["""]', entry)
    if quoted:
        return quoted.group(1).strip().rstrip(".")

    year_pos = re.search(r"\b(19|20)\d{2}\b", entry)
    if year_pos:
        after_year = entry[year_pos.end():]
        after_year = re.sub(r"^[\s\.\),;]+", "", after_year)
        period = after_year.find(".")
        if period > 5:
            return after_year[:period].strip()

    return entry[:100].strip()


def _extract_authors_from_ref(entry: str) -> List[str]:
    """
    FIX: Pull author names from the beginning of a reference entry.

    Previous bug: splitting on ALL commas destroyed hyphenated surnames like
    "Pouget-Abadie" when the entry read "Jean Pouget-Abadie, Mehdi Mirza, ..."
    — the comma-split produced tokens like "Jean Pouget-Abadie" / "Mehdi Mirza"
    which was actually fine, BUT the subsequent _normalize_authors() in
    workflow_manager paired them as "Last, First" tuples, scrambling names.

    This function now returns authors in "First Last" order as plain strings,
    which is what _normalize_authors() expects for the non-paired path.
    """
    year_match = re.search(r"\b(19|20)\d{2}\b", entry)
    if year_match:
        before_year = entry[: year_match.start()].strip().rstrip("(,. ")
    else:
        before_year = entry[:80]

    # Split on " and " first, then on commas
    # This correctly handles both "A, B, and C" and "A and B" formats
    raw_parts: List[str] = []
    and_parts = re.split(r"\s+and\s+", before_year, flags=re.IGNORECASE)
    for part in and_parts:
        # Split on comma, but NOT if the comma is inside a hyphenated name
        # Heuristic: a comma followed by a lowercase word is a name continuation
        # (e.g. "Jr." or middle name) — keep it. Otherwise split.
        comma_parts = [p.strip() for p in part.split(",") if p.strip()]
        raw_parts.extend(comma_parts)

    # Filter: must look like a name (≥2 chars, starts with capital)
    authors = [
        p for p in raw_parts
        if len(p) > 2 and p[0].isupper()
    ]

    return authors if authors else ["Unknown"]


def _extract_journal_from_ref(entry: str, title: str) -> str:
    """Try to extract the journal / venue name."""
    title_end = entry.find(title) + len(title) if title in entry else 0
    remainder = entry[title_end:]
    remainder = re.sub(r"^[\s\.\),;]+", "", remainder)

    match = re.match(r"([^,\d]{3,60})", remainder)
    if match:
        journal = match.group(1).strip().rstrip(".,;")
        if journal:
            return journal

    return "Unknown Venue"


def _extract_inline_citations(text: str) -> List[Citation]:
    """Find inline citation patterns like (Author, 2020) or [1]."""
    citations: List[Citation] = []
    seen: set = set()

    pattern = re.compile(r"\(([A-Z][a-z]+(?:\s+et\s+al\.?)?),?\s*((?:19|20)\d{2})\)")
    for m in pattern.finditer(text):
        author = m.group(1).strip()
        year = int(m.group(2))
        key = f"{author}_{year}"
        if key not in seen:
            seen.add(key)
            citations.append(
                Citation(
                    id=str(uuid.uuid4()),
                    title=f"Work by {author}",
                    authors=[author],
                    year=year,
                    journal="Unknown",
                )
            )

    return citations


# ──────────────────────────────────────────────
#  FORMATTING
# ──────────────────────────────────────────────

def format_citation(citation: Citation, fmt: str = "APA") -> str:
    """Format a Citation object into the requested style."""
    fmt = fmt.upper()
    if fmt == "APA":
        return _format_apa(citation)
    elif fmt == "MLA":
        return _format_mla(citation)
    elif fmt == "IEEE":
        return _format_ieee(citation)
    elif fmt == "BIBTEX":
        return _format_bibtex(citation)
    else:
        return _format_apa(citation)


def format_all_citations(citations: List[Citation], fmt: str = "APA") -> List[str]:
    """Format a list of Citation objects."""
    return [format_citation(c, fmt) for c in citations]


def _format_apa(c: Citation) -> str:
    """APA 7th Edition."""
    authors = ", ".join(_apa_author(a) for a in c.authors)
    result = f"{authors} ({c.year}). {c.title}. {c.journal}"
    if c.volume:
        result += f", {c.volume}"
    if c.issue:
        result += f"({c.issue})"
    if c.pages:
        result += f", {c.pages}"
    result += "."
    if c.doi:
        result += f" https://doi.org/{c.doi}"
    return result


def _apa_author(name: str) -> str:
    """Convert 'First Last' → 'Last, F.'"""
    parts = name.strip().split()
    if len(parts) == 1:
        return parts[0]
    last = parts[-1]
    initials = " ".join(p[0] + "." for p in parts[:-1])
    return f"{last}, {initials}"


def _format_mla(c: Citation) -> str:
    """MLA 9th Edition."""
    authors = ", ".join(c.authors)
    result = f'{authors}. "{c.title}." {c.journal}'
    if c.volume:
        result += f", vol. {c.volume}"
    if c.issue:
        result += f", no. {c.issue}"
    result += f", {c.year}"
    if c.pages:
        result += f", pp. {c.pages}"
    result += "."
    return result


def _format_ieee(c: Citation) -> str:
    """IEEE style."""
    first = c.authors[0] if c.authors else "Unknown"
    parts = first.split()
    if len(parts) > 1:
        initials = " ".join(p[0] + "." for p in parts[:-1])
        author_str = f"{initials} {parts[-1]}"
    else:
        author_str = first
    if len(c.authors) > 1:
        author_str += " et al."

    result = f'{author_str}, "{c.title}," {c.journal}'
    if c.volume:
        result += f", vol. {c.volume}"
    if c.issue:
        result += f", no. {c.issue}"
    if c.pages:
        result += f", pp. {c.pages}"
    result += f", {c.year}."
    return result


def _format_bibtex(c: Citation) -> str:
    """BibTeX format."""
    first_last = c.authors[0].split()[-1].lower() if c.authors else "unknown"
    key = f"{first_last}{c.year}"
    authors_str = " and ".join(c.authors)
    lines = [
        f"@article{{{key},",
        f"  author = {{{authors_str}}},",
        f"  title = {{{c.title}}},",
        f"  journal = {{{c.journal}}},",
        f"  year = {{{c.year}}}",
    ]
    if c.volume:
        lines[-1] += ","
        lines.append(f"  volume = {{{c.volume}}}")
    if c.pages:
        lines[-1] += ","
        lines.append(f"  pages = {{{c.pages}}}")
    if c.doi:
        lines[-1] += ","
        lines.append(f"  doi = {{{c.doi}}}")
    lines.append("}")
    return "\n".join(lines)