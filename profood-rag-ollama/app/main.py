import asyncio
import json
from pathlib import Path
from threading import Event, Thread
from time import perf_counter
from typing import Annotated, Any

from fastapi import Body, Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

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
from app.image_vision import analyze_image_with_llava, save_uploaded_image
from app.rag import _resolve_path, ask, ingest_pdfs, reset_vector_store, stream_answer_chunks
from app.schemas import (
    AskRequest,
    AskResponse,
    AskStreamRequest,
    ChatSession,
    ChatSessionCreateRequest,
    ChatSessionSummary,
    ImageAskResponse,
    IngestResponse,
    TtsSpeakRequest,
    TtsSpeakResponse,
    VoiceTranscribeResponse,
)
from app.specialists import normalize_specialist_id
from app.tts import cleanup_expired_tts_files, text_to_speech
from app.voice import delete_audio_file, save_uploaded_audio, transcribe_audio


app = FastAPI(
    title="Profood Simple RAG API",
    description="FastAPI + LangChain + ChromaDB + Ollama starter RAG system for Profood.",
    version="0.1.0",
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = PROJECT_ROOT / "static"
TTS_STATIC_DIR = _resolve_path(settings.tts_output_dir)
TTS_STATIC_DIR.mkdir(parents=True, exist_ok=True)
_resolve_path(settings.audio_upload_dir).mkdir(parents=True, exist_ok=True)
cleanup_expired_tts_files()

app.mount("/static/tts", StaticFiles(directory=str(TTS_STATIC_DIR)), name="tts_static")
if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

def _allowed_cors_origins() -> list[str]:
    origins = [
        "http://localhost:4200",
        "http://127.0.0.1:4200",
    ]

    extra_origins = [
        origin.strip()
        for origin in settings.cors_extra_origins.split(",")
        if origin.strip()
    ]

    return [*origins, *extra_origins]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def _cleanup_expired_tts_loop() -> None:
    while True:
        await asyncio.sleep(max(settings.tts_cleanup_interval_seconds, 60))
        await run_in_threadpool(cleanup_expired_tts_files)


@app.on_event("startup")
async def start_tts_cleanup_loop() -> None:
    asyncio.create_task(_cleanup_expired_tts_loop())


def require_admin_user(current_user: dict = Depends(get_current_user)) -> dict:
    role = str(current_user.get("role") or "").strip().lower()

    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")

    return current_user


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _parse_filters(raw_filters: str | None) -> dict[str, Any] | None:
    if not raw_filters:
        return None

    try:
        parsed_filters = json.loads(raw_filters)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="filters must be valid JSON.") from exc

    if parsed_filters is None:
        return None

    if not isinstance(parsed_filters, dict):
        raise HTTPException(status_code=400, detail="filters must be a JSON object.")

    return parsed_filters


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
        "rag_sources_dir": str(_resolve_path(settings.rag_sources_dir)),
        "chroma_dir": str(_resolve_path(settings.chroma_dir)),
    }


