# Contributing

Thanks for helping community archives. Keep the tool **free to run, buildless for GitHub Pages, source-transparent, browser-local, accessible and privacy-aware**.

Before opening a pull request:

1. Run `node --check app.js`, the Chromium regression tests and HTML/a11y checks described in README.
2. Do not introduce image upload endpoints, analytics, paid API requirements, or server-side storage without explicit discussion and a privacy update.
3. Keep camera-original date strings intact, distinguish source metadata from AI guesses, and check any export privacy changes.
4. Add a synthetic/permission-safe fixture when fixing an EXIF, IPTC, XMP or OCR bug; never commit private user photographs.
5. Document third-party model, training-data and license changes, especially where commercial use may be affected.

Issues and PRs can be written in Hebrew or English.

For v2.3 and later: avoid including release ZIP files inside the repository; never commit vendor binaries without provenance, licenses and checksums. Keep package.json and APP_VERSION equal; QA asserts this.
