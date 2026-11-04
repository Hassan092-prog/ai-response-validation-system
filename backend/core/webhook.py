import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger(__name__)


def sign_payload(secret: str, payload_bytes: bytes) -> str:
    """
    Computes HMAC-SHA256 signature for the given payload using the shared secret.
    """
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


def verify_signature(secret: str, payload_bytes: bytes, signature_header: str) -> bool:
    """
    Verifies an incoming HMAC-SHA256 signature header against the payload.
    Expected header format: 'sha256=<hex_digest>'
    """
    if not signature_header:
        return False
    parts = signature_header.split("=", 1)
    if len(parts) != 2 or parts[0].strip().lower() != "sha256":
        return False
    expected_sig = parts[1].strip()
    computed_sig = sign_payload(secret, payload_bytes)
    return hmac.compare_digest(expected_sig, computed_sig)


def build_batch_webhook_payload(batch_id: str, records: List[Any]) -> Dict[str, Any]:
    """
    Constructs the canonical webhook payload summarizing a finished batch evaluation.
    """
    total = len(records)
    completed = [r for r in records if getattr(r, "status", None) == "completed"]
    failed = [r for r in records if getattr(r, "status", None) == "failed"]

    comp_count = len(completed)

    def safe_float(val: Any, default: float = 0.0) -> float:
        try:
            return float(val) if val is not None else default
        except (ValueError, TypeError):
            return default

    avg_final = round(sum(safe_float(getattr(r, "final_score", 0.0)) for r in completed) / comp_count, 1) if comp_count > 0 else 0.0
    pass_count = sum(1 for r in completed if safe_float(getattr(r, "final_score", 0.0)) >= 70.0)
    pass_rate = round((pass_count / comp_count) * 100, 1) if comp_count > 0 else 0.0

    avg_acc = round(sum(safe_float(getattr(r, "score_accuracy", 0.0)) for r in completed) / comp_count, 2) if comp_count > 0 else 0.0
    avg_rel = round(sum(safe_float(getattr(r, "score_relevance", 0.0)) for r in completed) / comp_count, 2) if comp_count > 0 else 0.0
    avg_comp = round(sum(safe_float(getattr(r, "score_completeness", 0.0)) for r in completed) / comp_count, 2) if comp_count > 0 else 0.0
    avg_hal = round(sum(safe_float(getattr(r, "score_hallucination", 0.0)) for r in completed) / comp_count, 2) if comp_count > 0 else 0.0

    return {
        "event": "batch.completed",
        "batch_id": batch_id,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "total_records": total,
        "completed_records": comp_count,
        "failed_records": len(failed),
        "summary": {
            "avg_final_score": avg_final,
            "pass_rate_percent": pass_rate,
            "avg_accuracy": avg_acc,
            "avg_relevance": avg_rel,
            "avg_completeness": avg_comp,
            "avg_hallucination": avg_hal
        }
    }


def deliver_batch_webhook(
    batch_id: str,
    callback_url: str,
    webhook_secret: Optional[str] = None,
    records: Optional[List[Any]] = None
) -> bool:
    """
    Sends an HTTP POST webhook callback with an HMAC-SHA256 signature to callback_url.
    Returns True if delivery succeeded (HTTP 2xx), False otherwise.
    """
    if not callback_url:
        return False

    if records is None:
        from backend.api.database import SessionLocal
        from backend.api import models
        db = SessionLocal()
        try:
            records = db.query(models.EvaluationRecord).filter(models.EvaluationRecord.batch_id == batch_id).all()
        finally:
            db.close()

    payload_dict = build_batch_webhook_payload(batch_id, records)
    payload_bytes = json.dumps(payload_dict, separators=(",", ":")).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ARVS-Webhook-Delivery/1.0"
    }

    if webhook_secret:
        sig = sign_payload(webhook_secret, payload_bytes)
        headers["X-ARVS-Signature"] = f"sha256={sig}"

    logger.info(f"Delivering webhook for batch {batch_id} to {callback_url}...")
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(callback_url, content=payload_bytes, headers=headers)
            if 200 <= response.status_code < 300:
                logger.info(f"Webhook for batch {batch_id} delivered successfully (HTTP {response.status_code}).")
                return True
            else:
                logger.warning(f"Webhook delivery for batch {batch_id} returned HTTP {response.status_code}: {response.text[:200]}")
                return False
    except Exception as e:
        logger.error(f"Failed to deliver webhook for batch {batch_id} to {callback_url}: {e}")
        return False