@app.post("/ingest", response_model=IngestResponse)
async def ingest(
    reset: bool = True,
    current_user: dict = Depends(require_admin_user),
) -> dict:
    try:
        return await run_in_threadpool(ingest_pdfs, reset=reset)
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
    specialist = payload.specialist if payload else "general"

    try:
        return await create_chat_session(
            user_id=user_id,
            title=title,
            specialist=specialist,
        )
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
        specialist = normalize_specialist_id(payload.specialist)

        print("Current RAG user:", user_id)

        session = await ensure_chat_session(
            user_id=user_id,
            session_id=payload.session_id,
            title=payload.question,
            specialist=specialist,
        )
        session_id = session["id"]

        await add_user_message(
            user_id=user_id,
            session_id=session_id,
            content=payload.question,
            specialist=specialist,
        )

        rag_response = await run_in_threadpool(
            ask,
            question=payload.question,
            specialist=specialist,
            k=payload.k,
            filters=payload.filters,
        )

        await add_assistant_message(
            user_id=user_id,
            session_id=session_id,
            content=rag_response["answer"],
            sources=rag_response.get("sources", []),
            specialist=specialist,
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


@app.post("/image/ask", response_model=ImageAskResponse)
async def ask_image_question(
    file: Annotated[UploadFile, File(...)],
    question: Annotated[str, Form(...)],
    session_id: Annotated[str | None, Form()] = None,
    k: Annotated[int | None, Form()] = 4,
    filters: Annotated[str | None, Form()] = None,
    specialist: Annotated[str, Form()] = "general",
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        user_id = current_user["user_id"]
        normalized_specialist = normalize_specialist_id(specialist)
        clean_question = question.strip()

        if len(clean_question) < 2:
            raise ValueError("Question must contain at least 2 characters.")

        parsed_filters = _parse_filters(filters)

        upload_started = perf_counter()
        image_path = await save_uploaded_image(file)
        print(f"[timing] image upload/save time: {perf_counter() - upload_started:.3f}s")

        vision_started = perf_counter()
        image_description = await run_in_threadpool(
            analyze_image_with_llava,
            str(image_path),
            clean_question,
        )
        print(f"[timing] llava image analysis time: {perf_counter() - vision_started:.3f}s")

        enhanced_question = (
            f"User question: {clean_question}\n\n"
            f"Image description:\n{image_description}\n\n"
            "Answer using ProFood knowledge and retrieved sources."
        )

        session = await ensure_chat_session(
            user_id=user_id,
            session_id=session_id,
            title=clean_question,
            specialist=normalized_specialist,
        )
        resolved_session_id = session["id"]

        await add_user_message(
            user_id=user_id,
            session_id=resolved_session_id,
            content=f"{clean_question}\n\n[Image attached for ProFood visual analysis.]",
            specialist=normalized_specialist,
        )

        rag_started = perf_counter()
        rag_response = await run_in_threadpool(
            ask,
            question=enhanced_question,
            specialist=normalized_specialist,
            k=k,
            filters=parsed_filters,
        )
        print(f"[timing] image-enhanced RAG time: {perf_counter() - rag_started:.3f}s")

        await add_assistant_message(
            user_id=user_id,
            session_id=resolved_session_id,
            content=rag_response["answer"],
            sources=rag_response.get("sources", []),
            specialist=normalized_specialist,
        )

        return {
            "image_description": image_description,
            "answer": rag_response["answer"],
            "sources": rag_response.get("sources", []),
            "session_id": resolved_session_id,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ChatSessionNotFound as exc:
        raise HTTPException(status_code=404, detail="Chat session not found") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Image question answering failed. Check that Ollama is running, "
                f"{settings.ollama_vision_model} is pulled, and documents have been ingested. "
                f"Original error: {exc}"
            ),
        ) from exc


@app.post("/ask/stream")
async def ask_question_stream(
    payload: AskStreamRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    async def event_generator():
        user_id = current_user["user_id"]
        session_id: str | None = None
        answer_parts: list[str] = []
        sources: list[dict[str, Any]] = []
        stop_event: Event | None = None

        try:
            specialist = normalize_specialist_id(payload.specialist)

            print("Current streaming RAG user:", user_id)

            session = await ensure_chat_session(
                user_id=user_id,
                session_id=payload.session_id,
                title=payload.question,
                specialist=specialist,
            )
            session_id = session["id"]

            await add_user_message(
                user_id=user_id,
                session_id=session_id,
                content=payload.question,
                specialist=specialist,
            )

            yield _sse("session", {"session_id": session_id})

            loop = asyncio.get_running_loop()
            queue: asyncio.Queue[Any] = asyncio.Queue()
            done_marker = object()
            stop_event = Event()

            def queue_item(item: Any) -> None:
                asyncio.run_coroutine_threadsafe(queue.put(item), loop).result()

            def stream_worker() -> None:
                try:
                    for item in stream_answer_chunks(
                        question=payload.question,
                        specialist=specialist,
                        k=payload.k,
                        filters=payload.filters,
                        voice_mode=payload.voice_mode,
                        stop_event=stop_event,
                    ):
                        if stop_event.is_set():
                            break

                        queue_item(item)
                except Exception as exc:
                    queue_item({"type": "error", "message": str(exc)})
                finally:
                    queue_item(done_marker)

            Thread(target=stream_worker, daemon=True).start()

            while True:
                if await request.is_disconnected():
                    stop_event.set()
                    return

                try:
                    item = await asyncio.wait_for(queue.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    continue

                if item is done_marker:
                    break

                if item.get("type") == "error":
                    raise RuntimeError(item.get("message") or "Streaming failed.")

                if item.get("type") == "chunk":
                    text = item.get("text") or ""

                    if text:
                        answer_parts.append(text)
                        yield _sse("chunk", {"text": text})

                elif item.get("type") == "sources":
                    sources = item.get("sources") or []
                    yield _sse("sources", {"sources": sources})

            answer = "".join(answer_parts).strip()

            if answer:
                await add_assistant_message(
                    user_id=user_id,
                    session_id=session_id,
                    content=answer,
                    sources=sources,
                    specialist=specialist,
                )

            yield _sse("done", {"session_id": session_id})

        except ChatSessionNotFound:
            yield _sse("error", {"message": "Chat session not found."})
        except Exception as exc:
            print(f"[stream:error] {exc}")
            yield _sse("error", {"message": str(exc)})
        finally:
            if stop_event:
                stop_event.set()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/voice/transcribe", response_model=VoiceTranscribeResponse)
async def voice_transcribe(
    file: Annotated[UploadFile, File(...)],
    current_user: dict = Depends(get_current_user),
) -> dict:
    audio_path: Path | None = None

    try:
        upload_started = perf_counter()
        audio_path = await save_uploaded_audio(file)
        print(f"[timing] upload/save audio time: {perf_counter() - upload_started:.3f}s")

        stt_started = perf_counter()
        transcript = await run_in_threadpool(transcribe_audio, audio_path)
        print(f"[timing] STT transcription time: {perf_counter() - stt_started:.3f}s")

        return {"transcript": transcript}

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Voice transcription failed. Original error: {exc}",
        ) from exc
    finally:
        await run_in_threadpool(delete_audio_file, audio_path)


@app.post("/tts/speak", response_model=TtsSpeakResponse)
async def tts_speak(
    payload: TtsSpeakRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    text = payload.text.strip()

    if not text:
        raise HTTPException(status_code=400, detail="Text is required for speech synthesis.")

    try:
        tts_started = perf_counter()
        audio_url = await text_to_speech(text)
        print(f"[timing] TTS generation time: {perf_counter() - tts_started:.3f}s")
        return {"audio_url": audio_url}

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Text-to-speech generation failed. Original error: {exc}",
        ) from exc


@app.post("/upload-pdfs")
async def upload_pdfs(
    files: Annotated[list[UploadFile], File(...)],
    current_user: dict = Depends(require_admin_user),
) -> dict:
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
def delete_vector_store(current_user: dict = Depends(require_admin_user)) -> dict:
    reset_vector_store()
    return {"message": "Chroma vector store reset."}
