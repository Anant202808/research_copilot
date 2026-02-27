"""
ResearchGraph AI — Flask Backend
=================================
Main application entry-point with all API routes.

Run locally:
    pip install -r requirements.txt
    python app.py

Deploy with Gunicorn:
    gunicorn app:app --bind 0.0.0.0:$PORT
"""

import logging
import os
import sys
import traceback

from dotenv import load_dotenv
from flask import Flask, request, jsonify, Blueprint
from flask_cors import CORS

# ── Make sure project root is on the path so imports work ──
sys.path.insert(0, os.path.dirname(__file__))

# ── Defensive imports — if ANY of these fail, we log exactly which one ──
# This is the #1 cause of "route exists in code but returns 404":
# a silent ImportError means the decorator never runs.

_import_errors = []

try:
    from models.paper import Paper, PaperSummary, Citation, paper_store
except ImportError as e:
    _import_errors.append(("models.paper", str(e)))

try:
    from services.pdf_processor import extract_text_from_pdf
except ImportError as e:
    _import_errors.append(("services.pdf_processor", str(e)))

try:
    from services.ai_summarizer import (
        summarize_paper,
        extract_keywords,
        generate_draft_with_citations,
    )
except ImportError as e:
    _import_errors.append(("services.ai_summarizer", str(e)))

try:
    from services.citation_extractor import (
        extract_citations,
        format_citation,
        format_all_citations,
    )
except ImportError as e:
    _import_errors.append(("services.citation_extractor", str(e)))

try:
    from services.source_finder import (
        find_related_papers,
        get_paper_details,
        get_citing_papers,
        get_referenced_papers,
    )
except ImportError as e:
    _import_errors.append(("services.source_finder", str(e)))

try:
    from services.graph_generator import build_knowledge_graph
except ImportError as e:
    _import_errors.append(("services.graph_generator", str(e)))

try:
    from services.gap_analyzer import find_research_gaps
except ImportError as e:
    _import_errors.append(("services.gap_analyzer", str(e)))

try:
    from utils.validators import validate_upload, validate_paper_ids
except ImportError as e:
    _import_errors.append(("utils.validators", str(e)))

try:
    from utils.helpers import (
        ensure_dir,
        extract_title_heuristic,
        extract_year_heuristic,
        extract_authors_heuristic,
        extract_abstract_heuristic,
    )
except ImportError as e:
    _import_errors.append(("utils.helpers", str(e)))

# ── Phase 1 imports ──────────────────────────────────────────
try:
    from models.draft import Draft, DraftStatus, SectionName
except ImportError as e:
    _import_errors.append(("models.draft", str(e)))

try:
    from services.draft_manager import (
        DraftHistory,
        build_draft,
        detect_outdated,
        parse_sections,
        DraftAlert,
        AllowedCitationRegistry,
        PaperMetadata,
        check_minimum_papers,
        enforce_citations,
        audit_citations,
        CitationAudit,
        build_synthesis_prompt_block,
        replace_references_section,
        MINIMUM_PAPERS_FEATURE_COPY,
    )
except ImportError as e:
    _import_errors.append(("services.draft_manager", str(e)))

try:
    from services.workflow_manager import (
        research_to_draft_workflow,
        regenerate_section_workflow,
        get_history,
    )
except ImportError as e:
    _import_errors.append(("services.workflow_manager", str(e)))

# ── Notes imports ────────────────────────────────────────────
try:
    from services.note_manager import (
        create_note,
        get_all_notes,
        get_notes_by_paper,
        get_notes_by_citation,
        update_note,
        delete_note,
        search_notes,
        get_notes_for_draft,
    )
except ImportError as e:
    _import_errors.append(("services.note_manager", str(e)))

# ── Load .env ──
load_dotenv()

# ── Logging ──
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Report import errors immediately ─────────────────────────
if _import_errors:
    for module, err in _import_errors:
        logger.error("IMPORT FAILED: %s — %s", module, err)
    logger.error(
        "=" * 60 + "\n"
        "  %d import(s) failed. Routes depending on these modules\n"
        "  will NOT be registered. This is why you get 404s.\n"
        "  Fix the imports above before anything else.\n" +
        "=" * 60,
        len(_import_errors),
    )

