/**
 * GET /api/sites/[id]/nearby - Get nearby sites using PostGIS spatial query
 * Query params:
 *   - limit: number of nearby sites to return (default: 5)
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

  const { id } = req.query;
  const limit = parseInt(req.query.limit || '5', 10);

  try {
    // Call the nearby_sites function
    const { data, error } = await supabase
      .rpc('nearby_sites', {
        target_id: id,
        limit_n: limit
      });

    if (error) {
      console.error('Error fetching nearby sites:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ nearby_sites: data || [] });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

