from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2"
    ollama_embedding_model: str = "nomic-embed-text"

    # Chroma / data
    chroma_dir: str = "./data/chroma"
    pdf_dir: str = "./data/pdfs"
    collection_name: str = "profood_rag"

    # RAG
    chunk_size: int = 900
    chunk_overlap: int = 150
    top_k: int = 4

    # JWT
    jwt_secret: str = ""
    jwt_expires_in: str = "7d"

    # MongoDB for chat history
    mongo_uri: str = ""
    rag_db_name: str = "profood_rag"

    # Optional if PORT exists in .env
    port: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()