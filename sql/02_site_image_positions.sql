-- Per-site image positions stored as panel-pixel coordinates relative to center (x right, y down)
CREATE TABLE IF NOT EXISTS site_image_positions (
  site_id text PRIMARY KEY,
  positions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Helpful index for querying by path if needed later
CREATE INDEX IF NOT EXISTS idx_site_image_positions_gin ON site_image_positions USING gin (positions);


