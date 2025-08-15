import express from 'express';
import { execFile } from 'child_process';
import fs from 'fs';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_, res) => res.json({ ok: true }));

function run(cmd, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve({ stdout, stderr });
    });
  });
}

app.post('/run', async (req, res) => {
  try {
    const { keywords = [], test = false, scrollPages, maxPerKeyword } = req.body || {};
    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ ok: false, error: 'keywords[] required' });
    }

    // اكتب الكلمات في /tmp (دائمًا قابل للكتابة داخل الحاوية)
    const KEYWORDS_FILE = process.env.KEYWORDS_FILE || '/tmp/keywords.txt';
    fs.writeFileSync(KEYWORDS_FILE, keywords.filter(Boolean).join('\n'));

    const env = {};
    if (scrollPages) env.SCROLL_PAGES = String(scrollPages);
    if (maxPerKeyword) env.MAX_PAGES_PER_KEYWORD = String(maxPerKeyword);
    env.USE_TEST_WEBHOOK = test ? 'true' : 'false';

    await run('node', ['index.js'], env);
    const r = await run('node', ['enrich.js'], env);

    res.json({ ok: true, message: 'run finished', logs: r.stdout?.slice(-1000) || '' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('dz-lead-catcher listening on', PORT));
