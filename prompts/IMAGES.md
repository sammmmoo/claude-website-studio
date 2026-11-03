# Images (optional)

Claude can't make pictures. If the site needs scenery, like a background, a texture or a mood shot behind the headline, an image tool can make it. I use Codex for this. Any image tool works.

**Only scenery.** Never a made-up photo of the owner's work, team, van, shopfront, customers, or a before and after. Those are proof, and proof is real or absent.

Fill the brackets and paste this into Codex (or your image tool):

---

Make [number] images for a service business website. They're background scenery, not photos of the business's work.

- The business: [what they do, where, from PRODUCT.md]
- What each image is for: [e.g. behind the headline on the first phone screen, with white text on top]
- The look: [from DESIGN.md if impeccable has written one: colours, mood. Otherwise: calm, natural light, real places]
- No text, logos, faces or people in the images.
- No tools, vans, uniforms or job sites that could look like this business's own work.
- Sizes: one tall version for phones (4:5, at least 1080 px wide) and one wide version for desktop (16:9, at least 1920 px wide) of each.
- Save them as webp, under 300 KB each, in `site/images/`, named [what-it-is]-phone.webp and [what-it-is]-desktop.webp.

---

Then tell Claude which images you made. Claude places them, writes the alt text, and runs `npm run check` again.
