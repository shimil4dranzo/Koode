/* eslint-disable no-console */
/**
 * Walk both workflows against a running server, the way a person would.
 *
 *   npm run dev -- -p 3100        (in another terminal)
 *   npm run e2e:workflows
 *
 * Seeker: read an opening signed out → "Create a profile and apply" → sign-up
 * with the seeker role preselected → back to that opening → one-tap apply →
 * onboarding → dashboard (completeness, application status) → ask a college
 * to verify → pending shown.
 *
 * Employer: sign in as the seeded shop owner → dashboard with candidate counts
 * → candidates for the billing job → skills match flagged → contact reveal
 * offered only for the shortlisted candidate, and shown after one tap →
 * office-bearer verification screen → the graduate's public profile shows her
 * qualification and a "Vouch for this person" door → recommend form fixed to
 * her, with no phone field.
 *
 * Every signed-in page it visits is also measured for text contrast with the
 * same expression `npm run audit:contrast` uses, because that audit can only
 * see signed-out routes.
 *
 * Creates one throwaway seeker account per run (seeker-<timestamp>@example.com)
 * in the local development database. Not for production.
 */
import pkg from '@playwright/test';
const { chromium } = pkg;
const BASE = 'http://localhost:3100';
const stamp = Date.now();
const seekerEmail = `seeker-${stamp}@example.com`;
const b = await chromium.launch();
import { readFileSync } from 'node:fs';
const auditSrc = readFileSync('scripts/audit-contrast-runtime.ts', 'utf8');
const COLLECT = auditSrc.slice(auditSrc.indexOf('const COLLECT_FINDINGS = `') + 'const COLLECT_FINDINGS = `'.length, auditSrc.indexOf('})()`;') + 4);
const contrast = async (p, label) => { await p.evaluate(() => { document.querySelectorAll('[data-reveal]').forEach((e) => { e.dataset.revealState = 'in'; }); }); await p.waitForTimeout(700); const f = await p.evaluate(COLLECT); ok(`contrast clean: ${label}`, f.length === 0, f.length ? JSON.stringify(f.slice(0,3)) : ''); };
const appears = async (loc, ms = 6000) => { try { await loc.first().waitFor({ state: 'visible', timeout: ms }); return true; } catch { return false; } };
const ok = (label, cond, extra = '') => console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? '  — ' + extra : ''}`);

// ---------------------------------------------------------------- SEEKER
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  console.log('\n=== SEEKER WORKFLOW ===');

  // 1. Signed-out visitor reads an opening and taps apply → seeker sign-up with next
  await p.goto(`${BASE}/en/openings`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: 'Billing staff needed' }).first().click();
  await p.waitForURL(/\/openings\/[a-z0-9]{20,}$/, { timeout: 15000 });
  await p.waitForLoadState('networkidle');
  const openingUrl = p.url();
  const apply = p.getByRole('link', { name: 'Create a profile and apply' });
  const applyCount = await apply.count();
  ok('signed-out opening shows "Create a profile and apply"', applyCount === 1, `count=${applyCount} url=${p.url()}`);
  await apply.first().click();
  await p.waitForURL(/\/sign-in\?/, { timeout: 15000 });
  await p.waitForLoadState('networkidle');
  const seekerRadio = p.getByRole('radio', { name: /Looking for work/ });
  const radioCount = await seekerRadio.count();
  const checked = radioCount > 0 ? await seekerRadio.first().isChecked() : false;
  ok('lands on sign-up with seeker preselected', /mode=register/.test(p.url()) && checked, `url=${p.url()} radios=${radioCount} checked=${checked}`);

  // 2. Register
  await p.getByLabel('Your name').fill('Test Seeker');
  await p.getByLabel('E-mail').fill(seekerEmail);
  await p.getByRole('textbox', { name: 'Password' }).fill('koode1234');
  await p.getByRole('button', { name: /I understand and agree/ }).click();
  await p.waitForURL(/\/openings\//, { timeout: 15000 }).catch(() => {});
  ok('returned to the opening after sign-up (next honoured)', p.url().startsWith(openingUrl), p.url());

  // 3. One-tap apply
  const interested = p.getByRole('button', { name: 'I am interested' });
  ok('signed-in seeker sees one-tap apply', await interested.count() === 1);
  await interested.click();
  await p.waitForTimeout(800);
  ok('application recorded', await p.getByText('Your interest has been sent.').count() === 1);

  // 4. Onboarding
  await p.goto(`${BASE}/en/profile/onboarding`, { waitUntil: 'networkidle' });
  await contrast(p, 'seeker onboarding');
  ok('onboarding page for a seeker', await p.getByRole('heading', { name: 'Set up your profile' }).count() === 1);
  await p.getByLabel('One line about your work').fill('B.Com graduate, billing and Tally');
  await p.getByLabel('Highest qualification').fill('B.Com 2024');
  await p.getByRole('button', { name: 'Save', exact: true }).click();
  await p.waitForURL(/onboarding\?(saved|invalid)=1/, { timeout: 15000 }).catch(() => {});
  await p.waitForLoadState('networkidle');
  const alertText = await p.locator('[role="alert"]').allTextContents();
  ok('basics saved', await p.getByText('Profile saved.').count() === 1, `url=${p.url()} alerts=${JSON.stringify(alertText)}`);

  // 5. Dashboard: completeness, verification, applications
  await p.goto(`${BASE}/en/profile`, { waitUntil: 'networkidle' });
  await contrast(p, 'seeker dashboard');
  ok('seeker dashboard heading', await p.getByRole('heading', { name: 'Your work' }).count() === 1);
  ok('completeness names what is missing', await p.getByText(/Add: .*work type/).count() === 1);
  ok('application listed with status', await p.getByText('Billing staff needed').count() >= 1 && await p.getByText('Applied').count() >= 1);
  const orgSelect = p.getByLabel('Who can confirm your profile?');
  ok('verification request form present', await orgSelect.count() === 1);
  const optionIndex = await orgSelect.locator('option').evaluateAll((opts) => opts.findIndex((o) => /College/.test(o.textContent || '')));
  await orgSelect.selectOption({ index: optionIndex });
  await p.getByLabel('Membership number').fill('REG-2024-117');
  await p.getByRole('button', { name: 'Request verification' }).click();
  await p.waitForTimeout(900);
  ok('verification requested', await p.getByText(/Request sent/).count() === 1);
  await p.reload({ waitUntil: 'networkidle' });
  ok('dashboard shows pending verification', await p.getByText(/Waiting for .*College to confirm/).count() === 1);
  await ctx.close();
}

// -------------------------------------------------------------- EMPLOYER
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  console.log('\n=== EMPLOYER WORKFLOW ===');
  await p.goto(`${BASE}/en/sign-in`, { waitUntil: 'networkidle' });
  await p.getByLabel('E-mail').fill('abdul@example.com');
  await p.getByRole('textbox', { name: 'Password' }).fill('koode1234');
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.waitForURL((u) => !/sign-in/.test(u.toString()), { timeout: 15000 });
  await p.waitForLoadState('networkidle');

  await p.goto(`${BASE}/en/profile`, { waitUntil: 'networkidle' });
  await contrast(p, 'employer dashboard');
  ok('employer dashboard heading', await p.getByRole('heading', { name: 'Your hiring' }).count() === 1);
  ok('nav offers Post work for employers', await p.locator('header nav a', { hasText: 'Post work' }).count() === 1);
  const billingRow = p.locator('li', { hasText: 'Billing staff needed' }).first();
  const countText = (await billingRow.getByRole('link', { name: /candidates?$/ }).textContent())?.trim();
  ok('billing posting shows its candidate count', /^\d+ candidates?$/.test(countText ?? '') && parseInt(countText ?? '0', 10) >= 2, countText);

  // candidates for the billing job
  await p.goto(`${BASE}/en/openings`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: 'Billing staff needed' }).first().click();
  await p.waitForURL(/\/openings\/[a-z0-9]{20,}$/, { timeout: 15000 });
  const id = p.url().split('/').pop();
  await p.goto(`${BASE}/en/openings/${id}/interest`, { waitUntil: 'networkidle' });
  await contrast(p, 'candidates page');
  ok('candidates page lists the graduate', await p.getByText('അഞ്ജു എസ്.').count() >= 1);
  ok('skills match flagged for the graduate', await p.getByText('Skills match').count() >= 1);
  ok('new seeker also listed as applied', await p.getByText('Test Seeker').count() >= 1);

  // reveal contact for the shortlisted graduate
  const reveal = p.getByRole('button', { name: 'Show contact details' });
  ok('reveal offered only for the shortlisted candidate', await reveal.count() === 1);
  ok('unshortlisted candidate told what unlocks contact', await p.getByText('Shortlist to see contact details.').count() >= 1);
  await reveal.click();
  await p.waitForTimeout(900);
  ok('contact shown after reveal', await p.getByText('+919846000005').count() === 1);

  // office-bearer verification screen reachable
  await p.goto(`${BASE}/en/admin/members`, { waitUntil: 'networkidle' });
  ok('office-bearer can reach the verification screen', !/sign-in/.test(p.url()) && await p.getByText(/Member verification|Membership/).count() >= 1);

  // vouch for the graduate by profile
  await p.goto(`${BASE}/en/openings/${id}/interest`, { waitUntil: 'networkidle' });
  await p.getByRole('link', { name: 'അഞ്ജു എസ്.' }).first().click();
  await p.waitForLoadState('networkidle');
  ok('public profile shows education', await appears(p.getByText(/Highest qualification/)));
  const vouch = p.getByRole('link', { name: 'Vouch for this person' });
  ok('vouch CTA on profile', await appears(vouch));
  await vouch.click();
  await p.waitForLoadState('networkidle');
  await contrast(p, 'recommend form');
  ok('recommend form fixed to the person, no phone field', await p.getByText('Recommending അഞ്ജു എസ്.').count() === 1 && await p.getByLabel('Their mobile number').count() === 0);
  await ctx.close();
}
await b.close();
