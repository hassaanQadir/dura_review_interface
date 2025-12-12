/**
 * GET /api/sites/[id]/image-positions - Get saved image positions for a site
 * PUT /api/sites/[id]/image-positions - Upsert positions JSON for a site
 * Body: { positions: { [imageId]: { x: number, y: number } } }
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing site id' });
  }

  if (!['GET', 'PUT'].includes(req.method)) {
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('site_image_positions')
        .select('positions')
        .eq('site_id', id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching positions:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ positions: data?.positions || {} });
    }

    if (req.method === 'PUT') {
      const { positions } = req.body || {};
      if (!positions || typeof positions !== 'object') {
        return res.status(400).json({ error: 'Invalid positions payload' });
      }

      const { data, error } = await supabase
        .from('site_image_positions')
        .upsert({ site_id: id, positions }, { onConflict: 'site_id' })
        .select('site_id')
        .single();

      if (error) {
        console.error('Error saving positions:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ ok: true, site_id: data.site_id });
    }
  } catch (e) {
    console.error('Unexpected error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


