// ========== DOM ELEMENTS ==========
const els = {
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    clearSearch: document.getElementById('clearSearch'),
    quickFilters: document.getElementById('quickFilters'),
    toggleFilters: document.getElementById('toggleFilters'),
    advancedFilters: document.getElementById('advancedFilters'),
    cityFilter: document.getElementById('city-filter'),
    ratingFilter: document.getElementById('rating-filter'),
    sentimentFilter: document.getElementById('sentiment-filter'),
    seasonFilter: document.getElementById('season-filter'),
    detailPanel: document.getElementById('detailPanel'),
    detailOverlay: document.getElementById('detailOverlay'),
    detailTitle: document.getElementById('detailTitle'),
    detailBody: document.getElementById('detailBody'),
    panelBadge: document.getElementById('panelBadge'),
    reviewModal: document.getElementById('reviewModal'),
    starRating: document.getElementById('starRating'),
    reviewRating: document.getElementById('reviewRating'),
    globalLoader: document.getElementById('globalLoader'),
    toastContainer: document.getElementById('toastContainer'),
    totalCount: document.getElementById('totalCount'),
    btnTop: document.getElementById('btnTop'),
    btnExplore: document.getElementById('btnExplore'),
    resultsInfo: document.getElementById('resultsInfo'),
    filterBadge: document.getElementById('filterDot'),
    emptyState: document.getElementById('emptyState'),
    suggestionsContainer: document.getElementById('suggestionsContainer'),
};

// ========== VARIABLES ==========
let map, markersCluster, selectedPlaceId = null, selectedRating = 0;
let activeSuggestionIndex = -1;
let suggestTimer;
let userMarker = null;

// ========== INIT ==========
function initMap() {
    const saved = JSON.parse(localStorage.getItem('mapState') || '{}');
    
    map = L.map('map', {
        center: saved.center || [-18.8792, 47.5079],
        zoom: saved.zoom || 6,
        zoomControl: false,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OSM | &copy; CARTO',
        maxZoom: 20,
        subdomains: 'abcd'
    }).addTo(map);

    map.on('moveend', () => {
        const c = map.getCenter();
        localStorage.setItem('mapState', JSON.stringify({
            center: [c.lat, c.lng],
            zoom: map.getZoom()
        }));
    });

    // Problème 7 : clic sur la carte ferme le panneau
    map.on('click', () => {
        if (els.detailPanel.classList.contains('open')) {
            closeDetail();
        }
    });

    markersCluster = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 45,
        animate: true,
        animateAddingMarkers: true,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: function(cluster) {
            const count = cluster.getChildCount();
            let size = 'small';
            if (count > 50) size = 'large';
            else if (count > 20) size = 'medium';
            const sizePx = size === 'large' ? 40 : size === 'medium' ? 34 : 28;
            const fontSize = size === 'large' ? 13 : size === 'medium' ? 11 : 10;
            const colors = { small: '#6366f1', medium: '#f59e0b', large: '#ef4444' };
            return L.divIcon({
                html: `<div style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:${colors[size]};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fontSize}px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);">${count}</div>`,
                className: '',
                iconSize: L.point(sizePx, sizePx)
            });
        }
    });
    map.addLayer(markersCluster);

    // Légende
    const legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function() {
        const div = L.DomUtil.create('div', 'map-legend');
        div.id = 'mapLegend';
        div.innerHTML = `
            <div class="legend-title">Note des lieux</div>
            <div class="legend-item"><span class="legend-dot excellent"></span> Excellent (4-5 ★)</div>
            <div class="legend-item"><span class="legend-dot bon"></span> Bon (3-4 ★)</div>
            <div class="legend-item"><span class="legend-dot moyen"></span> Moyen (1-3 ★)</div>
        `;
        return div;
    };
    legend.addTo(map);

    // Logo cliquable
    const logoBrand = document.querySelector('.nav-brand');
    if (logoBrand) {
        logoBrand.style.cursor = 'pointer';
        logoBrand.addEventListener('click', resetAll);
    }

    // Tooltip sur le bouton filtres (problème 10)
    if (els.toggleFilters) {
        els.toggleFilters.setAttribute('title', 'Filtres avancés');
    }

    loadFilters();
    searchHotspots();
    setupEvents();
}

