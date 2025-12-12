# Dura-Europos Spatial Research Interface

Next.js app for exploring Dura-Europos site/image data with a map + gallery UI (Supabase/PostGIS backend).

## Run

```bash
npm install
# create/configure .env.local (see SETUP.md)
node scripts/migrate_data.js
npm run dev
```

Open `http://localhost:3000`.

## Docs

- `SETUP.md` (Supabase/PostGIS + env vars)
- `TROUBLESHOOTING.md`
- `sql/` (schema/migrations)
