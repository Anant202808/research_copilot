# ResearchGraph AI — Backend

A Flask API that powers PDF upload, AI summarization, knowledge-graph generation, citation extraction, and research-gap analysis for academic papers.

---

## Quick Start

```bash
cd backend

# 1. Create a virtual environment
python -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env → add your OPENAI_API_KEY (optional — the app works without it)

# 4. Run the server
python app.py
# → API available at http://localhost:5000
```

---

## API Endpoints

| Method   | Path                      | Description                              |
| -------- | ------------------------- | ---------------------------------------- |
| `GET`    | `/`                       | Health check                             |
| `POST`   | `/api/upload-paper`       | Upload PDF → extract, summarise, store   |
| `GET`    | `/api/papers`             | List all papers (without full text)      |
| `GET`    | `/api/papers/:id`         | Get full paper details                   |
| `DELETE` | `/api/papers/:id`         | Delete a paper                           |
| `GET`    | `/api/summary/:id`        | Get AI summary for a paper               |
| `GET`    | `/api/graph`              | Get knowledge-graph data (nodes + edges) |
| `POST`   | `/api/extract-citations`  | Format citations for a paper             |
| `POST`   | `/api/find-gaps`          | Research-gap analysis on 3-10 papers     |

### Upload Paper

```bash
curl -X POST http://localhost:5000/api/upload-paper \
  -F "file=@path/to/paper.pdf"
```

### Extract Citations

```bash
curl -X POST http://localhost:5000/api/extract-citations \
  -H "Content-Type: application/json" \
  -d '{"paper_id": "UUID", "format": "APA"}'
```

### Find Research Gaps

```bash
curl -X POST http://localhost:5000/api/find-gaps \
  -H "Content-Type: application/json" \
  -d '{"paper_ids": ["id1", "id2", "id3"]}'
```

---

## Project Structure

```
backend/
├── app.py                        # Flask app + all routes
├── requirements.txt              # Python dependencies
├── Procfile                      # Gunicorn start command (Render / Heroku)
├── render.yaml                   # Render.com deployment blueprint
├── runtime.txt                   # Python version for hosting platforms
├── .env.example                  # Environment variable template
├── models/
│   └── paper.py                  # Paper, Citation, PaperSummary dataclasses + in-memory store
├── services/
│   ├── pdf_processor.py          # PyPDF2 text extraction (+ pdfplumber fallback)
│   ├── ai_summarizer.py          # OpenAI GPT summarization (+ extractive fallback)
│   ├── citation_extractor.py     # Reference-section parsing & formatting (APA/MLA/IEEE/BibTeX)
│   ├── graph_generator.py        # NetworkX-based knowledge-graph builder
│   └── gap_analyzer.py           # Research-gap finder (OpenAI or heuristic)
├── utils/
│   ├── validators.py             # Input validation (file type, size, paper IDs)
│   └── helpers.py                # Title/author/year heuristic extraction, text cleaning
├── tests/
│   └── test_services.py          # Unit & integration tests
└── uploads/                      # Temporary PDF storage (auto-created)
```

---

## Environment Variables

| Variable              | Required | Default                     | Description                              |
| --------------------- | -------- | --------------------------- | ---------------------------------------- |
| `OPENAI_API_KEY`      | No       | —                           | Enables GPT-powered summaries & gap analysis. Without it the app uses heuristic fallbacks. |
| `FLASK_ENV`           | No       | `development`               | `development` or `production`            |
| `SECRET_KEY`          | Yes      | `dev-secret-change-me`      | Flask session secret                     |
| `UPLOAD_FOLDER`       | No       | `./uploads`                 | Where PDFs are stored                    |
| `MAX_CONTENT_LENGTH`  | No       | `10485760` (10 MB)          | Max upload size in bytes                 |
| `CORS_ORIGINS`        | No       | `localhost:3000,5173`       | Comma-separated allowed origins          |
| `PORT`                | No       | `5000`                      | Server port                              |

---

## Running Tests

```bash
python -m pytest tests/ -v
# or
python -m unittest tests.test_services -v
```

---

## Deploy to Render

1. Push this `backend/` directory to a GitHub repo.
2. Go to [render.com](https://render.com) → **New Web Service**.
3. Connect the repo, set **Root Directory** to `backend/`.
4. Render auto-detects `render.yaml` — or set manually:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120`
5. Add `OPENAI_API_KEY` in the Environment tab (optional).
6. Deploy!

---

## Works Without OpenAI

Every AI-powered feature has an automatic fallback:

- **Summarization** → extractive keyword-based summary
- **Gap Analysis** → heuristic frequency + limitation analysis
- **Keywords** → TF-based extraction from paper text

Set `OPENAI_API_KEY` to unlock GPT-3.5-turbo quality, or leave it blank and everything still runs.

---

## License

MIT
