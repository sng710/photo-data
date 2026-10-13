# ארכיון בתמונה 📷 — Archive in a Photo

**Free, private-by-design photo metadata extraction and archival cataloguing — powered by browser-local OCR and optional AI.** No account, paid API, server, image uploads, or build step for the website.

כלי חינמי בעברית לחילוץ מידע מתמונות (EXIF, IPTC, XMP), OCR בעברית/אנגלית/ערבית, הצעות תיאור AI, קטלוג אנושי וייצוא CSV / JSON / JSONL / Dublin Core. מיועד גם לתמונות היסטוריות וארכיונים קהילתיים. **המידע שמופק ב-AI וב-OCR הוא הצעה בלבד, לא עובדה היסטורית.**

![צילום מסך של ממשק הכלי](docs/qa-desktop-v2.3.png)

## פרסום באתר ציבורי ב-GitHub Pages — ללא תשלום

1. יוצרים מאגר **Public** בחשבון GitHub חינמי, לדוגמה `archive-photo-ai`.
2. מעלים את **כל התיקייה**, כך ש-`index.html`, `app.js`, `styles.css` נמצאים **בשורש המאגר**. מומלץ להעלות גם את התיעוד והבדיקות.
3. נכנסים ל-**Settings → Pages → Build and deployment → Deploy from a branch**.
4. בוחרים `main`, תיקייה `/(root)` ושומרים.
5. אתר לדוגמה: `https://YOUR-USERNAME.github.io/archive-photo-ai/`.

**לא להעלות תמונות של מבקרים למאגר.** מבקר פותח את האתר, בוחר קבצים, מקבל מידע ומייצא נתונים בעצמו. הפרויקט לא דורש קוד שרת, DB אצל בעלי האתר, npm או כרטיס אשראי. שימו לב: שלושת הקבצים `index.html`, `app.js`, `styles.css` דרושים יחד בגרסה זו, בניגוד לגרסה 1.1 שהכילה HTML יחיד.

## שימוש בממשק

- גרירת תמונות/תיקיות או לחיצה על **בחירת תמונות** / **תיקייה שלמה**. הדפדפן קורא מטא־דאטה אוטומטית, אך אין צורך להפעיל AI או OCR.
- **AI ו-OCR כבויים כברירת מחדל** ולא מתחילים הורדה ללא סימון ואישור נוסף. אפשר לסמן **תיאור AI** או **OCR** ולהפעיל *ניתוח כל התמונות*, וגם לעבד תמונה בודדת. OCR כולל אפשרות שיפור ניגודיות. בקובץ שאינו נתמך בתצוגת הדפדפן, חילוץ תגים עדיין עשוי לעבוד.
- עורכים שדות של כותרת, יישוב, תקופה/שנה/טווח, צלם, אנשים, אוסף, תיאור, זכויות ומילות מפתח. יש השלמה אוטומטית לערכים קיימים של יישוב, אוסף וצלם.
- סינון GPS ופרטי זיהוי/קשר **מופעל כברירת מחדל בייצוא לשיתוף**. קרדיט לצלם, פרטי זכויות וטקסט OCR נשמרים כברירת מחדל; יש תיבת סימון נפרדת להסרת OCR. מסנני שיתוף חלים על CSV ועל JSON לשיתוף, אך לא על גיבוי JSONL הפרטי. מסנני הפרטיות אינם משנים את המטא־דאטה המקורי בזיכרון.
- **ייצוא JSON לשיתוף** כפוף למסנני הפרטיות; **גיבוי פרטי מלא JSON** מכיל גם מידע רגיש והוא המומלץ לשימור עבודה ולטעינה חוזרת. שמרו אותו במקום פרטי.
- JSONL הוא **גיבוי פרטי מלא שניתן לייבא בחזרה**, כולל רשומות גדולות (מגבלת ייבוא 512MB לקובץ). הייצוא מיועד לגיבוי מקומי ולא לשיתוף ציבורי. JSON רגיל מוגבל ל-25MB; מספר הרשומות לכל פרויקט מוגבל ל-10,000. לפרויקטים גדולים יותר יש לפצל לאוספים.
- אפשר לייצא Dublin Core CSV עם מיפוי בסיסי; יש לבדוק התאמה לסכמת הארכיון שלכם.
- אפשר לבחור תמונות מהרשימה ולעדכן בבת אחת שדות אוסף, יישוב, תקופה, צלם, זכויות ותגיות (מוגבל כברירת מחדל לשדות ריקים). יש אפשרות תצוגה מקדימה בייצוא לשיתוף, אך היא אינה תחליף לבדיקת הקובץ המיוצא.
- אפשר לחשב SHA-256 לקובץ עד 200MB כשהאתר נפתח ב-HTTPS או ב-localhost (WebCrypto).

