---
layout: default
title: Dissolve privacy policy
---

# Privacy Policy

Last updated: October 11, 2026

## Overview

Dissolve is a browser extension that helps you hide distracting parts of web pages. It has no accounts, no analytics, no advertising and no server. It makes no network requests, and nothing it stores ever leaves your device.

## What is stored on your device

Dissolve saves a small amount of data in the browser's extension storage, on your computer only:

- **Hidden items, per page.** For each page where you hide something, it stores the site address and page path (for example `example.com/news/story`), plus a description of each hidden item so it can be hidden again on your next visit: its position in the page, its tag and class names, its size, and a short piece of its text (up to 80 characters).
- **Your settings.** The dissolve effect you chose, the debug mode switch, and whether you have seen or finished the practice page.

Use **Unhide All** to clear the saved items for a page. Removing the extension removes everything it stored.

## What is not collected

- No personal information.
- No browsing history is sent anywhere. The page list above stays in your browser.
- No tracking, profiling or advertising identifiers.

## Screenshots

When you dissolve an item, Dissolve briefly takes a picture of the visible part of the tab so it can animate the item breaking apart. The picture is held in memory for the length of the animation. It is never saved and never sent anywhere.

## Permissions

- `activeTab`: lets Dissolve act on the tab when you click its icon, and take the picture used for the animation.
- `storage`: saves the items and settings described above, on your device.
- `scripting`: starts Dissolve on a tab that was already open when the extension was installed or updated, so the icon works without reloading the page.
- Content script on all sites: Dissolve runs on every page so that items you hid earlier can be hidden again when you return, without any click from you. On a page where you have hidden nothing it does nothing visible, and it does not read or send page content.

## Contact

For questions or support, visit: `https://github.com/aaronjrich/distraction-dissolve`
