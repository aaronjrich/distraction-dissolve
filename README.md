# Dissolve — Hide Distracting Items

Dissolve is a browser extension for Microsoft Edge. Click an ad, a popup, a sidebar or any other distracting piece of a page and it dissolves away. The idea comes from Safari's Distraction Control on the iPhone.

## Features

- Click the extension icon to enter pick mode
- Hover to see what you would pick (red box), click once to select it (green), click again or press `Enter` to dissolve it
- It starts on the smallest item under the cursor. If you want more, use the expand and shrink buttons beside the selection, or `]` and `[`
- The buttons beside the selection also deselect (`Esc` or right-click) and dissolve (`Enter`). Hover a button to see its keys
- Two dissolve effects, chosen in the help panel: Dust (the item breaks apart and drifts off) and Black hole (it spirals into the center)
- Hidden items are remembered for the page and hidden again on your next visit, even if the page layout shifts a little
- Unhide All brings everything back for the current page
- A practice page with three short levels, from the help panel or the first-run prompt
- Debug mode, in the help panel, writes what the picker sees to the browser console

## Limits

- Ads that live inside an iframe from another site are hidden as a whole box. Dissolve cannot see inside them.
- Items are remembered per page (site plus path), not per site.
- If a site renames its page elements, an item may not be found again. Pick it again and it is saved fresh.

## Installation

1. Open Edge and go to `edge://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder

## Development

This is a Manifest V3 extension with no build step.

- `manifest.json`: extension metadata and permissions
- `content.js`: the picker, the dissolve effects and the remembering logic
- `dissolve.css`: styling for the highlight boxes, bar, menu and tooltips
- `background.js`: toolbar click handling, tab screenshots, and opening the practice page
- `practice.html`, `practice.js`, `practice.css`: the practice page
- `privacy-policy.md` and `docs/privacy-policy.md`: the policy, kept identical (the `docs/` copy is served by GitHub Pages)

To test, load the folder unpacked as above. After a change, click the reload arrow on the extension's card and refresh the page you are testing.

## Version

Current version: `1.0.12`

For Edge Add-ons submission details, see [STORE_SUBMISSION.md](STORE_SUBMISSION.md). Ideas for later are in [IDEAS.md](IDEAS.md).

## Support

Support URL: `https://github.com/aaronjrich/distraction-dissolve`

## License

This project is licensed under the MIT License.
