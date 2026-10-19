# StudyFlow - AI Knowledge Base Assistant

StudyFlow is a full-stack study productivity platform that helps students organize subjects, upload study material, generate AI study plans, chat with documents, create quizzes, and track progress. The upgraded version uses persistent cloud storage and a production-style RAG pipeline powered by OpenAI embeddings and Amazon S3 Vectors.

**Live Demo:** [https://ddr1k3uxkbzvy.cloudfront.net](https://ddr1k3uxkbzvy.cloudfront.net)

---

## Overview

StudyFlow combines four major workflows:

- **Study planning:** create study schedules, log progress, handle missed days, and track completion.
- **Document library:** organize uploaded files by subject and chapter.
- **AI document intelligence:** generate study plans, summaries, notes, quizzes, and document Q&A.
- **Persistent RAG:** store semantic document embeddings in S3 Vectors for scalable retrieval across sessions and devices.

The app is designed so a student can upload course material once, keep it stored in the cloud, and continue using summaries, chats, notes, and study plans from any device.

---

## Key Features

### Authentication and Cloud Persistence

- AWS Cognito sign-up, login, and forgot-password flow.
- Backend JWT signature verification using Cognito JWKS.
- User-scoped cloud storage for planner data, subjects, chapters, documents, notes, chats, summaries, progress, profile, and settings (preferences and study defaults).
- Data persists across reloads and devices.
- Self-service account deletion from Settings: removes all DynamoDB items, uploaded S3 files, S3 Vectors, and the Cognito user.

### Subject and Chapter Library

- Create subjects and nested chapters.
- Upload documents at subject level or chapter level.
- Move documents between subjects and chapters.
- Accurate sidebar counts after reload, upload, move, and delete.
- Subject/chapter deletion cascades through related documents, notes, chats, files, and vectors.

### Document Uploads and Viewer

- Upload PDFs and other supported study files.
- Store original files in Amazon S3.
- Save document metadata and extracted text in DynamoDB.
- Generate fresh presigned S3 URLs every time a document is opened, so documents keep working after reload or a long idle session.
- In-app PDF viewer with page navigation and highlight-ready document experience.

### AI Study Tools

- Generate structured study plans and exhaustive exam-ready summaries from the full document text.
- Generate study notes from documents.
- Generate quiz questions and answers.
- Chat with a specific document (available before the document is analyzed).
- Chat across the full document library with source attribution.
- Semantic search across the library, with results that jump to the containing subject or chapter.

### Persistent RAG With S3 Vectors

- Splits document text into chunks.
- Generates embeddings with OpenAI `text-embedding-3-large` (1536 dims).
- Stores embeddings and chunk metadata in Amazon S3 Vectors.
- Uses vector search for document chat, global library chat, and semantic search. Analysis, notes, and quizzes read the full document text instead.
- Includes batch backfill for documents uploaded before vector indexing existed.
- Includes vector indexing status and retry controls.

### Study Planner

- Adaptive scheduling based on difficulty, syllabus size, urgency, and available hours.
- Progress tracking for studied hours and missed days.
- Prevents logging future days.
- Completion percentage calculation.
- Smart rescheduling for plan adjustments.
- Dashboard charts for progress and study distribution.

---

## Tech Stack

### Frontend

- React 18
- Vite
- React Router
- Tailwind CSS
- Recharts
- Lucide React
- Framer Motion
- pdfjs-dist
- mammoth
- tesseract.js
- jsPDF

### Backend

- FastAPI
- Python
- OpenAI API
- NumPy
- boto3
- PyJWT with Cognito JWKS verification

### AWS and Hosting

- AWS Cognito for authentication
- Amazon DynamoDB for application data
- Amazon S3 for original uploaded files
- Amazon S3 Vectors for embedding storage and semantic retrieval
- Amazon CloudFront for frontend CDN hosting
- Render for backend hosting

---

## Architecture

```mermaid
flowchart TD
    A["User"] --> B["React + Vite Frontend"]
    B --> C["AWS Cognito Auth"]
    C --> B
    B --> D["FastAPI Backend on Render"]
    D --> E["Cognito JWKS JWT Verification"]
    D --> F["DynamoDB"]
    D --> G["Amazon S3"]
    D --> H["OpenAI"]
    D --> I["Amazon S3 Vectors"]

    F --> F1["Subjects"]
    F --> F2["Chapters"]
    F --> F3["Document metadata"]
    F --> F4["Extracted text"]
    F --> F5["AI results"]
    F --> F6["Chats"]
    F --> F7["Notes"]
    F --> F8["Planner data"]

    G --> G1["Original uploaded PDFs/files"]
    I --> I1["Document chunk embeddings"]
    I --> I2["Searchable chunk metadata"]
    H --> H1["Embeddings"]
    H --> H2["Study plans, summaries, chats, quizzes"]
```

---

## Core RAG Pipeline

```mermaid
flowchart LR
    A["Upload document"] --> B["Extract text"]
    B --> C["Split text into chunks"]
    C --> D["Generate OpenAI embeddings"]
    D --> E["Store vectors in S3 Vectors"]
    E --> F["User asks question"]
    F --> G["Embed question"]
    G --> H["Query S3 Vectors"]
    H --> I["Retrieve relevant chunks"]
    I --> J["Send context to OpenAI"]
    J --> K["Return answer with sources"]
```

### Vector Metadata

Each stored vector includes metadata such as:

- `userId`
- `docId`
- `subjectId`
- `chapterId`
- `locationType`
- `fileName`
- `chunkIndex`
- `embeddingVersion`
- `text`

This allows user-scoped and document-scoped semantic retrieval.

---

## Application Data Model

```text
DynamoDB
  USER#{userId} / PLANNER
  USER#{userId} / PROFILE
  USER#{userId} / SUBJECT#{subjectId}
  USER#{userId} / CHAPTER#{subjectId}#{chapterId}
  USER#{userId} / SDOC#{subjectId}#{docId}
  USER#{userId} / CDOC#{chapterId}#{docId}
  USER#{userId} / SNOTE#{subjectId}
  USER#{userId} / CNOTE#{chapterId}
  USER#{userId} / CHAT#DOC#{docId}
  USER#{userId} / CHAT#GLOBAL

Amazon S3
  Original uploaded files

Amazon S3 Vectors
  Chunk embeddings and chunk metadata
```

---

## Problems Solved During Upgrade

### PDF reload persistence

**Problem:** Uploaded PDFs opened correctly immediately after upload, but after a site reload the document viewer showed "No PDF available."

**Cause:** The app depended on temporary frontend/session URLs instead of a persistent cloud file reference.

**Solution:** Store the permanent S3 object key in DynamoDB and generate fresh presigned S3 URLs whenever documents are listed or opened.

### Lazy chapter counts

**Problem:** The subject panel showed `0` chapters after reload until the subject was clicked.

**Cause:** Counts were derived lazily from frontend state instead of loaded from the backend.

**Solution:** Calculate chapter counts in backend list endpoints and keep sidebar counts updated after document moves, uploads, and deletes.

### Incomplete cloud cleanup

**Problem:** Deleting documents, subjects, or plans could leave related data behind.

**Solution:** Add cleanup across DynamoDB records, S3 files, chat history, and S3 Vector chunks.

### Weak JWT handling

**Problem:** JWT payloads were not being fully verified.

**Solution:** Verify Cognito JWT signatures using JWKS, issuer checks, and client ID validation.

### Inefficient RAG

**Problem:** Earlier RAG behavior recalculated document embeddings per request.

**Solution:** Store embeddings persistently in S3 Vectors and query them during document/global chat.

### Vector migration safety

**Problem:** Existing documents needed a safe way to enter the new vector index.

**Solution:** Add batch vector backfill from Settings and keep `VECTOR_RAG_ENABLED=false` until documents are indexed.

---

## Project Structure

```text
.
├── main.py                         # FastAPI backend and API routes
├── vector_store.py                 # S3 Vectors indexing/query/delete helpers
├── requirements.txt                # Python backend dependencies
├── package.json                    # Frontend dependencies and scripts
├── src/
│   ├── App.jsx                     # App routing and top-level state
│   ├── main.jsx                    # React entry point
│   ├── index.css                   # Global styles
│   ├── contexts/
│   │   ├── AuthContext.jsx         # Cognito auth state
│   │   └── ThemeContext.jsx        # Theme state
│   ├── pages/
│   │   ├── DashboardPage.jsx       # Study dashboard
│   │   ├── LibraryPage.jsx         # Subject/chapter/document workspace
│   │   ├── SettingsPage.jsx        # Profile, preferences, export, vector backfill, account deletion
│   │   ├── LoginPage.jsx
│   │   ├── SignupPage.jsx
│   │   └── ForgotPasswordPage.jsx
│   ├── components/
│   │   ├── DocumentViewer.jsx      # In-app PDF viewer
│   │   ├── ProgressTracker.jsx
│   │   └── library/
│   │       ├── SubjectPanel.jsx
│   │       ├── SubjectContent.jsx
│   │       ├── ChapterContent.jsx
│   │       ├── DocCard.jsx
│   │       ├── AnalysisPanel.jsx
│   │       ├── GlobalChatbot.jsx
│   │       ├── LibrarySearch.jsx   # Semantic search bar
│   │       ├── UploadModal.jsx
│   │       ├── MoveModal.jsx
│   │       └── NotesEditor.jsx
│   └── utils/
│       ├── api.js                  # Backend API client
│       ├── auth.js                 # Cognito helpers
│       └── PlannerEngine.js        # Study plan scheduling logic
```

---

## Local Development

### Prerequisites

- Node.js 18+
- npm
- Python 3.11+
- AWS account
- OpenAI API key

### Frontend

```bash
npm install
npm run dev
```

The dev server runs at:

```text
http://localhost:3000
```

The port is fixed (`strictPort` in `vite.config.js`), so if something else is using 3000, `npm run dev` exits instead of moving to 3001. Free the port rather than changing it, or Google sign-in will stop working (see below).

### Google sign-in (Cognito callback URLs)

"Continue with Google" sends users to the Cognito hosted UI with `redirect_uri` set to the origin the app is running on (`window.location.origin`). Cognito accepts it only if that exact string is listed under **Allowed callback URLs** on the app client (AWS console → Cognito → User pools → select the pool → App clients → select the client → Login pages → Edit; both IDs are in `src/utils/auth.js`):

```text
https://ddr1k3uxkbzvy.cloudfront.net
http://localhost:3000
```

The match is exact: no trailing slash, no path, and the same scheme and port. Any other origin (a different port, `127.0.0.1`, a new domain) needs its own entry, or Google sign-in fails with Cognito's "Something went wrong" page and `error=redirect_mismatch` in the URL.

### Backend

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Run FastAPI locally:

```bash
uvicorn main:app --reload
```

The frontend API client uses `VITE_API_BASE_URL` and falls back to the deployed Render backend. For local backend development, copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL=http://localhost:8000`.

---

## Environment Variables

Backend environment variables:

```env
OPENAI_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=ap-south-1
COGNITO_APP_CLIENT_ID=
ALLOWED_ORIGINS=

S3_VECTOR_REGION=ap-south-1
S3_VECTOR_BUCKET=studyflow-vectors-prod
S3_VECTOR_INDEX=studyflow-document-chunks-v1
EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_DIMENSIONS=1536
EMBEDDING_VERSION=2
VECTOR_RAG_ENABLED=true
VECTOR_INDEXING_ENABLED=true
```

`VECTOR_RAG_ENABLED` should stay `false` until existing documents have been backfilled into S3 Vectors.

Frontend environment variables (see `.env.example`):

```env
VITE_API_BASE_URL=            # defaults to the Render backend
VITE_COGNITO_OAUTH_SCOPES=    # optional; add aws.cognito.signin.user.admin to allow Google account deletion
```

---

## API Overview

All endpoints except `GET /` require a Cognito JWT. AI endpoints are rate limited (per-user burst limit plus a daily quota).

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /api/subjects/*`, `/api/chapters/*` | Subject and chapter CRUD |
| `/api/sdocs/*`, `/api/cdocs/*` | Subject/chapter documents, including `.../analyze` (full-text study plan + exam summary) |
| `POST /api/docs/upload-pdf`, `POST /api/docs/move` | Upload to S3, move documents |
| `POST /api/document-chat`, `POST /api/global-chat` | Document and library chat (vector RAG with legacy fallback) |
| `POST /api/search` | Semantic search; results include `subjectId`, `chapterId`, `locationType` |
| `POST /api/generate-notes`, `POST /api/generate-quiz` | Notes and quizzes from full document text |
| `GET/POST /api/profile` | Profile, preferences, and study defaults |
| `DELETE /api/account` | Delete all user data (DynamoDB, S3 files, S3 Vectors) |
| `POST /api/vectors/reindex`, `POST /api/vectors/migrate` | Vector index retry and batch backfill |
| `GET /api/usage`, `GET /api/export` | Usage stats and data export |

---

## Deployment

### Frontend: S3 + CloudFront

Build the frontend:

```bash
npm run build
```

Upload the contents of `dist/` to the S3 bucket used by CloudFront:

```text
dist/index.html
dist/vite.svg
dist/assets/
```

Upload the `assets` folder as a folder, not as loose files at the bucket root. Do not upload the parent `dist` folder itself.

After upload, create a CloudFront invalidation:

```text
/*
```

### Backend: Render

Deploy the FastAPI backend from the `main` branch (check the Render service's Build & Deploy branch setting).

Render should install:

```bash
pip install -r requirements.txt
```

Typical start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Vector RAG rollout

1. Deploy backend with `VECTOR_RAG_ENABLED=false`.
2. Deploy frontend.
3. Log in to StudyFlow.
4. Go to Settings -> Data & storage -> Index document library.
5. Click `Index batch` until it reports all documents indexed (it also re-embeds documents indexed under an older `EMBEDDING_VERSION`).
6. Change `VECTOR_RAG_ENABLED=true` on Render.
7. Redeploy backend.
8. Test document chat and global chat.

---

## Security Notes

- Uploaded files are stored privately in S3 and accessed only through short-lived presigned URLs (no public-read fallback).
- Document text and AI results are stored in DynamoDB.
- Chunk text is stored as S3 Vector metadata for retrieval, so vector storage must be treated as sensitive.
- Backend verifies Cognito JWT signatures before accessing user data.
- AI endpoints are rate limited with a per-user burst limiter and a DynamoDB-backed daily quota (`AI_DAILY_QUOTA`, `AI_BURST_MAX`, `AI_BURST_WINDOW_SECONDS`).
- CORS should include only trusted frontend origins in production.
- Account deletion removes DynamoDB items, S3 objects under `documents/{userId}/`, and S3 Vectors, then deletes the Cognito user. The backend IAM user needs `dynamodb:BatchWriteItem`, `s3:ListBucket`, and `s3:DeleteObject` for full cleanup.

---

## Validation

The upgraded project was validated with:

```bash
python -m py_compile main.py vector_store.py
npm run build
git diff --check
```

---

## License

MIT

---

Built by [Saharsh Saraf](https://github.com/saharshsaraf03)
