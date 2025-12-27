// Tile Cache Manager using IndexedDB
class TileCache {
    constructor() {
        this.dbName = 'OSMTileCache';
        this.storeName = 'tiles';
        this.db = null;
        this.maxTiles = 500; // Maximum tiles to cache
        this.pendingInit = null;
    }

    async init() {
        // Prevent multiple simultaneous init calls
        if (this.pendingInit) return this.pendingInit;
        if (this.db) return this.db;
        
        this.pendingInit = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => {
                console.error('❌ IndexedDB failed to open');
                this.pendingInit = null;
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.pendingInit = null;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'url' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
        return this.pendingInit;
    }

    async getTile(url) {
        try {
            if (!this.db) await this.init();

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.get(url);

                request.onsuccess = () => {
                    resolve(request.result ? request.result.blob : null);
                };

                request.onerror = () => resolve(null); // Fail silently
            });
        } catch {
            return null;
        }
    }

    async saveTile(url, blob) {
        try {
            if (!this.db) await this.init();

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            store.put({
                url: url,
                blob: blob,
                timestamp: Date.now()
            });

            // Cleanup occasionally (not every save)
            if (Math.random() < 0.05) this.cleanupOldTiles();
        } catch {
            // Fail silently
        }
    }

    async cleanupOldTiles() {
        try {
            if (!this.db) return;

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const countRequest = store.count();

            countRequest.onsuccess = () => {
                const count = countRequest.result;
                if (count > this.maxTiles) {
                    const tilesToRemove = count - this.maxTiles;
                    const index = store.index('timestamp');
                    const cursorRequest = index.openCursor();
                    let removed = 0;

                    cursorRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor && removed < tilesToRemove) {
                            cursor.delete();
                            removed++;
                            cursor.continue();
                        }
                    };
                }
            };
        } catch {
            // Fail silently
        }
    }

    async clearCache() {
        try {
            if (!this.db) return;
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            store.clear();
        } catch {
            // Fail silently
        }
    }
}

// Shared tile cache instance
const sharedTileCache = new TileCache();

// Custom Leaflet Tile Layer with caching
L.TileLayer.Cached = L.TileLayer.extend({
    initialize: function (url, options) {
        L.TileLayer.prototype.initialize.call(this, url, options);
        this.tileCache = sharedTileCache;
        this._objectUrls = new Map(); // Track object URLs for cleanup
    },

    createTile: function (coords, done) {
        const tile = document.createElement('img');
        const url = this.getTileUrl(coords);

        // Try to load from cache first
        this.tileCache.getTile(url).then(cachedBlob => {
            if (cachedBlob) {
                // Load from cache
                const objectUrl = URL.createObjectURL(cachedBlob);
                this._objectUrls.set(tile, objectUrl);
                tile.onload = () => done(null, tile);
                tile.onerror = () => done(new Error('Tile load error'), tile);
                tile.src = objectUrl;
            } else {
                // Fetch from network - use standard img loading for better performance
                tile.crossOrigin = 'anonymous';
                tile.onload = () => {
                    // Save to cache in background (don't block)
                    fetch(url)
                        .then(r => r.blob())
                        .then(blob => this.tileCache.saveTile(url, blob))
                        .catch(() => {});
                    done(null, tile);
                };
                tile.onerror = () => done(new Error('Tile load error'), tile);
                tile.src = url;
            }
        }).catch(() => {
            // Fallback to normal loading
            tile.crossOrigin = 'anonymous';
            tile.onload = () => done(null, tile);
            tile.onerror = () => done(new Error('Tile load error'), tile);
            tile.src = url;
        });

        return tile;
    },
    
    _removeTile: function(key) {
        const tile = this._tiles[key];
        if (tile && tile.el) {
            // Clean up object URL to prevent memory leak
            const objectUrl = this._objectUrls.get(tile.el);
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                this._objectUrls.delete(tile.el);
            }
        }
        L.TileLayer.prototype._removeTile.call(this, key);
    }
});

// Factory function
L.tileLayer.cached = function (url, options) {
    return new L.TileLayer.Cached(url, options);
};
