-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create sites table with spatial support
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  geometry GEOMETRY(POLYGON, 4326),
  centroid GEOMETRY(POINT, 4326) GENERATED ALWAYS AS (ST_Centroid(geometry)) STORED,
  building_type TEXT,
  period TEXT[],
  excavation_seasons JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create spatial index on sites
CREATE INDEX IF NOT EXISTS idx_sites_geometry ON sites USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_sites_centroid ON sites USING GIST(centroid);

-- Create images table
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  site_id TEXT REFERENCES sites(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  iiif_manifest_url TEXT,
  filename TEXT,
  description TEXT,
  date_taken DATE,
  photographer TEXT,
  season TEXT,
  keywords TEXT[],
  depict_l1 TEXT,
  depict_l2 TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes on images
CREATE INDEX IF NOT EXISTS idx_images_site_id ON images(site_id);
CREATE INDEX IF NOT EXISTS idx_images_season ON images(season);
CREATE INDEX IF NOT EXISTS idx_images_keywords ON images USING GIN(keywords);

-- Create annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id TEXT REFERENCES images(id) ON DELETE CASCADE,
  geometry JSONB NOT NULL,
  label TEXT,
  note TEXT,
  confidence TEXT CHECK (confidence IN ('low', 'medium', 'high')),
  annotator TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes on annotations
CREATE INDEX IF NOT EXISTS idx_annotations_image_id ON annotations(image_id);
CREATE INDEX IF NOT EXISTS idx_annotations_label ON annotations(label);
CREATE INDEX IF NOT EXISTS idx_annotations_annotator ON annotations(annotator);

-- Create vocabulary table
CREATE TABLE IF NOT EXISTS vocabulary (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category, value)
);

-- Create index on vocabulary
CREATE INDEX IF NOT EXISTS idx_vocabulary_category ON vocabulary(category);

-- Function to get nearby sites using k-NN
CREATE OR REPLACE FUNCTION nearby_sites(target_id TEXT, limit_n INT DEFAULT 5)
RETURNS TABLE(
  id TEXT,
  name TEXT,
  distance_m FLOAT,
  image_count BIGINT
) AS $$
  SELECT 
    s.id,
    s.name,
    ST_Distance(s.geometry::geography, target.geometry::geography) as distance_m,
    (SELECT COUNT(*) FROM images WHERE site_id = s.id) as image_count
  FROM sites s, sites target
  WHERE target.id = target_id AND s.id != target_id
  ORDER BY s.geometry <-> target.geometry
  LIMIT limit_n;
$$ LANGUAGE sql STABLE;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_sites_updated_at BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_images_updated_at BEFORE UPDATE ON images
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some initial vocabulary values
INSERT INTO vocabulary (category, value, description) VALUES
  ('feature_type', 'wall', 'Architectural wall structure'),
  ('feature_type', 'column', 'Architectural column'),
  ('feature_type', 'niche', 'Wall niche or recess'),
  ('feature_type', 'floor', 'Floor surface'),
  ('feature_type', 'doorway', 'Door or entrance'),
  ('feature_type', 'window', 'Window opening'),
  ('feature_type', 'painting', 'Wall painting or fresco'),
  ('material', 'stone', 'Stone construction'),
  ('material', 'brick', 'Brick construction'),
  ('material', 'plaster', 'Plaster surface'),
  ('material', 'wood', 'Wooden element'),
  ('period', 'Hellenistic', 'Hellenistic period'),
  ('period', 'Parthian', 'Parthian period'),
  ('period', 'Roman', 'Roman period'),
  ('building_type', 'temple', 'Religious temple structure'),
  ('building_type', 'house', 'Residential building'),
  ('building_type', 'military', 'Military installation'),
  ('building_type', 'bath', 'Bath complex'),
  ('building_type', 'agora', 'Market or public square')
ON CONFLICT (category, value) DO NOTHING;

