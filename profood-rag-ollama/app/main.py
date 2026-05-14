from pathlib import Path
from typing import Annotated

from fastapi import Body, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import get_current_user
from app.chat_history import (
    ChatSessionNotFound,
    add_assistant_message,
    add_user_message,
    create_chat_session,
    delete_chat_session,
    ensure_chat_session,
    get_chat_session,
    list_chat_sessions,
)
from app.config import settings
from app.rag import _resolve_path, ask, ingest_pdfs, reset_vector_store
from app.schemas import (
    AskRequest,
    AskResponse,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionSummary,
    IngestResponse,
)


app = FastAPI(
    title="Profood Simple RAG API",
    description="FastAPI + LangChain + ChromaDB + Ollama starter RAG system for Profood.",
    version="0.1.0",
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = PROJECT_ROOT / "static"

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=None)
def root() -> dict | FileResponse:
    index_file = STATIC_DIR / "index.html"

    if index_file.exists():
        return FileResponse(index_file)

    return {
        "message": "Profood Simple RAG API is running.",
        "docs": "/docs",
        "next_steps": [
            "Make sure Ollama is running.",
            "Run POST /ingest to load PDFs into Chroma.",
            "Run POST /ask to ask questions.",
        ],
    }


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "ollama_base_url": settings.ollama_base_url,
        "chat_model": settings.ollama_chat_model,
        "embedding_model": settings.ollama_embedding_model,
        "pdf_dir": str(_resolve_path(settings.pdf_dir)),
        "chroma_dir": str(_resolve_path(settings.chroma_dir)),
    }


@app.post("/ingest", response_model=IngestResponse)
def ingest(reset: bool = True) -> dict:
    try:
        return ingest_pdfs(reset=reset)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Ingestion failed. Check that Ollama is running and that the embedding "
                f"model is pulled. Original error: {exc}"
            ),
        ) from exc


@app.post("/chat/sessions", response_model=ChatSession)
async def create_session(
    payload: ChatSessionCreateRequest | None = Body(default=None),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["user_id"]
    title = payload.title if payload else None

    try:
        return await create_chat_session(user_id=user_id, title=title)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Chat session creation failed. Original error: {exc}",
        ) from exc


@app.get("/chat/sessions", response_model=list[ChatSessionSummary])
async def get_sessions(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    user_id = current_user["user_id"]

    try:
        return await list_chat_sessions(user_id=user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Chat session listing failed. Original error: {exc}",
        ) from exc


@app.get("/chat/sessions/{session_id}", response_model=ChatSession)
async def get_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["user_id"]

    try:
        session = await get_chat_session(user_id=user_id, session_id=session_id)
    except ChatSessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Chat session not found") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Chat session lookup failed. Original error: {exc}",
        ) from exc

    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return session


@app.delete("/chat/sessions/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = current_user["user_id"]

    try:
        deleted = await delete_chat_session(user_id=user_id, session_id=session_id)
    except ChatSessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Chat session not found") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Chat session deletion failed. Original error: {exc}",
        ) from exc

    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found")

    return {"message": "Chat session deleted."}


@app.post("/ask", response_model=AskResponse)
async def ask_question(
    payload: AskRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        user_id = current_user["user_id"]

        print("Current RAG user:", user_id)

        session = await ensure_chat_session(
            user_id=user_id,
            session_id=payload.session_id,
            title=payload.question,
        )
        session_id = session["id"]

        await add_user_message(
            user_id=user_id,
            session_id=session_id,
            content=payload.question,
        )

        rag_response = ask(
            question=payload.question,
            k=payload.k,
            filters=payload.filters,
        )

        await add_assistant_message(
            user_id=user_id,
            session_id=session_id,
            content=rag_response["answer"],
            sources=rag_response.get("sources", []),
        )

        return {
            "answer": rag_response["answer"],
            "sources": rag_response.get("sources", []),
            "session_id": session_id,
        }

    except ChatSessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Chat session not found") from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Question answering failed. Check that Ollama is running, models are pulled, "
                f"and documents have been ingested. Original error: {exc}"
            ),
        ) from exc


@app.post("/upload-pdfs")
async def upload_pdfs(files: Annotated[list[UploadFile], File(...)]) -> dict:
    pdf_dir = _resolve_path(settings.pdf_dir)
    pdf_dir.mkdir(parents=True, exist_ok=True)

    saved_files = []
    for file in files:
        filename = Path(file.filename or "uploaded.pdf").name
        if not filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Only PDF files are allowed: {filename}")

        destination = pdf_dir / filename
        content = await file.read()
        destination.write_bytes(content)
        saved_files.append(filename)

    return {
        "message": "PDF files uploaded. Run POST /ingest to add them to the vector database.",
        "saved_files": saved_files,
    }


@app.delete("/vector-store")
def delete_vector_store() -> dict:
    reset_vector_store()
    return {"message": "Chroma vector store reset."}
