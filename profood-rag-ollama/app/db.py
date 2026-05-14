from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.config import settings


_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    global _client

    if not settings.mongo_uri:
        raise RuntimeError("MONGO_URI is missing in FastAPI .env")

    if _client is None:
        _client = AsyncIOMotorClient(settings.mongo_uri)

    return _client


def get_database() -> AsyncIOMotorDatabase:
    return get_client()[settings.rag_db_name]


def get_chat_sessions_collection() -> AsyncIOMotorCollection:
    return get_database()["chat_sessions"]
