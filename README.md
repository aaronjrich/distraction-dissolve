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

To publish this extension to the Microsoft Edge Add-ons store, package the extension source as a ZIP file and submit it through the Microsoft Edge Partner Center.

Required items:
- `manifest.json` with a valid `version`
- 300x300 and 150x150 store icons
- screenshots of the extension in use
- a privacy policy URL
- a support URL (your GitHub repo)

Once submitted, Microsoft will review the extension and publish it after approval.

## License

This project is licensed under the MIT License.
