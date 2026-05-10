from typing import Any 

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, examples=["What equipment do I need for olive oil production?"])
    k: int | None = Field(default=None, ge=1, le=20, description="Number of chunks to retrieve")
    filters: dict[str, Any] | None = Field(
        default=None,
        description="Optional Chroma metadata filter. Example: {'doc_type': 'equipment'}",
    )


class SourceChunk(BaseModel):
    source: str | None = None
    page: int | None = None
    doc_type: str | None = None
    preview: str
    metadata: dict[str, Any]


class AskResponse(BaseModel):
    answer: str
    sources: list[SourceChunk]


class IngestResponse(BaseModel):
    message: str
    loaded_documents: int
    created_chunks: int
    chroma_dir: str
    collection_name: str
