## v2.3 actual local verification (14 October 2026)

**PASSED**: `node --check app.js`; Python `tests/test_static.py` (DOM references, version consistency, no ZIP in repo, EXIF preservation setting, opt-in checkboxes); `python tests/test_app.py` (Chromium browser, metadata fixture, negative GPS/CSV formula guard, simulated AI/OCR, no-text OCR retry, IndexedDB stub/recovery, bulk editing, share-preview privacy settings, JSON/JSONL round trip, thumbnails and 390px mobile screenshot). Screenshots saved under `docs/qa-*-v2.3.png`.

**NOT RUN**: `npx html-validate` (npm unavailable here), browser axe with real npm package, Playwright live localhost/IndexedDB and SHA-256, `--real-exifr` test, real network download of exifr/Tesseract/Transformers and ONNX model, external request host audit, and full GitHub Actions. Earlier reports of v2.2 green steps do not imply these v2.3 checks passed.

**OPEN RELEASE GATES**: verified vendoring of all executable/model assets; allowlist CSP after a live request trace; source dependencies and genuine npm lockfile (`npm ci`); modularization/format-lint; full real-model license/quality tests. No fake vendor files, hash or lockfile are included.

---

# QA report — Archive in a Photo v2.3.0 — 14 October 2026

## Executed locally and passed

- `node --check app.js`
- `python tests/test_static.py`
- `python tests/test_app.py` with the actual application code and simulated external AI/OCR
- `python -m py_compile tests/*.py`
- Real local JPEG fixture structure checked using Pillow, including camera-local EXIF date in the correct sub-IFD
- Browser regressions: uploading images, thumbnail sizing, deduplication, editing, CSV injection guards, privacy filters, JSON/JSONL exports and imports, OCR no-text retry handling, UI layout at 390px, recovery banner and clear-all-drafts control

## Addressed from the latest user audit

1. **HTML validation:** uppercase DOCTYPE, HTML boolean `hidden`, `prefer-native-element` set to off for the custom accessible progress indicator. The exact npm HTML validator is **not installed here**, so this remains to be verified in GitHub Actions.
2. **Live-origin test race:** wait for `#draftStatus` to report saved before reloading. More importantly, application IndexedDB operations now wait for **transaction commit**, not an IDB request's `onsuccess`. Mocked IndexedDB was updated to signal real transaction-completion behavior.
3. **CSP:** GPS display no longer uses a blocked inline `style=` attribute; it uses `.gps-cell` in `styles.css`.
4. **Old draft privacy:** a user-confirmed UI action clears all IndexedDB drafts, including legacy v2.0 ones; opt-in is not persisted. Successful saves remove the restored old key and prune drafts older than 30 days. Recent draft keys are retained to avoid destroying work in another active tab.
5. **AI download message:** removed inaccurate “250MB+” lower bound and warned that fp32 WebGPU may consume substantially more.

## Not verified in this environment

- **Native IndexedDB / real SHA-256 live-origin test**: local Chromium navigation reports `ERR_BLOCKED_BY_ADMINISTRATOR`. The test remains in CI and now waits for transaction-commit confirmation.
- `npx html-validate index.html`, browser axe, and real `exifr` npm package integration: npm registry access is unavailable locally. The user reported real exifr and axe tests passed on v2.1; they were not re-run locally on v2.2.
- Real Tesseract OCR workers, live Transformers.js models, WebGPU first inference, and CSP on the deployed GitHub Pages site.
- External script SRI and `package-lock.json` were **not generated**. Hashes and lockfiles must be derived from actual verified bytes/dependency resolution; the repository continues to use `npm install` in CI.

**Release gate:** Do not state that GitHub CI or live AI is fully green until the workflow passes on a networked runner and the model and OCR have been checked on the deployed origin.

## Remaining considerations

- Large galleries need performance testing with real data, and multi-tab edits remain unsynchronized. The 30-day cleanup only removes stale drafts; explicit clear deletes them all.
- External JavaScript and model dependencies load from third-party hosts when selected; CSP is not a complete guarantee against exfiltration.
- Metadata fields, AI suggestions, and historical facts must remain distinct. Never interpret AI guesses as confirmed identity, location, event, or date.


## v2.3 changes and gaps
- New browser QA covers AI/OCR default off, explicit analysis consent, share export preview, basic bulk edits and ZIP hygiene.
- SHA-256 duplicate warnings are user-initiated; automated perceptual similarity is not implemented.
- Dependency vendoring, restrictive connect-src verified for all workers/model URLs, service worker/offline mode and npm lockfile are **pending**. Do not describe the site as offline or independent from third-party code.
- v2.3 does not split app.js into ES modules yet; preserving verified data extraction and browser tests takes priority over a high-risk architectural rewrite.

A network-origin audit script is provided in `tests/audit_external_requests.py`; it has **not** been executed here due to network restrictions. It is an opt-in release gate, not a passing CI check.
