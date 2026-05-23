from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from faster_whisper import WhisperModel
from starlette.concurrency import run_in_threadpool

from app.config import settings


CONTENT_TYPE_SUFFIXES = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/mp4": ".mp4",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
}

WHISPER_MODEL = WhisperModel(
    settings.whisper_model_size,
    device="cpu",
    compute_type="int8",
    cpu_threads=settings.whisper_cpu_threads,
    num_workers=settings.whisper_num_workers,
)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)

    if path.is_absolute():
        return path

    return _project_root() / path


def _upload_suffix(file: UploadFile) -> str:
    filename_suffix = Path(file.filename or "").suffix.lower()

    if filename_suffix:
        return filename_suffix

    content_type = (file.content_type or "").split(";")[0].lower()
    return CONTENT_TYPE_SUFFIXES.get(content_type, ".webm")


async def save_uploaded_audio(file: UploadFile) -> Path:
    upload_dir = _resolve_path(settings.audio_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    destination = upload_dir / f"voice_{uuid4().hex}{_upload_suffix(file)}"
    content = await file.read()

    if not content:
        raise ValueError("Uploaded audio file is empty.")

    await run_in_threadpool(destination.write_bytes, content)
    return destination


def transcribe_audio(file_path: str | Path) -> str:
    segments, _ = WHISPER_MODEL.transcribe(
        str(file_path),
        beam_size=1,
        best_of=1,
        temperature=0.0,
        vad_filter=True,
        vad_parameters={
            "min_silence_duration_ms": settings.whisper_vad_min_silence_ms,
        },
        language=settings.whisper_language or None,
        condition_on_previous_text=False,
        without_timestamps=True,
    )
    transcript_parts = [segment.text.strip() for segment in segments if segment.text.strip()]

    return " ".join(transcript_parts).strip()
