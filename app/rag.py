from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from langchain_chroma import Chroma
from langchain_community.document_loaders import PyPDFDirectoryLoader
from langchain_core.prompts import ChatPromptTemplate
from langchain_ollama import ChatOllama, OllamaEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings


PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            "You are Profood AI, a helpful assistant for a Moroccan marketplace app "
            "that contains food products, agriculture products, equipment, suppliers, "
            "articles, and forum knowledge.\n\n"
            "Rules:\n"
            "1. Answer using ONLY the context provided.\n"
            "2. If the context is not enough, say that Profood does not have enough data yet.\n"
            "3. Be practical and clear.\n"
            "4. When useful, mention which product/equipment/forum source supports the answer.\n"
            "5. Do not invent prices, sellers, or availability.\n\n"
            "Context:\n{context}",
        ),
        ("human", "Question: {question}"),
    ]
)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _resolve_path(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return _project_root() / path


def get_embeddings() -> OllamaEmbeddings:
    return OllamaEmbeddings(
        model=settings.ollama_embedding_model,
        base_url=settings.ollama_base_url,
    )


def get_llm() -> ChatOllama:
    return ChatOllama(
        model=settings.ollama_chat_model,
        base_url=settings.ollama_base_url,
        temperature=0.1,
    )


def get_vector_store() -> Chroma:
    chroma_dir = _resolve_path(settings.chroma_dir)
    chroma_dir.mkdir(parents=True, exist_ok=True)
    return Chroma(
        collection_name=settings.collection_name,
        embedding_function=get_embeddings(),
        persist_directory=str(chroma_dir),
    )


def _guess_doc_type(source_path: str) -> str:
    name = Path(source_path).name.lower()
    if "equipment" in name or "equipement" in name:
        return "equipment"
    if "forum" in name or "faq" in name:
        return "forum"
    if "product" in name or "produit" in name:
        return "product"
    return "document"


def load_pdf_documents() -> list:
    pdf_dir = _resolve_path(settings.pdf_dir)
    pdf_dir.mkdir(parents=True, exist_ok=True)
    loader = PyPDFDirectoryLoader(str(pdf_dir))
    docs = loader.load()

    for doc in docs:
        source = doc.metadata.get("source", "")
        doc.metadata["doc_type"] = _guess_doc_type(source)
        doc.metadata["source_file"] = Path(source).name if source else None

    return docs


def split_documents(docs: list) -> list:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_documents(docs)


def reset_vector_store() -> None:
    chroma_dir = _resolve_path(settings.chroma_dir)
    if chroma_dir.exists():
        shutil.rmtree(chroma_dir)
    chroma_dir.mkdir(parents=True, exist_ok=True)


def ingest_pdfs(reset: bool = True) -> dict[str, Any]:
    if reset:
        reset_vector_store()

    docs = load_pdf_documents()
    chunks = split_documents(docs)

    if not chunks:
        return {
            "message": "No PDF content found. Add PDF files to data/pdfs and try again.",
            "loaded_documents": 0,
            "created_chunks": 0,
            "chroma_dir": str(_resolve_path(settings.chroma_dir)),
            "collection_name": settings.collection_name,
        }

    vector_store = get_vector_store()
    vector_store.add_documents(chunks)

    return {
        "message": "PDFs ingested successfully.",
        "loaded_documents": len(docs),
        "created_chunks": len(chunks),
        "chroma_dir": str(_resolve_path(settings.chroma_dir)),
        "collection_name": settings.collection_name,
    }


def _format_context(docs: list) -> str:
    blocks = []
    for i, doc in enumerate(docs, start=1):
        source_file = doc.metadata.get("source_file") or doc.metadata.get("source") or "unknown"
        page = doc.metadata.get("page")
        doc_type = doc.metadata.get("doc_type", "document")
        blocks.append(
            f"[Source {i}] file={source_file}, page={page}, type={doc_type}\n{doc.page_content}"
        )
    return "\n\n".join(blocks)


def ask(question: str, k: int | None = None, filters: dict[str, Any] | None = None) -> dict[str, Any]:
    vector_store = get_vector_store()
    search_kwargs: dict[str, Any] = {"k": k or settings.top_k}
    if filters:
        search_kwargs["filter"] = filters

    retriever = vector_store.as_retriever(search_kwargs=search_kwargs)
    docs = retriever.invoke(question)

    if not docs:
        return {
            "answer": "Profood does not have enough data yet. Try ingesting PDFs first with POST /ingest.",
            "sources": [],
        }

    context = _format_context(docs)
    chain = PROMPT | get_llm()
    response = chain.invoke({"context": context, "question": question})

    sources = []
    for doc in docs:
        sources.append(
            {
                "source": doc.metadata.get("source_file") or doc.metadata.get("source"),
                "page": doc.metadata.get("page"),
                "doc_type": doc.metadata.get("doc_type"),
                "preview": doc.page_content[:350].replace("\n", " ").strip(),
                "metadata": doc.metadata,
            }
        )

    return {"answer": response.content, "sources": sources}
