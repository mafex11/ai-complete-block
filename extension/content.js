function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function buildKeywordRegexes(keywords) {
  return (keywords || [])
    .filter(Boolean)
    .map((kw) => {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const isShortWord = /^[a-z]{1,3}$/i.test(kw);
      const pattern = isShortWord ? `\\b${escaped}\\b` : escaped;
      return new RegExp(pattern, 'i');
    });
}

function shouldBypass(url, whitelist) {
  try {
    const u = new URL(url);
    return (whitelist || []).some((domain) => u.hostname === domain || u.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function getHostname() {
  try { return location.hostname; } catch { return ''; }
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiblockConfig'], (data) => {
      resolve(
        data.aiblockConfig ||
          { keywords: [], domains: [], whitelist: [], rules: { globalSelectors: [], perDomain: {} } }
      );
    });
  });
}

function getSiteExtraKeywords(hostname) {
  const host = hostname || '';
  const isGoogle = /(^|\.)google\.[a-z.]+$/i.test(host);
  const isYouTube = /(^|\.)youtube\.com$/i.test(host);
  const isYtShort = /(^|\.)youtu\.be$/i.test(host);
  const extras = [];
  if (isGoogle) {
    extras.push('ai overview', 'ai overviews', 'generative', 'search generative', 'gemini', 'labs');
  }
  if (isYouTube || isYtShort) {
    extras.push('ai summary', 'ai summaries', 'ai-generated summary', 'ask with gemini', 'gemini', 'notes');
  }
  return extras;
}

function getSiteRules(hostname) {
  const isGoogle = /(^|\.)google\.[a-z.]+$/i.test(hostname);
  const isYouTube = /(^|\.)youtube\.com$/i.test(hostname) || /(^|\.)youtu\.be$/i.test(hostname);
  /**
   * protectSelectors: containers we never remove (search bars, headers)
   * removeSelectors: known AI modules to directly remove when present
   */
  const protectSelectors = [
    '[role="search"]', 'form[role="search"]', 'form[action*="/search" i]', '#searchform', '#tsf', '#search',
    'header', 'nav', 'ytd-masthead', 'tp-yt-paper-input',
    'input[type="search"]', 'input[name="q"]', 'textarea'
  ];
  const removeSelectors = [];
  if (isGoogle) {
    removeSelectors.push(
      // Generative AI/Overview containers observed across rollouts (best-effort; safe to no-op if absent)
      '[data-attrid*="ai" i]',
      '[aria-label*="AI Overview" i]',
      'div:has([aria-label*="AI Overview" i])',
      'div:has([data-ved][role="complementary"])'
    );
  }
  if (isYouTube) {
    removeSelectors.push(
      'ytd-engagement-panel-section-list-renderer',
      'ytd-info-panel-content-renderer:has-text("AI")',
      '#description-inline-expander:has-text("AI")'
    );
  }
  return { protectSelectors, removeSelectors };
}

function injectHideStyleOnce() {
  if (document.getElementById('aiblock-hide-style')) return;
  const style = document.createElement('style');
  style.id = 'aiblock-hide-style';
  style.textContent = `.aiblock-hidden{display:none !important}`;
  document.documentElement.appendChild(style);
}

function elementText(el) {
  if (!el) return '';
  const text = (el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '');
  return text.trim().slice(0, 5000); // cap to avoid huge strings
}

function matchesAny(text, regexes) {
  return regexes.some((re) => re.test(text));
}

function getGenericSelectors() {
  return [
    // Interactive
    'button', 'a', '[role="button"]', '[role="tab"]', '[role="link"]', '[role="menuitem"]',
    // UI blocks
    'section', 'aside', '[role="complementary"]', '[role="region"]',
    // Hints in classes
    '[class*="chip" i]', '[class*="badge" i]', '[class*="banner" i]', '[class*="panel" i]', '[class*="module" i]', '[class*="promo" i]', '[class*="overview" i]', '[class*="summary" i]',
  ];
}

function aiTerms() {
  return [
    // compound first (higher weight later)
    'ai overview', 'ai overviews', 'ai summary', 'ai summaries', 'ask ai', 'ask with gemini', 'powered by ai', 'use ai', 'try ai', 'ai mode',
    // brands/features
    'gemini', 'copilot', 'chatgpt', 'gpt-4', 'gpt4', 'claude', 'perplexity', 'bard', 'midjourney', 'stable diffusion', 'stability ai', 'anthropic', 'cohere', 'openai', 'deepseek',
    // generic
    'generative', 'llm'
  ];
}

function textMatchWeight(text) {
  if (!text) return 0;
  const t = text.toLowerCase();
  let score = 0;
  // compound phrases get higher weight
  const compounds = ['ai overview', 'ai overviews', 'ai summary', 'ai summaries', 'ask ai', 'ask with gemini', 'powered by ai', 'use ai', 'try ai', 'ai mode'];
  for (const p of compounds) {
    if (t.includes(p)) score += 3;
  }
  const brands = ['gemini', 'copilot', 'chatgpt', 'gpt-4', 'gpt4', 'claude', 'perplexity', 'bard', 'midjourney', 'stable diffusion', 'stability ai', 'anthropic', 'cohere', 'openai', 'deepseek'];
  for (const b of brands) {
    if (t.includes(b)) score += 2;
  }
  // standalone 'ai' word (word-boundary)
  if (/\bai\b/i.test(text)) score += 1;
  if (t.includes('generative') || /\bllm\b/i.test(text)) score += 1;
  return score;
}