# ── Flask app ──
app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
app.config["MAX_CONTENT_LENGTH"] = int(
    os.getenv("MAX_CONTENT_LENGTH", 10 * 1024 * 1024)
)

UPLOAD_FOLDER = os.getenv(
    "UPLOAD_FOLDER",
    os.path.join(os.path.dirname(__file__), "uploads"),
)
ensure_dir(UPLOAD_FOLDER)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# ── CORS — allow all methods on all /api/* routes ──
cors_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173",
)
CORS(
    app,
    origins=cors_origins.split(","),
    resources={r"/*": {"origins": cors_origins.split(",")}},  # ← covers everything
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
)

# ── Global citation registry ────────────────────────────────
citation_registry = AllowedCitationRegistry()


# ══════════════════════════════════════════════
#  Helper: post-generation citation enforcement
# ══════════════════════════════════════════════
def _enforce_draft_citations(draft: Draft) -> CitationAudit:
    """
    Run citation enforcement on a draft using the global registry.
    Mutates draft.text in place if leaked citations are found.
    Returns the audit.
    """
    if citation_registry.count == 0:
        logger.warning("Citation registry is empty — skipping enforcement.")
        return CitationAudit(layer4_clean=True)

    audit = audit_citations(draft.text, citation_registry)

    if not audit.is_clean:
        logger.warning(
            "Post-generation audit found %d leaked citation(s): %s",
            len(audit.leaked), audit.leaked,
        )
        cleaned_text, audit = enforce_citations(draft.text, citation_registry)
        cleaned_text = replace_references_section(cleaned_text, citation_registry)
        draft.text = cleaned_text
        draft.citation_audit = audit
        # Recount citations after stripping
        from services.draft_manager import _count_citations
        draft.citation_count = _count_citations(cleaned_text)
    else:
        draft.citation_audit = audit
        logger.info("Post-generation audit: CLEAN (%d valid citations).", len(audit.valid))

    return audit


def _ensure_papers_registered(papers):
    """
    Make sure every paper is in the citation registry.
    Called before any draft generation.
    """
    for paper in papers:
        if paper.id not in citation_registry.paper_ids:
            meta = PaperMetadata(
                paper_id=paper.id,
                title=paper.title,
                authors=(
                    paper.authors
                    if isinstance(paper.authors, list)
                    else [paper.authors]
                ),
                year=(
                    paper.year
                    if isinstance(paper.year, int)
                    else 2024
                ),
            )
            citation_registry.register(meta)
            logger.info(
                "Auto-registered paper %s in citation registry: %s",
                paper.id, meta.apa_inline,
            )


# ══════════════════════════════════════════════
#  Notes Blueprint
# ══════════════════════════════════════════════
notes_bp = Blueprint("notes", __name__, url_prefix="/api/notes")


@notes_bp.route("/", methods=["GET"])
def list_notes():
    """Get all notes. Optionally filter by paper_id, citation_id, or search query."""
    paper_id = request.args.get("paper_id")
    citation_id = request.args.get("citation_id")
    query = request.args.get("q")

    if paper_id:
        notes = get_notes_by_paper(paper_id)
    elif citation_id:
        notes = get_notes_by_citation(citation_id)
    elif query:
        notes = search_notes(query)
    else:
        notes = get_all_notes()

    return jsonify({"notes": notes, "count": len(notes)})


@notes_bp.route("/", methods=["POST"])
def add_note():
    """Create a new note."""
    data = request.get_json()
    if not data or not data.get("content"):
        return jsonify({"error": "content is required"}), 400

    note = create_note(
        content=data["content"],
        paper_id=data.get("paper_id"),
        citation_id=data.get("citation_id"),
        tags=data.get("tags", []),
        color=data.get("color", "yellow"),
    )
    return jsonify(note), 201


