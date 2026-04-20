const express = require('express');
const router = express.Router();

const CF_API_TOKEN = process.env.CF_API_TOKEN || '1988052ba6dd3454827190adde07c934';

const PROMPTS = {
  hero:    'happy American family moving into beautiful new home, professional movers helping, sunny day, photorealistic, warm colors, high quality',
  movers:  'professional moving company workers carefully carrying furniture boxes, uniformed workers, friendly smiling, photorealistic, high quality',
  couple:  'young happy couple packing cardboard boxes in bright apartment, excited smiling, photorealistic, warm lighting',
  truck:   'professional moving truck driving on highway, sunny day, photorealistic, clean modern white truck',
  family:  'happy diverse family standing in front of new house with moving boxes, smiling, photorealistic, suburban neighborhood',
  packing: 'professional movers carefully wrapping furniture for transport, indoor, photorealistic',
  banner:  'aerial view of suburban neighborhood houses, sunny day, photorealistic, wide angle',
  team:    'diverse professional moving company team posing together smiling, uniforms, photorealistic',
};

const FALLBACKS = {
  hero:    'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=1920&q=80',
  movers:  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  couple:  'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80',
  truck:   'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=1200&q=80',
  family:  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80',
  packing: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80',
  banner:  'https://images.unsplash.com/photo-1582407947304-fd86f28f4b68?w=1920&q=80',
  team:    'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80',
};

const imageCache = new Map();

/* Allow cross-origin <img> tags from any origin */
function setCorsHeaders(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cross-Origin-Embedder-Policy', 'unsafe-none');
}

router.get('/clear-cache', (_req, res) => {
  setCorsHeaders(res);
  const count = imageCache.size;
  imageCache.clear();
  console.log(`[Image] Cache cleared (${count} entries removed)`);
  res.json({ success: true, message: `Cache cleared — ${count} image(s) removed` });
});

router.get('/generate/:type', async (req, res) => {
  setCorsHeaders(res);
  const type = req.params.type;
  const prompt = PROMPTS[type];
  if (!prompt) return res.status(400).json({ error: 'Invalid image type' });

  if (imageCache.has(type)) {
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(imageCache.get(type));
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  if (!accountId) {
    console.warn(`[Image] CF_ACCOUNT_ID not set — falling back to Unsplash for "${type}"`);
    return res.redirect(FALLBACKS[type]);
  }

  try {
    console.log(`[Image] Generating "${type}" via Cloudflare AI…`);
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/stabilityai/stable-diffusion-xl-base-1.0`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      }
    );

    if (!cfRes.ok) {
      const text = await cfRes.text();
      throw new Error(`CF API ${cfRes.status}: ${text.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await cfRes.arrayBuffer());
    imageCache.set(type, buffer);
    console.log(`[Image] "${type}" generated and cached (${buffer.length} bytes)`);
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (err) {
    console.error(`[Image] Generation failed for "${type}":`, err.message);
    res.redirect(FALLBACKS[type]);
  }
});

module.exports = router;
