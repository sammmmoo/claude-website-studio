#!/usr/bin/env node
// Site check: looks at your site the way a customer on a phone does, then on a desktop.
//
//   npm run check                          checks the site in ./site
//   npm run check -- --url https://...     checks a live site (yours or one you're redoing)
//   npm run check -- --site path --out path --pages 12
//
// It takes screenshots (with scroll animations forced visible so nothing looks empty),
// taps the phone menu open and closed, fills in and sends the enquiry form (what the form
// sends is caught here and never goes out), and checks the things a customer would trip on.
// Writes check/out/report.md, report.json and the screenshots. Exit 1 if anything FAILs.

import { createServer } from "node:http";
import { readFile, mkdir, writeFile, stat, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve, normalize, sep } from "node:path";
let chromium, devices;
try {
  ({ chromium, devices } = await import("playwright"));
} catch {
  console.error("The check needs Playwright. In this folder run: npm install, then npx playwright install chromium");
  process.exit(2);
}

const args = parseArgs(process.argv.slice(2));
const OUT = resolve(args.out || "check/out");
const MAX_PAGES = Number(args.pages || 12);
const PHONE = { ...devices["iPhone 13"], deviceScaleFactor: 2 }; // 390 px wide, real phone viewport height
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const FAKE = { email: "check@example.com", phone: "0491 570 110", name: "Site Check", text: "Test", message: "Test from the site check. Please ignore." };

const TITLES = {
  "page-loads": ["Page loads", ""],
  "no-errors": ["No script errors", ""],
  "viewport-meta": ["Set up for phones", "5"],
  "no-sideways-scroll": ["No sideways scroll on a phone", "5"],
  headline: ["Headline says what you do and where", "1"],
  "main-action": ["Main button on the first phone screen", "2"],
  "tap-to-call": ["Tap-to-call works", "3"],
  "page-weight": ["Page weight", "4"],
  "text-size": ["Readable without zooming", "5"],
  "tap-targets": ["Thumb-sized buttons", "5"],
  "form-found": ["Enquiry form found", "6"],
  "form-short": ["Form is short", "6"],
  "form-errors": ["Empty form shows a message", "7"],
  "form-sends": ["Something happens after they send it", "7"],
  "images-load": ["Every image loads", "9"],
  "image-alt": ["Images described for screen readers", "9"],
  "menu-opens": ["Phone menu opens", "5"],
  "menu-closes": ["Phone menu closes", "5"],
  "menu-link-closes": ["Menu closes after tapping a link", "5"],
  "reduced-motion-visible": ["Everything readable with reduced motion on", "5"],
  "no-js-visible": ["Text readable before JavaScript runs", "G"],
  "next-step": ["Page ends with a next step", "13"],
  "page-title": ["Page title", "G"],
  "meta-description": ["Search description", "G"],
  "business-schema": ["Business details for Google and AI tools", "G"],
  lang: ["Page language set", ""],
};

const results = [];
const formRequests = [];
let formTest = false; // true while the form test is filling in and sending the form
let siteOrigin = "";
const pages = [];
const add = (id, level, message, page = "/") => results.push({ id, level, title: TITLES[id]?.[0] || id, ref: TITLES[id]?.[1] || "", message, page });

main().catch((err) => {
  console.error(`\nThe check couldn't run: ${err.message}`);
  process.exit(2);
});

async function main() {
  let server;
  let base = args.url;
  if (!base) {
    const root = resolve(args.site || "site");
    if (!existsSync(join(root, "index.html"))) {
      console.error(`No ${join(root, "index.html")} yet. Build the site first, or check a live one with: npm run check -- --url https://your-site`);
      process.exit(2);
    }
    server = await serve(root);
    base = `http://127.0.0.1:${server.address().port}/`;
  }
  await cleanOut();
  const browser = await chromium.launch();
  try {
    const home = new URL(base).toString();
    siteOrigin = new URL(home).origin;
    const phone = await newContext(browser, PHONE);
    const links = await checkHome(phone, home);
    await checkMenu(phone, home);
    await checkForm(phone, home);
    await checkInternalPages(phone, home, links);
    await phone.close();

    await checkHiddenText(browser, home, { ...PHONE, reducedMotion: "reduce" }, "reduced-motion-visible", "FAIL",
      "With reduced motion switched on, this text stays invisible. Reduced-motion visitors should get the finished page, not a blank one");
    await checkHiddenText(browser, home, { ...PHONE, javaScriptEnabled: false }, "no-js-visible", "WARN",
      "Before JavaScript runs (or if it fails), this text is invisible. Some search and AI tools read the page this way");

    const desktop = await newContext(browser, DESKTOP);
    await checkDesktop(desktop, home);
    await desktop.close();
  } finally {
    await browser.close();
    server?.close();
  }
  await writeReport(base);
}

// ---------- the checks ----------

