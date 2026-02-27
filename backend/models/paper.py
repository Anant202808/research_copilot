"""Paper data model — lightweight in-memory store for the MVP."""

import uuid
from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any


@dataclass
class Citation:
    id: str
    title: str
    authors: List[str]
    year: int
    journal: str
    volume: Optional[str] = None
    issue: Optional[str] = None
    pages: Optional[str] = None
    doi: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PaperSummary:
    overview: str = ""
    findings: List[str] = field(default_factory=list)
    methodology: str = ""
    limitations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Paper:
    id: str
    title: str
    authors: List[str]
    year: int
    abstract: str
    full_text: str
    summary: PaperSummary = field(default_factory=PaperSummary)
    citations: List[Citation] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    file_path: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Drop the potentially huge full_text from list views
        d.pop("full_text", None)
        d.pop("file_path", None)
        return d

    def to_full_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d.pop("file_path", None)
        return d

    @staticmethod
    def generate_id() -> str:
        return str(uuid.uuid4())


class PaperStore:
    """Thread-safe-ish in-memory paper store (good enough for MVP / single-process)."""

    def __init__(self) -> None:
        self._papers: Dict[str, Paper] = {}

    # ---------- CRUD ----------
    def add(self, paper: Paper) -> Paper:
        self._papers[paper.id] = paper
        return paper

    def get(self, paper_id: str) -> Optional[Paper]:
        return self._papers.get(paper_id)

    def get_all(self) -> List[Paper]:
        return list(self._papers.values())

    def delete(self, paper_id: str) -> bool:
        return self._papers.pop(paper_id, None) is not None

    def count(self) -> int:
        return len(self._papers)

    # ---------- Helpers ----------
    def get_multiple(self, paper_ids: List[str]) -> List[Paper]:
        return [p for pid in paper_ids if (p := self._papers.get(pid)) is not None]


# Singleton store used across the app
paper_store = PaperStore()
