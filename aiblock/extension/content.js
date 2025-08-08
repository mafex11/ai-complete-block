function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function textNodesUnder(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function buildKeywordRegexes(keywords) {
  return (keywords || [])
    .filter(Boolean)
    .map((kw) => new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}

function shouldBypass(url, whitelist) {
  try {
    const u = new URL(url);
    return (whitelist || []).some((domain) => u.hostname === domain || u.hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiblockConfig'], (data) => {
      resolve(data.aiblockConfig || { keywords: [], domains: [], whitelist: [] });
    });
  });
}

async function applyKeywordBlocking() {
  const config = await getConfig();
  if (shouldBypass(location.href, config.whitelist)) return;

  const regexes = buildKeywordRegexes(config.keywords);
  if (!regexes.length) return;

  const nodes = textNodesUnder(document.body);
  let matched = false;
  for (const node of nodes) {
    const text = node.nodeValue || '';
    if (regexes.some((re) => re.test(text))) {
      matched = true;
      break;
    }
  }

  if (matched) {
    document.documentElement.innerHTML = '';
    const blocker = document.createElement('div');
    blocker.style.cssText = 'position:fixed;inset:0;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font:16px system-ui;z-index:2147483647;padding:24px;text-align:center;';
    blocker.textContent = 'Blocked AI-related content by AI Blocker';
    document.body.appendChild(blocker);
  }
}

const run = debounce(applyKeywordBlocking, 150);
run();

const observer = new MutationObserver(run);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.aiblockConfig) run();
});


