function shouldShowCone() {
    const hasPermissionApi = !!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function');
    if (hasPermissionApi) {
        // On iOS 13+, show only when explicit permission granted and we have a heading fix
        return orientationPermissionGranted && hasHeadingFix;
    }

function isStandalonePWA() {
    try {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!window.navigator.standalone;
    } catch { return false; }
}

// Keep skyline anchored identically in Safari and PWA. In PWA we avoid subtracting
// extra safe-area from the bottom and we remove large side overscan that can look cut.
function applyPWASkylineAnchoring() {
    try {
        const panel = arrivalsPanel || document.querySelector('.arrivals-panel');
        const sky = panel ? panel.querySelector('#skyline-inline') : null;
        if (!panel || !sky) return;
        // Defer anchoring to CSS for both Safari and PWA so values are identical
        sky.style.bottom = '';
        sky.style.left = '';
        sky.style.right = '';
    } catch {}
}

// Make skyline height consistent across Safari and iOS PWA
function applySkylineSizing() {
    try {
        const panel = arrivalsPanel || document.querySelector('.arrivals-panel');
        if (!panel) return;
        // Fixed height for consistency - no dynamic calculations
        const h = 180; // smaller, fixed height identical in Safari and PWA
        panel.style.setProperty('--skyline-max-height', `${h}px`);
    } catch {}
}

    // On other platforms, show after we have any heading fix
    return hasHeadingFix;
}