@notes_bp.route("/<note_id>", methods=["PUT"])
def edit_note(note_id):
    """Update an existing note."""
    data = request.get_json()
    try:
        note = update_note(
            note_id=note_id,
            content=data.get("content"),
            tags=data.get("tags"),
            color=data.get("color"),
            is_pinned=data.get("is_pinned"),
        )
        return jsonify(note)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@notes_bp.route("/<note_id>", methods=["DELETE"])
def remove_note(note_id):
    """Delete a note."""
    try:
        delete_note(note_id)
        return jsonify({"message": "Note deleted successfully"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@notes_bp.route("/draft/<paper_id>", methods=["GET"])
def notes_for_draft(paper_id):
    """Get notes formatted for DraftWriter context."""
    formatted = get_notes_for_draft(paper_id)
    return jsonify({"formatted_notes": formatted})


# ── Register blueprints ──────────────────────────────────────
app.register_blueprint(notes_bp)


# ══════════════════════════════════════════════
#  Draft Blueprint — isolates all /api/generate-draft/* routes
# ══════════════════════════════════════════════
#
# WHY A BLUEPRINT?
# ────────────────
# The 404 on POST /api/generate-draft/section was caused by Flask's
# routing: when /api/generate-draft and /api/generate-draft/section
# are registered as bare @app.route decorators, import-time failures
# or registration order issues can silently drop one of them.
#
# A Blueprint with url_prefix="/api/generate-draft" guarantees both
# routes are registered atomically. If the blueprint import fails,
# you get a loud error instead of a silent 404.

draft_bp = Blueprint("draft", __name__, url_prefix="/api/generate-draft")


@draft_bp.route("", methods=["POST"])
def generate_draft():
    """
    Generate a literature review draft from uploaded papers.

    Enforces:
    - Minimum 2 papers
    - Citation integrity via registry
    - Author names from metadata only
    """
    logger.info(">>> POST /api/generate-draft")

    data = request.get_json(silent=True) or {}
    paper_ids = data.get("paper_ids", [])
    section = data.get("section", "literature review")
    gap_ids = data.get("gap_ids", [])
    reason = data.get("reason")
    force = data.get("force", False)

    logger.info(
        "generate-draft request: paper_ids=%s, section=%s, force=%s",
        paper_ids, section, force,
    )

    # ── Validate paper IDs ───────────────────────────────────
    error = validate_paper_ids(paper_ids)
    if error:
        logger.warning("Validation failed: %s", error)
        return jsonify({"error": error}), 400

    # ── Retrieve papers ──────────────────────────────────────
    papers = paper_store.get_multiple(paper_ids)
    if not papers:
        logger.warning("No valid papers found for ids: %s", paper_ids)
        return jsonify({"error": "No valid papers found."}), 404

    # ── Gate: minimum papers ─────────────────────────────────
    allowed, gate_message = check_minimum_papers(len(papers))
    if not allowed:
        logger.info("Minimum papers gate blocked generation: %s", gate_message)
        return jsonify({
            "error": "insufficient_papers",
            "message": gate_message,
            "papers_uploaded": len(papers),
            "papers_required": 2,
            "feature_explanation": MINIMUM_PAPERS_FEATURE_COPY,
        }), 400

    try:
        # ── Ensure all papers are in citation registry ───────
        _ensure_papers_registered(papers)

        # ── Build citation-aware prompt context ──────────────
        # Pass the registry's citation instruction to the workflow
        # so the AI sees it BEFORE generating.
        citation_context = citation_registry.build_citation_instruction()
        synthesis_context = build_synthesis_prompt_block()

        # ── Call workflow ────────────────────────────────────
        result = research_to_draft_workflow(
            papers=papers,
            section=section,
            gap_ids=gap_ids,
            reason=reason,
            force=force,
            citation_instruction=citation_context,
            synthesis_instruction=synthesis_context,
        )

        # ── Post-generation: enforce citations (Layers 2-4) ─
        history = get_history()
        latest = history.latest

        if latest is not None:
            audit = _enforce_draft_citations(latest)
            result["reliability"] = citation_registry.reliability_panel()
            result["citation_audit"] = audit.to_dict()

        logger.info("Draft generation succeeded.")
        return jsonify(result), 201

    except Exception as e:
        logger.exception("Draft generation failed.")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc() if app.debug else None,
        }), 500


