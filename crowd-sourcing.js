// Crowd-Sourcing Module for Bus Arrival Predictions
// Waze/Moovit-style validation with trust scoring

class CrowdSourcingModule {
    constructor() {
        this.deviceId = null; // Will be set async
        this.fingerprint = this.generateFingerprint();
        this.userTrust = this.getUserTrust();
        this.reports = this.loadReports();
        this.reportCounts = {}; // Rate limiting
        this.ipAddress = null; // Will be fetched
        this.ready = false;
        
        // Initialize async
        this.init();
    }

    async init() {
        // Get device ID (async because of IndexedDB)
        this.deviceId = await this.getOrCreateDeviceId();
        
        // Also try to backup in Service Worker cache (if available)
        this.backupToServiceWorker();
        
        this.ready = true;
        console.log('[Crowd] ✅ Module ready');
        
        // Fetch IP in background
        this.fetchIPAddress();
    }

    // Backup device ID to Service Worker cache (survives everything except uninstall)
    async backupToServiceWorker() {
        if (!('caches' in window)) return;
        
        try {
            const cache = await caches.open('crowd-identity-v1');
            const response = new Response(JSON.stringify({
                deviceId: this.deviceId,
                fingerprint: this.fingerprint,
                timestamp: Date.now()
            }));
            await cache.put('/crowd-identity', response);
            console.log('[Crowd] 💾 Backed up to Service Worker cache');
        } catch (e) {
            console.warn('[Crowd] Service Worker backup failed:', e);
        }
    }

    // Try to restore from Service Worker cache
    async restoreFromServiceWorker() {
        if (!('caches' in window)) return null;
        
        try {
            const cache = await caches.open('crowd-identity-v1');
            const response = await cache.match('/crowd-identity');
            if (response) {
                const data = await response.json();
                console.log('[Crowd] 🔄 Restored from Service Worker cache');
                return data.deviceId;
            }
        } catch (e) {
            console.warn('[Crowd] Service Worker restore failed:', e);
        }
        return null;
    }

    // ============================================================================
    // DEVICE ID & FINGERPRINTING (Anti-Cheat)
    // ============================================================================

    async getOrCreateDeviceId() {
        // Try multiple storage methods (Service Worker > IndexedDB > localStorage > generate new)
        
        // 1. Try Service Worker cache first (most persistent)
        let id = await this.restoreFromServiceWorker();
        if (id) {
            console.log('[Crowd] 🔑 Device ID from Service Worker:', id.substr(0, 12) + '...');
            // Sync to other storages
            localStorage.setItem('deviceId', id);
            this.saveToIndexedDB('deviceId', id);
            return id;
        }
        
        // 2. Try IndexedDB (survives localStorage clear)
        id = await this.getFromIndexedDB('deviceId');
        if (id) {
            console.log('[Crowd] 🔑 Device ID from IndexedDB:', id.substr(0, 12) + '...');
            // Sync to localStorage for faster access
            localStorage.setItem('deviceId', id);
            return id;
        }
        
        // 3. Try localStorage
        id = localStorage.getItem('deviceId');
        if (id) {
            console.log('[Crowd] 🔑 Device ID from localStorage:', id.substr(0, 12) + '...');
            // Backup to IndexedDB
            this.saveToIndexedDB('deviceId', id);
            return id;
        }
        
        // 4. Generate new ID (first time user)
        id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        console.log('[Crowd] 🆕 Generated new Device ID:', id.substr(0, 12) + '...');
        
        // Save to all storages
        localStorage.setItem('deviceId', id);
        this.saveToIndexedDB('deviceId', id);
        
        return id;
    }

