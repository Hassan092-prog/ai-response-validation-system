from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class KBStatusResponse(BaseModel):
    available: bool
    collection_name: Optional[str] = None
    total_chunks: int = 0
    total_documents: int = 0
    embedding_model: Optional[str] = None
    reason: Optional[str] = None


class KBDocumentItem(BaseModel):
    doc_id: str
    filename: str
    chunk_count: int
    uploaded_at: Optional[str] = None
    sample_preview: Optional[str] = None


class KBDocumentsResponse(BaseModel):
    documents: List[KBDocumentItem]
    total_documents: int
    total_chunks: int


class KBSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Semantic search query")
    top_k: int = Field(5, ge=1, le=20, description="Number of nearest chunks to retrieve")


class KBSearchResultItem(BaseModel):
    chunk_id: str
    text: str
    distance: float
    similarity_score: float
    metadata: Dict[str, Any]


class KBSearchResponse(BaseModel):
    query: str
    results: List[KBSearchResultItem]
    count: int


class KBUploadResponse(BaseModel):
    success: bool
    doc_id: str
    filename: str
    chunks_added: int
    message: str

