function shouldShowCone() {
    const hasPermissionApi = !!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function');
    if (hasPermissionApi) {
        // On iOS 13+, show only when explicit permission granted and we have a heading fix
        return orientationPermissionGranted && hasHeadingFix;
    }
    // On other platforms, show after we have any heading fix
    return hasHeadingFix;
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

function renderBusStations(withDelay = false) {
    if (!routesListEl) return;
    routesListEl.innerHTML = '';

    // Anchor position: prefer user location
    let anchorLat = userLat, anchorLon = userLon;
    if (!anchorLat || !anchorLon) {
        const fallback = currentStation || STATIONS[0];
        anchorLat = fallback.lat; anchorLon = fallback.lon;
    }

    const nearby = nearestStations(anchorLat, anchorLon, 5);

    nearby.forEach(({ station, distKm }) => {
        const card = document.createElement('div');
        card.className = 'station-card';

        const badge = stationBadgeFor(station.name);
        const served = station.routes.map(r => r.number).join(', ');
        const distanceText = `${distKm.toFixed(1)} km`;

        // Top header
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

        // Helper to build arrivals HTML for this station
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

        // Build card and optionally show a brief loading state for arrivals
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
    });
}
// Route Paths - GPS waypoints for all routes
// Each route has waypoints representing major stops along the path
const ROUTE_PATHS = {
    '04': [ // Ben Omar route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7650, lon: 3.0600, name: 'Belouizdad' },
        { lat: 36.7700, lon: 3.0750, name: 'Belcourt' },
        { lat: 36.7800, lon: 3.0900, name: 'Ben Omar' }
    ],
    '05': [ // Audin -> Martyrs
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7770, lon: 3.0590, name: 'Rue Larbi Ben M\'hidi' },
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' }
    ],
    '07': [ // Martyrs -> El Harrach
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0700, name: 'Grande Poste' },
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7500, lon: 3.0900, name: 'Hussein Dey' },
        { lat: 36.7400, lon: 3.1100, name: 'El Harrach' }
    ],
    '10': [ // Bouzareah route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7700, lon: 3.0500, name: 'Telemly' },
        { lat: 36.7800, lon: 3.0400, name: 'Bouzareah Lower' },
        { lat: 36.7900, lon: 3.0350, name: 'Bouzareah' }
    ],
    '31': [ // Hydra ↔ Place Audin
        { lat: 36.7692, lon: 3.0549, name: 'Place Audin' },
        { lat: 36.7650, lon: 3.0520, name: 'Didouche Mourad' },
        { lat: 36.7600, lon: 3.0490, name: 'Telemly' },
        { lat: 36.7550, lon: 3.0460, name: 'Ben Aknoun Lower' },
        { lat: 36.7435, lon: 3.0421, name: 'Hydra' }
    ],
    '54': [ // El Mouradia ↔ Place Audin
        { lat: 36.7692, lon: 3.0549, name: 'Place Audin' },
        { lat: 36.7650, lon: 3.0530, name: 'Grande Poste' },
        { lat: 36.7600, lon: 3.0520, name: 'Didouche Mourad' },
        { lat: 36.7550, lon: 3.0515, name: 'Rue Larbi Ben M\'hidi' },
        { lat: 36.7482, lon: 3.0511, name: 'El Mouradia' }
    ],
    '67': [ // Ben Aknoun route
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0600, name: 'Grande Poste' },
        { lat: 36.7692, lon: 3.0549, name: 'Place Audin' },
        { lat: 36.7600, lon: 3.0490, name: 'Telemly' },
        { lat: 36.7500, lon: 3.0450, name: 'Ben Aknoun Lower' },
        { lat: 36.7400, lon: 3.0400, name: 'Ben Aknoun' }
    ],
    '16': [ // Kouba route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7650, lon: 3.0600, name: 'Belouizdad' },
        { lat: 36.7700, lon: 3.0700, name: 'Mohamed Belouizdad' },
        { lat: 36.7400, lon: 3.0800, name: 'Kouba' }
    ],
    '33': [ // Kouba route
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7750, lon: 3.0650, name: 'Rue Hassiba Ben Bouali' },
        { lat: 36.7650, lon: 3.0750, name: 'Belcourt' },
        { lat: 36.7400, lon: 3.0800, name: 'Kouba' }
    ],
    '34': [ // Birkhadem route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7498, lon: 3.0489, name: 'El Mouradia' },
        { lat: 36.7350, lon: 3.0400, name: 'El Madania' },
        { lat: 36.7200, lon: 3.0350, name: 'Birkhadem' }
    ],
    '45': [ // Ben Aknoun route
        { lat: 36.7472, lon: 3.0403, name: 'Hydra' },
        { lat: 36.7498, lon: 3.0489, name: 'El Mouradia' },
        { lat: 36.7550, lon: 3.0350, name: 'El Biar' },
        { lat: 36.7800, lon: 3.0200, name: 'Ben Aknoun' }
    ],
    '48': [ // Ben Aknoun route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7650, lon: 3.0500, name: 'Didouche Mourad' },
        { lat: 36.7700, lon: 3.0400, name: 'El Biar' },
        { lat: 36.7800, lon: 3.0200, name: 'Ben Aknoun' }
    ],
    '54': [ // Audin -> El Mouradia
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7650, lon: 3.0520, name: 'Didouche Mourad' },
        { lat: 36.7498, lon: 3.0489, name: 'El Mouradia' }
    ],
    '58': [ // Chevalley route
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0700, name: 'Grande Poste' },
        { lat: 36.7650, lon: 3.0800, name: 'Belcourt' },
        { lat: 36.7500, lon: 3.0950, name: 'Hussein Dey' },
        { lat: 36.7300, lon: 3.1200, name: 'Chevalley' }
    ],
    '65': [ // El Madania route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7550, lon: 3.0500, name: 'Didouche Mourad' },
        { lat: 36.7450, lon: 3.0450, name: 'El Madania' }
    ],
    '67': [ // Ben Aknoun route
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7650, lon: 3.0400, name: 'El Biar' },
        { lat: 36.7800, lon: 3.0200, name: 'Ben Aknoun' }
    ],
    '88': [ // Bir Mourad Raïs route
        { lat: 36.7472, lon: 3.0403, name: 'Hydra' },
        { lat: 36.7400, lon: 3.0350, name: 'El Biar' },
        { lat: 36.7300, lon: 3.0300, name: 'Bir Mourad Raïs' }
    ],
    '89': [ // Vieux Kouba route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7650, lon: 3.0650, name: 'Belouizdad' },
        { lat: 36.7550, lon: 3.0750, name: 'Belcourt' },
        { lat: 36.7450, lon: 3.0850, name: 'Vieux Kouba' }
    ],
    '90': [ // Birtouta route
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0500, name: 'Port Said' },
        { lat: 36.7600, lon: 3.0300, name: 'Bab El Oued' },
        { lat: 36.7400, lon: 3.0100, name: 'Dely Ibrahim' },
        { lat: 36.7100, lon: 2.9800, name: 'Birtouta' }
    ],
    '91': [ // Chevalley route
        { lat: 36.7700, lon: 3.0553, name: 'Place Audin' },
        { lat: 36.7750, lon: 3.0650, name: 'Rue Hassiba Ben Bouali' },
        { lat: 36.7650, lon: 3.0800, name: 'Belcourt' },
        { lat: 36.7500, lon: 3.0950, name: 'Hussein Dey' },
        { lat: 36.7300, lon: 3.1200, name: 'Chevalley' }
    ],
    '99': [ // Aïn Benian / Airport route
        { lat: 36.7606, lon: 3.0553, name: '1er Mai' },
        { lat: 36.7750, lon: 3.0400, name: 'Telemly' },
        { lat: 36.7900, lon: 3.0200, name: 'Bouzareah' },
        { lat: 36.8100, lon: 3.0000, name: 'Aïn Benian' }
    ],
    '100': [ // Martyrs -> Airport
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0700, name: 'Grande Poste' },
        { lat: 36.7600, lon: 3.0800, name: 'El Harrach' },
        { lat: 36.7200, lon: 3.1100, name: 'Dar El Beida' },
        { lat: 36.6910, lon: 3.2154, name: 'Aéroport' }
    ],
    '101': [ // Birtouta route
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0500, name: 'Port Said' },
        { lat: 36.7600, lon: 3.0300, name: 'Bab El Oued' },
        { lat: 36.7400, lon: 3.0100, name: 'Dely Ibrahim' },
        { lat: 36.7100, lon: 2.9800, name: 'Birtouta' }
    ],
    '113': [ // Gare Routière Caroubier
        { lat: 36.7847, lon: 3.0625, name: 'Place des Martyrs' },
        { lat: 36.7750, lon: 3.0700, name: 'Grande Poste' },
        { lat: 36.7650, lon: 3.0750, name: 'Belcourt' },
        { lat: 36.7550, lon: 3.0800, name: 'Gare Routière Caroubier' }
    ]
};

