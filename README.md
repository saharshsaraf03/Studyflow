# StudyFlow — AI-Powered Smart Study Planner

An intelligent study planning application that combines adaptive scheduling algorithms with AI-powered PDF analysis to help students optimize their exam preparation. Upload any study material and get structured study plans, comprehensive exam summaries, and an interactive chatbot — all powered by GPT-4o mini.

**Live Demo:** [https://ddr1k3uxkbzvy.cloudfront.net](https://ddr1k3uxkbzvy.cloudfront.net)

---

## Features

### Smart Study Planner
- **Adaptive Scheduling** — Automatically distributes study hours based on subject difficulty, syllabus size, and exam urgency using a weighted priority algorithm (35% difficulty + 30% syllabus + 35% urgency)
- **Progress Tracking** — Log actual study hours, track streaks, and monitor completion with visual indicators
- **Auto-Adjustment** — Missed a day? The planner redistributes hours across remaining days automatically
- **Visual Dashboard** — Charts showing time distribution, planned vs actual hours, and subject breakdowns

### AI-Powered PDF Tools
- **RAG Pipeline** — Full retrieval-augmented generation pipeline: PDF ingestion → text chunking → FAISS vector indexing → semantic similarity retrieval → context-grounded LLM response
- **PDF Upload & Analysis** — Drag-and-drop any study material PDF for instant AI analysis
- **Structured Study Plans** — Auto-generated topic breakdown with priority levels, estimated hours, and recommended study order
- **Exam-Ready Summaries** — Comprehensive summaries covering every concept, definition, formula, and key point — detailed enough to study directly from
- **Interactive Chatbot** — Ask questions about your uploaded material and get context-aware answers grounded in retrieved document chunks
- **PDF Export** — Download generated study plans, summaries, and chat transcripts as formatted PDFs

---

## Tech Stack

### Frontend
- **React 18** — Functional components with hooks
- **Vite** — Build tool and dev server
- **Tailwind CSS** — Utility-first styling with custom dark theme
- **Recharts** — Data visualization (pie charts, area charts)
- **Lucide React** — Icon library
- **Framer Motion** — Animations
- **jsPDF** — Client-side PDF generation

### Backend
- **FastAPI** — Python REST API framework
- **LangChain** — RAG pipeline orchestration and LLM chain management
- **FAISS** — Vector similarity search for semantic chunk retrieval
- **HuggingFace Sentence Transformers** — `all-MiniLM-L6-v2` embeddings for document chunking
- **OpenAI GPT-4o mini** — LLM for study plan generation, summarization, and Q&A
- **Uvicorn** — ASGI server

### Hosting
- **Render** — Python FastAPI backend (free tier)
- **AWS S3** — Static website hosting
- **AWS CloudFront** — CDN with HTTPS

---

## Architecture
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│            React + Vite + Tailwind               │
│         (S3 + CloudFront — HTTPS)                │
└──────────────────┬──────────────────────────────┘
│ POST (extractedText + action)
▼
┌─────────────────────────────────────────────────┐
│         FastAPI Backend (Render)                 │
│              Python 3.11                         │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │           RAG Pipeline                  │    │
│  │  1. Chunk text (RecursiveTextSplitter)  │    │
│  │  2. Embed chunks (all-MiniLM-L6-v2)    │    │
│  │  3. Index with FAISS                    │    │
│  │  4. Retrieve top-k relevant chunks      │    │
│  │  5. Pass context to GPT-4o mini         │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  Actions: generate_plan | chat                   │
└─────────────────────────────────────────────────┘

---

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- npm
- OpenAI API key

### Frontend — Local Development

1. **Clone the repository**
```bash
git clone https://github.com/saharshsaraf03/Studyflow.git
cd Studyflow
```

2. **Install dependencies**
```bash
npm install
```

3. **Start the dev server**
```bash
npm run dev
```

4. **Open** `http://localhost:3000` in your browser

### Backend — Local Development

1. **Install Python dependencies**
```bash
pip install -r requirements.txt
```

2. **Set environment variable**
```bash
set OPENAI_API_KEY=your-openai-key-here
```

3. **Start the FastAPI server**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Build for Production

```bash
npm run build
```

The output will be in the `dist` folder, ready to deploy to S3.

---

## Project Structure
├── main.py                         # FastAPI backend — RAG pipeline
├── requirements.txt                # Python dependencies
├── src/
│   ├── App.jsx                     # Root component, routing, global state
│   ├── main.jsx                    # Entry point
│   ├── index.css                   # Global styles, Tailwind, custom components
│   ├── pages/
│   │   ├── HomePage.jsx            # Landing page with hero and features
│   │   ├── SetupPage.jsx           # Subject configuration form
│   │   ├── DashboardPage.jsx       # Schedule, progress, and analytics
│   │   └── AIToolsPage.jsx         # PDF upload, AI study plan, chatbot
│   ├── components/
│   │   ├── Navbar.jsx              # Responsive navigation bar
│   │   ├── FormComponent.jsx       # Subject input form
│   │   ├── DailyPlanTable.jsx      # Editable daily schedule table
│   │   ├── ProgressTracker.jsx     # Log actual study hours
│   │   ├── StatusIndicators.jsx    # Quick-glance stat cards
│   │   └── Charts/
│   │       ├── ProgressBar.jsx     # Animated progress bar
│   │       ├── SubjectPieChart.jsx # Subject time distribution
│   │       └── PlannedVsActualChart.jsx
│   └── utils/
│       ├── PlannerEngine.js        # Study plan generation algorithm
│       └── storage.js             # localStorage persistence

---

## Study Plan Algorithm

The planner uses a weighted priority formula to distribute study hours:
priority = (difficulty × 0.35) + (syllabus_size × 0.30) + (urgency × 0.35)

Where:
- **Difficulty**: Easy (1) → Hard (5)
- **Syllabus size**: Small (1) → Large (5)
- **Urgency**: Inversely proportional to days remaining until exam

Hours are distributed proportionally across subjects based on their normalized priority scores. When days are missed, deficit hours are automatically redistributed across remaining days with boosted priority.

---

## Deployment

### Frontend (S3 + CloudFront)
1. Build: `npm run build`
2. Upload `dist` contents to S3 bucket with static hosting enabled
3. Configure CloudFront distribution pointing to S3 website endpoint
4. Create CloudFront invalidation (`/*`) after each deployment

### Backend (Render)
1. Connect GitHub repo to Render as a Web Service
2. Set runtime to Python 3.11
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variable: `OPENAI_API_KEY`

---

## License

MIT

---

Built with ♥ by [Saharsh Saraf](https://github.com/saharshsaraf03)
