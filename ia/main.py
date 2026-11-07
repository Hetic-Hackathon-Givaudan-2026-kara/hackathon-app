"""L'API de l'équipe Data/IA. Swagger : http://localhost:8000/docs"""

import os
from typing import Annotated

import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

# Configuration dans .env (uvicorn --env-file .env). Sans clé, le service refuse de démarrer.
API_KEY = os.environ["API_KEY"]
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("MODEL", "llama3.2:1b")

app = FastAPI(title="IA de l'équipe Data/IA", version="1.0.0")


class Question(BaseModel):
    question: str


class Answer(BaseModel):
    answer: str
    model: str


@app.post("/answer")
def answer(body: Question, x_api_key: Annotated[str, Header()] = "") -> Answer:
    """Répond à une question. Exige l'en-tête X-API-Key."""
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Clé d'API invalide")
    # Le travail de l'équipe Data/IA : prompt, RAG, modèle affiné… Ici, Ollama en local.
    response = httpx.post(
        f"{OLLAMA_URL}/api/chat",
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": body.question}],
            "stream": False,
        },
        timeout=60,
    )
    response.raise_for_status()
    return Answer(answer=response.json()["message"]["content"], model=MODEL)