async function checkHome(ctx, url) {
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  const res = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
  if (!res || res.status() >= 400) {
    add("page-loads", "FAIL", `The home page answered ${res ? res.status() : "nothing"}.`);
    throw new Error(`home page returned ${res ? res.status() : "no response"}`);
  }
  add("page-loads", "PASS", `Loaded ${url}`);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "phone-first-screen.png") });

  const first = await page.evaluate(measureFirstScreen);
  if (!first.viewport) add("viewport-meta", "FAIL", 'No <meta name="viewport" content="width=device-width, initial-scale=1">, so phones show a shrunk desktop page.');
  else add("viewport-meta", "PASS", "Viewport tag is set.");

  if (!first.h1) add("headline", "FAIL", "No <h1> headline on the page.");
  else if (/^\s*welcome/i.test(first.h1.text)) add("headline", "WARN", `The headline is "${first.h1.text}". Say the service and the area instead, e.g. "[Service] in [area]".`);
  else if (!first.h1.inFirstScreen) add("headline", "WARN", `The headline "${first.h1.text}" is below the first phone screen.`);
  else add("headline", "PASS", `Headline: "${first.h1.text}". Check by eye that it names the service and the area.`);

  if (first.mainAction) add("main-action", "PASS", `On the first phone screen: "${first.mainAction}".`);
  else add("main-action", "WARN", 'No call, quote or booking button on the first phone screen (before scrolling). Give it a tap-to-call link or mark the main button with data-check="main-action".');

  checkTel(first.tels, "/");
  addLang(first);
  addHead(first, "/");
  addTextAndTargets(first, "/");

  await scrollThrough(page);
  const after = await page.evaluate(measureAfterScroll);
  addOverflow(after, "/", "phone");
  addImages(after, "/");
  addNextStep(after, "/");
  const kb = Math.round(after.bytes / 1024);
  if (after.bytes > 3 * 1024 * 1024) add("page-weight", "WARN", `About ${kb} KB loaded on a phone. Shrink the biggest images first. Run pagespeed.web.dev on the live site for the real score.`);
  else add("page-weight", "PASS", `About ${kb} KB loaded. Run pagespeed.web.dev on the live site for the real speed score.`);

  await forceVisible(page);
  await page.screenshot({ path: join(OUT, "phone-full.png"), fullPage: true });
  addErrors(errs, "/");
  pages.push({ path: "/", screenshot: "phone-full.png" });
  const links = after.links;
  await page.close();
  return links;
}

async function checkMenu(ctx, url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(500);
  const found = await page.evaluate(findMenu);
  if (!found.toggle) {
    if (found.inlineLinks >= 2) add("menu-opens", "PASS", "No menu button: the links are on show at phone width.");
    else add("menu-opens", "WARN", "No phone menu button found (a <button> with aria-controls pointing at the menu).");
    await page.screenshot({ path: join(OUT, "phone-menu-open.png") });
    await page.close();
    return;
  }
  if (!found.panelId) add("menu-opens", "WARN", "The menu button has no aria-controls, so screen readers (and this check) can't tell which menu it opens.");
  const state = () => page.evaluate(menuState, found.panelId);
  const before = await state();
  await tap(page, "[data-check-toggle]");
  const opened = await state();
  await page.screenshot({ path: join(OUT, "phone-menu-open.png") });

  if (before.open) add("menu-opens", "WARN", "The menu is already open before anyone taps it.");
  else if (opened.open) add("menu-opens", "PASS", `Tapping "${found.toggleLabel}" opens the menu.`);
  else add("menu-opens", "FAIL", `Tapping "${found.toggleLabel}" doesn't open a menu.`);
  if (opened.open && found.expanded !== null && opened.expanded !== "true") add("menu-opens", "WARN", 'The menu opens but the button keeps aria-expanded="false".');

  // Close it the way a person would: the close button if there is one, else the same button.
  const closer = (await page.evaluate(markCloser, found.panelId)) ? "[data-check-closer]" : "[data-check-toggle]";
  await tap(page, closer);
  const closed = await state();
  if (closed.open) {
    add("menu-closes", "FAIL", before.open
      ? "The menu shows all the time and tapping won't close it. Usually a rule like .menu{display:flex} beating [hidden]; add .menu[hidden]{display:none}."
      : "Tapping again doesn't close the menu. If you toggle the hidden attribute, add .menu[hidden]{display:none} so your CSS doesn't override it.");
  } else add("menu-closes", "PASS", "Tapping again closes the menu.");

  // Tapping a link inside the menu should close it, or it sits over the page they jumped to.
  if (opened.open && !closed.open) {
    await tap(page, "[data-check-toggle]");
    const hasAnchor = await page.evaluate(markMenuLink, found.panelId);
    if (hasAnchor) {
      await tap(page, "[data-check-menulink]");
      const afterLink = await state();
      if (afterLink.open) add("menu-link-closes", "WARN", "After tapping a menu link that jumps down the page, the menu stays open over it.");
      else add("menu-link-closes", "PASS", "Tapping a menu link closes the menu.");
    }
  }
  await page.close();
}

