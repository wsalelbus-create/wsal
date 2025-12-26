// GPS Bus Tracker Module
// Tracks user's GPS location while on a bus to provide real-time bus position data

class GPSTrackerModule {
    constructor() {
        this.tracking = false;
        this.routeNumber = null;
        this.positions = [];
        this.startTime = null;
        this.watchId = null;
        this.lastPosition = null;
        this.totalDistance = 0;
        this.currentSpeed = 0;
    }

    // ============================================================================
    // START TRACKING
    // ============================================================================

    startTracking(routeNumber) {
        if (this.tracking) {
            return {
                success: false,
                message: 'Already tracking a route'
            };
        }

        // Check if geolocation is available
        if (!navigator.geolocation) {
            return {
                success: false,
                message: 'GPS not available on this device'
            };
        }

        // Check battery level (if available)
        if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
                if (battery.level < 0.2) {
                    console.warn('[GPS] Low battery detected:', Math.round(battery.level * 100) + '%');
                }
            });
        }

        this.tracking = true;
        this.routeNumber = routeNumber;
        this.positions = [];
        this.startTime = Date.now();
        this.totalDistance = 0;
        this.currentSpeed = 0;

        console.log(`[GPS] 🚌 Started tracking Route ${routeNumber}`);

        // Start watching position
        this.watchId = navigator.geolocation.watchPosition(
            (position) => this.handlePosition(position),
            (error) => this.handleError(error),
            {
                enableHighAccuracy: true,
                timeout: 30000, // 30 seconds
                maximumAge: 0 // No cached positions
            }
        );

        return {
            success: true,
            message: 'GPS tracking started'
        };
    }

    // ============================================================================
    // HANDLE GPS POSITION
    // ============================================================================

    handlePosition(position) {
        if (!this.tracking) return;

        const pos = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            accuracy: position.coords.accuracy,
            speed: position.coords.speed, // m/s (may be null)
            timestamp: Date.now()
        };

        console.log(`[GPS] 📍 Position: ${pos.lat.toFixed(6)}, ${pos.lon.toFixed(6)} (±${Math.round(pos.accuracy)}m)`);

        // Validate position
        const validation = this.validatePosition(pos);
        if (!validation.valid) {
            console.warn(`[GPS] ⚠️ Invalid position: ${validation.reason}`);
            return;
        }

        // Calculate distance and speed if we have a previous position
        if (this.lastPosition) {
            const distance = this.calculateDistance(
                this.lastPosition.lat,
                this.lastPosition.lon,
                pos.lat,
                pos.lon
            );
            
            const timeDiff = (pos.timestamp - this.lastPosition.timestamp) / 1000; // seconds
            
            // Calculate speed (km/h)
            if (timeDiff > 0) {
                this.currentSpeed = (distance / timeDiff) * 3600; // km/h
            }
            
            this.totalDistance += distance;
            
            console.log(`[GPS] 📏 Distance: ${(distance * 1000).toFixed(0)}m, Speed: ${this.currentSpeed.toFixed(1)} km/h`);
        }

        // Store position
        this.positions.push(pos);
        this.lastPosition = pos;

        // Auto-stop if tracking for more than 60 minutes (safety)
        const trackingDuration = (Date.now() - this.startTime) / 1000 / 60; // minutes
        if (trackingDuration > 60) {
            console.warn('[GPS] ⏰ Auto-stopping after 60 minutes');
            this.stopTracking();
        }
    }

    // ============================================================================
    // VALIDATE POSITION
    // ============================================================================

    validatePosition(pos) {
        // 1. Accuracy check (must be within 100m)
        if (pos.accuracy > 100) {
            return {
                valid: false,
                reason: 'low_accuracy'
            };
        }

        // 2. Speed check (if available)
        if (this.lastPosition && this.currentSpeed > 0) {
            // Bus speed must be between 0-60 km/h
            if (this.currentSpeed > 60) {
                return {
                    valid: false,
                    reason: 'speed_too_high'
                };
            }
        }

        // 3. Movement check (must move at least 5m from last position)
        if (this.lastPosition) {
            const distance = this.calculateDistance(
                this.lastPosition.lat,
                this.lastPosition.lon,
                pos.lat,
                pos.lon
            );
            
            const timeDiff = (pos.timestamp - this.lastPosition.timestamp) / 1000; // seconds
            
            // If more than 30 seconds passed, must have moved at least 5m
            if (timeDiff > 30 && distance < 0.005) { // 5 meters = 0.005 km
                return {
                    valid: false,
                    reason: 'not_moving'
                };
            }
        }

        return { valid: true };
    }

    // ============================================================================
    // STOP TRACKING
    // ============================================================================

    stopTracking() {
        if (!this.tracking) {
            return {
                success: false,
                message: 'Not currently tracking'
            };
        }

        console.log(`[GPS] 🛑 Stopping tracking for Route ${this.routeNumber}`);

        // Stop watching position
        if (this.watchId) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        // Calculate route completion
        const completion = this.calculateRouteCompletion();
        
        // Calculate trust bonus
        let trustBonus = 0.05; // Base bonus
        if (completion >= 0.8) {
            trustBonus = 0.15; // Full route bonus
        } else if (completion >= 0.5) {
            trustBonus = 0.10; // Partial route bonus
        }

        // Submit tracking data to crowd-sourcing system
        const result = this.submitTrackingData(completion, trustBonus);

        // Reset state
        this.tracking = false;
        const routeNumber = this.routeNumber;
        this.routeNumber = null;
        this.lastPosition = null;

        console.log(`[GPS] ✅ Tracking stopped. Completion: ${(completion * 100).toFixed(0)}%, Trust bonus: +${trustBonus.toFixed(2)}`);

        return {
            success: true,
            routeNumber: routeNumber,
            completion: completion,
            distance: this.totalDistance,
            duration: (Date.now() - this.startTime) / 1000 / 60, // minutes
            positionsCount: this.positions.length,
            trustBonus: trustBonus,
            helpedUsers: result.helpedUsers || 0
        };
    }

    // ============================================================================
    // CALCULATE ROUTE COMPLETION
    // ============================================================================

    calculateRouteCompletion() {
        if (this.positions.length < 2) return 0;

        // Get route path
        const routePath = window.ROUTE_PATHS ? window.ROUTE_PATHS[this.routeNumber] : null;
        if (!routePath || routePath.length < 2) {
            // Fallback: estimate based on distance traveled
            // Average route is ~3.5 km
            return Math.min(1.0, this.totalDistance / 3.5);
        }

        // Calculate total route distance
        const routeDistance = this.calculateDistance(
            routePath[0].lat,
            routePath[0].lon,
            routePath[routePath.length - 1].lat,
            routePath[routePath.length - 1].lon
        ) * 1.7; // Apply Algiers urban factor

        // Calculate completion percentage
        const completion = Math.min(1.0, this.totalDistance / routeDistance);

        return completion;
    }

    // ============================================================================
    // SUBMIT TRACKING DATA
    // ============================================================================

    submitTrackingData(completion, trustBonus) {
        if (!window.CrowdSourcing) {
            console.warn('[GPS] CrowdSourcing module not available');
            return { helpedUsers: 0 };
        }

        // Apply trust bonus
        window.CrowdSourcing.adjustTrust(window.CrowdSourcing.deviceId, trustBonus);

        // Submit GPS tracking report
        const report = {
            type: 'gps_tracking',
            routeNumber: this.routeNumber,
            completion: completion,
            distance: this.totalDistance,
            duration: (Date.now() - this.startTime) / 1000 / 60, // minutes
            positionsCount: this.positions.length,
            avgSpeed: this.positions.length > 0 ? this.totalDistance / ((Date.now() - this.startTime) / 1000 / 3600) : 0, // km/h
            positions: this.positions.map(p => ({
                lat: p.lat,
                lon: p.lon,
                timestamp: p.timestamp
            }))
        };

        // Store in localStorage for future analysis
        try {
            const existingData = JSON.parse(localStorage.getItem('gpsTrackingData') || '[]');
            existingData.push(report);
            // Keep only last 10 tracking sessions
            const recentData = existingData.slice(-10);
            localStorage.setItem('gpsTrackingData', JSON.stringify(recentData));
        } catch (e) {
            console.error('[GPS] Failed to store tracking data:', e);
        }

        console.log('[GPS] 📊 Tracking data submitted:', report);

        // Estimate helped users (mock for now - would come from backend)
        const helpedUsers = Math.round(completion * 10); // Rough estimate

        return { helpedUsers };
    }

    // ============================================================================
    // GET STATS
    // ============================================================================

    getStats() {
        return {
            tracking: this.tracking,
            routeNumber: this.routeNumber,
            distance: this.totalDistance,
            speed: this.currentSpeed,
            completion: this.calculateRouteCompletion(),
            duration: this.startTime ? (Date.now() - this.startTime) / 1000 / 60 : 0, // minutes
            positionsCount: this.positions.length,
            helpersCount: 1 // Mock - would come from backend
        };
    }

    // ============================================================================
    // HANDLE ERROR
    // ============================================================================

    handleError(error) {
        console.error('[GPS] Error:', error.message);
        
        // Don't stop tracking on temporary errors
        if (error.code === error.TIMEOUT) {
            console.warn('[GPS] Timeout - will retry');
            return;
        }
        
        // Stop tracking on permission denied
        if (error.code === error.PERMISSION_DENIED) {
            console.error('[GPS] Permission denied - stopping tracking');
            this.stopTracking();
        }
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }
}

// Create global instance
window.GPSBusTracker = new GPSTrackerModule();
console.log('[GPS] 📡 GPS Bus Tracker Module Loaded');
