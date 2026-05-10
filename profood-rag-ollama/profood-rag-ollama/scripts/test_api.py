"""Tiny local test script. Run after the API starts."""

import requests

BASE_URL = "http://127.0.0.1:8000"

print("Health:", requests.get(f"{BASE_URL}/health", timeout=30).json())
print("Ingest:", requests.post(f"{BASE_URL}/ingest?reset=true", timeout=120).json())

payload = {"question": "What equipment do I need for olive oil production?", "k": 4}
print("Ask:", requests.post(f"{BASE_URL}/ask", json=payload, timeout=120).json())