async function checkForm(ctx, url) {
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(400);
  const form = await page.evaluate(markForm);
  if (!form.found) {
    if (form.iframes > 0) add("form-found", "WARN", "No form on the page itself; it may be inside an embed (iframe). Fill it in by hand on your phone and check you get the reply.");
    else add("form-found", "WARN", "No enquiry form found. Fine if you only take calls; most people would rather send a quick form.");
    await page.close();
    return;
  }
  add("form-found", "PASS", `Form found with ${form.fields} field${form.fields === 1 ? "" : "s"}.`);
  if (form.fields > 5) add("form-short", "WARN", `${form.fields} fields. Name, phone, suburb and what they need is usually enough; cut what you don't need to quote.`);
  else add("form-short", "PASS", `${form.fields} fields.`);

  // 1. Send it empty: it should stop and say why, not send.
  formTest = true;
  const sentBefore = formRequests.length;
  await page.locator("[data-check-form]").scrollIntoViewIfNeeded();
  const emptyBlocked = await page.evaluate(() => {
    const f = document.querySelector("[data-check-form]");
    return !f.noValidate && !f.checkValidity();
  });
  if (emptyBlocked) add("form-errors", "PASS", "The browser stops an empty form and points at the missing field.");
  else {
    await clickSubmit(page);
    await page.waitForTimeout(800);
    const s = await page.evaluate(formOutcome);
    if (formRequests.length > sentBefore || s.success) add("form-errors", "WARN", "The form sends even when it's empty. Mark the must-have fields required.");
    else if (s.message) add("form-errors", "PASS", `Sending it empty shows: "${s.message}".`);
    else add("form-errors", "WARN", "Sending it empty does nothing visible. Say what's missing next to the field.");
  }

  // 2. Fill it in and send it. The request is caught here and never leaves.
  const startUrl = page.url();
  const sentAt = formRequests.length;
  await fillForm(page);
  await clickSubmit(page);
  let outcome = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    outcome = await page.evaluate(formOutcome).catch(() => null); // null while navigating
    const moved = page.url() !== startUrl;
    if (moved || outcome?.success || (formRequests.length > sentAt && (outcome?.message || outcome?.formGone))) break;
  }
  const moved = page.url() !== startUrl;
  const caughtNow = formRequests.slice(sentAt);
  const sentTo = caughtNow.map((r) => r.url);
  const viaScript = caughtNow.some((r) => r.type === "script");
  const caught = sentTo.length ? ` The request to ${sentTo[0]} was caught by the check, nothing was sent.` : "";
  if (outcome?.success) add("form-sends", "PASS", `After sending, the page says: "${outcome.success}".${caught}`);
  else if (moved) add("form-sends", "PASS", `After sending, it goes to ${page.url()}. Make sure that page says what happens next and when.${caught}`);
  else if (sentTo.length && (outcome?.message || outcome?.formGone)) add("form-sends", "PASS", `After sending: "${outcome.message || "the form is replaced"}".${caught}`);
  else if (viaScript) add("form-sends", "WARN", `The form sends through another site's script, which the check blocks so nothing goes out, so it can't see the reply. Send it yourself on your phone and check the thank-you message.${caught}`);
  else add("form-sends", "FAIL", sentTo.length
    ? `The form sent a request but nothing on the page changed. Show a thank-you message saying what happens next and when.${caught}`
    : "Nothing happened after tapping send: no request, no message. The enquiry would be lost.");
  addErrors(errs, "/ (form)");
  await page.close();
  formTest = false; // only now: a late request from the form page is still caught
}

async function checkInternalPages(ctx, home, links) {
  const homeUrl = new URL(home);
  const seen = new Set([homeUrl.pathname, homeUrl.pathname.replace(/index\.html$/, "")]);
  const todo = [];
  for (const href of links) {
    const u = new URL(href, home);
    u.hash = "";
    if (u.origin !== homeUrl.origin || seen.has(u.pathname)) continue;
    if (/\.(pdf|jpe?g|png|webp|avif|gif|svg|zip|mp4|webm|ics|xml|txt)$/i.test(u.pathname)) continue;
    // Never open a link that does something on a live site.
    if (/log-?out|sign-?out|unsubscribe|delete|remove|cart|checkout|wp-admin|wp-login|\/admin|\/account/i.test(u.pathname + u.search)) continue;
    seen.add(u.pathname);
    todo.push(u.toString());
  }
  if (todo.length > MAX_PAGES) console.log(`Checking the first ${MAX_PAGES} of ${todo.length} pages (use --pages to change).`);
  await mkdir(join(OUT, "pages"), { recursive: true });
  for (const [i, url] of todo.slice(0, MAX_PAGES).entries()) {
    const path = new URL(url).pathname;
    const page = await ctx.newPage();
    const errs = watchErrors(page);
    const res = await page.goto(url, { waitUntil: "load", timeout: 45_000 }).catch(() => null);
    if (!res || res.status() >= 400) {
      add("page-loads", "FAIL", `A link on the home page goes to ${path}, which answered ${res ? res.status() : "nothing"}.`, path);
      await page.close();
      continue;
    }
    add("page-loads", "PASS", "Loads.", path);
    await page.waitForTimeout(400);
    const first = await page.evaluate(measureFirstScreen);
    if (!first.h1) add("headline", "WARN", "No <h1> on this page.", path);
    addHead(first, path);
    checkTel(first.tels, path, true);
    await scrollThrough(page);
    const after = await page.evaluate(measureAfterScroll);
    addOverflow(after, path, "phone");
    addImages(after, path);
    addNextStep(after, path);
    await forceVisible(page);
    const shot = `pages/${String(i + 1).padStart(2, "0")}-${slug(path)}-phone.png`;
    await page.screenshot({ path: join(OUT, shot), fullPage: true });
    addErrors(errs, path);
    pages.push({ path, screenshot: shot });
    await page.close();
  }
}

