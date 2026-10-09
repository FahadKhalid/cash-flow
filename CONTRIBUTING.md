# Contributing to Cash Flow

Thanks for helping! A few principles keep this project simple and trustworthy.

## Principles

1. **Private by design.** No analytics, trackers, ads, external fonts or CDNs. User data must never leave the device unless the user turns on their own Google Drive sync.
2. **No dependencies, no build step.** Plain HTML, CSS and JavaScript that run by opening `index.html`.
3. **Safe rendering.** Put user text into the page with `textContent`, never `innerHTML`.
4. **Every change is tested.** Add or update checks in `tests/test_cashflow.py`.

## Getting started

```bash
git clone https://github.com/FahadKhalid/cash-flow.git
cd cash-flow
python3 serve.py                                   # run the app
pip install playwright && playwright install chromium
python tests/test_cashflow.py                      # run all tests
```

## Code style

- 2-space indentation, UTF-8, LF line endings (see `.editorconfig`).
- `js/app.js` is organised in sections; the file header lists them. Add new features as a new section.
- New stored fields need a default in `DEF`, validation in `sanitize()`, and, if they should sync, an entry in `sections()`.
- Keep functions small and named for what they do. Prefer pure calculation functions (`agg`, `pa`, `invCalc`, `project`) that can be unit tested.
- Colours come from CSS variables (`--gold`, `--green`, …) so light and dark themes keep working.

## Pull requests

1. Create a branch from `main`.
2. Make the change, add tests, and run the full suite (it must pass 100%).
3. Check the layout on a phone width (360 px) and desktop.
4. Describe what changed and why.

## Content

Lessons must be original wording. Don't copy text from books. Islamic references need a source (Quran ayah or hadith collection and number).
