# System Architecture: AI Response Validation System with Hallucination Detection Assistance

## Architecture Diagram
*A visual ASCII representation of how data flows from the user, through the backend, to the AI evaluation agents.*

```text
                       [User / Client]
                              │
                              ▼
        ┌──────────────────────────────────────────────┐
        │  Evaluation Input / User Interface (React)   │
        │ (Where users submit prompts and AI answers)  │
        └─────────────────────┬────────────────────────┘
                              │ (Question, AI Response, Optional Ref/Source)
                              ▼
        ┌──────────────────────────────────────────────┐
        │        Backend / API Layer (FastAPI)         │
        │ (Handles requests, routes data, validates it)│
        │  ┌────────────────────────────────────────┐  │
        │  │   Evaluation Input Processing Module   │  │
        │  └──────────────────┬─────────────────────┘  │
        └─────────────────────┼────────────────────────┘
                              │
               ┌──────────────┼──────────────┐
               ▼              ▼              ▼
┌──────────────────┐  ┌─────────────┐  ┌───────────────────────────┐
│    Evaluation    │  │  Reference  │  │ Reference Knowledge Base  │
│    Submission    │  │  Answer /   │  │  (ChromaDB Vector Store)  │
│     Database     │  │   Source    │  │ (Provides verified facts) │
│     (SQLite)     │  │  Evidence   │  │ ┌───────────────────────┐ │
│ (Stores history) │  │   Module    │  │ │RAG Retrieval Pipeline │ │
└──────────────────┘  └──────┬──────┘  └─────────────┬─────────────┘
                             │                       │
                             ▼                       ▼
      ┌──────────────────────────────────────────────────────────┐
      │      AI Evaluation Agent Layer (Agent Orchestrator)      │
      │     (The manager routing data to specialized judges)     │
      │                                                          │
      │ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ │
      │ │   Relevance    │ │    Accuracy    │ │  Completeness  │ │
      │ │  Judge Agent   │ │  Judge Agent   │ │  Judge Agent   │ │
      │ │ (Checks topic) │ │ (Checks facts) │ │  (Checks all)  │ │
      │ └────────────────┘ └────────────────┘ └────────────────┘ │
      │                                                          │
      │ ┌────────────────┐ ┌────────────────┐                    │
      │ │ Hallucination  │ │ Verdict Agent  │                    │
      │ │Detection Agent │ │  (Aggregator)  │                    │
      │ │(Hunts for lies)│ │(Computes grade)│                    │
      │ └────────────────┘ └────────────────┘                    │
      └────────────────────────────┬─────────────────────────────┘
                                   │
                                   ▼
      ┌──────────────────────────────────────────────────────────┐
      │           Structured Evaluation Results Module           │
      │ ┌──────────────────────────────────────────────────────┐ │
      │ │  Results & Evaluation Dashboard / Report Generation  │ │
      │ │   (Displays the final report with all rationales)    │ │
      │ └──────────────────────────────────────────────────────┘ │
      └──────────────────────────────────────────────────────────┘
```

*Note: The Knowledge Base is populated via a separate pipeline consisting of: Benchmark Dataset Ingestion Module -> Data Cleaning & Chunking Pipeline -> Embedding Generation Module -> Vector Database.*

## Tech Stack
*The core technologies powering the frontend, backend, database, and AI reasoning layers.*

- **Frontend**: React.js (via Vite) with pure CSS for a modern, glassmorphism UI.
- **Backend**: FastAPI (Python) for high-performance API routing and validation.
- **Data Validation**: Pydantic for strict schema enforcement.
- **Relational Database**: SQLite via SQLAlchemy for storing evaluation submissions.
- **Vector Database**: ChromaDB for semantic search and RAG implementation.
- **Embeddings**: `sentence-transformers` (`all-MiniLM-L6-v2`) for local, fast text vectorization.
- **Datasets**: Hugging Face Datasets (`squad`, `truthful_qa`).

## Deployment Architecture (Docker)
*To ensure a seamless, production-ready deployment, the application utilizes a multi-stage Docker containerization strategy.*

