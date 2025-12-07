// Tile Cache Manager using IndexedDB
class TileCache {
    constructor() {
        this.dbName = 'OSMTileCache';
        this.storeName = 'tiles';
        this.db = null;
        this.maxTiles = 500; // Maximum tiles to cache
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => {
                console.error('❌ IndexedDB failed to open');
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ Tile cache initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'url' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    console.log('📦 Tile cache store created');
                }
            };
        });
    }

    async getTile(url) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(url);

            request.onsuccess = () => {
                if (request.result) {
                    console.log('🗺️ Tile from cache:', url);
                    resolve(request.result.blob);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    async saveTile(url, blob) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const tileData = {
                url: url,
                blob: blob,
                timestamp: Date.now()
            };

            const request = store.put(tileData);

            request.onsuccess = () => {
                console.log('✅ Tile cached:', url);
                this.cleanupOldTiles();
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    async cleanupOldTiles() {
        if (!this.db) return;

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const countRequest = store.count();

        countRequest.onsuccess = () => {
            const count = countRequest.result;
            if (count > this.maxTiles) {
                const tilesToRemove = count - this.maxTiles;
                console.log(`🗑️ Removing ${tilesToRemove} old tiles`);

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
    }

    async clearCache() {
        if (!this.db) return;

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.clear();
        console.log('🗑️ Tile cache cleared');
    }
}

// Custom Leaflet Tile Layer with caching
L.TileLayer.Cached = L.TileLayer.extend({
    initialize: function (url, options) {
        L.TileLayer.prototype.initialize.call(this, url, options);
        this.tileCache = new TileCache();
    },

    createTile: function (coords, done) {
        const tile = document.createElement('img');
        const url = this.getTileUrl(coords);

        // Try to load from cache first
        this.tileCache.getTile(url).then(cachedBlob => {
            if (cachedBlob) {
                // Load from cache
                tile.src = URL.createObjectURL(cachedBlob);
                done(null, tile);
            } else {
                // Fetch from network
                fetch(url)
                    .then(response => response.blob())
                    .then(blob => {
                        // Save to cache
                        this.tileCache.saveTile(url, blob);
                        // Display tile
                        tile.src = URL.createObjectURL(blob);
                        done(null, tile);
                    })
                    .catch(error => {
                        console.error('❌ Tile fetch failed:', error);
                        done(error, tile);
                    });
            }
        }).catch(error => {
            console.error('❌ Cache error:', error);
            // Fallback to normal loading
            tile.src = url;
            done(null, tile);
        });

        return tile;
    }
});

// Factory function
L.tileLayer.cached = function (url, options) {
    return new L.TileLayer.Cached(url, options);
};
