# Profood Simple RAG System

A small local RAG starter project for **Profood** using:

- **FastAPI** for the backend API
- **LangChain** for the RAG pipeline
- **ChromaDB** for the local vector database
- **Ollama** for local embeddings and local chat model
- **PDF documents** as the knowledge source

The project includes 3 sample PDFs in `data/pdfs` so you can test immediately.

---

## 1. Install and start Ollama

Install Ollama from the official website, then pull the two models:

```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

Keep Ollama running. By default, it uses:

```text
http://localhost:11434
```

---

## 2. Create a virtual environment

### Windows PowerShell

```powershell
python -m venv my_env
.\.venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

---

## 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Default config:

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
CHROMA_DIR=./data/chroma
PDF_DIR=./data/pdfs
COLLECTION_NAME=profood_rag
```

---

## 4. Run the FastAPI server

```bash
uvicorn app.main:app --reload
```

Open the API docs:

```text
http://127.0.0.1:8000/docs
```

---

## 5. Ingest the PDFs

In Swagger UI, run:

```text
POST /ingest?reset=true
```

Or with curl:

```bash
curl -X POST "http://127.0.0.1:8000/ingest?reset=true"
```

This reads all PDFs in `data/pdfs`, splits them into chunks, creates embeddings with Ollama, and stores them in Chroma.

---

## 6. Ask a question

Swagger UI:

```text
POST /ask
```

Example body:

```json
{
  "question": "What equipment do I need for olive oil production?",
  "k": 4
}
```

Curl:

```bash
curl -X POST "http://127.0.0.1:8000/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"What equipment do I need for olive oil production?","k":4}'
```

Example questions:

```text
What equipment do I need for olive oil production?
How can I package local food products better?
Which product uses glass bottles?
What should I check before buying second-hand equipment?
What equipment is useful for milk production?
```

---

## 7. Project structure

```text
profood-rag-ollama/
  app/
    main.py          # FastAPI routes
    rag.py           # LangChain + Chroma + Ollama logic
    config.py        # Settings
    schemas.py       # Pydantic request/response models
  data/
    pdfs/            # Put your PDFs here
    chroma/          # Local Chroma vector database
  scripts/
    create_sample_pdfs.py
    test_api.py
  requirements.txt
  .env.example
  curl_examples.http
  README.md
```

---

## 8. Regenerate the sample PDFs

```bash
python scripts/create_sample_pdfs.py
```

---

## 9. Important notes

- This is a simple MVP architecture, not a production system.
- For production, add authentication, better metadata filters, logging, rate limiting, database backups, and user permissions.
- Do not let the LLM invent facts. The system prompt already tells it to answer only from retrieved Profood context.
- For your real Profood app, you can later add product/equipment database rows as RAG documents, not only PDFs.