// Normalize viewport units across Safari browser and iOS PWA standalone
function installViewportPolyfill() {
    const apply = () => {
        try {
            // In PWA standalone mode, prioritize window.innerHeight for consistency
            const isPWA = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!window.navigator.standalone;
            let h = 0;
            
            if (isPWA) {
                // PWA: use innerHeight directly, but account for any UI chrome
                // In PWA, innerHeight is the full viewport without browser UI
                h = window.innerHeight || document.documentElement?.clientHeight || 800;
            } else {
                // Safari browser: use visualViewport which accounts for dynamic toolbar
                // When toolbar is visible, visualViewport.height is smaller
                if (window.visualViewport && typeof window.visualViewport.height === 'number') {
                    h = window.visualViewport.height;
                } else {
                    h = window.innerHeight || document.documentElement?.clientHeight || 800;
                }
            }
            
            if (!h || h < 200) {
                h = window.innerHeight || document.documentElement?.clientHeight || screen?.height || 800;
            }
            const vh = h * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
            document.documentElement.style.setProperty('--viewport-height', `${h}px`);
            console.log(`[VH Polyfill] ${isPWA ? 'PWA' : 'Safari'} mode: ${h}px viewport, --vh = ${vh}px, innerHeight=${window.innerHeight}, visualViewport=${window.visualViewport?.height || 'N/A'}`);
        } catch {}
    };
    apply();
    // Apply immediately on next frame to ensure DOM is ready
    requestAnimationFrame(apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    try { if (window.visualViewport) window.visualViewport.addEventListener('resize', apply); } catch {}
}

// Drag sensitivity: make bus mode feel heavier, like Citymapper
function getDragScale() {
    // Smooth 1:1 tracking like native scrolling
    return 1.0;
}

// Snap stops: fewer stops for smoother, more scroll-like feel
function getSnapStopsPx() {
    const minPx = vhToPx(PANEL_MIN_VH); // 40vh - initial position
    const maxPx = getPanelMaxPx();
    
    // Include 20vh circles hook in stops so it's considered during snap
    const circlesHook = vhToPx(20);
    const stops = [circlesHook, minPx]; // Include both 20vh and 40vh
    
    // Only 2 mid stops for smoother feel
    const s60 = vhToPx(60);
    const s85 = vhToPx(85);
    // Add mid stops if within range
    ;[s60, s85].forEach(s => {
        if (s > minPx && s < maxPx && !stops.includes(s)) stops.push(s);
    });
    if (stops[stops.length - 1] !== maxPx) stops.push(maxPx);
    return stops;
}

function pickSnapTarget(currentH, velocityPxPerMs) {
    const stops = getSnapStopsPx();
    const circlesHook = vhToPx(20);
    const minPx = vhToPx(PANEL_MIN_VH); // 40vh
    
    // Very sensitive fling thresholds like Citymapper - tiny flicks advance stops
    const UP_FLING = 0.25;   // ~250 px/s (much lower)
    const DOWN_FLING = -0.25; // ~250 px/s downward
    
    // SPECIAL CASE: If at 20vh and pushing up, ALWAYS go to 40vh first (not 60vh)
    if (Math.abs(currentH - circlesHook) < 10 && velocityPxPerMs > 0) {
        console.log('[pickSnapTarget] At 20vh, pushing up → forcing 40vh');
        return minPx; // Force 40vh
    }
    
    if (velocityPxPerMs > UP_FLING) {
        // next stop above current
        let next = stops[stops.length - 1];
        for (let i = 0; i < stops.length; i++) {
            if (stops[i] > currentH + 1) { next = stops[i]; break; }
        }
        return next;
    }
    if (velocityPxPerMs < DOWN_FLING) {
        // previous stop below current
        for (let i = stops.length - 1; i >= 0; i--) {
            if (stops[i] < currentH - 1) return stops[i];
        }
        return stops[0];
    }
    // Nearest stop
    let best = stops[0];
    let bestDist = Math.abs(currentH - best);
    for (let i = 1; i < stops.length; i++) {
        const d = Math.abs(currentH - stops[i]);
        if (d < bestDist) { best = stops[i]; bestDist = d; }
    }
    return best;
}

// Ensure the station badge overlay is present on the detailed screen (3rd screen)
function applyDetailOverlay() {
    try {
        if (!currentStation) return;
        // Only show on 3rd screen: walk mode AND busDetailActive
        if (!(typeof uiMode !== 'undefined' && uiMode === 'walk' && typeof busDetailActive !== 'undefined' && busDetailActive)) {
            const panel = document.querySelector('.arrivals-panel');
            if (panel) {
                const old = panel.querySelector('.detail-bus-overlay-panel');
                if (old) old.remove();
            }
            return;
        }
        const panel = document.querySelector('.arrivals-panel');
        if (!panel) return;
        const badge = stationBadgeFor(currentStation.name);
        // Replace existing overlay
        const old = panel.querySelector('.detail-bus-overlay-panel');
        if (old) old.remove();
        const overlay = document.createElement('div');
        overlay.className = 'detail-bus-overlay-panel';
        overlay.setAttribute('role', 'presentation');
        overlay.innerHTML = `
            <div class="detail-bus-overlay-row">
                <svg width="44" height="44" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <rect x="1.5" y="1.5" width="25" height="25" rx="6" fill="${badge.color}" stroke="#FFFFFF" stroke-width="3"/>
                    <text x="14" y="14" dominant-baseline="middle" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="900" fill="#FFFFFF">${badge.abbr}</text>
                </svg>
                <div class="detail-bus-overlay-name">${currentStation.name}</div>
            </div>`;
        panel.appendChild(overlay);
    } catch {}
}

// --- Bus Screen: Nearest Stations (cards) ---
function stationBadgeFor(name) {
    const lower = (name || '').toLowerCase();
    if (lower.includes('el mouradia')) return { abbr: 'EM', color: '#3399ff' };
    if (lower.includes('hydra')) return { abbr: 'H', color: '#3399ff' };
    if (lower.includes('audin')) return { abbr: 'PA', color: '#3399ff' };
    if (lower.includes('1er mai')) return { abbr: '1M', color: '#66cc33' };
    if (lower.includes('martyr')) return { abbr: 'PM', color: '#ffcc33' };
    return { abbr: (name || 'ST').slice(0, 2).toUpperCase(), color: '#3399ff' };
}

function nearestStations(fromLat, fromLon, count = 5) {
    const withDist = STATIONS.map(s => ({
        station: s,
        distKm: getDistanceFromLatLonInKm(fromLat, fromLon, s.lat, s.lon)
    }));
    withDist.sort((a, b) => a.distKm - b.distKm);
    return withDist.slice(0, count);
}

function renderBusStations(withDelay = false, fadeIn = false) {
    if (!routesListEl) return;
    routesListEl.innerHTML = '';
    // Reset detail state when showing the Bus list
    busDetailActive = false;
    // Entering Bus mode list resets any detail drill-down state
    busDetailActive = false;

    // Anchor position for ORDERING: use MAP CENTER if map exists, otherwise user location
    // This allows stations to reorder when user pans the map (crosshair position)
    let anchorLat, anchorLon;
    if (map && mapInitialized) {
        const center = map.getCenter();
        anchorLat = center.lat;
        anchorLon = center.lng;
    } else if (userLat && userLon) {
        anchorLat = userLat;
        anchorLon = userLon;
    } else {
        const fallback = currentStation || STATIONS[0];
        anchorLat = fallback.lat;
        anchorLon = fallback.lon;
    }

    // Get stations ordered by crosshair position
    const nearby = nearestStations(anchorLat, anchorLon, 5);
    
    // Distance position for DISPLAY: always use USER GPS position
    let distanceLat, distanceLon;
    if (userLat && userLon) {
        distanceLat = userLat;
        distanceLon = userLon;
    } else {
        // Fallback to anchor if no GPS
        distanceLat = anchorLat;
        distanceLon = anchorLon;
    }

    nearby.forEach(({ station, distKm }) => {
        const card = document.createElement('div');
        card.className = 'station-card';

        const badge = stationBadgeFor(station.name);
        const served = station.routes.map(r => r.number).join(', ');
        
        // Placeholder for walking time - will be fetched from OSRM
        const distanceContainer = document.createElement('div');
        distanceContainer.className = 'station-distance';
        distanceContainer.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align: middle; margin-right: 4px;">
                <path d="M67.9,22.6c5.7,0.4,10.8-3.8,11.3-9.7c0.4-5.7-3.8-10.8-9.7-11.3c-5.7-0.4-10.8,3.8-11.3,9.7C57.8,17.1,62.2,22.2,67.9,22.6" fill="currentColor"/>
                <path d="M59,26.9c2-1.5,4.5-2.3,7.3-2.2c3.5,0.3,6.6,2.5,8.3,5.1l10.5,20.9l14.3,10c1.2,1,2,2.5,1.9,4.1c-0.1,2.6-2.5,4.5-5.1,4.2 c-0.7,0-1.5-0.3-2.2-0.7L78.6,57.8c-0.4-0.4-0.9-0.9-1.2-1.5l-4-7.8l-4.7,20.8l18.6,22c0.4,0.7,0.7,1.5,0.9,2.2l5,26.5 c0,0.6,0,1,0,1.5c-0.3,4-3.7,6.7-7.6,6.6c-3.2-0.3-5.6-2.6-6.4-5.6l-4.7-24.7L59.4,81l-3.5,16.1c-0.1,0.7-1.2,2.3-1.5,2.9L40,124.5 c-1.5,2.2-3.8,3.7-6.6,3.4c-4-0.3-6.9-3.7-6.6-7.6c0.1-1.2,0.6-2.2,1-3.1l13.5-22.5L52.5,45l-7.3,5.9l-4,17.7c-0.4,2.2-2.6,4.1-5,4 c-2.6-0.1-4.5-2.5-4.4-5.1c0-0.1,0-0.4,0.1-0.6l4.5-20.6c0.3-0.9,0.7-1.6,1.5-2.2L59,26.9z" fill="currentColor"/>
            </svg>
            <span style="vertical-align: middle;">...</span>
        `;
        
        // Fetch OSRM walking time asynchronously with smooth transition
        getOsrmWalkingTime(distanceLat, distanceLon, station.lat, station.lon).then(minutes => {
            const span = distanceContainer.querySelector('span');
            if (span) {
                // Fade out, update, fade in (like countdown)
                span.style.transition = 'opacity 0.2s ease';
                span.style.opacity = '0';
                setTimeout(() => {
                    span.textContent = minutes ? `${minutes} min` : '—';
                    span.style.opacity = '1';
                }, 200);
            }
        });

        // Top header (build without distance, will append it separately)
        const headerDiv = document.createElement('div');
        headerDiv.className = 'station-header';
        headerDiv.innerHTML = `
            <div class="station-badge" style="background:${badge.color}"><span>${badge.abbr}</span></div>
            <div class="station-title">
                <div class="station-name">${station.name}</div>
                <div class="station-serves">${served}</div>
            </div>
        `;
        headerDiv.appendChild(distanceContainer);
        
        const divider = document.createElement('div');
        divider.className = 'station-divider';

        // Helper to build arrivals HTML for this station
        const buildArrivalsHtml = () => {
            const arrivals = calculateArrivals(station) || [];
            // Show only the soonest (first Active; otherwise first item)
            const nextArrival = arrivals.find(a => a.status === 'Active') || arrivals[0];
            if (!nextArrival) return '';
            let timeDisplayHtml = '';
            if (nextArrival.status === 'Active') {
                timeDisplayHtml = `
                    <div class="time-inline">
                        <svg class="live-radar" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 9 C 9 3 15 3 21 9" stroke="var(--live-orange)" stroke-width="3" stroke-linecap="round"/>
                            <path d="M9.5 12 C 12 10.2 12 10.2 14.5 12" stroke="var(--live-orange)" stroke-width="3" stroke-linecap="round"/>
                        </svg>
                        <div class="time-stack">
                            <div class="time-big">${nextArrival.minutes}</div>
                            <div class="time-unit">min</div>
                        </div>
                        <svg class="chevron" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="margin-left: 12px;">
                            <path d="M9 6 L15 12 L9 18" stroke="#C7C7CC" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                `;
            } else if (nextArrival.status === 'Loading') {
                timeDisplayHtml = `
                    <div class="route-status" style="color: var(--text-main); font-weight: 600; font-size: 0.8rem; display:flex; align-items:center; gap: 8px;">
                        <span>Loading</span>
                        <div class="loader loader-sm" aria-hidden="true"></div>
                    </div>
                `;
            } else {
                timeDisplayHtml = `
                    <div class="route-status" style="color: var(--text-main); font-weight: 600; font-size: 0.8rem; display:flex; align-items:center;">
                        ${nextArrival.message}
                        <svg class="chevron" width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="margin-left: 12px;">
                            <path d="M9 6 L15 12 L9 18" stroke="#C7C7CC" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                `;
            }

            return `
                <div class="station-arrival-row">
                    <div class="route-left">
                        <div class="route-chip">
                            <svg class="mini-bus" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="5" width="16" height="12" rx="2" fill="#00B2FF"/>
                                <rect x="7" y="7" width="10" height="5" fill="#E6F2FF"/>
                                <circle cx="9" cy="16" r="1.3" fill="#00B2FF"/>
                                <circle cx="15" cy="16" r="1.3" fill="#00B2FF"/>
                            </svg>
                            <span class="chip-number">${nextArrival.number}</span>
                        </div>
                        <div class="chip-dest">to ${nextArrival.dest}</div>
                    </div>
                    <div class="route-time">${timeDisplayHtml}</div>
                </div>
            `;
        };

        // Build card and optionally show a brief loading state for arrivals
        card.appendChild(headerDiv);
        card.appendChild(divider);
    // Add overlay station badge icon + name ABOVE THE CARDS in the panel ONLY on detailed (3rd) screen
    try {
        if ((typeof uiMode !== 'undefined' && uiMode === 'walk') && (typeof busDetailActive !== 'undefined' && busDetailActive)) {
            const panel = document.querySelector('.arrivals-panel');
            if (panel) {
                // Ensure only one overlay in the panel
                const old = panel.querySelector('.detail-bus-overlay-panel');
                if (old) old.remove();
                const overlay = document.createElement('div');
                overlay.className = 'detail-bus-overlay-panel';
                overlay.setAttribute('role', 'presentation');
                overlay.innerHTML = `
                    <div class="detail-bus-overlay-row">
                        <svg width="44" height="44" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <rect x="1.5" y="1.5" width="25" height="25" rx="6" fill="${badge.color}" stroke="#FFFFFF" stroke-width="3"/>
                            <text x="14" y="14" dominant-baseline="middle" text-anchor="middle" font-family="Outfit, sans-serif" font-size="12" font-weight="900" fill="#FFFFFF">${badge.abbr}</text>
                        </svg>
                        <div class="detail-bus-overlay-name">${station.name}</div>
                    </div>`;
                panel.appendChild(overlay);
            }
        }
    } catch {}
        const arrivalsDiv = document.createElement('div');
        arrivalsDiv.className = 'station-arrivals';
        if (withDelay) {
            arrivalsDiv.classList.add('loading');
            arrivalsDiv.innerHTML = `
                <div class="loading-row">
                    <span class="loading-text">Loading next departures</span>
                    <div class="loader loader-sm" aria-hidden="true"></div>
                </div>
            `;
            setTimeout(() => {
                arrivalsDiv.classList.remove('loading');
                arrivalsDiv.innerHTML = buildArrivalsHtml();
            }, 850);
        } else {
            arrivalsDiv.innerHTML = buildArrivalsHtml();
        }
        card.appendChild(arrivalsDiv);
    // NOTE: Do NOT auto-expand panel in walk mode - let user drag it manually
    // The automatic expansion was causing panel snap when touching cards
        // Drill-down: tapping a station card switches to Walk mode focused on this station
        card.addEventListener('click', (e) => {
            try {
                e.preventDefault();
                e.stopPropagation();
            } catch {}
            try {
                // Lock focus on this station for walking map (OSRM route + pole/shadow)
                currentStation = station;
                // Persist Bus-style arrivals while in Walk mode
                busDetailActive = true;
                // Switch to Walk mode (prefer function if present, else set flag)
                if (typeof setUIMode === 'function') {
                    setUIMode('walk');
                } else {
                    previousMode = uiMode;
                    uiMode = 'walk';
                }
                // Re-render map for this station
                if (typeof updateMap === 'function') updateMap();
                // Show only this station using the exact Bus screen card design (no other cards)
                if (routesListEl) {
                    routesListEl.classList.remove('hidden');
                    // Show brief loading animation like Bus screen, then arrivals
                    renderBusStationDetail(currentStation, true);
                    applyDetailOverlay();
                }
            } catch (err) {
                console.warn('station card drill-down error', err);
            }
        });
        routesListEl.appendChild(card);
    });
    
    // In bus list mode, add ad AFTER first card (second position)
    const stationCards = routesListEl.querySelectorAll('.station-card');
    const existingAd = routesListEl.querySelector('.routes-ad');
    
    // Add ad after first card if it doesn't exist yet and we have at least one card
    if (stationCards.length >= 1 && !existingAd) {
        const adPlaceholder = document.createElement('div');
        adPlaceholder.className = 'ad-placeholder routes-ad';
        adPlaceholder.innerHTML = `
            <!-- Replace this entire div content with your Google Ads code -->
            <div class="ad-demo-content">
                <div class="ad-label">Advertisement</div>
                <p style="color: #999; font-size: 0.75rem; margin-top: 8px;">Your Google Ads will appear here</p>
            </div>
            <!-- Example: <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-xxxxx" ...></ins> -->
        `;
        // Insert after the first card (second position)
        if (stationCards[0].nextSibling) {
            routesListEl.insertBefore(adPlaceholder, stationCards[0].nextSibling);
        } else {
            routesListEl.appendChild(adPlaceholder);
        }
    }
}
 
// Render a single station using the exact Bus screen card design (header + arrivals)
function renderBusStationDetail(station, withDelay = false) {
    if (!routesListEl || !station) return;
    routesListEl.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'station-card';

    const badge = stationBadgeFor(station.name);
    const served = station.routes.map(r => r.number).join(', ');
    let distanceText = '';
    try {
        let anchorLat = userLat, anchorLon = userLon;
        if (!anchorLat || !anchorLon) { anchorLat = station.lat; anchorLon = station.lon; }
        const distKm = getDistanceFromLatLonInKm(anchorLat, anchorLon, station.lat, station.lon);
        distanceText = `${distKm.toFixed(1)} km`;
    } catch { distanceText = ''; }

    const headerHtml = `
        <div class="station-header">
            <div class="station-badge" style="background:${badge.color}"><span>${badge.abbr}</span></div>
            <div class="station-title">
                <div class="station-name">${station.name}</div>
                <div class="station-serves">${served}</div>
            </div>
            <div class="station-distance">${distanceText}</div>
        </div>
        <div class="station-divider"></div>
    `;

    const buildArrivalsHtml = () => {
        const arrivals = calculateArrivals(station);
        return arrivals.map(arrival => {
            let timeDisplayHtml = '';
            if (arrival.status === 'Active') {
                timeDisplayHtml = `
                    <div class="time-inline">
                        <svg class="live-radar" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 9 C 9 3 15 3 21 9" stroke="var(--live-orange)" stroke-width="3" stroke-linecap="round"/>
                            <path d="M9.5 12 C 12 10.2 12 10.2 14.5 12" stroke="var(--live-orange)" stroke-width="3" stroke-linecap="round"/>
                        </svg>
                        <div class="time-stack">
                            <div class="time-big">${arrival.minutes}</div>
                            <div class="time-unit">min</div>
                        </div>
                    </div>
                `;
            } else if (arrival.status === 'Loading') {
                timeDisplayHtml = `
                    <div class="route-status" style="color: var(--text-main); font-weight: 600; font-size: 0.8rem; display:flex; align-items:center; gap: 8px;">
                        <span>Loading</span>
                        <div class="loader loader-sm" aria-hidden="true"></div>
                    </div>
                `;
            } else {
                timeDisplayHtml = `
                    <div class="route-status" style="color: var(--accent-color); font-weight: 600; font-size: 0.8rem;">
                        ${arrival.message}
                    </div>
                `;
            }

            return `
                <div class="station-arrival-row">
                    <div class="route-left">
                        <div class="route-chip">
                            <svg class="mini-bus" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <rect x="4" y="5" width="16" height="12" rx="2" fill="#00B2FF"/>
                                <rect x="7" y="7" width="10" height="5" fill="#E6F2FF"/>
                                <circle cx="9" cy="16" r="1.3" fill="#00B2FF"/>
                                <circle cx="15" cy="16" r="1.3" fill="#00B2FF"/>
                            </svg>
                            <span class="chip-number">${arrival.number}</span>
                        </div>
                        <div class="chip-dest">to ${arrival.dest}</div>
                    </div>
                    <div class="route-time">${timeDisplayHtml}</div>
                </div>
            `;
        }).join('');
    };

    card.innerHTML = headerHtml;
    const arrivalsDiv = document.createElement('div');
    arrivalsDiv.className = 'station-arrivals';
    if (withDelay) {
        arrivalsDiv.classList.add('loading');
        arrivalsDiv.innerHTML = `
            <div class="loading-row">
                <span class="loading-text">Loading next departures</span>
                <div class="loader loader-sm" aria-hidden="true"></div>
            </div>
        `;
        setTimeout(() => {
            arrivalsDiv.classList.remove('loading');
            arrivalsDiv.innerHTML = buildArrivalsHtml();
        }, 850);
    } else {
        arrivalsDiv.innerHTML = buildArrivalsHtml();
    }
    card.appendChild(arrivalsDiv);
    routesListEl.appendChild(card);
    
    // In bus/walk modes, add ad AFTER first card (second position)
    // Count only station cards, not ads
    const stationCards = routesListEl.querySelectorAll('.station-card');
    const existingAd = routesListEl.querySelector('.routes-ad');
    
    // Add ad after first card if it doesn't exist yet
    if (stationCards.length === 1 && !existingAd) {
        const adPlaceholder = document.createElement('div');
        adPlaceholder.className = 'ad-placeholder routes-ad';
        adPlaceholder.innerHTML = `
            <!-- Replace this entire div content with your Google Ads code -->
            <div class="ad-demo-content">
                <div class="ad-label">Advertisement</div>
                <p style="color: #999; font-size: 0.75rem; margin-top: 8px;">Your Google Ads will appear here</p>
            </div>
            <!-- Example: <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-xxxxx" ...></ins> -->
        `;
        // Insert after the first card (second position)
        if (stationCards[0].nextSibling) {
            routesListEl.insertBefore(adPlaceholder, stationCards[0].nextSibling);
        } else {
            routesListEl.appendChild(adPlaceholder);
        }
    }
}
// Route Paths - GPS waypoints for all routes
// Route Paths - GPS coordinates for START and END of each route
// Simplified to 2 points per route for easier maintenance
// Make globally accessible for traffic-sampler.js
const ROUTE_PATHS = {
    '04': [ // 1er Mai ↔ Ben Omar
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7800, lon: 3.0900, name: 'Ben Omar' }
    ],
    '05': [ // Place Audin ↔ Place des Martyrs
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' }
    ],
    '07': [ // Place des Martyrs ↔ El Harrach
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7400, lon: 3.1100, name: 'El Harrach' }
    ],
    '10': [ // 1er Mai ↔ Bouzareah
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7900, lon: 3.0350, name: 'Bouzareah' }
    ],
    '31': [ // Place Audin ↔ Hydra
        { lat: 36.7692, lon: 3.0549, name: 'Place Audin' },
        { lat: 36.7435, lon: 3.0421, name: 'Hydra' }
    ],
    '54': [ // Place Audin ↔ El Mouradia
        { lat: 36.7692, lon: 3.0549, name: 'Place Audin' },
        { lat: 36.7482, lon: 3.0511, name: 'El Mouradia' }
    ],
    '67': [ // Place des Martyrs ↔ Ben Aknoun
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7400, lon: 3.0400, name: 'Ben Aknoun' }
    ],
    '16': [ // 1er Mai ↔ Kouba
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7400, lon: 3.0800, name: 'Kouba' }
    ],
    '33': [ // Place Audin ↔ Kouba
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7400, lon: 3.0800, name: 'Kouba' }
    ],
    '34': [ // 1er Mai ↔ Birkhadem
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7200, lon: 3.0350, name: 'Birkhadem' }
    ],
    '45': [ // Hydra ↔ Ben Aknoun
        { lat: 36.7472, lon: 3.0403, name: 'Hydra' },
        { lat: 36.7800, lon: 3.0200, name: 'Ben Aknoun' }
    ],
    '48': [ // 1er Mai ↔ Ben Aknoun
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7800, lon: 3.0200, name: 'Ben Aknoun' }
    ],
    '58': [ // Place des Martyrs ↔ Chevalley
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7300, lon: 3.1200, name: 'Chevalley' }
    ],
    '65': [ // 1er Mai ↔ El Madania
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7450, lon: 3.0450, name: 'El Madania' }
    ],
    '88': [ // Hydra ↔ Bir Mourad Raïs
        { lat: 36.7472, lon: 3.0403, name: 'Hydra' },
        { lat: 36.7300, lon: 3.0300, name: 'Bir Mourad Raïs' }
    ],
    '89': [ // 1er Mai ↔ Vieux Kouba
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7450, lon: 3.0850, name: 'Vieux Kouba' }
    ],
    '90': [ // Place des Martyrs ↔ Birtouta
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7100, lon: 2.9800, name: 'Birtouta' }
    ],
    '91': [ // Place Audin ↔ Chevalley
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7300, lon: 3.1200, name: 'Chevalley' }
    ],
    '99': [ // 1er Mai ↔ Aïn Benian
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.8100, lon: 3.0000, name: 'Aïn Benian' }
    ],
    '100': [ // Place des Martyrs ↔ Aéroport
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.6910, lon: 3.2154, name: 'Aéroport' }
    ],
    '101': [ // Place des Martyrs ↔ Birtouta
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7100, lon: 2.9800, name: 'Birtouta' }
    ],
    '113': [ // Place des Martyrs ↔ Gare Routière Caroubier
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7550, lon: 3.0800, name: 'Gare Routière Caroubier' }
    ]
};

// Make ROUTE_PATHS globally accessible for traffic-sampler.js
window.ROUTE_PATHS = ROUTE_PATHS;

// --- Global State Variables ---
let map = null;
let mapInitialized = false;
let currentStation = null; // Will be set after STATIONS is defined
let userLat = null;
let userLon = null;
// Layer to hold the OSRM route so we can clear/update it
let routeLayer = null;
let busStationsLayer = null; // LayerGroup for all bus stop markers (bus mode)
let distanceCirclesLayer = null; // LayerGroup for 5/15/60 min walking circles (idle mode expanded)
let uiMode = 'idle'; // 'idle' | 'walk' | 'bus'
let previousMode = 'idle'; // track previous mode for Back button
let busDetailActive = false; // true when showing Bus card design in Walk mode (drill-down)
let osrmSeq = 0; // sequence guard for OSRM requests
// Base/walk tile layers
let baseTileLayer = null;      // Standard OSM
let walkTileLayer = null;      // Simplified, no labels (Citymapper-like)
let walkLabelsLayer = null;    // Labels-only overlay for Walk mode

// User marker and heading state
let userMarker = null;            // Leaflet marker with dot + heading cone
let currentHeading = null;        // Raw heading degrees [0..360)
let smoothedHeading = null;       // Smoothed heading for UI
const HEADING_SMOOTH = 0.25;      // 0..1 (higher = snappier)
let geoWatchId = null;            // Geolocation watch ID
let deviceOrientationActive = false;
let orientationPermissionGranted = false;
let hasHeadingFix = false;        // True after first heading value observed
let isGPSRecentering = false;     // Flag to prevent reordering during GPS re-center
// Simple calorie model: ~55 kcal per km (average adult brisk walk)
const KCAL_PER_KM = 55;

// Constant dashed styling for walking route - same thickness at all zoom levels
function computeWalkDash(zoom) {
    const z = typeof zoom === 'number' ? zoom : 15;
    // Keep weight constant at 3, only adjust dash pattern for visibility
    if (z <= 13) return { dash: '6,6', weight: 3 };
    if (z <= 15) return { dash: '10,8', weight: 3 };
    if (z <= 17) return { dash: '14,10', weight: 3 };
    return { dash: '18,12', weight: 3 };
}

function applyWalkRouteStyle() {
    try {
        if (!map || !routeLayer) return;
        const s = computeWalkDash(map.getZoom());
        routeLayer.setStyle({ dashArray: s.dash, weight: s.weight, opacity: 0.42 });
    } catch {}
}

// --- DOM Elements ---
const stationSelectorTrigger = document.getElementById('station-selector-trigger');
const floatingControlsEl = document.getElementById('floating-controls');
const stationNameEl = document.getElementById('station-name');
const walkTimeText = document.getElementById('walk-time-text');
const routesListEl = document.getElementById('routes-list');
const mapDistanceEl = document.getElementById('map-distance');
const routesHeaderEl = document.querySelector('.routes-header');
const quickActionsEl = document.getElementById('quick-actions');
const actionBusBtn = document.getElementById('action-bus');
const actionWalkBtn = document.getElementById('action-walk');
const walkingBadgeEl = document.getElementById('walking-time');
const calorieBadgeEl = document.getElementById('calorie-badge');
const calorieTextEl = document.getElementById('calorie-text');
const settingsBtn = document.getElementById('settings-btn');
const backBtn = document.getElementById('back-btn');
const arabicTitleEl = document.querySelector('.arabic-title');
const locateBtn = document.getElementById('locate-btn');
const enableCompassBtn = document.getElementById('enable-compass-btn');

// Calculate total distance for a route path
function calculateRouteDistance(waypoints) {
    let totalDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
        totalDistance += getDistanceFromLatLonInKm(
            waypoints[i].lat, waypoints[i].lon,
            waypoints[i + 1].lat, waypoints[i + 1].lon
        );
    }
    return totalDistance;
}

// Find the closest waypoint to a station on a route
function findClosestWaypointIndex(stationLat, stationLon, waypoints) {
    let minDist = Infinity;
    let closestIndex = 0;

    waypoints.forEach((waypoint, index) => {
        const dist = getDistanceFromLatLonInKm(stationLat, stationLon, waypoint.lat, waypoint.lon);
        if (dist < minDist) {
            minDist = dist;
            closestIndex = index;
        }
    });

    return closestIndex;
}

// Calculate distance from start of route to a specific station
function calculateDistanceToStation(stationLat, stationLon, waypoints) {
    const closestIndex = findClosestWaypointIndex(stationLat, stationLon, waypoints);

    let distance = 0;
    for (let i = 0; i < closestIndex; i++) {
        distance += getDistanceFromLatLonInKm(
            waypoints[i].lat, waypoints[i].lon,
            waypoints[i + 1].lat, waypoints[i + 1].lon
        );
    }

    // Add distance from last waypoint to station
    if (closestIndex < waypoints.length) {
        distance += getDistanceFromLatLonInKm(
            waypoints[closestIndex].lat, waypoints[closestIndex].lon,
            stationLat, stationLon
        );
    }

    return distance;
}

const STATIONS = [
    {
        id: 'martyrs',
        name: 'Place des Martyrs',
        lat: 36.78646243864091,  // Main bus stop - Accurate from Google Maps
        lon: 3.0624237631875166,   // Main bus stop - Accurate from Google Maps
        address: 'Casbah, Algiers',
        image: 'images/station_placeholder.png',
        routes: [
            { number: '100', dest: 'Aéroport', interval: 40, startTime: '06:00', endTime: '05:00', totalDistance: 18.5 },
            { number: '101', dest: 'Birtouta', interval: 35, startTime: '06:00', endTime: '05:00', totalDistance: 15.0 },
            { number: '99', dest: 'Aéroport', interval: 40, startTime: '06:00', endTime: '05:00', totalDistance: 18.5 },
            { number: '58', dest: 'Chevalley', interval: 30, startTime: '06:00', endTime: '05:00', totalDistance: 12.0 },
            { number: '67', dest: 'Ben Aknoun', interval: 25, startTime: '06:00', endTime: '05:00', totalDistance: 8.5 },
            { number: '07', dest: 'El Harrach', interval: 25, startTime: '06:00', endTime: '05:00', totalDistance: 10.0 },
            { number: '90', dest: 'Birtouta', interval: 35, startTime: '06:00', endTime: '05:00', totalDistance: 15.0 },
            { number: '113', dest: 'Gare Routière Caroubier', interval: 30, startTime: '06:00', endTime: '05:00', totalDistance: 7.0 }
        ]
    },
    {
        id: 'audin',
        name: 'Place Maurice Audin',
        lat: 36.7692411,  // Updated to accurate position
        lon: 3.0549448,   // Updated to accurate position
        address: 'Alger Centre',
        image: 'images/station_placeholder.png',
        routes: [
            { number: '31', dest: 'Hydra', interval: 25, startTime: '06:00', endTime: '18:30', totalDistance: 4.2 },
            { number: '33', dest: 'Kouba', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 6.5 },
            { number: '67', dest: 'Ben Aknoun', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 7.0 },
            { number: '91', dest: 'Chevalley', interval: 35, startTime: '06:00', endTime: '18:30', totalDistance: 11.0 },
            { number: '54', dest: 'El Mouradia', interval: 20, startTime: '06:00', endTime: '18:30', totalDistance: 3.5 },
            { number: '05', dest: 'Place des Martyrs', interval: 20, startTime: '06:00', endTime: '18:30', totalDistance: 2.0 }
        ]
    },
    {
        id: '1mai',
        name: '1er Mai',
        lat: 36.76021973877917,  // Bus stop - Refined accurate position
        lon: 3.0566802899233463,   // Bus stop - Refined accurate position
        address: 'Sidi M\'Hamed',
        image: 'images/station_placeholder.png',
        routes: [
            { number: '04', dest: 'Ben Omar', interval: 35, startTime: '06:00', endTime: '18:30', totalDistance: 9.0 },
            { number: '10', dest: 'Bouzareah', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 8.5 },
            { number: '12', dest: 'Dély Ibrahim', interval: 35, startTime: '06:00', endTime: '18:30', totalDistance: 10.0 },
            { number: '07', dest: 'El Harrach', interval: 25, startTime: '06:00', endTime: '18:30', totalDistance: 8.0 },
            { number: '16', dest: 'Kouba', interval: 25, startTime: '06:00', endTime: '18:30', totalDistance: 5.5 }
        ]
    },
    {
        id: 'hydra',
        name: 'Hydra',
        lat: 36.743512017412236,  // Accurate position from user
        lon: 3.0420763246892846,   // Accurate position from user
        address: 'Hydra Centre',
        image: 'images/station_placeholder.png',
        routes: [
            { number: '31', dest: 'Place Audin', interval: 25, startTime: '06:00', endTime: '18:30', totalDistance: 4.2 },
            { number: '88', dest: 'Bir Mourad Raïs', interval: 35, startTime: '06:00', endTime: '18:30', totalDistance: 6.0 },
            { number: '45', dest: 'Ben Aknoun', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 5.5 }
        ]
    },
    {
        id: 'mouradia',
        name: 'El Mouradia',
        lat: 36.74820388941202,  // Accurate position from user
        lon: 3.051086539207291,   // Accurate position from user
        address: 'El Mouradia',
        image: 'images/station_placeholder.png',
        routes: [
            { number: '54', dest: 'Place Audin', interval: 20, startTime: '06:00', endTime: '18:30', totalDistance: 3.5 },
            { number: '34', dest: '1er Mai', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 4.0 },
            { number: '45', dest: 'Ben Aknoun', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 6.5 }
        ]
    }
];

// Initialize default station (now that STATIONS is defined)
currentStation = STATIONS[0];

// TESTING: Set to true to simulate being in Algiers (for testing from outside Algeria)
const USE_FAKE_LOCATION = false;
const FAKE_LOCATION = {
    lat: 36.7720000, // ~500m north of Place Audin (to show walking route)
    lon: 3.0560000
};

// Additional DOM Elements (others declared at top)
const timeDisplay = document.getElementById('algiers-time');

// --- Time Logic ---
function updateAlgiersTime() {
    const now = new Date();
    const options = { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    const timeString = new Intl.DateTimeFormat('en-GB', options).format(now);
    timeDisplay.textContent = timeString;
}

setInterval(updateAlgiersTime, 1000);
updateAlgiersTime();

// --- Distance Logic ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI / 180);
}

function findNearestStation(lat, lon) {
    let minDist = Infinity;
    let nearest = STATIONS[0];

    STATIONS.forEach(station => {
        const dist = getDistanceFromLatLonInKm(lat, lon, station.lat, station.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = station;
        }
    });
    return nearest;
}

// --- Arrival Simulation ---
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function calculateArrivals(station) {
    const now = new Date();
    const algiersTime = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Algiers" }));
    const currentMinutes = algiersTime.getHours() * 60 + algiersTime.getMinutes();
    const currentHour = algiersTime.getHours();

    return station.routes.map(route => {
        const startMins = timeToMinutes(route.startTime);
        const endMins = timeToMinutes(route.endTime);

        // Status Check - Handle overnight service (e.g., 06:00 to 05:00 next day)
        let isActive = false;
        
        if (endMins < startMins) {
            // Overnight service: 06:00 to 05:00 (next day)
            // Active if: current >= start OR current <= end
            isActive = (currentMinutes >= startMins) || (currentMinutes <= endMins);
        } else {
            // Normal service: 06:00 to 18:30 (same day)
            // Active if: current >= start AND current <= end
            isActive = (currentMinutes >= startMins) && (currentMinutes <= endMins);
        }
        
        if (!isActive) {
            if (currentMinutes < startMins) {
                return { ...route, status: 'Not Started', message: `Starts ${route.startTime}` };
            } else {
                return { ...route, status: 'Ended', message: 'Service Ended' };
            }
        }

        // ============================================================================
        // ETUSA BUS ARRIVAL ALGORITHM (Timetable-Based with Real-Time Traffic)
        // ============================================================================
        // ETUSA operates on fixed schedules:
        // - First departure: 6:00 AM from main stations
        // - Last departure: 6:30 PM
        // - Frequency: 20-40 minutes between buses
        // - Journey time varies based on real-time traffic conditions
        // ============================================================================

        // STEP 1: Calculate time since service started
        const minutesSinceStart = currentMinutes - startMins;
        const cyclePosition = minutesSinceStart % route.interval;

        // STEP 2: Get REAL-TIME CAR SPEED from Google Traffic
        let carSpeed;
        let usingGoogleTraffic = false;
        
        // Check if we need to refresh traffic data (every 3 minutes)
        const now = Date.now();
        const trafficAge = route.trafficTimestamp ? now - route.trafficTimestamp : Infinity;
        const TRAFFIC_REFRESH_INTERVAL = 3 * 60 * 1000; // 3 minutes
        
        if (window.TrafficSampler && route.trafficSpeed !== undefined && route.trafficSpeed !== null && route.trafficSpeed !== 'loading' && trafficAge < TRAFFIC_REFRESH_INTERVAL) {
            // Use cached Google traffic speed (still fresh)
            carSpeed = route.trafficSpeed;
            usingGoogleTraffic = true;
        } else if (window.TrafficSampler && (route.trafficSpeed === undefined || trafficAge >= TRAFFIC_REFRESH_INTERVAL)) {
            // First load OR traffic data is stale - fetch fresh Google traffic IN BACKGROUND
            if (route.trafficSpeed === undefined) {
                route.trafficSpeed = 'loading'; // Mark as loading to prevent duplicate fetches
                
                // Fetch in background
                window.TrafficSampler.getTrafficSpeed(station, route).then(speed => {
                    route.trafficSpeed = speed;
                    route.trafficTimestamp = Date.now();
                    console.log(`🔄 Traffic loaded for route ${route.number}: ${speed ? speed.toFixed(1) + ' km/h' : 'no data'}`);
                    // Re-render with updated traffic data
                    if (typeof renderBusStations === 'function' && uiMode === 'bus' && !busDetailActive) {
                        renderBusStations();
                    } else if (typeof renderBusStationDetail === 'function' && busDetailActive && currentStation) {
                        renderBusStationDetail(currentStation);
                    }
                }).catch(e => {
                    console.warn('Traffic fetch error:', e);
                    route.trafficSpeed = null;
                    route.trafficTimestamp = Date.now();
                    // Re-render to show error state
                    if (typeof renderBusStations === 'function' && uiMode === 'bus' && !busDetailActive) {
                        renderBusStations();
                    } else if (typeof renderBusStationDetail === 'function' && busDetailActive && currentStation) {
                        renderBusStationDetail(currentStation);
                    }
                });
            }
            
            // Show loading state - will update when traffic arrives
            return {
                ...route,
                status: 'Loading',
                message: '...'
            };
        }
        
        // If no traffic data available, skip
        if (!usingGoogleTraffic) {
            return {
                ...route,
                status: 'NoData',
                message: 'No traffic data'
            };
        }

        // STEP 3: Calculate BUS SPEED with traffic-aware reduction
        // Buses are MUCH slower than cars due to:
        // - Traffic lights (30-60 sec stops, multiple times)
        // - Bus stops (loading/unloading passengers)
        // - Pulling in/out of bus stops
        // - Slow acceleration/deceleration
        // - Stop signs and intersections
        // Real-world data: Route 54 (3.6 km)
        //   - Green traffic: ~25 min (8.6 km/h average)
        //   - Heavy traffic: ~70 min max (3.1 km/h average)
        
        let busSpeedFactor;
        if (carSpeed >= 35) {
            // Green traffic (free flow): buses at 25% of car speed
            // Example: 40 km/h car → 10 km/h bus → ~25 min for 3.6 km
            busSpeedFactor = 0.25;
        } else if (carSpeed >= 25) {
            // Yellow traffic (moderate): buses at 22% of car speed
            // Example: 30 km/h car → 6.6 km/h bus → ~35 min for 3.6 km
            busSpeedFactor = 0.22;
        } else if (carSpeed >= 15) {
            // Orange traffic (slow): buses at 20% of car speed
            // Example: 20 km/h car → 4 km/h bus → ~55 min for 3.6 km
            busSpeedFactor = 0.20;
        } else {
            // Red traffic (heavy): buses at 30% of car speed
            // Example: 10 km/h car → 3 km/h bus → ~70 min for 3.6 km (max)
            busSpeedFactor = 0.30;
        }
        
        const busSpeed = carSpeed * busSpeedFactor;
        console.log(`🚌 Bus speed calculation: Car ${carSpeed.toFixed(1)} km/h × ${busSpeedFactor} = ${busSpeed.toFixed(1)} km/h`);

        // STEP 4: Calculate DISTANCE using GPS straight-line × 1.7 (Algiers urban factor)
        // Research shows hilly coastal cities like Algiers have 1.7x road distance vs straight-line
        const routePath = ROUTE_PATHS[route.number];
        let totalDistance = 3.5; // Default fallback: 3.5 km (typical Algiers route)
        
        if (routePath && routePath.length >= 2) {
            // Calculate straight-line distance from START to END
            const straightLine = getDistanceFromLatLonInKm(
                routePath[0].lat, 
                routePath[0].lon,
                routePath[routePath.length - 1].lat,
                routePath[routePath.length - 1].lon
            );
            // Apply Algiers urban factor: 1.7x for hilly + curved + coastal roads
            totalDistance = straightLine * 1.7;
            console.log(`📏 Route ${route.number}: ${straightLine.toFixed(2)} km straight × 1.7 = ${totalDistance.toFixed(2)} km road`);
        }

        // STEP 5: Calculate MOVEMENT TIME (time spent driving)
        const movementTimeMinutes = (totalDistance / busSpeed) * 60;

        // STEP 6: Calculate DWELL TIME (time spent at stops loading/unloading)
        const numberOfStops = routePath ? routePath.length : 5;
        
        // Average passengers per stop (varies by time of day)
        let avgPassengers;
        if ((currentHour >= 7 && currentHour < 9) || (currentHour >= 16 && currentHour < 19)) {
            avgPassengers = 10; // Rush hour: 8-12 passengers per stop
        } else {
            avgPassengers = 4; // Normal hours: 3-5 passengers per stop
        }
        
        // Research formula: Dwell time = 5 seconds base + 2.75 seconds per passenger
        const dwellTimePerStopSeconds = 5 + (2.75 * avgPassengers);
        const dwellTimePerStopMinutes = dwellTimePerStopSeconds / 60;
        const totalDwellTimeMinutes = numberOfStops * dwellTimePerStopMinutes;

        // STEP 7: Calculate TOTAL JOURNEY TIME
        const totalJourneyTime = movementTimeMinutes + totalDwellTimeMinutes;

        // STEP 8: Calculate ARRIVAL TIME based on timetable
        // ETUSA buses depart at fixed intervals (e.g., every 30 minutes)
        // If current time is 6:15 and bus departed at 6:00, cyclePosition = 15 min
        
        if (cyclePosition < totalJourneyTime) {
            // Bus is currently traveling to this station
            const remainingTime = totalJourneyTime - cyclePosition;
            return {
                ...route,
                status: 'Active',
                minutes: Math.ceil(remainingTime)
            };
        } else {
            // Bus already arrived or hasn't departed yet
            // Wait for next scheduled departure
            const timeUntilNextDeparture = route.interval - cyclePosition;
            const totalWaitTime = timeUntilNextDeparture + totalJourneyTime;
            return {
                ...route,
                status: 'Active',
                minutes: Math.ceil(totalWaitTime)
            };
        }
    }).sort((a, b) => {
        // Sort: Active first (by time), then others
        if (a.status === 'Active' && b.status === 'Active') return a.minutes - b.minutes;
        if (a.status === 'Active') return -1;
        if (b.status === 'Active') return 1;
        return 0;
    });
}


// --- UI Updates ---
function renderStation(station) {
    // Update Floating Badge
    stationNameEl.textContent = station.name;

    // Update walking time (OSRM-only; legacy model disabled)
    // updateWalkingTime(station);

    // Render arrivals using the Bus screen card design (old design removed)
    renderBusStationDetail(station);

    // Update map
    if (mapInitialized) {
        updateMap();
    }

    // Detailed screen: start with the same collapsed sheet behavior as other screens.
    // User can drag the sheet; internal list will not scroll in bus-mode.
}

/*
// Legacy walking-time model (DISABLED). Kept for reference.
function updateWalkingTime(station) {
    const walkTimeText = document.getElementById('walk-time-text');
    if (!userLat || !userLon) {
        walkTimeText.textContent = 'Location unavailable';
        return;
    }
    const straightLineDistance = getDistanceFromLatLonInKm(userLat, userLon, station.lat, station.lon);
    const routeFactor = 2.0; // approximate streets vs straight-line
    const actualWalkingDistance = straightLineDistance * routeFactor;
    const walkingSpeedKmh = 5;
    const walkingTimeHours = actualWalkingDistance / walkingSpeedKmh;
    const walkingMinutes = Math.ceil(walkingTimeHours * 60);
    if (walkTimeText) {
        walkTimeText.textContent = `${walkingMinutes}'`;
    }
}
*/

// Old design (renderRoutes) removed – unified on renderBusStationDetail()

// --- Geolocation ---
function initGeolocation() {
    console.log('Attempting to get geolocation...');

    // Try to load cached location first (for iOS PWA)
    const cachedLocation = localStorage.getItem('userLocation');
    if (cachedLocation) {
        try {
            const { lat, lon, timestamp } = JSON.parse(cachedLocation);
            const age = Date.now() - timestamp;

            // Use cached location if less than 2 minutes old (avoid stale positions)
            if (age < 2 * 60 * 1000) {
                console.log('📍 Using cached location (age: ' + Math.round(age / 1000 / 60) + ' min)');
                userLat = lat;
                userLon = lon;
                const nearest = findNearestStation(userLat, userLon);
                currentStation = nearest;
                renderStation(currentStation);

                // Still try to get fresh location in background
                refreshGeolocation();
                return;
            }
        } catch (e) {
            console.error('Failed to parse cached location:', e);
        }
    }

    // Use fake location for testing (when developing from outside Algeria)
    if (USE_FAKE_LOCATION) {
        console.log('🧪 TESTING MODE: Using fake Algiers location');
        userLat = FAKE_LOCATION.lat;
        userLon = FAKE_LOCATION.lon;
        const nearest = findNearestStation(userLat, userLon);
        currentStation = nearest;
        renderStation(currentStation);
        return;
    }

    // Get fresh geolocation
    refreshGeolocation();
    // Also start continuous watch immediately so heading/position updates begin
    // without requiring a manual press on the locate button.
    startGeoWatch();
}

// Refresh geolocation (can be called separately)
function refreshGeolocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                console.log('Geolocation success:', position.coords);
                userLat = position.coords.latitude;
                userLon = position.coords.longitude;

                // Cache location for iOS PWA
                localStorage.setItem('userLocation', JSON.stringify({
                    lat: userLat,
                    lon: userLon,
                    timestamp: Date.now()
                }));

                const nearest = findNearestStation(userLat, userLon);
                currentStation = nearest;
                renderStation(currentStation);

                // Begin passive watching for movement/heading updates
                startGeoWatch();
            },
            (error) => {
                console.error('Geolocation error:', error.code, error.message);

                // Show user-friendly error message
                const walkTimeText = document.getElementById('walk-time-text');
                if (error.code === 1) {
                    // Permission denied
                    walkTimeText.textContent = 'Location permission denied';
                    console.log('User denied geolocation permission');
                } else if (error.code === 2) {
                    // Position unavailable
                    walkTimeText.textContent = 'Location unavailable';
                    console.log('Position unavailable');
                } else if (error.code === 3) {
                    // Timeout
                    walkTimeText.textContent = 'Location timeout - using default';
                    console.log('Geolocation timeout');
                }

                // Fallback to default station AFTER error
                renderStation(currentStation);
            },
            {
                enableHighAccuracy: true,  // Better accuracy on mobile
                timeout: 15000,            // 15 seconds for mobile
                maximumAge: 30000          // Accept 30-second cached position
            }
        );
    } else {
        console.error('Geolocation not supported');
        renderStation(currentStation);
    }
}