### שמירה ושחזור

**השמירה האוטומטית כבויה כברירת מחדל, והפעלתה אינה נשמרת בין ביקורים.** ניתן להפעיל אותה באופן מפורש. כאשר היא פועלת, הכלי שומר ב-IndexedDB המקומי של הדפדפן **רק שדות קטלוג שנערכו על ידי אדם ושמות קבצים בסיסיים**. לא נשמרים נתוני EXIF/XMP/IPTC, מיקומי GPS, טקסט OCR, תיאורי AI או קובצי תמונה. עם זאת, שדות הקטלוג עצמם עשויים לכלול פרטים אישיים — אין להפעיל שמירה במחשב ציבורי.

אם קיימת טיוטה, היא מוצעת לשחזור בכניסה הבאה. עד שהמבקר בוחר **שחזור** או **מחיקה**, הוספת תמונות וייבוא פרויקט נחסמים, כך שטיוטה ישנה לא תידרס בשקט. טיוטות נפרדות מקבלות מפתחות ייחודיים; ניהולן בכמה טאבים אינו מערכת לסנכרון בין מכשירים. הטיוטה לא מחליפה גיבוי JSON/JSONL פרטי. כיבוי שמירה אוטומטית מוחק את טיוטת החלון הנוכחי. לחצן **מחיקת כל הטיוטות המקומיות** מוחק גם טיוטות ישנות מגרסאות קודמות, שעשויות להכיל פרטים רגישים; פעולת מחיקה זו דורשת אישור. לאחר שמירה מוצלחת, טיוטות ישנות מ־30 יום מנוקות בהדרגה כדי לצמצם הצטברות, ואילו טיוטות חדשות יותר מטאבים אחרים נשמרות. בעת סגירה תופיע אזהרה רק עבור עריכות או תוצאות ניתוח שלא גובו/נשמרו כראוי.

**אין אחסון אצל בעלי האתר:** כל מבקר עובד מקומית בדפדפן שלו. מחיקת נתוני הדפדפן, גלישה פרטית או שינוי מחשב עלולים למחוק טיוטות.

## מה הכלי יכול ולא יכול לחלץ?

