// StellarPress Error Tracking — drop into any StellarPress site
// <script src="https://app.mydash.io/stellar-errors.js" data-pub-id="YOUR_PUB_ID"></script>
(function() {
  var script = document.currentScript;
  var pubId = script && script.getAttribute("data-pub-id");
  if (!pubId) return;

  var endpoint = "https://hqywacyhpllapdwccmaw.supabase.co/functions/v1/site-errors";
  var queue = [];
  var timer = null;

  function flush() {
    if (!queue.length) return;
    var batch = queue.splice(0, 20);
    try {
      navigator.sendBeacon(endpoint, JSON.stringify({
        publication_id: pubId,
        errors: batch
      }));
    } catch(e) {
      // fallback to fetch
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-publication-id": pubId },
        body: JSON.stringify({ publication_id: pubId, errors: batch }),
        keepalive: true
      }).catch(function() {});
    }
  }

  function enqueue(err) {
    queue.push(err);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 2000);
  }

  // Catch unhandled JS errors
  window.addEventListener("error", function(e) {
    enqueue({
      url: e.filename || location.href,
      error_type: "runtime",
      message: e.message,
      stack_trace: e.error && e.error.stack ? e.error.stack.slice(0, 2000) : null,
      metadata: { line: e.lineno, col: e.colno }
    });
  });

  // Catch unhandled promise rejections
  window.addEventListener("unhandledrejection", function(e) {
    var msg = e.reason ? (e.reason.message || String(e.reason)) : "Unhandled rejection";
    enqueue({
      url: location.href,
      error_type: "runtime",
      message: msg,
      stack_trace: e.reason && e.reason.stack ? e.reason.stack.slice(0, 2000) : null
    });
  });

  // Catch 404s on images, scripts, links
  document.addEventListener("error", function(e) {
    var tag = e.target && e.target.tagName;
    if (tag === "IMG" || tag === "SCRIPT" || tag === "LINK") {
      enqueue({
        url: e.target.src || e.target.href || location.href,
        error_type: "404",
        status_code: 404,
        message: tag + " failed to load: " + (e.target.src || e.target.href)
      });
    }
  }, true);

  // Flush on page unload
  window.addEventListener("beforeunload", flush);
})();