async function checkHiddenText(browser, url, options, id, level, why) {
  const ctx = await newContext(browser, options);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(700);
  const hidden = await page.evaluate(findInvisibleText);
  if (hidden.length) add(id, level, `${why}: ${hidden.slice(0, 5).map((h) => `"${h}"`).join(", ")}${hidden.length > 5 ? ` and ${hidden.length - 5} more` : ""}.`);
  else add(id, "PASS", "All the text is readable.");
  await ctx.close();
}

async function checkDesktop(ctx, url) {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, "desktop-first-screen.png") });
  await scrollThrough(page);
  const after = await page.evaluate(measureAfterScroll);
  addOverflow(after, "/", "desktop");
  await forceVisible(page);
  await page.screenshot({ path: join(OUT, "desktop-full.png"), fullPage: true });
  await page.close();
}

// ---------- result helpers ----------

function checkTel(tels, path, quiet = false) {
  if (!tels.length) {
    if (!quiet) add("tap-to-call", "WARN", "No tap-to-call link. Fine only if you don't take calls.", path);
    return;
  }
  const bad = tels.filter((t) => /[a-z]/i.test(t.replace(/^tel:/i, "")) || t.replace(/\D/g, "").length < 8);
  if (bad.length) add("tap-to-call", "FAIL", `This call link doesn't dial a real number: ${bad[0]}`, path);
  else if (!quiet) add("tap-to-call", "PASS", `Call link dials ${tels[0].replace(/^tel:/i, "")}.`, path);
}

function addLang(m) {
  if (!m.lang) add("lang", "WARN", 'No lang on <html>. Add lang="en-AU" (or your language).');
}

function addHead(m, path) {
  if (!m.title || m.title.length < 10 || /^(home|index|welcome|untitled)\b/i.test(m.title)) add("page-title", "WARN", `The page title is "${m.title || ""}". Make it "[Service] in [Area] | [Business]".`, path);
  else add("page-title", "PASS", `"${m.title}"`, path);
  if (!m.description) add("meta-description", "WARN", "No meta description. Google shows it under your title: say what you do, where, and why call you.", path);
  else add("meta-description", "PASS", `${m.description.length} characters.`, path);
  if (path === "/") {
    if (m.schema) add("business-schema", "PASS", `Structured business details found (${m.schema}).`);
    else add("business-schema", "WARN", "No LocalBusiness details in the page code (JSON-LD). Add name, phone, area and hours so Google and AI tools know who you are.");
  }
}

function addTextAndTargets(m, path) {
  if (m.smallText.length) add("text-size", "WARN", `${m.smallText.length} bits of text under 16 px on a phone, e.g. "${m.smallText[0]}".`, path);
  else add("text-size", "PASS", "Body text is 16 px or bigger.", path);
  if (m.smallTargets.length) add("tap-targets", "WARN", `${m.smallTargets.length} buttons or links smaller than 24 px to tap, e.g. "${m.smallTargets[0]}". Aim for 44 px.`, path);
  else add("tap-targets", "PASS", "Buttons and links are big enough to tap.", path);
}

function addOverflow(m, path, where) {
  if (m.overflow > 0) add("no-sideways-scroll", "FAIL", `The ${where} page scrolls sideways by ${m.overflow} px${m.wide.length ? `. Too wide: ${m.wide.join(", ")}` : ""}.`, path);
  else if (where === "phone") add("no-sideways-scroll", "PASS", "No sideways scroll.", path);
}

function addImages(m, path) {
  if (m.broken.length) add("images-load", "FAIL", `${m.broken.length} image${m.broken.length > 1 ? "s" : ""} didn't load: ${m.broken.slice(0, 3).join(", ")}`, path);
  else add("images-load", "PASS", `${m.images} image${m.images === 1 ? "" : "s"}, all loaded.`, path);
  if (m.noAlt.length) add("image-alt", "WARN", `${m.noAlt.length} image${m.noAlt.length > 1 ? "s have" : " has"} no alt text: ${m.noAlt.slice(0, 3).join(", ")}. Describe the job in the photo, or alt="" if it's decoration.`, path);
}

function addNextStep(m, path) {
  if (m.nextStep) add("next-step", "PASS", `Ends with: "${m.nextStep}".`, path);
  else add("next-step", "WARN", "The bottom of this page has no call, quote or booking button. Every page should end with one.", path);
}

function addErrors(errs, path) {
  if (errs.page.length) add("no-errors", "FAIL", `Script error: ${errs.page[0]}`, path);
  else if (errs.console.length) add("no-errors", "WARN", `Console error: ${errs.console[0]}`, path);
  else if (path === "/") add("no-errors", "PASS", "No script errors.", path);
}

// ---------- browser plumbing ----------

