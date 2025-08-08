const DEFAULT_RULESET_ID = 1;

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiblockConfig'], (data) => {
      resolve(data.aiblockConfig || { keywords: [], domains: [], whitelist: [] });
    });
  });
}

async function ensureConfigSeeded() {
  const current = await getConfig();
  const hasAny = (arr) => Array.isArray(arr) && arr.length > 0;
  if (hasAny(current.keywords) || hasAny(current.domains) || hasAny(current.whitelist)) {
    return current;
  }
  try {
    const url = chrome.runtime.getURL('config/config.json');
    const res = await fetch(url);
    if (res.ok) {
      const fileCfg = await res.json();
      const merged = {
        keywords: Array.isArray(fileCfg.keywords) ? fileCfg.keywords : [],
        domains: Array.isArray(fileCfg.domains) ? fileCfg.domains : [],
        whitelist: Array.isArray(fileCfg.whitelist) ? fileCfg.whitelist : [],
        rules: typeof fileCfg.rules === 'object' && fileCfg.rules ? fileCfg.rules : { globalSelectors: [], perDomain: {} }
      };
      await new Promise((resolve) => chrome.storage.local.set({ aiblockConfig: merged }, resolve));
      return merged;
    }
  } catch (e) {
    console.log('[AI Blocker] Failed to seed config.json', e);
  }
  return current;
}

function buildUrlFilterList(domains) {
  return domains
    .filter(Boolean)
    .map((d) => `*://*.${d}/*`)
    .concat(domains.map((d) => `*://${d}/*`));
}

function keywordToRegex(keyword) {
  try {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  } catch (e) {
    return null;
  }
}

async function updateDNRRules() {
  const config = await getConfig();

  const whitelist = new Set((config.whitelist || []).filter(Boolean));
  const filteredDomains = (config.domains || []).filter((domain) => {
    for (const w of whitelist) {
      if (domain === w || domain.endsWith(`.${w}`)) return false;
    }
    return true;
  });

  const urlFilters = buildUrlFilterList(filteredDomains);

  const blockRules = urlFilters.map((pattern, idx) => ({
    id: idx + 1,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: pattern }
  }));

  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map((r) => r.id);
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingIds,
      addRules: blockRules
    });
  } catch (e) {
    console.log('[AI Blocker] Failed updating DNR rules', e);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[AI Blocker] Installed');
  await ensureConfigSeeded();
  await updateDNRRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureConfigSeeded();
  await updateDNRRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.aiblockConfig) {
    updateDNRRules();
  }
});


