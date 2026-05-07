const { test, expect } = require('@playwright/test');

test.describe('/partners landing page', () => {
  test('renders for a guest visitor with the expected hero, offer bar, and HLOC', async ({ page }) => {
    await page.goto('/partners');

    await expect(page.locator('h1')).toContainText('Stop paying for move requests');

    await expect(page.locator('.offer-bar')).toBeVisible();

    await expect(page.getByRole('button', { name: /See live move requests/i }).first()).toBeVisible();

    await expect(page.locator('.hloc-route')).toContainText('Dallas, TX');
    await expect(page.locator('.hloc-route')).toContainText('Austin, TX');

    await expect(page).toHaveTitle(/MoveLeads — Buy verified moving leads/);
  });

  test('guest hero CTA navigates to /register', async ({ page }) => {
    await page.goto('/partners');
    await page.getByRole('button', { name: /See live move requests/i }).first().click();
    await expect(page).toHaveURL(/\/register$/);
  });

  test('Partner login link navigates to /login', async ({ page }) => {
    await page.goto('/partners');
    await page.getByRole('link', { name: /Partner login/i }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
