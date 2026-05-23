from __future__ import annotations

import base64
from pathlib import Path
from uuid import uuid4

import requests
from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

from app.config import settings


ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)

    if path.is_absolute():
        return path

    return _project_root() / path


def _image_suffix(file: UploadFile) -> str:
    content_type = (file.content_type or "").split(";")[0].lower()

    if content_type in ALLOWED_IMAGE_TYPES:
        return ALLOWED_IMAGE_TYPES[content_type]

    filename_suffix = Path(file.filename or "").suffix.lower()

    if filename_suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return ".jpg" if filename_suffix == ".jpeg" else filename_suffix

    return ".png"


async def save_uploaded_image(file: UploadFile) -> Path:
    content_type = (file.content_type or "").split(";")[0].lower()

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise ValueError("Only PNG, JPG, JPEG, and WEBP images are supported.")

    content = await file.read()

    if not content:
        raise ValueError("Uploaded image file is empty.")

    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("Image is too large. Maximum size is 5MB.")

    upload_dir = _resolve_path(settings.image_upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    destination = upload_dir / f"image_{uuid4().hex}{_image_suffix(file)}"
    await run_in_threadpool(destination.write_bytes, content)

    return destination


def analyze_image_with_llava(image_path: str, question: str | None = None) -> str:
    prompt_parts = [
        (
            "You are a visual assistant for ProFood, a B2B marketplace for food products, "
            "professional equipment, suppliers, and services. Analyze this image. Identify "
            "if it shows professional equipment, food product, packaging, storage, delivery, "
            "document, or another business object. Give a concise technical description in "
            "French. Mention visible features that are useful for a RAG assistant. Do not "
            "invent details you cannot see."
        )
    ]

    if question:
        prompt_parts.append(f"User question: {question}")

    image_bytes = Path(image_path).read_bytes()
    image_base64 = base64.b64encode(image_bytes).decode("utf-8")

    response = requests.post(
        f"{settings.ollama_base_url.rstrip('/')}/api/generate",
        json={
            "model": settings.ollama_vision_model,
            "prompt": "\n\n".join(prompt_parts),
            "images": [image_base64],
            "stream": False,
        },
        timeout=180,
    )
    response.raise_for_status()

    payload = response.json()
    description = (payload.get("response") or "").strip()

    if not description:
        raise RuntimeError("Ollama vision model returned an empty image description.")

    return description