@draft_bp.route("/section", methods=["POST"])
def regenerate_section():
    """Regenerate a single section of the current draft."""
    logger.info(">>> POST /api/generate-draft/section")

    data = request.get_json(silent=True) or {}
    section_raw = data.get("section", "")
    paper_ids = data.get("paper_ids", [])
    gap_ids = data.get("gap_ids", [])
    reason = data.get("reason")

    # ── Validate section name ────────────────────────────────
    try:
        section_name = SectionName(section_raw)
    except ValueError:
        valid = [s.value for s in SectionName if s != SectionName.UNKNOWN]
        return jsonify({
            "error": f"Invalid section: '{section_raw}'. Valid: {valid}",
        }), 400

    # ── Validate paper IDs ───────────────────────────────────
    error = validate_paper_ids(paper_ids)
    if error:
        return jsonify({"error": error}), 400

    papers = paper_store.get_multiple(paper_ids)
    if not papers:
        return jsonify({"error": "No valid papers found."}), 404

    try:
        # ── Ensure all papers are in citation registry ───────
        _ensure_papers_registered(papers)

        citation_context = citation_registry.build_citation_instruction()
        synthesis_context = build_synthesis_prompt_block()

        result = regenerate_section_workflow(
            section_name=section_name,
            papers=papers,
            gap_ids=gap_ids,
            reason=reason,
            citation_instruction=citation_context,
            synthesis_instruction=synthesis_context,
        )

        # ── Post-generation: enforce citations ───────────────
        history = get_history()
        latest = history.latest
        if latest is not None:
            audit = _enforce_draft_citations(latest)
            result["citation_audit"] = audit.to_dict()
            result["reliability"] = citation_registry.reliability_panel()

        return jsonify(result), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("Section regeneration failed.")
        return jsonify({
            "error": str(e),
            "traceback": traceback.format_exc() if app.debug else None,
        }), 500


# ── Register draft blueprint ────────────────────────────────
app.register_blueprint(draft_bp)


# ══════════════════════════════════════════════
#  Health check
# ══════════════════════════════════════════════
@app.route("/")
def index():
    history = get_history()
    latest = history.latest
    return jsonify({
        "service": "ResearchGraph AI API",
        "version": "1.3.0",
        "status": "healthy",
        "papers_loaded": paper_store.count(),
        "draft_versions": len(history.all_versions),
        "latest_draft_status": latest.status.value if latest else None,
        "citation_registry_count": citation_registry.count,
        "import_errors": len(_import_errors),
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ready" if not _import_errors else "degraded",
        "provider": "backend",
        "import_errors": [
            {"module": m, "error": e} for m, e in _import_errors
        ],
    })


# ══════════════════════════════════════════════
#  Debug: list all registered routes
# ══════════════════════════════════════════════
@app.route("/api/routes", methods=["GET"])
def list_routes():
    """Debug endpoint — shows every route Flask knows about."""
    routes = []
    for rule in app.url_map.iter_rules():
        methods = sorted(list(rule.methods - {"HEAD", "OPTIONS"}))
        routes.append({
            "path": rule.rule,
            "methods": methods,
            "endpoint": rule.endpoint,
        })
    return jsonify(sorted(routes, key=lambda r: r["path"]))


