# Dura-Europos Spatial Research Interface - Setup Guide

## Prerequisites

- Node.js 18+ and npm
- Supabase account (free tier is sufficient)
- Git

## Step 1: Clone and Install Dependencies

```bash
cd dura_review_interface
npm install
```

## Step 2: Set Up Supabase Database

### 2.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to initialize (~2 minutes)

### 2.2 Enable PostGIS

1. In your Supabase dashboard, go to **Database** → **Extensions**
2. Search for "postgis" and enable it

### 2.3 Run SQL Setup

1. Go to **SQL Editor** in Supabase dashboard
2. Create a new query
3. Copy the entire contents of `sql/01_setup_postgis.sql`
4. Paste and run it

This will create:
- `sites` table with PostGIS geometry support
- `images` table
- `annotations` table
- `vocabulary` table
- Spatial indexes and helper functions

### 2.4 Enable schematic positions storage

Run the additional migration to store per-site schematic positions:

```bash
psql "$DATABASE_URL" -f sql/02_site_image_positions.sql
```

## Step 3: Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
# Get these from Supabase Project Settings → API
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Public env vars (must start with NEXT_PUBLIC_)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Important:** The `SUPABASE_SERVICE_KEY` is needed for the migration script. Find it in:
**Project Settings → API → Project API keys → service_role (secret)**

## Step 4: Prepare Spatial Data (Optional)

If you have GeoJSON files with building footprints:

1. Create a `public/sites.geojson` file with your site geometries
2. The format should be:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "h4",
        "name": "Temple of Artemis",
        "building_type": "temple",
        "period": ["Roman"]
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[...]]
      }
    }
  ]
}
```

See `public/sites.geojson.example` for reference.

**Note:** If you don't have geometries, the migration will still work but the map view will be empty. You can add geometries later.

## Step 5: Run Data Migration

This script will:
- Parse `public/field_url_0801.json`
- Extract unique sites (h4, h2, etc.)
- Insert images into the database
- Match geometries from `sites.geojson` if available

```bash
node scripts/migrate_data.js
```

Expected output:
```
🚀 Starting data migration...
📍 Step 1: Extracting sites from image data...
  Found 150 unique sites
📐 Step 2: Matching geometries from sites.geojson...
  Matched 45 geometries
💾 Step 3: Inserting sites into database...
  ✓ Inserted 150 sites
🖼️  Step 4: Inserting images into database...
  ✓ Inserted total 12,500 images
📝 Step 5: Migrating existing reviews to annotations...
  ✓ Migrated 234 annotations
✅ Migration complete!
```

## Step 6: Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Verification Checklist

After setup, verify:

- [ ] Map loads with OSM tiles
- [ ] Sites appear on the map (if geometries were provided)
- [ ] Clicking a site loads images in the gallery
- [ ] Facet filters work (building type, period, search)
- [ ] Clicking an image shows detail view with zoom/pan
- [ ] Nearby sites appear in context pane
- [ ] Keyboard shortcuts work (arrows, Esc, /)

## Troubleshooting

### "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"

Make sure `.env.local` exists and has the correct keys. Restart the dev server after creating `.env.local`.

### "Error loading sites"

1. Check that SQL setup completed successfully in Supabase
2. Verify environment variables are correct
3. Check Supabase project isn't paused (free tier pauses after inactivity)

### "No sites on map"

This is expected if you haven't provided `sites.geojson`. The gallery and facets will still work, just not the spatial map view.

### Migration fails with "relation does not exist"

Run the SQL setup again in Supabase SQL Editor. Make sure PostGIS extension is enabled.

### Map doesn't load

Check browser console for errors. Make sure MapLibre GL CSS is loading correctly.

## Next Steps

### Add Your Own Geometries

1. Use QGIS or another GIS tool to digitize building footprints
2. Export as GeoJSON (WGS84 / EPSG:4326)
3. Match feature IDs to your site codes (h4, h2, etc.)
4. Place as `public/sites.geojson`
5. Re-run migration: `node scripts/migrate_data.js`

### Add More Images

1. Update `public/field_url_0801.json` with new image data
2. Re-run migration: `node scripts/migrate_data.js`
3. The script uses `upsert`, so existing data won't be duplicated

### Customize Vocabulary

Edit vocabulary values in Supabase:

```sql
INSERT INTO vocabulary (category, value, description) VALUES
  ('feature_type', 'mosaic', 'Floor mosaic'),
  ('material', 'marble', 'Marble stone'),
  ('period', 'Byzantine', 'Byzantine period');
```

### Enable Annotations

The annotation UI is not yet fully implemented in this MVP, but the backend is ready. See the plan for Phase 4 details on integrating annotation drawing tools.

## Production Deployment

### Recommended: Vercel

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Environment Variables for Production

Make sure to set in your hosting platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY` (for API routes)
- `NEXT_PUBLIC_APP_URL` (your production domain)

## Support

For issues:
1. Check Supabase logs in dashboard
2. Check browser console for client-side errors
3. Check Next.js terminal for server-side errors
4. Refer to the plan document for architecture details

