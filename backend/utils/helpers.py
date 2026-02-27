"""Miscellaneous helper functions."""

import os
import re
from typing import List


def ensure_dir(path: str) -> None:
    """Create directory if it doesn't exist."""
    os.makedirs(path, exist_ok=True)


def extract_title_heuristic(text: str) -> str:
    """Try to pull the paper title from the first few lines of extracted text."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return "Untitled Paper"

    for line in lines[:10]:
        if len(line) < 10:
            continue
        if re.match(r"^(arXiv|http|doi|page|\d+$)", line, re.IGNORECASE):
            continue
        return line[:200]

    return lines[0][:200]


def extract_year_heuristic(text: str) -> int:
    """
    Find the most likely publication year (2000-2099).
    Strategy:
      1. Look for explicit patterns like 'Published YYYY' / 'YYYY' near
         known publication markers.
      2. Among all years in the header, prefer ones near keywords like
         'published', 'submitted', 'conference', 'journal', 'proceedings'.
      3. Fall back to the most-frequently-occurring year.
      4. Default 2024.
    """
    header = text[:4000]

    # 1. Explicit publication markers
    pub_pattern = re.search(
        r"(?:published|accepted|submitted|presented|proceedings|conference|journal|©|copyright)"
        r"[^\n]{0,50}?(20\d{2})",
        header, re.IGNORECASE
    )
    if pub_pattern:
        return int(pub_pattern.group(1))

    # 2. arXiv date pattern e.g. "arXiv:1512.03385v1 [cs.CV] 10 Dec 2015"
    arxiv_date = re.search(r"arXiv:[^\n]+?(20\d{2})", header, re.IGNORECASE)
    if arxiv_date:
        return int(arxiv_date.group(1))

    # 3. All years found — pick most frequent (ties → earliest)
    all_years = re.findall(r"\b(20\d{2})\b", header)
    if all_years:
        freq: dict = {}
        for y in all_years:
            freq[y] = freq.get(y, 0) + 1
        best = sorted(freq.items(), key=lambda x: (-x[1], x[0]))
        return int(best[0][0])

    return 2024


def extract_authors_heuristic(text: str) -> List[str]:
    """
    Best-effort author extraction from the first section of text.

    FIX: The previous version failed on papers like the GAN paper where
    the author line is:

        "Ian Goodfellow∗, Jean Pouget-Abadie∗, Mehdi Mirza, ..."

    The superscript asterisks and numbers were not stripped before splitting,
    so "Goodfellow∗" failed the _looks_like_name() check and the entire
    first author was dropped from the result.

    Fix: aggressive pre-cleaning of superscript characters (unicode and ASCII)
    before any name parsing, plus a dedicated unicode-superscript strip pass.

    Also handles:
      - Comma/semicolon separated: "Ian Goodfellow, Yoshua Bengio"
      - Space-only on one line: "Kaiming He Xiangyu Zhang Shaoqing Ren"
      - Superscript-number stripped: "John Smith1, Jane Doe2"
      - "et al." shorthand in the header
    """
    header = text[:3000]
    lines = [l.strip() for l in header.split("\n") if l.strip()]

    # Unicode superscript digits and common footnote symbols
    _SUPERSCRIPT_RE = re.compile(
        r"[⁰¹²³⁴⁵⁶⁷⁸⁹ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻ\*†‡§∗]+"
    )

    def _clean_line(line: str) -> str:
        """Strip superscripts, footnote markers, and affiliation numbers."""
        line = _SUPERSCRIPT_RE.sub("", line)
        # ASCII superscript digits glued to word ends: "Goodfellow1" → "Goodfellow"
        line = re.sub(r"(?<=[a-zA-Z])[\d]+", "", line)
        return line.strip()

    def _looks_like_name(word: str) -> bool:
        """True if word looks like part of a human name."""
        word = re.sub(r"[\d,;.*†‡§∗]", "", word).strip()
        return bool(word) and re.match(r"^[A-ZÀ-Ÿ][a-zA-Zà-ÿ\.\-']{1,}$", word)

    def _clean_name_part(part: str) -> str:
        """Strip trailing superscript digits/symbols from a name segment."""
        part = _SUPERSCRIPT_RE.sub("", part)
        return re.sub(r"[\d\*†‡§∗,\.]+$", "", part).strip()

    # ── Pass 1: comma/semicolon separated lines ───────────────────────────────
    for line in lines[1:8]:
        if len(line) < 5 or "@" in line or re.match(r"^\d", line):
            continue
        cleaned = _clean_line(line)
        # Remove remaining affiliation markers
        cleaned = re.sub(r"[\d\*†‡§∗]+", " ", cleaned)
        parts = [_clean_name_part(p) for p in re.split(r"[,;]", cleaned) if p.strip()]
        if len(parts) >= 2:
            names = []
            for part in parts:
                words = part.split()
                if 1 <= len(words) <= 5 and all(_looks_like_name(w) for w in words):
                    names.append(part.strip())
            if len(names) >= 2:
                return names

    # ── Pass 2: space-separated capitalized words on a single line ────────────
    # e.g. "Kaiming He   Xiangyu Zhang   Shaoqing Ren   Jian Sun"
    for line in lines[1:8]:
        if "@" in line or len(line) < 5:
            continue
        cleaned = _clean_line(line)
        cleaned = re.sub(r"[\d\*†‡§∗]", "", cleaned).strip()
        words = cleaned.split()
        if len(words) >= 4 and all(_looks_like_name(w) for w in words):
            names = []
            current = []
            for w in words:
                if current and w[0].isupper() and len(current) >= 2:
                    names.append(" ".join(current))
                    current = [w]
                else:
                    current.append(w)
            if current:
                names.append(" ".join(current))
            if len(names) >= 2:
                return names

    # ── Pass 3: look for "Author(s):" label ───────────────────────────────────
    author_label = re.search(
        r"(?:authors?|by)[:\s]+([A-Z][^\n]{5,80})", header, re.IGNORECASE
    )
    if author_label:
        raw = _clean_line(author_label.group(1))
        parts = [_clean_name_part(p) for p in re.split(r"[,;&]", raw) if p.strip()]
        names = [p for p in parts if 1 <= len(p.split()) <= 5]
        if names:
            return names

    # ── Pass 4: et al. shorthand ──────────────────────────────────────────────
    etal = re.search(r"([A-Z][a-z]+)\s+et\s+al", header)
    if etal:
        return [f"{etal.group(1)} et al."]

    return ["Unknown Author"]


def extract_abstract_heuristic(text: str) -> str:
    """Try to extract the abstract section."""
    match = re.search(
        r"(?:^|\n)\s*Abstract[:\s]*\n?(.*?)(?:\n\s*(?:1\.?\s*Introduction|Keywords|I\.\s))",
        text[:5000],
        re.IGNORECASE | re.DOTALL,
    )
    if match:
        abstract = match.group(1).strip()
        abstract = re.sub(r"\s+", " ", abstract)
        return abstract[:1000]

    lines = text.split("\n")
    body = " ".join(l.strip() for l in lines[5:20] if l.strip())
    return body[:500] if body else "Abstract not available."


def clean_text(text: str) -> str:
    """Basic text cleaning: collapse whitespace, remove control chars."""
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()