# ══════════════════════════════════════════════
#  POST /api/upload-paper
# ══════════════════════════════════════════════
@app.route("/api/upload-paper", methods=["POST"])
def upload_paper():
    file = request.files.get("file")
    error = validate_upload(file)
    if error:
        return jsonify({"error": error}), 400

    paper_id = Paper.generate_id()
    filename = f"{paper_id}.pdf"
    file_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
    file.save(file_path)
    logger.info("Saved upload to %s", file_path)

    try:
        full_text = extract_text_from_pdf(file_path)
        logger.info("Extracted %d characters of text.", len(full_text))

        title = extract_title_heuristic(full_text)
        year = extract_year_heuristic(full_text)
        authors = extract_authors_heuristic(full_text)
        abstract = extract_abstract_heuristic(full_text)

        summary_dict = summarize_paper(full_text)
        summary = PaperSummary(**summary_dict)

        keywords = extract_keywords(full_text)
        raw_citations = extract_citations(full_text)
        citations = raw_citations

        paper = Paper(
            id=paper_id,
            title=title,
            authors=authors,
            year=year,
            abstract=abstract,
            full_text=full_text,
            summary=summary,
            citations=citations,
            keywords=keywords,
            file_path=file_path,
        )
        paper_store.add(paper)
        logger.info("Paper '%s' processed and stored (id=%s).", title, paper_id)

        # ── Register in citation registry ────────────────────
        meta = PaperMetadata(
            paper_id=paper_id,
            title=title,
            authors=authors if isinstance(authors, list) else [authors],
            year=year if isinstance(year, int) else 2024,
        )
        citation_registry.register(meta)
        logger.info(
            "Registered paper in citation registry: %s → %s",
            paper_id, meta.apa_inline,
        )

        # ── Check if existing draft is now outdated ──────────
        draft_alerts = []
        history = get_history()
        latest_draft = history.latest
        if latest_draft:
            all_paper_ids = [p.id for p in paper_store.get_all()]
            alerts = detect_outdated(
                draft=latest_draft,
                current_paper_ids=all_paper_ids,
                current_gap_ids=[],
                registry=citation_registry,
            )
            draft_alerts = [a.to_dict() for a in alerts]

        return jsonify({
            "paper_id": paper.id,
            "title": paper.title,
            "authors": paper.authors,
            "year": paper.year,
            "abstract": paper.abstract,
            "summary": paper.summary.to_dict(),
            "citations": [c.to_dict() for c in paper.citations],
            "keywords": paper.keywords,
            "citation_key": meta.apa_inline,
            "metadata": {
                "text_length": len(full_text),
                "citation_count": len(citations),
            },
            "draft_alerts": draft_alerts,
            "total_papers_uploaded": paper_store.count(),
            "can_generate_draft": paper_store.count() >= 2,
        }), 201

    except ValueError as e:
        logger.warning("Processing failed: %s", e)
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("Unexpected error processing upload.")
        return jsonify({"error": f"Internal server error: {e}"}), 500


# ══════════════════════════════════════════════
#  GET /api/papers
# ══════════════════════════════════════════════
@app.route("/api/papers", methods=["GET"])
def get_papers():
    papers = paper_store.get_all()
    paper_count = len(papers)
    allowed, gate_message = check_minimum_papers(paper_count)

    return jsonify({
        "papers": [p.to_dict() for p in papers],
        "count": paper_count,
        "can_generate_draft": allowed,
        "gate_message": gate_message,
        "feature_explanation": MINIMUM_PAPERS_FEATURE_COPY if not allowed else None,
    })


# ══════════════════════════════════════════════
#  GET /api/papers/<id>
# ══════════════════════════════════════════════
@app.route("/api/papers/<paper_id>", methods=["GET"])
def get_paper(paper_id: str):
    paper = paper_store.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404
    return jsonify(paper.to_full_dict())


# ══════════════════════════════════════════════
#  DELETE /api/papers/<id>
# ══════════════════════════════════════════════
@app.route("/api/papers/<paper_id>", methods=["DELETE"])
def delete_paper(paper_id: str):
    paper = paper_store.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404

    if paper.file_path and os.path.exists(paper.file_path):
        os.remove(paper.file_path)

    paper_store.delete(paper_id)
    logger.info("Deleted paper %s", paper_id)

    history = get_history()
    latest_draft = history.latest
    if latest_draft and paper_id in latest_draft.paper_ids_used:
        latest_draft.status = DraftStatus.OUTDATED

    return jsonify({"message": "Paper deleted.", "paper_id": paper_id})


# ══════════════════════════════════════════════
#  GET /api/summary/<id>
# ══════════════════════════════════════════════
@app.route("/api/summary/<paper_id>", methods=["GET"])
def get_summary(paper_id: str):
    paper = paper_store.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404
    return jsonify({
        "paper_id": paper.id,
        "title": paper.title,
        "summary": paper.summary.to_dict(),
    })


