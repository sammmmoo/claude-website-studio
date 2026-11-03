# Claude Website Studio

The setup I use to build websites with Claude. Tell it about your business, and it writes the page, designs it, builds it, then checks it on a phone the way your customers will see it.

I've audited over 100 business websites, and it's the same mistakes every time. So this folder gives Claude 15 checks to build to, and a test that taps through your site on a phone before you go live.

## Deciding vs making

Every website is two jobs.

- **Deciding:** what the page says, the one main button, what goes on each screen, how short the form is. This is where enquiries are won or lost.
- **Making:** the look, then the code.

Claude does both here, in that order. It interviews you, writes the words, and shows you the plan screen by screen before it builds anything. Then it designs with [impeccable](https://github.com/pbakaus/impeccable), a free design skill that gives Claude a design eye, so pages stop looking AI-made. Then it builds the site and checks it.

You decide what's true: your services, your area, your photos, your reviews. Claude never makes those up.

Codex is optional: on a website, I only use it for images ([prompts/IMAGES.md](prompts/IMAGES.md)).

## What you need

- [Claude Code](https://claude.com/claude-code), on a Claude plan that includes it.
- [Node.js](https://nodejs.org) 20 or newer, for the design skill's installer and the check.
- I use Opus 5.5 at extra high effort for websites. It's slower and uses more of your plan, and for a site it's worth it.

## Quick start

1. **Download this folder.** On GitHub: Code, then Download ZIP. Unzip it and open a terminal in the folder.
2. **Start Claude Code** with the model and effort I use:
   ```
   claude --model opus --effort xhigh
   ```
3. **Say `Set me up.`** Claude installs impeccable and the check, then asks you to restart Claude Code once so the design skill loads.
4. **Say `Build my website.`** It interviews you one question at a time, then shows you the words for every screen. Say yes, or change them.
5. Claude builds it in `site/`, runs the check, looks at every screenshot and fixes what's wrong. Then a fresh Claude reviews it.
6. You get the phone screenshots, the check result, and a list of anything it still needs from you (real photos, reviews, licence numbers).

Already got a site? Say `Check my site at https://...`, or run it yourself:

```
npm install
npx playwright install chromium
npm run check -- --url https://your-site.com.au
```

## The check

`npm run check` opens your site the way a customer does, on a phone (390 px wide) and on a desktop. It:

- screenshots the first screen and the whole page, with scroll animations forced visible so nothing looks empty
- taps the phone menu open and shut, because a screenshot can't tell you it won't close
- fills in the form with test details and sends it, then looks for the thank-you message. The check catches what the form sends, so it never really goes out, and it blocks ad pixels while it does, so no fake lead lands in your ad account
- checks the call link dials a real number, nothing scrolls sideways, every image loads, the text is big enough to read, there's a button on the first screen, and every page ends with a next step
- switches on reduced motion and switches off JavaScript, and flags any text that stays invisible
- follows the links from your home page and checks those pages too

It writes `check/out/report.md` and the screenshots. Anything marked FAIL gets fixed before it goes live. `npm test` runs it on a good site and a broken one, to prove it catches what it should.

## What's in here

| File | What it does |
|---|---|
| `AGENTS.md` | The rules: the build steps, the design rules and the 15 checks. Claude reads it first (`CLAUDE.md` points to it). Codex reads it too. |
| `brief/BRIEF.md` | Your business, filled in with Claude. `brief/EXAMPLE-BRIEF.md` shows a finished one. |
| `brief/PRODUCT-TEMPLATE.md` | Becomes `PRODUCT.md`, the business record impeccable reads before it designs. |
| `checklist/WEBSITE-CHECKS.md` | The 15 checks, plus three on getting found by Google and AI tools. |
| `check/` | The phone and desktop check, and its tests. |
| `prompts/REVIEW.md` | The prompt for a fresh Claude to review the build. |
| `prompts/IMAGES.md` | Optional: a prompt for Codex or any image tool, for scenery only. |
| `site/` | Your website ends up here. |

## Putting it live

`site/` is plain files, so any host works: Cloudflare Pages, Netlify, GitHub Pages, or the host you already pay for. Ask Claude to walk you through the one you pick. Before it goes live:

- connect the form to wherever your enquiries should land (Claude asks you in the brief), then send yourself a test
- point your domain at it
- add the site to Google Search Console (free), so you can see the searches that find you

## Credits

- [impeccable](https://github.com/pbakaus/impeccable) by pbakaus, under the Apache License 2.0. It isn't copied into this repo: the setup step installs it from its own source, pinned to 4.8.0, the version this folder was checked with (`npx impeccable update` gets the newest). `brief/PRODUCT-TEMPLATE.md` follows impeccable's PRODUCT.md format so the two work together, and the signs of an AI-made page in `prompts/REVIEW.md` come from impeccable's README.
- impeccable adds design hooks that check UI files after each edit. Hooks run by themselves, outside Claude's approval prompts; after setup you can read exactly what runs in `.claude/settings.local.json`. When a new design starts, it fetches design directions from impeccable.style; `npx impeccable telemetry off` stops it recording which ones you pick.
- [Playwright](https://playwright.dev) by Microsoft, under the Apache License 2.0, installed by npm for the check.
- Not affiliated with or endorsed by Anthropic, OpenAI or impeccable's author.

## Licence

Free to use under the [MIT licence](LICENSE): use it, change it, share it, keep the copyright line. Made by Sam at [OP Digital](https://opdigital.com.au). We're improving it all the time, so check back.
