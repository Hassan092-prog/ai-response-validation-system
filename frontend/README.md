# Frontend Architecture: AI Response Validation System

> **Client Application:** React 18 SPA (Vite) with Custom Glassmorphism CSS, Recharts, and jsPDF  
> **Backend Integration:** FastAPI REST API on port `8005` (`config.js`)  

---

## 1. Component Hierarchy & Module Layout

```text
src/
├── main.jsx                   # React root mounting and StrictMode initialization
├── App.jsx                    # Core Shell, Navigation Bar, Single Evaluation Form,
│                              # Source Context Drag-Drop, Real-time Latency Telemetry
├── config.js                  # Dynamic API base URL resolution (relative vs. port 8005)
│
├── components / views:
│   ├── Results.jsx            # Single Evaluation Report, Radar Chart, Metric Badges
│   ├── SentenceHeatmap.jsx    # Sentence-level Hallucination Heatmap & Bidirectional Grounding
│   ├── BatchUpload.jsx        # CSV Batch Intake, Smart Risk Filtering, In-Row Claim Accordion,
│   │                          # CI/CD Webhook Notification Form (callback_url & secret)
│   ├── BatchAnalyticsView.jsx # Batch Aggregates, Save as Golden Benchmark Modal, PDF/CSV Export
│   ├── Benchmarks.jsx         # Golden Benchmarks Catalog, Regression Comparison Runner,
│   │                          # Per-Dimension Delta Table, Verdict Banners (REGRESSION_DETECTED)
│   ├── KnowledgeBase.jsx      # Document Drag-Drop Ingestion, ChromaDB Status, Semantic Search
│   └── AnalyticsDashboard.jsx # Historical Metrics, 365-Day Activity Heatmap,
│                              # Configurable Scoring Penalty Sliders (/api/config/weights)
│
└── styles:
    ├── App.css                # Glassmorphic styling, Dark/Light theme variables, badges
    └── index.css              # Global typography, resets, and layout defaults
```

---

## 2. Key UI Capabilities

* **Bidirectional Grounding Heatmap ([`SentenceHeatmap.jsx`](src/SentenceHeatmap.jsx)):** Discrete sentence spans rendered with dynamic color-coding (green for supported, yellow for unverified, red for hallucination). Clicking any highlighted sentence illuminates the corresponding passage in the source document.
* **Header Telemetry Monitor ([`App.jsx`](src/App.jsx)):** Real-time pulsing status pill measuring roundtrip API health and inference stopwatch latency.
* **CI/CD Webhook Integration ([`BatchUpload.jsx`](src/BatchUpload.jsx)):** Expandable configuration card enabling users to specify a callback URL and secret for HMAC-SHA256 signed batch notifications.
* **Golden Benchmarks & Regression Analysis ([`Benchmarks.jsx`](src/Benchmarks.jsx)):** Interactive catalog of saved baselines with candidate batch comparison runner, calculating dimension deltas and automated regression verdicts.
* **Knowledge Base Explorer ([`KnowledgeBase.jsx`](src/KnowledgeBase.jsx)):** Vector store status card, drag-and-drop document upload, and interactive semantic search playground with cosine similarity distance badges.
* **Client-Side PDF Generation ([`BatchAnalyticsView.jsx`](src/BatchAnalyticsView.jsx)):** Native PDF reports generated in-browser via `jsPDF` and `jspdf-autotable`.

---

## 3. Environment & Configuration

API base URL is dynamically resolved in [`src/config.js`](src/config.js):
```javascript
// In development (port 5173 / 3000), points to local FastAPI on 8005.
// In production Docker, uses relative path (single unified port 8005).
export const API_BASE = window.location.port === '5173' || window.location.port === '3000'
  ? `http://${window.location.hostname}:8005`
  : '';
```

---

## 4. Development Scripts

```bash
# Install dependencies
npm install

# Start local development server with Hot Module Replacement (HMR)
npm run dev

# Run ESLint static analysis across all JSX and JS files
npm run lint

# Compile production distribution to dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 5. Testing & Code Quality

Frontend code adheres to React 18 best practices and is verified with ESLint:
```bash
npm run lint
```
*Status: **0 errors** across all source components.*
