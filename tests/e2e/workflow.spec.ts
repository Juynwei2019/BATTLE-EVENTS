import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, email = "owner@example.test") {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("密碼", { exact: true }).fill("Test-password-123");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.getByRole("heading", { name: "你已登入" })).toBeVisible();
}
async function confirm(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "確認操作" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
test("actual SQL behind simulated auth: create, multi-group register, check in, score, vote, publish champion", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await login(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "建立活動", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("活動名稱").fill("【範例】瀏覽器驗收");
  await dialog.getByLabel("場地", { exact: true }).fill("合成測試場地");
  await dialog.getByLabel("開始時間（台灣時間）").fill("2030-12-01T13:00");
  await dialog.getByLabel("報名截止（台灣時間）").fill("2030-11-30T23:00");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "新增組別" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("組別名稱").fill("All Style 主賽");
  await dialog.getByLabel("晉級名額").selectOption("2");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "新增組別" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("組別名稱").fill("Hip Hop 副賽");
  await dialog.getByLabel("舞風", { exact: true }).selectOption("Hip Hop");
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "開放報名", exact: true }).click();
  await confirm(page);
  const guest = await browser.newContext();
  const publicPage = await guest.newPage();
  await publicPage.goto("/events");
  await publicPage.getByRole("link", { name: "查看詳情" }).click();
  await publicPage.getByLabel("舞名", { exact: true }).fill("Alpha");
  await publicPage.getByLabel("手機號碼").fill("0912345678");
  await publicPage.getByLabel(/All Style 主賽/).check();
  await publicPage.getByLabel(/Hip Hop 副賽/).check();
  await publicPage.getByRole("button", { name: "確認報名" }).click();
  await expect(publicPage.getByText("報名成功 · 已寫入雲端")).toBeVisible();
  await expect(publicPage.getByAltText("報到 QR Code")).toBeVisible();
  const evs = await (await publicPage.request.get("/api/events")).json();
  const ev = evs[0];
  const group = ev.groups.find((g: any) => g.name === "All Style 主賽");
  for (const [dancer, phone] of [
    ["Bravo", "0912345679"],
    ["Charlie", "0912345680"],
  ])
    expect(
      (
        await publicPage.request.post("/api/register", {
          data: {
            event_id: ev.id,
            dancer,
            phone,
            group_ids: [group.id],
            request_id: crypto.randomUUID(),
          },
        })
      ).ok(),
    ).toBeTruthy();
  const duplicate = await publicPage.request.post("/api/register", {
    data: {
      event_id: ev.id,
      dancer: "Alpha",
      phone: "0912345678",
      group_ids: [group.id],
      request_id: crypto.randomUUID(),
    },
  });
  expect(duplicate.status()).toBe(409);
  await page.getByRole("button", { name: "團隊與權限" }).click();
  await page.getByRole("button", { name: "Email 邀請" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("受邀者 Email").fill("owner@example.test");
  await dialog.getByLabel("All Style 主賽", { exact: true }).check();
  await dialog.getByRole("button", { name: "儲存", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/login");
  await page.getByRole("button", { name: "接受邀請" }).click();
  await expect(page.getByRole("button", { name: "接受邀請" })).toHaveCount(0);
  await page.goto("/checkin");
  await page.getByLabel("當前組別").selectOption({ label: "All Style 主賽" });
  await expect(
    page.getByRole("button", { name: "確認報到", exact: true }),
  ).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "確認報到", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "確認報到", exact: true }),
    ).toHaveCount(2 - i);
  }
  await page.getByRole("button", { name: "結束報到", exact: true }).click();
  await confirm(page);
  await expect(page.getByText("本組報到已結束", { exact: true })).toBeVisible();
  await page.goto("/judging");
  for (const score of ["90", "80", "70"]) {
    await page
      .getByRole("textbox", { name: "海選分數", exact: true })
      .fill(score);
    await page.getByRole("button", { name: "儲存並評下一位" }).click();
    await expect(page.getByRole("status")).toContainText("已儲存至雲端");
    await page.waitForTimeout(150);
  }
  await expect(page.getByText("本組評分已完成", { exact: true })).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("button", { name: "賽程與公布" }).click();
  await page.getByRole("button", { name: "鎖定 2 強" }).click();
  await confirm(page);
  await expect(page.getByText("晉級已鎖定 · 配對已保存")).toBeVisible();
  await page.getByRole("button", { name: "確認並公布" }).click();
  await confirm(page);
  await publicPage.goto("/live");
  await expect(publicPage.locator(".match-card")).toHaveCount(1);
  await page.goto("/judging");
  await page.locator(".vote-choice").first().click();
  await expect(page.getByText("我的票 · 已儲存")).toBeVisible();
  await page.screenshot({ path: "/tmp/battle-judge.png", fullPage: true });
  await page.goto("/admin");
  await page.getByRole("button", { name: "賽程與公布" }).click();
  const winnerSelect = page.getByRole("combobox", { name: "R1 M1 確認勝方" });
  const winner = await winnerSelect
    .locator("option")
    .nth(1)
    .getAttribute("value");
  await winnerSelect.selectOption(winner!);
  await confirm(page);
  await page.getByRole("button", { name: "確認並公布" }).click();
  await confirm(page);
  await publicPage.reload();
  await expect(publicPage.getByText(/· 冠軍/)).toBeVisible();
  await publicPage.screenshot({ path: "/tmp/battle-live.png", fullPage: true });
  await page.getByRole("button", { name: "暫停公布" }).click();
  await confirm(page);
  await publicPage.reload();
  await expect(
    publicPage.getByRole("heading", { name: "等待主辦公布賽況" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await guest.close();
});
test("mobile menu, public search, protected routes and absence of overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/events");
  await page
    .getByRole("textbox", { name: "搜尋活動", exact: true })
    .fill("找不到");
  await expect(
    page.getByRole("heading", { name: "沒有符合條件的活動" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "清除篩選" }).click();
  await expect(page.locator(".event-card")).toHaveCount(1);
  await page.getByRole("button", { name: "開啟選單" }).click();
  await page.getByRole("link", { name: "現場報到", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "登入，開啟你的工作台" }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "/tmp/battle-mobile-protected.png",
    fullPage: true,
  });
  expect((await page.request.get("/api/workspace")).status()).toBe(401);
});
test("two sessions preserve drafts on write failure, reject stale scores, and allow explicit reconciliation", async ({
  page,
  browser,
}) => {
  await login(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "產生範例情境" }).click();
  await confirm(page);
  await page.getByLabel("當前活動").selectOption({ label: "【範例】海選漏評" });
  await page.goto("/judging");
  await page.getByLabel("當前組別").selectOption({ label: "All Style 1 on 1" });
  const input = page.getByRole("textbox", { name: "海選分數", exact: true });
  await input.fill("88");
  await page.getByRole("link", { name: "活動探索", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "離開前確認草稿" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await expect(input).toHaveValue("88");
  await page.route("**/api/command", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "測試：寫入失敗，請重試" }),
    }),
  );
  await page.getByRole("button", { name: "儲存並評下一位" }).click();
  await expect(page.getByRole("status")).toContainText("寫入失敗");
  await expect(input).toHaveValue("88");
  await page.unroute("**/api/command");
  const second = await browser.newContext();
  const other = await second.newPage();
  await login(other);
  await other.goto("/judging");
  await other
    .getByLabel("當前活動")
    .selectOption({ label: "【範例】海選漏評" });
  await other
    .getByRole("textbox", { name: "海選分數", exact: true })
    .fill("89");
  await other.getByRole("button", { name: "儲存並評下一位" }).click();
  await expect(
    other.getByText("本組評分已完成", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "儲存並評下一位" }).click();
  await expect(page.getByRole("status")).toContainText("CONFLICT");
  await expect(input).toHaveValue("88");
  await page.getByRole("button", { name: "重新同步", exact: true }).click();
  await expect(page.getByText("其他裝置已更新此分數")).toBeVisible();
  await page.getByRole("button", { name: "核對後沿用草稿輸入" }).click();
  await page
    .getByLabel("修改原因（必填）")
    .fill("雙工作階段驗收：核對後保留原草稿");
  await page.getByRole("button", { name: "儲存並評下一位" }).click();
  await expect(page.getByText("本組評分已完成", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Sample Dancer 24/ }).click();
  await expect(page.getByText(/雲端分數 88/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => Math.round(el.getBoundingClientRect().right)),
    )
    .toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/battle-mobile-scoring.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await second.close();
});
