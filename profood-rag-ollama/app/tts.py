from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import edge_tts

from app.config import settings


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)

    if path.is_absolute():
        return path

    return _project_root() / path


async def text_to_speech(text: str) -> str:
    output_dir = _resolve_path(settings.tts_output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"answer_{uuid4().hex}.mp3"
    output_path = output_dir / filename

    communicate = edge_tts.Communicate(text, settings.tts_voice)
    await communicate.save(str(output_path))

    return f"/static/tts/{filename}"