// Start continuous position watch (also yields heading when moving)
function startGeoWatch() {
    if (geoWatchId != null || !navigator.geolocation) return;
    geoWatchId = navigator.geolocation.watchPosition(
        (pos) => {
            userLat = pos.coords.latitude;
            userLon = pos.coords.longitude;
            if (typeof pos.coords.heading === 'number' && isFinite(pos.coords.heading)) {
                updateHeading(pos.coords.heading);
            }
            // Update marker position without redrawing everything
            if (userMarker) {
                try { userMarker.setLatLng([userLat, userLon]); } catch (e) {}
            }
        },
        (err) => {
            console.warn('watchPosition error:', err);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 20000
        }
    );
}

// Initialize device orientation sensors (requires gesture on iOS 13+)
function initHeadingSensors() {
    // iOS 13+: request permission on user gesture; allow multiple attempts
    // Expose a reusable function so we can call it from various UI interactions
    async function requestCompassPermission() {
        let granted = false;
        try {
            if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
                const s = await DeviceOrientationEvent.requestPermission();
                if (s === 'granted') granted = true; else console.warn('DeviceOrientation permission:', s);
            } else {
                // Non-iOS or older Safari: assume allowed
                granted = true;
            }
        } catch (e) {
            console.warn('DeviceOrientation permission error', e);
        }
        try {
            if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
                const s2 = await DeviceMotionEvent.requestPermission();
                if (s2 === 'granted') granted = true; // either grants is fine
                else console.warn('DeviceMotion permission:', s2);
            }
        } catch (e) {
            console.warn('DeviceMotion permission error', e);
        }
        if (granted) {
            orientationPermissionGranted = true;
            attachOrientationListener();
            if (enableCompassBtn) enableCompassBtn.classList.add('hidden');
        } else {
            // Keep the UI button visible for another try
            if (enableCompassBtn) enableCompassBtn.classList.remove('hidden');
        }
        return granted;
    }
    // Expose globally so other modules/UI can trigger it (e.g., map container)
    try { window.requestCompassPermission = requestCompassPermission; } catch {}

    if (locateBtn) locateBtn.addEventListener('click', requestCompassPermission);
    if (enableCompassBtn) enableCompassBtn.addEventListener('click', () => {
        requestCompassPermission();
    });
    // First-chance: capture the very first gesture anywhere on the page
    // This maximizes the chance iOS treats the call as a direct user-activation.
    document.addEventListener('pointerdown', requestCompassPermission, { capture: true, once: true });
    document.addEventListener('touchstart', requestCompassPermission, { capture: true, once: true });
    document.addEventListener('keydown', requestCompassPermission, { capture: true, once: true });
    // Retry hooks: allow subsequent attempts if the user changes Safari settings mid-session
    window.addEventListener('touchstart', requestCompassPermission, { passive: true });
    window.addEventListener('click', requestCompassPermission);

    // For browsers that don't require permission
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
        attachOrientationListener();
    }
}

