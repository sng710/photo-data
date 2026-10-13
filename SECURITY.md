# Security policy

Please report vulnerabilities privately using **GitHub → Security → Report a vulnerability** if the repository has private reporting enabled. Otherwise, contact the repository maintainer privately rather than publishing a working exploit or real personal data in a public issue.

Do not upload real historical photos, precise coordinates, medical or other personal data, or an unredacted archive JSON as part of a security report.

## Current trust model

- No hosted database or image upload API.
- On-demand remote JS/CDN and model resources are supply-chain dependencies. Version pinning is not cryptographic verification; SRI/vendor hardening is still outstanding. No full vendor bundle or verified complete CSP allowlist is included. Models, ONNX runtime, OCR workers and language data are external dependencies.
- IndexedDB is opt-in, same-origin local browser storage (catalog fields and basic file identifiers only) and not encrypted by this app. Older v2.0 drafts may still contain sensitive source metadata; use the visible “מחיקת כל הטיוטות המקומיות” button to erase all browser drafts (with confirmation). It disables autosave.
- Sharing filters are best-effort, not foolproof anonymization.

Supported application branch: `main` (latest 2.x). Review `QA.md` for known limitations.

A complete vendor release needs verified, licensed binary bytes for exifr, Tesseract + worker/core/language data, Transformers + ONNX runtime and model weights. Current CDN/model requests are **not offline**, and remote supply-chain code may read page data. Do not advertise this as completely private from external code until dependencies are vendored and the CSP has been verified in a live network trace.
