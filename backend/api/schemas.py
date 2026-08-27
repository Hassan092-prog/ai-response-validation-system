from pydantic import BaseModel, Field
from typing import Optional

class EvaluationInput(BaseModel):
    """
    Pydantic Schema used to validate the JSON data coming from our React frontend.
    """
    question: str = Field(..., description="The original question asked by the user")
    ai_response: str = Field(..., description="The AI generated response to evaluate")
    reference_answer: Optional[str] = Field(None, description="Optional ground truth answer")
    source_document: Optional[str] = Field(None, description="Optional source context")

class EvaluationResponse(BaseModel):
    """
    Pydantic Schema for the response sent back to the React frontend upon success.
    """
    id: int
    message: str
