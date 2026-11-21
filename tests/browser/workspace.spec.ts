import { randomBytes as createTestBytes } from "node:crypto";
const testCredential1 = createTestBytes(32).toString("hex");
import { test, expect, type Page } from "@playwright/test";
async function menu(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Buka menu", exact: true }).isVisible()) await page.getByRole("button", { name: "Buka menu", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).first().click();
}
test.beforeEach(async ({ page }) => {
  const profile = { name: "Restaurant test", businessType: "Kafe", timezone: "Asia/Jakarta", currency: "IDR", settings: { targets: { foodCost: "32", margin: "24", waste: "5", stockDays: "4" } } };
  const outlets = [{ id: "test-a", brandId: "brand", name: "Outlet Uji A", code: "A", address: "Demo Street", city: "Bogor", country: "Indonesia", timezone: "Asia/Jakarta", status: "ACTIVE" }];
  const products = [{ id: "p", name: "Salmon Roll", sellingPrice: "45000", estimatedCost: null, active: true, brandId: "brand" }];
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname.replace("/api/workspace/", "");
    const body = request.method() === "GET" ? null : request.postDataJSON();
    let data: unknown = [];
    if (path === "organizations/current") { if (body) Object.assign(profile, body); data = profile; }
    if (path === "brands") data = [{ id: "brand", name: "Ganita Test" }];
    if (path === "outlets") { if (body) outlets.push({ ...body, id: "new-outlet" }); data = body ? outlets.at(-1) : outlets; }
    if (path === "team") data = { role: "OWNER", members: [{ role: "OWNER", user: { id: "owner", name: "Owner test", email: "owner@example.com" } }], invitations: [] };
    if (path === "products") data = products;
    if (path === "ingredients") data = [{ id: "i", name: "Salmon", unit: "kg", currentCost: "80000" }];
    if (path === "products/p/recipe") { products[0].estimatedCost = "8000" as never; data = { product: products[0] }; }
    if (path === "assistant" && body) return route.fulfill({ status: 503, json: { error: { message: "Asisten AI belum diaktifkan." } } });
    await route.fulfill({ json: { data } });
  });
  await page.goto("/test-ui/");
});
test("settings form saves, errors stay visible, and outlet dialog persists location", async ({ page }, testInfo) => {
  await menu(page, "Pengaturan");
  await expect(page.getByLabel("Jenis usaha")).toHaveValue("Kafe");
  await page.getByLabel("Nama perusahaan").fill("Updated company");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Perubahan tersimpan.");
  await page.route("**/api/workspace/organizations/current", route => route.fulfill({ status: 403, json: { error: { message: "Akses ditolak untuk pengujian." } } }));
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Akses ditolak untuk pengujian.");
  await page.unroute("**/api/workspace/organizations/current");
  await page.getByRole("button", { name: "Tambah outlet", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Detail outlet" });
  await dialog.getByLabel("Nama outlet").fill("New branch"); await dialog.getByLabel("Kode outlet").fill("NEW");
  await dialog.getByLabel("Alamat", { exact: true }).fill("Jalan Baru 10"); await dialog.getByLabel("Kota", { exact: true }).fill("Bandung");
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("article", { name: "New branch", exact: true }).locator("summary").click();
  await expect(page.getByText("Jalan Baru 10, Bandung, Indonesia", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("settings.png"), fullPage: true });
});
test("recipe form submits quantities, then shows recomputed HPP", async ({ page }, testInfo) => {
  await menu(page, "Menu & Resep"); await page.getByRole("button", { name: "Resep", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Bahan", exact: true }).selectOption("i");
  await dialog.getByLabel("Jumlah", { exact: true }).fill("100");
  await dialog.getByRole("combobox", { name: "Satuan", exact: true }).selectOption("g");
  const request = page.waitForRequest(r => r.url().endsWith("/products/p/recipe"));
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  expect((await request).postDataJSON().items).toEqual([{ ingredientId: "i", quantity: 100, unit: "g" }]);
  await expect(page.getByRole("cell", { name: "8.000", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("menu.png"), fullPage: true });
});
test("outlet menu saves weekly hours and remaps an empty duplicate explicitly", async ({ page }, testInfo) => {
  const source = { id: "source-erp", name: "Restaurant ERP" };
  const link = { id: "mapping-1", dataSourceId: source.id, externalOutletId: "151", dataSource: source };
  let rows: Array<Record<string, any>> = [
    { id: "main", brandId: "brand", name: "JTown Ganita", code: "DEMO-B", timezone: "Asia/Jakarta", status: "ACTIVE", dataSourceLinks: [], openingHours: [], address: null, city: null, country: null, phone: null, email: null, notes: null },
    { id: "imported", brandId: "brand", name: "Jatinegara ERP", code: "OUTLET-151", timezone: "Asia/Jakarta", status: "ACTIVE", dataSourceLinks: [link] },
  ];
  await page.route("**/api/workspace/data-sources", route => route.fulfill({ json: { data: [source] } }));
  await page.route("**/api/workspace/outlets", route => route.fulfill({ json: { data: rows } }));
  await page.route("**/api/workspace/outlets/main", async route => {
    if (route.request().method() === "DELETE") return route.fulfill({ status: 409, json: { error: { message: "Outlet masih terhubung ke sistem asal." } } });
    const body = route.request().postDataJSON();
    expect(body.email).toBe(""); expect(body.address).toBe("");
    Object.assign(rows[0], body);
    await route.fulfill({ json: { data: rows[0] } });
  });
  await page.route("**/api/workspace/data-sources/source-erp/mappings", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: [{ ...link, outletId: "imported", outlet: { name: "Jatinegara ERP", code: "OUTLET-151" } }] } });
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ externalOutletId: "151", outletId: "main", previousOutletId: "imported", deleteEmptyOutlet: true });
    rows = [{ ...rows[0], dataSourceLinks: [link] }];
    await route.fulfill({ json: { data: { ...link, outletId: "main" } } });
  });
  await menu(page, "Outlet");
  await expect(page.getByRole("heading", { name: "Outlet", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("outlet-list.png"), fullPage: true });
  await page.getByRole("button", { name: "Edit outlet JTown Ganita", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Detail outlet" });
  await dialog.getByLabel("Telepon", { exact: true }).fill("02112345");
  await dialog.getByLabel("Catatan outlet", { exact: true }).fill("Lantai 2");
  await dialog.getByLabel("Jam operasional mingguan", { exact: true }).check();
  await dialog.getByLabel("Senin jam buka", { exact: true }).fill("10:00");
  await dialog.getByLabel("Senin jam tutup", { exact: true }).fill("02:00");
  await dialog.getByLabel("Minggu status", { exact: true }).selectOption("closed");
  await page.screenshot({ path: testInfo.outputPath("outlet-editor.png") });
  await dialog.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(rows[0].openingHours[0]).toMatchObject({ day: 0, mode: "open", open: "10:00", close: "02:00" });
  await page.reload(); await menu(page, "Outlet");
  await expect(page.getByText("02112345", { exact: true })).not.toBeVisible();
  await page.getByRole("article", { name: "JTown Ganita", exact: true }).locator("summary").click();
  await expect(page.getByText("02112345", { exact: true })).toBeVisible();
  await expect(page.getByText("10:00 - 02:00 (+1 hari)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hubungkan outlet JTown Ganita", exact: true }).click();
  const mapping = page.getByRole("dialog", { name: "Hubungkan outlet", exact: true });
  await expect(mapping.getByRole("textbox", { name: "ID outlet di sistem asal" })).toHaveCount(0);
  await expect(mapping.getByRole("button", { name: "Simpan koneksi", exact: true })).toBeDisabled();
  await mapping.getByRole("combobox", { name: "Outlet dari sistem asal", exact: true }).selectOption("151");
  await expect(mapping.getByRole("combobox", { name: "Outlet Ganita tujuan", exact: true })).toHaveValue("main");
  await mapping.getByRole("checkbox", { name: /Hapus outlet duplikat/ }).check();
  await page.screenshot({ path: testInfo.outputPath("outlet-mapping.png") });
  await mapping.getByRole("button", { name: "Simpan koneksi", exact: true }).click();
  await expect(mapping).not.toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article", { name: "JTown Ganita", exact: true })).toContainText("Restaurant ERP");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Hapus outlet JTown Ganita", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Outlet masih terhubung ke sistem asal.");
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("article", { name: "JTown Ganita", exact: true }).locator("summary").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("outlets.png"), fullPage: true });
  await page.getByRole("combobox", { name: "Pilih bahasa" }).selectOption("en");
  await expect(page.getByRole("heading", { name: "Outlets", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add outlet", exact: true })).toBeVisible();
});
test("outlet reader cannot see editing or deletion controls", async ({ page }) => {
  await page.route("**/api/workspace/team", route => route.fulfill({ json: { data: { role: "VIEWER", members: [], invitations: [] } } }));
  await menu(page, "Outlet");
  await expect(page.getByRole("article", { name: "Outlet Uji A", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tambah outlet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit outlet|Hapus outlet|Hubungkan outlet/ })).toHaveCount(0);
});
test("connected outlet preselects its mapping and preserves selection on history rejection", async ({ page }) => {
  const source = { id: "source-erp", name: "Restaurant ERP" };
  const link = { id: "mapping-1", dataSourceId: source.id, externalOutletId: "151", dataSource: source };
  const rows = [{ id: "imported", name: "Jatinegara ERP", code: "OUTLET-151", status: "ACTIVE", dataSourceLinks: [link] }, { id: "main", name: "JTown Ganita", code: "DEMO-B", status: "ACTIVE", dataSourceLinks: [] }];
  await page.route("**/api/workspace/outlets", route => route.fulfill({ json: { data: rows } }));
  await page.route("**/api/workspace/data-sources", route => route.fulfill({ json: { data: [source] } }));
  await page.route("**/api/workspace/data-sources/source-erp/mappings", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: [{ ...link, outletId: "imported", outlet: rows[0] }] } });
    expect(route.request().method()).toBe("PATCH");
    expect(route.request().postDataJSON()).toEqual({ externalOutletId: "151", outletId: "main", previousOutletId: "imported", deleteEmptyOutlet: false });
    return route.fulfill({ status: 409, json: { error: { message: "Outlet memiliki riwayat operasional." } } });
  });
  await menu(page, "Outlet");
  await page.getByRole("button", { name: "Hubungkan outlet Jatinegara ERP", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hubungkan outlet", exact: true });
  await expect(dialog.getByRole("status")).toHaveText("Outlet ini sudah terhubung ke tujuan yang dipilih.");
  await expect(dialog.getByRole("button", { name: "Simpan koneksi", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("combobox", { name: "Outlet dari sistem asal", exact: true })).toHaveValue("151");
  await dialog.getByRole("combobox", { name: "Outlet Ganita tujuan", exact: true }).selectOption("main");
  await dialog.getByRole("button", { name: "Simpan koneksi", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Outlet memiliki riwayat operasional.");
  await expect(dialog.getByRole("combobox", { name: "Outlet Ganita tujuan", exact: true })).toHaveValue("main");
  await dialog.getByRole("button", { name: "Tutup", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
});
test("mapping handles failed discovery, source changes and explicit manual IDs", async ({ page }) => {
  let failed = true, writes = 0;
  await page.route("**/api/workspace/data-sources", route => route.fulfill({ json: { data: [{ id: "a", name: "ERP A" }, { id: "b", name: "ERP B" }] } }));
  await page.route("**/api/workspace/data-sources/a/mappings", route => route.fulfill(failed ? { status: 503, json: { error: { message: "Koneksi sementara gagal." } } } : { json: { data: [{ id: "a1", externalOutletId: "151", outletId: "imported", outlet: { name: "Cabang A", code: "A" } }] } }));
  await page.route("**/api/workspace/data-sources/b/mappings", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { data: [] } });
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ externalOutletId: "new-152", outletId: "test-a" });
    writes++;
    await route.fulfill({ json: { data: { id: "new" } } });
  });
  await menu(page, "Outlet");
  await page.getByRole("button", { name: "Hubungkan outlet Outlet Uji A", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Hubungkan outlet", exact: true });
  await dialog.getByRole("combobox", { name: "Sistem asal", exact: true }).selectOption("a");
  await expect(dialog.getByRole("alert")).toHaveText("Koneksi sementara gagal.");
  await expect(dialog.getByRole("button", { name: "Simpan koneksi", exact: true })).toBeDisabled();
  failed = false; await dialog.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await dialog.getByRole("combobox", { name: "Outlet dari sistem asal", exact: true }).selectOption("151");
  await expect(dialog.getByRole("button", { name: "Simpan koneksi", exact: true })).toBeEnabled();
  await dialog.getByRole("combobox", { name: "Sistem asal", exact: true }).selectOption("b");
  await expect(dialog.getByText("Belum ada outlet yang diterima dari koneksi ini.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Outlet dari sistem asal", exact: true })).toHaveValue("");
  await expect(dialog.getByRole("button", { name: "Simpan koneksi", exact: true })).toBeDisabled();
  await dialog.getByText("Pengaturan lanjutan", { exact: true }).click();
  await dialog.getByRole("checkbox", { name: "Masukkan ID manual untuk outlet yang belum dikirim", exact: true }).check();
  await dialog.getByRole("textbox", { name: "ID outlet di sistem asal", exact: true }).fill("new-152");
  await dialog.getByRole("button", { name: "Simpan koneksi", exact: true }).click();
  await expect(dialog).not.toBeVisible(); expect(writes).toBe(1);
});
test("language survives reload, integration has public docs and no fake connections", async ({ page }) => {
  await menu(page, "Integrasi");
  await expect(page.getByRole("heading", { name: "API key integrasi", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buat API key", exact: true })).toBeVisible();
  await expect(page.getByText("Belum ada API key.", { exact: true })).toBeVisible();
  await expect(page.getByText(/kunci API/i)).toHaveCount(0);
  await page.getByRole("combobox", { name: "Pilih bahasa" }).selectOption("en");
  await page.reload(); await menu(page, "Integrations");
  await expect(page.getByRole("heading", { name: "System Integrations", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "API documentation" })).toHaveAttribute("href", "/docs/api");
  await expect(page.getByText("MokaPOS", { exact: true })).toHaveCount(0);
  await expect(page.getByText("No data sources yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create API key", exact: true })).toBeVisible();
});
test("named API key creates its connection without a separate source form", async ({ page }, testInfo) => {
  let created = false;
  const secret = testCredential1;
  const key = { id: "key-test", name: "Street Sushi ERP", keyPrefix: "ganita_test", scopes: ["master:write", "sales:write"], revokedAt: null, dataSourceId: "source-test" };
  await page.route("**/api/integrations/api-keys", async route => {
    if (route.request().method() === "POST") {
      expect(route.request().postDataJSON()).toEqual({ name: key.name, scopes: key.scopes });
      created = true;
      return route.fulfill({ json: { data: { ...key, secret } } });
    }
    await route.fulfill({ json: { data: created ? [key] : [] } });
  });
  await page.route("**/api/workspace/data-sources", route => route.fulfill({ json: { data: created ? [{ id: "source-test", name: key.name, type: "OTHER", status: "DISCONNECTED", lastSyncAt: null }] : [] } }));
  await menu(page, "Integrasi");
  await expect(page.getByLabel("Nama sumber data", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buat sumber", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buat API key", exact: true })).toBeDisabled();
  await page.getByLabel("Nama API key", { exact: true }).fill("  Street Sushi ERP  ");
  await page.getByRole("button", { name: "Buat API key", exact: true }).click();
  await expect(page.getByText(secret, { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Menunggu data", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pemetaan outlet", exact: true })).toBeVisible();
  await expect(page.getByLabel("Nama API key", { exact: true })).toBeEmpty();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("integrations.png"), fullPage: true });
  await page.reload();
  await menu(page, "Integrasi");
  await expect(page.getByRole("button", { name: key.name, exact: true })).toBeVisible();
  await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
});
test("API key revocation supports cancellation, visible errors and successful retry", async ({ page }) => {
  const key = { id: "revoke-test", name: "Test ERP", keyPrefix: "ganita_test", scopes: ["sales:write"], revokedAt: null as string | null, dataSourceId: "source-test" };
  let attempts = 0;
  await page.route("**/api/integrations/api-keys", route => route.fulfill({ json: { data: [key] } }));
  await page.route("**/api/integrations/api-keys/revoke-test/revoke", async route => {
    attempts++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toBeNull();
    expect(route.request().headers()["content-type"]).toBeUndefined();
    if (attempts === 1) return route.fulfill({ status: 503, json: { error: { message: "Layanan sementara tidak tersedia." } } });
    key.revokedAt = new Date().toISOString();
    await route.fulfill({ json: { data: { id: key.id, status: "REVOKED" } } });
  });
  await menu(page, "Integrasi");
  const revoke = page.getByRole("button", { name: "Cabut akses", exact: true });
  page.once("dialog", dialog => dialog.dismiss());
  await revoke.click();
  expect(attempts).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await revoke.click();
  await expect(page.getByRole("alert")).toHaveText("Layanan sementara tidak tersedia.");
  await expect(revoke).toBeEnabled();
  page.once("dialog", dialog => dialog.accept());
  await revoke.click();
  await expect(page.getByText("Dicabut", { exact: true })).toBeVisible();
  await expect(revoke).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await menu(page, "Integrasi");
  await expect(page.getByText("Dicabut", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
test("unconfigured AI shows error instead of canned answers", async ({ page }) => {
  await page.getByRole("button", { name: "Buka Ask Ganita" }).click();
  await page.getByRole("textbox", { name: "Pertanyaan" }).fill("Bagaimana kondisi outlet?");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Asisten AI belum diaktifkan.");
});

test("brand spelling and tagline stay consistent in Indonesian and English navigation", async ({ page }, testInfo) => {
  for (const language of ["id", "en"]) {
    await page.getByRole("combobox", { name: "Pilih bahasa" }).selectOption(language);
    const menuButton = page.getByRole("button", { name: "Buka menu", exact: true });
    const mobile = await menuButton.isVisible();
    if (mobile) await menuButton.click();
    const brand = page.locator('[data-testid="brand-lockup"]:visible');
    await expect(brand).toHaveCount(1);
    await expect(brand.locator("p").first()).toHaveText("GANITA.ai");
    await expect(brand.locator("p").last()).toHaveText("count right. grow bright");
    expect(await brand.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`brand-${language}.png`) });
    if (mobile) await page.getByRole("button", { name: "Tutup menu", exact: true }).click();
  }
});

test("universe canvas renders, moves, and supports zoom", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await menu(page, "AI Universe");
  await expect(page.getByTestId("restaurant-scene")).toHaveAttribute("data-state", "ready", { timeout: 30000 });
  const canvas = page.getByLabel("Dunia restoran interaktif");
  const probe = page.locator('[data-testid="canvas-probe"]');
  await expect.poll(async () => { const text = await probe.textContent(); return text ? JSON.parse(text).colors : 0; }, { timeout: 60000 }).toBeGreaterThan(10);
  const motion = Number(await canvas.getAttribute("data-motion"));
  await expect.poll(async () => Number(await canvas.getAttribute("data-motion"))).toBeGreaterThan(motion);
  await page.getByRole("button", { name: "Jeda animasi", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lanjutkan animasi", exact: true })).toBeVisible();
  const zoom = Number(await canvas.getAttribute("data-zoom"));
  const before = JSON.parse((await probe.textContent())!).hash;
  await page.getByRole("button", { name: "Perbesar peta", exact: true }).click();
  await expect.poll(async () => Number(await canvas.getAttribute("data-zoom"))).toBeLessThan(zoom - 1);
  await expect.poll(async () => JSON.parse((await probe.textContent())!).hash).not.toBe(before);
  await page.getByRole("button", { name: "Perkecil peta", exact: true }).click();
  await page.getByRole("button", { name: "Dapur", exact: true }).click();
  await expect(page.getByRole("button", { name: "Dapur", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Stok", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stok", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Restoran terpilih" }).selectOption("test-b");
  await expect(page.getByRole("combobox", { name: "Restoran terpilih" })).toHaveValue("test-b");
  const inspection = page.waitForRequest(request => request.url().endsWith("/inspections") && request.method() === "POST");
  await page.getByRole("button", { name: "Periksa outlet", exact: true }).click();
  expect((await inspection).postDataJSON()).toEqual({ outletId: "test-b" });
  await expect(page.getByRole("region", { name: "Kesehatan outlet" }).getByRole("status")).toHaveText("Pemeriksaan tersimpan di Laporan.");
  await expect(page.getByTestId("restaurant-scene")).toHaveAttribute("data-state", "ready");
  await page.getByRole("button", { name: "Lihat semua restoran", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa outlet", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("universe.png"), fullPage: true });
  await page.getByRole("combobox", { name: "Pilih bahasa" }).selectOption("en");
  await expect(page.getByText("Activity simulation", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kitchen", exact: true })).toBeVisible();
  await expect(page.getByTestId("restaurant-scene")).toHaveAttribute("data-state", "ready");
  await menu(page, "Dashboard");
  await expect(page.locator("canvas")).toHaveCount(0);
});
