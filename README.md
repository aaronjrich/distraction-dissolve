# Dissolve — Hide Distracting Items

Dissolve is a browser extension for Microsoft Edge that lets you click distracting page elements to hide them temporarily. It is designed to behave like a distraction filter, with direct in-page selection, debug mode, and remembered hidden elements.

## Features

- Click the extension icon to enter pick mode
- Hover a page element to preview selection
- Click once to select, click again to dissolve
- Right-click or press `Esc` to cancel selection
- `Esc` again to exit pick mode
- Debug mode is available in the help panel
- Hidden items are remembered for the current page

## Installation

1. Open Edge and go to `edge://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this repository folder

## Development

This is a Manifest V3 extension.

- `manifest.json` — extension metadata and permissions
- `content.js` — main interaction and hide logic
- `dissolve.css` — hover/selection and UI styling
- `background.js` — toolbar click handling

## Version

Current development version: `1.0.10`

## Microsoft Edge Add-ons Submission

Dissolve is ready for submission to the Microsoft Edge Add-ons store.

### Store listing copy

**Short description:**
Click any webpage element to hide it instantly and remove distracting banners, sidebars, overlays, and more.

**Full description:**
Dissolve helps you stay focused by letting you remove distractions directly in the page. Click the extension icon to enter pick mode, hover to preview a target, and click to select an item. Selected elements glow green and can be dissolved away with a second click. Right-click or press `Esc` to cancel selection, and press `Esc` again to exit pick mode.

**Key features:**
- Quickly hide distracting page elements
- Red hover preview, green selected state
- Cancel selection with right-click or `Esc`
- Debug mode for troubleshooting
- Remember hidden items per page

### Submission requirements

- `manifest.json` with a valid `version`
- 300x300 and 150x150 store icons
- screenshots showing pick mode and hidden results
- a privacy policy URL
- a support URL pointing to this GitHub repo

If you enable GitHub Pages for this repo using the `docs/` folder, the policy URL can be:
`https://aaronjrich.github.io/distraction-dissolve/privacy-policy.html`

Once submitted, Microsoft will review the extension and publish it after approval.

## Support

Support URL: `https://github.com/aaronjrich/distraction-dissolve`

## License

This project is licensed under the MIT License.
