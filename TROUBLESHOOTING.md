# Troubleshooting Guide

Common issues and solutions for the Dura-Europos Spatial Research Interface.

## Installation Issues

### npm install fails with permission errors

**Symptom:**
```
npm error code EPERM
npm error syscall open
npm error errno EPERM
```

**Solution:**
```bash
# Fix npm cache ownership
sudo chown -R $(whoami) ~/.npm

# Or use npx with --yes flag
npx --yes next dev
```

### TypeScript errors on first run

**Symptom:**
```
Cannot find module 'maplibre-gl' or its corresponding type declarations
```

**Solution:**
```bash
# Make sure all dependencies installed correctly
npm install

# Check if node_modules exists
ls node_modules/maplibre-gl

# If missing, reinstall
rm -rf node_modules package-lock.json
npm install
```

## Database Issues

### "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"

**Symptom:**
Migration script exits immediately with this error.

**Solution:**
1. Create `.env.local` file in project root
2. Copy template from `.env.local.example`
3. Get keys from Supabase dashboard: **Settings** → **API**
4. Make sure to use `SUPABASE_SERVICE_KEY` (not anon key) for migration

### "relation 'sites' does not exist"

**Symptom:**
```
error: relation "sites" does not exist
```

**Solution:**
1. Go to Supabase dashboard → **SQL Editor**
2. Copy entire contents of `sql/01_setup_postgis.sql`
3. Paste and run
4. Check for errors in output
5. If PostGIS errors, enable extension first:
   - Go to **Database** → **Extensions**
   - Enable "postgis"
   - Re-run SQL setup

### Migration script hangs or times out

**Symptom:**
Script stops at "Inserting images..." and never completes.

**Solution:**
- Large datasets may take time (12k images ≈ 2-3 minutes)
- Check Supabase dashboard for active connections
- Free tier has connection limits
- Split migration into smaller batches if needed
- Check internet connection (uploads to Supabase)

### "geometry is not valid" errors

**Symptom:**
```
ERROR: Invalid geometry
```

**Solution:**
1. Check your `sites.geojson` file format
2. Coordinates must be [longitude, latitude] order
3. Polygons must be closed (first point = last point)
4. Use EPSG:4326 (WGS84) coordinate system
5. Validate GeoJSON: http://geojsonlint.com/

## Application Issues

### Map doesn't load / "Loading map..." forever

**Symptom:**
Map panel shows loading message indefinitely.

**Causes & Solutions:**

1. **MapLibre CSS not loaded**
   ```bash
   # Check browser console for 404 errors
   # Make sure styles/globals.css imports maplibre-gl.css
   ```

2. **No sites in database**
   ```bash
   # Check Supabase dashboard → Table Editor → sites
   # Should have rows after migration
   ```

3. **Browser compatibility**
   - Requires WebGL support
   - Try Chrome/Firefox/Safari (not IE)
   - Check: https://get.webgl.org/

### No sites visible on map

**Symptom:**
Map loads but no colored polygons appear.

**Causes:**
1. Sites don't have geometry data
2. Geometries exist but map not zoomed to correct location
3. Sites filtered out by facets

**Solutions:**
```javascript
// Check in browser console:
// Should log sites with geometry field
console.log(window.__sites)

// Adjust map center in components/MapView.tsx:
center: [40.7272, 34.7469], // Dura-Europos coordinates
zoom: 15,

// If your site is elsewhere, update coordinates
```

### "Error loading sites" on startup

**Symptom:**
Red error message instead of application.

**Checklist:**
- [ ] `.env.local` file exists with correct keys
- [ ] SQL setup completed in Supabase
- [ ] Supabase project is active (not paused)
- [ ] Internet connection working
- [ ] Environment variables start with `NEXT_PUBLIC_` for client-side

**Debug:**
```bash
# Check environment variables
echo $NEXT_PUBLIC_SUPABASE_URL

# Restart dev server after .env changes
npm run dev
```

### Images don't load in gallery

**Symptom:**
Gallery shows boxes but no images, broken image icons.

**Causes:**
1. Wikimedia Commons URLs invalid
2. CORS issues
3. Network blocking image requests
4. Images actually don't exist at those URLs

**Debug:**
- Open browser DevTools → Network tab
- Look for failed image requests
- Check if URLs are accessible in new tab
- Wikimedia Commons may be down or rate-limiting

### Facet filters don't work

**Symptom:**
Checking boxes doesn't filter results.

