import { test, expect } from '@playwright/test';

/**
 * The shell at every screen size the app is actually used at.
 *
 * Brooklyn Morning is one installable PWA, not an iPhone app with a separate tablet build, so the same
 * markup has to look deliberate from a 375 pt iPhone SE to a 1080 pt iPad in landscape. These run in
 * every Playwright project and assert against that project's own viewport rather than a fixed number,
 * so adding a device to `playwright.config.ts` is enough to cover it.
 *
 * The tab bar is the one thing that genuinely needed tablet work: it is `position: fixed` and used to
 * span the window, which on an iPad put "Morning" and "Library" in opposite corners, a hand's width
 * away from the 640 px column they belong to.
 */

const COLUMN = 640;
const TAB_BREAKPOINT = 700;

for (const route of ['#/home', '#/waterpolo', '#/library']) {
  test(`the shell is centred and never scrolls sideways on ${route}`, async ({ page }, info) => {
    await page.goto(`/?fixtures=1&seed=none${route}`);
    await expect(page.locator('.tabbar')).toBeVisible();

    const m = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      };
      const tabs = [...document.querySelectorAll('.tab')].map((el) => {
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      });
      return {
        vw: window.innerWidth,
        screen: box('.screen'),
        tabbar: box('.tabbar'),
        tabs,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });

    // Nothing may push the page sideways. A 1 px rounding tolerance, no more.
    expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth + 1);

    // The reading column never exceeds its measure, and is centred once there is room to spare.
    expect(m.screen!.width).toBeLessThanOrEqual(COLUMN);
    if (m.vw > COLUMN) {
      const leftGap = m.screen!.left;
      const rightGap = m.vw - m.screen!.right;
      expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(1);
    }

    // The bar's surface always spans the window: content scrolls under it and must stay covered.
    expect(m.tabbar!.left).toBe(0);
    expect(m.tabbar!.width).toBe(m.vw);

    expect(m.tabs).toHaveLength(5);
    const tabsLeft = m.tabs[0].left;
    const tabsRight = m.tabs[m.tabs.length - 1].right;

    if (m.vw >= TAB_BREAKPOINT) {
      // Tablet: the five tabs sit inside the column, centred, not stranded in the corners.
      expect(tabsRight - tabsLeft).toBeLessThanOrEqual(COLUMN);
      expect(Math.abs(tabsLeft - (m.vw - tabsRight))).toBeLessThanOrEqual(1);
      expect(tabsLeft).toBeGreaterThan(0);
    } else {
      // Phone: the tabs use the whole width, as they always have.
      expect(tabsLeft).toBe(0);
      expect(tabsRight).toBe(m.vw);
    }

    // Every tab stays a comfortable target whatever the width. 44 pt is Apple's minimum; the bar is
    // shorter than that by design, so this guards the horizontal axis only.
    for (const t of m.tabs) expect(t.right - t.left).toBeGreaterThanOrEqual(44);

    info.annotations.push({ type: 'viewport', description: `${m.vw} pt, tabs ${tabsLeft}-${tabsRight}` });
  });
}
