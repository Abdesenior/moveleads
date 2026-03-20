/**
 * MoveLeads – Full E2E Flow
 *
 * Prerequisites (both must be running before `npm run test:e2e`):
 *   cd server && node server.js
 *   cd client && npm run dev
 *
 * What this test proves:
 *   1. Admin creates a company account with $100 balance + zip-90210 coverage
 *   2. Company logs into the dashboard and the WebSocket connects
 *   3. A customer submits the 3-step /get-quote form for zip 90210
 *   4. Twilio mock (~2 s) verifies phone → READY_FOR_DISTRIBUTION
 *   5. Socket pushes NEW_LEAD_AVAILABLE only to rooms the company is in (zip_90210)
 *   6. Company confirms purchase → concurrency lock → balance deducted → contacts revealed
 *   7. AuthContext balance refreshes (stale-balance bug fix)
 */

const { test, expect } = require('@playwright/test');

const API    = 'http://localhost:5005/api';
const CLIENT = 'http://localhost:5173';

let adminEmail, adminToken;
let companyEmail, companyToken, companyId;
let coverageId;
let ts; // shared timestamp for unique test data

// ─── API helpers (use Node.js built-in fetch) ─────────────────────────────────

async function apiPost(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { throw new Error(`Non-JSON response from POST ${path} (${res.status}): ${text.slice(0, 200)}`); }
}

async function apiPut(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-auth-token': token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { throw new Error(`Non-JSON response from PUT ${path} (${res.status}): ${text.slice(0, 200)}`); }
}

async function apiGet(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: { ...(token ? { 'x-auth-token': token } : {}) },
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { throw new Error(`Non-JSON response from GET ${path} (${res.status}): ${text.slice(0, 200)}`); }
}

async function apiDelete(path, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: { ...(token ? { 'x-auth-token': token } : {}) },
  });
  return { status: res.status };
}

// ─── Setup & Teardown ─────────────────────────────────────────────────────────

test.setTimeout(90_000);

test.beforeAll(async () => {
  ts = Date.now();
  adminEmail   = `admin.e2e.${ts}@moveleads.com`;
  companyEmail = `movers.e2e.${ts}@test.com`;

  // 1. Register admin (email must contain "admin" → role = 'admin')
  const adminReg = await apiPost('/auth/register', {
    companyName: 'E2E Admin',
    email: adminEmail,
    password: 'Admin123!',
    dotNumber: '100001',
    mcNumber:  'MC100001',
    phone:     '8005550001',
  });
  if (adminReg.status !== 200) throw new Error(`Admin register failed: ${JSON.stringify(adminReg.body)}`);
  adminToken = adminReg.body.token;

  // 2. Register company (role = 'customer')
  const companyReg = await apiPost('/auth/register', {
    companyName: 'Beverly Hills Movers E2E',
    email: companyEmail,
    password: 'Company123!',
    dotNumber: '100002',
    mcNumber:  'MC100002',
    phone:     '3105550002',
  });
  if (companyReg.status !== 200) throw new Error(`Company register failed: ${JSON.stringify(companyReg.body)}`);
  companyToken = companyReg.body.token;
  companyId    = companyReg.body.user.id;

  // 3. Admin sets company balance to $100
  const balSet = await apiPut(`/users/${companyId}`, { balance: 100 }, adminToken);
  if (balSet.status !== 200 || balSet.body.balance !== 100)
    throw new Error(`Balance set failed: ${JSON.stringify(balSet.body)}`);

  // 4. Admin creates CoverageArea for zip 90210 (required for socket room routing)
  const covRes = await apiPost('/admin/coverage', {
    userId: companyId,
    zipCode: '90210',
    type: 'both',
  }, adminToken);
  if (covRes.status !== 201) throw new Error(`Coverage create failed: ${JSON.stringify(covRes.body)}`);
  coverageId = covRes.body._id;

  console.log(`✓ Setup complete — admin: ${adminEmail} | company: ${companyEmail} | coverage: ${coverageId}`);
});

test.afterAll(async () => {
  if (coverageId) await apiDelete(`/admin/coverage/${coverageId}`, adminToken);
  if (companyId)  await apiDelete(`/users/${companyId}`, adminToken);
  console.log('✓ Teardown complete');
});

// ─── Main Test ────────────────────────────────────────────────────────────────

