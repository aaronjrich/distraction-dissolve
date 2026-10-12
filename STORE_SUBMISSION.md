# Microsoft Edge Add-ons Submission

Submission notes for Dissolve. The ready-to-paste listing text for 1.0.12 is in [STORE_LISTING_1.0.12.md](STORE_LISTING_1.0.12.md).

## Before you submit 1.0.12

1. Load the folder unpacked at `edge://extensions` and run the checks below.
2. Zip the extension files only: `manifest.json`, `content.js`, `background.js`, `dissolve.css`, `practice.html`, `practice.js`, `practice.css`, and the `icons` folder. Leave out `docs`, the `.md` files and `.git`.
3. In Partner Center, upload the zip and paste the text from `STORE_LISTING_1.0.12.md`.
4. Submit it yourself.

## Checks before submitting

- Click the icon on a news page. Hover is red, selected is green, a second click dissolves.
- Hover empty page space. Nothing highlights, and the whole page is never picked.
- Select a headline in a card and use the expand button to take the whole card.
- Dust shows the item's real pixels breaking apart, not a flat color. If it is a flat color, the tab screenshot is failing, so check the `activeTab` permission.
- Reload the page. Hidden items stay hidden. Unhide All brings them back.
- With a tab open, reload the extension, then click the icon on that tab without refreshing it. Pick mode should start.
- Click the icon on `edge://extensions`. The icon shows a red `!` for a moment.
- In the help panel, Black hole shows as locked ("finish the practice"). Open the practice page from the help panel, finish all three levels, and read the unlock screen. Black hole should now be selectable, and "Switch to Black hole for me" should select it.
- Try the practice buttons (Next level, Reset, Switch to Black hole) with the mouse, since pick mode covers the page with a click-capture layer.

## Permissions

- `activeTab`: act on the current tab when the icon is clicked, and take the screenshot used for the dissolve animation.
- `storage`: save hidden items and settings locally.
- `scripting`: start the extension on tabs that were already open when it was installed or updated.
- Content script on all sites (`matches: <all_urls>`): hides remembered items again when you return to a page. The extension has no host permissions and makes no network requests.

## Submission requirements

- `manifest.json` with a valid `version`
- 300x300 and 150x150 store icons (not in the repo yet)
- screenshots showing pick mode and hidden results (not in the repo yet)
- a privacy policy URL
- a support URL pointing to this GitHub repo

If you enable GitHub Pages for this repo using the `docs/` folder, the policy URL can be:
`https://aaronjrich.github.io/distraction-dissolve/privacy-policy.html`

Once submitted, Microsoft will review the extension and publish it after approval.
