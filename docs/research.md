# LLM Evaluation Techniques & RAG Architecture Research

This document outlines the foundation for our AI Response Validation System with Hallucination Detection Assistance. It summarizes key evaluation dimensions, RAG architecture, and existing evaluation frameworks (RAGAS and TruLens) that inform our design.

## 1. LLM Evaluation Dimensions

Evaluating AI responses requires moving beyond simple string matching. We focus on four key dimensions:
- **Relevance**: Does the response directly answer the user's question without unnecessary digression?
- **Accuracy/Faithfulness**: Is the response factually correct based on the provided reference material?
- **Hallucination**: Does the model generate plausible-sounding but completely fabricated information that is absent from the source context?
- **Completeness**: Does the response cover all aspects of the user's prompt?

## 2. Hallucination Detection Approaches

Detecting hallucinations typically falls into two buckets:
- **Reference-based**: Comparing the generated output against a trusted knowledge base (like RAG context). If the output makes claims not supported by the reference, it's flagged as a hallucination.
- **Claim Decomposition (Reference-free)**: Breaking the AI's response down into individual, testable claims, and verifying each independently (often using a judge LLM or external search).

For Milestone 1, we rely heavily on reference-based evaluation via a RAG pipeline to ground the evaluation.

## 3. RAG Architecture Overview

Retrieval-Augmented Generation (RAG) grounds the LLM in factual context. A standard pipeline involves:
1. **Ingestion & Chunking**: Splitting large source documents into smaller, semantically meaningful chunks to fit within context windows and improve retrieval precision.
2. **Embedding**: Converting text chunks into high-dimensional vector representations (e.g., using `sentence-transformers`).
3. **Vector Database**: Storing embeddings for fast similarity search (we use ChromaDB).
4. **Retrieval**: When a query comes in, it's embedded, and the system retrieves the top-K most semantically similar chunks from the vector database to provide as context.

## 4. Existing Frameworks: RAGAS & TruLens

Our system builds on principles from leading evaluation frameworks:
- **RAGAS (Retrieval Augmented Generation Assessment)**: Focuses heavily on metrics like context precision, context recall, faithfulness, and answer relevance. It essentially uses LLMs to score other LLMs against a retrieved context.
- **TruLens**: Emphasizes the "RAG Triad" - Context Relevance, Groundedness (Faithfulness), and Answer Relevance. It provides a structured way to track these metrics over time.

Both tools heavily rely on the "LLM-as-a-Judge" paradigm.

## 5. LLM-as-a-Judge

Using an LLM to evaluate another LLM is scalable and correlates well with human judgment when prompted correctly. Instead of complex, brittle heuristic scripts, we define specific, constrained prompts for an LLM to grade an answer on a scale (e.g., 1-5) and provide reasoning. This is the core logic behind our Relevance, Accuracy, and Completeness judge agents.
