# dz-lead-catcher

Scrape advertiser pages from Facebook Ads Library (DZ), extract phone/WhatsApp/email from FB About & website, and POST results to n8n.

## Quick start
```bash
npm i
npm run run         # runs index.js then enrich.js
# or
npm run serve       # starts HTTP server on port 3000, POST /run
```

### Env
See `.env.example`. Set N8N_WEBHOOK_RESULTS to your n8n webhook.

### Docker (Coolify)
Uses the provided Dockerfile. For cron mode keep:
```
CMD ["bash", "run.sh"]
```
For server mode (HTTP):
```
CMD ["node","server.js"]
```
