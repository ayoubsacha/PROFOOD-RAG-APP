from pathlib import Path
from typing import Annotated
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi import Depends
from app.auth import get_current_user

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.rag import _resolve_path, ask, ingest_pdfs, reset_vector_store
from app.schemas import AskRequest, AskResponse, IngestResponse

app = FastAPI(
    title="Profood Simple RAG API",
    description="FastAPI + LangChain + ChromaDB + Ollama starter RAG system for Profood.",
    version="0.1.0",
)

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def home():
    return FileResponse("static/index.html")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict:
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


@app.post("/ask", response_model=AskResponse)
def ask_question(
    payload: AskRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        user_id = current_user["user_id"]

        print("Current RAG user:", user_id)

        return ask(
            question=payload.question,
            k=payload.k,
            filters=payload.filters,
        )

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
