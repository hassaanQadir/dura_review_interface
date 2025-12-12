/**
 * Data Migration Script
 * Parses field_url_0801.json and populates Supabase tables
 * 
 * Usage: node scripts/migrate_data.js
 * 
 * Prerequisites:
 * 1. Run sql/01_setup_postgis.sql in Supabase SQL Editor
 * 2. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local
 * 3. Provide sites.geojson with building footprints (optional)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Load the existing data
const dataPath = path.join(__dirname, '../public/field_url_0801.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Load GeoJSON if available
let sitesGeoJSON = null;
const geoJSONPath = path.join(__dirname, '../public/sites.geojson');
if (fs.existsSync(geoJSONPath)) {
  sitesGeoJSON = JSON.parse(fs.readFileSync(geoJSONPath, 'utf8'));
  console.log('✓ Loaded sites.geojson with', sitesGeoJSON.features?.length || 0, 'features');
} else {
  console.warn('⚠️  sites.geojson not found. Sites will be created without geometries.');
}

async function main() {
  console.log('🚀 Starting data migration...\n');

  // Step 1: Extract unique site IDs and create site records
  console.log('📍 Step 1: Extracting sites from image data...');
  const sitesMap = new Map();
  let uniqueImages = [];

  for (const [siteCode, images] of Object.entries(data)) {
    if (!sitesMap.has(siteCode)) {
      // Extract site name from first image's depict_l2 or fname_scrape
      const firstImage = images[0];
      let siteName = siteCode.toUpperCase();
      
      if (firstImage?.depict_l2) {
        // Try to extract building name from depict_l2
        const match = firstImage.depict_l2.match(/^([^,]+)/);
        if (match) siteName = match[1].trim();
      } else if (firstImage?.fname_scrape) {
        // Try to extract from description
        const match = firstImage.fname_scrape.match(/^([^:]+)/);
        if (match) siteName = match[1].trim();
      }

      // Infer building type from name
      let buildingType = 'unknown';
      const nameLower = siteName.toLowerCase();
      if (nameLower.includes('temple')) buildingType = 'temple';
      else if (nameLower.includes('house') || nameLower.includes('dwelling')) buildingType = 'house';
      else if (nameLower.includes('synagogue') || nameLower.includes('church')) buildingType = 'religious';
      else if (nameLower.includes('bath')) buildingType = 'bath';
      else if (nameLower.includes('wall') || nameLower.includes('gate') || nameLower.includes('tower')) buildingType = 'military';
      else if (nameLower.includes('agora') || nameLower.includes('market')) buildingType = 'agora';

      // Count images per season
      const excavationSeasons = {};
      images.forEach(img => {
        const season = extractSeason(img);
        if (season) {
          excavationSeasons[season] = (excavationSeasons[season] || 0) + 1;
        }
      });

      sitesMap.set(siteCode, {
        id: siteCode,
        name: siteName,
        building_type: buildingType,
        period: inferPeriods(siteName),
        excavation_seasons: excavationSeasons,
        geometry: null, // Will be filled from GeoJSON
        notes: `Automatically extracted from field_url_0801.json. ${images.length} images.`
      });
    }
  }

  console.log(`  Found ${sitesMap.size} unique sites`);

  // Step 2: Add geometries from GeoJSON if available
  if (sitesGeoJSON?.features) {
    console.log('\n📐 Step 2: Matching geometries from sites.geojson...');
    let matchedCount = 0;

    for (const feature of sitesGeoJSON.features) {
      const siteId = feature.properties?.id || feature.properties?.code || feature.properties?.name;
      if (siteId && sitesMap.has(siteId)) {
        const site = sitesMap.get(siteId);
        
        // Convert GeoJSON geometry to WKT for PostGIS
        if (feature.geometry.type === 'Polygon') {
          site.geometry = {
            type: 'Polygon',
            coordinates: feature.geometry.coordinates
          };
          matchedCount++;
        } else if (feature.geometry.type === 'MultiPolygon') {
          site.geometry = {
            type: 'MultiPolygon',
            coordinates: feature.geometry.coordinates
          };
          matchedCount++;
        }

        // Merge additional properties from GeoJSON
        if (feature.properties.name) site.name = feature.properties.name;
        if (feature.properties.building_type) site.building_type = feature.properties.building_type;
        if (feature.properties.period) site.period = Array.isArray(feature.properties.period) 
          ? feature.properties.period 
          : [feature.properties.period];
      }
    }

    console.log(`  Matched ${matchedCount} geometries`);
  } else {
    console.log('\n📐 Step 2: Skipping geometries (no GeoJSON file)\n');
  }

  // Step 3: Insert sites into database
  console.log('\n💾 Step 3: Inserting sites into database...');
  const sitesArray = Array.from(sitesMap.values()).map(site => ({
    id: site.id,
    name: site.name,
    geometry: site.geometry ? JSON.stringify(site.geometry) : null,
    building_type: site.building_type,
    period: site.period,
    excavation_seasons: site.excavation_seasons,
    notes: site.notes
  }));

  const { data: insertedSites, error: sitesError } = await supabase
    .from('sites')
    .upsert(sitesArray, { onConflict: 'id' });

  if (sitesError) {
    console.error('❌ Error inserting sites:', sitesError);
    throw sitesError;
  }
  console.log(`  ✓ Inserted ${sitesArray.length} sites`);

  // Step 4: Insert images into database
  console.log('\n🖼️  Step 4: Inserting images into database...');
  
  // First, deduplicate images by ID (keep the first occurrence)
  const imagesMap = new Map();
  let duplicatesCount = 0;

  for (const [siteCode, siteImages] of Object.entries(data)) {
    for (const img of siteImages) {
      const imageId = img.object_id;
      
      if (!imagesMap.has(imageId)) {
        imagesMap.set(imageId, {
          id: imageId,
          site_id: siteCode,
          url: img.url,
          filename: img.fname_commons || img.fname_scrape,
          description: img.fname_scrape,
          season: extractSeason(img),
          keywords: extractKeywords(img),
          depict_l1: img.depict_l1,
          depict_l2: img.depict_l2
        });
      } else {
        duplicatesCount++;
      }
    }
  }

  uniqueImages = Array.from(imagesMap.values());
  if (duplicatesCount > 0) {
    console.log(`  ⚠️  Found ${duplicatesCount} duplicate image IDs (keeping first occurrence)`);
  }

  // Insert in batches of 100 to avoid timeouts
  const batchSize = 100;
  for (let i = 0; i < uniqueImages.length; i += batchSize) {
    const batch = uniqueImages.slice(i, i + batchSize);
    const { error } = await supabase.from('images').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error('❌ Error inserting image batch:', error);
      throw error;
    }
    console.log(`  Inserted ${Math.min(i + batchSize, uniqueImages.length)} images...`);
  }

  console.log(`  ✓ Inserted total ${uniqueImages.length} unique images`);

  // Step 5: Migrate existing reviews to annotations (if reviews table exists)
  console.log('\n📝 Step 5: Migrating existing reviews to annotations...');
  try {
    const { data: reviews, error: reviewsError } = await supabase
      .from('reviews')
      .select('*');

    if (reviewsError) {
      console.log('  ⚠️  No reviews table or empty, skipping migration');
    } else if (reviews && reviews.length > 0) {
      const annotations = reviews.map(review => ({
        image_id: review.image,
        geometry: { type: 'note', data: review.depicts }, // Simplified for now
        label: review.depicts,
        note: review.comment,
        annotator: 'migrated',
        created_at: review.timestamp
      }));

      const { error: annotError } = await supabase
        .from('annotations')
        .insert(annotations);

      if (annotError) {
        console.error('❌ Error migrating annotations:', annotError);
      } else {
        console.log(`  ✓ Migrated ${annotations.length} annotations`);
      }
    } else {
      console.log('  No reviews to migrate');
    }
  } catch (e) {
    console.log('  ⚠️  Error checking reviews:', e.message);
  }

  // Summary
  console.log('\n✅ Migration complete!\n');
  console.log('Summary:');
  console.log(`  Sites: ${sitesMap.size}`);
  console.log(`  Images: ${uniqueImages.length}`);
  console.log(`  Sites with geometry: ${Array.from(sitesMap.values()).filter(s => s.geometry).length}`);
  console.log('\nNext steps:');
  console.log('  1. Verify data in Supabase dashboard');
  console.log('  2. If geometries are missing, provide sites.geojson and re-run');
  console.log('  3. Start development server: npm run dev');
}

// Helper functions
function extractSeason(image) {
  // Try to extract season from filename or description
  const text = (image.fname_scrape || image.fname_commons || '').toLowerCase();
  const seasonMatch = text.match(/(\d{4})-?(\d{2,4})?/);
  if (seasonMatch) {
    const year1 = seasonMatch[1];
    const year2 = seasonMatch[2] ? (seasonMatch[2].length === 2 ? '19' + seasonMatch[2] : seasonMatch[2]) : null;
    return year2 ? `${year1}-${year2}` : year1;
  }
  return null;
}

function extractKeywords(image) {
  const keywords = new Set();
  const text = (image.fname_scrape || '').toLowerCase();
  
  // Common archaeological keywords
  const keywordPatterns = [
    'wall', 'column', 'temple', 'house', 'painting', 'niche', 
    'altar', 'floor', 'roof', 'door', 'window', 'arch',
    'excavation', 'looking', 'view', 'north', 'south', 'east', 'west'
  ];

  keywordPatterns.forEach(kw => {
    if (text.includes(kw)) keywords.add(kw);
  });

  return Array.from(keywords);
}

function inferPeriods(siteName) {
  const periods = [];
  const nameLower = siteName.toLowerCase();
  
  if (nameLower.includes('hellenistic')) periods.push('Hellenistic');
  if (nameLower.includes('parthian')) periods.push('Parthian');
  if (nameLower.includes('roman')) periods.push('Roman');
  
  // If no period found, default to Roman (most common at Dura)
  if (periods.length === 0) periods.push('Roman');
  
  return periods;
}

// Run migration
main().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});

