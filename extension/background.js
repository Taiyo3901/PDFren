const isPdfUrl = (url) => {
  if (!url) return false;

  return (
    url.endsWith(".pdf") ||
    url.includes(".pdf?") ||
    url.startsWith("file:")
  );
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "loading") return;
  if (!tab.url) return;

  // ✅ これが超重要（無限ループ防止）
  if (tab.url.includes("chrome-extension://")) return;

  // ✅ すでにviewerなら無視
  if (tab.url.includes("index.html?pdf=")) return;

  if (isPdfUrl(tab.url)) {
    const viewerUrl = chrome.runtime.getURL(
      `index.html?pdf=${encodeURIComponent(tab.url)}`
    );

    chrome.tabs.update(tabId, { url: viewerUrl });
  }
});