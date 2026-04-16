require('dotenv').config();


const express = require('express');
const cors = require('cors');
const path = require('path');
const { chromium } = require('playwright');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/widget', express.static('widget'));

const GOOGLE_KEY = process.env.GOOGLE_API_KEY;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const OR_HEADERS = {
  'Authorization': `Bearer ${OR_KEY}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://yoursite.com',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

// Tolerant JSON extractor — Claude sometimes wraps JSON in markdown fences
function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
  return JSON.parse(m[0]);
}

async function orChat(model, messages, extra = {}) {
  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model, messages, max_tokens: 1000, ...extra },
    { headers: OR_HEADERS }
  );
  return res.data.choices[0].message;
}

// ─── Pipeline Steps ────────────────────────────────────────────────────────

// Step 1: Geocode address → lat/lng
async function geocode(address) {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}&key=${GOOGLE_KEY}`;
  const { data } = await axios.get(url);
  if (!data.results.length) throw new Error('Address not found');
  const { lat, lng } = data.results[0].geometry.location;
  return { lat, lng, formatted: data.results[0].formatted_address };
}

// Step 2: Top-down satellite image (1024×1024, zoom 20)
async function getStaticMap(lat, lng) {
  const params = new URLSearchParams({
    center: `${lat},${lng}`,
    zoom: '20',
    size: '1024x1024',
    maptype: 'satellite',
    key: GOOGLE_KEY,
  });
  const protocol = 'http' + 's' + '://';
  const host = ['maps', 'googleapis', 'com'].join('.');
  const baseUrl = `${protocol}${host}/maps/api/staticmap`;
  const url = `${baseUrl}?${params.toString()}`;
  const { data } = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(data).toString('base64');
}

// Step 3: Render 4 oblique 3D views via headless Chromium + Cesium
async function renderObliques(lat, lng) {
  const headings = [0, 90, 180, 270];
  const browser = await chromium.launch({
    args: ['--disable-dev-shm-usage', '--single-process', '--no-sandbox', '--disable-gpu'],
  });
  const screenshots = {};

  for (const [index, heading] of headings.entries()) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 800, height: 600 });
    const params = new URLSearchParams({
      lat, lng, heading, pitch: -50, range: 130, key: GOOGLE_KEY,
    });
    const htmlPath = path.resolve(__dirname, 'public', 'cesium-viewer.html');
    await page.goto(`file://${htmlPath}?${params}`);
    await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
    screenshots[heading] = (await page.screenshot({ type: 'jpeg', quality: 85 })).toString('base64');
    await page.close();

    if (index < headings.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  await browser.close();
  return screenshots;
}

// Step 4: Claude analyzes top-down satellite for backyard placement
async function analyzePlacement(satelliteB64) {
  const prompt =
    `You are a landscape architect. Top-down satellite image, north is up.
Identify: front side, backyard, obstructions, ideal pool placement.
Respond ONLY in JSON: { front_side, backyard, obstructions,
pool_recommendation, render_prompt, backyard_camera_heading }`;

  const msg = await orChat('anthropic/claude-opus-4', [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${satelliteB64}` } },
    ],
  }]);
  return extractJson(msg.content);
}

// Step 5: Claude picks which oblique view best shows the backyard
async function pickBestView(obliques, analysis) {
  const content = [{
    type: 'text',
    text: `Backyard: ${analysis.backyard}. Front: ${analysis.front_side}.
Pick which heading (0/90/180/270) best shows the BACK of the house.
JSON only: { chosen_heading, reason }`,
  }];

  for (const [h, b64] of Object.entries(obliques)) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } });
    content.push({ type: 'text', text: `heading ${h}°` });
  }

  const msg = await orChat('anthropic/claude-opus-4', [{ role: 'user', content }]);
  return extractJson(msg.content);
}

// Step 6: Nano Banana Pro / Gemini — edit pool into the chosen still
async function editPoolIntoImage(imageB64, analysis) {
  const prompt =
    `Add a realistic inground pool to the BACKYARD (foreground) of the target house.
${analysis.render_prompt}.
Keep everything else pixel-identical. Blue water, stone coping, lounge chairs.`;

  const res = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      model: 'google/gemini-3-pro-image-preview',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageB64}` } },
        ],
      }],
      modalities: ['image', 'text'],
    },
    { headers: OR_HEADERS }
  );

  const msg = res.data.choices[0].message;
  const img =
    msg.images?.[0]?.image_url?.url ||
    msg.content?.find(c => c.type === 'image_url')?.image_url?.url;

  if (!img) throw new Error('No image returned from edit step');
  return img.replace(/^data:image\/\w+;base64,/, '');
}

// Step 7: Veo 3.1 — generate 8-second cinematic drone video
async function generateVideo(editedB64, analysis) {
  const prompt =
    `Cinematic real-estate drone shot. Push in from high angle toward backyard.
Pool stays in frame. Golden-hour lighting, sparkling water, subtle breeze.
House architecture MUST stay faithful to input image. ${analysis.render_prompt}`;

  const startRes = await axios.post(
    'https://openrouter.ai/api/v1/videos',
    {
      model: 'google/veo-3.1',
      prompt,
      input_references: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${editedB64}` } }],
      aspect_ratio: '16:9',
      duration: 8,
      resolution: '720p',
    },
    { headers: OR_HEADERS }
  );

  const id = startRes.data.id;

  // Poll every 5s, up to 10 minutes (120 iterations)
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await axios.get(
      `https://openrouter.ai/api/v1/videos/${id}`,
      { headers: OR_HEADERS }
    );
    if (poll.data.status === 'completed') break;
    if (poll.data.status === 'failed') throw new Error('Video generation failed');
  }

  // Use /content endpoint with auth header — unsigned_url returns 401
  const dl = await axios.get(
    `https://openrouter.ai/api/v1/videos/${id}/content`,
    { headers: OR_HEADERS, responseType: 'arraybuffer' }
  );
  return Buffer.from(dl.data).toString('base64');
}

// ─── Main API Endpoint ─────────────────────────────────────────────────────

app.post('/api/visualize', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });

  try {
    console.log(`[1/7] Geocoding: ${address}`);
    const location = await geocode(address);

    console.log(`[2/7] Fetching satellite map for ${location.formatted}`);
    const satellite = await getStaticMap(location.lat, location.lng);

    console.log(`[3/7] Rendering 4 oblique 3D views`);
    const obliques = await renderObliques(location.lat, location.lng);

    console.log(`[4/7] Claude analyzing backyard placement`);
    const analysis = await analyzePlacement(satellite);

    console.log(`[5/7] Claude picking best view`);
    const viewPick = await pickBestView(obliques, analysis);
    const chosenImg = obliques[viewPick.chosen_heading];

    console.log(`[6/7] Editing pool into image (heading ${viewPick.chosen_heading}°)`);
    const editedImg = await editPoolIntoImage(chosenImg, analysis);

    console.log(`[7/7] Generating cinematic video with Veo 3.1`);
    const videoB64 = await generateVideo(editedImg, analysis);

    res.json({
      success: true,
      address: location.formatted,
      satellite_image: `data:image/jpeg;base64,${satellite}`,
      oblique_image: `data:image/png;base64,${chosenImg}`,
      edited_image: `data:image/png;base64,${editedImg}`,
      video: `data:video/mp4;base64,${videoB64}`,
    });
  } catch (err) {
    console.error('Pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(process.env.PORT || 3001, () => {
  console.log(`Pool Visualizer API running on port ${process.env.PORT || 3001}`);
});