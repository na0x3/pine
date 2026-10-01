import { test, expect } from '@playwright/test';

test('analyst investigates, reviews evidence, decides, and exports', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('alex@northstar.demo');
  await page.getByLabel('Password').fill('DemoPass123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/alerts$/);
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await page.getByRole('link', { name: 'ALT-01042' }).click();
  await expect(page.getByText('Maya Torres').first()).toBeVisible();
  await page.getByRole('button', { name: /Run synthetic analysis|Investigate with AI/ }).click();
  await expect(page.getByText('Investigation saved as a new version.')).toBeVisible();
  await expect(page.getByText('Investigation analysis')).toBeVisible();
  await page.locator('.factor').first().click();
  await expect(page.getByText('Supporting evidence')).toBeVisible();
  await page.getByLabel('ANALYST NOTE · REQUIRED').fill('Requested the invoice and source of funds documentation.');
  await page.getByRole('button', { name: 'Record decision' }).click();
  await expect(page.getByText('Decision recorded in the audit log.')).toBeVisible();
  await expect(page.getByText('Requested the invoice and source of funds documentation.')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'PDF report' }).click();
  expect((await download).suggestedFilename()).toContain('ALT-01042');
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByText('AI RECOMMENDATION AGREEMENT')).toBeVisible();
});
