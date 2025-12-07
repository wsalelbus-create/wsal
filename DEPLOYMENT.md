# GitHub Pages Deployment Guide

## Quick Start 🚀

### 1. Create GitHub Repository

```bash
# Initialize git (if not already done)
cd c:\Users\Owner\.gemini\antigravity\scratch\dz_bus_tracker
git init

# Add all files
git add .

# Commit
git commit -m "Initial PWA version of Wsal El Bus"
```

### 2. Push to GitHub

```bash
# Create repository on GitHub first, then:
git remote add origin https://github.com/YOUR-USERNAME/wsal-el-bus.git
git branch -M main
git push -u origin main
```

### 3. Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** → **Pages**
3. Under "Source":
   - Select **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**
4. Click **Save**

### 4. Access Your PWA

Your app will be live at:
```
https://YOUR-USERNAME.github.io/wsal-el-bus/
```

⏱️ **Note**: It may take 1-2 minutes for the site to go live after enabling Pages.

## Testing Locally 🧪

Before deploying, test locally:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server

# Using PHP
php -S localhost:8000
```

Then visit: `http://localhost:8000`

## PWA Installation Testing 📱

### On Android (Chrome):
1. Open the local/live URL
2. Look for "Install" banner at bottom
3. Or Menu → "Install app"

### On iOS (Safari):
1. Open the URL in Safari
2. Tap Share button
3. Scroll down → "Add to Home Screen"

### On Desktop (Chrome/Edge):
1. Look for install icon in address bar
2. Or Menu → "Install Wsal El Bus"

## Files Required for PWA ✅

Make sure these files are in your repository:

- ✅ `index.html` - Main entry point
- ✅ `manifest.webmanifest` - PWA manifest
- ✅ `service-worker.js` - Offline support
- ✅ `app.js` - Application logic
- ✅ `styles.css` - Base styles
- ✅ `pwa-mobile.css` - Mobile responsive styles
- ✅ `leaflet.js` & `leaflet.css` - Map library
- ✅ `images/` - Icons (16x16, 48x48, 128x128)
- ✅ `.nojekyll` - Prevents Jekyll processing
- ✅ `README.md` - Documentation

## Troubleshooting 🔧

### PWA not installing?
- Check browser console for errors
- Ensure HTTPS (GitHub Pages uses HTTPS automatically)
- Verify manifest.webmanifest is accessible
- Check service worker registration

### Service worker not working?
- Clear browser cache
- Check DevTools → Application → Service Workers
- Ensure all cached files exist

### Map not loading?
- Check browser console
- Verify leaflet.js and leaflet.css are loaded
- Check network tab for tile loading errors

## Updating Your PWA 🔄

```bash
# Make changes to files
git add .
git commit -m "Update: description of changes"
git push

# GitHub Pages will auto-deploy in 1-2 minutes
```

**Important**: Users may need to:
1. Close the PWA completely
2. Reopen it to get updates
3. Or clear app data/cache

## Custom Domain (Optional) 🌐

1. Buy a domain (e.g., wsalelbus.com)
2. In GitHub repo settings → Pages
3. Add custom domain
4. Update DNS records at your registrar

## Analytics (Optional) 📊

Add Google Analytics to `index.html`:

```html
<!-- Before </head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## Support 💬

If you encounter issues:
1. Check browser console (F12)
2. Verify all files are committed
3. Check GitHub Pages deployment status
4. Test in incognito/private mode

---

**Ready to deploy!** 🎉
