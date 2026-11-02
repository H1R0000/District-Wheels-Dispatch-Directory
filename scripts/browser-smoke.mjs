import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:5173';
const target = new URL(base);
if (!['localhost', '127.0.0.1'].includes(target.hostname) && !/^district-wheels-dispatch-directory-[a-z0-9]+\.vercel\.app$/.test(target.hostname)) throw new Error('Smoke mutations are restricted to local and explicit preview deployment URLs.');
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
let createdId, token, context;
const errors = [], buyerRequests = [], violations = [], httpFailures = [];
try {
  context = await browser.newContext();
  // Optional protected-preview storage state is generated privately by release tooling.
  if (process.env.SMOKE_COOKIE_FILE) {
    const cookies = JSON.parse(await readFile(process.env.SMOKE_COOKIE_FILE, 'utf8'));
    await context.addCookies(cookies);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const path = new URL(response.url()).pathname;
      httpFailures.push({ service: path.includes('/functions/') ? 'function' : path.startsWith('/api/') ? 'API' : 'other', status: response.status() });
    }
  });
  await page.exposeFunction('reportCspViolation', (directive) => violations.push(directive));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (event) => window.reportCspViolation(event.violatedDirective)));
  page.on('request', (request) => {
    if (request.url().includes('/api/buyers')) { buyerRequests.push(request); token = request.headers().authorization; }
    if (/\/rest\/v1\/buyers/.test(request.url())) errors.push('Browser bypassed Express for buyer data.');
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Sign in securely' }).waitFor();
  await page.getByRole('button', { name: 'Enter Demo', exact: true }).click();
  await page.locator('.buyer-card').first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Open dispatch assistant', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Add buyer');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.getByText('Which delivery should I use: LBC door-to-door, LBC branch pickup, or J&T door-to-door?', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.goto(`${base}/buyers/new`, { waitUntil: 'networkidle' });
  await page.locator('form').waitFor();
  const phone = `0917${String(Date.now()).slice(-7)}`;
  for (const [name, value] of Object.entries({ name: 'Api Smoke Example', phone, 'addresses.0.street': '1 Fictional Street', 'addresses.0.barangay': 'Example Barangay', 'addresses.0.city': 'Makati City', 'addresses.0.province': 'Metro Manila', 'addresses.0.zipCode': '1200' })) await page.locator(`input[name="${name}"]`).fill(value);
  const saved = page.waitForResponse((response) => response.url().endsWith('/api/buyers') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create buyer', exact: true }).click();
  const savedResponse = await saved;
  assert.equal(savedResponse.status(), 201); createdId = (await savedResponse.json()).id;
  await page.getByRole('heading', { name: 'Api Smoke Example', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Edit buyer', exact: true }).click();
  await page.locator('input[name="name"]').fill('Api Smoke Updated');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Api Smoke Updated', exact: true }).waitFor();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('heading', { name: 'Buyer dispatch records' }).waitFor();
  createdId = undefined;
  assert.ok(buyerRequests.some((request) => request.method() === 'POST'));
  assert.ok(buyerRequests.some((request) => request.method() === 'PUT'));
  assert.ok(buyerRequests.some((request) => request.method() === 'DELETE'));
  assert.deepEqual(errors, []); assert.deepEqual(violations, []);
  await mkdir('tmp', { recursive: true });
  await page.screenshot({ path: 'tmp/application-api-smoke.png', fullPage: true });
  console.log(JSON.stringify({ target: target.hostname, demoSignIn: 'passed', buyerCrudViaExpress: 'passed', directRoute: 'passed', assistant: 'passed', runtimeErrors: 0, cspViolations: 0 }));
} catch (error) {
  const page = context?.pages()[0];
  console.error(JSON.stringify({ httpFailures, runtimeErrors: errors, cspViolations: violations, signInMessage: await page?.locator('.auth-message').textContent({ timeout: 500 }).catch(() => null) }));
  await mkdir('tmp', { recursive: true });
  await page?.screenshot({ path: 'tmp/application-api-smoke-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (createdId && token) {
    const cleanup = await context.request.delete(`${base}/api/buyers/${encodeURIComponent(createdId)}`, { headers: { Authorization: token } });
    if (!cleanup.ok() && cleanup.status() !== 404) console.error('Smoke fixture cleanup needs attention.');
  }
  await browser.close();
}
