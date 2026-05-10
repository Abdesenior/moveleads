import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary'

// Recover from stale-deploy chunk-load failures.
// When a new build ships, hashed asset filenames change. Tabs that loaded the
// previous index.html still hold pointers to the old chunk hashes; clicking
// a route that lazy-imports a now-deleted chunk surfaces as either
// "Failed to fetch dynamically imported module" or "Expected a JavaScript
// module script but the server responded with a MIME type of text/html"
// (when the SPA fallback returns index.html for the missing chunk).
// Either signal means the user's index.html is stale; one hard reload
// pulls the fresh manifest with current asset hashes.
//
// Guard against reload loops with a sessionStorage flag — if we just
// reloaded and STILL see the error, let it surface to the error boundary
// so the user sees a real message instead of an infinite refresh.
function isChunkLoadError(err) {
  const msg = (err && (err.message || String(err))) || '';
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Expected a JavaScript(-or-Wasm)? module script/i.test(msg)
  );
}
function recoverFromStaleDeploy() {
  const KEY = 'ml_chunk_reload_at';
  const last = Number(sessionStorage.getItem(KEY) || 0);
  if (Date.now() - last < 10_000) return; // recent attempt — surface the error
  sessionStorage.setItem(KEY, String(Date.now()));
  window.location.reload();
}
window.addEventListener('error', (e) => {
  if (isChunkLoadError(e?.error || e)) recoverFromStaleDeploy();
});
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkLoadError(e?.reason)) recoverFromStaleDeploy();
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
