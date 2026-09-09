# AI Response Validation System with Hallucination Detection Assistance

This repository contains the implementation for the **Infosys Springboard Internship 7.0** project. 

## 🏆 Milestone 1 Overview

The goal of Milestone 1 was to establish the foundation of the evaluation system, including the knowledge base for RAG (Retrieval-Augmented Generation) and the user interface for submitting evaluation requests.

### Objectives Achieved:
1. **Research & Technical Understanding (M1.1)**: Formally documented in `docs/research.md`.
2. **System Architecture (M1.2)**: Designed the agent orchestration flow and defined the tech stack, documented in `docs/architecture.md`.
3. **Evaluation Input Module (M1.3)**: Built a React (Vite) frontend for users to submit questions and AI responses, connected to a FastAPI backend that validates and stores data in SQLite.
4. **Reference Knowledge Base (M1.4)**: Ingested `TruthfulQA` and `SQuAD` benchmark datasets, chunked the text, generated embeddings using `sentence-transformers`, and indexed them in a local ChromaDB vector store. 

---

## 🏆 Milestone 2 Overview

The goal of Milestone 2 was to build and integrate the Evaluation Judge Agents to score AI responses based on specific criteria and provide detailed reasoning, strictly adhering to the mentor requirements.

### Objectives Achieved:
1. **Relevance Judge Agent (M2.1)**: Built an agent to evaluate whether the AI-generated response directly addresses the user's question. Handles fully relevant, partially relevant, and off-topic responses, providing a score and detailed explanation.
2. **Accuracy Judge Agent (M2.2)**: Developed an agent to check factual correctness against reference answers or RAG-retrieved source chunks. It identifies correct, partially correct, incorrect, and contradictory claims with supporting evidence.
3. **Hallucination Detection Agent (M2.3)**: Implemented an agent to cross-reference AI claims against retrieved source content, breaking down responses to flag specific unsupported, fabricated, or contradictory statements.
4. **Agent Evaluation & Validation (M2.4)**: Tested the agents using benchmark datasets for scoring consistency and reasoning quality. Integrated them concurrently into the `Evaluation Orchestrator` to evaluate the same dataset inputs and consolidate the results.

---

## ✨ Extra Features & UI Updates

In addition to the core mentor requirements, we have significantly enhanced the application with the following features:
* **Interactive UI Dashboard**: The frontend dynamically renders an interactive Radar Chart breakdown and evaluation report immediately upon submission.
* **Analytics Module**: A dedicated Analytics Tab aggregates metrics from the database and visualizes the average performance over time using Recharts.
* **History & Data Exports**: A server-side paginated History Tab that allows users to export their evaluation datasets to `CSV` and `JSON` formats.
* **Backend Performance Optimization**: Refactored the SQLite database to extract nested JSON scores into indexed `Float` columns. Used native SQLAlchemy `func.avg()` aggregations and `.yield_per(100)` streaming generators to ensure the application scales safely without running out of memory.
* **Dynamic Test Data Engine**: Included a "Test Data" button in the UI that auto-fills fields with 4 randomized edge-case scenarios (Perfect, Partial, Inaccurate, Irrelevant) for quick debugging.

---

## 💻 Tech Stack
* **Frontend:** React.js (Vite) with custom CSS (Glassmorphism design, Lucide icons, Recharts)
* **Backend:** FastAPI (Python)
* **LLM API:** Google Gemini API (`google.generativeai`)
* **Database:** SQLite (SQLAlchemy ORM)
* **Vector Store:** ChromaDB
* **Embeddings:** `sentence-transformers` (`all-MiniLM-L6-v2`)
* **Validation:** Pydantic

---

## 🚀 How to Run the Application

The application consists of a Python backend and a React frontend. You will need two terminal windows to run both simultaneously.

### 0. Prerequisites
You must configure your Gemini API key for the Judge Agents to function.
1. Create a `.env` file in the root of the project (`ai-response-validation-system/.env`).
2. Add your API key:
   ```env
   GEMINI_API_KEY=your_google_api_key_here
   ```

### 1. Backend Setup (Terminal 1)
First, set up the Python virtual environment and start the FastAPI server.

```bash
# Clone the repository
git clone https://github.com/Hassan092-prog/ai-response-validation-system.git
cd ai-response-validation-system

# Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
uvicorn backend.api.main:app --host 0.0.0.0 --port 8001 --reload
```
The backend API will be running at: `http://localhost:8001`
Interactive API Docs (Swagger): `http://localhost:8001/docs`

### 2. Frontend Setup (Terminal 2)
Leave the backend running and open a new terminal.

```bash
# Navigate to the frontend directory
cd frontend

# Install Node dependencies
npm install

# Start the Vite development server
npm run dev
```
The frontend will be running at: `http://localhost:5173`

---

## 🧪 How to Test and Verify

### 1. Test the AI Judge Agents (M2.4 Validation)
To formally validate the consistency, reasoning quality, and scoring formats of the Relevance, Accuracy, and Hallucination agents, run the automated test script:
```bash
# Ensure your venv is activated
python scripts/validate_agents.py
```
This script will pump varied test cases through the agents and output their specific JSON evaluations directly to the console.

### 2. Test the UI and Database
1. Open `http://localhost:5173` in your browser.
2. Click **Test Data** to automatically inject a randomized testing scenario, or manually fill out the "Original Question" and "AI Generated Response" fields.
3. Click **Submit Evaluation**.
4. The React app will communicate with FastAPI and trigger the agent orchestrator. Once completed, the UI will dynamically render the detailed evaluation breakdown, including the final score and Radar Chart.
5. Navigate to the **Analytics** and **History** tabs to view aggregated metrics and export your records to CSV/JSON.

### 3. Test the RAG Knowledge Base Retrieval
To verify that the vector store correctly retrieves semantically relevant information from the ingested datasets:
```bash
python tests/test_retrieval.py
```
This will query the ChromaDB vector store with predefined questions and print out the closest matching document chunks along with their mathematical semantic distance scores.
