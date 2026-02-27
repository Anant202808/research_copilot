"""Input validation helpers."""

from werkzeug.datastructures import FileStorage

ALLOWED_EXTENSIONS = {"pdf"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def allowed_file(filename: str) -> bool:
    """Return True if the file extension is in the allow-list."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def validate_upload(file: FileStorage) -> str | None:
    """Return an error message string, or None if the upload is valid."""
    if file is None or file.filename == "":
        return "No file provided."

    if not allowed_file(file.filename or ""):
        return "Only PDF files are accepted."

    # Check content-length header (may not always be present)
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_SIZE:
        return f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)} MB."

    return None


def validate_paper_ids(paper_ids: list, min_count: int = 1, max_count: int = 10) -> str | None:
    """Return an error message if paper_ids list is invalid."""
    if not paper_ids or not isinstance(paper_ids, list):
        return "paper_ids must be a non-empty list."
    if len(paper_ids) < min_count:
        return f"At least {min_count} papers are required."
    if len(paper_ids) > max_count:
        return f"Maximum {max_count} papers allowed."
    return None
