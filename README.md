MadaExplore

ce projet est une Application web de cartographie interactive et d'agrégation d'avis touristiques pour Madagascar.
MadaExplore centralise et géolocalise des avis touristiques sur une carte interactive, permettant aux voyageurs de rechercher, filtrer, comparer et noter les meilleurs lieux de Madagascar en temps réel.

Fonctionnalités

- Carte interactive : visualisation de lieux géolocalisés avec clusters colorés
- Recherche full-text: suggestions en temps réel avec fuzzy matching tolérant les fautes de frappe
- Filtres avancés: 14 catégories, 100+ villes, note, sentiment, saison, prix
- Notation & avis: dépôt d'avis avec anti-spam (1 avis par utilisateur par lieu)
- Statistiques détaillées: note moyenne, score de satisfaction, analyse de sentiment, fréquentation saisonnière
- Comptes utilisateurs: inscription, connexion, avatar personnalis.

Technologies utilisées

- Frontend: HTML5, CSS3, JavaScript, Leaflet.js, MarkerCluster
- Backend FastAPI (Python)
- Moteur de recherche: Elasticsearch 8.11 (conteneur Docker)
- Authentification: Token SHA-256, stockage JSON
- Déploiement Docker

Cas d'usage

- Touriste: trouver les meilleurs restaurants, hôtels et plages sur une carte
- Voyageur : filtrer par saison pour savoir quand visiter un lieu
- Local : découvrir des lieux près de chez soi et partager son expérience
- Chercheur : analyser les tendances touristiques (notes, sentiments, saisons)


Résultats

- Application web fonctionnelle et responsive
- Recherche performante avec wildcard et fuzzy matching
- Interface intuitive inspirée de Google Maps
- Système anti-spam fonctionnel
- Statistiques automatiques par lieu

Installation
Bash
- git clone https://github.com/Herizo3101/MadaExplore.git
- cd MadaExplore
- python -m venv venv && source venv/bin/activate
- pip install -r requirements.txt
- docker run -d --name elasticsearch -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" -
- docker.elastic.co/elasticsearch/elasticsearch:8.11.0
- python charger_dataset.py
- uvicorn main:app --reload --host 0.0.0.0 --port 8000
