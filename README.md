# FIFA World Cup 2026 Knockout Bracket

Live demo: https://rupashdas.github.io/Fifa-World-cup-2026---Knockout-Bracket/

An interactive FIFA World Cup 2026 knockout bracket builder. Users can tap teams to advance them through the bracket, pick a champion, and share their prediction via a link, WhatsApp, or Facebook.

## Features

- Interactive bracket selection
- Semi-final, final, and third-place logic is synchronized automatically
- Name entry before sharing to personalize the prediction
- Shareable URL containing the full bracket state
- WhatsApp and Facebook share support
- Export bracket as PNG image
- Responsive mobile and desktop layout

## Files

- `index.html` — Main page and share modal
- `css/styles.css` — Styles and layout
- `js/data.js` — Team data, fixture definitions, and layout geometry
- `js/bracket.js` — Bracket state, rendering, sharing, and export logic

## Usage

1. Open `index.html` in a browser.
2. Tap teams to advance them through the bracket.
3. Pick a champion in the final.
4. Enter your name before sharing.
5. Share the bracket using the share button or export a PNG.

## Deployment

This project is hosted on GitHub Pages:
https://rupashdas.github.io/Fifa-World-cup-2026---Knockout-Bracket/

## Notes

- Predictions are saved in browser local storage.
- The share link encodes the full bracket state so the result is viewable without signup.
- The mobile name entry sheet has been optimized to stay visible when the keyboard opens.