// ========== FILTRES ==========
async function loadFilters() {
    try {
        const [cats, cities] = await Promise.all([
            fetch('/hotspots/categories').then(r => r.json()),
            fetch('/hotspots/cities').then(r => r.json())
        ]);
        
        // Problème 1 : les chips sont remplies immédiatement
        els.quickFilters.innerHTML = '<span class="quick-filter active" data-category="">✨ Tout</span>';
        cats.slice(0, 8).forEach(c => {
            els.quickFilters.innerHTML += `<span class="quick-filter" data-category="${c}">${c}</span>`;
        });
        
        els.cityFilter.innerHTML = '<option value="">Toutes les villes</option>';
        cities.forEach(c => {
            els.cityFilter.innerHTML += `<option value="${c}">${c}</option>`;
        });
    } catch (e) {
        console.error('Erreur chargement filtres:', e);
    }
}

function updateFilterBadge() {
    let count = 0;
    if (els.cityFilter.value) count++;
    if (els.ratingFilter.value) count++;
    if (els.sentimentFilter.value) count++;
    if (els.seasonFilter.value) count++;
    
    if (count > 0) {
        els.filterBadge.style.display = 'block';
        els.toggleFilters.classList.add('active-filter');
    } else {
        els.filterBadge.style.display = 'none';
        els.toggleFilters.classList.remove('active-filter');
    }
}

// ========== RECHERCHE ==========
async function searchHotspots(query = '', category = '') {
    showLoader(true);
    els.emptyState.style.display = 'none';
    
    const q = query || els.searchInput.value.trim();
    const cat = category || document.querySelector('.quick-filter.active')?.dataset.category || '';
    const city = els.cityFilter.value;
    const rating = els.ratingFilter.value;
    const sentiment = els.sentimentFilter.value;
    const season = els.seasonFilter.value;
    
    updateFilterBadge();
    
    // Problème 2 : utiliser wildcard pour les sous-chaînes
    let url = '/hotspots/?limit=300';
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (cat) url += `&categorie=${encodeURIComponent(cat)}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (rating) url += `&rating_min=${rating}`;
    if (sentiment) url += `&sentiment=${sentiment}`;
    if (season) url += `&season=${season}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        
        displayMarkers(data.resultats);
        
        // Problème 3 : badge se met à jour
        els.totalCount.textContent = data.total || 0;
        els.resultsInfo.textContent = `${data.total || 0} lieu(x) trouvé(s)`;
        els.resultsInfo.style.display = 'block';
        
        // Problème 9 : masquer la légende si aucun résultat
        const legendEl = document.getElementById('mapLegend');
        if (legendEl) {
            legendEl.style.display = (!data.resultats || data.resultats.length === 0) ? 'none' : 'block';
        }
        
        if (!data.resultats || data.resultats.length === 0) {
            els.emptyState.style.display = 'flex';
        }
    } catch (e) {
        showToast('Erreur de connexion au serveur');
        console.error(e);
    }
    showLoader(false);
}

function displayMarkers(hotspots) {
    markersCluster.clearLayers();
    
    if (!hotspots || hotspots.length === 0) {
        els.emptyState.style.display = 'flex';
        return;
    }
    els.emptyState.style.display = 'none';
    
    const uniques = {};
    hotspots.forEach(h => {
        const key = h.place_id;
        const note = h.note_moyenne ?? h.rating ?? 0;
        if (!uniques[key] || note > (uniques[key]._note ?? 0)) {
            uniques[key] = { ...h, _note: note };
        }
    });
    
    const markers = [];
    Object.values(uniques).forEach(lieu => {
        if (!lieu.location?.lat || !lieu.location?.lon) return;
        
        const note = lieu._note;
        let color;
        if (note >= 4) color = '#10b981';
        else if (note >= 3) color = '#f59e0b';
        else color = '#ef4444';
        
        const isPremium = note >= 4;
        
        const icon = L.divIcon({
            className: `custom-marker ${isPremium ? 'marker-premium' : ''}`,
            html: `<div style="width:${isPremium ? 30 : 24}px;height:${isPremium ? 30 : 24}px;border-radius:50%;background:${color};border:3px solid white;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:${isPremium ? 11 : 9}px;box-shadow:0 2px 8px rgba(0,0,0,0.25);">${note}</div>`,
            iconSize: L.point(isPremium ? 30 : 24, isPremium ? 30 : 24),
            iconAnchor: L.point(isPremium ? 15 : 12, isPremium ? 15 : 12)
        });
        
        const marker = L.marker([lieu.location.lat, lieu.location.lon], { icon });
        
        marker.bindPopup(`
            <div style="font-family:Inter,sans-serif;min-width:150px;">
                <b style="font-size:14px;">${escapeHtml(lieu.place_name || '')}</b><br>
                <span style="font-size:11px;color:#64748b;">${escapeHtml(lieu.city || '')} · ${escapeHtml(lieu.category || '')}</span><br>
                <span style="color:#f59e0b;">${'★'.repeat(Math.round(note))}${'☆'.repeat(5 - Math.round(note))}</span>
                <span style="font-size:12px;font-weight:700;margin-left:5px;">${note}/5</span>
            </div>
        `, { maxWidth: 220 });
        
        marker.on('click', () => openDetail(lieu.place_id, lieu.place_name));
        markersCluster.addLayer(marker);
        markers.push(marker);
    });
    
    if (markers.length > 0) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [60, 60], maxZoom: 12 });
    }
}

