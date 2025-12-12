/**
 * Annotations API
 * GET - List annotations with filters
 * POST - Create new annotation
 * PUT - Update annotation
 * DELETE - Delete annotation
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return handleGet(req, res);
  } else if (req.method === 'POST') {
    return handlePost(req, res);
  } else if (req.method === 'PUT') {
    return handlePut(req, res);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

async function handleGet(req, res) {
  try {
    const { image_id, label, annotator } = req.query;

    let query = supabase.from('annotations').select('*');

    if (image_id) {
      query = query.eq('image_id', image_id);
    }
    if (label) {
      query = query.eq('label', label);
    }
    if (annotator) {
      query = query.eq('annotator', annotator);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching annotations:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ annotations: data || [] });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePost(req, res) {
  try {
    const { image_id, geometry, label, note, confidence, annotator } = req.body;

    if (!image_id || !geometry || !label) {
      return res.status(400).json({ error: 'Missing required fields: image_id, geometry, label' });
    }

    const { data, error } = await supabase
      .from('annotations')
      .insert([{
        image_id,
        geometry,
        label,
        note,
        confidence,
        annotator
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating annotation:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ annotation: data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePut(req, res) {
  try {
    const { id, geometry, label, note, confidence } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Missing required field: id' });
    }

    const updates = {};
    if (geometry !== undefined) updates.geometry = geometry;
    if (label !== undefined) updates.label = label;
    if (note !== undefined) updates.note = note;
    if (confidence !== undefined) updates.confidence = confidence;

    const { data, error } = await supabase
      .from('annotations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating annotation:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ annotation: data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleDelete(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing required parameter: id' });
    }

    const { error } = await supabase
      .from('annotations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting annotation:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