async function newContext(browser, options) {
  // Service workers are blocked: requests they make would skip the routing below.
  const ctx = await browser.newContext({ ...options, serviceWorkers: "block" });
  // Catch every POST and beacon, always. While the form test runs, also catch anything that could
  // carry the form or report it: a GET form, a fetch, a third-party script (JSONP) or an ad pixel
  // firing a lead event. Only styles and fonts from other sites still load then.
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const type = req.resourceType();
    const url = new URL(req.url());
    const nonGet = !["GET", "HEAD", "OPTIONS"].includes(req.method());
    const crossOrigin = url.origin !== siteOrigin;
    const formGet = formTest && (type === "fetch" || type === "xhr" || (req.isNavigationRequest() && url.search) || (crossOrigin && !["stylesheet", "font"].includes(type)));
    if (!nonGet && !formGet) return route.continue();
    formRequests.push({ method: req.method(), type, url: req.url() });
    if (req.isNavigationRequest()) {
      return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Sent</title><p>Site check: the form would have been sent here. Nothing was sent.</p>" });
    }
    if (type === "script") return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    if (type === "image") return route.fulfill({ status: 204, body: "" });
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await ctx.routeWebSocket(/.*/, (ws) => {
    if (formTest) ws.close();
    else ws.connectToServer();
  });
  return ctx;
}

function watchErrors(page) {
  const errs = { page: [], console: [] };
  page.on("pageerror", (e) => errs.page.push(e.message.split("\n")[0]));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.console.push(m.text().slice(0, 200));
  });
  return errs;
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(innerHeight * 0.6));
    for (let y = 0, i = 0; y < document.documentElement.scrollHeight && i < 200; y += step, i++) {
      window.scrollTo(0, y);
      await wait(120);
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await wait(400);
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(700);
}

// Reveal anything still invisible after the scroll (reveal-on-scroll animations), so the
// full-page screenshot is truthful. Leaves menus, dialogs and see-through overlays alone.
async function forceVisible(page) {
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important;scroll-behavior:auto!important}" });
  await page.evaluate(() => {
    const skip = (el) => el.closest("nav,[role=dialog],[aria-modal=true],dialog,[hidden],[aria-hidden=true]");
    for (const el of document.body.querySelectorAll("*")) {
      if (skip(el)) continue;
      const c = getComputedStyle(el);
      if (parseFloat(c.opacity) < 0.05) {
        el.style.setProperty("opacity", "1", "important");
        if (c.transform !== "none") el.style.setProperty("transform", "none", "important");
      }
      if (c.visibility === "hidden" && el.textContent.trim()) el.style.setProperty("visibility", "visible", "important");
    }
  });
  await page.waitForTimeout(200);
}

async function tap(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return;
  // A real tap at the button's centre: if something covers the button, the tap hits that instead, like a real thumb.
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
}

async function clickSubmit(page) {
  const btn = page.locator("[data-check-form] button:not([type=button]):not([type=reset]), [data-check-form] input[type=submit]").first();
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click({ timeout: 3000 }).catch(() => page.evaluate(() => document.querySelector("[data-check-form]").requestSubmit()));
  } else await page.evaluate(() => document.querySelector("[data-check-form]").requestSubmit());
}

async function fillForm(page) {
  const fields = await page.evaluate(() => {
    const f = document.querySelector("[data-check-form]");
    const out = [];
    [...f.elements].forEach((el, i) => {
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const honeypot = el.tabIndex === -1 || el.getAttribute("aria-hidden") === "true" || /honeypot|_gotcha|bot-field|hp_/i.test(el.name || "");
      const shown = r.width > 2 && r.height > 2 && c.visibility !== "hidden" && parseFloat(c.opacity) > 0.05 && r.right > 0 && r.left < innerWidth;
      if (honeypot || !shown || el.disabled || el.readOnly) return;
      const label = [el.name, el.id, el.getAttribute("autocomplete"), el.getAttribute("placeholder"), el.labels?.[0]?.textContent].join(" ").toLowerCase();
      el.setAttribute("data-check-field", String(i));
      out.push({ i, tag: el.tagName.toLowerCase(), type: (el.type || "").toLowerCase(), required: el.required, label });
    });
    return out;
  });
  for (const f of fields) {
    const loc = page.locator(`[data-check-field="${f.i}"]`);
    try {
      if (f.tag === "select") {
        const values = await loc.evaluate((s) => [...s.options].filter((o) => o.value && !o.disabled).map((o) => o.value));
        if (values.length) await loc.selectOption(values[0]);
      } else if (f.type === "checkbox" || f.type === "radio") {
        if (f.required || f.type === "radio") await loc.check({ timeout: 2000 });
      } else if (["submit", "button", "reset", "hidden", "file", "image"].includes(f.type)) {
        // nothing to fill
      } else if (f.tag === "textarea") await loc.fill(FAKE.message);
      else if (f.type === "email" || /e-?mail/.test(f.label)) await loc.fill(FAKE.email);
      else if (f.type === "tel" || /phone|mobile|tel\b/.test(f.label)) await loc.fill(FAKE.phone);
      else if (f.type === "number") await loc.fill("1");
      else if (f.type === "date") await loc.fill("2030-01-15");
      else if (f.type === "url") await loc.fill("https://example.com");
      else if (/post ?code|zip/.test(f.label)) await loc.fill("4000");
      else if (/name/.test(f.label)) await loc.fill(FAKE.name);
      else await loc.fill(FAKE.text);
    } catch {
      // a field the check can't fill; the form-sends result will show if it mattered
    }
  }
}