// ========== SUGGESTIONS ==========
function setupSuggestions() {
    els.searchInput.addEventListener('input', () => {
        clearTimeout(suggestTimer);
        const val = els.searchInput.value.trim();
        
        els.clearSearch.style.display = val ? 'flex' : 'none';
        activeSuggestionIndex = -1;
        
        if (val.length < 2) {
            els.suggestionsContainer.classList.remove('show');
            return;
        }
        
        suggestTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/suggest/?q=${encodeURIComponent(val)}`);
                const data = await res.json();
                const list = document.getElementById('suggestionsList');
                if (!list) return;
                
                if (data.length > 0) {
                    // Problème 5 : suggestions avec vraies infos (nom seulement pour l'instant)
                    list.innerHTML = data.map((s, i) => `
                        <div class="suggestion-item" data-index="${i}" data-value="${escapeHtml(s)}">
                            <div class="suggestion-icon"><i class="fas fa-map-marker-alt"></i></div>
                            <div class="suggestion-info">
                                <div class="suggestion-name">${escapeHtml(s)}</div>
                                <div class="suggestion-detail">Lieu touristique</div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    list.innerHTML = `<div class="suggestions-empty">Aucun lieu trouvé</div>`;
                }
                els.suggestionsContainer.classList.add('show');
            } catch (e) {
                console.error('Suggestions error:', e);
            }
        }, 200);
    });

    els.searchInput.addEventListener('keydown', (e) => {
        const items = document.querySelectorAll('#suggestionsList .suggestion-item');
        if (!items.length || !els.suggestionsContainer.classList.contains('show')) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, items.length - 1);
            updateActive(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
            updateActive(items);
        } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
            e.preventDefault();
            const value = items[activeSuggestionIndex]?.dataset.value;
            if (value) selectSuggestion(value);
        } else if (e.key === 'Escape') {
            els.suggestionsContainer.classList.remove('show');
            activeSuggestionIndex = -1;
        }
    });

    els.clearSearch.addEventListener('click', () => {
        els.searchInput.value = '';
        els.clearSearch.style.display = 'none';
        els.suggestionsContainer.classList.remove('show');
        els.resultsInfo.style.display = 'none';
        activeSuggestionIndex = -1;
        searchHotspots();
    });

    els.suggestionsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.suggestion-item');
        if (!item) return;
        selectSuggestion(item.dataset.value);
    });

    document.addEventListener('click', (e) => {
        if (!els.suggestionsContainer.contains(e.target) && e.target !== els.searchInput) {
            els.suggestionsContainer.classList.remove('show');
            activeSuggestionIndex = -1;
        }
    });
}

function updateActive(items) {
    items.forEach((item, i) => {
        item.classList.toggle('active', i === activeSuggestionIndex);
        if (i === activeSuggestionIndex) {
            item.scrollIntoView({ block: 'nearest' });
        }
    });
}