function attachOrientationListener() {
    if (deviceOrientationActive) return;
    deviceOrientationActive = true;
    console.log('Attaching deviceorientation listeners');
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    // Some Safari builds dispatch deviceorientationabsolute instead
    window.addEventListener('deviceorientationabsolute', handleDeviceOrientation, true);
    // Hide enable button once active
    if (enableCompassBtn) enableCompassBtn.classList.add('hidden');
}

function handleDeviceOrientation(e) {
    const heading = computeHeadingFromEvent(e);
    if (heading != null) updateHeading(heading);
}

function updateHeading(deg) {
    currentHeading = normalizeBearing(deg);
    hasHeadingFix = true;
    // Smooth transitions to avoid flip/jitter and 359→0 jumps
    if (smoothedHeading == null) smoothedHeading = currentHeading;
    const delta = smallestAngleDelta(smoothedHeading, currentHeading);
    smoothedHeading = normalizeBearing(smoothedHeading + HEADING_SMOOTH * delta);

    // Rotate the cone inside the user marker, if present
    if (userMarker) {
        const el = userMarker.getElement();
        if (el) {
            const rotor = el.querySelector('.user-heading-rotor');
            if (rotor) {
                rotor.style.transform = `translate(-50%, -50%) rotate(${smoothedHeading}deg)`;
                rotor.style.opacity = shouldShowCone() ? '1' : '0';
            }
        }
    }
}

// --- Heading helpers ---
function normalizeBearing(b) {
    let a = b % 360;
    if (a < 0) a += 360;
    return a;
}

function smallestAngleDelta(from, to) {
    let diff = normalizeBearing(to) - normalizeBearing(from);
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    return diff;
}

function screenOrientationOffset() {
    // iOS exposes window.orientation: 0, 90, -90, 180 (deprecated but present)
    const o = (typeof window.orientation === 'number') ? window.orientation : 0;
    // Convert to clockwise rotation to add to heading so that 0 still means North
    // When rotated 90 clockwise (landscape), alpha-based heading rotates too;
    // subtract orientation to keep compass stable to North
    return -o;
}

function computeHeadingFromEvent(e) {
    try {
        let heading = null;
        // Prefer WebKit absolute compass heading (magnetic north)
        if (typeof e.webkitCompassHeading === 'number' && isFinite(e.webkitCompassHeading)) {
            // Accept heading even if accuracy is poor; smoothing will stabilize it
            // Some iOS devices report large webkitCompassAccuracy values persistently
            heading = e.webkitCompassHeading; // already clockwise from North
        } else if (typeof e.alpha === 'number' && isFinite(e.alpha)) {
            // If absolute flag present and true, alpha is true-north referenced in some browsers.
            // Use 360 - alpha to convert to compass bearing (clockwise from North)
            if (e.absolute === true) {
                heading = 360 - e.alpha;
            } else if (typeof e.beta === 'number' && typeof e.gamma === 'number') {
                // Fallback: derive heading from Euler angles (alpha/beta/gamma)
                heading = compassHeadingFromEuler(e.alpha, e.beta, e.gamma);
            } else {
                heading = 360 - e.alpha; // best-effort fallback
            }
        }

        if (heading == null) return null;
        heading = normalizeBearing(heading + screenOrientationOffset());
        // Debug log a few early samples
        if (!computeHeadingFromEvent._logged) {
            console.log('Heading sample', { heading, eAlpha: e.alpha, wkh: e.webkitCompassHeading, acc: e.webkitCompassAccuracy });
            computeHeadingFromEvent._logged = true;
            setTimeout(() => { computeHeadingFromEvent._logged = false; }, 2000);
        }
        return heading;
    } catch { return null; }
}

// Compute compass heading from Euler angles (alpha, beta, gamma)
// Adapted from community/MDN formula
function compassHeadingFromEuler(alpha, beta, gamma) {
    const degtorad = Math.PI / 180;
    const x = beta  * degtorad; // beta: rotation around X axis
    const y = gamma * degtorad; // gamma: rotation around Y axis
    const z = alpha * degtorad; // alpha: rotation around Z axis

    const cX = Math.cos(x);
    const cY = Math.cos(y);
    const cZ = Math.cos(z);
    const sX = Math.sin(x);
    const sY = Math.sin(y);
    const sZ = Math.sin(z);

    // Calculate Vx and Vy components
    const Vx = - cZ * sY - sZ * sX * cY;
    const Vy = - sZ * sY + cZ * sX * cY;

    // Calculate compass heading
    let heading = Math.atan2(Vx, Vy);
    if (heading < 0) heading += 2 * Math.PI;
    return heading * (180 / Math.PI);
}

// --- Station Selector Modal ---
const stationModal = document.getElementById('station-modal');
const closeModalBtn = document.getElementById('close-modal');
const stationSearchInput = document.getElementById('station-search');
const stationListEl = document.getElementById('station-list');

function showStationSelector() {
    // Populate station list
    renderStationList(STATIONS);
    stationModal.classList.remove('hidden');
    stationSearchInput.value = '';
    stationSearchInput.focus();
}

function hideStationSelector() {
    stationModal.classList.add('hidden');
}

function renderStationList(stations) {
    stationListEl.innerHTML = '';
    stations.forEach(station => {
        const item = document.createElement('div');
        item.className = 'station-list-item';
        item.innerHTML = `
            <h4>${station.name}</h4>
            <p>${station.address} • ${station.routes.length} routes</p>
        `;
        item.addEventListener('click', () => {
            selectStation(station);
        });
        stationListEl.appendChild(item);
    });
}

function selectStation(station) {
    currentStation = station;
    // Ensure the Bus-style card design is used after selecting a station
    busDetailActive = true;
    renderStation(currentStation);
    hideStationSelector();
    btnNearest.classList.remove('active');
    btnList.classList.add('active');
}

// Search functionality
stationSearchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredStations = STATIONS.filter(station =>
        station.name.toLowerCase().includes(searchTerm) ||
        station.address.toLowerCase().includes(searchTerm)
    );
    renderStationList(filteredStations);
});

// Close modal handlers
closeModalBtn.addEventListener('click', hideStationSelector);
stationModal.addEventListener('click', (e) => {
    if (e.target === stationModal) {
        hideStationSelector();
    }
});

// --- Map Functionality ---
function initMap() {
    const mapContainer = document.getElementById('map-container');

    // Initialize Leaflet map with performance optimizations
    map = L.map(mapContainer, {
        zoomControl: false,
        attributionControl: false,
        preferCanvas: false, // Use SVG for stable line rendering (no thickness change during zoom)
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
        zoomSnap: 0.5, // Smoother zoom
        zoomDelta: 0.5
    }).setView([36.7700, 3.0553], 14); // Slightly closer zoom

    // Pane for labels overlay (above routes but does not block interactions)
    try {
        map.createPane('labels');
        const labelsPane = map.getPane('labels');
        if (labelsPane) {
            // Render labels above tiles but BELOW markers (markerPane ~600)
            labelsPane.style.zIndex = 350;
            labelsPane.style.pointerEvents = 'none';
        }
    } catch {}

    // Add OpenStreetMap tiles with IndexedDB caching (kept as fallback, not shown by default)
    baseTileLayer = L.tileLayer.cached('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        subdomains: 'abc'
    });

    // Clean basemap with clearer landcover (Carto Voyager No Labels)
    walkTileLayer = L.tileLayer.cached('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
        subdomains: 'abcd',
        keepBuffer: 8, // keep 8 tile rows/cols in buffer (default is 2) - prevents grey during parallax
        updateWhenIdle: false, // update tiles during pan/zoom for smoother experience
        updateWhenZooming: true
    });
    // Fallback to OSM base if Carto tiles fail to load
    try {
        walkTileLayer.on('tileerror', () => {
            if (map && baseTileLayer && !map.hasLayer(baseTileLayer)) {
                baseTileLayer.addTo(map);
            }
        });
        walkTileLayer.on('tileload', () => {
            if (map && baseTileLayer && map.hasLayer(baseTileLayer)) {
                // If Carto recovered, prefer Carto-only look
                try { map.removeLayer(baseTileLayer); } catch {}
            }
        });
    } catch {}

    // Labels-only overlay (Carto Voyager Only Labels)
    walkLabelsLayer = L.tileLayer.cached('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        maxZoom: 19,
        subdomains: 'abcd',
        pane: 'labels',
        opacity: 0.95,
        keepBuffer: 8, // keep 8 tile rows/cols in buffer - prevents grey during parallax
        updateWhenIdle: false,
        updateWhenZooming: true
    });

    // Use clean basemap by default in all modes
    if (walkTileLayer && !map.hasLayer(walkTileLayer)) walkTileLayer.addTo(map);
    if (walkLabelsLayer && !map.hasLayer(walkLabelsLayer)) walkLabelsLayer.addTo(map);

    mapInitialized = true;
    updateMap();

    // Invalidate size to ensure map renders at the oversized dimensions (130% height)
    // This forces Leaflet to load more tiles to fill the larger area
    setTimeout(() => {
        map.invalidateSize();
        // Force immediate tile load by panning slightly and back
        const center = map.getCenter();
        map.panBy([1, 1], {animate: false});
        map.panBy([-1, -1], {animate: false});
    }, 200);
    
    // Auto-reorder stations when map is moved in bus mode
    let reorderTimeout;
    let crosshairHideTimeout;
    let isManualMapMove = false; // Track if user is manually moving map
    
    map.on('movestart', () => {
        try {
            if (uiMode === 'bus' && !busDetailActive) {
                // Only show crosshair if this is a MANUAL map move (not panel drag, not station tap, not GPS recenter)
                if (!panelDragging && !isGPSRecentering) {
                    isManualMapMove = true;
                    const crosshair = document.getElementById('map-crosshair');
                    if (crosshair) crosshair.classList.add('visible');
                }
            }
        } catch {}
    });
    
    // ALL SCREENS: Collapse panel to 20vh when user taps/touches the map (PORTRAIT ONLY)
    map.on('click', () => {
        try {
            // Disable in landscape mode - panel is static sidebar
            const isLandscape = window.matchMedia('(orientation: landscape)').matches;
            if (isLandscape) return;
            
            const currentH = window._getPanelVisibleHeight ? window._getPanelVisibleHeight() : 0;
            const minPx = vhToPx(PANEL_MIN_VH); // 40vh
            const maxPx = getPanelMaxPx();
            const circlesHook = vhToPx(20); // 20vh
            
            // Only collapse if panel is at 40vh or higher (not already collapsed)
            if (currentH >= minPx - 10) {
                console.log('[Map Click] Collapsing panel to 20vh with elastic bounce and parallax');
                const panel = document.querySelector('.arrivals-panel');
                if (panel && window._setPanelVisibleHeight) {
                    // Use ELASTIC BOUNCE easing for satisfying overshoot effect (same as pull down)
                    panel.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                    window._setPanelVisibleHeight(circlesHook);
                    
                    // Apply parallax effect to map (same as manual drag)
                    const mapInner = document.getElementById('map-container');
                    if (mapInner) {
                        const parallaxFactor = 0.5; // 50% of panel movement
                        const panelDelta = circlesHook - currentH; // negative (moving down)
                        const panelRange = maxPx - minPx;
                        const progress = panelDelta / panelRange;
                        
                        // Calculate parallax transform
                        const scaleAmount = 1 + (progress * 0.08); // 8% scale
                        const translateAmount = -panelDelta * parallaxFactor;
                        const maxTranslate = 200;
                        const clampedTranslate = Math.max(-maxTranslate, Math.min(maxTranslate, translateAmount));
                        
                        // Apply with elastic bounce animation
                        mapInner.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                        mapInner.style.transform = `translateY(${clampedTranslate}px) scale(${scaleAmount})`;
                        mapInner.style.transformOrigin = 'center center';
                    }
                    
                    // Show circles only in idle mode
                    if (uiMode === 'idle' && userLat && userLon) {
                        showDistanceCircles();
                    }
                }
            }
        } catch {}
    });
    
    map.on('moveend', () => {
        try {
            if (uiMode === 'bus' && !busDetailActive) {
                // Hide crosshair after map stops moving (with delay)
                clearTimeout(crosshairHideTimeout);
                crosshairHideTimeout = setTimeout(() => {
                    const crosshair = document.getElementById('map-crosshair');
                    if (crosshair) crosshair.classList.remove('visible');
                    isManualMapMove = false;
                }, 800); // Hide after 800ms
                
                // SKIP reordering if this moveend was triggered by GPS re-centering
                if (isGPSRecentering) {
                    console.log('[moveend] Skipping reorder - GPS re-center in progress');
                    isGPSRecentering = false; // reset flag
                    return;
                }
                
                // Debounce reordering - wait 300ms after map stops moving
                clearTimeout(reorderTimeout);
                reorderTimeout = setTimeout(() => {
                    renderBusStations(true); // reorder with loading spinner
                }, 300);
            }
        } catch {}
    });

    // Initialize heading sensors (permission will be requested on first gesture if needed)
    initHeadingSensors();
}

