// Tests for check.mjs: a good site must pass, a broken one must fail on each planted bug.
// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const checkScript = join(here, "..", "check.mjs");

function runCheck(fixture, out = mkdtempSync(join(tmpdir(), `site-check-${fixture}-`))) {
  const res = spawnSync(process.execPath, [checkScript, "--site", join(here, "fixtures", fixture), "--out", out], {
    encoding: "utf8",
    timeout: 180_000,
  });
  const reportPath = join(out, "report.json");
  assert.ok(existsSync(reportPath), `no report.json for ${fixture}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return { res, out, report };
}

const level = (report, id) => report.results.filter((r) => r.id === id).map((r) => r.level);

test("good site passes with no FAILs and leaves every screenshot", () => {
  const out = mkdtempSync(join(tmpdir(), "site-check-good-"));
  writeFileSync(join(out, "holiday-photo.png"), "not ours"); // --out must never delete files the check didn't make
  const { res, report } = runCheck("good", out);
  assert.ok(existsSync(join(out, "holiday-photo.png")), "the check deleted a file it didn't create");
  const fails = report.results.filter((r) => r.level === "FAIL");
  assert.deepEqual(fails, [], "unexpected FAILs");
  assert.equal(res.status, 0, "exit code should be 0 when nothing fails");
  for (const shot of ["phone-first-screen.png", "phone-full.png", "phone-menu-open.png", "desktop-first-screen.png", "desktop-full.png"]) {
    assert.ok(existsSync(join(out, shot)), `missing ${shot}`);
  }
  assert.ok(existsSync(join(out, "report.md")), "missing report.md");
  assert.deepEqual(level(report, "menu-opens"), ["PASS"]);
  assert.deepEqual(level(report, "menu-closes"), ["PASS"]);
  assert.deepEqual(level(report, "form-sends"), ["PASS"]);
  assert.deepEqual(level(report, "tap-to-call"), ["PASS"]);
  assert.ok(report.formRequests.length >= 1, "the form's request should be caught, not sent");
  assert.ok(report.pages.length >= 2, "should follow the link to the privacy page");
});

test("broken site fails on every planted bug and exits 1", () => {
  const { res, report } = runCheck("broken");
  assert.equal(res.status, 1, "exit code should be 1 when something fails");
  const expectFail = [
    "menu-closes", // .mobile-nav{display:flex} beats [hidden]: the menu never closes
    "no-sideways-scroll", // a 600px element on a 390px phone (services.html)
    "page-loads", // the home page links to gallery.html, which doesn't exist
    "images-load", // missing.jpg
    "tap-to-call", // tel:PHONE_NUMBER placeholder
    "form-sends", // submit handler does nothing visible
    "reduced-motion-visible", // .reveal{opacity:0} with no reduced-motion fallback
  ];
  for (const id of expectFail) {
    assert.ok(level(report, id).includes("FAIL"), `expected ${id} to FAIL, got ${JSON.stringify(level(report, id))}`);
  }
  assert.ok(level(report, "no-js-visible").includes("WARN"), "hidden-until-JS text should WARN");
  assert.ok(level(report, "meta-description").includes("WARN"), "missing description should WARN");
});

test("a form that sends by GET is caught, never really sent", () => {
  const { report } = runCheck("getform");
  const sent = report.formRequests.map((r) => r.url);
  assert.ok(sent.some((u) => u.startsWith("https://forms.example.net/submit?")), `GET submit not caught: ${JSON.stringify(sent)}`);
  assert.ok(sent.some((u) => u.startsWith("https://pixel.example.net/tr")), `ad pixel not caught: ${JSON.stringify(sent)}`);
  assert.deepEqual(level(report, "form-sends"), ["PASS"]);
});