**Debug:**
```javascript
// Open browser console
// Check Zustand state
window.__store = require('./store/useStore').useStore.getState()
console.log(window.__store.facets)
console.log(window.__store.filteredImageIds)
```

**Common causes:**
- No images have the filtered values
- Site not selected (need to select a site first to load images)
- Search query too restrictive

### Keyboard shortcuts don't work

**Symptom:**
Pressing arrow keys, N, /, etc. has no effect.

**Causes:**
- Focus is in an input field (intended behavior)
- Browser extension capturing shortcuts
- Multiple event listeners conflicting

**Test:**
1. Click on gallery area (not in search box)
2. Press arrow keys
3. Should navigate images
4. Check browser console for errors

## Performance Issues

### Slow map rendering

**Solutions:**
- Reduce number of sites (filter in SQL)
- Simplify geometries (reduce coordinate precision)
- Use map tiles with lower resolution
- Check browser GPU acceleration enabled

### Gallery loading slowly

**Solutions:**
- Images are loading from Wikimedia, network-dependent
- Browser cache should speed up on revisit
- Consider adding a CDN or thumbnail service
- Lazy loading is already implemented

### API routes timing out

**Symptoms:**
```
504 Gateway Timeout
```

**Solutions:**
- Check Supabase connection pool limits
- Optimize queries (already indexed)
- Reduce batch sizes in migration
- Upgrade Supabase plan if needed

## Development Issues

### Hot reload not working

**Solution:**
```bash
# Restart dev server
# Make sure you're editing files in correct directory
# Check Next.js isn't blocking in terminal

# Nuclear option:
rm -rf .next
npm run dev
```

### TypeScript errors but app works

**Symptom:**
IDE shows red squiggles but `npm run dev` works fine.

**Solution:**
```bash
# Restart TypeScript server in VS Code:
# Cmd+Shift+P → "TypeScript: Restart TS Server"

# Or check TypeScript explicitly:
npm run type-check
```

### Changes not reflecting in browser

**Solutions:**
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache
3. Restart dev server
4. Check correct port (http://localhost:3000)
5. Check no other Next.js app running on same port

## Data Issues

### Migration completes but no images in gallery

**Symptom:**
Sites exist, but clicking a site shows "No images found"

**Debug:**
```sql
-- Run in Supabase SQL Editor
SELECT 
  sites.id, 
  sites.name, 
  COUNT(images.id) as image_count
FROM sites
LEFT JOIN images ON images.site_id = sites.id
GROUP BY sites.id, sites.name
ORDER BY image_count DESC;
```

**If counts are 0:**
- Check `public/field_url_0801.json` has correct structure
- Re-run migration with `npm run migrate`
- Check migration console output for errors

### Annotations not showing

**Symptom:**
Created annotations via API but don't appear in UI.

**Debug:**
```sql
-- Check annotations table
SELECT * FROM annotations LIMIT 10;
```

**If empty:**
- Annotation drawing UI not yet built (this is expected)
- Create test annotation via API:
  ```bash
  curl -X POST http://localhost:3000/api/annotations \
    -H "Content-Type: application/json" \
    -d '{
      "image_id": "3838",
      "geometry": {"type": "test"},
      "label": "test annotation",
      "annotator": "test"
    }'
  ```

## Browser-Specific Issues

### Safari: Map tiles flickering

**Solution:**
Known Safari WebGL issue. Try:
- Update to latest Safari
- Use Chrome/Firefox instead
- Disable Safari experimental features

### Firefox: Slow rendering

**Solution:**
- Check hardware acceleration enabled in Firefox settings
- Update graphics drivers
- Try Chrome for development

### Mobile: Layout broken

**Note:** MVP is desktop-focused. Mobile optimization not implemented.
- Use desktop or tablet for now
- Mobile responsive design can be added later

## Still Having Issues?

1. **Check browser console** (F12) for error messages
2. **Check Supabase logs** in dashboard → **Logs**
3. **Check Next.js terminal** for server-side errors
4. **Verify all prerequisites** in SETUP.md
5. **Try the example sites.geojson** if geometry issues
6. **Search GitHub issues** for similar problems
7. **Create a minimal reproduction** to isolate the issue

## Getting Help

When reporting issues, include:
- Error message (full text)
- Browser and version
- Operating system
- Steps to reproduce
- Console logs (browser + terminal)
- Relevant code snippets
- Screenshots if UI issue

---

**Last Updated:** October 2025