function updateMap() {
    if (!map) return;

    // Clear existing layers except the persistent user marker and distance circles
    map.eachLayer(layer => {
        if ((layer instanceof L.Marker || layer instanceof L.Polyline)) {
            if (userMarker && layer === userMarker) return; // keep user marker persistent
            // Keep distance circles layer and its contents
            if (distanceCirclesLayer && distanceCirclesLayer.hasLayer(layer)) return;
            map.removeLayer(layer);
        }
    });

    // Also remove existing OSRM route layer if present
    if (routeLayer) {
        try { map.removeLayer(routeLayer); } catch (e) {}
        routeLayer = null;
    }
    // Remove bus stations layer if present
    if (busStationsLayer) {
        try { map.removeLayer(busStationsLayer); } catch (e) {}
        busStationsLayer = null;
    }

    const station = currentStation;
    // mapStationName removed, we only update distance text
    // Do not add a station marker by default; markers are controlled by uiMode

    // If we have user location, add user marker and draw line
    if (userLat && userLon) {
        // Decide initial visibility of the cone based on permission/heading availability
        const showCone = shouldShowCone();
        // Add or update user marker with heading cone + halo + dot
        const markerHtml = `
            <div class="user-orientation" style="position: relative; pointer-events: none; width: 100%; height: 100%;">
                <div class="user-heading-rotor" style="position:absolute; left:50%; top:50%; transform: translate(-50%, -50%) rotate(${currentHeading ?? 0}deg); transform-origin: 50% 50%; opacity:${showCone?1:0};">
                    <svg width="163" height="163" viewBox="0 0 163 163" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
                        <defs>
                            <!-- Green fog (bold until mid-cone, then fades) -->
                            <linearGradient id="coneGrad" x1="81.5" y1="81.5" x2="81.5" y2="39.7" gradientUnits="userSpaceOnUse">
                                <stop offset="0%"  stop-color="rgba(53,199,89,0.60)"/>
                                <stop offset="35%" stop-color="rgba(53,199,89,0.50)"/>
                                <stop offset="55%" stop-color="rgba(53,199,89,0.30)"/>
                                <stop offset="80%" stop-color="rgba(53,199,89,0.08)"/>
                                <stop offset="100%" stop-color="rgba(53,199,89,0.00)"/>
                            </linearGradient>
                        </defs>
                        <!-- Shorter, wider, Citymapper-like wedge (no base stroke) - scaled 1.167x -->
                        <path d="M81.5 81.5 L53.7 39.7 L109.7 39.7 Z" fill="url(#coneGrad)" stroke="none"/>
                        <!-- Thinner edge bars, green -->
                        <line x1="81.5" y1="81.5" x2="53.7" y2="39.7" stroke="rgba(53,199,89,0.60)" stroke-width="1.4" stroke-linecap="round"/>
                        <line x1="81.5" y1="81.5" x2="109.7" y2="39.7" stroke="rgba(53,199,89,0.60)" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                </div>
                <!-- Soft halo behind the blue location dot -->
                <div class="user-dot-halo" style="position:absolute; left:50%; top:50%; width: 42px; height: 42px; border-radius: 50%; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(0,102,204,0.35) 0%, rgba(0,102,204,0.18) 45%, rgba(0,102,204,0.00) 75%);"></div>
                <div class="user-dot" style="position:absolute; left:50%; top:50%; width: 21px; height: 21px; background: #0066CC; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.30); transform: translate(-50%, -50%);"></div>
            </div>`;

        if (userMarker) {
            try { userMarker.setLatLng([userLat, userLon]); } catch (e) {}
        } else {
            userMarker = L.marker([userLat, userLon], {
                interactive: false,
                icon: L.divIcon({
                    className: 'custom-marker user-orientation-icon',
                    html: markerHtml,
                    iconSize: [163, 163],
                    iconAnchor: [81.5, 81.5]
                })
            }).addTo(map);
        }
        // If userMarker exists but was removed by layer clear, add it back
        if (userMarker && !map.hasLayer(userMarker)) {
            try { userMarker.addTo(map); } catch (e) {}
        }
        // Ensure rotor reflects the latest heading
        const el = userMarker.getElement();
        if (el) {
            const rotor = el.querySelector('.user-heading-rotor');
            if (rotor) {
                rotor.style.transform = `translate(-50%, -50%) rotate(${smoothedHeading ?? currentHeading ?? 0}deg)`;
                rotor.style.opacity = shouldShowCone() ? '1' : '0';
            }
        }

        if (uiMode === 'walk' && station) {
            // Add target station marker as a pole stop with simplified SVG (user-provided geometry)
            const badge = stationBadgeFor(station.name);
            const poleHtml = `
                <svg width="56" height="72" viewBox="0 0 56 72" xmlns="http://www.w3.org/2000/svg" style="pointer-events:none; overflow:visible;">
                  <g opacity="0.20">
                    <polygon points="17.167 62.875 18.745 64 37.008 45.34 34.408 45.34" fill="#000000"/>
                    <rect x="29.623" y="25.656" width="20.21" height="17.019" fill="#000000" stroke="none" transform="matrix(0.933681, 0.358105, -0.682581, 0.809231, 22.0098793875, 2.8023018294999957)" rx="6"/>
                  </g>
                  <rect x="16.385" y="22.409" width="2.6" height="42" rx="1.3" fill="#9CA3AF"/>
                  <rect x="9.185" y="26.409" width="16" height="2" rx="1" fill="#9CA3AF"/>
                  <rect x="6.185" y="12.409" width="22" height="22" rx="6" fill="${badge.color}" stroke="#ffffff" stroke-width="2"/>
                  <text x="17.185" y="23.409" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" dy="0.32em">${badge.abbr}</text>
                </svg>`;
            L.marker([station.lat, station.lon], {
                interactive: false,
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: poleHtml,
                    iconSize: [56, 72],
                    iconAnchor: [16.385, 64.409]
                }),
                zIndexOffset: 1000
            }).addTo(map);
            // Fetch and draw a realistic street route using OSRM (walking profile)
            renderOsrmRoute(userLat, userLon, station.lat, station.lon);
        } else if (uiMode === 'bus') {
            // Show all stations as badge-only markers (no stick, no shadows)
            const markers = STATIONS.map(s => {
                const badge = stationBadgeFor(s.name);
                const marker = L.marker([s.lat, s.lon], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <rect x="1" y="1" width="22" height="22" rx="6" fill="${badge.color}" stroke="#ffffff" stroke-width="2"/>
                            <text x="12" y="12" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" dy="0.32em">${badge.abbr}</text>
                        </svg>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    }),
                    zIndexOffset: 900
                });
                
                // Add click handler: tap station to center map and reorder cards
                marker.on('click', () => {
                    console.log('[Bus Stop Tap] Centering on:', s.name);
                    // Show crosshair when tapping station
                    const crosshair = document.getElementById('map-crosshair');
                    if (crosshair) crosshair.classList.add('visible');
                    map.setView([s.lat, s.lon], map.getZoom(), { animate: true, duration: 0.3 });
                });
                
                return marker;
            });
            busStationsLayer = L.layerGroup(markers).addTo(map);
        } else if (uiMode === 'idle') {
            // IDLE MODE: Show all bus stops like in bus mode
            const markers = STATIONS.map(s => {
                const badge = stationBadgeFor(s.name);
                return L.marker([s.lat, s.lon], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <rect x="1" y="1" width="22" height="22" rx="6" fill="${badge.color}" stroke="#ffffff" stroke-width="2"/>
                            <text x="12" y="12" text-anchor="middle" font-size="11" font-weight="900" fill="#ffffff" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" dy="0.32em">${badge.abbr}</text>
                        </svg>`,
                        iconSize: [24, 24],
                        iconAnchor: [12, 12]
                    }),
                    zIndexOffset: 900
                });
            });
            busStationsLayer = L.layerGroup(markers).addTo(map);
        }

        if (uiMode === 'walk' && station) {
            // Calculate and display distance
            const distance = getDistanceFromLatLonInKm(userLat, userLon, station.lat, station.lon);
            mapDistanceEl.textContent = `📍 ${distance.toFixed(2)} km away`;
        }

        if (uiMode === 'walk' && station) {
            // Fit map to show both markers
            // Account for oversized map (160% height at -50% top) - adjust padding to fit visible area
            const bounds = L.latLngBounds([[userLat, userLon], [station.lat, station.lon]]);
            
            // Base padding for oversized map
            const basePaddingTop = 280;
            const basePaddingBottom = 200;
            
            // Use generous padding to ensure both points are always visible
            map.fitBounds(bounds, { 
                paddingTopLeft: [80, basePaddingTop + 100],  // extra generous padding
                paddingBottomRight: [80, basePaddingBottom + 100],
                maxZoom: 15 // allow zooming out more for long distances
            });
        } else if (uiMode === 'idle') {
            map.setView([userLat, userLon], 16);
        }
    } else {
        // No user location
        if (uiMode === 'walk' && station) {
            map.setView([station.lat, station.lon], 15);
        }
        mapDistanceEl.textContent = '📍 Location unavailable';
    }
}

// Fetch OSRM walking duration without drawing route (for bus station cards)
async function getOsrmWalkingTime(fromLat, fromLon, toLat, toLon) {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) return null;
        const route = data.routes[0];
        // Return duration in minutes
        return route.duration ? Math.round(route.duration / 60) : null;
    } catch (e) {
        return null;
    }
}

// Fetch OSRM driving distance (for bus routes)
async function getOsrmDrivingDistance(fromLat, fromLon, toLat, toLon) {
    const url = `https://routing.openstreetmap.de/routed-car/route/v1/car/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) return null;
        const route = data.routes[0];
        // Return distance in kilometers
        return route.distance ? route.distance / 1000 : null;
    } catch (e) {
        return null;
    }
}

// Show distance circles (5, 15, 60 min walking) around user position in idle mode
function showDistanceCircles() {
    console.log('[showDistanceCircles] Called - map:', !!map, 'userLat:', userLat, 'userLon:', userLon, 'uiMode:', uiMode);
    if (!map || !userLat || !userLon) {
        console.log('[showDistanceCircles] Missing requirements - map:', !!map, 'userLat:', userLat, 'userLon:', userLon);
        return;
    }
    
    // Don't recreate if already exists
    if (distanceCirclesLayer) {
        console.log('[showDistanceCircles] Circles already exist, skipping');
        return;
    }
    
    console.log('[showDistanceCircles] ✅ CREATING NEW CIRCLES LAYER');
    // Create layer group with zoom animation disabled
    distanceCirclesLayer = L.layerGroup();
    distanceCirclesLayer.addTo(map);
    
    // Disable zoom animation for this layer to prevent thickness changes
    if (map._zoomAnimated) {
        distanceCirclesLayer.options = distanceCirclesLayer.options || {};
        distanceCirclesLayer.options.zoomAnimation = false;
    }
    
    // Create circles immediately with realistic walking distances matching Citymapper
    // Citymapper uses slower walking speed: ~3 km/h = ~50 m/min (not 5 km/h)
    const times = [5, 15, 60]; // minutes
    const radii = [250, 750, 3000]; // meters: 5min=250m, 15min=750m, 60min=3km
    
    for (let i = 0; i < times.length; i++) {
        const minutes = times[i];
        const radiusMeters = radii[i];
        
        console.log(`[showDistanceCircles] ✅ Creating circle ${i + 1}/3: ${minutes} min, radius: ${radiusMeters}m`);
        
        // Draw circle with fixed weight
        const circle = L.circle([userLat, userLon], {
            radius: radiusMeters,
            color: '#6B7C93',
            fillColor: 'transparent',
            fillOpacity: 0,
            weight: 1.5,
            opacity: 0.6,
            interactive: false
        });
        
        circle.addTo(distanceCirclesLayer);
        
        // Apply vector-effect and disable zoom animation on the path
        setTimeout(() => {
            try {
                const pathElement = circle.getElement();
                if (pathElement) {
                    pathElement.setAttribute('vector-effect', 'non-scaling-stroke');
                    pathElement.style.vectorEffect = 'non-scaling-stroke';
                    // Disable transform during zoom
                    pathElement.style.willChange = 'auto';
                    console.log(`[showDistanceCircles] ✅ Fixed circle ${i + 1} thickness`);
                }
            } catch (e) {
                console.log(`[showDistanceCircles] Error:`, e);
            }
        }, 50); // Longer timeout to ensure DOM is ready
        console.log(`[showDistanceCircles] ✅ Circle ${i + 1}/3 ADDED TO MAP`);
        
        // Calculate label position at top of circle
        // 1 degree latitude ≈ 111,000 meters
        const latOffset = radiusMeters / 111000;
        const labelLat = userLat + latOffset;
        
        console.log(`[showDistanceCircles] ✅ Creating label ${i + 1}/3: "${minutes} min" at lat: ${labelLat}`);
        
        // Add text label with walking icon at top of circle
        const marker = L.marker([labelLat, userLon], {
            icon: L.divIcon({
                className: 'distance-circle-label',
                html: `<div style="display: flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 600; color: #6B7C93; white-space: nowrap; pointer-events: none; background: transparent;">
                    <svg width="12" height="12" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M67.9,22.6c5.7,0.4,10.8-3.8,11.3-9.7c0.4-5.7-3.8-10.8-9.7-11.3c-5.7-0.4-10.8,3.8-11.3,9.7C57.8,17.1,62.2,22.2,67.9,22.6" fill="#6B7C93"/>
                        <path d="M59,26.9c2-1.5,4.5-2.3,7.3-2.2c3.5,0.3,6.6,2.5,8.3,5.1l10.5,20.9l14.3,10c1.2,1,2,2.5,1.9,4.1c-0.1,2.6-2.5,4.5-5.1,4.2 c-0.7,0-1.5-0.3-2.2-0.7L78.6,57.8c-0.4-0.4-0.9-0.9-1.2-1.5l-4-7.8l-4.7,20.8l18.6,22c0.4,0.7,0.7,1.5,0.9,2.2l5,26.5 c0,0.6,0,1,0,1.5c-0.3,4-3.7,6.7-7.6,6.6c-3.2-0.3-5.6-2.6-6.4-5.6l-4.7-24.7L59.4,81l-3.5,16.1c-0.1,0.7-1.2,2.3-1.5,2.9L40,124.5 c-1.5,2.2-3.8,3.7-6.6,3.4c-4-0.3-6.9-3.7-6.6-7.6c0.1-1.2,0.6-2.2,1-3.1l13.5-22.5L52.5,45l-7.3,5.9l-4,17.7c-0.4,2.2-2.6,4.1-5,4 c-2.6-0.1-4.5-2.5-4.4-5.1c0-0.1,0-0.4,0.1-0.6l4.5-20.6c0.3-0.9,0.7-1.6,1.5-2.2L59,26.9z" fill="#6B7C93"/>
                    </svg>
                    <span>${minutes} min</span>
                </div>`,
                iconSize: [60, 20],
                iconAnchor: [30, 10]
            }),
            interactive: false
        });
        marker.addTo(distanceCirclesLayer);
        console.log(`[showDistanceCircles] ✅ Label ${i + 1}/3 ADDED TO MAP`);
    }
    
    console.log('[showDistanceCircles] ✅✅✅ ALL 3 CIRCLES AND LABELS CREATED AND ADDED TO MAP');
    
    // Disable zoom animation transform on circles to prevent thickness change
    // The issue is Leaflet applies CSS transform scale during zoom which makes strokes thick
    const fixCirclesDuringZoom = () => {
        if (!distanceCirclesLayer) return;
        distanceCirclesLayer.eachLayer(layer => {
            try {
                const el = layer.getElement ? layer.getElement() : null;
                if (el && el.parentElement) {
                    // Remove the zoom animation class that causes scaling
                    el.parentElement.classList.remove('leaflet-zoom-animated');
                    // Force no transform on the SVG group
                    el.parentElement.style.transform = 'none';
                }
            } catch (e) {}
        });
    };
    
    // Apply fix after each zoom
    map.on('zoomend', fixCirclesDuringZoom);
    map.on('moveend', fixCirclesDuringZoom);
    
    // Apply immediately
    setTimeout(fixCirclesDuringZoom, 100);
    
    // Store reference for cleanup
    distanceCirclesLayer._fixZoom = fixCirclesDuringZoom;
}

// Hide distance circles
function hideDistanceCircles() {
    if (distanceCirclesLayer && map) {
        try {
            // Remove zoom listeners
            if (distanceCirclesLayer._fixZoom) {
                map.off('zoomend', distanceCirclesLayer._fixZoom);
                map.off('moveend', distanceCirclesLayer._fixZoom);
            }
            map.removeLayer(distanceCirclesLayer);
            distanceCirclesLayer = null;
        } catch (e) {}
    }
}

// Fetch a street route from user -> station using OSRM and draw it on the map
async function renderOsrmRoute(fromLat, fromLon, toLat, toLon) {
    // Sequence guard to avoid stale routes drawing over the current one
    const seq = ++osrmSeq;
    // Use the foot-only server to avoid accidentally getting car profiles from the demo
    const candidates = [
        `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true&annotations=duration,distance`
    ];

    let route = null;
    let usedUrl = null;
    let lastError = null;
    for (const url of candidates) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data || data.code !== 'Ok' || !data.routes || !data.routes[0]) {
                throw new Error('Bad OSRM payload');
            }
            const r = data.routes[0];
            // Validate that this looks like a walking route
            const steps = (r.legs && r.legs[0] && r.legs[0].steps) || [];
            const modes = steps.map(s => (s.mode || '').toLowerCase());
            const allWalking = modes.length > 0 && modes.every(m => m === 'walking');
            const avgSpeed = (r.distance && r.duration) ? (r.distance / r.duration) : null; // m/s
            // Be stricter: typical walking ~1.2–1.6 m/s; accept up to 2.0 m/s (~7.2 km/h)
            const looksWalking = allWalking || (avgSpeed !== null && avgSpeed <= 2.0);
            if (!looksWalking) {
                console.warn('OSRM route appears non-walking, trying next candidate', { avgSpeed, modes, url });
                continue; // try next server
            }
            route = r;
            usedUrl = url;
            break;
        } catch (e) {
            lastError = e;
            console.warn('OSRM candidate failed:', url, e);
        }
    }

    if (!route) {
        // No valid walking route from OSRM sources — draw fallback dashed path and show em dash
        if (seq === osrmSeq && map) {
            // Remove any existing route layer before drawing fallback
            if (routeLayer) {
                try { map.removeLayer(routeLayer); } catch {}
                routeLayer = null;
            }
            const latlngs = [ [fromLat, fromLon], [toLat, toLon] ];
            const s = computeWalkDash(map ? map.getZoom() : 15);
            routeLayer = L.polyline(latlngs, {
                color: '#2D5872', weight: s.weight, opacity: 0.42, dashArray: s.dash, lineCap: 'round'
            }).addTo(map);
            try { map.off('zoomend', applyWalkRouteStyle); } catch {}
            map.on('zoomend', applyWalkRouteStyle);
            if (walkTimeText) walkTimeText.textContent = '—';
            if (calorieTextEl) calorieTextEl.textContent = '— / Kcal';
        }
        return;
    }

    // Draw the accepted walking route
    const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    try {
        const avgMps = route.distance && route.duration ? (route.distance / route.duration) : null;
        console.log('🧭 OSRM walking route accepted', {
            server: usedUrl,
            from: { lat: fromLat, lon: fromLon },
            to: { lat: toLat, lon: toLon },
            distance_m: route.distance,
            duration_s: route.duration,
            avg_speed_mps: avgMps,
            steps_count: (route.legs && route.legs[0] && route.legs[0].steps) ? route.legs[0].steps.length : 0
        });
    } catch {}
    if (seq === osrmSeq && map) {
        // Remove any existing route layer before drawing latest route
        if (routeLayer) {
            try { map.removeLayer(routeLayer); } catch {}
            routeLayer = null;
        }
        const s = computeWalkDash(map ? map.getZoom() : 15);
        routeLayer = L.polyline(coords, { color: '#2D5872', weight: s.weight, opacity: 0.42, dashArray: s.dash, lineCap: 'round' }).addTo(map);
        try { map.off('zoomend', applyWalkRouteStyle); } catch {}
        map.on('zoomend', applyWalkRouteStyle);
        try {
            const bounds = routeLayer.getBounds();
            
            // Base padding for oversized map (160% height at -50% top)
            const basePaddingTop = 280;
            const basePaddingBottom = 200;
            
            // Use generous padding to ensure full route is always visible
            // Don't try to calculate distance - just use large enough padding
            map.fitBounds(bounds, { 
                paddingTopLeft: [80, basePaddingTop + 100],  // extra generous padding
                paddingBottomRight: [80, basePaddingBottom + 100],
                maxZoom: 15 // allow zooming out more for long routes
            });
        } catch {}
    }
    if (typeof route.duration === 'number' && walkTimeText) {
        const mins = Math.max(1, Math.round(route.duration / 60));
        walkTimeText.textContent = `${mins}'`;
    }
    // Update calorie estimate based on distance
    if (typeof route.distance === 'number' && calorieTextEl) {
        const km = Math.max(0, route.distance / 1000);
        const kcal = Math.max(1, Math.round(km * KCAL_PER_KM));
        calorieTextEl.textContent = `${kcal} / Kcal`;
    }
}

