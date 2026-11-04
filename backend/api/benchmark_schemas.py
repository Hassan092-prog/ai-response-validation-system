from datetime import datetime
from typing import Dict, Optional
from pydantic import BaseModel, ConfigDict, Field


class BenchmarkCreateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, description="Name of the golden benchmark")
    batch_id: str = Field(..., min_length=1, description="ID of the completed batch to use as baseline")
    description: Optional[str] = Field(None, max_length=500, description="Optional details about this baseline run")


class GoldenBenchmarkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: Optional[str] = None
    batch_id: str
    total_records: int
    avg_final_score: float
    avg_accuracy: float
    avg_relevance: float
    avg_completeness: float
    avg_hallucination: float
    pass_rate: float
    created_at: Optional[datetime] = None


class BenchmarkCompareRequest(BaseModel):
    comparison_batch_id: str = Field(..., min_length=1, description="ID of the new batch to evaluate for regressions")


class DeltaMetric(BaseModel):
    baseline: float
    current: float
    delta: str
    delta_numeric: float
    trend: str  # "improved" | "degraded" | "stable"


class BenchmarkCompareResponse(BaseModel):
    benchmark_id: int
    benchmark_name: str
    baseline_batch_id: str
    comparison_batch_id: str
    comparison_total_records: int
    deltas: Dict[str, DeltaMetric]
    overall_verdict: str  # "IMPROVED" | "STABLE" | "REGRESSION_DETECTED"
    verdict_reason: str
    triggered_at: datetime
