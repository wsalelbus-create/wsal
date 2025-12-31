/**
 * Initialization Orchestration
 * 
 * Coordinates the initialization of all modules in the correct order.
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Init] Starting app initialization...');
    
    // Cache DOM element references in AppState
    AppState.stationSelectorTrigger = document.getElementById('station-selector-trigger');
    AppState.floatingControlsEl = document.getElementById('floating-controls');
    AppState.stationNameEl = document.getElementById('station-name');
    AppState.walkTimeText = document.getElementById('walk-time-text');
    AppState.routesListEl = document.getElementById('routes-list');
    AppState.mapDistanceEl = document.getElementById('map-distance');
    AppState.routesHeaderEl = document.querySelector('.routes-header');
    AppState.quickActionsEl = document.getElementById('quick-actions');
    AppState.actionBusBtn = document.getElementById('action-bus');
    AppState.actionWalkBtn = document.getElementById('action-walk');
    AppState.walkingBadgeEl = document.getElementById('walking-time');
    AppState.calorieBadgeEl = document.getElementById('calorie-badge');
    AppState.calorieTextEl = document.getElementById('calorie-text');
    AppState.settingsBtn = document.getElementById('settings-btn');
    AppState.backBtn = document.getElementById('back-btn');
    AppState.arabicTitleEl = document.querySelector('.arabic-title');
    AppState.locateBtn = document.getElementById('locate-btn');
    AppState.enableCompassBtn = document.getElementById('enable-compass-btn');
    AppState.timeDisplay = document.getElementById('algiers-time');
    AppState.stationModal = document.getElementById('station-modal');
    AppState.closeModalBtn = document.getElementById('close-modal');
    AppState.arrivalsPanel = document.querySelector('.arrivals-panel');
    
    console.log('[Init] DOM references cached in AppState');
    console.log('[Init] ✅ App initialization complete');
});

