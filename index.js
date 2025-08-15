import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import randomUseragent from 'random-useragent';

const HEADLESS = (process.env.PUPPETEER_HEADLESS || 'true') === 'true';
const COUNTRY = process.env.COUNTRY || 'DZ';
const SCROLL_PAGES = parseInt(process.env.SCROLL_PAGES || '5', 10);
const MAX_PAGES_PER_KEYWORD = parseInt(process.env.MAX_PAGES_PER_KEYWORD || '120', 10);
const SLEEP_MIN_MS = parseInt(process.env.SLEEP_MIN_MS || '1200', 10);
const SLEEP_MAX_MS = parseInt(process.env.SLEEP_MAX_MS || '2600', 10);
const USER_DATA_DIR = process.env.USER_DATA_DIR || '.puppeteer';

// ملفات العمل (إلى /tmp لتفادي مشاكل الصلاحيات بالحاويات)
const KEYWORDS_FILE = process.env.KEYWORDS_FILE || '/tmp/keywords.txt';
const PAGES_FILE = process.env.PAGES_FILE || '/tmp/pages.json';

// مهم للحاويات
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
];
const EXECUTABLE_PATH = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rsleep = () =>
  sleep(Math.floor(Math.random() * (SLEEP_MAX_MS - SLEEP_MIN_MS)) + SLEEP_MIN_MS);

function buildSearchUrl(q) {
  const params = new URLSearchParams({
    active_status: 'all',
    ad_type: 'all',
    country: COUNTRY,
    q,
    search_type: 'keyword_unordered',
  });
  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

async function collectPageLinks(page) {
  const anchors = await page.$$eval('a[href]', (as) => as.map((a) => a.href));
  const candidates = anchors.filter(
    (h) =>
      h.startsWith('https://www.facebook.com/') &&
      !h.includes('/ads/library') &&
      !h.includes('/ads/about') &&
      !h.includes('sharer.php') &&
      !h.includes('/help/') &&
      !h.includes('/policies/')
  );
  const simple = candidates
    .map((h) => {
      try {
        const u = new URL(h);
        const parts = u.pathname.split('/').filter(Boolean);
        const first = parts[0];
        if (!first) return null;
        return `https://www.facebook.com/${first}`;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return [...new Set(simple)];
}

async function scrapeKeyword(browser, keyword) {
  const page = await browser.newPage();
  await page.setUserAgent(randomUseragent.getRandom() || 'Mozilla/5.0');
  await page.setViewport({ width: 1280, height: 900 });
  page.setDefaultNavigationTimeout(60000);

  const url = buildSearchUrl(keyword);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await rsleep();

  // حاول قبول الكوكيز إن ظهر بانر
  try {
    await page.waitForSelector('button', { timeout: 5000 });
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const txt =
        (await (await b.getProperty('innerText')).jsonValue())?.toLowerCase() || '';
      if (
        txt.includes('accept') ||
        txt.includes('allow all') ||
        txt.includes('allow essential') ||
        txt.includes('قبول')
      ) {
        await b.click();
        break;
      }
    }
  } catch {}

  // تمرير/سكرول وجمع روابط الصفحات
  const pageLinks = new Set();
  for (let i = 0; i < SCROLL_PAGES; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9));
    await rsleep();
    const links = await collectPageLinks(page);
    links.forEach((l) => pageLinks.add(l));
    if (pageLinks.size >= MAX_PAGES_PER_KEYWORD) break;
  }

  await page.close();
  return [...pageLinks];
}

function readKeywords() {
  // نقرأ من /tmp أولًا (الخادم يكتبها هناك)، ولو غير موجودة نجرّب ملف المستودع كخطة بديلة
  if (fs.existsSync(KEYWORDS_FILE)) {
    return fs.readFileSync(KEYWORDS_FILE, 'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
  }
  const fallback = path.join(process.cwd(), 'keywords.txt');
  if (fs.existsSync(fallback)) {
    return fs.readFileSync(fallback, 'utf8').split('\n').map(s=>s.trim()).filter(Boolean);
  }
  throw new Error(`No keywords file found at ${KEYWORDS_FILE} or ${fallback}`);
}

async function main() {
  const keywords = readKeywords();

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    userDataDir: USER_DATA_DIR,
    args: LAUNCH_ARGS,
    executablePath: EXECUTABLE_PATH,
  });

  const all = new Set();
  for (const kw of keywords) {
    console.log('Searching:', kw);
    const links = await scrapeKeyword(browser, kw);
    links.forEach((l) => all.add(l));
    await rsleep();
  }
  await browser.close();

  fs.writeFileSync(
    PAGES_FILE,
    JSON.stringify({ ts: Date.now(), pages: [...all] }, null, 2)
  );
  console.log('Collected pages:', all.size, '→', PAGES_FILE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
