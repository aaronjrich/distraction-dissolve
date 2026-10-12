# Store listing text for 1.0.12

Paste these into Partner Center. They replace the current listing text, which no longer matches how the extension works.

## Short description

Click any ad, popup or sidebar and watch it dissolve. Hidden items are remembered for next time. Made for Microsoft Edge.

## Full description

Dissolve removes the parts of a web page that get in the way of reading: ads, popups, banners, sidebars and anything else you would rather not look at.

Click the Dissolve icon in the toolbar to start. Hover over the page and a red box shows what you would pick. Click once and it turns green. Click again, or press Enter, and it dissolves.

Dissolve starts with the smallest item under your cursor. If you want a bigger piece, such as the whole ad card instead of just its headline, use the expand button beside the selection. The shrink button goes back down. Both have keyboard shortcuts, and the tip on each button shows them.

Dissolve has two effects, chosen from the help panel. Dust breaks the item into grains that drift away, and it is there from the start. Black hole pulls the item into a swirl until it disappears. You unlock it by finishing the short practice page.

What Dissolve remembers: the items you hide are saved on your device for that page, and they are hidden again the next time you open it, even if the layout has shifted a little. Press Unhide All in the bar to bring everything back.

New to it? The help panel has a short practice page with three levels, so you can learn the controls before using them on a real page.

Everything stays on your computer. Dissolve has no accounts, no tracking and no network access.

Notes:
- Ads inside an iframe from another site are hidden as a whole box. Dissolve cannot see inside them.
- Hidden items are remembered per page, not per site.

## Key features

- Hover to preview in red, click to select in green, click again to dissolve
- Expand and shrink buttons to choose the right size of piece
- Two dissolve effects: Dust, and Black hole (unlocked by finishing the practice)
- Remembers what you hid and hides it again on your next visit
- Unhide All, deselect with Esc or right-click, and Enter to dissolve
- A built-in practice page
- Debug mode in the help panel, which writes what the picker sees to the browser console
- Works on tabs you already had open, with no reload needed
- No tracking, nothing sent anywhere

## What's new in 1.0.12

- The picker now starts from the smallest item under your cursor instead of grabbing a whole sidebar or strip
- Expand and shrink buttons, with keyboard shortcuts, to choose the size of piece
- New dissolve effects, Dust and Black hole, that use the item's real pixels
- Hidden items are saved in the extension's own storage and found again more reliably after a page changes
- Unhide All now works on items restored after a reload
- The icon now works on tabs that were open before an update, and shows a red ! on pages where extensions are not allowed
- A practice page for new users. Finishing it unlocks the Black hole dissolve
- Fixed an error when hovering icons and other SVG graphics
- Works over ads inside iframes and on sites built with web components

## Notes for certification

- `activeTab`: used to act on the tab when the toolbar icon is clicked, and to take a screenshot of that tab for the dissolve animation. The screenshot stays in memory and is never saved or sent.
- `storage`: saves the hidden items (site, page path, and a description of each item) and the user's settings, locally.
- `scripting`: starts the extension on tabs that were already open when it was installed or updated.
- The content script runs on all sites so that items the user hid earlier are hidden again on their next visit. It does not send anything anywhere.
- The extension makes no network requests.
- Privacy policy: https://aaronjrich.github.io/distraction-dissolve/privacy-policy.html

## Search terms

hide ads, remove popups, distraction free, declutter, hide elements, focus, reading mode
