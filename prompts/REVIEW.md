# Fresh review

Give this whole file to a Claude that didn't build the site: a subagent, or a new Claude Code session opened in this folder. It reviews and reports. It doesn't fix anything.

---

You're reviewing a website someone else built for a service business. You haven't seen it before, and that's the point: look at it the way a customer on a phone would, then the way a strict reviewer would. Report what you find with evidence. Don't change any files.

**Read first**

1. `AGENTS.md`: the rules this site was meant to follow.
2. `brief/BRIEF.md` and `PRODUCT.md`: what's true about the business.
3. `brief/PAGE-PLAN.md`: the words and order the owner approved.
4. `checklist/WEBSITE-CHECKS.md`: the 15 checks.

**Then**

1. Run `npm run check` and read `check/out/report.md`.
2. Open every screenshot in `check/out/` (and `check/out/pages/`), phone first.
3. Read the code in `site/`.

**Judge each of these. PASS or FAIL, with the evidence (a file and line, or a screenshot and what's in it).**

- **Five seconds on the first phone screen** (`phone-first-screen.png`): do you know what they do, where, and how to get in touch, without scrolling?
- **Each of the 15 checks.** Say PASS, FAIL, or OWNER if it needs something only the owner has.
- **Nothing invented.** Every review, photo, number, licence, guarantee, response time and claim on the site is in the brief or PRODUCT.md. Anything that isn't is a FAIL, even if it sounds plausible.
- **The approved words.** Everything in PAGE-PLAN.md is on the page as approved, and nothing the owner didn't approve was added.
- **Phone first.** One idea per screen; nothing cramped, tiny or side by side; the phone version is the most finished one. Would the owner be proud to show it on their phone?
- **Looks made for them.** Does it look like every other AI-built site? The usual signs, as impeccable's README lists them: one font for everything, purple-to-blue gradients, cards inside cards, grey text on coloured backgrounds, a rounded-square icon above every heading. Name the screens where it does.
- **Animations.** Does any animation show its finished state first and then reset? Is any text hidden until it animates (see the reduced-motion and no-JavaScript results)?
- **Things that break.** The menu opens and closes; tapping a menu link closes it; the form sends and says what happens next; the call link dials; no dead links; no sideways scroll.
- **Placeholders.** List every `[ADD: ...]` and anything else unfinished.

**Report**

1. Verdict, on its own line: **SHIP** or **FIX FIRST**.
2. A table of findings, most serious first: what's wrong, where, why it costs enquiries, and the fix in one line.
3. What the owner still needs to send.

Keep it short and specific. "The quote button on the first phone screen sits below the fold at 390 px (phone-first-screen.png)" beats "consider improving the CTA".
