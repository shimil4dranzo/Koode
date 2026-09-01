import { expect, test, type Page } from '@playwright/test';
import { clearSmsLog, readClaimToken, readOtpCode } from './sms-log.ts';

/**
 * The claim flow, end to end.
 *
 * This is the path the brief singles out, and rightly: it is where Koode
 * handles a third party's personal data, submitted without them present.
 * Every assertion below corresponds to a promise made in Section 6 and
 * repeated to the user on screen.
 *
 * Requires a seeded database, a running app, and the console SMS provider
 * writing to SMS_LOG_FILE:
 *
 *   docker compose up -d
 *   npm run db:deploy && npm run db:seed
 *   SMS_LOG_FILE=/tmp/koode-e2e-sms.log ALLOW_RECOMMENDING_NON_USERS=true npm run test:e2e
 *
 * Tests run in declaration order and share state on purpose: the flow IS the
 * subject under test, and asserting each step against a freshly fabricated
 * database row would test the fixtures rather than the journey.
 */

const REFERRER_PHONE = '9846000001'; // seeded, verified KVVES member
const SUBJECT_PHONE = '9847333221'; // a stranger to Koode
const SUBJECT_NAME = 'ടെസ്റ്റ് ഉദ്യോഗാർത്ഥി';
const NOTE = 'നല്ല പണിക്കാരൻ, സമയത്ത് വരും, വിശ്വസിക്കാം';

test.describe.configure({ mode: 'serial' });

async function signIn(page: Page, phone: string): Promise<void> {
  await page.goto('/ml/sign-in');
  await page.getByLabel('മൊബൈൽ നമ്പർ').fill(phone);
  await page.getByRole('button', { name: 'കോഡ് അയക്കുക' }).click();

  const code = await readOtpCode(phone);
  await page.getByLabel('ആറക്ക കോഡ്').fill(code);
  await page.getByRole('button', { name: 'പരിശോധിക്കുക' }).click();

  await expect(page).not.toHaveURL(/sign-in/);
}

async function submitRecommendation(page: Page, note: string): Promise<void> {
  await page.goto('/ml/recommend');
  await page.getByLabel('അവരുടെ മൊബൈൽ നമ്പർ').fill(SUBJECT_PHONE);
  await page.getByLabel('അവരുടെ പേര്').fill(SUBJECT_NAME);
  await page.getByLabel('അവരെ എങ്ങനെ അറിയാം?').selectOption('employed_them');
  await page.getByLabel('അവരെക്കുറിച്ച് എന്ത് പറയും?').fill(note);
  await page.getByRole('button', { name: 'ശുപാർശ രേഖപ്പെടുത്തുക' }).click();
}

test.describe('claim flow', () => {
  test.beforeAll(async () => {
    await clearSmsLog();
  });

  test('a recommended stranger is not visible to anyone', async ({ page }) => {
    await signIn(page, REFERRER_PHONE);
    await submitRecommendation(page, NOTE);

    await expect(page.getByText(/സന്ദേശം അയച്ചിട്ടുണ്ട്/)).toBeVisible();

    // The core promise: nothing about them is shown until they agree.
    await page.goto('/ml/openings');
    await expect(page.getByText(SUBJECT_NAME)).toHaveCount(0);
  });

  test('the claim page shows who recommended them and what was written', async ({ page }) => {
    const token = await readClaimToken(SUBJECT_PHONE);
    await page.goto(`/ml/claim/${token}`);

    // Informed consent means seeing the actual words before deciding.
    await expect(page.getByText(NOTE)).toBeVisible();
    await expect(page.getByText('അബ്ദുൽ റഹ്‌മാൻ')).toBeVisible();
  });

  test('refusing is no harder than accepting', async ({ page }) => {
    const token = await readClaimToken(SUBJECT_PHONE);
    await page.goto(`/ml/claim/${token}`);

    const accept = page.getByRole('button', { name: 'അതെ, എന്റെ പ്രൊഫൈൽ ചേർക്കുക' });
    const reject = page.getByRole('button', { name: 'വേണ്ട, എന്റെ വിവരങ്ങൾ നീക്കുക' });

    await expect(accept).toBeVisible();
    await expect(reject).toBeVisible();

    // Both are full-width buttons on the same screen. If refusal ever gets
    // demoted to a small link, this fails — which is the point.
    const acceptBox = await accept.boundingBox();
    const rejectBox = await reject.boundingBox();
    expect(rejectBox?.width).toBeCloseTo(acceptBox?.width ?? 0, 0);
    expect(rejectBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test('the full phone number never appears on the claim page', async ({ page }) => {
    const token = await readClaimToken(SUBJECT_PHONE);
    await page.goto(`/ml/claim/${token}`);

    // A forwarded link must not disclose the number to whoever received it.
    await expect(page.getByText(SUBJECT_PHONE)).toHaveCount(0);
    await expect(page.getByText(/••••/)).toBeVisible();
  });

  test('an invalid token explains itself instead of 404ing', async ({ page }) => {
    await page.goto('/ml/claim/definitely-not-a-real-token-000000');
    await expect(page.getByText(/ലിങ്ക് ശരിയല്ല|സമയം കഴിഞ്ഞു/)).toBeVisible();
  });

  test('rejecting removes the details and blocks that referrer', async ({ page }) => {
    const token = await readClaimToken(SUBJECT_PHONE);
    await page.goto(`/ml/claim/${token}`);

    await page.getByRole('button', { name: 'വേണ്ട, എന്റെ വിവരങ്ങൾ നീക്കുക' }).click();

    const code = await readOtpCode(SUBJECT_PHONE);
    await page.getByLabel('ആറക്ക കോഡ്').fill(code);
    await page.getByRole('button', { name: 'വേണ്ട, എന്റെ വിവരങ്ങൾ നീക്കുക' }).click();

    await expect(page.getByText(/വിവരങ്ങൾ നീക്കി/)).toBeVisible();

    // And the same referrer cannot put them back.
    await signIn(page, REFERRER_PHONE);
    await submitRecommendation(page, 'വീണ്ടും ചേർക്കാൻ ശ്രമിക്കുന്നു, ഇത് തടയണം');

    await expect(page.getByText(/ശുപാർശ ചെയ്യേണ്ടെന്ന്/)).toBeVisible();
  });
});