// --- UI Mode switching (idle | walk | bus) ---
function setUIMode(mode) {
    // Track prior mode for Back navigation
    previousMode = uiMode;
    uiMode = mode;
    
    // Hide distance circles when leaving idle mode
    if (mode !== 'idle') {
        hideDistanceCircles();
    }
    
    // ALWAYS center map on GPS location when switching screens
    // This ensures user always sees where they are (blue dot centered)
    if (map && userLat && userLon) {
        if (mode === 'idle') {
            console.log('[setUIMode] Idle mode - centering on GPS');
            map.setView([userLat, userLon], 16, { animate: true, duration: 0.3 });
        } else if (mode === 'walk') {
            console.log('[setUIMode] Walk mode - centering on GPS');
            map.setView([userLat, userLon], 15, { animate: true, duration: 0.3 });
        } else if (mode === 'bus') {
            console.log('[setUIMode] Bus mode - centering on GPS');
            map.setView([userLat, userLon], 14, { animate: true, duration: 0.3 });
        }
    }
    
    // ALWAYS reset panel to minimum position when changing screens
    // This ensures consistent UX - panel always starts at bottom on every screen
    const minPx = vhToPx(PANEL_MIN_VH);
    if (window._setPanelVisibleHeight) {
        const panel = document.querySelector('.arrivals-panel');
        if (panel) {
            panel.style.transition = 'none'; // no animation on mode change
            panel.classList.remove('expanded'); // IMPORTANT: remove expanded class
            window._setPanelVisibleHeight(minPx);
            setTimeout(() => { panel.style.transition = ''; }, 50);
        }
    }

    // Toggle map walking badge and calorie badge visibility
    if (walkingBadgeEl) {
        if (mode === 'walk') walkingBadgeEl.classList.remove('hidden');
        else walkingBadgeEl.classList.add('hidden');
    }
    if (calorieBadgeEl) {
        if (mode === 'walk') calorieBadgeEl.classList.remove('hidden');
        else calorieBadgeEl.classList.add('hidden');
    }

    // Toggle arrivals panel visibility
    if (routesHeaderEl) {
        if (mode === 'bus') routesHeaderEl.classList.remove('hidden');
        else routesHeaderEl.classList.add('hidden');
    }

    // Hide the station selector bar in bus mode AND on detailed (3rd) screen
    if (floatingControlsEl) {
        if (mode === 'bus' || (mode === 'walk' && busDetailActive)) floatingControlsEl.classList.add('hidden');
        else floatingControlsEl.classList.remove('hidden');
    }

    // Crosshair: hide on mode change, will show when user starts moving map
    const crosshair = document.getElementById('map-crosshair');
    if (crosshair) {
        crosshair.classList.remove('visible');
    }

    // Basemap policy: always use clean no-labels + labels overlay in ALL modes
    if (map && walkTileLayer) {
        try {
            if (map.hasLayer(baseTileLayer)) map.removeLayer(baseTileLayer);
            if (!map.hasLayer(walkTileLayer)) walkTileLayer.addTo(map);
            if (walkLabelsLayer && !map.hasLayer(walkLabelsLayer)) walkLabelsLayer.addTo(map);
        } catch (e) { /* no-op */ }
    }
    if (routesListEl) {
        if (mode === 'bus' || busDetailActive) routesListEl.classList.remove('hidden');
        else routesListEl.classList.add('hidden');
    }

    // Home ad: visible only on home (idle), hidden in bus/walk modes
    const homeAdEl = document.getElementById('home-ad-placeholder');
    if (homeAdEl) {
        if (mode === 'idle') homeAdEl.classList.remove('hidden');
        else homeAdEl.classList.add('hidden');
    }

    // Quick actions: visible only on home (idle)
    if (quickActionsEl) {
        if (mode === 'idle') quickActionsEl.classList.remove('hidden');
        else quickActionsEl.classList.add('hidden');
    }

    // Skyline: always visible in all modes (ensure not hidden)
    const skylineEl = document.getElementById('skyline-inline');
    if (skylineEl) {
        skylineEl.classList.remove('hidden');
    }

    // Panel background: always green in all modes
    const panelEl = document.querySelector('.arrivals-panel');
    if (panelEl) {
        panelEl.classList.add('panel-green');
        // Use bus-mode behavior on Bus list AND on detailed (3rd) screen to unify UX
        if ((mode === 'bus') || (mode === 'walk' && busDetailActive)) panelEl.classList.add('bus-mode');
        else panelEl.classList.remove('bus-mode');
        if (mode === 'walk' && busDetailActive) {
            panelEl.classList.add('no-selector');
        } else {
            panelEl.classList.remove('no-selector');
            const oldOverlay = panelEl.querySelector('.detail-bus-overlay-panel');
            if (oldOverlay) oldOverlay.remove();
        }
        // Floating controls now stay fixed above panel (Citymapper style)
    }

    // Choose nearest station when switching modes if we have a location
    // Do NOT override when in bus-detail drilldown
    if (!busDetailActive && userLat && userLon) {
        const nearest = findNearestStation(userLat, userLon);
        if (nearest) currentStation = nearest;
    }

    // Render based on mode
    if (mode === 'bus') {
        // Initial entry shows brief loading state for arrivals
        renderBusStations(true);
    } else {
        if (currentStation) {
            // Unified arrivals design: always render Bus screen card
            renderBusStationDetail(currentStation);
            // Ensure overlay is applied for detailed screen
            applyDetailOverlay();
            
            // Fix panel height after rendering to prevent skyline positioning bug
            // Force recalculation after DOM updates
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (window._setPanelVisibleHeight && window._getPanelVisibleHeight) {
                        const currentH = window._getPanelVisibleHeight();
                        const minPx = vhToPx(PANEL_MIN_VH);
                        // Ensure panel is at correct height
                        if (Math.abs(currentH - minPx) > 5) {
                            window._setPanelVisibleHeight(minPx);
                        }
                    }
                });
            });
        }
    }

    // Update the map for the selected mode
    if (mapInitialized) updateMap();

    // Toggle header badges: settings only on idle; back on walk/bus
    if (settingsBtn) {
        if (mode === 'idle') settingsBtn.classList.remove('hidden');
        else settingsBtn.classList.add('hidden');
    }
    if (backBtn) {
        if (mode === 'idle') backBtn.classList.add('hidden');
        else backBtn.classList.remove('hidden');
    }
    // Arabic logo badge only on home (idle)
    if (arabicTitleEl) {
        if (mode === 'idle') arabicTitleEl.classList.remove('hidden');
        else arabicTitleEl.classList.add('hidden');
    }
    
    // Panel is already reset to minimum at the start of this function
    // No need to restore previous position - always start fresh at minimum
}

// --- Event Listeners ---

// Floating Station Selector Click
if (stationSelectorTrigger) {
    stationSelectorTrigger.addEventListener('click', () => {
        showStationSelector();
    });
}

// Location Button - Center map on user location
if (locateBtn) {
    locateBtn.addEventListener('click', () => {
        if (userLat && userLon) {
            // Center map on user location with animation
            map.flyTo([userLat, userLon], 16, {
                duration: 1.5,
                easeLinearity: 0.5
            });

            // Visual feedback
            locateBtn.style.background = 'var(--primary-color)';
            locateBtn.style.color = 'white';
            setTimeout(() => {
                locateBtn.style.background = 'white';
                locateBtn.style.color = '#333';
            }, 300);
        } else {
            // Try to get location if not available
            refreshGeolocation();
        }
    });
}

// Quick Actions: Bus and Walk
if (actionWalkBtn) {
    actionWalkBtn.addEventListener('click', () => {
        setUIMode('walk');
    });
    // iOS Safari/PWA: ensure tap triggers even if click is swallowed
    actionWalkBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        setUIMode('walk');
    }, { passive: false });
    actionWalkBtn.addEventListener('pointerup', () => { setUIMode('walk'); });
}
if (actionBusBtn) {
    actionBusBtn.addEventListener('click', () => {
        setUIMode('bus');
    });
    // iOS Safari/PWA: ensure tap triggers even if click is swallowed
    actionBusBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        setUIMode('bus');
    }, { passive: false });
    actionBusBtn.addEventListener('pointerup', () => { setUIMode('bus'); });
}

// Map button - show full-screen bus map
const actionMapBtn = document.getElementById('action-map');
const busMapScreen = document.getElementById('bus-map-screen');
const busMapBackBtn = document.getElementById('bus-map-back-btn');

// Global flag to disable bounce guard when bus map is open
let busMapIsOpen = false;

if (actionMapBtn && busMapScreen) {
    actionMapBtn.addEventListener('click', () => {
        busMapScreen.classList.remove('hidden');
        busMapIsOpen = true;
    });
    actionMapBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        busMapScreen.classList.remove('hidden');
        busMapIsOpen = true;
    }, { passive: false });
}

if (busMapBackBtn && busMapScreen) {
    busMapBackBtn.addEventListener('click', () => {
        busMapScreen.classList.add('hidden');
        busMapIsOpen = false;
    });
    busMapBackBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        busMapScreen.classList.add('hidden');
        busMapIsOpen = false;
    }, { passive: false });
}


// Bus Map Zoom and Pan - Citymapper style with smart boundaries
const busMapContainer = document.querySelector('.bus-map-container');
const busMapWrapper = document.getElementById('bus-map-wrapper');
const busMapImage = document.getElementById('bus-map-image');