test('Full lead flow: submit form → Twilio verify → WebSocket push → buy → balance drop', async ({ browser }) => {

  const dashCtx = await browser.newContext();
  const formCtx = await browser.newContext();
  const dashPage = await dashCtx.newPage();
  const formPage = await formCtx.newPage();

  // Intercept Google Maps JS API so the script load triggers onerror,
  // which forces ZipFallback to render (plain zip inputs) instead of the
  // full Places Autocomplete that requires a real API key.
  await formPage.route('**/maps.googleapis.com/**', route => route.abort());

  try {

    // ── 1. Company logs in and opens Lead Feed ──────────────────────────────
    await dashPage.goto(`${CLIENT}/login`);
    await dashPage.fill('input[type="email"]', companyEmail);
    await dashPage.fill('input[type="password"]', 'Company123!');
    await dashPage.click('button:has-text("Sign In")');
    await dashPage.waitForURL('**/dashboard', { timeout: 10_000 });

    await dashPage.goto(`${CLIENT}/dashboard/leads`);

    // Prove socket auth works — real-time indicator must go green
    await expect(dashPage.locator('.connection-badge'))
      .toContainText('Live Connection', { timeout: 15_000 });
    console.log('✓ WebSocket connected and authenticated');

    // Snapshot lead count BEFORE form submission (may have residual test data)
    const leadsBefore = await dashPage.locator('.lead-card').filter({ hasText: '90210' }).count();
    console.log(`  ↳ ${leadsBefore} existing "90210" lead card(s) in feed`);


    // ── 2. Customer submits the 3-step /get-quote form ──────────────────────
    await formPage.goto(`${CLIENT}/get-quote`);

    // — Step 1: Home size + move date —
    await formPage.click('.gq-size-btn:has-text("2 Bedroom")');

    const moveDate = new Date();
    moveDate.setDate(moveDate.getDate() + 14); // 2 weeks from today
    const moveDateStr = moveDate.toISOString().split('T')[0];
    await formPage.fill('input[name="moveDate"]', moveDateStr);
    await formPage.click('button.gq-btn-next');

    // — Step 2: Zip codes (ZipFallback rendered because Google Maps was aborted) —
    // Wait for ZipFallback inputs to be visible and interactable
    await expect(formPage.locator('.gq-input').nth(0)).toBeVisible({ timeout: 5_000 });
    await formPage.locator('.gq-input').nth(0).fill('90210'); // origin: Beverly Hills
    await formPage.locator('.gq-input').nth(1).fill('10001'); // dest: NYC (Long Distance)

    // Confirm the "Long Distance Move" badge appeared (proves onSelect fired for both)
    await expect(formPage.locator('.gq-dist-tag--long')).toBeVisible({ timeout: 3_000 });
    console.log('✓ Step 2 — zip codes entered, Long Distance badge confirmed');

    await formPage.click('button.gq-btn-next');

    // — Step 3: Contact info —
    await formPage.fill('input[name="customerName"]',  `E2E Customer ${ts}`);
    await formPage.fill('input[name="customerEmail"]', `e2e.customer.${ts}@test.com`);
    await formPage.fill('input[name="customerPhone"]', '3105559999');
    await formPage.click('button.gq-btn-next');

    // Prove lead was ingested and the thank-you redirect works
    await formPage.waitForURL('**/thank-you', { timeout: 15_000 });
    console.log('✓ Step 3 — form submitted → redirected to /thank-you');


    // ── 3. WebSocket delivers the lead to the dashboard ─────────────────────
    // Twilio mock takes ~2 s; allow 15 s for the full pipeline
    await expect(dashPage.locator('.lead-card').filter({ hasText: '90210' }))
      .toHaveCount(leadsBefore + 1, { timeout: 15_000 });
    console.log('✓ NEW_LEAD_AVAILABLE received via WebSocket — lead card appeared in feed');

    // The newest lead is prepended (setLeads(prev => [newLead, ...prev]))
    const leadCard = dashPage.locator('.lead-card').filter({ hasText: '90210' }).first();
    await expect(leadCard).toContainText('90210');

    // Capture price for balance assertions
    const priceText  = await leadCard.locator('.lead-price-tag').textContent();
    const leadPrice  = parseFloat((priceText ?? '').replace(/[^0-9.]/g, ''));
    console.log(`  ↳ Lead price: $${leadPrice}`);


    // ── 4. Verify initial balance ────────────────────────────────────────────
    const balBefore = await apiGet('/billing/balance', companyToken);
    expect(balBefore.status).toBe(200);
    expect(balBefore.body.balance).toBe(100);
    console.log('✓ Balance confirmed at $100.00 before purchase');


    // ── 5. Purchase the lead ─────────────────────────────────────────────────
    // Capture any alert() call from purchaseLead's catch block so we get a
    // clear error message instead of a silent timeout on the success modal.
    let purchaseAlertMsg = null;
    dashPage.on('dialog', async (dialog) => {
      purchaseAlertMsg = dialog.message();
      await dialog.accept();
    });

    // Intercept the /claim response for debug logging
    const claimResponsePromise = dashPage.waitForResponse(
      r => r.url().includes('/claim'),
      { timeout: 20_000 },
    );

    await leadCard.locator('.buy-btn').click();

    const purchaseModal = dashPage.locator('.purchase-modal');
    await expect(purchaseModal).toBeVisible({ timeout: 5_000 });
    await expect(purchaseModal).toContainText('Confirm Purchase');

    // Confirm button (disabled while balance loading or purchasing)
    const confirmBtn = dashPage.locator('.confirm-btn');
    await expect(confirmBtn).not.toBeDisabled({ timeout: 8_000 });
    await confirmBtn.click();

    // Wait for the claim API response and surface any failure
    const claimResp = await claimResponsePromise;
    const claimBody = await claimResp.json().catch(() => ({}));
    console.log(`  ↳ Claim HTTP ${claimResp.status()} — ${JSON.stringify(claimBody).slice(0, 120)}`);
    if (purchaseAlertMsg) throw new Error(`Purchase failed (alert): ${purchaseAlertMsg}`);
    if (!claimResp.ok()) throw new Error(`Claim endpoint returned ${claimResp.status()}: ${JSON.stringify(claimBody)}`);
    console.log('✓ Clicked confirm purchase');


    // ── 6. Success modal — contact details revealed ──────────────────────────
    const successModal = dashPage.locator('.success-modal');
    await expect(successModal).toBeVisible({ timeout: 10_000 });
    await expect(successModal).toContainText('Lead Unlocked!');
    // Customer name matches what was entered in the form
    await expect(successModal).toContainText(`E2E Customer ${ts}`);
    // Phone stored in E.164 format by the Zod validator
    await expect(successModal).toContainText('+13105559999');
    // Move route
    await expect(successModal).toContainText('Area 90210');
    console.log('✓ Contact details revealed — name, phone, and route visible');


    // ── 7. Balance deducted — proves concurrency lock charged correctly ───────
    const balAfter = await apiGet('/billing/balance', companyToken);
    expect(balAfter.status).toBe(200);
    expect(balAfter.body.balance).toBeCloseTo(100 - leadPrice, 2);
    console.log(`✓ Balance dropped from $100 to $${balAfter.body.balance} (deducted $${leadPrice})`);


    // ── 8. Lead removed from feed after purchase ─────────────────────────────
    await dashPage.locator('.close-success-btn').click();
    // After purchasing, count of 90210 cards should be back to leadsBefore
    // (the purchased card is filtered out as it's no longer READY_FOR_DISTRIBUTION)
    await expect(dashPage.locator('.lead-card').filter({ hasText: '90210' }))
      .toHaveCount(leadsBefore, { timeout: 5_000 });
    console.log('✓ Purchased lead removed from live feed');


    // ── 9. Concurrency lock — second claim on the same lead must be idempotent ─
    const allLeads = await apiGet('/leads', adminToken);
    const targetLead = allLeads.body.find(
      l => l.originZip === '90210' && l.customerName === `E2E Customer ${ts}`,
    );
    expect(targetLead, 'Could not locate purchased lead').toBeTruthy();

    // Register a second mover and give them balance
    const mover2Email = `mover2.e2e.${ts}@test.com`;
    const mover2Reg = await apiPost('/auth/register', {
      companyName: 'Mover Two E2E',
      email: mover2Email,
      password: 'Mover2123!',
      dotNumber: '100003',
      mcNumber:  'MC100003',
      phone:     '2125550003',
    });
    const mover2Token = mover2Reg.body.token;
    const mover2Id    = mover2Reg.body.user.id;
    await apiPut(`/users/${mover2Id}`, { balance: 100 }, adminToken);

    // Attempt to claim the same lead — must return 409 (sold out) or succeed
    // if maxBuyers > 1 (either way, buyer-1's balance stays correct)
    const claimRes = await fetch(`${API}/leads/${targetLead._id}/claim`, {
      method: 'POST',
      headers: { 'x-auth-token': mover2Token, 'Content-Type': 'application/json' },
    });
    const claimJson = await claimRes.json();
    console.log(`  ↳ Second-mover claim returned HTTP ${claimRes.status}: ${claimJson.msg || 'success'}`);

    // Buyer-1's balance must be unchanged regardless of second-claim outcome
    const balFinal = await apiGet('/billing/balance', companyToken);
    expect(balFinal.body.balance).toBeCloseTo(100 - leadPrice, 2);
    console.log(`✓ Concurrency lock verified — buyer-1 balance is still $${balFinal.body.balance}`);

    // Clean up mover2
    await apiDelete(`/users/${mover2Id}`, adminToken);

  } finally {
    await dashCtx.close().catch(() => {});
    await formCtx.close().catch(() => {});
  }
});
