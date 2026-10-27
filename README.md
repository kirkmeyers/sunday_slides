# Sunday Slides

A browser tool that turns each Sunday's sermon slide requests into finished ProPresenter slides for Watermark Community Church's Dallas Sunday services.

Every Sunday morning, the listener on Pro 3 reads the communicator's manuscript and writes a request file into the service folder. Sunday Slides loads that file and builds the deck in sermon order: points, scripture one verse per slide, quotes, and on-screen text. Production cues become slide notes. You look it over, fix what needs fixing, and export a `.probundle` with live, editable text on the series theme's own slides.

It's the Sunday counterpart to [porch_slides](https://github.com/kirkmeyers/porch_slides) and follows the same approach: Vite, fully client-side, hosted on GitHub Pages.

## Features

- **Four ways to load requests:** the Load requests button, dragging the `.txt` onto the page, pasting the text into the Paste text box (⌘Enter builds), or a `#outline=` link (the listener's "Open in Sunday Slides" button on Start Here).
- **Scripture the Sunday way:** one verse per slide, no verse numbers in the text, and the passage's full reference (for example, "Acts 27:21-25") on each slide. A verse too tall for the text box is split between sentences. Poetry (Psalms, Proverbs, Job, Song of Solomon, Lamentations) is set in its printed lines.
- **Checked against the ESV:** on load, each verse is compared with the ESV from the Bolls Bible API.
  - Spacing slips like "brothersand" are fixed.
  - When the manuscript quotes only the start of a verse, the rest of the verse is shown dimmed.
  - Anything else that differs is flagged, with a side-by-side comparison and a Use ESV text button.
- **Line breaks like the operators make them:** points are balanced over their lines, breaking at phrase boundaries, and scripture never ends on a one- or two-word line.
- **Translations:** a translation named in the request file (`Scripture: Romans 8:18 (NIV)`) or the `# translation:` header carries through to the slides. The slide itself shows only the reference; anything other than the ESV is named in the ProPresenter slide and group labels, the grid and the proof sheet, for example "Romans 8:18 (NIV)". In the editor, the Translation picker (ESV, KJV, NIV, NIV 84, NASB, NASB 1995, NLT, ASV, CSB, the same list as porch_slides) switches the whole passage. Text comes from Bolls, or from the manuscript when you switch back to the request file's translation. Bolls doesn't carry the NIV, so NIV verses become "text needed" slides to type into, unless that NIV's translation file is loaded (see below). A loaded translation file is used in place of Bolls.
- **Quotes** use the scripture layout, with the author in the reference box.
- **Cues** (`Cue:` lines) ride along as ProPresenter slide notes on the next slide. From the editor, a cue can become its own text slide or a placeholder slide.
- **Warnings where the operator sees them:**
  - `# flag:` and `# check:` lines from the listener.
  - References the tool adjusted.
  - Verses that need text.
  - Text too tall for its box.
  - These are listed in the left panel and badged on each slide.
- **Grid and editor:** in the grid, click to select, use the arrow keys to move, drag to reorder, press Delete to remove the selected slide (⌘Z undoes it), and double-click or press Enter to open a slide. In the editor, type directly on the slide as in ProPresenter. Enter adds a line break, Option+Enter splits the slide at the cursor, and Dim / undim (⌘D) dims the selected words. You can also merge, delete, and add blank slides.
- **Exports:**
  - **ProPresenter bundle** (`YYYYMMDD - Sunday - LastName.probundle`): live text built from the theme's template slides, with cues as slide notes and the content bar image included.
  - **Transparent PNGs** at 3840×2160, one at a time or all as a ZIP (`YYYYMMDD - Sunday - LastName - 012 acts_27_21-25 v21.png`).
- **Review link** (`#review=`): the whole deck in a link, for a communicator or producer to look over.
- **Proof sheet:** a printable list of every slide, its notes and its warnings.

## Quick start

```bash
npm install
npm run dev
```

Open the address Vite prints, then click **Load sample** to try it with the Acts 27-28 requests from October 25, 2026.

```bash
npm test         # parser, scripture, layout and export tests
npm run build    # production build in dist/
```

## Deploying to GitHub Pages

`.github/workflows/deploy.yml` builds and deploys the site on every push to `main`.

1. In the GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main`.

`vite.config.js` sets `base: './'`, so the site works under the repository's Pages path.

## The request file

The listener writes `/Volumes/Video_Team/_Service Prep/Sunday/<YYYYMMDD>_DAL/Sermon content/<YYYYMMDD>_DAL_requests.txt`. The format is defined in [reference/sunday-request-format.md](reference/sunday-request-format.md), and two real examples are in `reference/`.

In short: a header of `# key: value` lines (`service`, `title`, `series`, `communicator`, `translation`, `passage`, plus any `# flag:` lines), then one entry per line in sermon order:

```text
Point: Pray for a miracle
Scripture: Acts 26:12-15
> 12 “In this connection I journeyed to Damascus… 13 At midday, O king, I saw…
# check: Doesn't match ESV closely
Quote: “You have, like no other person…” – Charles Swindoll
Text: There was a time in my life when…
Cue: Show Truman Show poster
```

The tool treats that format as the contract. If the tool needs something more, it should come from a new header key or entry type from the listener.

### Opening from a link

`#outline=<payload>` carries a request file, zipped (DEFLATE, one file named `d`) and URL-safe base64 encoded without padding. It uses the same encoding as porch_slides, so the Node example in the [porch_slides README](https://github.com/kirkmeyers/porch_slides#4-load-from-link-outlinepayload) works unchanged; point it at this site's URL. In the browser console, `await encodeOutlineLink(text)` builds one.

## NIV 84 from a local file

The NIV is under copyright, so its text never ships with the site. Each computer that needs the NIV 84 loads it once:

1. Put the NIV 1984 PDF at `reference/NIVBible_1984.pdf`. PDFs and JSON files in `reference/` are gitignored.
2. On a Mac, run:

   ```bash
   npm run niv84 -- reference/NIVBible_1984.pdf
   ```

   This writes `reference/niv84.json`, about 4 MB, and lists anything it couldn't place. It reads the PDF's fonts to find books, chapters and verse numbers, and the page layout to put the two columns in order.
3. In Sunday Slides, open **Settings → Load translation files** and choose `niv84.json`. The browser keeps it (IndexedDB), and NIV 84 then works like any other translation in the picker.

Review links carry the finished slide text, so teammates opening one don't need the file. They only need it to pull NIV 84 text themselves.

The PDF isn't a perfect source, so check NIV 84 slides by eye:
- **Em dashes:** the PDF prints em dashes as hyphens. The converter restores them by rule ("morning—the sixth day", but "seed-bearing" and "twenty-two"), and a few will still be wrong.
- **LORD:** the PDF lost its small caps. LORD is restored where the PDF leaves a clue and in "Sovereign LORD". In the Old Testament, the rest take their case from the ESV verse when both have the same number of "Lord"s; otherwise they stay "Lord".
- **Plain "NIV":** this is the 1984 text. A request for plain "NIV" means the 2011 edition, which still has to be typed in.

## Other translations from ProPresenter

ProPresenter's licensed Bibles (`.rvbible` files) can be turned into translation files in the same shape as `niv84.json`, keyed by book id (1-66), chapter and verse. Like the NIV 84, they're licensed text: they stay on this machine and never ship with the site.

1. Copy the `.rvbible` files off the Pro machine.
2. Run:

   ```bash
   npm run rvbible -- "/path/to/RV Bibles/"*.rvbible
   ```

   This writes one file per translation to `reference/` (or the folder after `--out`), about 4 MB each, and lists any verses it had to combine. Each file uses the translation's code from the Translation picker:

   | File | Translation | Code |
   |---|---|---|
   | `esv.json` | ESV | `ESV` |
   | `niv2011.json` | NIV (2011) | `NIV2011` |
   | `csb.json` | CSB | `CSB17` |
   | `nasb1995.json` | NASB 1995 | `NASB_1995` |
   | `nlt.json` | NLT | `NLT` |
   | `asv.json` | ASV | `ASV` |
   | `nkjv.json` | NKJV | `NKJV` (not yet in the picker) |
3. In Sunday Slides, open **Settings → Load translation files** and choose any of them; several can be chosen at once. Each is listed in Settings with its verse count and a Remove button, and loading a translation that's already there replaces it.

An `.rvbible` is a zipped Digital Bible Library bundle, with one USX file per book. The converter keeps only verse text, as the NIV 84 file does: headings, Psalm titles, introductions, footnotes and cross-references are left out, and small-caps "Lord" is printed LORD.

Things to know when reading the output:
- **Verse counts differ by translation.** Modern translations leave out a few verses that the NKJV and NASB keep (Matthew 17:21, for example), and the CSB prints Acts 24:6–8 as verse 6. These are the translations, not conversion errors.
- **Combined verses:** the NLT prints 24 pairs of verses in Numbers 1–2 as one ("20-21"). The text is kept under the first number, so the second comes back empty.
- **A loaded file comes before Bolls.** Once a translation's file is loaded, its text comes from the file instead of Bolls, and the compare box says "local file". That includes the ESV check on load when `esv.json` is loaded.

## Using the output in ProPresenter

1. Click **ProPresenter bundle** and copy the `.probundle` to the Pro machine.
2. Double-click it, or drag it into ProPresenter, to import the presentation.
3. Each slide uses the series theme's text boxes, so you can still edit text in ProPresenter. Groups follow the request file: one group per scripture passage, point, quote or text entry. Cues are in the slide notes.

The PNG export is a backup. It produces transparent 3840×2160 images that can be dropped onto slides as foreground media.

## Themes

A theme is a folder in `src/themes/`. It holds a copy of the ProPresenter theme file (`Theme.bin`), its image assets, and an `index.js` that says which template slide and text boxes each kind of slide uses, and which bundled web fonts stand in for the theme's fonts. Text box positions, sizes, fonts, alignment, line spacing and colors are read from the theme file itself.

Currently included: **Sunday Acts - Fall** (Lato Light text, Oswald SemiBold references). Sunday Generic and NOPAW come next.

## Project layout

```
index.html, app.js, style.css   UI
src/requests.js                 request file parser
src/bible.js                    references, verse splitting, poetry, Bolls API, ESV comparison
src/local-bibles.js             translation files kept in the browser (NIV 84, ProPresenter Bibles)
src/slides.js                   entries -> slides, automatic line breaks and splits
src/layout.js                   text wrapping, balancing, fitting
src/render.js                   canvas drawing for the preview and PNGs
src/theme.js                    ProPresenter theme reader
src/propresenter.js             live-text .pro / .probundle export
src/protobuf.js                 small schema-less protobuf reader/writer
src/links.js                    #outline= and #review= links
src/themes/acts-fall/           theme file, content bar, layout config
src/fonts/                      Lato and Oswald (SIL Open Font License)
scripts/niv84.js                NIV 84 PDF -> JSON (macOS; uses scripts/pdf-runs.swift)
scripts/rvbible.js              ProPresenter .rvbible files -> JSON, one per translation
```

## Notes

- Scripture text is quoted from the manuscript, which the listener has already checked against the ESV. The Bolls comparison is a second check. The NIV can't be fetched from Bolls, so NIV passages use the manuscript text unchecked.
- Real manuscripts, service folders and ProPresenter libraries stay out of this repository. Only the two sample request files are committed.

## License

Internal tool for Watermark Community Church.
