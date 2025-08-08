function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return null;
  }
}

function setStatus(msg) {
  const el = document.getElementById('status');
  el.textContent = msg;
  setTimeout(() => (el.textContent = ''), 1000);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const domain = getDomain(tab.url);
  if (!domain) return;

  chrome.storage.local.get(['aiblockConfig'], (data) => {
    const cfg = data.aiblockConfig || { keywords: [], domains: [], whitelist: [] };
    const isWhitelisted = cfg.whitelist.includes(domain) || cfg.whitelist.some((d) => domain.endsWith(`.${d}`));
    document.getElementById('enabled').checked = !isWhitelisted;
  });

  document.getElementById('enabled').addEventListener('change', (e) => {
    chrome.storage.local.get(['aiblockConfig'], (data) => {
      const cfg = data.aiblockConfig || { keywords: [], domains: [], whitelist: [] };
      const idx = cfg.whitelist.findIndex((d) => d === domain);
      if (e.target.checked) {
        if (idx !== -1) cfg.whitelist.splice(idx, 1);
      } else {
        if (idx === -1) cfg.whitelist.push(domain);
      }
      chrome.storage.local.set({ aiblockConfig: cfg }, () => setStatus('Saved'));
    });
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

document.addEventListener('DOMContentLoaded', init);