# ══════════════════════════════════════════════
#  GET /api/graph
# ══════════════════════════════════════════════
@app.route("/api/graph", methods=["GET"])
def get_graph():
    papers = paper_store.get_all()
    graph_data = build_knowledge_graph(papers)
    return jsonify(graph_data)


# ══════════════════════════════════════════════
#  POST /api/extract-citations
# ══════════════════════════════════════════════
@app.route("/api/extract-citations", methods=["POST"])
def extract_citations_endpoint():
    data = request.get_json(silent=True) or {}
    paper_id = data.get("paper_id")
    fmt = data.get("format", "APA")

    if not paper_id:
        return jsonify({"error": "paper_id is required."}), 400

    paper = paper_store.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404

    formatted = format_all_citations(paper.citations, fmt)

    return jsonify({
        "paper_id": paper.id,
        "format": fmt,
        "count": len(formatted),
        "citations": formatted,
    })


# ══════════════════════════════════════════════
#  POST /api/find-gaps
# ══════════════════════════════════════════════
@app.route("/api/find-gaps", methods=["POST"])
def find_gaps():
    data = request.get_json(silent=True) or {}
    paper_ids = data.get("paper_ids", [])

    error = validate_paper_ids(paper_ids)
    if error:
        return jsonify({"error": error}), 400

    papers = paper_store.get_multiple(paper_ids)
    if not papers:
        return jsonify({"error": "No valid papers found."}), 404

    try:
        result = find_research_gaps(papers)
        return jsonify(result)
    except Exception as e:
        logger.exception("Gap analysis failed.")
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════
#  POST /api/find-sources
# ══════════════════════════════════════════════
@app.route("/api/find-sources", methods=["POST"])
def find_sources():
    data = request.get_json(silent=True) or {}
    paper_id = data.get("paper_id")

    if not paper_id:
        return jsonify({"error": "paper_id is required."}), 400

    paper = paper_store.get(paper_id)
    if not paper:
        return jsonify({"error": "Paper not found."}), 404

    related = find_related_papers(
        title=paper.title,
        keywords=paper.keywords,
        abstract=paper.abstract,
    )

    return jsonify({
        "paper_id": paper_id,
        "source_paper_title": paper.title,
        "related_count": len(related),
        "related_papers": related,
    })


# ══════════════════════════════════════════════
#  GET /api/find-sources/search?q=query
# ══════════════════════════════════════════════
@app.route("/api/find-sources/search", methods=["GET"])
def search_sources():
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Query parameter 'q' is required."}), 400

    limit = min(int(request.args.get("limit", 10)), 20)
    results = find_related_papers(title=query, limit=limit)

    return jsonify({
        "query": query,
        "count": len(results),
        "papers": results,
    })


# ══════════════════════════════════════════════
#  Other draft read-only endpoints
# ══════════════════════════════════════════════

@app.route("/api/draft", methods=["GET"])
def get_current_draft():
    history = get_history()
    latest = history.latest

    if latest is None:
        return jsonify({
            "error": "No draft exists yet. Generate one first.",
        }), 404

    all_paper_ids = [p.id for p in paper_store.get_all()]
    alerts = detect_outdated(
        draft=latest,
        current_paper_ids=all_paper_ids,
        current_gap_ids=[],
        registry=citation_registry,
    )

    audit = getattr(latest, "citation_audit", None)

    return jsonify({
        "draft": latest.to_dict(),
        "alerts": [a.to_dict() for a in alerts],
        "reliability": citation_registry.reliability_panel(),
        "citation_audit": audit.to_dict() if audit else None,
    })


