import fs from 'node:fs';
import path from 'node:path';
import { Jimp } from 'jimp';
import { config } from '../config.js';

/**
 * AI verification layer (Groq, OpenAI-compatible).
 * Model: qwen/qwen3.6-27b — vision-capable reasoning model.
 * The AI ASSISTS; it never moves money. Every function degrades gracefully to an
 * `available:false` assessment so evidence submission never hard-fails.
 */

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

/**
 * Downscale evidence to a small JPEG before sending to the vision model. Vision token cost
 * scales with resolution; Groq's free tier is 8k tokens/min, so a full-size photo (~5–6k
 * tokens) would rate-limit a two-image comparison. ~700px JPEG keeps calls comfortably under.
 * Falls back to the raw file if decoding fails.
 */
async function toDataUrl(filePath) {
  try {
    const img = await Jimp.read(filePath);
    img.scaleToFit({ w: 720, h: 720 });
    const buf = await img.getBuffer('image/jpeg', { quality: 72 });
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  }
}

function stripThink(text) {
  return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractJson(text) {
  const clean = stripThink(text);
  // Prefer a fenced block, else the first balanced {...}
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : clean;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callLlm(body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.llm.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { res, json };
  } finally {
    clearTimeout(timeout);
  }
}

async function chatVision({ system, prompt, images = [] }) {
  if (!config.llm.apiKey) return { ok: false, reason: 'LLM_API_KEY not configured' };

  const content = [{ type: 'text', text: prompt }];
  for (const img of images) content.push({ type: 'image_url', image_url: { url: img } });
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }];

  // Attempt 1: token-efficient — disable reasoning + force a JSON object (fast, no <think> waste).
  // Attempt 2 (fallback): plain call with a generous budget, then strip <think> and extract JSON.
  const attempts = [
    { model: config.llm.model, messages, temperature: 0.1, max_tokens: 700, reasoning_effort: 'none', response_format: { type: 'json_object' } },
    { model: config.llm.model, messages, temperature: 0.1, max_tokens: 1800 },
  ];

  let lastReason = 'unknown';
  for (let i = 0; i < attempts.length; i++) {
    try {
      const { res, json } = await callLlm(attempts[i]);
      if (!res.ok) {
        lastReason = json?.error?.message || `LLM ${res.status}`;
        // Only fall through to attempt 2 if attempt 1's params were rejected; otherwise stop.
        const paramRejected = /reasoning_effort|response_format|json|unsupported|not supported/i.test(lastReason);
        if (i === 0 && paramRejected) continue;
        return { ok: false, reason: lastReason };
      }
      const raw = json?.choices?.[0]?.message?.content || '';
      const parsed = extractJson(raw);
      if (parsed) return { ok: true, data: parsed };
      lastReason = 'Could not parse model JSON';
      // Parsing failed — a fuller budget on attempt 2 may complete the JSON.
    } catch (err) {
      lastReason = err.name === 'AbortError' ? 'LLM timeout' : err.message;
    }
  }
  return { ok: false, reason: lastReason };
}

const SYSTEM = `You are LinkLock's evidence verification AI for an escrow service protecting social-commerce buyers and sellers.
You inspect photos submitted as proof and return ONLY a strict JSON object — no prose, no markdown.
Be skeptical and concrete. Judge only what the pixels support. When unsure, lower confidence rather than guessing.`;

function clampAssessment(a) {
  const b = Boolean;
  return {
    genuine: b(a.genuine),
    matchesOrder: b(a.matchesOrder),
    reusedOrStockImage: b(a.reusedOrStockImage),
    tampering: b(a.tampering),
    confidence: Math.max(0, Math.min(1, Number(a.confidence) || 0)),
    notes: String(a.notes || '').slice(0, 400),
  };
}

/** Vendor dispatch proof check (LOCKED → SHIPPED gate). */
export async function verifyDispatchProof({ filePath, itemDescription }) {
  const prompt = `A vendor is shipping this order and uploaded the photo(s) below as proof of dispatch.
ORDER ITEM: "${itemDescription}"

Assess and return JSON with EXACTLY these keys:
{
  "genuine": boolean,            // a real, freshly-taken photo (not a screenshot / stock / catalog / reused listing image)
  "matchesOrder": boolean,       // the visible item is consistent with the order item above
  "reusedOrStockImage": boolean, // looks like a downloaded/stock/catalog image or a screenshot
  "tampering": boolean,          // signs of editing, splicing or manipulation
  "confidence": number,          // 0..1 overall confidence in this assessment
  "notes": string                // one short sentence of concrete reasoning
}`;
  const r = await chatVision({ system: SYSTEM, prompt, images: [await toDataUrl(filePath)] });
  if (!r.ok) return { available: false, reason: r.reason };
  const a = clampAssessment(r.data);
  return {
    available: true,
    ...a,
    // Gate passes when it looks like genuine, order-matching proof with reasonable confidence.
    passed: a.genuine && a.matchesOrder && !a.reusedOrStockImage && a.confidence >= 0.5,
  };
}

