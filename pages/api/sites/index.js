/**
 * GET /api/sites - List all sites with optional filters
 * Query params:
 *   - building_type: filter by building type
 *   - period: filter by period
 *   - with_images: if true, only return sites that have images
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const { building_type, period, with_images } = req.query;

    // Build query
    let query = supabase
      .from('sites')
      .select(`
        *,
        images:images(count)
      `);

    // Apply filters
    if (building_type) {
      query = query.eq('building_type', building_type);
    }

    if (period) {
      query = query.contains('period', [period]);
    }

    // Execute query
    const { data, error } = await query.order('name');

    if (error) {
      console.error('Error fetching sites:', error);
      return res.status(500).json({ error: error.message });
    }

    // Filter out sites without images if requested
    let sites = data || [];
    if (with_images === 'true') {
      sites = sites.filter(site => site.images && site.images[0]?.count > 0);
    }

    // Add image_count to each site and parse geometry
    sites = sites.map(site => ({
      ...site,
      image_count: site.images?.[0]?.count || 0,
      images: undefined, // Remove the nested count object
      geometry: site.geometry ? (typeof site.geometry === 'string' ? JSON.parse(site.geometry) : site.geometry) : null
    }));

    return res.status(200).json({ sites });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

