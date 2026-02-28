# research_copilot

An AI-powered research assistant designed to accelerate literature reviews. **research_copilot** streamlines the research workflow by automating PDF processing, paper summarization, knowledge graph generation, and initial draft synthesis using high-performance AI reasoning.

## 🚀 Key Features

- **📄 Smart PDF Upload**: Effortlessly upload research papers in PDF format.
- **🧠 AI-Powered Reasoning & Summarization**: Extract key insights, methodologies, and findings from complex academic papers using large-scale language models.
- **🕸️ Knowledge Graph Generation**: Visualize relationships between papers, citations, and core research concepts.
- **🔍 Research Gap Analysis**: Identify missing links, unexplored areas, and potential research opportunities.
- **📝 Automated Literature Drafting**: Generate structured literature review drafts with proper contextual flow.
- **📌 Integrated Note-taking**: Capture and organize research notes directly within the analysis workflow.

## 🧠 AI Reasoning Engine

**research_copilot** uses the **Cerebras Inference API** as its primary AI reasoning backend.

- **Model Used**: `gpt-oss-120b`
- Optimized for long-context academic reasoning, fast inference, and multi-paper synthesis.

## 💻 Tech Stack

### Frontend
- React 19 (Vite)
- Tailwind CSS
- Zustand
- jsPDF, docx

### Backend
- Flask
- Cerebras Inference API
- NetworkX, Pandas, NumPy
- PyPDF2
- **Server**:
  - Flask development server (local development)
  - Gunicorn (production deployment on Linux)

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.9+)
- Cerebras API access

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # add CEREBRAS_API_KEY
python app.py
```

### Frontend Setup
```bash
npm install
npm run dev
```

## ⚙️ Running Modes

### Local Development (Windows / macOS)
```bash
python app.py
```
Uses Flask’s built-in development server. Recommended for development and debugging.

### Production Deployment (Linux)
```bash
gunicorn app:app --workers 4 --bind 0.0.0.0:5000
```
Uses Gunicorn, a production-grade WSGI server for handling concurrent requests.

## 📂 Project Structure

```text
research_copilot/
├── backend/            # Flask API
│   ├── models/         # Data models (Paper, Draft, etc.)
│   ├── services/       # Business logic (AI, PDF, Graph)
│   ├── uploads/        # PDF storage
│   └── app.py          # Main entry point
├── src/                # React components & UI logic
│   ├── components/     # Reusable UI elements
│   ├── services/       # API integration
│   ├── stores/         # State management
│   └── App.tsx         # Main frontend logic
├── package.json        # Frontend configuration
└── requirements.txt    # Backend dependencies
```


## 🔮 Future Scope
- Support for additional document formats (DOCX, LaTeX)
- Collaborative research workspaces
- Advanced citation quality analysis

## 📄 License

MIT License
