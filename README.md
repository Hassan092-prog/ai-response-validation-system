# AI Response Validation System with Hallucination Detection Assistance

This repository contains the implementation for the **Infosys Springboard Internship 7.0** project. 

## 🏆 Milestone 1 Overview

The goal of Milestone 1 was to establish the foundation of the evaluation system, including the knowledge base for RAG (Retrieval-Augmented Generation) and the user interface for submitting evaluation requests.

### Objectives Achieved:
1. **Research & Technical Understanding (M1.1)**: Formally documented in `docs/research.md`.
2. **System Architecture (M1.2)**: Designed the agent orchestration flow and defined the tech stack, documented in `docs/architecture.md`.
3. **Evaluation Input Module (M1.3)**: Built a premium React (Vite) frontend for users to submit questions and AI responses, connected to a FastAPI backend that validates and stores the data in SQLite.
4. **Reference Knowledge Base (M1.4)**: Ingested `TruthfulQA` and `SQuAD` benchmark datasets, chunked the text, generated embeddings using `sentence-transformers`, and indexed them in a local ChromaDB vector store. 

---

## 💻 Tech Stack
* **Frontend:** React.js (Vite) with custom CSS (Glassmorphism design)
* **Backend:** FastAPI (Python)
* **Database:** SQLite (SQLAlchemy ORM)
* **Vector Store:** ChromaDB
* **Embeddings:** `sentence-transformers` (`all-MiniLM-L6-v2`)
* **Validation:** Pydantic

---

## 🚀 How to Run the Application

The application consists of a Python backend and a React frontend. You will need two terminal windows to run both simultaneously.

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

# (Optional) Re-seed the Knowledge Base if necessary
# python scripts/setup_kb.py

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

### 1. Test the UI and Database (M1.3)
1. Open `http://localhost:5173` in your browser.
2. Fill out the "Original Question" and "AI Generated Response" fields.
3. Click **Submit Evaluation**.
4. You should receive a green success message with an Evaluation ID. This confirms the React app successfully communicated with FastAPI, which validated the data and saved it to the SQLite `evaluations` table.

### 2. Test the RAG Knowledge Base Retrieval (M1.4)
To verify that the vector store correctly retrieves semantically relevant information from the ingested datasets:

Open a terminal (with the `venv` activated) and run the automated retrieval tests:
```bash
python tests/test_retrieval.py
```
This will query the ChromaDB vector store with predefined questions and print out the closest matching document chunks along with their mathematical semantic distance scores.