    // IndexedDB operations (more persistent than localStorage)
    async getFromIndexedDB(key) {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open('CrowdSourcingDB', 1);
                
                request.onerror = () => resolve(null);
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('identity')) {
                        db.createObjectStore('identity');
                    }
                };
                
                request.onsuccess = (event) => {
                    try {
                        const db = event.target.result;
                        const transaction = db.transaction(['identity'], 'readonly');
                        const store = transaction.objectStore('identity');
                        const getRequest = store.get(key);
                        
                        getRequest.onsuccess = () => resolve(getRequest.result || null);
                        getRequest.onerror = () => resolve(null);
                    } catch (e) {
                        resolve(null);
                    }
                };
            } catch (e) {
                console.warn('[Crowd] IndexedDB read failed:', e);
                resolve(null);
            }
        });
    }

    async saveToIndexedDB(key, value) {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open('CrowdSourcingDB', 1);
                
                request.onerror = () => resolve(false);
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains('identity')) {
                        db.createObjectStore('identity');
                    }
                };
                
                request.onsuccess = (event) => {
                    try {
                        const db = event.target.result;
                        const transaction = db.transaction(['identity'], 'readwrite');
                        const store = transaction.objectStore('identity');
                        store.put(value, key);
                        
                        transaction.oncomplete = () => {
                            console.log('[Crowd] 💾 Saved to IndexedDB:', key);
                            resolve(true);
                        };
                        transaction.onerror = () => resolve(false);
                    } catch (e) {
                        resolve(false);
                    }
                };
            } catch (e) {
                console.warn('[Crowd] IndexedDB write failed:', e);
                resolve(false);
            }
        });
    }

    // Generate browser fingerprint (multiple signals to detect same user)
    generateFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillText('fingerprint', 2, 2);
            const canvasData = canvas.toDataURL();
            
            const fingerprint = {
                userAgent: navigator.userAgent,
                language: navigator.language,
                platform: navigator.platform,
                screenResolution: `${screen.width}x${screen.height}`,
                colorDepth: screen.colorDepth,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                canvasHash: this.hashCode(canvasData),
                touchSupport: 'ontouchstart' in window,
                hardwareConcurrency: navigator.hardwareConcurrency || 0
            };
            
            // Create hash from all signals
            const fingerprintString = JSON.stringify(fingerprint);
            const hash = this.hashCode(fingerprintString);
            
            console.log('[Crowd] 🔒 Fingerprint generated:', hash);
            return hash;
        } catch (e) {
            console.warn('[Crowd] Fingerprint failed:', e);
            return 'unknown';
        }
    }

    // Simple hash function
    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }

    // Fetch IP address from public API (async, non-blocking)
    async fetchIPAddress() {
        try {
            // Use multiple free IP APIs as fallback
            const apis = [
                'https://api.ipify.org?format=json',
                'https://api.my-ip.io/ip.json',
                'https://ipapi.co/json/'
            ];
            
            for (const api of apis) {
                try {
                    const response = await fetch(api, { timeout: 3000 });
                    const data = await response.json();
                    this.ipAddress = data.ip || data.IP || null;
                    if (this.ipAddress) {
                        console.log('[Crowd] 🌐 IP Address:', this.ipAddress);
                        break;
                    }
                } catch (e) {
                    continue; // Try next API
                }
            }
            
            if (!this.ipAddress) {
                console.warn('[Crowd] Could not fetch IP address');
            }
        } catch (e) {
            console.warn('[Crowd] IP fetch failed:', e);
        }
    }

    getUserTrust() {
        const trust = parseFloat(localStorage.getItem('userTrust') || '1.0');
        return Math.max(0.1, Math.min(2.0, trust)); // Clamp 0.1-2.0
    }

    setUserTrust(trust) {
        this.userTrust = Math.max(0.1, Math.min(2.0, trust));
        localStorage.setItem('userTrust', String(this.userTrust));
    }

    // ============================================================================
    // REPORT VALIDATION (Sanity Checks)
    // ============================================================================

    validateReport(report) {
        const errors = [];

        // 1. Distance check: User must be near the stop (within 100m)
        if (report.userLat && report.userLon && report.stationLat && report.stationLon) {
            const distance = this.getDistance(
                report.userLat, report.userLon,
                report.stationLat, report.stationLon
            );
            if (distance > 0.1) { // 100m = 0.1km
                errors.push('too_far');
                console.warn(`[Crowd] Report rejected: User ${(distance * 1000).toFixed(0)}m from stop`);
            }
        }

        // 2. Time check: Report must be during service hours
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinutes = currentHour * 60 + now.getMinutes();
        
        // Service hours: 06:00 to 05:00 (next day)
        const serviceStart = 6 * 60; // 360 minutes
        const serviceEnd = 5 * 60; // 300 minutes
        
        const isServiceTime = (currentMinutes >= serviceStart) || (currentMinutes <= serviceEnd);
        if (!isServiceTime) {
            errors.push('outside_service_hours');
            console.warn(`[Crowd] Report rejected: Outside service hours (${currentHour}:${now.getMinutes()})`);
        }

        // 3. Rate limiting: Max 1 report per route every 10 minutes
        const rateKey = `${report.routeNumber}_${report.stationId}`;
        const lastReport = this.reportCounts[rateKey];
        if (lastReport && (Date.now() - lastReport) < 10 * 60 * 1000) {
            errors.push('rate_limited');
            console.warn(`[Crowd] Report rejected: Rate limited (${Math.round((Date.now() - lastReport) / 1000)}s ago)`);
        }

        // 4. ANTI-CHEAT: Check for duplicate fingerprints (same device, different deviceId)
        const recentReports = this.reports.filter(r => 
            (Date.now() - r.timestamp) < 30 * 60 * 1000 // Last 30 minutes
        );
        
        const sameFingerprint = recentReports.filter(r => 
            r.fingerprint === report.fingerprint && 
            r.deviceId !== report.deviceId
        );
        
        if (sameFingerprint.length > 0) {
            errors.push('duplicate_fingerprint');
            console.warn(`[Crowd] 🚨 CHEAT DETECTED: Same fingerprint, different deviceId`);
            // Penalize trust heavily
            this.adjustTrust(report.deviceId, -0.5); // -50% trust
        }

        // 5. ANTI-CHEAT: Check for same IP address (if available)
        if (this.ipAddress && report.ipAddress) {
            const sameIP = recentReports.filter(r => 
                r.ipAddress === report.ipAddress && 
                r.deviceId !== report.deviceId &&
                (Date.now() - r.timestamp) < 5 * 60 * 1000 // Last 5 minutes
            );
            
            if (sameIP.length > 2) { // More than 2 reports from same IP in 5 min
                errors.push('suspicious_ip');
                console.warn(`[Crowd] 🚨 SUSPICIOUS: ${sameIP.length + 1} reports from same IP in 5 min`);
                this.adjustTrust(report.deviceId, -0.3); // -30% trust
            }
        }

        // 6. ANTI-CHEAT: Check for rapid-fire reports (bot detection)
        const userReports = recentReports.filter(r => r.deviceId === report.deviceId);
        if (userReports.length > 5) { // More than 5 reports in 30 min
            errors.push('too_many_reports');
            console.warn(`[Crowd] 🚨 BOT DETECTED: ${userReports.length} reports in 30 min`);
            this.adjustTrust(report.deviceId, -0.8); // -80% trust (almost ban)
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    // ============================================================================
    // SUBMIT REPORT
    // ============================================================================

    submitReport(reportData) {
        // Wait for module to be ready
        if (!this.ready || !this.deviceId) {
            console.warn('[Crowd] Module not ready yet, please wait...');
            return {
                success: false,
                errors: ['not_ready'],
                message: 'System initializing, please try again in a moment'
            };
        }

        const report = {
            id: 'rep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            deviceId: this.deviceId,
            fingerprint: this.fingerprint,
            ipAddress: this.ipAddress,
            timestamp: Date.now(),
            trust: this.userTrust,
            confirmed: false,
            ...reportData
        };

        // Validate report
        const validation = this.validateReport(report);
        if (!validation.valid) {
            return {
                success: false,
                errors: validation.errors,
                message: 'Report rejected: ' + validation.errors.join(', ')
            };
        }

        // Store report
        this.reports.push(report);
        this.saveReports();

        // Update rate limiting
        const rateKey = `${report.routeNumber}_${report.stationId}`;
        this.reportCounts[rateKey] = Date.now();

        console.log(`[Crowd] ✅ Report submitted:`, {
            id: report.id,
            type: report.type,
            route: report.routeNumber,
            deviceId: report.deviceId.substr(0, 12) + '...',
            fingerprint: report.fingerprint,
            ip: report.ipAddress || 'pending',
            trust: report.trust.toFixed(2)
        });

        // Check for confirmations (2+ reports within 5 minutes)
        this.checkConfirmations(report);

        return {
            success: true,
            reportId: report.id,
            message: 'Report submitted successfully'
        };
    }

    // ============================================================================
    // CONFIRMATION & CLUSTERING
    // ============================================================================

    checkConfirmations(newReport) {
        const timeWindow = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();

        // Find similar reports (same route, station, type, within 5 min)
        const similar = this.reports.filter(r => 
            r.routeNumber === newReport.routeNumber &&
            r.stationId === newReport.stationId &&
            r.type === newReport.type &&
            Math.abs(r.timestamp - newReport.timestamp) < timeWindow &&
            r.deviceId !== newReport.deviceId && // Different device IDs
            r.fingerprint !== newReport.fingerprint // Different fingerprints (anti-cheat)
        );

        console.log(`[Crowd] Found ${similar.length} similar reports for confirmation`);

        // If 2+ reports (including new one), mark as confirmed
        if (similar.length >= 1) { // 1 similar + new = 2 total
            newReport.confirmed = true;
            similar.forEach(r => r.confirmed = true);
            this.saveReports();

            // Reward trust for all reporters
            this.adjustTrust(newReport.deviceId, 0.05); // +5% trust
            similar.forEach(r => this.adjustTrust(r.deviceId, 0.05));

            console.log(`[Crowd] ✅ Report CONFIRMED (${similar.length + 1} unique users)`);
        } else {
            console.log(`[Crowd] ⏳ Report PENDING (waiting for confirmation from different user)`);
        }
    }

    // ============================================================================
    // TRUST SCORING
    // ============================================================================

    adjustTrust(deviceId, delta) {
        if (deviceId === this.deviceId) {
            const newTrust = this.userTrust + delta;
            this.setUserTrust(newTrust);
            console.log(`[Crowd] Trust adjusted: ${this.userTrust.toFixed(2)} (${delta > 0 ? '+' : ''}${delta.toFixed(2)})`);
        }
    }

    // ============================================================================
    // GET PREDICTIONS (Apply Crowd Data)
    // ============================================================================

    getPredictionAdjustment(routeNumber, stationId) {
        const now = Date.now();
        const timeWindow = 10 * 60 * 1000; // 10 minutes

        // Get recent confirmed reports for this route/station
        const recentReports = this.reports.filter(r =>
            r.routeNumber === routeNumber &&
            r.stationId === stationId &&
            r.confirmed === true &&
            (now - r.timestamp) < timeWindow
        );

        if (recentReports.length === 0) {
            return null; // No crowd data
        }

        // Calculate weighted average based on trust scores and time decay
        let totalWeight = 0;
        let weightedSum = 0;

        recentReports.forEach(r => {
            const ageMinutes = (now - r.timestamp) / 1000 / 60; // minutes ago
            
            // Time decay: reports lose influence over time (linear decay over 10 min)
            const timeDecay = Math.max(0, 1 - ageMinutes / 10);
            
            // Final weight = trust score × time decay
            const weight = r.trust * timeDecay;

            // Calculate adjustment based on report type
            let adjustment = 0;
            
            if (r.type === 'bus_arrived') {
                // Bus just arrived (0 minutes) - STRONGEST signal
                // If system predicted 5 min but bus arrived now, we were 5 min off
                // Adjustment: Make prediction show "arriving now" (0 min)
                adjustment = -ageMinutes; // Negative = bus is closer than predicted
                
            } else if (r.type === 'bus_passed') {
                // Bus passed X minutes ago - POSITION TRACKING
                // If bus passed 3 min ago, it's now 3 min downstream
                // Adjustment: Add time since passing (bus is further away)
                adjustment = ageMinutes; // Positive = bus is further than predicted
                
            } else if (r.type === 'bus_delayed') {
                // Bus is delayed - TRAFFIC/BREAKDOWN
                // Add penalty to push prediction back
                // Penalty decreases over time (delay might clear)
                adjustment = 5 * timeDecay; // Positive = bus is further away
                
            } else if (r.type === 'no_bus') {
                // No bus yet - MINOR DELAY
                // User expected bus but it hasn't arrived
                // Small penalty (less severe than "delayed")
                adjustment = 3 * timeDecay; // Positive = bus is further away
            }

            weightedSum += adjustment * weight;
            totalWeight += weight;
        });

        if (totalWeight === 0) return null;

        const finalAdjustment = weightedSum / totalWeight;

        // Confidence calculation:
        // - 1 report = 33% confidence (might be wrong)
        // - 2 reports = 67% confidence (likely correct)
        // - 3+ reports = 100% confidence (definitely correct)
        const confidence = Math.min(1.0, recentReports.length / 3);

        console.log(`[Crowd] 📊 Route ${routeNumber} at ${stationId}:`);
        console.log(`  - ${recentReports.length} confirmed reports`);
        console.log(`  - Adjustment: ${finalAdjustment > 0 ? '+' : ''}${finalAdjustment.toFixed(1)} min`);
        console.log(`  - Confidence: ${(confidence * 100).toFixed(0)}%`);

        return {
            adjustment: finalAdjustment, // minutes to add/subtract
            confidence: confidence, // 0-1 (how sure we are)
            reportCount: recentReports.length,
            reports: recentReports.map(r => ({
                type: r.type,
                age: Math.round((now - r.timestamp) / 1000 / 60),
                trust: r.trust.toFixed(2)
            }))
        };
    }

    // ============================================================================
    // STORAGE
    // ============================================================================

    loadReports() {
        try {
            const data = localStorage.getItem('crowdReports');
            if (!data) return [];
            const reports = JSON.parse(data);
            
            // Clean old reports (keep last 24 hours)
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            return reports.filter(r => r.timestamp > cutoff);
        } catch (e) {
            console.error('[Crowd] Failed to load reports:', e);
            return [];
        }
    }

    saveReports() {
        try {
            // Keep only last 100 reports
            const recentReports = this.reports.slice(-100);
            localStorage.setItem('crowdReports', JSON.stringify(recentReports));
            this.reports = recentReports;
        } catch (e) {
            console.error('[Crowd] Failed to save reports:', e);
        }
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

    getDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    // ============================================================================
    // STATS (For Debugging)
    // ============================================================================

    getStats() {
        const now = Date.now();
        const last24h = this.reports.filter(r => (now - r.timestamp) < 24 * 60 * 60 * 1000);
        const confirmed = last24h.filter(r => r.confirmed);
        const rejected = this.reports.filter(r => r.errors && r.errors.length > 0);

        return {
            deviceId: this.deviceId ? (this.deviceId.substr(0, 12) + '...') : 'unknown',
            fingerprint: this.fingerprint,
            ipAddress: this.ipAddress || 'fetching...',
            userTrust: this.userTrust.toFixed(2),
            totalReports: this.reports.length,
            last24h: last24h.length,
            confirmed: confirmed.length,
            rejected: rejected.length,
            confirmationRate: last24h.length > 0 ? (confirmed.length / last24h.length * 100).toFixed(1) + '%' : 'N/A'
        };
    }
}

// Create global instance
window.CrowdSourcing = new CrowdSourcingModule();
