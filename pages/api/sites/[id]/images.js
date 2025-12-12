/**
 * GET /api/sites/[id]/images - Get all images for a specific site
 * Query params:
 *   - with_annotations: if true, include annotation counts
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
  const { with_annotations } = req.query;

  try {
    // Build query
    let query = supabase
      .from('images')
      .select(with_annotations === 'true' 
        ? '*, annotations:annotations(count)'
        : '*'
      )
      .eq('site_id', id)
      .order('filename');

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching images:', error);
      return res.status(500).json({ error: error.message });
    }

    // Add annotation_count if requested
    const images = (data || []).map(img => ({
      ...img,
      annotation_count: img.annotations?.[0]?.count || 0,
      annotations: undefined
    }));

    return res.status(200).json({ images });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

