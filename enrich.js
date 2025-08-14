import fs from 'fs';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

const DEFAULT_REGION = process.env.DEFAULT_REGION || 'DZ';
const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || '20000', 10);
const N8N_WEBHOOK_RESULTS = process.env.USE_TEST_WEBHOOK === 'true' ? process.env.N8N_WEBHOOK_TEST : process.env.N8N_WEBHOOK_RESULTS;

function timeoutFetch(url, opts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function normPhones(cands) {
  const out = new Set();
  for (const raw of cands) {
    if (!raw) continue;
    const cleaned = String(raw).replace(/[\s().-]/g, '');
    let p = parsePhoneNumberFromString(cleaned, DEFAULT_REGION) || (cleaned.startsWith('+') ? parsePhoneNumberFromString(cleaned) : null);
    if (p && p.isValid()) out.add(p.number);
  }
  return [...out];
}

function extractEmails(text) {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(m.map(s => s.toLowerCase()))];
}

async function fetchHtml(url) {
  try {
    const res = await timeoutFetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    return await res.text();
  } catch { return null; }
}

async function fromFacebookAbout(pageUrl) {
  const u = new URL(pageUrl);
  u.host = 'm.facebook.com';
  u.pathname = `/${u.pathname.split('/').filter(Boolean)[0]}/about`;
  const html = await fetchHtml(u.toString());
  if (!html) return { phones: [], emails: [], website: null, whatsapp: null };
  const $ = cheerio.load(html);
  const text = $('body').text();
  const links = $('a[href]').map((_, a) => $(a).attr('href')).get();
  const telLinks = links.filter(h => h && h.startsWith('tel:')).map(h => h.replace('tel:', ''));
  const wa = links.find(h => h && /wa\.me\//.test(h)) || null;
  const site = links.find(h => h && /^https?:\/\//.test(h) && !h.includes('facebook.com')) || null;
  const phones = normPhones([...(text.match(/(\+?\d[\d\s().-]{7,16}\d)/g) || []), ...telLinks]);
  const emails = extractEmails(text);
  return { phones, emails, website: site, whatsapp: wa };
}

async function fromWebsite(url) {
  const html = await fetchHtml(url);
  if (!html) return { phones: [], emails: [], whatsapp: null };
  const $ = cheerio.load(html);
  const text = $('body').text();
  const links = $('a[href]').map((_, a) => $(a).attr('href')).get();
  const telLinks = links.filter(h => h && h.startsWith('tel:')).map(h => h.replace('tel:', ''));
  const wa = links.find(h => h && /wa\.me\//.test(h)) || null;
  const phones = normPhones([...(text.match(/(\+?\d[\d\s().-]{7,16}\d)/g) || []), ...telLinks]);
  const emails = extractEmails(text);
  return { phones, emails, whatsapp: wa };
}

async function main() {
  const input = JSON.parse(fs.readFileSync('pages.json', 'utf8'));
  const out = [];
  for (const pageUrl of input.pages) {
    try {
      const fb = await fromFacebookAbout(pageUrl);
      let w = { phones: [], emails: [], whatsapp: null };
      if (fb.website) w = await fromWebsite(fb.website);

      const phones = [...new Set([...(fb.phones || []), ...(w.phones || [])])];
      const emails = [...new Set([...(fb.emails || []), ...(w.emails || [])])];
      const whatsapp = w.whatsapp || fb.whatsapp || null;

      const rec = {
        page_url: pageUrl,
        website: fb.website || null,
        phones,
        emails,
        whatsapp,
        country: process.env.COUNTRY || 'DZ',
        ts: new Date().toISOString()
      };
      out.push(rec);
    } catch (e) { console.error('enrich error', pageUrl, e.message); }
  }

  try {
    const res = await fetch(N8N_WEBHOOK_RESULTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'dz-lead-catcher', items: out })
    });
    console.log('POST to n8n:', res.status);
  } catch (e) { console.error('n8n post error', e.message) }

  fs.writeFileSync('results.json', JSON.stringify(out, null, 2));
  console.log('Finished enrich:', out.length);
}

main().catch(e => { console.error(e); process.exit(1); });
