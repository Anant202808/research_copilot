"""
Unit tests for ResearchGraph AI backend services.

Run with:  python -m pytest tests/ -v
"""

import os
import sys
import json
import tempfile
import unittest

# Ensure project root is on path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.paper import Paper, PaperSummary, Citation, PaperStore
from services.ai_summarizer import summarize_paper, extract_keywords, _summarize_extractive
from services.citation_extractor import (
    extract_citations,
    format_citation,
    format_all_citations,
)
from services.graph_generator import build_knowledge_graph
from services.gap_analyzer import find_research_gaps, _gap_analysis_heuristic
from utils.validators import allowed_file, validate_upload, validate_paper_ids
from utils.helpers import (
    extract_title_heuristic,
    extract_year_heuristic,
    extract_authors_heuristic,
    clean_text,
)


class TestPaperModel(unittest.TestCase):
    def test_paper_store_crud(self):
        store = PaperStore()
        paper = Paper(
            id="test-1",
            title="Test Paper",
            authors=["Alice Smith"],
            year=2024,
            abstract="A test.",
            full_text="Full text of the test paper.",
        )
        store.add(paper)
        self.assertEqual(store.count(), 1)
        self.assertIsNotNone(store.get("test-1"))
        self.assertIsNone(store.get("nonexistent"))
        self.assertTrue(store.delete("test-1"))
        self.assertEqual(store.count(), 0)

    def test_paper_to_dict_excludes_full_text(self):
        paper = Paper(
            id="t", title="T", authors=[], year=2024,
            abstract="A", full_text="Long text here",
        )
        d = paper.to_dict()
        self.assertNotIn("full_text", d)
        self.assertNotIn("file_path", d)

    def test_paper_to_full_dict_includes_full_text(self):
        paper = Paper(
            id="t", title="T", authors=[], year=2024,
            abstract="A", full_text="Long text here",
        )
        d = paper.to_full_dict()
        self.assertIn("full_text", d)


class TestValidators(unittest.TestCase):
    def test_allowed_file(self):
        self.assertTrue(allowed_file("paper.pdf"))
        self.assertTrue(allowed_file("PAPER.PDF"))
        self.assertFalse(allowed_file("paper.txt"))
        self.assertFalse(allowed_file("paper"))

    def test_validate_paper_ids(self):
        self.assertIsNotNone(validate_paper_ids([]))
        self.assertIsNotNone(validate_paper_ids(["a", "b"]))  # too few
        self.assertIsNone(validate_paper_ids(["a", "b", "c"]))  # just right
        self.assertIsNotNone(
            validate_paper_ids(list(range(11)))  # too many
        )


class TestHelpers(unittest.TestCase):
    def test_extract_title(self):
        text = "Short\nA Really Good Title About Machine Learning\nMore text"
        title = extract_title_heuristic(text)
        self.assertIn("Machine Learning", title)

    def test_extract_year(self):
        self.assertEqual(extract_year_heuristic("Published 2023 blah"), 2023)
        self.assertEqual(extract_year_heuristic("No year here"), 2024)

    def test_extract_authors(self):
        text = "A Great Title\nAlice Smith, Bob Jones, Carol White\nSome University"
        authors = extract_authors_heuristic(text)
        self.assertTrue(len(authors) >= 2)

    def test_clean_text(self):
        dirty = "Hello\x00World   lots   of   spaces\n\n\n\n\nmany newlines"
        cleaned = clean_text(dirty)
        self.assertNotIn("\x00", cleaned)
        self.assertNotIn("     ", cleaned)


class TestAISummarizer(unittest.TestCase):
    def test_extractive_fallback(self):
        text = (
            "We propose a new method for image classification. "
            "Our approach uses convolutional neural networks trained on ImageNet. "
            "Results show that our model achieves 95% accuracy. "
            "The method demonstrates significant improvement over baselines. "
            "However, the model has limitations with small datasets. "
            "Future work should address this drawback."
        )
        result = _summarize_extractive(text)
        self.assertIn("overview", result)
        self.assertIn("findings", result)
        self.assertIn("methodology", result)
        self.assertIn("limitations", result)
        self.assertIsInstance(result["findings"], list)

    def test_extract_keywords(self):
        text = "Keywords: deep learning, computer vision, transformers, attention"
        keywords = extract_keywords(text)
        self.assertTrue(len(keywords) >= 2)
        self.assertIn("deep learning", keywords)