// ---------- functions that run inside the page ----------

function measureFirstScreen() {
  const vh = innerHeight;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && c.visibility !== "hidden" && c.display !== "none" && parseFloat(c.opacity) > 0.05;
  };
  const inFirst = (el) => { const r = el.getBoundingClientRect(); return r.top < vh && r.bottom > 0 && r.left < innerWidth && r.right > 0; };
  const text = (el) => (el.innerText || el.getAttribute("aria-label") || el.value || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const h1el = document.querySelector("h1");
  const actionRe = /call|quote|book|enquir|contact|get in touch|free|estimate|appointment/i;
  const actions = [...document.querySelectorAll('a[href^="tel:"], [data-check="main-action"], a, button')]
    .filter((el) => shown(el) && inFirst(el) && !el.closest("nav"))
    .filter((el) => el.matches('a[href^="tel:"], [data-check="main-action"]') || actionRe.test(text(el)));
  const small = [];
  for (const el of document.querySelectorAll("p, li, dd, td, blockquote, label")) {
    if (!shown(el) || !el.innerText.trim() || el.closest("footer")) continue;
    if (parseFloat(getComputedStyle(el).fontSize) < 15.5) small.push(text(el).slice(0, 40));
  }
  const tiny = [];
  for (const el of document.querySelectorAll('a[href], button, input[type=submit], [role=button]')) {
    if (!shown(el) || el.closest("nav")) continue;
    if (el.tagName === "A" && el.parentElement?.tagName === "P") continue; // links inside a sentence are exempt
    const r = el.getBoundingClientRect();
    if (r.height < 24 || r.width < 24) tiny.push(text(el).slice(0, 30) || el.tagName.toLowerCase());
  }
  let schema = "";
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    const t = s.textContent;
    const m = t.match(/"@type"\s*:\s*"([^"]+)"/);
    if (/LocalBusiness|"telephone"|"address"|"areaServed"/.test(t)) { schema = m ? m[1] : "JSON-LD"; break; }
  }
  return {
    viewport: /width\s*=\s*device-width/.test(document.querySelector('meta[name="viewport"]')?.content || ""),
    lang: document.documentElement.lang,
    title: document.title.trim(),
    description: (document.querySelector('meta[name="description"]')?.content || "").trim(),
    schema,
    h1: h1el ? { text: text(h1el), inFirstScreen: shown(h1el) && inFirst(h1el) } : null,
    mainAction: actions.length ? text(actions[0]) || "call link" : "",
    tels: [...document.querySelectorAll('a[href^="tel:" i]')].map((a) => a.getAttribute("href")),
    smallText: small,
    smallTargets: tiny,
  };
}

function measureAfterScroll() {
  const vw = document.documentElement.clientWidth;
  const label = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const wide = [];
  const overflow = Math.max(0, document.documentElement.scrollWidth - vw);
  if (overflow > 1) {
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > vw + 1 || r.left < -1) && !clipped(el) && getComputedStyle(el).position !== "fixed") {
        wide.push(label(el));
        if (wide.length >= 3) break;
      }
    }
  }
  const imgs = [...document.images];
  const broken = imgs.filter((i) => (i.currentSrc || i.getAttribute("src")) && i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src"));
  const noAlt = imgs.filter((i) => !i.hasAttribute("alt")).map((i) => i.getAttribute("src"));
  const res = performance.getEntriesByType("resource").concat(performance.getEntriesByType("navigation"));
  const bytes = res.reduce((n, e) => n + (e.transferSize || e.encodedBodySize || 0), 0);
  // next step: a call/quote/book control in the last 1.5 screens of the page, or one fixed on screen
  const docH = document.documentElement.scrollHeight;
  const actionRe = /call|quote|book|enquir|contact|get in touch|estimate|appointment/i;
  let nextStep = "";
  for (const el of document.querySelectorAll('a[href^="tel:"], [data-check="main-action"], a[href], button, form')) {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    if (!r.width || c.display === "none" || c.visibility === "hidden" || el.closest("nav")) continue;
    const t = (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    const isAction = el.tagName === "FORM" || el.matches('a[href^="tel:"], [data-check="main-action"]') || actionRe.test(t);
    const fixed = c.position === "fixed" || c.position === "sticky";
    if (isAction && (fixed || r.top + scrollY > docH - innerHeight * 1.5)) { nextStep = el.tagName === "FORM" ? "a form" : t.slice(0, 60) || "call link"; break; }
  }
  return {
    overflow: overflow > 1 ? overflow : 0,
    wide,
    images: imgs.length,
    broken,
    noAlt,
    bytes,
    nextStep,
    links: [...document.querySelectorAll("a[href]")].map((a) => a.href).filter((h) => /^https?:/.test(h)),
  };
}

function findMenu() {
  const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 1 && r.height > 1 && c.display !== "none" && c.visibility !== "hidden" && parseFloat(c.opacity) > 0.05 && r.right > 0 && r.left < innerWidth; };
  const btns = [...document.querySelectorAll("button, [role=button], a[aria-controls]")].filter((b) => {
    if (!shown(b) || b.closest("form")) return false;
    const label = `${b.getAttribute("aria-label") || ""} ${b.innerText || ""} ${b.className || ""}`.toLowerCase();
    return b.hasAttribute("aria-controls") || /menu|nav|burger|hamburger/.test(label);
  });
  btns.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const t = btns.find((b) => b.hasAttribute("aria-controls")) || btns[0];
  const inlineLinks = [...document.querySelectorAll("header a, nav a")].filter(shown).length;
  if (!t) return { toggle: false, inlineLinks };
  t.setAttribute("data-check-toggle", "");
  return {
    toggle: true,
    panelId: t.getAttribute("aria-controls") || "",
    toggleLabel: (t.getAttribute("aria-label") || t.innerText || "menu").trim().slice(0, 30),
    expanded: t.getAttribute("aria-expanded"),
    inlineLinks,
  };
}

