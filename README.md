# وصل الباص - Wsal El Bus 🚌

**Live bus tracker for ETUSA Algiers** with real-time countdowns and GPS-based arrival predictions.

[![Install PWA](https://img.shields.io/badge/Install-PWA-00d2ff?style=for-the-badge)](https://YOUR-USERNAME.github.io/wsal-el-bus/)

## Features ✨

- 🚍 **Real-time bus arrivals** with countdown timers
- 📍 **GPS location** - finds nearest bus station automatically
- 🗺️ **Interactive map** with walking routes
- ⏱️ **Traffic-aware predictions** based on Algiers traffic patterns
- 🌙 **Works offline** with service worker caching
- 📱 **Installable** - add to home screen like a native app
- 🇩🇿 **Arabic support** with beautiful Cairo font

## Installation 📲

### On Mobile (Android/iOS):

1. Open [https://YOUR-USERNAME.github.io/wsal-el-bus/](https://YOUR-USERNAME.github.io/wsal-el-bus/) in your browser
2. Tap the **"Install"** button when prompted
3. Or use browser menu → "Add to Home Screen"
4. Launch from your home screen!

### On Desktop:

1. Visit the URL in Chrome/Edge
2. Click the install icon in the address bar
3. Or go to Menu → "Install Wsal El Bus"

## Covered Stations 🚏

- Place des Martyrs (مكان الشهداء)
- Place Maurice Audin
- 1er Mai
- Hydra (هيدرا)
- El Mouradia (المرادية)

## How It Works 🔧

The app uses:
- **Official ETUSA schedules** (6:00 AM - 6:30 PM, 20-40 min intervals)
- **Enhanced traffic model** based on Algiers statistics
- **GPS distance calculations** for accurate arrival times
- **Service worker** for offline functionality

## Development 💻

### Local Testing:

```bash
# Serve locally
python -m http.server 8000

# Or use any HTTP server
npx http-server
```

Visit `http://localhost:8000`

### File Structure:

```
wsal-el-bus/
├── index.html              # Main PWA entry point
├── manifest.webmanifest    # PWA manifest
├── service-worker.js       # Offline functionality
├── app.js                  # Main application logic
├── styles.css              # Base styles
├── pwa-mobile.css          # Mobile responsive styles
├── leaflet.js/css          # Map library
└── images/                 # Icons and assets
```

## GitHub Pages Deployment 🚀

1. **Create repository** on GitHub
2. **Push files** to main branch
3. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Source: Deploy from branch
   - Branch: main / (root)
4. **Access your PWA** at: `https://YOUR-USERNAME.github.io/REPO-NAME/`

## Technologies Used 🛠️

- **Vanilla JavaScript** - No frameworks
- **Leaflet.js** - Interactive maps
- **OpenStreetMap** - Map tiles
- **Service Workers** - Offline support
- **Web App Manifest** - PWA functionality
- **Geolocation API** - User location

## Browser Support 🌐

- ✅ Chrome/Edge (Android & Desktop)
- ✅ Safari (iOS & macOS)
- ✅ Firefox (Android & Desktop)
- ✅ Samsung Internet

## License 📄

MIT License - Feel free to use and modify!

## Contributing 🤝

Contributions welcome! Please feel free to submit a Pull Request.

---

Made with ❤️ for Algiers commuters