@app.route("/api/draft/status", methods=["GET"])
def get_draft_status():
    history = get_history()
    latest = history.latest

    if latest is None:
        return jsonify({
            "has_draft": False,
            "status": None,
            "version": None,
            "alerts": [],
            "can_generate": paper_store.count() >= 2,
            "papers_uploaded": paper_store.count(),
        })

    all_paper_ids = [p.id for p in paper_store.get_all()]
    alerts = detect_outdated(
        draft=latest,
        current_paper_ids=all_paper_ids,
        current_gap_ids=[],
        registry=citation_registry,
    )

    return jsonify({
        "has_draft": True,
        "status": latest.status.value,
        "version": latest.version,
        "draft_id": latest.draft_id,
        "generated_at": latest.generated_at.isoformat(),
        "paper_ids_used": latest.paper_ids_used,
        "citation_count": latest.citation_count,
        "section_count": len(latest.sections),
        "sections": latest.section_names(),
        "alert_count": len(alerts),
        "alerts": [a.to_dict() for a in alerts],
        "reliability": citation_registry.reliability_panel(),
    })


@app.route("/api/draft/history", methods=["GET"])
def get_draft_history():
    history = get_history()
    include_full = request.args.get("full", "false").lower() == "true"

    versions = []
    for draft in history.all_versions:
        if include_full:
            entry = draft.to_dict()
        else:
            entry = {
                "draft_id": draft.draft_id,
                "parent_id": draft.parent_id,
                "version": draft.version,
                "status": draft.status.value,
                "generated_at": draft.generated_at.isoformat(),
                "regeneration_reason": draft.regeneration_reason,
                "paper_ids_used": draft.paper_ids_used,
                "citation_count": draft.citation_count,
                "gap_ids_covered": draft.gap_ids_covered,
                "section_count": len(draft.sections),
                "sections": draft.section_names(),
                "content_hash": draft.content_hash(),
            }

        audit = getattr(draft, "citation_audit", None)
        entry["citation_audit_clean"] = audit.is_clean if audit else None
        versions.append(entry)

    return jsonify({
        "total_versions": len(versions),
        "versions": versions,
    })


@app.route("/api/draft/version/<int:version>", methods=["GET"])
def get_draft_version(version: int):
    history = get_history()
    draft = history.get_version(version)

    if draft is None:
        return jsonify({"error": f"Draft version {version} not found."}), 404

    audit = getattr(draft, "citation_audit", None)

    return jsonify({
        "draft": draft.to_dict(),
        "citation_audit": audit.to_dict() if audit else None,
        "reliability": citation_registry.reliability_panel(),
    })


@app.route("/api/draft/diff", methods=["GET"])
def get_draft_diff():
    history = get_history()

    try:
        v_from = int(request.args.get("from", 0))
        v_to = int(request.args.get("to", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "'from' and 'to' must be integers."}), 400

    if v_from < 1 or v_to < 1:
        return jsonify({"error": "'from' and 'to' must be ≥ 1."}), 400

    try:
        diff = history.diff_summary(v_from, v_to)
        return jsonify(diff)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404


@app.route("/api/draft/sections", methods=["GET"])
def get_draft_sections():
    history = get_history()
    latest = history.latest

    if latest is None:
        return jsonify({"error": "No draft exists yet."}), 404

    return jsonify({
        "draft_id": latest.draft_id,
        "version": latest.version,
        "overall_status": latest.status.value,
        "sections": [s.to_dict() for s in latest.sections],
    })


# ══════════════════════════════════════════════
#  Reliability panel endpoint
# ══════════════════════════════════════════════
@app.route("/api/reliability", methods=["GET"])
def get_reliability():
    """
    Returns the 'Why this draft is reliable' panel data.
    Shows: paper count, citation sources, no-external-citations badge.
    """
    return jsonify(citation_registry.reliability_panel())


# ══════════════════════════════════════════════════════════════
#  WORKFLOW ENDPOINT
# ══════════════════════════════════════════════════════════════