- **Stage 1 (Frontend Build)**: A `Node.js` environment compiles the Vite React application into static HTML/CSS/JS files.
- **Stage 2 (Backend Integration)**: A lightweight `Python 3.10-slim` environment installs the AI dependencies (FastAPI, Langchain, ChromaDB). It then copies the compiled static frontend files from Stage 1 into the backend's directory structure.
- **Unified Port Delivery**: The FastAPI server is configured using `StaticFiles` to natively mount and serve the React frontend alongside its API routes. This means the entire application—frontend UI and backend API—is seamlessly exposed over a single unified port (**8005**). This heavily simplifies network routing and proxy configurations (like NGINX).

## Agent Responsibilities
*The specialized AI judges responsible for independently analyzing different dimensions of the response.*

- **Agent Orchestrator**: Manages the lifecycle of a Single UI evaluation request. It takes the user submission, calls the RAG Retrieval Pipeline to fetch context, passes inputs to the specific judge agents concurrently via ThreadPool, and routes their outputs to the Verdict Agent.
- **Batch Orchestrator**: A specialized, high-performance module designed for M3.4 CSV uploads. It bypasses the multi-agent threadpool and uses a single Consolidated Master Prompt to evaluate all 4 dimensions in one API call, preventing API rate limit bottlenecks during bulk processing.
- **Relevance Judge Agent**: Evaluates how well the AI's response addresses the specific question asked. (Output: Score 1-5 + Reasoning).
- **Accuracy Judge Agent**: Evaluates the factual correctness of the AI's response, heavily weighting the reference answer and retrieved knowledge base context. (Output: Score 1-5 + Reasoning).
- **Hallucination Detection Agent**: Analyzes the response specifically for claims not supported by or directly contradicting the retrieved context. (Output: Score 1-5 where 5 is no hallucination and 1 is severe hallucination + Reasoning).
- **Completeness Judge Agent**: Assesses if the AI response covers all parts of the user prompt and provides a thorough answer. (Output: Score 1-5 + Reasoning + Missing Aspects).
- **Verdict Agent**: Aggregates the scores and reasoning from all judge agents to compute a final, holistic evaluation score and executive summary.

## Scoring Dimensions and Verdict Formula
*The mathematical logic used to calculate the final reliability score, which heavily penalizes any detected hallucinations.*

*Note: The weights listed below are the system defaults. These weights are globally dynamic and can be configured in real-time via the Analytics Dashboard Configuration API (`/api/config/weights`), which will instantly override the mathematical logic for all subsequent single and batch evaluations.*

- **Accuracy**: 1 (Completely Incorrect) to 5 (Highly Accurate) - *Default 40% Weight*
- **Relevance**: 1 (Completely Irrelevant) to 5 (Highly Relevant) - *Default 20% Weight*
- **Completeness**: 1 (Incomplete) to 5 (Comprehensive) - *Default 20% Weight*
- **Hallucination Penalty**: 1 (Severe Hallucination) to 5 (No Hallucination) - *Default 20% Weight*

**Verdict Aggregation Formula**:
`Final Score = ((Relevance / 5) * Weight) + ((Accuracy / 5) * Weight) + ((Completeness / 5) * Weight) + ((Hallucination / 5) * Weight)`
*(Final score capped dynamically based on total configured weights up to 100)*

**Automatic Fail Conditions**:
If `Final Score < 50` OR `Hallucination <= 2` OR `Accuracy <= 1`, the Verdict is automatically set to **FAIL**.

## Data Flow
*The step-by-step journey of a single evaluation request, from user submission to the final generated report.*

1. User submits evaluation payload (Question, AI Response, optional Ref/Source) via the React UI.
2. The payload hits the FastAPI backend and is stored in SQLite (status: "pending").
3. The Orchestrator extracts the Question and passes it to the RAG Retrieval Pipeline (if no explicit source doc was provided).
4. ChromaDB returns the top-K relevant chunks based on semantic similarity to the question.
5. The Orchestrator dispatches the Question, AI Response, and Retrieved Context to the Relevance, Accuracy, Completeness, and Hallucination agents.
6. Each agent returns a structured JSON output (score and rationale).
7. The Verdict Agent aggregates the scores and generates the final Evaluation Report.
8. The SQLite record is updated (status: "completed") with the final JSON results.
9. The Results Dashboard displays the final evaluation, allowing the user to view the interactive breakdown or export a styled PDF Validation Report.
10. The Analytics Engine asynchronously aggregates these results, updating the global filtering dashboard and tracking overarching AI performance metrics.