if (busMapContainer && busMapWrapper && busMapImage) {
    var scale = 1;
    var posX = 0;
    var posY = 0;
    var lastTouchDistance = 0;
    var lastTouchCenter = { x: 0, y: 0 };
    var lastPanPoint = { x: 0, y: 0 };
    var isZooming = false;
    var isPanning = false;
    var initialPinchScale = 1;

    function setTransform() {
        const transform = 'translate(' + posX + 'px, ' + posY + 'px) scale(' + scale + ')';
        busMapWrapper.style.transform = transform;
        busMapWrapper.style.webkitTransform = transform;
    }

    function getTouchDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getTouchCenter(t1, t2) {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    }

    function constrainPan() {
        if (scale <= 1) {
            posX = 0;
            posY = 0;
            return;
        }

        const rect = busMapContainer.getBoundingClientRect();
        const imgWidth = busMapImage.offsetWidth;
        const imgHeight = busMapImage.offsetHeight;
        
        const scaledWidth = imgWidth * scale;
        const scaledHeight = imgHeight * scale;
        
        const maxX = Math.max(0, (scaledWidth - rect.width) / 2);
        const maxY = Math.max(0, (scaledHeight - rect.height) / 2);
        
        if (Math.abs(posX) > maxX) {
            posX = posX > 0 ? maxX : -maxX;
        }
        if (Math.abs(posY) > maxY) {
            posY = posY > 0 ? maxY : -maxY;
        }
    }

    function handleTouchStart(e) {
        if (e.touches.length === 2) {
            e.preventDefault();
            e.stopPropagation();
            isZooming = true;
            isPanning = false;
            lastTouchDistance = getTouchDistance(e.touches[0], e.touches[1]);
            lastTouchCenter = getTouchCenter(e.touches[0], e.touches[1]);
        } else if (e.touches.length === 1) {
            e.preventDefault();
            e.stopPropagation();
            isPanning = true;
            isZooming = false;
            lastPanPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }

    function handleTouchMove(e) {
        if (!isZooming && !isPanning) return;
        
        if (e.touches.length === 2 && isZooming) {
            e.preventDefault();
            e.stopPropagation();
            
            const newDistance = getTouchDistance(e.touches[0], e.touches[1]);
            const scaleChange = newDistance / lastTouchDistance;
            const newScale = scale * scaleChange;
            
            if (newScale >= 1 && newScale <= 6) {
                const newCenter = getTouchCenter(e.touches[0], e.touches[1]);
                const rect = busMapContainer.getBoundingClientRect();
                const centerX = newCenter.x - rect.left - rect.width / 2;
                const centerY = newCenter.y - rect.top - rect.height / 2;
                
                posX = centerX + (posX - centerX) * scaleChange;
                posY = centerY + (posY - centerY) * scaleChange;
                scale = newScale;
                
                constrainPan();
                setTransform();
            }
            
            lastTouchDistance = newDistance;
            
        } else if (e.touches.length === 1 && isPanning) {
            e.preventDefault();
            e.stopPropagation();
            
            const deltaX = e.touches[0].clientX - lastPanPoint.x;
            const deltaY = e.touches[0].clientY - lastPanPoint.y;
            
            posX += deltaX;
            posY += deltaY;
            
            constrainPan();
            setTransform();
            
            lastPanPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }

    function handleTouchEnd(e) {
        if (e.touches.length < 2) {
            isZooming = false;
        }
        if (e.touches.length === 0) {
            isPanning = false;
            
            if (scale <= 1) {
                scale = 1;
                posX = 0;
                posY = 0;
                setTransform();
            }
        }
    }

    // Safari iOS gesture events (for older Safari versions like iOS 15.1)
    function handleGestureStart(e) {
        e.preventDefault();
        initialPinchScale = scale;
        isZooming = true;
    }

    function handleGestureChange(e) {
        e.preventDefault();
        
        // Safari iOS 15.1 sometimes skips gesturestart, so initialize here if needed
        if (!isZooming) {
            initialPinchScale = scale;
            isZooming = true;
        }
        
        const newScale = initialPinchScale * e.scale;
        
        if (newScale >= 1 && newScale <= 6) {
            scale = newScale;
            constrainPan();
            setTransform();
        }
    }

    function handleGestureEnd(e) {
        e.preventDefault();
        isZooming = false;
        
        if (scale <= 1) {
            scale = 1;
            posX = 0;
            posY = 0;
            setTransform();
        }
    }

    // Standard touch events - attach directly to container for Safari iOS 15.1
    busMapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    busMapContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    busMapContainer.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Safari gesture events (iOS specific)
    busMapContainer.addEventListener('gesturestart', handleGestureStart, false);
    busMapContainer.addEventListener('gesturechange', handleGestureChange, false);
    busMapContainer.addEventListener('gestureend', handleGestureEnd, false);

    // Reset on open
    if (actionMapBtn) {
        actionMapBtn.addEventListener('click', function() {
            scale = 1;
            posX = 0;
            posY = 0;
            setTransform();
            debugDiv.innerHTML = 'DEBUG READY<br>';
            debugDiv.style.display = 'block';
            tempDebugBounce.style.display = 'block';
            tempDebugBounce.innerHTML = 'Bounce guard monitor active';
            
            // Test if container exists and is visible
            setTimeout(function() {
                const exists = busMapContainer ? 'YES' : 'NO';
                const rect = busMapContainer ? busMapContainer.getBoundingClientRect() : null;
                const visible = rect ? (rect.width + 'x' + rect.height) : 'N/A';
                const computed = busMapContainer ? window.getComputedStyle(busMapContainer) : null;
                const pointerEvents = computed ? computed.pointerEvents : 'N/A';
                const touchAction = computed ? computed.touchAction : 'N/A';
                
                globalDebugLog('Container exists: ' + exists);
                globalDebugLog('Size: ' + visible);
                globalDebugLog('pointer-events: ' + pointerEvents);
                globalDebugLog('touch-action: ' + touchAction);
                
                // Try to manually trigger a test
                globalDebugLog('Waiting for touch...');
            }, 500);
        });
    }
    
    // Safari gesture events (iOS specific)
    busMapContainer.addEventListener('gesturestart', handleGestureStart, false);
    busMapContainer.addEventListener('gesturechange', handleGestureChange, false);
    busMapContainer.addEventListener('gestureend', handleGestureEnd, false);

    // Reset on open
    if (actionMapBtn) {
        actionMapBtn.addEventListener('click', function() {
            scale = 1;
            posX = 0;
            posY = 0;
            setTransform();
        });
    }
}

// Back button navigation rules:
// - If on 3rd screen (walk + busDetailActive), go back to Bus list.
// - Else if on Bus list, go back to Home (idle).
// - Else (e.g., Walk screen from quick action), go to previous or Home.
if (backBtn) {
    backBtn.addEventListener('click', () => {
        if (uiMode === 'walk' && busDetailActive) {
            busDetailActive = false;
            setUIMode('bus');
            return;
        }
        if (uiMode === 'bus') {
            busDetailActive = false;
            setUIMode('idle');
            return;
        }
        setUIMode(previousMode || 'idle');
    });
}

// Compass Button - Simple visual feedback (Leaflet has no bearing by default)
const compassBtn = document.getElementById('compass-btn');
if (compassBtn) {
    compassBtn.addEventListener('click', () => {
        // Visual feedback
        compassBtn.style.transform = 'rotate(360deg) scale(1.1)';
        setTimeout(() => {
            compassBtn.style.transform = '';
        }, 300);
    });
}

// Bottom Sheet: drag the arrivals panel up/down, no page bounce
const mapViewContainer = document.querySelector('.map-view-container');
const arrivalsPanel = document.querySelector('.arrivals-panel');
const PANEL_MIN_VH = 40; // visible height when collapsed (Safari reference)
const PANEL_MAX_VH = 85; // visible height when expanded
let panelDragging = false; // global flag to coordinate with bounce guard
let pendingDrag = false;   // waiting to see if movement exceeds threshold
let startTarget = null;

function vhToPx(vh) {
    // Use polyfilled --vh for consistent Safari/PWA behavior
    try {
        const vhValue = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vh'));
        if (vhValue && vhValue > 0) {
            let result = vhValue * vh;
            
            // PWA compensation: PWA has taller viewport (no browser UI ~100px)
            // So 40vh in PWA = more pixels than 40vh in Safari
            // We need to ADD pixels in PWA to make panel sit HIGHER (match Safari visual position)
            const isPWA = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || !!window.navigator.standalone;
            if (isPWA && vh === PANEL_MIN_VH) {
                // Add ~50px to make panel sit higher in PWA (compensate for missing browser UI)
                result += 50;
                console.log(`[vhToPx] PWA compensation: ${vh}vh = ${Math.round(result)}px (added 50px)`);
            }
            
            return Math.round(result);
        }
    } catch {}
    // Fallback to innerHeight
    const h = window.innerHeight || document.documentElement?.clientHeight || 800;
    return Math.round(h * (vh / 100));
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
// Compute dynamic maximum height for the bottom sheet
function getPanelMaxPx() {
    try {
        const panel = arrivalsPanel || document.querySelector('.arrivals-panel');
        if (!panel) return vhToPx(PANEL_MAX_VH);
        // In Bus mode (station list) OR Detailed (3rd) screen, allow expanding up to
        // the viewport height or to fit all content if smaller.
        if ((uiMode === 'bus' && !busDetailActive) || (uiMode === 'walk' && busDetailActive)) {
            const minPx = vhToPx(PANEL_MIN_VH);
            const panelRect = panel.getBoundingClientRect();
            // Prefer the bottom of .routes-list (cards) as the content bottom
            let inFlowBottom = panelRect.top;
            const listEl = panel.querySelector('.routes-list');
            if (listEl) {
                try {
                    const listRect = listEl.getBoundingClientRect();
                    const csList = window.getComputedStyle(listEl);
                    const pb = parseFloat(csList.paddingBottom) || 0;
                    const listTopInPanel = listRect.top - panelRect.top;
                    // Use scrollHeight to capture full content height (not clipped by container)
                    const contentHeight = Math.max(listEl.scrollHeight || 0, listRect.height || 0);
                    let bottom = panelRect.top + listTopInPanel + contentHeight - pb;
                    inFlowBottom = Math.max(inFlowBottom, bottom);
                } catch {}
            } else {
                // Fallback: scan all non-absolute children except the skyline
                const children = Array.from(panel.children || []);
                for (const el of children) {
                    try {
                        if (!el || el.id === 'skyline-inline') continue;
                        const cs = window.getComputedStyle(el);
                        if (cs.position === 'absolute') continue;
                        const r = el.getBoundingClientRect();
                        if (r.bottom > inFlowBottom) inFlowBottom = r.bottom;
                    } catch {}
                }
            }
            // Skyline visible height
            let skylineH = 0;
            try {
                const sky = panel.querySelector('#skyline-inline');
                if (sky) {
                    const csSky = window.getComputedStyle(sky);
                    skylineH = parseFloat(csSky.height) || sky.getBoundingClientRect().height || 0;
                }
            } catch {}
            const contentH = Math.max(0, inFlowBottom - panelRect.top);
            // Stop exactly when cards meet skyline (no growing blue gap)
            const desired = Math.ceil(Math.max(minPx, contentH + skylineH));
            
            // IMPORTANT: Cap max height to prevent panel jump on first touch
            // In both bus and walk modes, if panel is NOT expanded, cap to default PANEL_MAX_VH
            const isExpanded = arrivalsPanel.classList.contains('expanded');
            if (!isExpanded) {
                const defaultMax = vhToPx(PANEL_MAX_VH);
                console.log('[getPanelMaxPx] NOT EXPANDED - desired:', desired, 'defaultMax:', defaultMax, 'returning:', Math.min(desired, defaultMax));
                return Math.min(desired, defaultMax);
            }
            
            console.log('[getPanelMaxPx] EXPANDED - desired:', desired);
            return desired;
        }
    } catch {}
    // Default cap
    return vhToPx(PANEL_MAX_VH);
}

function setupPanelDrag() {
    if (!arrivalsPanel) return;
    
    // Helper: Check if in landscape mode
    const isLandscape = () => window.matchMedia('(orientation: landscape)').matches;
    
    // Inject a visible grabber handle for reliability on iOS
    let grabber = arrivalsPanel.querySelector('.sheet-grabber');
    if (!grabber) {
        grabber = document.createElement('div');
        grabber.className = 'sheet-grabber';
        arrivalsPanel.prepend(grabber);
    }
    let dragging = false;
    let startY = 0;
    let startVisible = 0; // visible height of the sheet during drag
    let lastMoves = [];
    let startInList = false;
    let startListEl = null;
    let startListScrollTop = 0;
    let startTarget = null; // track what element started the touch
    // Inertial glide state
    let inertiaActive = false;
    let inertiaFrame = 0;
    let pendingDrag = false; // waiting for movement threshold
    
    // Update CSS variable to drive skyline size/opacity based on sheet progress [0..1]
    const updateSheetProgress = (h, minPx, maxPx) => {
        try {
            const denom = Math.max(1, (maxPx - minPx));
            const p = Math.max(0, Math.min(1, (h - minPx) / denom));
            arrivalsPanel.style.setProperty('--sheet-progress', String(p));
        } catch {}
    };

    // Helpers to set/get visible height by translating the fixed-bottom panel
    const setPanelVisibleHeight = (visiblePx) => {
        const minPx = vhToPx(PANEL_MIN_VH);
        const maxPx = getPanelMaxPx();
        // Allow elastic bounce: don't clamp during drag, only clamp offset calculation
        const vis = visiblePx; // use raw value to allow over-pull
        const offset = Math.max(0, maxPx - vis); // how far to push the panel down
        
        // Force GPU acceleration with translateZ(0) for 60fps
        arrivalsPanel.style.transform = `translateY(${offset}px) translateZ(0)`;
        arrivalsPanel.style.webkitTransform = `translateY(${offset}px) translateZ(0)`;
        arrivalsPanel.style.height = `${maxPx}px`; // keep the panel sized to its max
        
        // Expose sizes to CSS for consistent PWA/Safari proportions
        arrivalsPanel.style.setProperty('--panel-visible', `${vis}px`);
        arrivalsPanel.style.setProperty('--panel-max', `${maxPx}px`);
        arrivalsPanel.dataset.visibleH = String(vis);
        // Clamp progress calculation for visual effects
        const clampedVis = clamp(vis, minPx, maxPx);
        updateSheetProgress(clampedVis, minPx, maxPx);
        // Keep skyline height consistent across Safari and PWA
        try { applySkylineSizing(); applyPWASkylineAnchoring(); } catch {}
    };
    const getPanelVisibleHeight = () => {
        const v = parseFloat(arrivalsPanel?.dataset?.visibleH || '');
        if (!Number.isNaN(v)) return v;
        // Fallback to collapsed on first run
        return vhToPx(PANEL_MIN_VH);
    };
    // Expose globally for recalculation after viewport polyfill and mode switching
    window._setPanelVisibleHeight = setPanelVisibleHeight;
    window._getPanelVisibleHeight = getPanelVisibleHeight;

    const handleStart = (y, target) => {
        // Disable dragging in landscape mode
        if (isLandscape()) return false;
        
        console.log('[handleStart] y:', y, 'target:', target?.className || target?.tagName);
        
        // ONLY exclude actual buttons - everything else in the panel should be draggable
        const isButton = !!(target && target.closest && (
            target.closest('.quick-actions-panel') || 
            target.closest('.qa-btn') ||
            target.closest('button') ||
            target.closest('.back-badge') ||
            target.closest('.settings-badge') ||
            target.closest('.map-control-btn') ||
            target.closest('.close-btn')
        ));
        
        if (isButton) {
            console.log('[handleStart] Touch on button - ignoring for panel drag');
            return false;
        }
        
        const list = arrivalsPanel.querySelector('.routes-list');
        const inList = !!(target && target.closest && target.closest('.routes-list'));
        const isExpanded = arrivalsPanel.classList.contains('expanded');
        const isBusMode = arrivalsPanel.classList.contains('bus-mode');
        
        // If starting inside the list while expanded and the list is scrolled, let it scroll instead of dragging
        if (!isBusMode && inList && isExpanded && list && list.scrollTop > 0) return false;
        startInList = inList;
        startListEl = list || null;
        startListScrollTop = list ? list.scrollTop : 0;
        dragging = false;           // don't start dragging yet
        pendingDrag = true;         // wait for movement threshold
        panelDragging = false;
        // If inertia is running, cancel it and take control
        if (inertiaActive) {
            inertiaActive = false;
            try { cancelAnimationFrame(inertiaFrame); } catch {}
        }
        startTarget = target || null;
        startY = y;
        console.log('[handleStart] SET startY to:', startY);
        // read current visible height (px)
        startVisible = getPanelVisibleHeight();
        lastMoves = [{ t: performance.now(), h: startVisible }];
        return true;
    };

    const handleMove = (y) => {
        // Disable dragging in landscape mode
        if (isLandscape()) return;
        
        if (!pendingDrag && !dragging) return; // not in a drag gesture at all
        
        if (pendingDrag && !dragging) {
            // If gesture started inside the routes list and the sheet is expanded,
            // allow the list to handle its own scroll for upward drags or when the
            // list has scrollable content.
            if (startInList && arrivalsPanel.classList.contains('expanded') && !arrivalsPanel.classList.contains('bus-mode')) {
                const list = startListEl || arrivalsPanel.querySelector('.routes-list');
                const canScroll = !!(list && (list.scrollHeight - list.clientHeight > 1));
                const dySigned = y - startY; // up < 0, down > 0
                if (canScroll) {
                    // Upward gesture: always let the list scroll
                    if (dySigned < 0) return;
                    // Downward gesture: if list already scrolled, let it consume
                    if (dySigned > 0 && startListScrollTop > 0) return;
                }
            }
            const dy = Math.abs(y - startY);
            if (dy > 2) { // very low threshold for instant response
                dragging = true;
                panelDragging = true;
                arrivalsPanel.style.transition = 'none';
                console.log('[DRAG START] dy:', dy, 'uiMode:', uiMode, 'busDetailActive:', busDetailActive, 'expanded:', arrivalsPanel.classList.contains('expanded'), 'startVisible:', startVisible, 'startY:', startY, 'currentY:', y);
            } else {
                return; // not enough movement yet
            }
        }
        if (!dragging) return;
        const delta = startY - y; // drag up -> positive delta, drag down -> negative delta
        const minPx = vhToPx(PANEL_MIN_VH); // 40vh - initial position
        const maxPx = getPanelMaxPx();
        const circlesHook = vhToPx(20); // 20vh - circles view (MINIMUM allowed when pulling down)
        console.log('[DRAG MOVE] delta:', delta, 'minPx:', minPx, 'maxPx:', maxPx, 'circlesHook:', circlesHook, 'startVisible:', startVisible);
        const scale = getDragScale();
        let next = startVisible + delta * scale;
        
        console.log('[DRAG MOVE] next BEFORE clamp:', next);
        
        // HARD LIMIT: Don't allow panel to go below circlesHook (30vh) when pulling down
        // This creates a hard stop at 30vh
        if (next < circlesHook) {
            next = circlesHook; // STOP at circles hook, can't go lower
        } else if (next > maxPx) {
            // Resistance when pulling up beyond maximum
            const overPull = next - maxPx;
            const resistance = 0.3;
            next = maxPx + (overPull * resistance);
        }
        
        console.log('[DRAG MOVE] next AFTER clamp:', next);
        
        setPanelVisibleHeight(next);
        
        // DON'T show/hide circles during drag - only after release in handleEnd
        // This prevents circles from appearing while dragging
        
        // Citymapper-style parallax: VISUAL effect only, don't actually move map tiles
        // Apply transform to map-container (the visual layer), not map-view-container
        if (mapViewContainer) {
            const parallaxFactor = 0.5; // 50% of panel movement (more aggressive, follows closely)
            const panelDelta = next - startVisible; // how much panel moved from start
            const panelRange = maxPx - minPx; // total possible movement
            const progress = panelDelta / panelRange; // normalized progress [-1..1]
            
            // Only apply VISUAL transform to the inner map container
            const mapInner = document.getElementById('map-container');
            if (mapInner) {
                // More noticeable scale and translate for better parallax feel
                const scaleAmount = 1 + (progress * 0.08); // 8% scale for more dramatic effect
                const translateAmount = -panelDelta * parallaxFactor; // more aggressive translate
                
                // Clamp translate to prevent revealing edges (map is now 180% height with 40% buffer)
                const maxTranslate = 200; // max 200px movement in either direction (we have 40% buffer = ~240px at typical viewport)
                const clampedTranslate = Math.max(-maxTranslate, Math.min(maxTranslate, translateAmount));
                
                mapInner.style.transform = `translateY(${clampedTranslate}px) scale(${scaleAmount})`;
                mapInner.style.transformOrigin = 'center center'; // scale from center
                mapInner.style.transition = 'none'; // no transition during drag
            }
        }
        
        // record movement for velocity calculation
        const now = performance.now();
        lastMoves.push({ t: now, h: next });
        // keep only recent samples (~120ms window)
        while (lastMoves.length > 2 && (now - lastMoves[0].t) > 140) lastMoves.shift();
    };

    const handleEnd = () => {
        // Disable dragging in landscape mode
        if (isLandscape()) return;
        
        if (!dragging && !pendingDrag) return;
        
        // If we never started actually dragging (just pending), reset and allow click
        if (pendingDrag && !dragging) {
            pendingDrag = false;
            startTarget = null;
            return;
        }
        
        dragging = false;
        pendingDrag = false;
        panelDragging = false;
        startTarget = null;
        
        // DON'T reset map immediately - let it animate together with panel snap
        // Map will be reset after we determine the snap target
        
        // We'll handle inertia manually; disable CSS transition during the glide
        arrivalsPanel.style.transition = 'none';
        const minPx = vhToPx(PANEL_MIN_VH);
        const maxPx = getPanelMaxPx();
        // compute velocity using recent samples (~120ms)
        let velocity = 0;
        if (lastMoves.length >= 2) {
            const a = lastMoves[0];
            const b = lastMoves[lastMoves.length - 1];
            const dt = Math.max(1, b.t - a.t);
            velocity = (b.h - a.h) / dt; // px/ms (positive = upward growth)
        }
        const absV = Math.abs(velocity);
        const circlesHook = vhToPx(20); // 20vh position
        
        console.log('[handleEnd] velocity:', velocity, 'absV:', absV, 'currentH:', getPanelVisibleHeight());
        
        // Adjust velocity threshold for Chrome mobile (more sensitive than Safari)
        // Chrome reports higher velocities, so we need a higher threshold
        const isChrome = /Chrome/.test(navigator.userAgent) && /Mobile/.test(navigator.userAgent);
        const velocityThreshold = isChrome ? 0.03 : 0.015; // Chrome: 30px/s, Safari: 15px/s
        
        // Very sensitive flick detection like Citymapper - even tiny flicks should advance
        if (absV > velocityThreshold) {
            inertiaActive = true;
            let h = getPanelVisibleHeight();
            const startH = h; // Remember starting position
            const dir = velocity >= 0 ? 1 : -1;
            const DECEL = 0.0008; // slower decel for longer, smoother glide
            const MIN_GLIDE_MS = 450; // longer glide for buttery feel
            const startTs = performance.now();
            let lastTs = startTs;
            const step = (ts) => {
                if (!inertiaActive) return;
                const dt = Math.max(1, ts - lastTs);
                lastTs = ts;
                const elapsed = ts - startTs;
                // Speed decreases linearly with time until it hits 0
                const vNow = Math.max(0, absV - DECEL * elapsed);
                
                // IMPORTANT: If started at 20vh and pushing up, clamp to 40vh max (not higher)
                let clampMin = circlesHook;
                let clampMax = maxPx;
                if (Math.abs(startH - circlesHook) < 20 && dir > 0) {
                    // Started at 20vh, pushing up - stop at 40vh
                    clampMax = minPx;
                }
                h = clamp(h + dir * vNow * dt, clampMin, clampMax);
                
                // Use transform directly with GPU acceleration for buttery smooth 60fps animation
                const offset = Math.max(0, maxPx - h);
                arrivalsPanel.style.transform = `translateY(${offset}px) translateZ(0)`;
                arrivalsPanel.style.webkitTransform = `translateY(${offset}px) translateZ(0)`;
                arrivalsPanel.dataset.visibleH = String(h);
                
                // Stop if speed nearly zero or bounds reached
                const nearBound = (h <= minPx + 0.5) || (h >= maxPx - 0.5);
                if ((elapsed >= MIN_GLIDE_MS && vNow <= 0.005) || nearBound) {
                    inertiaActive = false;
                    
                    // FORCE: If at 20vh and moving up, go to 40vh
                    const circlesHook = vhToPx(20);
                    let target;
                    if (Math.abs(h - circlesHook) < 20 && dir > 0) {
                        console.log('[INERTIA] At 20vh, moving up → FORCING 40vh');
                        target = minPx; // Force 40vh
                    } else {
                        target = pickSnapTarget(h, dir * vNow);
                    }
                    
                    console.log('[INERTIA] Final snap: h=', h, 'target=', target, 'dir=', dir);
                    
                    arrivalsPanel.style.transition = 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)'; // iOS-like easing
                    setPanelVisibleHeight(target);
                    
                    // Reset map parallax synchronized with panel snap
                    const mapInner = document.getElementById('map-container');
                    if (mapInner) {
                        mapInner.style.transition = 'transform 0.24s cubic-bezier(.2,.7,.2,1)';
                        mapInner.style.transform = 'translateY(0) scale(1)';
                    }
                    
                    if (target >= (minPx + maxPx) / 2) {
                        arrivalsPanel.classList.add('expanded');
                    } else {
                        arrivalsPanel.classList.remove('expanded');
                    }
                    
                    // Show/hide distance circles based on final position in idle mode
                    // Only show at 20vh, hide at all other positions
                    if (uiMode === 'idle' && userLat && userLon) {
                        const circlesHook = vhToPx(20);
                        const isAt20vh = Math.abs(target - circlesHook) < 1;
                        console.log('[CIRCLES INERTIA] target:', target, 'circlesHook:', circlesHook, 'isAt20vh:', isAt20vh);
                        
                        if (isAt20vh && !distanceCirclesLayer) {
                            console.log('[CIRCLES] ✅ Showing circles - at 20vh (inertia)');
                            showDistanceCircles();
                        } else if (!isAt20vh && distanceCirclesLayer) {
                            console.log('[CIRCLES] ❌ Hiding circles - not at 20vh (inertia)');
                            hideDistanceCircles();
                        }
                    }
                    
                    // Re-center map on GPS when pulling up from 20vh (ALL screens)
                    if (userLat && userLon && target > circlesHook + 10) {
                        console.log('[MAP] Re-centering on GPS after pulling up from 20vh');
                        isGPSRecentering = true; // Set flag to prevent reordering
                        map.setView([userLat, userLon], map.getZoom(), { animate: true, duration: 0.3 });
                    }
                    
                    lastMoves = [];
                    setTimeout(() => { try { if (map) map.invalidateSize(); } catch {} }, 260);
                    return;
                }
                inertiaFrame = requestAnimationFrame(step);
            };
            inertiaFrame = requestAnimationFrame(step);
        } else {
            // No meaningful velocity: snap to nearest stop
            const currentH = getPanelVisibleHeight();
            const circlesHook = vhToPx(20); // 20vh circles position
            
            // Special logic: only snap to circlesHook if very close (within 2vh)
            // Otherwise always return to minPx (40vh) or higher snap stops
            let target;
            if (currentH > maxPx) {
                target = maxPx; // bounce back to maximum
            } else if (currentH <= circlesHook + vhToPx(2)) {
                // Very close to circles hook - snap to it
                target = circlesHook;
            } else {
                // Otherwise snap to normal stops (40vh, 60vh, 85vh, max)
                const projected = clamp(currentH + velocity * 140, minPx, maxPx);
                target = pickSnapTarget(projected, velocity);
            }
            
            // Use elastic bounce easing if bouncing back from over-pull
            const isBouncingBack = (currentH > maxPx);
            const easing = isBouncingBack 
                ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' // elastic bounce with overshoot
                : 'transform 0.24s cubic-bezier(.2,.7,.2,1)'; // normal snap
            
            arrivalsPanel.style.transition = easing;
            setPanelVisibleHeight(target);
            
            // Reset map parallax synchronized with panel snap
            const mapInner = document.getElementById('map-container');
            if (mapInner) {
                mapInner.style.transition = easing; // use same easing as panel
                mapInner.style.transform = 'translateY(0) scale(1)';
            }
            
            if (target >= (minPx + maxPx) / 2) {
                arrivalsPanel.classList.add('expanded');
            } else {
                arrivalsPanel.classList.remove('expanded');
            }
            
            // Show/hide distance circles based on final position in idle mode
            // Only show at 20vh, hide at all other positions
            if (uiMode === 'idle' && userLat && userLon) {
                const isAt20vh = Math.abs(target - circlesHook) < 1; // Within 1px of 20vh
                console.log('[CIRCLES] target:', target, 'circlesHook:', circlesHook, 'isAt20vh:', isAt20vh, 'circlesExist:', !!distanceCirclesLayer);
                
                if (isAt20vh && !distanceCirclesLayer) {
                    console.log('[CIRCLES] ✅ Showing circles - at 20vh');
                    showDistanceCircles();
                } else if (!isAt20vh && distanceCirclesLayer) {
                    console.log('[CIRCLES] ❌ Hiding circles - not at 20vh');
                    hideDistanceCircles();
                }
            }
            
            // Re-center map on GPS when pulling up from 20vh (ALL screens)
            if (userLat && userLon && target > circlesHook + 10) {
                console.log('[MAP] Re-centering on GPS after pulling up from 20vh');
                isGPSRecentering = true; // Set flag to prevent reordering
                map.setView([userLat, userLon], map.getZoom(), { animate: true, duration: 0.3 });
            }
            
            lastMoves = [];
            setTimeout(() => { try { if (map) map.invalidateSize(); } catch {} }, 260);
        }
        // Invalidate map size handled after snap where appropriate
    };

    // Touch events (mobile)
    grabber.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleStart(t.clientY, e.target);
        e.preventDefault(); // ensure we capture drag from handle
    }, { passive: false, capture: true });
    grabber.addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        handleMove(t.clientY);
        if (pendingDrag || panelDragging) e.preventDefault();
    }, { passive: false, capture: true });
    grabber.addEventListener('touchend', () => handleEnd(), { capture: true });
    // Tap-to-toggle for reliability on iOS
    grabber.addEventListener('click', (e) => {
        e.preventDefault();
        const minPx = vhToPx(PANEL_MIN_VH);
        const maxPx = getPanelMaxPx();
        const mid = (minPx + maxPx) / 2;
        arrivalsPanel.style.transition = 'transform 0.25s ease';
        if (getPanelVisibleHeight() < mid) {
            setPanelVisibleHeight(maxPx);
            arrivalsPanel.classList.add('expanded');
        } else {
            setPanelVisibleHeight(minPx);
            arrivalsPanel.classList.remove('expanded');
        }
    });

    arrivalsPanel.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        handleStart(t.clientY, e.target);
        // do NOT preventDefault on touchstart; allow taps to become clicks
    }, { passive: false, capture: true });
    arrivalsPanel.addEventListener('touchmove', (e) => {
        if (!pendingDrag && !dragging) return; // safety: only handle move if we started a gesture
        const t = e.touches[0];
        if (!t) return;
        handleMove(t.clientY);
        if (dragging) e.preventDefault();
    }, { passive: false, capture: true });
    arrivalsPanel.addEventListener('touchend', () => handleEnd());

    // Document-level capture to guarantee drag from anywhere inside the panel
    document.addEventListener('touchstart', (e) => {
        const inPanel = e.target && e.target.closest && e.target.closest('.arrivals-panel');
        if (!inPanel) return;
        
        // Don't capture if touch is on the map (even if map is behind panel)
        const onMap = e.target && (
            e.target.closest('.leaflet-container') || 
            e.target.closest('#map-container') ||
            e.target.closest('.map-view-container')
        );
        if (onMap) return;
        
        const t = e.touches && e.touches[0];
        if (!t) return;
        handleStart(t.clientY, e.target);
    }, { passive: false, capture: true });
    document.addEventListener('touchmove', (e) => {
        if (!panelDragging) return;
        const t = e.touches && e.touches[0];
        if (!t) return;
        handleMove(t.clientY);
        e.preventDefault();
    }, { passive: false, capture: true });
    document.addEventListener('touchend', () => { if (panelDragging) handleEnd(); }, { capture: true });

    // Pointer events (desktop/testing)
    arrivalsPanel.addEventListener('pointerdown', (e) => { handleStart(e.clientY, e.target); });
    window.addEventListener('pointermove', (e) => { handleMove(e.clientY); });
    window.addEventListener('pointerup', () => handleEnd());

    // Initialize to collapsed height using translateY (panel moves as a whole)
    const minPx = vhToPx(PANEL_MIN_VH);
    arrivalsPanel.classList.remove('expanded');
    arrivalsPanel.style.willChange = 'transform';
    setPanelVisibleHeight(minPx);

    // Floating controls stay fixed above panel (Citymapper style) - no longer moved inside
}

