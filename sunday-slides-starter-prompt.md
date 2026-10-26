# Starter prompt: Sunday slide generator

Paste everything below the line into a new Claude Code (or Antigravity) project, in a new empty folder on the laptop. Before starting, copy these three files from this repo into the new folder, under `reference/`:

- `docs/sunday-request-format.md`
- `samples/sunday/20261018_DAL_requests.txt`
- `samples/sunday/20261025_DAL_requests.txt`

---

I'm Kirk Meyers, Video Production Director at Watermark Community Church in Dallas. I want to build **sunday_slides**, a browser tool that turns each Sunday's sermon slide requests into finished ProPresenter slides for our Dallas Sunday services. It's the Sunday counterpart of a tool I already built for The Porch, and it should follow the same approach.

## Reference: the Porch tool

- Live: https://kirkmeyers.github.io/porch_slides/
- Code: https://github.com/kirkmeyers/porch_slides

Read its code before designing anything. Reuse its structure and proven pieces where they fit:
- Vite, fully client-side, deployed to GitHub Pages with `base: './'` and a GitHub Actions workflow.
- The Bolls Bible API fetch, with retry on 429 and a "text needed" path for the NIV, which Bolls no longer serves.
- The request-file loading: a "Load requests" button, drag and drop, and a `#outline=` link that carries the file zipped and URL-safe base64 encoded.
- The communicator field and file naming, the review link (`#review=`), the proof sheet, and the PNG, ZIP and ProPresenter `.probundle` export in `propresenter.js`.

Sunday is different enough that this is its own project, not a mode of porch_slides. Don't copy Porch's visual design. Sunday's design specs will come from me (see "Ask me first").

## Where the input comes from

A listener on our Pro 3 machine reads the preacher's Word manuscript each Sunday morning and writes a **request file** into the service folder on our creative.space server:

`/Volumes/Video_Team/_Service Prep/Sunday/<YYYYMMDD>_DAL/Sermon content/<YYYYMMDD>_DAL_requests.txt`

The format is defined in `reference/sunday-request-format.md`. Two real examples are in `reference/`: Acts 26 (Oct 18, 2026) and Acts 27-28 (Oct 25, 2026). In short: a header of `# key: value` lines, then one entry per line in sermon order:

- `Point:` a sermon point.
- `Scripture:` a reference, followed by `>` lines with the verse text from the manuscript.
- `Quote:` a quote, then " – " and who said it.
- `Text:` other on-screen text.
- `Cue:` a production cue. It's not a slide; use it as a slide note or a placeholder.

Treat that format as the contract. If the tool needs something it doesn't carry, tell me, and I'll have the listener add a header key or an entry type rather than you guessing.

## What the tool needs to do

1. **Load a request file** three ways: a "Load requests" button, drag and drop of the `.txt` file, and a `#outline=` link using the same encoding as porch_slides. The listener will put an "Open in Sunday Slides" button on our internal Start Here page that uses that link.
2. **Build slides from the entries, in order:**
   - **Points, quotes and on-screen text:** one slide each, each type with its own layout.
   - **Scripture:** use the `>` text as is by default. Offer a way to re-fetch the passage from Bolls by reference and translation instead. Long passages (8 or more verses are common) must be split across slides by a line limit, with the reference on each slide.
   - **Cues:** don't produce visible slides. Carry them as ProPresenter slide notes on the next slide, or as clearly marked placeholder slides. Ask me which.
3. **Edit:** a grid view of all slides and a single-slide editor, the same as porch_slides. Allow changing text, splitting or merging scripture slides, reordering, and deleting.
4. **Review:** a review link like porch_slides' `#review=`.
5. **Export:** transparent PNGs individually and as a ZIP, plus a ProPresenter `.probundle`. Name files `YYYYMMDD - Sunday - <LastName> - <info>.png`, with the communicator's last name taken from the `# communicator:` header.
6. **Show the header's `# flag:` lines and any `# check:` lines** where the operator will see them, as warning badges like porch_slides uses.

## Ask me first, before writing code

- The output **canvas sizes**: 4K 3840×2160, our LED wall at 7920×1650, or both. Plus the exact ProPresenter text box positions, fonts and sizes for each slide type. I can give you reference slides to measure.
- The **line limits** for scripture slides, and how the reference should look.
- Whether **cues** become slide notes or placeholder slides.
- Whether any of the **Porch tool's code** should be shared (copied) rather than rewritten.

## How I work

- **Stack:** Vite, fully client-side, no backend. Vanilla JS (`index.html`, `app.js`, `style.css`, ES modules) unless the UI needs React; ask if unsure.
- **UI style:**
  - A dark UI with a left controls panel and a scaled live preview of the full-resolution canvas.
  - Colors from the Watermark palette as CSS variables: `#003A5D` navy, `#1D252C` charcoal, `#48565A` slate, `#F2F0EC` off-white, `#B9D2DC` light blue.
  - Oswald for titles, Lato for UI text, with slide fonts per the design.
  - No decorative emojis; use SVG icons.
  - A "Load Sample" button that loads `reference/20261025_DAL_requests.txt`, a Help modal, and toasts.
- **Fonts:** bundle them locally with `@font-face`, and wait for `document.fonts.ready` before measuring text, so line breaks match across Macs.
- **Scripture:** quote it exactly and always show the translation. Default to ESV.
- **Git:** `git init` on `main`, and make small, focused commits with Conventional Commit messages (`feat:`, `fix:`, `docs:`). Never push; I push with GitHub Desktop. The repo may be public, so don't commit real manuscripts or anything beyond the two sample request files.
- **README:** write a real one covering purpose, features, quick start, GitHub Pages deployment, the request-file format, and how the output is used in ProPresenter.

Start by reading porch_slides and the reference files, then ask me the "Ask me first" questions before you build.