function isInsideProtected(el, protectSelectors) {
  if (!el || !protectSelectors || protectSelectors.length === 0) return false;
  try {
    return !!el.closest(protectSelectors.join(','));
  } catch {
    return false;
  }
}

function isTooLarge(el) {
  if (!el || !el.getBoundingClientRect) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0) || r.width;
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0) || r.height;
  return r.width > vw * 0.9 || r.height > vh * 0.5; // avoid removing huge areas
}

function chooseRemovalTarget(el, protectSelectors) {
  let current = el;
  const maxHops = 6;
  let candidate = el;
  for (let i = 0; i < maxHops && current && current !== document.body; i += 1) {
    const tag = (current.tagName || '').toLowerCase();
    const role = (current.getAttribute && current.getAttribute('role')) || '';
    const className = (current.className || '').toString().toLowerCase();
    if (
      role === 'region' || role === 'complementary' ||
      tag === 'aside' ||
      tag.startsWith('ytd-') ||
      /(panel|module|card|summary|overview|banner|chip|badge|drawer)/.test(className)
    ) {
      candidate = current;
    }
    // stop if next ancestor is protected or would be oversized
    const next = current.parentElement;
    if (!next || isInsideProtected(next, protectSelectors) || isTooLarge(next)) {
      break;
    }
    current = current.parentElement;
  }
  return candidate || el;
}

const hiddenNodes = new WeakSet();

function hideElement(el) {
  if (!el || hiddenNodes.has(el)) return;
  el.classList.add('aiblock-hidden');
  hiddenNodes.add(el);
}

function scanAndHideBySelectors(regexes, hostname) {
  // Attribute hints first
  const attrHints = [
    '[aria-label*="ai" i]', '[aria-label*="gemini" i]', '[id*="ai" i]', '[class*="ai" i]'
  ];
  const ytPanels = [
    'ytd-info-panel-content-renderer', 'ytd-engagement-panel-section-list-renderer',
    'ytd-watch-metadata', 'yt-chip-cloud-chip-renderer', 'yt-spec-button-shape-next'
  ];
  const candidates = [
    ...getGenericSelectors(), 'div', 'span', ...ytPanels
  ];

  const allSelectors = Array.from(new Set([...attrHints, ...candidates]));
  const nodes = document.querySelectorAll(allSelectors.join(','));
  let count = 0;
  const { protectSelectors, removeSelectors } = getSiteRules(hostname);

  // Remove known site AI containers first
  try {
    if (removeSelectors && removeSelectors.length) {
      document.querySelectorAll(removeSelectors.join(',')).forEach((el) => hideElement(el));
    }
  } catch { /* ignore selector errors */ }

  // Inject rule-based selectors from config
  try {
    const domain = hostname || '';
    chrome.storage.local.get(['aiblockConfig'], (data) => {
      const cfg = data.aiblockConfig || {};
      const rules = cfg.rules || { globalSelectors: [], perDomain: {} };
      const globals = Array.isArray(rules.globalSelectors) ? rules.globalSelectors : [];
      const domainKey = Object.keys(rules.perDomain || {}).find((d) => domain === d || domain.endsWith(`.${d}`));
      const perDomain = domainKey ? rules.perDomain[domainKey] : [];
      const all = [...globals, ...(Array.isArray(perDomain) ? perDomain : [])];
      if (all.length) {
        try {
          document.querySelectorAll(all.join(',')).forEach((el) => hideElement(el));
        } catch (_) {}
      }
    });
  } catch {}

  for (const el of nodes) {
    if (count > 3000) break; // safety cap per run
    count += 1;
    const txt = elementText(el);
    if (!txt) continue;

    // Confidence scoring
    let score = 0;
    score += textMatchWeight(txt);
    const tag = (el.tagName || '').toLowerCase();
    const role = (el.getAttribute && el.getAttribute('role')) || '';
    const className = (el.className || '').toString().toLowerCase();
    if (tag === 'button' || role === 'button' || role === 'tab' || role === 'menuitem') score += 1;
    if (/(chip|badge|tab|pill)/.test(className)) score += 1;
    if (/(panel|module|card|summary|overview|banner|promo)/.test(className)) score += 1;
    if (/(cta|try|enable|turn on|start|launch)/.test(txt.toLowerCase())) score += 1;

    // Penalties
    if (isInsideProtected(el, protectSelectors)) score -= 3;
    if (isTooLarge(el)) score -= 2;

    const threshold = 3; // conservative
    if (score >= threshold) {
      const target = chooseRemovalTarget(el, protectSelectors);
      if (isInsideProtected(target, protectSelectors) || isTooLarge(target)) {
        hideElement(el);
      } else {
        hideElement(target);
      }
    }
  }
}

async function applyKeywordBlocking() {
  const config = await getConfig();
  if (shouldBypass(location.href, config.whitelist)) return;

  injectHideStyleOnce();

  const hostname = getHostname();
  const extra = getSiteExtraKeywords(hostname);
  const regexes = buildKeywordRegexes([...(config.keywords || []), ...extra]);
  if (!regexes.length) return;

  scanAndHideBySelectors(regexes, hostname);
}

const run = debounce(applyKeywordBlocking, 150);
run();

const observer = new MutationObserver(run);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.aiblockConfig) run();
});


