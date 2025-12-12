/**
 * GET /api/iiif/[imageId]/manifest.json
 * Generates IIIF Presentation 3.0 manifest for Wikimedia Commons images
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

  const { imageId } = req.query;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // Fetch image metadata
    const { data: image, error: imageError } = await supabase
      .from('images')
      .select('*')
      .eq('id', imageId)
      .single();

    if (imageError || !image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Fetch annotations
    const { data: annotations } = await supabase
      .from('annotations')
      .select('*')
      .eq('image_id', imageId);

    // Build IIIF Presentation 3.0 manifest
    const manifest = {
      '@context': 'http://iiif.io/api/presentation/3/context.json',
      id: `${baseUrl}/api/iiif/${imageId}/manifest.json`,
      type: 'Manifest',
      label: {
        en: [image.description || image.filename || `Image ${imageId}`]
      },
      metadata: [
        {
          label: { en: ['Site'] },
          value: { en: [image.site_id] }
        }
      ],
      items: [
        {
          id: `${baseUrl}/api/iiif/${imageId}/canvas`,
          type: 'Canvas',
          label: { en: [image.filename || 'Canvas'] },
          // Wikimedia images don't provide dimensions easily, use default
          height: 2000,
          width: 2000,
          items: [
            {
              id: `${baseUrl}/api/iiif/${imageId}/page`,
              type: 'AnnotationPage',
              items: [
                {
                  id: `${baseUrl}/api/iiif/${imageId}/annotation`,
                  type: 'Annotation',
                  motivation: 'painting',
                  body: {
                    id: image.url,
                    type: 'Image',
                    format: 'image/jpeg',
                    // Wikimedia specific: add /1200px- prefix for reasonable size
                    service: []
                  },
                  target: `${baseUrl}/api/iiif/${imageId}/canvas`
                }
              ]
            }
          ],
          // Add annotations as a separate AnnotationPage
          annotations: annotations && annotations.length > 0 ? [
            {
              id: `${baseUrl}/api/iiif/${imageId}/annotations`,
              type: 'AnnotationPage',
              items: annotations.map((annot, idx) => ({
                id: `${baseUrl}/api/iiif/${imageId}/annotation/${annot.id}`,
                type: 'Annotation',
                motivation: 'commenting',
                body: {
                  type: 'TextualBody',
                  value: `${annot.label}${annot.note ? ': ' + annot.note : ''}`,
                  format: 'text/plain',
                  language: 'en'
                },
                target: {
                  source: `${baseUrl}/api/iiif/${imageId}/canvas`,
                  selector: annot.geometry
                }
              }))
            }
          ] : []
        }
      ]
    };

    // Add optional metadata fields
    if (image.season) {
      manifest.metadata.push({
        label: { en: ['Season'] },
        value: { en: [image.season] }
      });
    }

    if (image.photographer) {
      manifest.metadata.push({
        label: { en: ['Photographer'] },
        value: { en: [image.photographer] }
      });
    }

    if (image.depict_l1) {
      manifest.metadata.push({
        label: { en: ['Category'] },
        value: { en: [image.depict_l1] }
      });
    }

    return res.status(200).json(manifest);
  } catch (error) {
    console.error('Error generating IIIF manifest:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

