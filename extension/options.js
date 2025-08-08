function parseLines(value) {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function toText(list) {
  return (list || []).join('\n');
}

function load() {
  chrome.storage.local.get(['aiblockConfig'], (data) => {
    const cfg = data.aiblockConfig || { keywords: [], domains: [], whitelist: [] };
    document.getElementById('keywords').value = toText(cfg.keywords);
    document.getElementById('domains').value = toText(cfg.domains);
    document.getElementById('whitelist').value = toText(cfg.whitelist);
  });
}

function save() {
  const config = {
    keywords: parseLines(document.getElementById('keywords').value),
    domains: parseLines(document.getElementById('domains').value),
    whitelist: parseLines(document.getElementById('whitelist').value)
  };

  chrome.storage.local.set({ aiblockConfig: config }, () => {
    const el = document.getElementById('status');
    el.textContent = 'Saved';
    setTimeout(() => (el.textContent = ''), 1000);
  });
}

document.getElementById('save').addEventListener('click', save);
document.addEventListener('DOMContentLoaded', load);