function menuState(panelId) {
  const shown = (el) => {
    if (!el) return false;
    let o = 1;
    for (let p = el; p; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity);
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && c.display !== "none" && c.visibility !== "hidden" && o > 0.05 && r.right > 1 && r.left < innerWidth - 1 && r.bottom > 0;
  };
  const toggle = document.querySelector("[data-check-toggle]");
  let open;
  if (panelId) open = shown(document.getElementById(panelId));
  else {
    // no aria-controls: guess by counting nav links on screen
    const n = [...document.querySelectorAll("nav a, header a")].filter(shown).length;
    window.__checkNavBase ??= n;
    open = n > window.__checkNavBase;
  }
  return { open, expanded: toggle?.getAttribute("aria-expanded") ?? null };
}

function markCloser(panelId) {
  const panel = panelId && document.getElementById(panelId);
  if (!panel) return false;
  const c = [...panel.querySelectorAll("button, [role=button]")].find((b) => /close|×|✕/i.test(`${b.getAttribute("aria-label") || ""} ${b.innerText || ""}`));
  if (!c) return false;
  c.setAttribute("data-check-closer", "");
  return true;
}

function markMenuLink(panelId) {
  const panel = panelId ? document.getElementById(panelId) : document.querySelector("nav");
  const a = panel && [...panel.querySelectorAll('a[href^="#"], a[href*="#"]')].find((x) => x.getBoundingClientRect().height > 0 && x.getAttribute("href") !== "#");
  if (!a) return false;
  a.setAttribute("data-check-menulink", "");
  return true;
}

function markForm() {
  const shown = (el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 2 && r.height > 2 && c.display !== "none" && c.visibility !== "hidden"; };
  const forms = [...document.querySelectorAll("form")];
  const f = document.querySelector('form[data-check="enquiry-form"]') ||
    forms.find((x) => [...x.elements].some((el) => shown(el) && (el.type === "tel" || el.type === "email" || el.tagName === "TEXTAREA")));
  if (!f) return { found: false, iframes: document.querySelectorAll("iframe").length };
  f.setAttribute("data-check-form", "");
  const fields = [...f.elements].filter((el) => shown(el) && !["submit", "button", "reset", "hidden", "image"].includes(el.type) && el.tabIndex !== -1);
  return { found: true, fields: fields.length };
}

function formOutcome() {
  const f = document.querySelector("[data-check-form]");
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 1 && r.height > 1 && c.display !== "none" && c.visibility !== "hidden" && parseFloat(c.opacity) > 0.05; };
  const txt = (el) => (el?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120);
  const ok = document.querySelector('[data-check="form-success"]');
  const msgs = [...document.querySelectorAll('[data-check="form-error"], [role=alert], [role=status], [aria-live]')].filter((el) => shown(el) && txt(el));
  const invalid = f ? [...f.querySelectorAll('[aria-invalid="true"]')].length : 0;
  return {
    success: shown(ok) ? txt(ok) : "",
    message: msgs.length ? txt(msgs[0]) : invalid ? `${invalid} field(s) marked invalid` : "",
    formGone: !f || !shown(f),
  };
}

function findInvisibleText() {
  const vw = innerWidth;
  const out = [];
  const els = document.body.querySelectorAll("h1, h2, h3, h4, p, li, blockquote, figcaption, dt, dd, a, button, label");
  for (const el of els) {
    if (el.closest("nav, [role=dialog], [aria-modal=true], dialog, [hidden], [aria-hidden=true], details:not([open]), [inert], [data-check-ignore]")) continue;
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
    if (own.length < 3) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 || r.height <= 2 || r.right <= 0 || r.left >= vw) continue; // not laid out, or off to the side (carousel slides, off-canvas)
    const c = getComputedStyle(el);
    if (c.display === "none") continue;
    let o = 1;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity);
    if (o < 0.1 || c.visibility === "hidden") out.push(own.slice(0, 40));
  }
  return out;
}

// ---------- files and report ----------

