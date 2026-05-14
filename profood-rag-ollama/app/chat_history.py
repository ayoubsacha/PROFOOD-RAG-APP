from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.db import get_chat_sessions_collection


class ChatSessionNotFound(Exception):
    pass


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_object_id(session_id: str) -> ObjectId:
    try:
        return ObjectId(session_id)
    except (InvalidId, TypeError) as exc:
        raise ChatSessionNotFound("Chat session not found") from exc


def _message_preview(messages: list[dict[str, Any]]) -> str | None:
    if not messages:
        return None

    latest = messages[-1]
    content = str(latest.get("content") or "").strip()

    if not content:
        return None

    return content[:120]


def _serialize_message(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "role": message.get("role"),
        "content": message.get("content"),
        "sources": message.get("sources") or [],
        "created_at": message.get("created_at"),
    }


def _serialize_session(document: dict[str, Any]) -> dict[str, Any]:
    messages = document.get("messages") or []

    return {
        "id": str(document["_id"]),
        "title": document.get("title") or "New chat",
        "user_id": document["user_id"],
        "messages": [_serialize_message(message) for message in messages],
        "message_count": len(messages),
        "last_message": _message_preview(messages),
        "created_at": document.get("created_at"),
        "updated_at": document.get("updated_at"),
    }


def _title_from_question(question: str | None) -> str:
    clean_question = (question or "").strip()

    if not clean_question:
        return "New chat"

    return clean_question[:80]


async def create_chat_session(user_id: str, title: str | None = None) -> dict[str, Any]:
    collection = get_chat_sessions_collection()
    now = _now()

    document = {
        "user_id": user_id,
        "title": _title_from_question(title),
        "messages": [],
        "created_at": now,
        "updated_at": now,
    }

    result = await collection.insert_one(document)
    document["_id"] = result.inserted_id

    return _serialize_session(document)


async def list_chat_sessions(user_id: str) -> list[dict[str, Any]]:
    collection = get_chat_sessions_collection()
    cursor = collection.find({"user_id": user_id}).sort("updated_at", -1)

    sessions: list[dict[str, Any]] = []

    async for document in cursor:
        sessions.append(_serialize_session(document))

    return sessions


async def get_chat_session(user_id: str, session_id: str) -> dict[str, Any] | None:
    collection = get_chat_sessions_collection()
    object_id = _to_object_id(session_id)
    document = await collection.find_one({"_id": object_id, "user_id": user_id})

    if not document:
        return None

    return _serialize_session(document)


async def ensure_chat_session(
    user_id: str,
    session_id: str | None,
    title: str | None = None,
) -> dict[str, Any]:
    if not session_id:
        return await create_chat_session(user_id=user_id, title=title)

    session = await get_chat_session(user_id=user_id, session_id=session_id)

    if not session:
        raise ChatSessionNotFound("Chat session not found")

    return session


async def add_user_message(user_id: str, session_id: str, content: str) -> None:
    collection = get_chat_sessions_collection()
    object_id = _to_object_id(session_id)
    now = _now()

    result = await collection.update_one(
        {"_id": object_id, "user_id": user_id},
        {
            "$push": {
                "messages": {
                    "role": "user",
                    "content": content,
                    "sources": [],
                    "created_at": now,
                }
            },
            "$set": {"updated_at": now},
        },
    )

    if result.matched_count == 0:
        raise ChatSessionNotFound("Chat session not found")


async def add_assistant_message(
    user_id: str,
    session_id: str,
    content: str,
    sources: list[dict[str, Any]],
) -> None:
    collection = get_chat_sessions_collection()
    object_id = _to_object_id(session_id)
    now = _now()

    result = await collection.update_one(
        {"_id": object_id, "user_id": user_id},
        {
            "$push": {
                "messages": {
                    "role": "assistant",
                    "content": content,
                    "sources": sources,
                    "created_at": now,
                }
            },
            "$set": {"updated_at": now},
        },
    )

    if result.matched_count == 0:
        raise ChatSessionNotFound("Chat session not found")


async def delete_chat_session(user_id: str, session_id: str) -> bool:
    collection = get_chat_sessions_collection()
    object_id = _to_object_id(session_id)
    result = await collection.delete_one({"_id": object_id, "user_id": user_id})

    return result.deleted_count == 1
