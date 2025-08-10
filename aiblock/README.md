## AI Blocker (Chrome MV3)

Blocks AI-related content across the web using two layers:
- Network blocking (domains) via Declarative Net Request
- On-page keyword blocking via content script

### Setup

1) Copy `.env.example` to `.env` and adjust lists (comma-separated):

```
AI_BLOCK_KEYWORDS=ai,artificial intelligence,chatgpt,openai,llm,generative
AI_BLOCK_DOMAINS=openai.com,perplexity.ai,character.ai
AI_BLOCK_WHITELIST=
```

2) Install deps and build config:

```
npm install
npm run build
```

3) Load the extension:
- Open Chrome → Extensions → Manage Extensions
- Enable Developer mode
- Load unpacked → select the `extension` folder

4) Configure in the extension Options page (popup → Options), or edit `.env` and re-run `npm run build`.

### Dev
- `npm run watch` to rebuild config on `.env` changes.
- `npm run prepare-dist && npm run zip` to produce `dist/ai-blocker.zip` for distribution (Windows PowerShell required for the zip step).

### How it works
- `scripts/build-config.js` reads `.env` and writes `extension/config/config.json`.
- `background.js` seeds storage from `config.json` on install/startup and builds network rules with whitelist respected.
- `options.js` saves config to `chrome.storage.local` which triggers background to update network rules.
- `content.js` hides pages that contain AI-related keywords unless the domain is whitelisted.



