import hashlib
from typing import Optional
from sqlalchemy.orm import Session
from backend.api import models

def normalize_text(text: Optional[str]) -> str:
    """Canonical text normalization: lowercase, strip, and collapse whitespace."""
    if not text:
        return ""
    return " ".join(str(text).lower().strip().split())

def compute_input_hash(
    question: str,
    ai_response: str,
    reference_answer: Optional[str] = None,
    source_document: Optional[str] = None
) -> str:
    """Computes a deterministic SHA-256 hash across canonical evaluation inputs."""
    norm_q = normalize_text(question)
    norm_a = normalize_text(ai_response)
    norm_ref = normalize_text(reference_answer)
    norm_src = normalize_text(source_document)

    # Use ASCII unit separator to prevent delimiter collision
    canonical_payload = f"{norm_q}\x1f{norm_a}\x1f{norm_ref}\x1f{norm_src}"
    return hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

def lookup_cache(
    db: Session,
    input_hash: str,
    exclude_id: Optional[int] = None
) -> Optional[models.EvaluationRecord]:
    """Finds the most recent completed evaluation matching the input hash."""
    query = (
        db.query(models.EvaluationRecord)
        .filter(
            models.EvaluationRecord.input_hash == input_hash,
            models.EvaluationRecord.status == "completed",
            models.EvaluationRecord.final_score.isnot(None),
            models.EvaluationRecord.result_json.isnot(None)
        )
    )
    if exclude_id is not None:
        query = query.filter(models.EvaluationRecord.id != exclude_id)
    return query.order_by(
        models.EvaluationRecord.created_at.desc(),
        models.EvaluationRecord.id.desc()
    ).first()

def clone_cached_record(
    cached: models.EvaluationRecord,
    batch_id: Optional[str] = None
) -> models.EvaluationRecord:
    """
    Creates a new EvaluationRecord from a cached hit, preserving all decomposed
    score metrics for analytical consistency.
    """
    input_hash = cached.input_hash or compute_input_hash(
        cached.question,
        cached.ai_response,
        cached.reference_answer,
        cached.source_document
    )
    return models.EvaluationRecord(
        question=cached.question,
        ai_response=cached.ai_response,
        reference_answer=cached.reference_answer,
        source_document=cached.source_document,
        status="completed",
        input_hash=input_hash,
        is_cached=True,
        result_json=cached.result_json,
        final_score=cached.final_score,
        score_relevance=cached.score_relevance,
        score_accuracy=cached.score_accuracy,
        score_completeness=cached.score_completeness,
        score_hallucination=cached.score_hallucination,
        batch_id=batch_id
    )