- EXIF: תאריך מקורי **כמחרוזת ללא המרה לשעון UTC**, מצלמה, הגדרות וצילום, קואורדינטות כשיש. נתוני GPS/זמן עלולים להתייחס לסריקה המאוחרת, לא לצילום הישן.
- IPTC / XMP: תגיות, קרדיטים, תיאורים וזכויות שהספרייה מזהה. אין התחייבות לכל פורמט או MakerNote קנייני. לחילוץ מקיף יותר: [ExifTool](https://exiftool.org/).
- OCR לא מדויק תמיד בסריקות פגומות, כתב יד או צילומי גב; תוצאות בעלות ביטחון נמוך מסומנות.
- המודל המובנה הוא `Xenova/vit-gpt2-image-captioning` (תיאור באנגלית, מילון תגיות מוגבל), **לא מערכת מקצועית לזיהוי אנשים, תאריכים, יישובים או אירועים**. יש ניסיון WebGPU כשהמכשיר תומך, אחרת WASM. מודלים חופשיים מורדים מהאינטרנט בפעם הראשונה (עשויים לצרוך מאות MB ואף יותר מ־1GB בהתאם למכשיר ולדיוק המודל; נפח מדויק לא נמדד כאן).
- אין הבטחה לזיהוי מטא־דאטה שנמחק, GPS שנעדר, או זיהוי צלם מתמונה ללא מקור.

## פרטיות ואבטחה

קובצי התמונה אינם מועלים לשרת היישום או ל-GitHub. העיבוד מתבצע בדפדפן. הספריות ומודלי AI נטענים ממקורות חיצוניים: exifr ו-Tesseract.js לפי צורך, Transformers.js והמשקולות בעת שימוש ב-AI. פירוש הדבר **לא** אתר אופליין מלא או בידוד מוחלט מצד שלישי. אין אנליטיקה, מערכת משתמשים או endpoint להעלאת תמונות בקוד. ראו [PRIVACY.md](PRIVACY.md) ו-[SECURITY.md](SECURITY.md).

מסנני שיתוף אינם מסוגלים לזהות באופן מושלם מידע אישי בתוך **שמות הקבצים, טקסט חופשי, תיאורים או ערכים לא שגרתיים במטא־דאטה**. בדקו כל ייצוא לפני פרסום.

## פיתוח ובדיקות

אין build step לאתר. קוד היישום נמצא ב-`app.js`, העיצוב ב-`styles.css`, ושלד הדף ב-`index.html`. הפעלה מקומית מומלצת דרך שרת סטטי (לדוגמה `python -m http.server 8000`) ולא `file://`, משום שתכונות מסוימות תלויות ב-secure context. אין צורך בהרצת בדיקות או התקנת Node לצורך פרסום/שימוש באתר.

בדיקות המפתח:

```bash
npm install # נדרש רק לבדיקות; אין צורך להתקין כדי לפרסם באתר
python -m pip install playwright pillow beautifulsoup4
python -m playwright install chromium
node --check app.js
python tests/test_app.py --real-exifr
python tests/test_live_origin.py --require
python tests/test_accessibility.py
npx html-validate index.html
```

GitHub Actions מריץ את הבדיקות, HTML validation ו-axe באופן אוטומטי לאחר push / pull request. **השירות החיצוני להפעלת AI וקובצי השפות של OCR לא אומתו בבדיקה המקומית בלי גישה לרשת**; ראו [QA.md](QA.md) להבחנה בין בדיקות שעברו לבדיקות שמוכנות ל-CI ועדיין דורשות הרצה.

### Development note

The browser integration layer supports dependency injection for deterministic tests by assigning `window.__ARCHIVE_DEPENDENCIES__ = { exifr, captioner, ocrWorker }` **before** `app.js` runs. Tests use the unmodified application source; live exifr tests use its actual UMD distribution installed by npm in CI. Source uploads and users' image bytes are never committed as part of a real user session.

## רישוי

קוד הפרויקט ברישיון MIT, ראו [LICENSE](LICENSE). קוד/מודלי צד שלישי כפופים לרישיונות שלהם: [exifr](https://github.com/MikeKovarik/exifr), [Tesseract.js](https://github.com/naptha/tesseract.js), [Transformers.js](https://github.com/huggingface/transformers.js) ו-[מודל התיאור](https://huggingface.co/Xenova/vit-gpt2-image-captioning). **חובת הבדיקה של זכויות תמונות, רישיונות מודלים וזכויות יוצרים בנתוני הארכיון נשארת בידי מפרסמי התוכן.**

### Known deployment limitations (v2.3)

The external libraries and models are downloaded only when needed and their behavior must be tested on the deployed origin. SRI for external scripts, vendored dependencies and a network-verified CSP are still pending; **version pinning is not cryptographic integrity**. This offline environment cannot obtain the npm dependency tree, so `package-lock.json` has not been generated; run `npm install` in a networked environment, commit the resulting lockfile, and change CI to `npm ci` before treating deployment as reproducible. See `QA.md`.

### SRI and lockfile completion (network-connected maintainer)

Run `node tools/compute-sri.mjs` to retrieve the two precise pinned CDN bundles and print their `sha384-…` digests. Independently verify the bytes/provenance. Then wire the *verified values* into the two `loadScript(url, integrity)` calls in `app.js`; the loader already applies `crossOrigin='anonymous'` when a hash is supplied. **No integrity values are bundled in v2.3**, so this is an outstanding security task, not a completed protection.

To create a genuine npm lockfile, run `npm install --package-lock-only --no-audit --no-fund` in a trusted networked environment; verify the resulting `package-lock.json`, commit it, and replace `npm install` with `npm ci` in `.github/workflows/qa.yml`. Do not fabricate a lockfile offline.

## Release history

Changes by version are documented in [CHANGELOG.md](CHANGELOG.md).

### Network / CSP audit before narrowing permissions

On a network-connected workstation, with the synthetic sample image only, run:

```bash
python tests/audit_external_requests.py
python tests/audit_external_requests.py --ocr
python tests/audit_external_requests.py --ai
```

The last two commands download OCR/model assets and may be slow or consume significant bandwidth. They intentionally do **not** run in the default CI workflow. Inspect all network origins and any CSP violations. Do not claim vendor-only, offline or complete privacy until source assets are self-hosted and tested.