function selectSuggestion(value) {
    if (!value) return;
    els.searchInput.value = value;
    els.clearSearch.style.display = 'flex';
    els.suggestionsContainer.classList.remove('show');
    activeSuggestionIndex = -1;
    searchHotspots(value);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== DÉTAILS ==========
async function openDetail(placeId, placeName) {
    selectedPlaceId = placeId;
    els.detailTitle.textContent = placeName;
    
    els.detailBody.innerHTML = `
        <div style="text-align:center;padding:40px 0;">
            <div class="skeleton-circle"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
        </div>
    `;
    els.detailPanel.classList.add('open');
    els.detailOverlay.classList.add('active');
    
    try {
        const [stats, avisData] = await Promise.all([
            fetch(`/hotspots/stats/${placeId}`).then(r => r.json()),
            fetch(`/avis/lieu/${placeId}?limit=30`).then(r => r.json())
        ]);
        
        const note = stats.note_moyenne || 0;
        const nbAvis = stats.nombre_avis || 0;
        const score = note * 20;
        
        let sentimentDominant = '-';
        let sentimentClass = 'neutral';
        if (stats.sentiments && Object.keys(stats.sentiments).length > 0) {
            const sorted = Object.entries(stats.sentiments).sort((a, b) => b[1] - a[1]);
            sentimentDominant = sorted[0][0];
            sentimentClass = sentimentDominant;
        }
        
        const avis = avisData.avis || [];
        const avisPerPage = 10;
        let currentPage = 1;
        const totalPages = Math.ceil(avis.length / avisPerPage);
        
        function renderAvis(page) {
            const start = (page - 1) * avisPerPage;
            const slice = avis.slice(start, start + avisPerPage);
            
            let html = '';
            slice.forEach(a => {
                html += `
                <div class="review-card">
                    <div class="review-header">
                        <span class="review-author">${escapeHtml(a.reviewer_name || 'Anonyme')}</span>
                        <span class="review-rating">${'★'.repeat(a.rating || 0)}${'☆'.repeat(5 - (a.rating || 0))}</span>
                    </div>
                    <div class="review-text">${escapeHtml((a.review_text || '').substring(0, 200))}</div>
                    <div class="review-meta">
                        <span>👍 ${a.helpful_votes || 0}</span>
                        <span>📷 ${a.photos_count || 0}</span>
                        <span>${a.date || ''}</span>
                    </div>
                </div>`;
            });
            
            if (totalPages > 1) {
                html += `
                <div style="text-align:center;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;">
                    <button class="btn-page" id="btnPrevPage" ${page === 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> Précédent
                    </button>
                    <span style="font-size:11px;color:var(--gray);">${page} / ${totalPages}</span>
                    <button class="btn-page" id="btnNextPage" ${page === totalPages ? 'disabled' : ''}>
                        Suivant <i class="fas fa-chevron-right"></i>
                    </button>
                </div>`;
            }
            
            return html;
        }
        
        function updateDetail(page) {
            const avisHtml = avis.length > 0 
                ? `<div class="review-list">${renderAvis(page)}</div>` 
                : '<p style="text-align:center;color:var(--gray);padding:20px;">Aucun avis pour le moment</p>';
            
            els.detailBody.innerHTML = `
                <div class="score-hero">
                    <div class="score-ring" style="--score:${score}">
                        <span class="score-value">${note}</span>
                    </div>
                    <div class="score-stars">${'★'.repeat(Math.round(note))}${'☆'.repeat(5 - Math.round(note))}</div>
                    <div class="score-label">sur ${nbAvis} avis</div>
                </div>
                <div class="stat-cards">
                    <div class="stat-card"><div class="stat-value">${nbAvis}</div><div class="stat-label">Avis</div></div>
                    <div class="stat-card"><div class="stat-value">${Math.round(score)}%</div><div class="stat-label">Satisfaction</div></div>
                    <div class="stat-card"><div class="stat-value">${sentimentDominant}</div><div class="stat-label">Sentiment</div></div>
                </div>
                <h4 style="margin:16px 0 10px;font-weight:600;">📝 Avis récents</h4>
                ${avisHtml}
            `;
            
            const btnPrev = document.getElementById('btnPrevPage');
            const btnNext = document.getElementById('btnNextPage');
            
            if (btnPrev) {
                btnPrev.addEventListener('click', () => {
                    currentPage--;
                    updateDetail(currentPage);
                    els.detailBody.scrollTop = 0;
                });
            }
            if (btnNext) {
                btnNext.addEventListener('click', () => {
                    currentPage++;
                    updateDetail(currentPage);
                    els.detailBody.scrollTop = 0;
                });
            }
        }
        
        updateDetail(currentPage);
        els.panelBadge.textContent = sentimentDominant;
        els.panelBadge.className = `panel-badge ${sentimentClass}`;
        
    } catch (e) {
        console.error('Erreur détail:', e);
        els.detailBody.innerHTML = '<p style="text-align:center;color:var(--gray);padding:40px;">Erreur de chargement des détails</p>';
    }
}

function closeDetail() {
    els.detailPanel.classList.remove('open');
    els.detailOverlay.classList.remove('active');
}

// ========== AVIS ==========
function openReviewModal() {
    if (!selectedPlaceId) {
        showToast('Sélectionnez d\'abord un lieu');
        return;
    }
    els.reviewModal.classList.add('open');
    selectedRating = 0;
    els.reviewRating.value = 0;
    document.getElementById('reviewPseudo').value = '';
    document.getElementById('reviewComment').value = '';
    els.starRating.querySelectorAll('i').forEach(s => s.className = 'far fa-star');
}

function closeReviewModal() {
    els.reviewModal.classList.remove('open');
}

async function submitReview() {
    const pseudo = document.getElementById('reviewPseudo').value.trim() || 'Anonyme';
    const comment = document.getElementById('reviewComment').value.trim();
    
    if (selectedRating === 0) {
        showToast('Veuillez donner une note');
        return;
    }
    
    showLoader(true);
    try {
        const res = await fetch('/avis/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                hotspot_id: selectedPlaceId,
                pseudo: pseudo,
                note: selectedRating,
                commentaire: comment
            })
        });
        
        if (res.ok) {
            showToast('✅ Avis publié avec succès !');
            closeReviewModal();
            // Problème 8 : rafraîchir les marqueurs après ajout d'avis
            await openDetail(selectedPlaceId, els.detailTitle.textContent);
            await searchHotspots();
        } else {
            const err = await res.json();
            showToast('❌ Erreur: ' + (err.detail || 'Échec de l\'ajout'));
        }
    } catch (e) {
        showToast('❌ Erreur réseau');
        console.error(e);
    }
    showLoader(false);
}

