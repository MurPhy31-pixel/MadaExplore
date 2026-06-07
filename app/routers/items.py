from fastapi import APIRouter, HTTPException, Query
from elasticsearch import Elasticsearch
from typing import Optional, List
from datetime import datetime
import uuid
from pydantic import BaseModel, Field

# ========== CLIENT ELASTICSEARCH ==========
ES_HOST = "http://localhost:9200"

def get_es_client():
    return Elasticsearch(ES_HOST)

# ========== SCHÉMAS ==========
class HotspotCreate(BaseModel):
    nom: str
    description: Optional[str] = None
    latitude: float
    longitude: float
    categorie: str = "general"

class AvisCreate(BaseModel):
    pseudo: str = "Anonyme"
    note: int = Field(ge=1, le=5)
    commentaire: Optional[str] = None
    hotspot_id: str

# ========== ROUTER PRINCIPAL ==========
router = APIRouter()

# Routes items originales (conservées)
@router.get("/")
async def get_items():
    return [{"id": 1, "name": "Item 1"}, {"id": 2, "name": "Item 2"}]

@router.post("/")
async def create_item(name: str):
    return {"id": 3, "name": name}

# ========== ROUTER HOTSPOTS ==========
hotspot_router = APIRouter()

@hotspot_router.get("/")
async def rechercher_hotspots(
    q: Optional[str] = Query(None, description="Recherche dans nom, description, tags"),
    categorie: Optional[str] = Query(None, description="Filtrer par catégorie"),
    city: Optional[str] = Query(None, description="Filtrer par ville"),
    province: Optional[str] = Query(None, description="Filtrer par province"),
    sentiment: Optional[str] = Query(None, description="positive, negative, neutral"),
    season: Optional[str] = Query(None, description="wet, dry"),
    price_range: Optional[str] = Query(None, description="bas, moyen, élevé"),
    rating_min: Optional[int] = Query(None, description="Note minimale (1-5)"),
    lat: Optional[float] = Query(None, description="Latitude pour recherche géo"),
    lon: Optional[float] = Query(None, description="Longitude pour recherche géo"),
    distance: Optional[str] = Query("10km", description="Rayon de recherche"),
    skip: int = 0,
    limit: int = 100
):
    """
    Recherche puissante de hotspots touristiques
    """
    es = get_es_client()
    
    must = []
    
    # Recherche full-text
    if q:
        must.append({
        "bool": {
            "should": [
                # Recherche exacte avec wildcard (trouve Tana dans Antananarivo)
                {
                    "query_string": {
                        "query": f"*{q}*",
                        "fields": ["place_name", "city"],
                        "default_operator": "OR"
                    }
                },
                # Recherche floue (trouve tanna -> Tana)
                {
                    "multi_match": {
                        "query": q,
                        "fields": ["place_name^2", "city^2"],
                        "fuzziness": "AUTO"
                    }
                }
            ],
            "minimum_should_match": 1
        }
    })
    # Filtres
    filter_clauses = []
    
    if categorie:
        filter_clauses.append({"term": {"category": categorie}})
    if city:
        filter_clauses.append({"term": {"city": city}})
    if province:
        filter_clauses.append({"term": {"province": province}})
    if sentiment:
        filter_clauses.append({"term": {"sentiment": sentiment}})
    if season:
        filter_clauses.append({"term": {"season": season}})
    if price_range:
        filter_clauses.append({"term": {"price_range": price_range}})
    if rating_min:
        filter_clauses.append({"range": {"rating": {"gte": rating_min}}})
    
    # Filtre géographique
    if lat and lon:
        filter_clauses.append({
            "geo_distance": {
                "distance": distance,
                "location": {"lat": lat, "lon": lon}
            }
        })
    
    query_body = {
        "query": {
            "bool": {
                "must": must,
                "filter": filter_clauses
            }
        },
        "from": skip,
        "size": limit,
        "sort": [{"rating": "desc"}, {"helpful_votes": "desc"}]
    }
    
    result = es.search(index="hotspots", body=query_body)
    
    return {
        "total": result["hits"]["total"]["value"],
        "resultats": [
            {**hit["_source"], "id": hit["_id"]}
            for hit in result["hits"]["hits"]
        ]
    }


@hotspot_router.get("/categories")
async def lister_categories():
    """Liste toutes les catégories disponibles"""
    es = get_es_client()
    result = es.search(index="hotspots", body={
        "size": 0,
        "aggs": {
            "categories": {
                "terms": {"field": "category", "size": 50}
            }
        }
    })
    return [b["key"] for b in result["aggregations"]["categories"]["buckets"]]


@hotspot_router.get("/cities")
async def lister_villes():
    """Liste toutes les villes disponibles"""
    es = get_es_client()
    result = es.search(index="hotspots", body={
        "size": 0,
        "aggs": {
            "villes": {
                "terms": {"field": "city", "size": 50}
            }
        }
    })
    return [b["key"] for b in result["aggregations"]["villes"]["buckets"]]


