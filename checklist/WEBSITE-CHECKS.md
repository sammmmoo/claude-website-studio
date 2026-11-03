# Does your website win the enquiry?

15 checks. Each says what good looks like, what to fix today, and how it gets checked here: **auto** means `npm run check` tests it, **look** means Claude (and you) check it in the screenshots, **owner** means it needs something only you have.

Claude marks each one PASS, FIX or OWNER before it calls the site done. You can run the same list on any site from your phone.

## First screen

| # | Check | Good looks like | Fix it today | How it's checked |
|---|---|---|---|---|
| 1 | Says what you do and where | "Blocked drains fixed today, Brisbane's northside", not "Welcome to our website". | Rewrite the headline as [service] in [area]. | auto (`headline`: no h1, "Welcome", or below the first screen) + look |
| 2 | One main button, visible on a phone | "Call now" or "Get a quote" without scrolling. | Pick one action. Put it in the header and the first screen. | auto (`main-action`) + look at `phone-first-screen.png` |
| 3 | Tap-to-call works | Tapping your number on a phone dials it. | Make the number a tap-to-call link. | auto (`tap-to-call`: a `tel:` link with a real number) |
| 4 | Loads fast on a phone | Usable in a few seconds on mobile data. | Run pagespeed.web.dev and shrink the biggest images first. | auto (`page-weight`, rough) + pagespeed.web.dev on the live site |
| 5 | Readable without zooming | Big enough text, thumb-sized buttons. | Check it on your own phone, one-handed. | auto (`text-size`, `tap-targets`, `no-sideways-scroll`, the menu taps) + look |

## The form

| # | Check | Good looks like | Fix it today | How it's checked |
|---|---|---|---|---|
| 6 | Short | Name, phone, what you need, suburb. | Cut every field you don't need to quote. | auto (`form-short`: more than 5 fields warns) |
| 7 | Something happens after they send it | A message saying what happens next and when, plus a text or email. | Fill it in yourself today and time the reply. | auto (`form-sends`, `form-errors`) + owner (the reply really arrives) |

## Proof

| # | Check | Good looks like | Fix it today | How it's checked |
|---|---|---|---|---|
| 8 | Real reviews | Recent Google reviews, word for word. | Show your best real reviews. Never edit them. | owner + look (nothing invented) |
| 9 | Real photos | Your jobs, your team, your van or shopfront. | Swap three stock photos for phone photos of real work. | owner + look; auto checks every image loads and has alt text |
| 10 | Licences and insurance | Licence numbers and memberships where they apply. | Add them to the footer. | owner |

## Pages and next steps

| # | Check | Good looks like | Fix it today | How it's checked |
|---|---|---|---|---|
| 11 | A page for each main service | What's included, where, and the questions people ask. | Start with the service that earns you the most. | look (the check follows every link from the home page and screenshots each page) |
| 12 | Your service area is named | The suburbs or regions you cover. | Add a "Where we work" section. | look |
| 13 | Every page ends with a next step | A button or number at the bottom of every page. | Add one to every page that dead-ends. | auto (`next-step`, on every page) |
| 14 | Details match everywhere | Same name, address and phone on the site, the Google profile and Facebook. | Check them side by side. | owner |
| 15 | You know where enquiries come from | You can see searches, form fills and calls. | Set up Google Search Console (free) and ask every new customer how they found you. | owner |

## Getting found

Looking good isn't getting found. Three more checks you can do yourself in a few minutes.

| | Check it | Good looks like | Fix it | How it's checked |
|---|---|---|---|---|
| **SEO**: does Google know what you do, and where? | Search [your service] [your suburb] in a private window. The blue link Google shows for you is your page title. | Your page title names the service and the area, e.g. [Service] in [Area] \| [Business]. Every service page has its own. | Change your homepage title, then each service page's. | auto (`page-title`, `meta-description`) |
| **AEO**: does your site answer what people ask? | Write down the six questions customers ask you on the phone. Are the answers on your site? | A plain-English FAQ on the homepage and service pages, e.g. "How quickly can you get here?" | Add those six answers this week, in your words. | look |
| **GEO**: do AI tools like ChatGPT know who you are? | Ask ChatGPT, or Google's AI answers, "What does [business] do?" and "Who does [service] in [area]?" | Your business details written in code machines read (LocalBusiness schema), the same everywhere online. Optional: a plain summary file for AI tools (llms.txt). It's new and not every tool reads it yet. | Add LocalBusiness schema with your name, phone, area and hours. | auto (`business-schema`) |

Honest limit: nobody can promise you a ranking. These make it easier for Google and AI tools to understand what you do and where. They don't guarantee a position, and anyone who promises one is guessing.
