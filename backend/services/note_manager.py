"""
Note Manager Service
Handles all CRUD operations for research notes.
Notes can be linked to papers, citations, or be standalone.
"""

import json
import os
import uuid
from datetime import datetime
from typing import Optional

# In-memory store (replace with SQLite/DB in production)
_notes_store: dict = {}

NOTES_FILE = "notes_data.json"


def _load_notes():
    """Load notes from JSON file (persistent storage)."""
    global _notes_store
    if os.path.exists(NOTES_FILE):
        with open(NOTES_FILE, "r") as f:
            _notes_store = json.load(f)
    else:
        _notes_store = {}


def _save_notes():
    """Persist notes to JSON file."""
    with open(NOTES_FILE, "w") as f:
        json.dump(_notes_store, f, indent=2)


# Load on startup
_load_notes()


def create_note(
    content: str,
    paper_id: Optional[str] = None,
    citation_id: Optional[str] = None,
    tags: Optional[list] = None,
    color: Optional[str] = "yellow",
) -> dict:
    """
    Create a new note.
    - Can be standalone, linked to a paper, or linked to a citation.
    """
    note_id = str(uuid.uuid4())
    note = {
        "id": note_id,
        "content": content,
        "paper_id": paper_id,       # link to paper
        "citation_id": citation_id,  # link to citation
        "tags": tags or [],
        "color": color,              # yellow, blue, green, pink, purple
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "is_pinned": False,
    }
    _notes_store[note_id] = note
    _save_notes()
    return note


def get_all_notes() -> list:
    """Return all notes sorted by updated_at descending."""
    notes = list(_notes_store.values())
    notes.sort(key=lambda n: n["updated_at"], reverse=True)
    return notes


def get_notes_by_paper(paper_id: str) -> list:
    """Get all notes linked to a specific paper."""
    return [n for n in _notes_store.values() if n.get("paper_id") == paper_id]


def get_notes_by_citation(citation_id: str) -> list:
    """Get all notes linked to a specific citation."""
    return [n for n in _notes_store.values() if n.get("citation_id") == citation_id]


def update_note(note_id: str, content: str = None, tags: list = None, color: str = None, is_pinned: bool = None) -> dict:
    """Update an existing note."""
    if note_id not in _notes_store:
        raise ValueError(f"Note {note_id} not found")

    note = _notes_store[note_id]
    if content is not None:
        note["content"] = content
    if tags is not None:
        note["tags"] = tags
    if color is not None:
        note["color"] = color
    if is_pinned is not None:
        note["is_pinned"] = is_pinned
    note["updated_at"] = datetime.utcnow().isoformat()

    _notes_store[note_id] = note
    _save_notes()
    return note


def delete_note(note_id: str) -> bool:
    """Delete a note by ID."""
    if note_id not in _notes_store:
        raise ValueError(f"Note {note_id} not found")
    del _notes_store[note_id]
    _save_notes()
    return True


def search_notes(query: str) -> list:
    """Search notes by content or tags."""
    query_lower = query.lower()
    results = []
    for note in _notes_store.values():
        if query_lower in note["content"].lower():
            results.append(note)
        elif any(query_lower in tag.lower() for tag in note.get("tags", [])):
            results.append(note)
    return results


def get_notes_for_draft(paper_id: str) -> str:
    """
    Export notes for a paper as formatted text — 
    useful for DraftWriter to pull in notes as context.
    """
    notes = get_notes_by_paper(paper_id)
    if not notes:
        return ""
    formatted = "## Research Notes\n\n"
    for note in notes:
        tags_str = f" [{', '.join(note['tags'])}]" if note["tags"] else ""
        formatted += f"- {note['content']}{tags_str}\n"
    return formatted