@hotspot_router.get("/stats/{place_id}")
async def statistiques_lieu(place_id: str):
    """Statistiques détaillées d'un lieu"""
    es = get_es_client()
    
    result = es.search(index="hotspots", body={
        "query": {"term": {"place_id": place_id}},
        "size": 0,
        "aggs": {
            "note_moyenne": {"avg": {"field": "rating"}},
            "nombre_avis": {"value_count": {"field": "rating"}},
            "distribution_notes": {
                "terms": {"field": "rating"}
            },
            "sentiments": {
                "terms": {"field": "sentiment"}
            },
            "saisons": {
                "terms": {"field": "season"}
            }
        }
    })
    
    aggs = result["aggregations"]
    return {
        "place_id": place_id,
        "note_moyenne": round(aggs["note_moyenne"]["value"], 2),
        "nombre_avis": aggs["nombre_avis"]["value"],
        "distribution_notes": {
            b["key"]: b["doc_count"]
            for b in aggs["distribution_notes"]["buckets"]
        },
        "sentiments": {
            b["key"]: b["doc_count"]
            for b in aggs["sentiments"]["buckets"]
        },
        "saisons": {
            b["key"]: b["doc_count"]
            for b in aggs["saisons"]["buckets"]
        }
    }


@hotspot_router.get("/top")
async def top_lieux(
    limit: int = 10,
    by: str = Query("rating", description="rating ou helpful_votes")
):
    """Top des meilleurs lieux"""
    es = get_es_client()
    
    sort_field = "rating" if by == "rating" else "helpful_votes"
    
    result = es.search(index="hotspots", body={
        "size": 0,
        "aggs": {
            "top_lieux": {
                "terms": {
                    "field": "place_id",
                    "size": limit,
                    "order": {"moyenne_note": "desc"}
                },
                "aggs": {
                    "moyenne_note": {"avg": {"field": sort_field}},
                    "nom_lieu": {
                        "top_hits": {
                            "size": 1,
                            "_source": ["place_name", "category", "city", "location"]
                        }
                    }
                }
            }
        }
    })
    
    return [
        {
            "place_id": b["key"],
            "note_moyenne": round(b["moyenne_note"]["value"], 2),
            "nombre_avis": b["doc_count"],
            **b["nom_lieu"]["hits"]["hits"][0]["_source"]
        }
        for b in result["aggregations"]["top_lieux"]["buckets"]
    ]


# ========== ROUTER SUGGESTIONS ==========
suggest_router = APIRouter()

@suggest_router.get("/")
async def suggerer_lieux(q: str = Query(..., min_length=2)):
    """
    Auto-complétion via recherche directe dans Elasticsearch.
    """
    es = get_es_client()
    
    result = es.search(index="hotspots", body={
        "query": {
            "query_string": {
                "query": f"*{q}*",
                "fields": ["place_name", "city"],
                "default_operator": "OR"
            }
        },
        "size": 20,
        "_source": ["place_name", "category", "city"]
    })
    
    suggestions = []
    seen = set()
    for hit in result["hits"]["hits"]:
        name = hit["_source"].get("place_name", "")
        if name and name not in seen:
            seen.add(name)
            suggestions.append({
                "name": name,
                "category": hit["_source"].get("category", ""),
                "city": hit["_source"].get("city", "")
            })
        if len(suggestions) >= 8:
            break
    
    return suggestions
# ========== ROUTER AVIS ==========
avis_router = APIRouter()

@avis_router.post("/", status_code=201)
async def ajouter_avis(avis: AvisCreate):
    """Ajouter un nouvel avis pour un lieu"""
    es = get_es_client()
    
    # Vérifier que le lieu existe
    result = es.search(index="hotspots", body={
        "query": {"term": {"place_id": avis.hotspot_id}},
        "size": 1
    })
    
    if result["hits"]["total"]["value"] == 0:
        raise HTTPException(status_code=404, detail="Lieu introuvable")
    
    lieu = result["hits"]["hits"][0]["_source"]
    avis_id = str(uuid.uuid4())
    
    avis_doc = {
        "place_id": avis.hotspot_id,
        "place_name": lieu.get("place_name", ""),
        "review_id": avis_id,
        "reviewer_name": avis.pseudo,
        "reviewer_type": "local",
        "reviewer_origin": "",
        "review_text": avis.commentaire or "",
        "rating": avis.note,
        "sentiment": "positive" if avis.note >= 4 else ("negative" if avis.note <= 2 else "neutral"),
        "language": "fr",
        "tags": "",
        "date": datetime.utcnow().strftime("%Y-%m-%d"),
        "month_num": datetime.utcnow().month,
        "season": "wet" if datetime.utcnow().month in [11, 12, 1, 2, 3, 4] else "dry",
        "price_range": lieu.get("price_range", ""),
        "helpful_votes": 0,
        "photos_count": 0,
        "source_platform": "web_app",
        "location": lieu.get("location"),
        "category": lieu.get("category", ""),
        "quartier": lieu.get("quartier", ""),
        "city": lieu.get("city", ""),
        "province": lieu.get("province", ""),
        "country": lieu.get("country", ""),
        "normalized_place_id": lieu.get("normalized_place_id", "")
    }
    
    es.index(index="hotspots", id=avis_id, body=avis_doc)
    
    return {**avis_doc, "id": avis_id}


@avis_router.get("/lieu/{place_id}")
async def avis_par_lieu(
    place_id: str,
    skip: int = 0,
    limit: int = 50
):
    """Récupérer tous les avis d'un lieu"""
    es = get_es_client()
    
    result = es.search(index="hotspots", body={
        "query": {"term": {"place_id": place_id}},
        "from": skip,
        "size": limit,
        "sort": [{"date": "desc"}, {"helpful_votes": "desc"}]
    })
    
    return {
        "total": result["hits"]["total"]["value"],
        "avis": [
            {**hit["_source"], "id": hit["_id"]}
            for hit in result["hits"]["hits"]
        ]
    }