// ========== HELPERS ==========
function showLoader(show) {
    els.globalLoader.classList.toggle('active', show);
}

function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    els.toastContainer.appendChild(t);
    setTimeout(() => t.remove(), 2500);
}

function resetAll() {
    els.searchInput.value = '';
    els.clearSearch.style.display = 'none';
    if (els.suggestionsContainer) els.suggestionsContainer.classList.remove('show');
    els.resultsInfo.style.display = 'none';
    
    const activeFilter = els.quickFilters.querySelector('.quick-filter.active');
    if (activeFilter) activeFilter.classList.remove('active');
    const allFilter = els.quickFilters.querySelector('[data-category=""]');
    if (allFilter) allFilter.classList.add('active');
    
    els.cityFilter.value = '';
    els.ratingFilter.value = '';
    els.sentimentFilter.value = '';
    els.seasonFilter.value = '';
    
    // Problème 4 : fermer les filtres avancés et réinitialiser le badge
    els.advancedFilters.classList.remove('open');
    els.toggleFilters.classList.remove('open', 'active-filter');
    if (els.filterBadge) els.filterBadge.style.display = 'none';
    
    els.btnExplore.classList.add('active');
    els.btnTop.classList.remove('active');
    
    map.setView([-18.8792, 47.5079], 6);
    
    // Problème 9 : réafficher la légende
    const legendEl = document.getElementById('mapLegend');
    if (legendEl) legendEl.style.display = 'block';
    
    searchHotspots();
}

