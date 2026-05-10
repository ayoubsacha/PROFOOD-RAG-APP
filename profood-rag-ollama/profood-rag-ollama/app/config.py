from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.2"
    ollama_embedding_model: str = "nomic-embed-text"
    jwt_secret: str = ""

    chroma_dir: str = "./data/chroma"
    pdf_dir: str = "./data/pdfs"
    collection_name: str = "profood_rag"

    chunk_size: int = 900
    chunk_overlap: int = 150
    top_k: int = 4


settings = Settings()
