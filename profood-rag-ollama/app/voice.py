from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from faster_whisper import WhisperModel

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

    destination.write_bytes(content)
    return destination


@lru_cache(maxsize=1)
def _get_whisper_model() -> WhisperModel:
    return WhisperModel(
        settings.whisper_model_size,
        device="cpu",
        compute_type="int8",
    )


def transcribe_audio(file_path: str | Path) -> str:
    segments, _ = _get_whisper_model().transcribe(str(file_path), beam_size=5)
    transcript_parts = [segment.text.strip() for segment in segments if segment.text.strip()]

    return " ".join(transcript_parts).strip()