// ========== EVENTS ==========
function setupEvents() {
    els.searchBtn.addEventListener('click', () => searchHotspots());
    els.searchInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            els.suggestionsContainer.classList.remove('show');
            searchHotspots();
        }
    });

    setupSuggestions();

    els.quickFilters.addEventListener('click', e => {
        const f = e.target.closest('.quick-filter');
        if (!f) return;
        els.quickFilters.querySelectorAll('.quick-filter').forEach(q => q.classList.remove('active'));
        f.classList.add('active');
        searchHotspots(els.searchInput.value, f.dataset.category);
    });

    // Toggle filtres avancés
    els.toggleFilters.addEventListener('click', () => {
        const isOpen = els.toggleFilters.classList.contains('open');
        if (isOpen) {
            els.toggleFilters.classList.remove('open');
            els.advancedFilters.classList.remove('open');
        } else {
            els.toggleFilters.classList.add('open');
            els.advancedFilters.classList.add('open');
        }
    });

    // Filtres avancés
    ['city-filter', 'rating-filter', 'sentiment-filter', 'season-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', searchHotspots);
    });

    // Fermer le panneau de détail
    els.detailOverlay.addEventListener('click', closeDetail);
    const btnClosePanel = document.getElementById('btnClosePanel');
    if (btnClosePanel) btnClosePanel.addEventListener('click', closeDetail);
    
    // Swipe pour fermer le panneau sur mobile
    let touchStartX = 0;
    els.detailPanel.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
    });
    els.detailPanel.addEventListener('touchend', (e) => {
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (diff > 60) closeDetail();
    });

    // Échap pour fermer
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeDetail();
            closeReviewModal();
            els.suggestionsContainer.classList.remove('show');
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            els.searchInput.focus();
            els.searchInput.select();
        }
    });

    // Modale d'avis
    const btnAddReview = document.getElementById('btnAddReview');
    if (btnAddReview) btnAddReview.addEventListener('click', openReviewModal);
    
    const btnCloseModal = document.getElementById('btnCloseModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeReviewModal);
    
    els.reviewModal.addEventListener('click', e => {
        if (e.target === els.reviewModal) closeReviewModal();
    });

    // Étoiles de notation
    els.starRating.addEventListener('mouseover', e => {
        const star = e.target.closest('i');
        if (!star) return;
        const value = parseInt(star.dataset.value);
        els.starRating.querySelectorAll('i').forEach((s, i) => {
            s.className = i < value ? 'fas fa-star active' : 'far fa-star';
        });
    });
    
    els.starRating.addEventListener('mouseleave', () => {
        els.starRating.querySelectorAll('i').forEach((s, i) => {
            s.className = i < selectedRating ? 'fas fa-star active' : 'far fa-star';
        });
    });
    
    els.starRating.addEventListener('click', e => {
        const star = e.target.closest('i');
        if (!star) return;
        selectedRating = parseInt(star.dataset.value);
        els.reviewRating.value = selectedRating;
    });

    const btnSubmitReview = document.getElementById('btnSubmitReview');
    if (btnSubmitReview) btnSubmitReview.addEventListener('click', submitReview);

    // Contrôles de la carte
    const locateBtn = document.getElementById('locateBtn');
    if (locateBtn) {
        locateBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    pos => {
                        const lat = pos.coords.latitude;
                        const lng = pos.coords.longitude;
                        map.setView([lat, lng], 14);
                        
                        // Supprimer l'ancien marqueur
                        if (userMarker) map.removeLayer(userMarker);
                        
                        userMarker = L.marker([lat, lng], {
                            icon: L.divIcon({
                                className: '',
                                html: '<div style="background:#6366f1;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 6px rgba(99,102,241,0.3);"></div>',
                                iconSize: [16, 16],
                                iconAnchor: [8, 8]
                            })
                        }).addTo(map).bindPopup('📍 Vous êtes ici').openPopup();
                    },
                    () => showToast('Géolocalisation refusée')
                );
            } else {
                showToast('Géolocalisation non supportée');
            }
        });
    }

    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            const mapContainer = document.querySelector('.map-container');
            if (mapContainer && mapContainer.requestFullscreen) {
                mapContainer.requestFullscreen();
            }
        });
    }

    const resetViewBtn = document.getElementById('resetViewBtn');
    if (resetViewBtn) {
        resetViewBtn.addEventListener('click', () => {
            map.setView([-18.8792, 47.5079], 6);
            searchHotspots();
        });
    }

    // Problème 4 : Top lieux réinitialise les filtres
    els.btnTop.addEventListener('click', async () => {
        // Réinitialiser les filtres
        els.cityFilter.value = '';
        els.ratingFilter.value = '';
        els.sentimentFilter.value = '';
        els.seasonFilter.value = '';
        els.advancedFilters.classList.remove('open');
        els.toggleFilters.classList.remove('open', 'active-filter');
        if (els.filterBadge) els.filterBadge.style.display = 'none';
        els.searchInput.value = '';
        els.clearSearch.style.display = 'none';
        
        els.btnTop.classList.add('active');
        els.btnExplore.classList.remove('active');
        showLoader(true);
        try {
            const res = await fetch('/hotspots/top?limit=10');
            const data = await res.json();
            displayMarkers(data);
            els.totalCount.textContent = 'Top 10';
            els.resultsInfo.textContent = '🏆 Top 10 lieux les mieux notés';
            els.resultsInfo.style.display = 'block';
        } catch (e) {
            showToast('Erreur de chargement du top');
        }
        showLoader(false);
    });

    els.btnExplore.addEventListener('click', resetAll);
}

// ========== DÉMARRER ==========
document.addEventListener('DOMContentLoaded', initMap);