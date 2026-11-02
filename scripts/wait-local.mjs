// Wait for configured functions, not merely the container or frontend port.
const checks = [
  ['API', 'http://127.0.0.1:3000/api/health', {}],
  ['frontend', 'http://localhost:5173/', {}],
  ['demo function', 'http://127.0.0.1:54321/functions/v1/demo-session', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } }],
];
let last = [];
for (let attempt = 0; attempt < 90; attempt++) {
  last = await Promise.all(checks.map(async ([name, url, options]) => {
    try { const response = await fetch(url, { ...options, signal: AbortSignal.timeout(2000) }); return { name, ready: response.ok, status: response.status }; }
    catch { return { name, ready: false }; }
  }));
  if (last.every((result) => result.ready)) { console.log('Local API, frontend, and configured demo function are ready.'); process.exit(0); }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.error(JSON.stringify({ startup: 'timed out', checks: last }));
process.exitCode = 1;
