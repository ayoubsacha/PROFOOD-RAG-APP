from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AskRequest(BaseModel):
    question: str = Field(..., min_length=2, examples=["What equipment do I need for olive oil production?"])
    k: int | None = Field(default=None, ge=1, le=20, description="Number of chunks to retrieve")
    session_id: str | None = Field(default=None, description="Optional chat session id")
    filters: dict[str, Any] | None = Field(
        default=None,
        description="Optional Chroma metadata filter. Example: {'doc_type': 'equipment'}",
    )


class AskStreamRequest(AskRequest):
    voice_mode: bool = Field(
        default=False,
        description="Use the short spoken-answer prompt only for voice streaming.",
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
    session_id: str


class VoiceTranscribeResponse(BaseModel):
    transcript: str


class TtsSpeakRequest(BaseModel):
    text: str = Field(..., min_length=1)


class TtsSpeakResponse(BaseModel):
    audio_url: str


class IngestResponse(BaseModel):
    message: str
    loaded_documents: int
    created_chunks: int
    chroma_dir: str
    collection_name: str


class ChatSessionCreateRequest(BaseModel):
    title: str | None = Field(default=None, max_length=120)


class ChatMessage(BaseModel):
    role: str
    content: str
    sources: list[SourceChunk] = Field(default_factory=list)
    created_at: datetime


class ChatSessionSummary(BaseModel):
    id: str
    title: str
    user_id: str
    message_count: int
    last_message: str | None = None
    created_at: datetime
    updated_at: datetime


class ChatSession(ChatSessionSummary):
    messages: list[ChatMessage] = Field(default_factory=list)