class TestCitationExtractor(unittest.TestCase):
    SAMPLE_REF_SECTION = """
Some paper text here.

References

[1] A. Vaswani, N. Shazeer, N. Parmar. Attention Is All You Need. NeurIPS, 2017.
[2] J. Devlin, M. Chang, K. Lee. BERT: Pre-training of Deep Bidirectional Transformers. NAACL, pp. 4171-4186, 2019.
[3] T. Brown et al. Language Models are Few-Shot Learners. NeurIPS, 2020.
"""

    def test_extract_from_references_section(self):
        citations = extract_citations(self.SAMPLE_REF_SECTION)
        self.assertTrue(len(citations) >= 2)
        self.assertIsInstance(citations[0], Citation)

    def test_format_apa(self):
        c = Citation(
            id="1", title="Test Paper", authors=["Alice Smith", "Bob Jones"],
            year=2023, journal="Nature", volume="10", pages="1-10",
        )
        formatted = format_citation(c, "APA")
        self.assertIn("2023", formatted)
        self.assertIn("Test Paper", formatted)

    def test_format_bibtex(self):
        c = Citation(
            id="1", title="Test Paper", authors=["Alice Smith"],
            year=2023, journal="Nature",
        )
        formatted = format_citation(c, "BibTeX")
        self.assertIn("@article{", formatted)
        self.assertIn("smith2023", formatted)

    def test_format_all(self):
        citations = [
            Citation(id="1", title="P1", authors=["A B"], year=2020, journal="J1"),
            Citation(id="2", title="P2", authors=["C D"], year=2021, journal="J2"),
        ]
        result = format_all_citations(citations, "MLA")
        self.assertEqual(len(result), 2)


class TestGraphGenerator(unittest.TestCase):
    def _make_papers(self):
        p1 = Paper(
            id="p1", title="Attention Is All You Need", authors=["Vaswani"],
            year=2017, abstract="", full_text="We propose the Transformer.",
        )
        p2 = Paper(
            id="p2", title="BERT", authors=["Devlin"],
            year=2019, abstract="",
            full_text="Building on Attention Is All You Need by Vaswani 2017.",
            citations=[Citation(id="c1", title="Attention Is All You Need", authors=["Vaswani"], year=2017, journal="NeurIPS")],
        )
        return [p1, p2]

    def test_graph_structure(self):
        papers = self._make_papers()
        graph = build_knowledge_graph(papers)
        self.assertIn("nodes", graph)
        self.assertIn("edges", graph)
        self.assertEqual(len(graph["nodes"]), 2)
        # p2 should cite p1
        self.assertTrue(len(graph["edges"]) >= 1)

    def test_empty_graph(self):
        graph = build_knowledge_graph([])
        self.assertEqual(graph["nodes"], [])
        self.assertEqual(graph["edges"], [])


class TestGapAnalyzer(unittest.TestCase):
    def _make_papers(self):
        return [
            Paper(
                id=f"p{i}", title=f"Paper {i}",
                authors=[f"Author {i}"], year=2020 + i,
                abstract="Abstract", full_text="Text",
                summary=PaperSummary(
                    overview="Overview",
                    findings=["Finding 1"],
                    methodology="We used method X",
                    limitations=["Limitation A"],
                ),
                keywords=["deep learning", "NLP", f"topic{i}"],
            )
            for i in range(4)
        ]

    def test_heuristic_gap_analysis(self):
        papers = self._make_papers()
        result = _gap_analysis_heuristic(papers)
        self.assertIn("common_topics", result)
        self.assertIn("gaps", result)
        self.assertIn("research_questions", result)
        self.assertTrue(len(result["gaps"]) >= 3)
        self.assertTrue(len(result["research_questions"]) >= 3)


class TestFlaskApp(unittest.TestCase):
    """Integration tests against the Flask app."""

    def setUp(self):
        from app import app
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_health_check(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "healthy")

    def test_get_papers_empty(self):
        resp = self.client.get("/api/papers")
        self.assertEqual(resp.status_code, 200)

    def test_get_graph_empty(self):
        resp = self.client.get("/api/graph")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertIn("nodes", data)
        self.assertIn("edges", data)

    def test_upload_no_file(self):
        resp = self.client.post("/api/upload-paper")
        self.assertEqual(resp.status_code, 400)

    def test_find_gaps_too_few(self):
        resp = self.client.post(
            "/api/find-gaps",
            json={"paper_ids": ["a"]},
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_get_nonexistent_paper(self):
        resp = self.client.get("/api/papers/does-not-exist")
        self.assertEqual(resp.status_code, 404)

    def test_delete_nonexistent_paper(self):
        resp = self.client.delete("/api/papers/does-not-exist")
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
