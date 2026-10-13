# Privacy / פרטיות

- The static site has no backend, login, image ingestion route, upload button to a remote server, or analytics in its application code. Selected images are read locally and not uploaded to GitHub by the app.
- EXIF / XMP / IPTC extraction runs in the browser; model inference and OCR run in the browser. **Third-party JavaScript and language/model resources are downloaded on demand**, so those providers can observe ordinary HTTP request information (e.g. user IP); downloaded third-party code has the technical privilege of running on the page.
- Autosave is **off by default**. When deliberately enabled, IndexedDB stores only user-authored catalog fields and basic file identity (filename, size and last-modified time); no source EXIF, GPS, OCR, AI captions or photo bytes are stored. Catalog fields themselves can contain personal information and are not encrypted. Drafts created by v2.0 may still contain full source metadata until the user deletes them. Browser caching of model weights is managed separately by the browser/libraries.
- Sharing export starts with GPS and identity/contact field filters ON. Photographer credit, copyrights and rights statements are preserved. OCR text is included unless the separate “exclude OCR” toggle is enabled. Filtering by key names is necessarily incomplete, especially for filenames, free-text notes, OCR contents, uncommon GPS fields and obscure proprietary metadata. Users must inspect exported files before sharing.
- The **full private JSON or JSONL backup** deliberately includes potentially sensitive information. Do not publish it to public repositories.
- Hosting/CDN providers may keep normal access logs. GitHub Pages may have its own platform-level practices beyond this app.
- Do not use the tool to infer permission to publish a photo merely because copyright metadata is absent.

This app is a browser-local tool; it does **not** claim total offline operation, end-to-end encryption of stored drafts, or universal prevention of third-party data access.

**v2.3:** AI and OCR are disabled by default. Enabling them and confirming starts third-party library/model downloads. Visitors should not assume all third-party code is sandboxed; the app does not itself upload original images, but remotely loaded executable code remains a trust boundary. A preview of filtered sharing fields is provided before export; personal information in free text can still leak.
