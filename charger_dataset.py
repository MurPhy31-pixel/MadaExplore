import csv
import uuid
from elasticsearch import Elasticsearch, helpers
import time

ES_HOST = "http://localhost:9200"

def charger_dataset(fichier_csv: str, taille_batch: int = 500):
    """
    Charge le dataset Madagascar Tourism dans Elasticsearch
    """
    es = Elasticsearch(ES_HOST)
    
    # Vérifier la connexion
    if not es.ping():
        print("❌ Impossible de se connecter à Elasticsearch")
        return
    
    print("✓ Connecté à Elasticsearch")
    
    # Supprimer l'index s'il existe déjà
    try:
        es.indices.delete(index="hotspots")
        print("✓ Ancien index 'hotspots' supprimé")
    except:
        pass
    
    # Créer l'index avec mapping complet
    mapping = {
        "settings": {
            "number_of_shards": 1,
            "number_of_replicas": 0
        },
        "mappings": {
            "properties": {
                "place_id": {"type": "keyword"},
                "place_name": {"type": "text"},
                "normalized_place_id": {"type": "keyword"},
                "category": {"type": "keyword"},
                "quartier": {"type": "keyword"},
                "city": {"type": "keyword"},
                "province": {"type": "keyword"},
                "country": {"type": "keyword"},
                "location": {"type": "geo_point"},
                "review_id": {"type": "keyword"},
                "reviewer_name": {"type": "keyword"},
                "reviewer_type": {"type": "keyword"},
                "reviewer_origin": {"type": "keyword"},
                "review_text": {"type": "text"},
                "rating": {"type": "integer"},
                "sentiment": {"type": "keyword"},
                "language": {"type": "keyword"},
                "tags": {"type": "text"},
                "date": {"type": "date", "format": "yyyy-MM-dd"},
                "month_num": {"type": "integer"},
                "season": {"type": "keyword"},
                "price_range": {"type": "keyword"},
                "helpful_votes": {"type": "integer"},
                "photos_count": {"type": "integer"},
                "source_platform": {"type": "keyword"}
            }
        }
    }
    
    es.indices.create(index="hotspots", body=mapping)
    print("✓ Index 'hotspots' créé")
    
    # Lecture et chargement par lots
    with open(fichier_csv, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        batch = []
        total_charges = 0
        total_erreurs = 0
        ligne = 0
        
        print(f"⏳ Chargement de {fichier_csv}...")
        debut = time.time()
        
        for row in reader:
            ligne += 1
            
            # Conversion sécurisée des champs numériques
            try:
                latitude = float(row.get("latitude", 0))
                longitude = float(row.get("longitude", 0))
            except (ValueError, TypeError):
                latitude = 0.0
                longitude = 0.0
            
            try:
                rating = int(float(row.get("rating", 0)))
            except (ValueError, TypeError):
                rating = 0
            
            try:
                month_num = int(row.get("month_num", 0))
            except (ValueError, TypeError):
                month_num = 0
            
            try:
                helpful_votes = int(row.get("helpful_votes", 0))
            except (ValueError, TypeError):
                helpful_votes = 0
            
            try:
                photos_count = int(row.get("photos_count", 0))
            except (ValueError, TypeError):
                photos_count = 0
            
            doc = {
                "_index": "hotspots",
                "_id": row.get("review_id", str(uuid.uuid4())),
                "_source": {
                    "place_id": row.get("place_id", ""),
                    "place_name": row.get("place_name", ""),
                    "normalized_place_id": row.get("normalized_place_id", ""),
                    "category": row.get("category", ""),
                    "quartier": row.get("quartier", ""),
                    "city": row.get("city", ""),
                    "province": row.get("province", ""),
                    "country": row.get("country", ""),
                    "location": {
                        "lat": latitude,
                        "lon": longitude
                    },
                    "review_id": row.get("review_id", ""),
                    "reviewer_name": row.get("reviewer_name", ""),
                    "reviewer_type": row.get("reviewer_type", ""),
                    "reviewer_origin": row.get("reviewer_origin", ""),
                    "review_text": row.get("review_text", ""),
                    "rating": rating,
                    "sentiment": row.get("sentiment", ""),
                    "language": row.get("language", ""),
                    "tags": row.get("tags", ""),
                    "date": row.get("date", ""),
                    "month_num": month_num,
                    "season": row.get("season", ""),
                    "price_range": row.get("price_range", ""),
                    "helpful_votes": helpful_votes,
                    "photos_count": photos_count,
                    "source_platform": row.get("source_platform", "")
                }
            }
            batch.append(doc)
            
            if len(batch) >= taille_batch:
                success, failed = helpers.bulk(es, batch, raise_on_error=False)
                total_charges += success
                total_erreurs += len(failed)
                
                temps = time.time() - debut
                vitesse = total_charges / temps if temps > 0 else 0
                print(f"  → {total_charges}/{ligne} lignes ({vitesse:.0f} docs/s)", end="\r")
                
                batch = []
        
        # Dernier lot
        if batch:
            success, failed = helpers.bulk(es, batch, raise_on_error=False)
            total_charges += success
            total_erreurs += len(failed)
        
        fin = time.time()
        print(f"\n✅ Terminé en {fin-debut:.1f} secondes")
        print(f"   {total_charges} documents chargés")
        if total_erreurs > 0:
            print(f"   {total_erreurs} erreurs")

if __name__ == "__main__":
    charger_dataset("madagascar_tourism_dataset.csv")