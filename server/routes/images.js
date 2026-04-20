const express = require('express');
const router = express.Router();

const CF_API_TOKEN = process.env.CF_API_TOKEN || '1988052ba6dd3454827190adde07c934';

const PROMPTS = {
  hero:   'happy American family moving into beautiful new home, professional movers helping, sunny day, photorealistic, warm colors',
  movers: 'professional moving company workers carefully carrying furniture, uniformed, friendly smiling, photorealistic',
  couple: 'young happy couple packing boxes in bright apartment, excited about new home, photorealistic, warm lighting',
  truck:  'professional moving truck parked outside suburban home, sunny day, photorealistic, clean modern',
};

const FALLBACKS = {
  hero:   'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=1920&q=80',
  movers: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80',
  couple: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80',
  truck:  'https://images.unsplash.com/photo-1600518464441-9154a4dea21b?w=800&q=80',
};

const imageCache = new Map();

router.get('/clear-cache', (_req, res) => {
  const count = imageCache.size;
  imageCache.clear();
  console.log(`[Image] Cache cleared (${count} entries removed)`);
  res.json({ success: true, message: `Cache cleared — ${count} image(s) removed` });
});

router.get('/generate/:type', async (req, res) => {
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
