from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from elasticsearch import Elasticsearch
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))
from routers.items import router, hotspot_router, avis_router, suggest_router

app = FastAPI(title="Agrégateur Touristique Madagascar", version="2.0.0")

app.mount("/static", StaticFiles(directory="app/static"), name="static")
templates = Jinja2Templates(directory="app/templates")

app.include_router(router, prefix="/items", tags=["items"])
app.include_router(hotspot_router, prefix="/hotspots", tags=["hotspots"])
app.include_router(avis_router, prefix="/avis", tags=["avis"])
app.include_router(suggest_router, prefix="/suggest", tags=["suggestions"])

@app.on_event("startup")
async def startup():
    es = Elasticsearch("http://localhost:9200")
    if es.ping():
        count = es.count(index="hotspots")["count"]
        print(f"✓ Connecté à Elasticsearch - {count} documents dans l'index")
    else:
        print("⚠ Impossible de se connecter à Elasticsearch")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={"data": "a"})