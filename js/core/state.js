/**
 * Global State Management
 * 
 * Centralizes all global state variables for the application.
 * All modules access shared state through window.AppState.
 */

window.AppState = {
    // Map state
    map: null,
    mapInitialized: false,
    
    // Map layers
    routeLayer: null,
    busStationsLayer: null,
    distanceCirclesLayer: null,
    baseTileLayer: null,
    walkTileLayer: null,
    walkLabelsLayer: null,
    
    // Station state
    currentStation: null, // Will be set after STATIONS is loaded
    STATIONS: [], // Will be populated from app.js
    
    // User location state
    userLat: null,
    userLon: null,
    userMarker: null,
    
    // User heading/compass state
    currentHeading: null,
    smoothedHeading: null,
    geoWatchId: null,
    deviceOrientationActive: false,
    orientationPermissionGranted: false,
    hasHeadingFix: false,
    isGPSRecentering: false,
    
    // UI mode state
    uiMode: 'idle', // 'idle' | 'walk' | 'bus'
    previousMode: 'idle',
    busDetailActive: false,
    
    // OSRM routing state
    osrmSeq: 0,
    
    // DOM element references
    stationSelectorTrigger: null,
    floatingControlsEl: null,
    stationNameEl: null,
    walkTimeText: null,
    routesListEl: null,
    mapDistanceEl: null,
    routesHeaderEl: null,
    quickActionsEl: null,
    actionBusBtn: null,
    actionWalkBtn: null,
    walkingBadgeEl: null,
    calorieBadgeEl: null,
    calorieTextEl: null,
    settingsBtn: null,
    backBtn: null,
    arabicTitleEl: null,
    locateBtn: null,
    enableCompassBtn: null,
    timeDisplay: null,
    stationModal: null,
    closeModalBtn: null,
    arrivalsPanel: null,
    
    // Constants
    HEADING_SMOOTH: 0.25,
    KCAL_PER_KM: 55,
    PANEL_MIN_VH: 40,
    PANEL_MAX_VH: 85,
    
    // Testing flags
    USE_FAKE_LOCATION: false,
    FAKE_LOCATION: {
        lat: 36.7720000,
        lon: 3.0560000
    }
};

console.log('[State] Global state initialized');