/** Buyer problem proof check (used when a dispute is opened). */
export async function verifyProblemProof({ filePath, itemDescription, complaint }) {
  const prompt = `A buyer is disputing this order, claiming a problem, and uploaded the photo(s) below as proof.
ORDER ITEM: "${itemDescription}"
BUYER COMPLAINT: "${complaint || 'Item not as described'}"

Assess and return JSON with EXACTLY these keys:
{
  "genuine": boolean,            // freshly captured, not reused/downloaded
  "matchesOrder": boolean,       // the delivered item shown relates to the order item
  "problemVisible": boolean,     // the claimed problem (wrong item / damage / empty / counterfeit) is visibly supported
  "reusedOrStockImage": boolean,
  "tampering": boolean,
  "confidence": number,          // 0..1
  "notes": string                // one short sentence of concrete reasoning
}`;
  const r = await chatVision({ system: SYSTEM, prompt, images: [await toDataUrl(filePath)] });
  if (!r.ok) return { available: false, reason: r.reason };
  const a = clampAssessment(r.data);
  return { available: true, ...a, problemVisible: Boolean(r.data.problemVisible) };
}

/**
 * Combined dispute analysis in ONE call (two images): assess the buyer's problem proof AND
 * compare it against the vendor's dispatch proof. Merging these keeps a dispute to a single
 * two-image request (Groq bills a flat ~2.9k tokens/image; the free tier is 8k tokens/min),
 * so we stay well under the limit and only pay for each image once.
 */
export async function analyzeDispute({ dispatchFilePath, problemFilePath, itemDescription, complaint }) {
  const prompt = `Two photos for the SAME disputed order.
IMAGE 1 = the vendor's proof of what was packed/dispatched.
IMAGE 2 = the buyer's proof of the problem they are claiming.
ORDER ITEM: "${itemDescription}"
BUYER COMPLAINT: "${complaint || 'Item not as described'}"

Return JSON with EXACTLY this shape:
{
  "buyerProof": {
    "genuine": boolean,            // image 2 is freshly captured, not reused/downloaded/screenshot
    "matchesOrder": boolean,       // image 2 relates to the order item
    "problemVisible": boolean,     // the claimed problem is visibly supported in image 2
    "reusedOrStockImage": boolean,
    "tampering": boolean,
    "confidence": number           // 0..1
  },
  "comparison": {
    "dispatchVsDelivered": "MATCH" | "MISMATCH" | "INCONCLUSIVE", // does image 2 plausibly show what was packed in image 1?
    "confidence": number,          // 0..1
    "recommendation": "RELEASE" | "REVERSE" | "SPLIT" | "HUMAN_REVIEW",
    "notes": string                // one or two short sentences of concrete reasoning
  }
}`;
  const r = await chatVision({ system: SYSTEM, prompt, images: [await toDataUrl(dispatchFilePath), await toDataUrl(problemFilePath)] });
  if (!r.ok) return { available: false, reason: r.reason };
  const bp = r.data.buyerProof || {};
  const cmp = r.data.comparison || {};
  const verdict = ['MATCH', 'MISMATCH', 'INCONCLUSIVE'].includes(cmp.dispatchVsDelivered) ? cmp.dispatchVsDelivered : 'INCONCLUSIVE';
  const rec = ['RELEASE', 'REVERSE', 'SPLIT', 'HUMAN_REVIEW'].includes(cmp.recommendation) ? cmp.recommendation : 'HUMAN_REVIEW';
  return {
    available: true,
    buyerProof: {
      available: true,
      genuine: Boolean(bp.genuine),
      matchesOrder: Boolean(bp.matchesOrder),
      problemVisible: Boolean(bp.problemVisible),
      reusedOrStockImage: Boolean(bp.reusedOrStockImage),
      tampering: Boolean(bp.tampering),
      confidence: Math.max(0, Math.min(1, Number(bp.confidence) || 0)),
      notes: String(cmp.notes || bp.notes || '').slice(0, 300),
    },
    comparison: {
      available: true,
      dispatchVsDelivered: verdict,
      confidence: Math.max(0, Math.min(1, Number(cmp.confidence) || 0)),
      recommendation: rec,
      notes: String(cmp.notes || '').slice(0, 500),
    },
  };
}

/** Compare vendor dispatch proof vs buyer problem proof — the strongest dispute signal. */
export async function compareEvidence({ dispatchFilePath, problemFilePath, itemDescription }) {
  const prompt = `Two photos for the SAME order. IMAGE 1 = the vendor's proof of what was packed/dispatched.
IMAGE 2 = the buyer's proof of what they claim arrived.
ORDER ITEM: "${itemDescription}"

Compare them and return JSON with EXACTLY these keys:
{
  "dispatchVsDelivered": "MATCH" | "MISMATCH" | "INCONCLUSIVE",  // does image 2 plausibly show the same item packed in image 1?
  "confidence": number,          // 0..1
  "recommendation": "RELEASE" | "REVERSE" | "SPLIT" | "HUMAN_REVIEW", // suggested outcome (assist only)
  "notes": string                // one or two short sentences of concrete reasoning
}`;
  const r = await chatVision({
    system: SYSTEM,
    prompt,
    images: [await toDataUrl(dispatchFilePath), await toDataUrl(problemFilePath)],
  });
  if (!r.ok) return { available: false, reason: r.reason };
  const d = r.data;
  const verdict = ['MATCH', 'MISMATCH', 'INCONCLUSIVE'].includes(d.dispatchVsDelivered)
    ? d.dispatchVsDelivered
    : 'INCONCLUSIVE';
  const rec = ['RELEASE', 'REVERSE', 'SPLIT', 'HUMAN_REVIEW'].includes(d.recommendation)
    ? d.recommendation
    : 'HUMAN_REVIEW';
  return {
    available: true,
    dispatchVsDelivered: verdict,
    confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)),
    recommendation: rec,
    notes: String(d.notes || '').slice(0, 500),
  };
}
