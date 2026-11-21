import { expect, test } from "@playwright/test";

test("onboarding guide renders at a bounded size and preserves the two-step form", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/test-ui/?view=onboarding");
  const brand = page.getByTestId("brand-lockup");
  await expect(brand.locator("p").first()).toHaveText("GANITA.ai");
  await expect(brand.locator("p").last()).toHaveText("count right. grow bright");
  await expect(page.locator("aside svg")).toHaveCount(0);
  await expect(page.getByText("Persiapan pertama hanya beberapa menit.", { exact: true })).toBeVisible();
  const guide = page.getByAltText("Ganita duduk sambil mengedip, membawa checklist dan menunjuk ke formulir");
  await expect(guide).toBeVisible();
  await expect.poll(() => guide.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const bounds = await guide.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.width).toBeGreaterThanOrEqual(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("onboarding-guide.png"), fullPage: true });
  await page.getByLabel("Nama kamu").fill("Pengguna Uji");
  await page.getByLabel("Nama bisnis / brand").fill("Restoran Uji");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByLabel("Alamat outlet")).toHaveCount(0);
  await page.getByRole("radio", { name: "Tambah outlet manual" }).check();
  await expect(page.getByLabel("Alamat outlet")).toBeVisible();
  await expect(guide).toBeVisible();
  await page.getByRole("button", { name: "Kembali", exact: true }).click();
  await expect(page.getByLabel("Nama kamu")).toHaveValue("Pengguna Uji");
  expect(errors).toEqual([]);
});

test("onboarding submits canonical values and keeps entries after a save failure", async ({ page }) => {
  const submissions: Record<string, string>[] = [];
  await page.route("**/api/onboarding", async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill(submissions.length === 1
      ? { status: 400, json: { error: "Periksa kembali: Zona waktu. Nilai belum sesuai." } }
      : { status: 200, json: { ok: true } });
  });
  await page.route("**/dashboard?onboarding=complete", route => route.fulfill({ contentType: "text/html", body: "<h1>Test workspace</h1>" }));
  await page.goto("/test-ui/?view=onboarding");
  await page.getByLabel("Nama kamu").fill("Pemilik Uji");
  await page.getByLabel("Nama bisnis / brand").fill("Restoran Uji");
  await expect(page.getByLabel("Zona waktu")).toHaveValue("Asia/Jakarta");
  await expect(page.getByLabel("Mata uang")).toHaveValue("IDR");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("radio", { name: "Tambah outlet manual" }).check();
  await page.getByLabel("Nama outlet").fill("Outlet Pertama");
  await page.getByLabel("Alamat outlet").fill("Jalan Uji 10");
  await page.getByLabel("Kota", { exact: true }).fill("Jakarta Timur");
  await expect(page.getByLabel("Kode outlet")).toHaveAttribute("required", "");
  await page.getByLabel("Kode outlet").fill("TEST-01");
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page.getByRole("alert")).toContainText("Zona waktu");
  await expect(page.getByLabel("Alamat outlet")).toHaveValue("Jalan Uji 10");
  await expect(page.getByLabel("Kode outlet")).toHaveValue("TEST-01");
  expect(submissions[0]).toMatchObject({ timezone: "Asia/Jakarta", currency: "IDR", outletCode: "TEST-01", businessType: "Restoran" });
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard\?onboarding=complete$/);
  expect(submissions[1]).toEqual(submissions[0]);
});

test("POS onboarding saves no manual outlet, creates a named API key, and can enter dashboard before sync", async ({ page }, testInfo) => {
  const submissions: Record<string, string>[] = [];
  let created = false;
  await page.route("**/api/onboarding", async route => {
    submissions.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/integrations/api-keys", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON().name).toBe("POS Restoran Uji");
      created = true;
      return route.fulfill({ status: 201, json: { data: { id: "key", secret: crypto.randomUUID(), dataSourceId: "source" } } });
    }
    return route.fulfill({ json: { data: created ? [{ id: "key", name: "POS Restoran Uji", keyPrefix: "test", scopes: [], revokedAt: null, dataSourceId: "source" }] : [] } });
  });
  await page.route("**/dashboard?onboarding=complete", route => route.fulfill({ contentType: "text/html", body: "<h1>Test workspace</h1>" }));
  await page.goto("/test-ui/?view=onboarding");
  await page.getByLabel("Nama kamu").fill("Pemilik Uji");
  await page.getByLabel("Nama bisnis / brand").fill("Bisnis ERP");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await expect(page.getByRole("button", { name: "Masuk ke dashboard" })).toBeDisabled();
  await expect(page.getByText(/CSV/)).toHaveCount(0);
  await page.getByRole("radio", { name: "Hubungkan POS/ERP" }).check();
  await expect(page.getByLabel("Nama outlet")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("start-options.png"), fullPage: true });
  await page.getByRole("button", { name: "Siapkan koneksi" }).click();
  await expect(page.getByRole("status")).toContainText("Profil bisnis tersimpan");
  expect(submissions[0]).toMatchObject({ mode: "integration", companyName: "Bisnis ERP" });
  await page.getByLabel("Nama API key").fill("POS Restoran Uji");
  await page.getByRole("button", { name: "Buat API key" }).click();
  await expect(page.getByText("test-only-secret", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dokumentasi API" })).toHaveAttribute("href", "/docs/api");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("onboarding-api-key.png"), fullPage: true });
  await page.getByRole("button", { name: "Masuk ke dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard\?onboarding=complete$/);
});

test("an outlet-free dashboard shows pending sync without sample metrics", async ({ page }) => {
  await page.route("**/api/integrations/api-keys", route => route.fulfill({ json: { data: [{ revokedAt: null }] } }));
  await page.goto("/test-ui/?empty=1");
  await expect(page.getByRole("heading", { name: "Menunggu outlet dari POS/ERP" })).toBeVisible();
  await expect(page.getByText("Penjualan bersih", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Skor kesehatan", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tambah outlet manual", exact: true })).toBeVisible();
});
