chrome.webNavigation.onBeforeNavigate.addListener(
  (details) => {

    if (details.url.endsWith(".pdf")) {

      const viewerUrl =
        chrome.runtime.getURL("index.html") +
        "?file=" +
        encodeURIComponent(details.url);

      chrome.tabs.update(details.tabId, {
        url: viewerUrl,
      });
    }
  }
);