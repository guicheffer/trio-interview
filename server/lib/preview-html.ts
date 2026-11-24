/** Pieces of the preview proxy that only transform text, so they can be tested without a server. */

function removeScripts(html: string, shouldRemove: (block: string) => boolean): string {
  const closing = '</script>';
  let out = '';
  let position = 0;
  for (;;) {
    const start = html.indexOf('<script', position);
    if (start === -1) break;
    const end = html.indexOf(closing, start);
    if (end === -1) break;
    const stop = end + closing.length;
    const block = html.slice(start, stop);
    out += html.slice(position, start);
    if (!shouldRemove(block)) out += block;
    position = stop;
  }
  return out + html.slice(position);
}

function prefixAttribute(html: string, quote: '"' | "'", basePath: string): string {
  const pattern = new RegExp(`(src|href)=${quote}\\/((?!\\/)[^${quote}]+)${quote}`, 'g');
  return html.replace(pattern, (_match, attr: string, path: string) => {
    if (path.startsWith('preview/')) return `${attr}=${quote}/${path}${quote}`;
    return `${attr}=${quote}${basePath}/${path}${quote}`;
  });
}

/**
 * A dev server started without the preview base emits absolute paths (/src/main.tsx, /@vite/client).
 * Behind the tunnel those must go through /preview/<candidate>/<exercise>/, and Vite's hot reload scripts
 * cannot work through the proxy, so they are removed.
 */
export function rewriteForTunnel(html: string, basePath: string): string {
  const prefixed = prefixAttribute(prefixAttribute(html, '"', basePath), "'", basePath);
  return removeScripts(prefixed, block =>
    (block.startsWith('<script type="module" src="') && block.includes('/@vite/client')) ||
    (block.startsWith('<script type="module">') && block.includes('injectIntoGlobalHook')));
}

export function toRequestPayload(parsed: unknown): string | Buffer | undefined {
  if (parsed == null) return undefined;
  if (typeof parsed === 'string' || Buffer.isBuffer(parsed)) return parsed;
  return JSON.stringify(parsed);
}

/** Shown while the candidate's app has not started yet; it asks the server to detect the app until it is up */
export function waitingPage(candidate: string, exercise: string): string {
  const target = JSON.stringify({ candidate, exercise });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Starting Server...</title>
<style>
body{font-family:system-ui;max-width:600px;margin:80px auto;padding:20px;text-align:center}
h1{color:#ef4444}p{color:#64748b;line-height:1.6}
#status{margin-top:20px;font-size:14px;color:#94a3b8}
.spinner{display:inline-block;width:20px;height:20px;border:3px solid #e5e7eb;border-top-color:#3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head><body>
<h1>Checking for Dev Server...</h1>
<p>Looking for your development server...</p>
<div id="status"><span class="spinner"></span>Detecting...</div>
<script>
(async function() {
  const status = document.getElementById('status');
  const target = ${target};
  const maxRetries = 30;
  for (let retries = 1; retries <= maxRetries; retries++) {
    try {
      const res = await fetch('/api/preview/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(target)
      });
      const data = await res.json();
      if (data.detected) {
        status.innerHTML = '<span style="color:#22c55e">Found! Reloading...</span>';
        setTimeout(() => window.location.reload(), 500);
        return;
      }
    } catch (err) {}
    status.innerHTML = '<span class="spinner"></span>Waiting for server to start... (' + retries + '/' + maxRetries + ')';
    await new Promise(r => setTimeout(r, 1000));
  }
  document.body.innerHTML = '<h1 style="color:#ef4444">Dev Server Not Running</h1>' +
    '<p>This exercise requires a development server.</p>' +
    '<p><strong>Click the Run App button</strong> in the terminal panel to start the server.</p>' +
    '<p style="font-size:14px;margin-top:40px;color:#94a3b8">Once started, this page will refresh automatically.</p>';
})();
</script>
</body></html>`;
}
