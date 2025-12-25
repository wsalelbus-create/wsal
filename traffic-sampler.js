// Traffic Sampler - Uses Google Maps "leaky" traffic tiles to sample real-time traffic
// Samples pixel colors from traffic tiles and converts to speed multipliers

class TrafficSampler {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d');
        this.tileCache = new Map();
        this.trafficMultiplier = 1.0; // Default: no traffic adjustment
        
        // Google Maps traffic tile URL template
        this.trafficTileUrl = 'https://mt1.google.com/vt/lyrs=h,traffic|seconds_into_week:-1&x={x}&y={y}&z={z}';
    }

    // Convert lat/lon to tile coordinates at zoom level
    latLonToTile(lat, lon, zoom) {
        const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
        const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
        return { x, y, zoom };
    }

    // Convert lat/lon to pixel position within tile
    latLonToPixel(lat, lon, zoom) {
        const scale = Math.pow(2, zoom);
        const worldX = (lon + 180) / 360 * scale;
        const worldY = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * scale;
        
        const tileX = Math.floor(worldX);
        const tileY = Math.floor(worldY);
        
        const pixelX = Math.floor((worldX - tileX) * 256);
        const pixelY = Math.floor((worldY - tileY) * 256);
        
        return { tileX, tileY, pixelX, pixelY };
    }

    // Load traffic tile image
    async loadTile(x, y, zoom) {
        const key = `${zoom}_${x}_${y}`;
        
        // Check cache
        if (this.tileCache.has(key)) {
            return this.tileCache.get(key);
        }

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            const url = this.trafficTileUrl
                .replace('{x}', x)
                .replace('{y}', y)
                .replace('{z}', zoom);
            
            img.onload = () => {
                this.tileCache.set(key, img);
                // Clear old cache entries (keep last 20 tiles)
                if (this.tileCache.size > 20) {
                    const firstKey = this.tileCache.keys().next().value;
                    this.tileCache.delete(firstKey);
                }
                resolve(img);
            };
            
            img.onerror = () => {
                console.warn('Failed to load traffic tile:', url);
                resolve(null);
            };
            
            img.src = url;
        });
    }

    // Sample color at specific lat/lon - samples area to find traffic overlay
    async sampleColorAt(lat, lon, zoom = 15) {
        const { tileX, tileY, pixelX, pixelY } = this.latLonToPixel(lat, lon, zoom);
        
        const tile = await this.loadTile(tileX, tileY, zoom);
        if (!tile) return null;

        // Draw tile to canvas
        this.ctx.clearRect(0, 0, 256, 256);
        this.ctx.drawImage(tile, 0, 0);

        // OPTIMIZED: Sample smaller 15x15 area (was 9x9) for better detection
        const samples = [];
        const radius = 7; // 15x15 grid (reduced from 20x20 for speed)
        
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const px = Math.max(0, Math.min(255, pixelX + dx));
                const py = Math.max(0, Math.min(255, pixelY + dy));
                
                const imageData = this.ctx.getImageData(px, py, 1, 1);
                const [r, g, b, a] = imageData.data;
                
                if (a > 100) {
                    // Look for traffic colors: green, yellow, orange, red
                    const isGreen = g > r + 15 && g > b + 15;
                    const isYellow = r > 180 && g > 150 && b < 120;
                    const isOrange = r > 180 && g > 80 && g < 180 && b < 80;
                    const isRed = r > 150 && g < 100 && b < 100;
                    
                    if (isGreen || isYellow || isOrange || isRed) {
                        samples.push({ r, g, b, a, priority: 10 }); // High priority for traffic colors
                    }
                }
            }
        }

        // If we found traffic-colored pixels, return the first one
        if (samples.length > 0) {
            return samples[0];
        }

        // Fallback: return center pixel
        const imageData = this.ctx.getImageData(pixelX, pixelY, 1, 1);
        const [r, g, b, a] = imageData.data;
        return { r, g, b, a };
    }

    // Analyze color to determine traffic level using EXACT Google Maps colors
    analyzeTrafficColor(color) {
        if (!color || color.a < 100) return 'no-data';

        const { r, g, b } = color;

        // Filter out non-traffic colors first
        // Black: text/labels
        if (r < 20 && g < 20 && b < 20) return 'no-data';
        
        // White/light gray: no traffic overlay
        if (r > 235 && g > 235 && b > 235) return 'no-data';
        
        // Medium gray: roads without traffic
        if (r > 140 && r < 180 && g > 140 && g < 180 && b > 140 && b < 180 && 
            Math.abs(r - g) < 20 && Math.abs(g - b) < 20) {
            return 'no-data';
        }

        // GOOGLE MAPS OFFICIAL TRAFFIC COLORS
        // Based on Google's traffic layer specifications + real samples
        const trafficColors = {
            'green': [
                { r: 99, g: 214, b: 104 },   // #63D668 - Official green
                { r: 76, g: 175, b: 80 },    // #4CAF50 - Material green
                { r: 10, g: 90, b: 61 },     // Dark green (real sample)
                { r: 102, g: 187, b: 106 }   // Light green variant
            ],
            'yellow': [
                { r: 251, g: 192, b: 45 },   // #FBC02D - Official yellow
                { r: 255, g: 235, b: 59 },   // #FFEB3B - Bright yellow
                { r: 197, g: 160, b: 53 },   // Real sample (darker yellow)
                { r: 255, g: 193, b: 7 }     // #FFC107 - Amber
            ],
            'orange': [
                { r: 245, g: 124, b: 0 },    // #F57C00 - Official orange
                { r: 255, g: 152, b: 0 },    // #FF9800 - Material orange
                { r: 255, g: 140, b: 0 },    // #FF8C00 - Dark orange
                { r: 239, g: 108, b: 0 }     // #EF6C00 - Deep orange
            ],
            'red': [
                { r: 244, g: 67, b: 54 },    // #F44336 - Official red
                { r: 211, g: 47, b: 47 },    // #D32F2F - Dark red
                { r: 229, g: 57, b: 53 },    // #E53935 - Bright red
                { r: 198, g: 40, b: 40 },    // #C62828 - Very dark red
                { r: 183, g: 28, b: 28 },    // #B71C1C - Stopped traffic
                { r: 139, g: 0, b: 0 }       // #8B0000 - Dark red (stopped)
            ]
        };

        // Calculate color distance to each reference color
        let closestLevel = 'no-data';
        let minDistance = Infinity;
        const maxDistance = 100; // Maximum distance to consider a match

        for (const [level, colors] of Object.entries(trafficColors)) {
            for (const refColor of colors) {
                // Euclidean distance in RGB space
                const distance = Math.sqrt(
                    Math.pow(r - refColor.r, 2) +
                    Math.pow(g - refColor.g, 2) +
                    Math.pow(b - refColor.b, 2)
                );

                if (distance < minDistance && distance < maxDistance) {
                    minDistance = distance;
                    closestLevel = level;
                }
            }
        }

        return closestLevel;
    }

    // Get actual speed from traffic color (km/h for Algiers urban roads)
    getSpeedFromColor(trafficLevel) {
        switch (trafficLevel) {
            case 'green':
                return 40; // Free flow - 40 km/h
            case 'yellow':
                return 25; // Moderate - 25 km/h
            case 'orange':
                return 15; // Slow - 15 km/h
            case 'red':
                return 8; // Heavy - 8 km/h
            case 'no-data':
                return null; // No traffic data - use fallback
            default:
                return null; // Unknown - use fallback
        }
    }
    
    // Get traffic multiplier from color (how much slower than normal) - LEGACY
    getMultiplierFromColor(trafficLevel) {
        switch (trafficLevel) {
            case 'green':
                return 1.0; // Normal speed
            case 'yellow':
                return 1.3; // 30% slower
            case 'orange':
                return 1.6; // 60% slower
            case 'red':
                return 2.2; // 120% slower (more than double time)
            default:
                return 1.0; // Unknown, assume normal
        }
    }

    // Sample traffic along a route (multiple points) - returns actual speed in km/h
    // Searches nearby area around each point to find traffic overlay
    // For 2-point routes, adds intermediate sampling points along the path
    async sampleRoute(routePoints, zoom = 15) {
        if (!routePoints || routePoints.length === 0) {
            return null; // No data - use fallback
        }

        // If only 2 points, add intermediate points along the path for better sampling
        let samplingPoints = [];
        if (routePoints.length === 2) {
            const start = routePoints[0];
            const end = routePoints[1];
            
            // Sample START point only (most reliable - always on a road)
            samplingPoints = [start];
        } else {
            samplingPoints = routePoints;
        }

        const speeds = [];
        const samples = [];
        
        // Sample ALL points with directional search
        for (let i = 0; i < samplingPoints.length; i++) {
            const point = samplingPoints[i];
            try {
                // Try exact point first
                let color = await this.sampleColorAt(point.lat, point.lon, zoom);
                let level = this.analyzeTrafficColor(color);
                let speed = this.getSpeedFromColor(level);
                
                // If no data at exact point, search along the route direction
                if (speed === null && i < samplingPoints.length - 1) {
                    // Calculate direction to next point
                    const nextPoint = samplingPoints[i + 1];
                    const dlat = nextPoint.lat - point.lat;
                    const dlon = nextPoint.lon - point.lon;
                    const distance = Math.sqrt(dlat * dlat + dlon * dlon);
                    
                    if (distance > 0) {
                        // Normalize direction and search along it
                        const normLat = dlat / distance;
                        const normLon = dlon / distance;
                        
                        // Search at 100m along the route direction (reduced from 4 searches to 1)
                        const searchDistances = [0.001];
                        
                        for (const searchDist of searchDistances) {
                            const nearbyColor = await this.sampleColorAt(
                                point.lat + normLat * searchDist,
                                point.lon + normLon * searchDist,
                                zoom
                            );
                            const nearbyLevel = this.analyzeTrafficColor(nearbyColor);
                            const nearbySpeed = this.getSpeedFromColor(nearbyLevel);
                            
                            if (nearbySpeed !== null) {
                                color = nearbyColor;
                                level = nearbyLevel;
                                speed = nearbySpeed;
                                console.log(`  ↪ Found traffic ${Math.round(searchDist * 111000)}m ahead along route`);
                                break;
                            }
                        }
                    }
                }
                
                // If still no data, try perpendicular search (cross streets)
                if (speed === null && i < samplingPoints.length - 1) {
                    const nextPoint = samplingPoints[i + 1];
                    const dlat = nextPoint.lat - point.lat;
                    const dlon = nextPoint.lon - point.lon;
                    
                    // Perpendicular directions (left and right of route)
                    const perpOffsets = [
                        { dlat: -dlon * 0.0005, dlon: dlat * 0.0005 },  // Left 50m
                        { dlat: dlon * 0.0005, dlon: -dlat * 0.0005 }   // Right 50m
                    ];
                    
                    for (const offset of perpOffsets) {
                        const nearbyColor = await this.sampleColorAt(
                            point.lat + offset.dlat,
                            point.lon + offset.dlon,
                            zoom
                        );
                        const nearbyLevel = this.analyzeTrafficColor(nearbyColor);
                        const nearbySpeed = this.getSpeedFromColor(nearbyLevel);
                        
                        if (nearbySpeed !== null) {
                            color = nearbyColor;
                            level = nearbyLevel;
                            speed = nearbySpeed;
                            console.log(`  ↪ Found traffic on parallel road`);
                            break;
                        }
                    }
                }
                
                samples.push({ point: point.name || `Point ${i}`, level, speed });
                
                if (speed !== null) {
                    speeds.push(speed);
                    console.log(`  ✓ ${point.name || `Point ${i}`}: ${level} (${speed} km/h)`);
                } else {
                    console.log(`  ✗ ${point.name || `Point ${i}`}: ${level} (no data)`);
                }
            } catch (e) {
                console.warn(`  ✗ ${point.name || `Point ${i}`}: sampling failed`, e);
            }
        }

        if (speeds.length === 0) {
            console.log(`  ⚠️ No traffic data found on any point - using fallback`);
            return null; // No valid data - use fallback
        }

        // Return average speed from valid samples
        const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        console.log(`  ✓ Found traffic data on ${speeds.length}/${samplingPoints.length} points`);
        return avgSpeed;
    }

    // Get current traffic speed for a station/route (returns km/h or null for fallback)
    // Now direction-aware: samples traffic in the direction the bus is traveling
    async getTrafficSpeed(station, routeInfo) {
        try {
            const routeNumber = typeof routeInfo === 'string' ? routeInfo : routeInfo.number;
            const destination = routeInfo.dest || null;
            
            console.log(`🔍 getTrafficSpeed called: route ${routeNumber}, dest: ${destination}`);
            console.log(`🔍 window.ROUTE_PATHS exists:`, !!window.ROUTE_PATHS);
            
            // Get route path
            const routePath = window.ROUTE_PATHS && window.ROUTE_PATHS[routeNumber];
            console.log(`🔍 routePath for ${routeNumber}:`, routePath ? `${routePath.length} points` : 'NOT FOUND');
            
            if (!routePath || routePath.length < 2) {
                console.warn(`❌ No route path found for route ${routeNumber}`);
                return null; // No route data - use fallback
            }

            // Determine direction: are we going from START to END, or END to START?
            let pointsToSample = [];
            
            if (destination && routePath.length === 2) {
                // Simple 2-point route: check if destination matches end point
                const startPoint = routePath[0];
                const endPoint = routePath[1];
                
                console.log(`🔍 Checking direction: start="${startPoint.name}", end="${endPoint.name}", dest="${destination}"`);
                
                // If destination name matches end point, go START → END
                // Otherwise go END → START (reverse direction)
                if (endPoint.name.toLowerCase().includes(destination.toLowerCase()) ||
                    destination.toLowerCase().includes(endPoint.name.toLowerCase())) {
                    pointsToSample = [startPoint, endPoint]; // Forward direction
                    console.log(`🚌 Route ${routeNumber} going ${startPoint.name} → ${endPoint.name}`);
                } else {
                    pointsToSample = [endPoint, startPoint]; // Reverse direction
                    console.log(`🚌 Route ${routeNumber} going ${endPoint.name} → ${startPoint.name}`);
                }
            } else {
                // No destination info or complex route: sample all points
                pointsToSample = routePath;
                console.log(`🚌 Route ${routeNumber} sampling all points (no direction info)`);
            }

            console.log(`🔍 About to sample ${pointsToSample.length} points`);

            // Sample traffic along the route in the correct direction
            const speed = await this.sampleRoute(pointsToSample, 15);
            
            console.log(`🔍 sampleRoute returned: ${speed}`);
            
            if (speed !== null) {
                console.log(`🚦 Google traffic for route ${routeNumber}: ${speed.toFixed(1)} km/h`);
            } else {
                console.log(`⚠️ No traffic data for route ${routeNumber} - using fallback`);
            }
            return speed;
            
        } catch (e) {
            console.warn('Traffic sampling error:', e);
            return null; // Error - use fallback
        }
    }
    
    // LEGACY: Get traffic multiplier (kept for compatibility)
    async getTrafficMultiplier(station, routeNumber) {
        try {
            const routePath = window.ROUTE_PATHS && window.ROUTE_PATHS[routeNumber];
            if (!routePath) {
                return 1.0;
            }

            const samples = [];
            const step = Math.max(1, Math.floor(routePath.length / 5));
            
            for (let i = 0; i < routePath.length; i += step) {
                const point = routePath[i];
                try {
                    const color = await this.sampleColorAt(point.lat, point.lon, 15);
                    const level = this.analyzeTrafficColor(color);
                    const multiplier = this.getMultiplierFromColor(level);
                    samples.push(multiplier);
                } catch (e) {
                    console.warn('Traffic sample failed:', e);
                }
            }

            if (samples.length === 0) {
                return 1.0;
            }

            const avgMultiplier = samples.reduce((a, b) => a + b, 0) / samples.length;
            return avgMultiplier;
            
        } catch (e) {
            console.warn('Traffic sampling error:', e);
            return 1.0;
        }
    }
}

// Create global instance
window.TrafficSampler = new TrafficSampler();