// Delete only the files an earlier run of this check made, so --out can point anywhere safely.
async function cleanOut() {
  await mkdir(OUT, { recursive: true });
  const ours = ["phone-first-screen.png", "phone-full.png", "phone-menu-open.png", "desktop-first-screen.png", "desktop-full.png", "report.md", "report.json"];
  for (const f of ours) await rm(join(OUT, f), { force: true });
  const pagesDir = join(OUT, "pages");
  if (existsSync(pagesDir)) {
    for (const f of await readdir(pagesDir)) if (/^\d{2}-[a-z0-9-]+-phone\.png$/.test(f)) await rm(join(pagesDir, f));
  }
}

async function writeReport(base) {
  const order = { FAIL: 0, WARN: 1, PASS: 2 };
  results.sort((a, b) => order[a.level] - order[b.level]);
  const count = (l) => results.filter((r) => r.level === l).length;
  const [f, w, p] = [count("FAIL"), count("WARN"), count("PASS")];
  const report = { checked: args.url || resolve(args.site || "site"), at: new Date().toISOString(), summary: { fail: f, warn: w, pass: p }, results, formRequests, pages };
  await writeFile(join(OUT, "report.json"), JSON.stringify(report, null, 2));

  const ref = (r) => (r.ref === "G" ? "found" : r.ref ? `#${r.ref}` : "");
  const md = [
    `# Site check`,
    ``,
    `Checked ${report.checked} on ${report.at.slice(0, 16).replace("T", " ")} UTC, on a phone (390 px) and a desktop (1280 px).`,
    ``,
    `**${f} FAIL · ${w} WARN · ${p} PASS**${f ? " (fix every FAIL before it goes live)" : ""}`,
    ``,
    `## Look at these yourself`,
    ``,
    `A check can't judge taste. Open each screenshot and ask the questions next to it.`,
    ``,
    `| Screenshot | Ask |`,
    `|---|---|`,
    `| phone-first-screen.png | Before scrolling: do I know what they do, where, and how to call? Does any animation start at its beginning, not its end? |`,
    `| phone-full.png | One idea per screen? Anything cramped, side by side and tiny, or empty and boring? |`,
    `| phone-menu-open.png | Is the open menu readable, and is there an obvious way to close it? |`,
    `| desktop-first-screen.png, desktop-full.png | Does the desktop still look deliberate, not a stretched phone page? |`,
    ...(pages.length > 1 ? [`| pages/*.png | Every other page: same questions, and does it end with a next step? |`] : []),
    ``,
    `## Results`,
    ``,
    `Check numbers point at checklist/WEBSITE-CHECKS.md ("found" = the getting-found checks).`,
    ``,
    `| | Check | # | Page | What happened |`,
    `|---|---|---|---|---|`,
    ...results.map((r) => `| ${r.level} | ${r.title} | ${ref(r)} | ${r.page} | ${r.message.replace(/\|/g, "\\|")} |`),
    ``,
    `## What this check can't see`,
    ``,
    `Real reviews (#8), real photos (#9), licences (#10), a page for each service (#11), your area named (#12), details matching Google and Facebook (#14) and where enquiries come from (#15). Go through checklist/WEBSITE-CHECKS.md for those.`,
  ];
  if (formRequests.length) {
    md.push("", "## Requests the check caught (none of these were sent)", "", ...formRequests.map((r) => `- ${r.method} ${r.url}`));
  }
  await writeFile(join(OUT, "report.md"), md.join("\n") + "\n");

  console.log(`\nSite check: ${f} FAIL, ${w} WARN, ${p} PASS`);
  for (const r of results.filter((x) => x.level !== "PASS")) console.log(`  ${r.level}  ${r.title}${r.page !== "/" ? ` (${r.page})` : ""}: ${r.message}`);
  console.log(`\nReport and screenshots: ${OUT}`);
  process.exitCode = f ? 1 : 0;
}

// ---------- small things ----------

function serve(root) {
  const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".mp4": "video/mp4", ".webm": "video/webm", ".webmanifest": "application/manifest+json" };
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      try {
        let file = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
        if (file !== root && !file.startsWith(root + sep)) return res.writeHead(403).end();
        let s = await stat(file).catch(() => null);
        if (s?.isDirectory()) { file = join(file, "index.html"); s = await stat(file).catch(() => null); }
        if (!s && !extname(file)) { const f2 = `${file}.html`; const s2 = await stat(f2).catch(() => null); if (s2) { file = f2; s = s2; } }
        if (!s) {
          const nf = join(root, "404.html");
          return res.writeHead(404, { "content-type": TYPES[".html"] }).end(existsSync(nf) ? await readFile(nf) : "Not found");
        }
        res.writeHead(200, { "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream" });
        res.end(await readFile(file));
      } catch {
        res.writeHead(500).end();
      }
    });
    server.listen(0, "127.0.0.1", () => ok(server));
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const m = argv[i].match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true");
  }
  if (out.help || out.h) {
    console.log("npm run check [-- --url https://site] [--site folder] [--out folder] [--pages 12]");
    process.exit(0);
  }
  return out;
}

function slug(path) {
  return path.replace(/^\/|\/$|\.html$/g, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "home";
}