@app.route("/api/workflow/research-to-draft", methods=["POST"])
def research_to_draft():
    data = request.get_json(silent=True) or {}
    paper_ids = data.get("paper_ids", [])
    section = data.get("section", "literature review")
    gap_ids = data.get("gap_ids", [])
    reason = data.get("reason")
    force = data.get("force", False)

    error = validate_paper_ids(paper_ids)
    if error:
        return jsonify({"error": error}), 400

    papers = paper_store.get_multiple(paper_ids)
    if not papers:
        return jsonify({"error": "No valid papers found."}), 404

    try:
        _ensure_papers_registered(papers)

        result = research_to_draft_workflow(
            papers=papers,
            section=section,
            gap_ids=gap_ids,
            reason=reason,
            force=force,
            citation_instruction=citation_registry.build_citation_instruction(),
            synthesis_instruction=build_synthesis_prompt_block(),
        )

        # Post-generation enforcement
        history = get_history()
        latest = history.latest
        if latest is not None:
            audit = _enforce_draft_citations(latest)
            result["citation_audit"] = audit.to_dict()
            result["reliability"] = citation_registry.reliability_panel()

        return jsonify(result)
    except Exception as e:
        logger.exception("Workflow execution failed.")
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════
#  Error handlers
# ══════════════════════════════════════════════
@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum size is 10 MB."}), 413


@app.errorhandler(404)
def not_found(e):
    logger.warning(
        "404 Not Found: %s %s (Flask saw no matching route)",
        request.method,
        request.url,
    )
    # ── Diagnostic: show what routes DO exist for this prefix ──
    requested_path = request.path
    similar = [
        rule.rule
        for rule in app.url_map.iter_rules()
        if requested_path.rstrip("/").startswith(rule.rule.split("<")[0].rstrip("/"))
        or rule.rule.rstrip("/").startswith(requested_path.rsplit("/", 1)[0])
    ]
    return jsonify({
        "error": "Resource not found.",
        "requested_url": request.url,
        "method": request.method,
        "similar_routes": similar[:10],
        "hint": "Use GET /api/routes to see all available endpoints.",
        "import_errors": len(_import_errors),
    }), 404


@app.errorhandler(500)
def internal_error(e):
    logger.exception("500 Internal Server Error")
    return jsonify({
        "error": "Internal server error.",
        "details": str(e),
    }), 500


# ══════════════════════════════════════════════
#  Startup verification
# ══════════════════════════════════════════════
def _verify_routes():
    """
    Verify that critical routes are actually registered.
    Called at startup — if any are missing, log a LOUD error.
    """
    critical_routes = [
        ("POST", "/api/generate-draft"),
        ("POST", "/api/generate-draft/section"),
        ("GET",  "/api/draft"),
        ("GET",  "/api/draft/status"),
        ("GET",  "/api/draft/history"),
        ("POST", "/api/upload-paper"),
        ("GET",  "/api/papers"),
        ("GET",  "/api/reliability"),
    ]

    registered = set()
    for rule in app.url_map.iter_rules():
        for method in rule.methods:
            registered.add((method, rule.rule))

    missing = []
    for method, path in critical_routes:
        if (method, path) not in registered:
            missing.append(f"  {method} {path}")

    if missing:
        logger.error(
            "\n" + "!" * 60 + "\n"
            "CRITICAL: The following routes are NOT registered:\n"
            "%s\n"
            "This means those endpoints will return 404.\n"
            "Check for import errors above.\n" +
            "!" * 60,
            "\n".join(missing),
        )
    else:
        logger.info("✓ All %d critical routes verified.", len(critical_routes))


# ══════════════════════════════════════════════
#  Run
# ══════════════════════════════════════════════
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV", "development") == "development"

    # ── Verify routes before starting ────────────────────────
    _verify_routes()

    # ── Print all routes on startup ──────────────────────────
    print("\n" + "=" * 60)
    print("REGISTERED ROUTES:")
    print("=" * 60)
    for rule in sorted(app.url_map.iter_rules(), key=lambda r: r.rule):
        methods = ", ".join(sorted(rule.methods - {"HEAD", "OPTIONS"}))
        print(f"  {methods:20s}  {rule.rule}")
    print("=" * 60)
    if _import_errors:
        print(f"\n⚠  {len(_import_errors)} IMPORT ERROR(S):")
        for module, err in _import_errors:
            print(f"   • {module}: {err}")
    print(f"\nPapers in store: {paper_store.count()}")
    print(f"Papers in citation registry: {citation_registry.count}")
    print(f"Starting on port {port} (debug={debug})\n")

    app.run(host="0.0.0.0", port=port, debug=debug)