// Prevent global rubber-band: allow scroll on known internal scroll areas (map, lists, modal)
function installBounceGuard() {
    const allowSelectors = [
        '#map-container', '.leaflet-container',
        '.arrivals-panel', '.routes-list',
        '.quick-actions-panel', '.qa-btn',
        '.station-list', '.modal-content',
        '#action-bus', '#action-walk', '.back-badge', '#settings-btn'
    ];
    document.addEventListener('touchmove', (e) => {
        if (panelDragging) { e.preventDefault(); return; }
        
        // CRITICAL: If bus map is open, don't interfere with ANY touch events
        if (typeof busMapIsOpen !== 'undefined' && busMapIsOpen) {
            return;
        }
        
        const ok = allowSelectors.some(sel => e.target.closest(sel));
        if (ok) return; // allow default touchmove
        e.preventDefault(); // block page-level drag/bounce
    }, { passive: false });
}

// Install viewport polyfill FIRST before any layout calculations
installViewportPolyfill();

// IMMEDIATELY position panel to prevent flash - don't wait for requestAnimationFrame
if (arrivalsPanel) {
    const minPx = vhToPx(PANEL_MIN_VH);
    const maxPx = vhToPx(PANEL_MAX_VH);
    const offset = Math.max(0, maxPx - minPx);
    arrivalsPanel.style.transform = `translateY(${offset}px)`;
    arrivalsPanel.style.height = `${maxPx}px`;
    arrivalsPanel.style.transition = 'none'; // no transition on initial load
}

// Wait for polyfill to fully apply before initializing panel drag handlers
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        setupPanelDrag();
        installBounceGuard();
        
        // Force multiple recalculations to ensure correct positioning in both Safari and PWA
        const recalculate = () => {
            try {
                installViewportPolyfill();
                const minPx = vhToPx(PANEL_MIN_VH);
                const panel = document.querySelector('.arrivals-panel');
                if (panel && window._setPanelVisibleHeight) {
                    const currentVis = parseFloat(panel.dataset.visibleH || '0');
                    console.log(`[Panel Init] Current: ${currentVis}px, Target: ${minPx}px, PANEL_MIN_VH: ${PANEL_MIN_VH}vh`);
                    if (Math.abs(currentVis - minPx) > 5) {
                        panel.style.transition = 'none';
                        window._setPanelVisibleHeight(minPx);
                        console.log(`[Panel Init] Corrected to ${minPx}px`);
                        setTimeout(() => { panel.style.transition = ''; }, 50);
                    }
                }
            } catch (e) {
                console.error('[Panel Init] Error:', e);
            }
        };
        
        // Recalculate at multiple intervals to catch PWA viewport changes
        setTimeout(recalculate, 100);
        setTimeout(recalculate, 250);
        setTimeout(recalculate, 500);
    });
});
// Keep skyline sizing/anchoring updated on viewport changes (Safari + PWA)
window.addEventListener('resize', () => { try { applySkylineSizing(); applyPWASkylineAnchoring(); } catch {} });
window.addEventListener('orientationchange', () => { try { applySkylineSizing(); applyPWASkylineAnchoring(); } catch {} });
try { if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { try { applySkylineSizing(); applyPWASkylineAnchoring(); } catch {} }); } catch {}
// Apply once after DOM ready as a safeguard
document.addEventListener('DOMContentLoaded', () => { try { applySkylineSizing(); applyPWASkylineAnchoring(); } catch {} });

// Init
initMap(); // Initialize map immediately (background)
initGeolocation();

// Initialize traffic sampling - update every 3 minutes
if (window.TrafficSampler) {
    console.log('[Traffic] 🚦 Real-time Google Maps traffic enabled (leaky tiles)');
    console.log('[Traffic] 📊 Manual time-based calculation as fallback');
    
    // Clear cached traffic speeds every 3 minutes to get fresh data
    setInterval(() => {
        if (window.STATIONS) {
            STATIONS.forEach(station => {
                station.routes.forEach(route => {
                    delete route.trafficSpeed; // Clear cache
                });
            });
        }
        console.log('[Traffic] 🔄 Cleared traffic cache - fetching fresh data');
    }, 3 * 60 * 1000); // 3 minutes
}

// PWA: Re-request geolocation when app becomes visible (fixes GPS loss after being closed)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        console.log('[PWA] App became visible - refreshing geolocation');
        // Wait a bit for GPS to wake up
        setTimeout(() => {
            refreshGeolocation();
        }, 500);
    }
});

// Also handle page focus (for iOS PWA)
window.addEventListener('focus', () => {
    console.log('[PWA] App focused - refreshing geolocation');
    setTimeout(() => {
        refreshGeolocation();
    }, 500);
});

// Default UI mode: idle (only location and quick actions visible)
if (typeof setUIMode === 'function') {
    setUIMode('idle');
}

// Show Enable Compass button on iOS Safari where permission is often required
try {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS && enableCompassBtn) {
        enableCompassBtn.classList.remove('hidden');
    }
} catch {}

// Initialize weather module (handles its own display updates)
if (window.WeatherModule) {
    WeatherModule.init();
}

// Refresh every minute depending on UI mode
setInterval(() => {
    try {
        if (typeof uiMode !== 'undefined' && uiMode === 'bus') {
            renderBusStations();
        } else {
            if (currentStation) {
                // Keep the Bus-style single-card view alive while in Walk mode drill-down
                if (busDetailActive) {
                    renderBusStationDetail(currentStation);
                } else {
                    renderRoutes(currentStation);
                }
            }
        }
    } catch (e) { console.warn('refresh error', e); }
}, 60000);

// Handle orientation changes (portrait ↔ landscape)
window.addEventListener('orientationchange', () => {
    console.log('[Orientation] Changed - reinitializing layout');
    setTimeout(() => {
        try {
            // Reinitialize viewport polyfill
            installViewportPolyfill();
            // Reinitialize panel drag (will check landscape mode)
            setupPanelDrag();
            // Resize map
            if (map) map.invalidateSize();
        } catch (e) {
            console.error('[Orientation] Error:', e);
        }
    }, 300); // Wait for orientation to settle
});
