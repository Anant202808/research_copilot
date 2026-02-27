"""PDF text extraction service using PyPDF2 (with pdfplumber fallback)."""

import os
import logging
from typing import Optional

from utils.helpers import clean_text

logger = logging.getLogger(__name__)


def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract all text from a PDF file.

    Tries PyPDF2 first; if the result is nearly empty (e.g. a scanned PDF),
    falls back to pdfplumber if available.
    """
    text = _extract_with_pypdf2(file_path)

    # If PyPDF2 returned very little text, try pdfplumber
    if len(text.strip()) < 100:
        fallback = _extract_with_pdfplumber(file_path)
        if fallback and len(fallback.strip()) > len(text.strip()):
            text = fallback

    if not text.strip():
        raise ValueError(
            "Could not extract text from the PDF. "
            "It may be a scanned document (OCR not supported in this version)."
        )

    return clean_text(text)


def _extract_with_pypdf2(file_path: str) -> str:
    """Extract text page-by-page using PyPDF2."""
    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(file_path)
        pages = []
        for i, page in enumerate(reader.pages):
            try:
                page_text = page.extract_text() or ""
                pages.append(page_text)
            except Exception as e:
                logger.warning("PyPDF2: failed to extract page %d: %s", i, e)
                continue
        return "\n\n".join(pages)
    except ImportError:
        logger.warning("PyPDF2 is not installed.")
        return ""
    except Exception as e:
        logger.error("PyPDF2 extraction failed: %s", e)
        return ""


def _extract_with_pdfplumber(file_path: str) -> Optional[str]:
    """Fallback text extraction using pdfplumber (handles multi-column better)."""
    try:
        import pdfplumber  # type: ignore

        pages = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                pages.append(text)
        return "\n\n".join(pages)
    except ImportError:
        logger.info("pdfplumber not installed — skipping fallback extraction.")
        return None
    except Exception as e:
        logger.error("pdfplumber extraction failed: %s", e)
        return None


def get_page_count(file_path: str) -> int:
    """Return the number of pages in a PDF."""
    try:
        from PyPDF2 import PdfReader

        return len(PdfReader(file_path).pages)
    except Exception:
        return 0
