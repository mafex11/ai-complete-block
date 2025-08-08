const DEFAULT_RULESET_ID = 1;

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['aiblockConfig'], (data) => {
      resolve(data.aiblockConfig || { keywords: [], domains: [], whitelist: [] });
    });
  });
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

  const urlFilters = buildUrlFilterList(config.domains || []);

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
  await updateDNRRules();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateDNRRules();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.aiblockConfig) {
    updateDNRRules();
  }
});

// Content blocking by keywords happens in content.js. This background registers listeners only.