// --- Global State Variables ---
let map = null;
let mapInitialized = false;
let currentStation = null; // Will be set after STATIONS is defined
let userLat = null;
let userLon = null;
// Layer to hold the OSRM route so we can clear/update it
let routeLayer = null;
let busStationsLayer = null; // LayerGroup for all bus stop markers (bus mode)
let uiMode = 'idle'; // 'idle' | 'walk' | 'bus'
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
// Simple calorie model: ~55 kcal per km (average adult brisk walk)
const KCAL_PER_KM = 55;

// Adaptive dashed styling for walking route (finer at low zoom, longer at high zoom)
function computeWalkDash(zoom) {
    const z = typeof zoom === 'number' ? zoom : 15;
    if (z <= 13) return { dash: '6,6', weight: 2.5 };
    if (z <= 15) return { dash: '10,8', weight: 3 };
    if (z <= 17) return { dash: '14,10', weight: 3.5 };
    return { dash: '18,12', weight: 4 };
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
            { number: '100', dest: 'Aéroport', interval: 40, startTime: '06:00', endTime: '18:30', totalDistance: 18.5 },
            { number: '101', dest: 'Birtouta', interval: 35, startTime: '06:00', endTime: '18:30', totalDistance: 15.0 },
            { number: '99', dest: 'Aéroport', interval: 40, startTime: '06:00', endTime: '18:30', totalDistance: 18.5 },
            { number: '58', dest: 'Chevalley', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 12.0 },
            { number: '67', dest: 'Ben Aknoun', interval: 25, startTime: '06:00', endTime: '18:30', totalDistance: 8.5 },
            { number: '07', dest: 'El Harrach', interval: 25, startTime: '06:00', endTime: '18:30', totalDistance: 10.0 },
            { number: '90', dest: 'Birtouta', interval: 35, startTime: '06:00', endTime: '18:30', totalDistance: 15.0 },
            { number: '113', dest: 'Gare Routière Caroubier', interval: 30, startTime: '06:00', endTime: '18:30', totalDistance: 7.0 }
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

        // Status Check
        if (currentMinutes < startMins) {
            return { ...route, status: 'Not Started', message: `Starts ${route.startTime}` };
        }
        if (currentMinutes > endMins) {
            return { ...route, status: 'Ended', message: 'Service Ended' };
        }

        // RESEARCH-BASED BUS ARRIVAL CALCULATION
        // Based on validated urban transit studies:
        // - Buses operate at 60% of car speed
        // - Dwell time: 5 + 2.75 seconds per passenger
        // - Bidirectional operation

        // 1. Calculate where the bus is in its cycle
        const minutesSinceStart = currentMinutes - startMins;
        const cyclePosition = minutesSinceStart % route.interval;

        // 2. Determine CAR speed based on Algiers traffic patterns
        const currentDay = algiersTime.getDay(); // 0 = Sunday, 6 = Saturday
        const isWeekend = currentDay === 5 || currentDay === 6; // Friday/Saturday
        let carSpeed;

        if (isWeekend) {
            // Weekend: lighter traffic
            carSpeed = 35; // km/h
        } else {
            // Weekday traffic patterns based on Algiers statistics
            if ((currentHour >= 7 && currentHour < 9) || (currentHour >= 16 && currentHour < 19)) {
                // Peak rush hour: Severe congestion
                carSpeed = 12 + (parseInt(route.number) % 3); // 12-14 km/h
            } else if (currentHour >= 12 && currentHour < 14) {
                // Lunch hour: Moderate traffic
                carSpeed = 22; // km/h
            } else if (currentHour >= 9 && currentHour < 12) {
                // Mid-morning: Light-moderate traffic
                carSpeed = 28; // km/h
            } else if (currentHour >= 14 && currentHour < 16) {
                // Afternoon: Moderate traffic
                carSpeed = 25; // km/h
            } else if (currentHour >= 19 && currentHour < 21) {
                // Evening: Clearing up
                carSpeed = 20; // km/h
            } else {
                // Early morning/late night: Light traffic
                carSpeed = 40; // km/h
            }
        }

        // 3. Apply weather delay factor to car speed
        const weatherFactor = (window.WeatherModule && WeatherModule.getDelayFactor)
            ? WeatherModule.getDelayFactor()
            : 1.0;
        carSpeed = carSpeed / weatherFactor;

        // 4. Calculate BUS speed (research: buses at 60% of car speed)
        const busSpeed = carSpeed * 0.6;

        // 5. Get number of stops from route path
        const routePath = ROUTE_PATHS[route.number];
        const numberOfStops = routePath ? routePath.length : 5; // Default 5 if no path

        // 6. Calculate dwell time (research formula: 5 + 2.75 seconds per passenger)
        let avgPassengers;
        if ((currentHour >= 7 && currentHour < 9) || (currentHour >= 16 && currentHour < 19)) {
            // Rush hour: 8-12 passengers per stop
            avgPassengers = 10;
        } else {
            // Normal hours: 3-5 passengers per stop
            avgPassengers = 4;
        }

        // Dwell time per stop in seconds, convert to minutes
        const dwellTimePerStop = (5 + (2.75 * avgPassengers)) / 60; // minutes
        const totalDwellTime = numberOfStops * dwellTimePerStop;

        // 7. Calculate total journey time
        const totalDistance = route.totalDistance || 10; // km
        const movementTime = (totalDistance / busSpeed) * 60; // minutes
        const totalJourneyTime = movementTime + totalDwellTime;

        // 8. Calculate arrival time (bidirectional consideration)
        if (cyclePosition < totalJourneyTime) {
            // Bus is currently on route
            const remainingJourneyTime = totalJourneyTime - cyclePosition;
            return {
                ...route,
                status: 'Active',
                minutes: Math.ceil(remainingJourneyTime)
            };
        } else {
            // Bus completed journey, waiting for next departure
            const waitTime = route.interval - cyclePosition;
            return {
                ...route,
                status: 'Active',
                minutes: Math.ceil(waitTime + totalJourneyTime)
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

    // Render Routes
    renderRoutes(station);

    // Update map
    if (mapInitialized) {
        updateMap();
    }
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

function renderRoutes(station) {
    const arrivals = calculateArrivals(station);
    routesListEl.innerHTML = '';

    arrivals.forEach(arrival => {
        const item = document.createElement('div');
        item.className = 'route-item';

        let timeDisplayHtml = '';
        if (arrival.status === 'Active') {
            timeDisplayHtml = `
                <div class="time-inline">
                    <svg class="live-radar" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <!-- Two arcs (bigger top, smaller bottom) with spacing; rotated ~-50deg via CSS -->
                        <!-- Bigger arc (top) -->
                        <path d="M3 9 C 9 3 15 3 21 9" stroke="var(--live-orange)" stroke-width="3" stroke-linecap="round"/>
                        <!-- Smaller arc (bottom), slightly larger so it doesn't look like a dot -->
                        <path d="M9.5 12 C 12 10.2 12 10.2 14.5 12" stroke="var(--live-orange)" stroke-width="3" stroke-linecap="round"/>
                    </svg>
                    <div class="time-stack">
                        <div class="time-big">${arrival.minutes}</div>
                        <div class="time-unit">min</div>
                    </div>
                </div>
            `;
        } else {
            timeDisplayHtml = `
                <div class="route-status" style="color: var(--accent-color); font-weight: 600; font-size: 0.8rem;">
                    ${arrival.message}
                </div>
            `;
        }

        item.innerHTML = `
            <div class="route-info">
                <div class="route-number">${arrival.number}</div>
                <div class="route-dest">To ${arrival.dest}</div>
            </div>
            <div class="route-time">
                ${timeDisplayHtml}
            </div>
        `;
        routesListEl.appendChild(item);
    });
}

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

    // Initialize Leaflet map
    map = L.map(mapContainer, {
        zoomControl: false,
        attributionControl: false
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
        subdomains: 'abcd'
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
        opacity: 0.95
    });

    // Use clean basemap by default in all modes
    if (walkTileLayer && !map.hasLayer(walkTileLayer)) walkTileLayer.addTo(map);
    if (walkLabelsLayer && !map.hasLayer(walkLabelsLayer)) walkLabelsLayer.addTo(map);

    mapInitialized = true;
    updateMap();

    // Invalidate size to ensure it fills the 60% container correctly
    setTimeout(() => {
        map.invalidateSize();
    }, 200);

    // Initialize heading sensors (permission will be requested on first gesture if needed)
    initHeadingSensors();
}

function updateMap() {
    if (!map) return;

    // Clear existing layers except the persistent user marker
    map.eachLayer(layer => {
        if ((layer instanceof L.Marker || layer instanceof L.Polyline)) {
            if (userMarker && layer === userMarker) return; // keep user marker persistent
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
                    <svg width="140" height="140" viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" style="overflow: visible;">
                        <defs>
                            <!-- Green fog (bold until mid-cone, then fades) -->
                            <linearGradient id="coneGrad" x1="70" y1="70" x2="70" y2="34" gradientUnits="userSpaceOnUse">
                                <stop offset="0%"  stop-color="rgba(53,199,89,0.60)"/>
                                <stop offset="35%" stop-color="rgba(53,199,89,0.50)"/>
                                <stop offset="55%" stop-color="rgba(53,199,89,0.30)"/>
                                <stop offset="80%" stop-color="rgba(53,199,89,0.08)"/>
                                <stop offset="100%" stop-color="rgba(53,199,89,0.00)"/>
                            </linearGradient>
                        </defs>
                        <!-- Shorter, wider, Citymapper-like wedge (no base stroke) -->
                        <path d="M70 70 L46 34 L94 34 Z" fill="url(#coneGrad)" stroke="none"/>
                        <!-- Thinner edge bars, green -->
                        <line x1="70" y1="70" x2="46" y2="34" stroke="rgba(53,199,89,0.60)" stroke-width="1.2" stroke-linecap="round"/>
                        <line x1="70" y1="70" x2="94" y2="34" stroke="rgba(53,199,89,0.60)" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                </div>
                <!-- Soft halo behind the blue location dot -->
                <div class="user-dot-halo" style="position:absolute; left:50%; top:50%; width: 36px; height: 36px; border-radius: 50%; transform: translate(-50%, -50%); background: radial-gradient(circle, rgba(0,102,204,0.35) 0%, rgba(0,102,204,0.18) 45%, rgba(0,102,204,0.00) 75%);"></div>
                <div class="user-dot" style="position:absolute; left:50%; top:50%; width: 18px; height: 18px; background: #0066CC; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.30); transform: translate(-50%, -50%);"></div>
            </div>`;

        if (userMarker) {
            try { userMarker.setLatLng([userLat, userLon]); } catch (e) {}
        } else {
            userMarker = L.marker([userLat, userLon], {
                interactive: false,
                icon: L.divIcon({
                    className: 'custom-marker user-orientation-icon',
                    html: markerHtml,
                    iconSize: [140, 140],
                    iconAnchor: [70, 70]
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
                  <g transform="matrix(1, 0, 0, 1, -9.814698, 0.408939)">
                    <polygon points="26.982 62.466 28.56 63.591 46.823 44.931 44.223 44.931" fill="#000000" opacity="0.20" style="transform-origin: 36.929px 53.75px;"/>
                    <rect x="26.2" y="22" width="2.6" height="42" rx="1.3" fill="#9CA3AF"/>
                    <rect x="19" y="26" width="16" height="2" rx="1" fill="#9CA3AF"/>
                    <rect x="16" y="12" width="22" height="22" fill="${badge.color}" stroke="#ffffff" stroke-width="2" rx="6"/>
                    <text x="27" y="23" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="900" fill="#ffffff" font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial" style="white-space: pre;">${badge.abbr}</text>
                    <rect x="29.623" y="25.656" width="20.21" height="17.019" fill="#000000" opacity="0.20" stroke="none" style="stroke-width: 2; transform-box: fill-box; transform-origin: 50% 50%;" transform="matrix(0.933681, 0.358105, -0.682581, 0.809231, 5.869135, 10.102437)" rx="6"/>
                  </g>
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
            // Show all stations
            const markers = STATIONS.map(s => L.marker([s.lat, s.lon], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: `<svg width="26" height="26" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <rect x="4" y="5" width="16" height="11" rx="2" fill="#00d2ff" stroke="white" stroke-width="1.5"/>
                        <circle cx="8" cy="17" r="1.3" fill="white"/>
                        <circle cx="16" cy="17" r="1.3" fill="white"/>
                    </svg>`,
                    iconSize: [26, 26],
                    iconAnchor: [13, 13]
                }),
                zIndexOffset: 900
            }));
            busStationsLayer = L.layerGroup(markers).addTo(map);
        }

        if (uiMode === 'walk' && station) {
            // Calculate and display distance
            const distance = getDistanceFromLatLonInKm(userLat, userLon, station.lat, station.lon);
            mapDistanceEl.textContent = `📍 ${distance.toFixed(2)} km away`;
        }

        if (uiMode === 'walk' && station) {
            // Fit map to show both markers
            const bounds = L.latLngBounds([[userLat, userLon], [station.lat, station.lon]]);
            map.fitBounds(bounds, { padding: [50, 50] });
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

// Fetch a street route from user -> station using OSRM and draw it on the map
async function renderOsrmRoute(fromLat, fromLon, toLat, toLon) {
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
        const latlngs = [ [fromLat, fromLon], [toLat, toLon] ];
        const s = computeWalkDash(map ? map.getZoom() : 15);
        routeLayer = L.polyline(latlngs, {
            color: '#2D5872', weight: s.weight, opacity: 0.42, dashArray: s.dash, lineCap: 'round'
        }).addTo(map);
        try { map.off('zoomend', applyWalkRouteStyle); } catch {}
        map.on('zoomend', applyWalkRouteStyle);
        if (walkTimeText) walkTimeText.textContent = '—';
        if (calorieTextEl) calorieTextEl.textContent = '— / Kcal';
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
    const s = computeWalkDash(map ? map.getZoom() : 15);
    routeLayer = L.polyline(coords, { color: '#2D5872', weight: s.weight, opacity: 0.42, dashArray: s.dash, lineCap: 'round' }).addTo(map);
    try { map.off('zoomend', applyWalkRouteStyle); } catch {}
    map.on('zoomend', applyWalkRouteStyle);
    try {
        const bounds = routeLayer.getBounds();
        map.fitBounds(bounds, { padding: [50, 50] });
    } catch {}
    if (typeof route.duration === 'number' && walkTimeText) {
        const mins = Math.max(1, Math.ceil(route.duration / 60));
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
    uiMode = mode;

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

    // Basemap policy: always use clean no-labels + labels overlay in ALL modes
    if (map && walkTileLayer) {
        try {
            if (map.hasLayer(baseTileLayer)) map.removeLayer(baseTileLayer);
            if (!map.hasLayer(walkTileLayer)) walkTileLayer.addTo(map);
            if (walkLabelsLayer && !map.hasLayer(walkLabelsLayer)) walkLabelsLayer.addTo(map);
        } catch (e) { /* no-op */ }
    }
    if (routesListEl) {
        if (mode === 'bus') routesListEl.classList.remove('hidden');
        else routesListEl.classList.add('hidden');
    }

    // Quick actions: visible only on home (idle)
    if (quickActionsEl) {
        if (mode === 'idle') quickActionsEl.classList.remove('hidden');
        else quickActionsEl.classList.add('hidden');
    }

    // Panel background: always green in all modes
    const panelEl = document.querySelector('.arrivals-panel');
    if (panelEl) { panelEl.classList.add('panel-green'); }

    // Choose nearest station when switching modes if we have a location
    if (userLat && userLon) {
        const nearest = findNearestStation(userLat, userLon);
        if (nearest) currentStation = nearest;
    }

    // Render based on mode
    if (mode === 'bus') {
        // Initial entry shows brief loading state for arrivals
        renderBusStations(true);
    } else {
        if (currentStation) renderRoutes(currentStation);
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
}
if (actionBusBtn) {
    actionBusBtn.addEventListener('click', () => {
        setUIMode('bus');
    });
}

// Back button returns to home (idle)
if (backBtn) {
    backBtn.addEventListener('click', () => setUIMode('idle'));
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

// Map Expansion Toggle - Click map to expand/collapse
const mapViewContainer = document.querySelector('.map-view-container');
const arrivalsPanel = document.querySelector('.arrivals-panel');

if (mapViewContainer && arrivalsPanel) {
    mapViewContainer.addEventListener('click', (e) => {
        // Don't toggle if clicking on controls
        if (e.target.closest('.glass-header') ||
            e.target.closest('.walking-time-badge') ||
            e.target.closest('.map-controls-stack')) {
            return;
        }

        // Toggle expanded state
        mapViewContainer.classList.toggle('expanded');
        arrivalsPanel.classList.toggle('collapsed');

        // Invalidate map size after transition
        setTimeout(() => {
            if (map) {
                map.invalidateSize();
            }
        }, 300);
    });
}

// Init
initMap(); // Initialize map immediately (background)
initGeolocation();
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
            if (currentStation) renderRoutes(currentStation);
        }
    } catch (e) { console.warn('refresh error', e); }
}, 60000);
