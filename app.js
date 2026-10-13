(() => {
'use strict';
const $ = (id) => document.getElementById(id);
const items = [];
const selectedIds = new Set();
const adapters = globalThis.__ARCHIVE_DEPENDENCIES__ || {};
const APP_VERSION = '2.3.0';
const APP_NAME = 'ארכיון בתמונה';
const MAX_JSON_BYTES = 25 * 1024 * 1024;
const MAX_ITEMS = 10000;
const PAGE_SIZE = 120;
let visibleLimit = PAGE_SIZE, listTimer = 0, unsavedCatalog = false, unsavedAnalysis = false, saveTimer = 0, lastSavedDraft = null;
let recoveryPending = false, pendingRecovery = null, autosaveReady = false, savingDraft = Promise.resolve(), restoredDraftKey = null;
const draftSessionKey = 'draft-' + (globalThis.crypto?.randomUUID?.() || (Date.now()+'-'+Math.random()));
let lastAutosaveFailure = false;
const SUPPORTED = /\.(?:jpe?g|png|webp|tiff?|heic|heif|avif|bmp|gif)$/i;
let currentId = null, working = false, stopRequested = false, captionerPromise = null, ocrWorker = null, workerLang = null, sequence = 0, metadataBusy = false, metadataQueue = Promise.resolve();
// MakerNote is proprietary binary data; enabling it can consume huge amounts of memory.
const EXIF_OPTIONS = {tiff:true,ifd0:true,ifd1:true,exif:true,gps:true,interop:true,iptc:true,xmp:{multiSegment:true},jfif:true,ihdr:true,icc:true,userComment:true,makerNote:false,mergeOutput:false,chunkLimit:25,reviveValues:false};
const own = (obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function text(x){return x===null||x===undefined?'':String(x);}
function humanBytes(n){if(!Number.isFinite(n))return '—';return n<1024? n+' B' : n<1048576 ? (n/1024).toFixed(1)+' KB' : (n/1048576).toFixed(1)+' MB';}
function flash(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>t.hidden=true,4300);}
function status(msg){$('statusText').textContent=msg;}
function progress(done,total){const p= total? Math.round(done/total*100):0;$('progressFill').style.width=p+'%';$('progressBar').setAttribute('aria-valuenow',p);}
function setBusy(v){working=v;for(const id of ['runAll','clearBtn','importBtn']) $(id).disabled=v || metadataBusy || (id!=='importBtn'&&items.length===0); $('stopRun').disabled=!v;$('filesInput').disabled=v;$('folderInput').disabled=v; ['csvBtn','wideBtn','dcBtn','jsonBtn','backupBtn','jsonlBtn'].forEach(id=>$(id).disabled=v||metadataBusy||items.length===0);}
function setCounts(){const count=items.length;const ok=items.filter(i=>i.metadataDone).length;const ai=items.filter(i=>i.caption).length;const ocr=items.filter(i=>i.ocrText).length;
  $('summary').innerHTML=`<span class="pill">${count} תמונות</span><span class="pill">${ok} נבדקו למטא־דאטה</span><span class="pill">${ai} תיאורי AI</span><span class="pill">${ocr} תוצאות OCR</span>`;
  scheduleExportPreview();
  if(!working){$('runAll').disabled=!count||metadataBusy;$('clearBtn').disabled=!count||metadataBusy;['csvBtn','wideBtn','dcBtn','jsonBtn','backupBtn','jsonlBtn'].forEach(id=>$(id).disabled=!count||metadataBusy);}
}

const isPlain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const DRAFT_DB = 'archive-photo-ai-v2-drafts';
function openDraftDb() {
  return new Promise((resolve,reject)=>{
    if (!('indexedDB' in window)) {reject(new Error('IndexedDB אינו זמין'));return;}
    const request=indexedDB.open(DRAFT_DB,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('drafts'))request.result.createObjectStore('drafts');};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function draftOp(mode,method,value,key=draftSessionKey){
 const db=await openDraftDb();
 try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');
   const request=method==='getAll'?store.getAll():method==='get'?store.get(key):method==='put'?store.put(value,key):method==='clear'?store.clear():store.delete(key);
   let result;
   request.onsuccess=()=>{result=request.result;};
   request.onerror=()=>reject(request.error || new Error('Draft request failed'));
   // A successful IDBRequest is NOT a committed transaction. Wait for commit
   // before telling users their catalog is safely saved.
   tx.oncomplete=()=>resolve(result);
   tx.onerror=()=>reject(tx.error || new Error('Draft transaction failed'));
   tx.onabort=()=>reject(tx.error || new Error('Draft transaction aborted'));
 });}finally{db.close();}
}
async function pruneOldDrafts(){
 // Keep drafts from other active tabs; only remove old completed sessions.
 // Never prune an unresolved recovery draft or the draft being written.
 if(recoveryPending)return;
 try{
  const drafts=await draftOp('readonly','getAll');
  const oldest=Date.now()-30*24*60*60*1000;
  for(const draft of drafts){
   if(!draft?.draftKey||draft.draftKey===draftSessionKey||draft.draftKey===restoredDraftKey)continue;
   const savedAt=Date.parse(draft.savedAt||'');
   if(Number.isFinite(savedAt)&&savedAt<oldest)await draftOp('readwrite','delete',null,draft.draftKey);
  }
 }catch(e){console.warn('Old draft cleanup skipped',e);}
}
function safeDraftItem(item){
 // Only user-authored fields; never write EXIF, XMP, GPS, OCR, AI output, full paths, or image pixels to IndexedDB.
 return {fileName:item.name,relativePath:item.name,fileSizeBytes:item.size,fileModifiedAt:item.lastModified?new Date(item.lastModified).toISOString():'',
 sourceMetadata:{},extractedFromSource:{},machineSuggestions:{},verifiedCatalog:{...item.record},
 metadataExtractionWarning:'טיוטת דפדפן אינה כוללת נתוני מקור; יש לצרף מחדש את הקבצים כדי לחלץ מטא־דאטה.'};
}
function markDirty({catalog=false,analysis=false}={}) {
 if(catalog)unsavedCatalog=true;
 if(analysis)unsavedAnalysis=true;
 if(!$('autosaveOptIn').checked||recoveryPending||!autosaveReady)return;
 clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void saveDraft();},1600);
}
async function saveDraft(){
 clearTimeout(saveTimer);
 if(!$('autosaveOptIn').checked||recoveryPending||!autosaveReady||!items.length)return;
 const data={schemaVersion:2,draftKey:draftSessionKey,name:APP_NAME,version:APP_VERSION,savedAt:new Date().toISOString(),items:items.map(safeDraftItem)};
 savingDraft=savingDraft.catch(()=>{}).then(async()=>{
  if(recoveryPending||!$('autosaveOptIn').checked)return;
  try{await draftOp('readwrite','put',data);lastSavedDraft=data.savedAt;unsavedCatalog=false;lastAutosaveFailure=false;
   $('draftStatus').textContent='טיוטת קטלוג נשמרה מקומית (ללא תמונות, מטא־דאטה ו-OCR).';
   // A restored draft is migrated only after the new session committed successfully.
   if(restoredDraftKey&&restoredDraftKey!==draftSessionKey){const oldKey=restoredDraftKey;restoredDraftKey=null;try{await draftOp('readwrite','delete',null,oldKey);}catch(e){console.warn('Old restored draft retained',e);}}
   void pruneOldDrafts();}
  catch(e){lastAutosaveFailure=true;console.warn('Local draft unavailable',e);$('draftStatus').textContent='שמירה מקומית נכשלה; יש לייצא גיבוי JSON לפני סגירה.';}
 });
 await savingDraft;
}
async function deleteAllLocalDrafts(){
 // Explicit user action only: clears v2.0 legacy drafts (possibly containing GPS)
 // as well as more recent opt-in catalog drafts on this origin.
 clearTimeout(saveTimer);
 await savingDraft.catch(()=>{});
 await draftOp('readwrite','clear');
 pendingRecovery=null;recoveryPending=false;restoredDraftKey=null;
 $('recoveryBanner').hidden=true;
 $('autosaveOptIn').checked=false;
 unsavedCatalog=items.length>0;
 lastAutosaveFailure=false;
 $('draftStatus').textContent='כל הטיוטות המקומיות נמחקו. שמירה אוטומטית כבויה.';
}
async function forgetDraft(key=draftSessionKey){
 clearTimeout(saveTimer);await savingDraft.catch(()=>{});try{await draftOp('readwrite','delete',null,key);}catch(e){console.warn(e)}
 pendingRecovery=null;recoveryPending=false;$('recoveryBanner').hidden=true;
}
async function checkRecovery(){
 try{
  const entries=await draftOp('readonly','getAll');
  const drafts=entries.filter(x=>x?.items?.length).sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')));
  if(drafts.length){const data=drafts[0];pendingRecovery=data;recoveryPending=true;lastSavedDraft=data.savedAt;$('recoveryBanner').hidden=false;
   $('draftStatus').textContent='נמצאה טיוטה קודמת. יש לשחזר או למחוק אותה לפני המשך העבודה.';
  }
 }catch(e){console.warn('Draft restore unavailable',e);$('draftStatus').textContent='שמירה מקומית אינה זמינה בדפדפן הזה; יש לייצא JSON.';}
 finally{autosaveReady=true;}
}
function guardRecovery(){if(!recoveryPending)return false;
 flash('נמצאה טיוטה קודמת. יש לשחזר או למחוק אותה תחילה כדי למנוע אובדן נתונים.');
 $('restoreDraft').focus();return true;}
function isEditingDetail(){const a=document.activeElement;return a && $('detail').contains(a) && a.matches('input[data-field],textarea[data-field],select[data-field]');}
function safeRenderDetail(force=false){if(force||!isEditingDetail())renderDetail();}
function scheduleList(){clearTimeout(listTimer);listTimer=setTimeout(renderList,120);}
function loadScript(src, integrity=null) {return new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=src;script.async=true;
  // Apply SRI only with a hash computed from the exact verified distribution bytes.
  if(integrity){script.integrity=integrity;script.crossOrigin='anonymous';}
  script.onload=resolve;script.onerror=()=>reject(new Error('לא ניתן להוריד ספרייה חיצונית: '+src));document.head.append(script);
});}
let exifrPromise=null,ocrLibraryPromise=null;
async function getExifr(){
  if(adapters.exifr)return adapters.exifr;
  if(globalThis.exifr)return globalThis.exifr;
  if(!exifrPromise)exifrPromise=loadScript('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.umd.js').then(()=>globalThis.exifr).catch(e=>{exifrPromise=null;throw e;});
  return exifrPromise;
}
async function getTesseract(){
 if(globalThis.Tesseract)return globalThis.Tesseract;
 if(!ocrLibraryPromise)ocrLibraryPromise=loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js').then(()=>globalThis.Tesseract).catch(e=>{ocrLibraryPromise=null;throw e;});
 return ocrLibraryPromise;
}
async function makeThumbnail(item){
  if(!item.file||!item.previewAvailable)return;
  try {
    const bitmap=await createImageBitmap(item.file);
    const scale=Math.min(1,144/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.7));
    if(blob){if(item.thumbUrl)URL.revokeObjectURL(item.thumbUrl);item.thumbUrl=URL.createObjectURL(blob);}
  }catch(e){console.warn('Thumbnail unsupported',e);}
}

function stringifyValue(v, depth=0){if(v===null||v===undefined)return '';if(v instanceof Date)return Number.isNaN(v.valueOf())?'':v.getFullYear()+':'+String(v.getMonth()+1).padStart(2,'0')+':'+String(v.getDate()).padStart(2,'0')+' '+String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0')+':'+String(v.getSeconds()).padStart(2,'0');if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return v;
 if(ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return `[נתונים בינאריים: ${v.byteLength} bytes]`;
 if(depth>7)return '[מבנה מקונן עמוק]';if(Array.isArray(v))return v.length>400?`[מערך ארוך: ${v.length} ערכים]`:v.map(x=>stringifyValue(x,depth+1));
 if(typeof v==='object'){const r={};for(const [k,val] of Object.entries(v))r[k]=stringifyValue(val,depth+1);return r;}return String(v);
}
function flatten(obj, prefix='', out={},depth=0){if(depth>9)return out;for(const [k,v] of Object.entries(obj||{})){const path=prefix?prefix+'.'+k:k;
 if(v&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof Date)){flatten(v,path,out,depth+1);}else{const val = typeof v==='object' ? JSON.stringify(v):v;out[path]=text(val);}}
 return out;}
function getMetaValue(flat, choices){for(const k of choices){let e=Object.entries(flat).find(([key,v]) => key.split('.').pop().replace(/^PNG_/,'').toLowerCase()===k.toLowerCase() && v);if(e)return e[1];}return '';}
function countFields(item){return Object.keys(flatten(item.metadata)).length;}
function makeMetadataSummary(item){const flat=flatten(item.metadata);const latitude=getMetaValue(flat,['latitude']);const longitude=getMetaValue(flat,['longitude']);
 return {date:getMetaValue(flat,['DateTimeOriginal','DateCreated','CreateDate','DateTimeDigitized','DateTime']),
 camera:[getMetaValue(flat,['Make']),getMetaValue(flat,['Model'])].filter(Boolean).join(' '),
 author:getMetaValue(flat,['Artist','Creator','Byline','Author','Credit','creator']), copyright:getMetaValue(flat,['Copyright','Rights','CopyrightNotice','Copyrighted']),
 title:getMetaValue(flat,['ObjectName','Title','Headline']), description:getMetaValue(flat,['Caption','CaptionAbstract','Description','ImageDescription']),
 software:getMetaValue(flat,['Software','CreatorTool']),latitude,longitude};}
function fallbackExif(file){return file.slice(0,1024*1024).arrayBuffer().then(buffer=>{
 const d=new DataView(buffer),n=d.byteLength,result={};if(n<12)return result;
 const ascii=(a,l,allowNull=false)=>{let s='';for(let j=0;j<l&&a+j<n;j++){const c=d.getUint8(a+j);if(c===0&&!allowNull)break;s+=String.fromCharCode(c);}return s;};
 function parseTiff(base){if(base+8>n)return;const order=ascii(base,2),le=order==='II';if(!le&&order!=='MM')return;const u16=p=>(p+2<=n?d.getUint16(p,le):0);const u32=p=>(p+4<=n?d.getUint32(p,le):0);if(u16(base+2)!==42)return;
 const known={0x010f:'Make',0x0110:'Model',0x0132:'DateTime',0x013b:'Artist',0x8298:'Copyright',0x0131:'Software',0x9003:'DateTimeOriginal',0x9004:'DateTimeDigitized',0x8827:'ISO',0x0112:'Orientation',0xa434:'LensModel',0x010e:'ImageDescription',0x9286:'UserComment'};
 function ifd(offset,type='main'){const start=base+offset;if(start+2>n||start<base)return;const cnt=Math.min(u16(start),200);for(let i=0;i<cnt;i++){const p=start+2+i*12;if(p+12>n)break;const tag=u16(p),typ=u16(p+2),count=u32(p+4),bp=count*(typ===3?2:typ===4?4:1),o=bp<=4?p+8:base+u32(p+8);
 if(tag===0x8769&&type==='main'){ifd(u32(p+8),'exif');continue;}if(tag===0x8825&&type==='main'){ifd(u32(p+8),'gps');continue;}
 if(o<0||o>=n||bp>16384)continue;
 if(type==='gps'){if(tag===1||tag===3)result[tag===1?'GPSLatitudeRef':'GPSLongitudeRef']=ascii(o,count);
  if((tag===2||tag===4)&&typ===5&&count===3&&o+24<=n){const q=[];for(let j=0;j<3;j++){const den=u32(o+j*8+4);q.push(den?u32(o+j*8)/den:0)}result[tag===2?'GPSLatitudeParts':'GPSLongitudeParts']=q;}continue;}
 const key=known[tag];if(!key)continue;
 if(typ===2)result[key]=ascii(o,Math.min(count,2048));else if(typ===3&&count===1)result[key]=u16(o);else if(typ===4&&count===1)result[key]=u32(o);
 }}ifd(u32(base+4));
 if(result.GPSLatitudeParts&&result.GPSLongitudeParts){const v=x=>x[0]+x[1]/60+x[2]/3600;result.latitude=+(v(result.GPSLatitudeParts)*(result.GPSLatitudeRef==='S'?-1:1)).toFixed(7);result.longitude=+(v(result.GPSLongitudeParts)*(result.GPSLongitudeRef==='W'?-1:1)).toFixed(7);}
 }
 if(d.getUint16(0)===0xffd8){let p=2;while(p+4<n){if(d.getUint8(p)!==0xff)break;let marker=d.getUint8(p+1);if(marker===0xd9||marker===0xda)break;const len=d.getUint16(p+2);if(len<2||p+2+len>n)break;if(marker===0xe1&&ascii(p+4,6)==='Exif')parseTiff(p+10);if(marker===0xfe)result.JPEG_Comment=ascii(p+4,Math.min(len-2,16000));p+=2+len;}}
 else if(ascii(0,2)==='II'||ascii(0,2)==='MM')parseTiff(0);
 else if(n>=8&&ascii(1,3)==='PNG'){let p=8;while(p+12<n&&p<Math.min(n,1024*1024)){const len=d.getUint32(p),kind=ascii(p+4,4);if(len>1048576||p+12+len>n)break;if(kind==='tEXt'){const raw=ascii(p+8,Math.min(len,16384),true);const at=raw.indexOf('\0');if(at>=0)result['PNG_'+raw.slice(0,at)]=raw.slice(at+1);}
  if(kind==='iTXt'&&len<65536){const src=new Uint8Array(buffer,p+8,len);let k=src.indexOf(0);if(k>0&&k<len-5){let cursor=k+3;let end=src.indexOf(0,cursor);if(end!==-1){cursor=end+1;end=src.indexOf(0,cursor);if(end!==-1&&src[k+1]===0){const name=new TextDecoder().decode(src.slice(0,k));const value=new TextDecoder().decode(src.slice(end+1));result['PNG_'+name]=value;}}}}
  if(kind==='eXIf')parseTiff(p+8);p+=len+12;}}
 return result;
 }).catch(()=>({}));}
async function dimensions(file){return new Promise(resolve=>{const url=URL.createObjectURL(file),img=new Image();const timer=setTimeout(()=>{cleanup();resolve([null,null]);},5000);
 function cleanup(){clearTimeout(timer);URL.revokeObjectURL(url)}img.onload=()=>{const dims=[img.naturalWidth,img.naturalHeight];cleanup();resolve(dims)};img.onerror=()=>{cleanup();resolve([null,null])};img.src=url;});}
async function extractMetadata(item){const file=item.file;if(!file)return;item.metadataError='';item.metadata={};item.previewAvailable=false;
 try{const exifrLib=await getExifr();if(exifrLib && typeof exifrLib.parse==='function'){const v=await exifrLib.parse(file,EXIF_OPTIONS);item.metadata.exifr=stringifyValue(v||{});
    if(typeof exifrLib.gps==='function'){try{const pos=await exifrLib.gps(file);if(pos&&Number.isFinite(pos.latitude)&&Number.isFinite(pos.longitude))item.metadata.gpsCoordinates=pos;}catch{ /* some formats do not support GPS */ }}}else{item.metadataError='ספריית המטא־דאטה המתקדמת לא נטענה. מוצגים נתוני EXIF בסיסיים בלבד.';}}
 catch(e){item.metadataError='חילוץ מתקדם נכשל: '+text(e.message);}
 try{item.metadata.internal=stringifyValue(await fallbackExif(file));}catch(e){item.metadataError+=' חילוץ בסיסי נכשל: '+text(e.message);}
 const [width,height]=await dimensions(file);item.width=width;item.height=height;item.previewAvailable=width!==null&&height!==null;item.metadataDone=true;
 if(!item.previewAvailable)item.metadataError += (item.metadataError?' ':'')+'הדפדפן אינו יודע להציג פורמט זה, או שהקובץ פגום. AI/OCR ידרשו המרה ל-JPG/PNG; המטא־דאטה המקורי נשמר.';
 if(!countFields(item))item.metadataError += (item.metadataError?' ':'')+'לא נמצאו שדות מטא־דאטה; הדבר שכיח בסריקות ובעותקים שעברו עיבוד.';
 item.summary=makeMetadataSummary(item);await makeThumbnail(item);markDirty();}
function findItem(id){return items.find(x=>x.id===id);}
function filePath(file){return String(file.webkitRelativePath||file.relativePath||file.name).replace(/\\/g,'/');}
function addFiles(files){
  if(guardRecovery())return;
  let added=0,skipped=0;
  for(const file of files){
    if(!file || !(file.type.startsWith('image/') || SUPPORTED.test(file.name)))continue;
    const path=filePath(file);
    const existing=items.find(i=>i.path===path&&i.size===file.size&&i.lastModified===file.lastModified);
    if(existing?.file){skipped++;continue;}
    const saved=existing || items.find(i=>!i.file&&i.name===file.name&&(!i.size||i.size===file.size)&&(!i.lastModified||i.lastModified===file.lastModified)&&(!i.path||i.path===path));
    if(saved&&!saved.file){saved.file=file;saved.path=path;saved.url=URL.createObjectURL(file);saved.size=file.size;saved.fileType=file.type;saved.lastModified=file.lastModified;saved.metadataDone=false;added++;continue;}
    if(items.length>=MAX_ITEMS){flash('הגעתם למגבלת '+MAX_ITEMS+' תמונות בפרויקט. יש לייצא ולהתחיל פרויקט נוסף.');break;}
    const id='p'+(++sequence),item={id,file,url:URL.createObjectURL(file),thumbUrl:null,path,name:file.name,size:file.size,fileType:file.type||'',lastModified:file.lastModified||0,metadata:{},metadataDone:false,metadataError:'',summary:{},width:null,height:null,previewAvailable:false,sha256:'',caption:'',aiTags:[],ocrText:'',ocrConfidence:null,ocrError:'',ocrNotice:'',aiError:'',aiTried:false,ocrTried:false,record:{title:'',settlement:'',year:'',photographer:'',rights:'',description:'',people:'',collection:'',tags:'',notes:'',verification:'ממתין לבדיקה'}};
    items.push(item);if(!currentId)currentId=id;added++;
  }
  if(!added){flash(skipped?'התמונות כבר קיימות בפרויקט; לא נוצרו כפילויות.':'לא נמצאו קובצי תמונה נתמכים.');return;}
  markDirty();metadataBusy=true;status('מחלצים נתוני מטא־דאטה מקוריים...');refresh();
  metadataQueue=metadataQueue.then(async()=>{
    for(const item of items.filter(x=>x.file&&!x.metadataDone)){
      await extractMetadata(item);setCounts();scheduleList();if(item.id===currentId)safeRenderDetail();
    }
  }).catch(e=>{status('חילוץ המטא־דאטה נעצר עקב שגיאה: '+text(e.message));})
  .finally(()=>{metadataBusy=items.some(x=>x.file&&!x.metadataDone);if(!metadataBusy)status('הקבצים נוספו. אפשר להפעיל AI ו-OCR.');refresh();});
}
function filteredItems(){const query=$('searchInput').value.trim().toLowerCase();return items.filter(i=>[i.name,i.path,i.caption,i.ocrText,i.aiTags.join(' '),...Object.values(i.record)].join(' ').toLowerCase().includes(query));}
function updateBatchSelection(){
 const count=selectedIds.size;$('selectedCount').textContent=count+' נבחרו';$('applyBatch').disabled=count===0;
}
function applyBatch(){
 const field=$('batchField').value,value=$('batchValue').value.trim(),onlyEmpty=$('batchOnlyEmpty').checked;
 if(!['settlement','collection','photographer','rights','year','tags'].includes(field)||!value||!selectedIds.size){flash('יש לבחור תמונות ולהזין ערך.');return;}
 const affected=items.filter(i=>selectedIds.has(i.id)&&(!onlyEmpty||!i.record[field]?.trim()));
 if(!affected.length){flash('אין שדות ריקים מתאימים לעדכון.');return;}
 if(!onlyEmpty&&!confirm('להחליף ערכים קיימים ב-'+affected.length+' רשומות? מומלץ לייצא גיבוי פרטי לפני החלפה קבוצתית.'))return;
 for(const item of affected)item.record[field]=value;
 markDirty({catalog:true});refresh();flash('עודכנו '+affected.length+' רשומות.');
}
function refresh(){scheduleList();safeRenderDetail();setCounts();scheduleExportPreview();}
function renderList(){
 const root=$('photosList');root.replaceChildren();
 const filtered=filteredItems();
 if(!filtered.length){root.innerHTML='<div class="empty-small">לא נמצאו תמונות תואמות.</div>';updateBatchSelection();return;}
 for(const item of filtered.slice(0,visibleLimit)){
  const entry=document.createElement('div');entry.className='thumb-entry';
  const pickLabel=document.createElement('label');pickLabel.className='thumb-select-wrap';
  const select=document.createElement('input');select.type='checkbox';select.className='thumb-select';select.checked=selectedIds.has(item.id);select.setAttribute('aria-label','בחירת תמונה לעריכה קבוצתית: '+item.name);
  select.addEventListener('change',()=>{if(select.checked)selectedIds.add(item.id);else selectedIds.delete(item.id);updateBatchSelection();});pickLabel.append(select);entry.append(pickLabel);
  const row=document.createElement('button');row.type='button';row.className='thumbrow'+(currentId===item.id?' active':'');row.setAttribute('aria-label','הצגת תמונה: '+item.name);
  const pic=item.thumbUrl?document.createElement('img'):document.createElement('div');
  if(item.thumbUrl){pic.src=item.thumbUrl;pic.alt='';pic.loading='lazy';} else {pic.className='placeholder';pic.textContent='🖼';}row.append(pic);
  const label=document.createElement('div');label.className='thumbtxt';label.innerHTML=`<strong>${esc(item.record.title||item.name)}</strong><small>${esc(item.width&&item.height?item.width+' × '+item.height:'ממדים לא זמינים')} · ${esc(humanBytes(item.size))}</small><small><span class="st ${item.metadataDone?'ok':''}">${item.metadataDone?'מטא־דאטה נבדק':'בהמתנה'}</span> <span class="st ${item.caption?'ok':item.aiError?'err':''}">${item.caption?'AI מוכן':item.aiError?'AI נכשל':'AI לא הופעל'}</span></small>`;
  row.append(label);row.addEventListener('click',()=>{currentId=item.id;renderList();safeRenderDetail(true);});entry.append(row);root.append(entry);
 }
 updateBatchSelection();
 if(filtered.length>visibleLimit){const more=document.createElement('button');more.className='btn list-more';more.textContent=`הצגת עוד (${filtered.length-visibleLimit} נותרו)`;more.addEventListener('click',()=>{visibleLimit+=PAGE_SIZE;renderList();});root.append(more);}
}
const FIELD_NAMES={title:'כותרת הארכיון',settlement:'יישוב',year:'שנה / טווח / בקירוב (אם מאומת)',photographer:'שם הצלם המאומת',rights:'זכויות / הרשאת שימוש',description:'תיאור בעברית לאחר בדיקה',people:'אנשים מזוהים (מאומת)',collection:'אוסף / משפחה / מקור',tags:'מילות מפתח שאושרו',notes:'הערות, מקור המידע וספקות'};
function renderDetail(){
 const openSections=[...$('detail').querySelectorAll('details[open]')].map(x=>x.dataset.section||'metadata');const root=$('detail');const item=findItem(currentId);if(!item){root.innerHTML='<div class="blank"><strong>כאן יופיעו פרטי התמונה</strong>יש לבחור תמונה מהרשימה.</div>';return;}
 const meta=item.summary||{};const gps=meta.latitude&&meta.longitude ? esc(meta.latitude)+', '+esc(meta.longitude):'לא נמצא';const m=item.metadata||{};const flat=flatten(m);const keys=Object.keys(flat).sort();
 root.innerHTML=`<div class="detailhead">${item.url?`<img class="detailimg" src="${esc(item.url)}" alt="תצוגה מקדימה של התמונה">`:'<div class="placeholder" aria-label="אין תצוגה מקדימה">🖼</div>'}
 <div><h2 class="file-name">${esc(item.name)}</h2><div class="hint">${esc(humanBytes(item.size))} · ${esc(item.fileType||'פורמט לא מזוהה')} · ${esc(item.width&&item.height?item.width+' × '+item.height+' פיקסלים':'לא ניתן לקרוא ממדים')}</div><div class="hint">תאריך שינוי בקובץ (לא בהכרח תאריך צילום): ${item.lastModified?esc(new Date(item.lastModified).toLocaleString('he-IL')):'לא ידוע'}</div><div class="hint">סטטוס: ${item.metadataDone?'המטא־דאטה נבדק':'ממתין לקריאה'}</div></div></div>
 <section class="section"><h3>1. מידע מקורי שנמצא בקובץ</h3><div class="hint">לא כולל ניחושים של מודל AI. מספר שדות מקור שנקראו: ${keys.length}. מידע לא קיים לא ניתן לשחזור מהקובץ.</div>
 <div class="fields"><div><strong>תאריך צילום שנרשם בקובץ</strong><div>${esc(meta.date||'לא נמצא')}</div></div><div><strong>מצלמה</strong><div>${esc(meta.camera||'לא נמצא')}</div></div>
 <div><strong>שם צלם במטא־דאטה</strong><div>${esc(meta.author||'לא נמצא')}</div></div><div><strong>GPS</strong><div dir="ltr" class="gps-cell">${gps}</div></div>
 <div><strong>זכויות במטא־דאטה</strong><div>${esc(meta.copyright||'לא נמצא')}</div></div><div><strong>תוכנת עריכה</strong><div>${esc(meta.software||'לא נמצא')}</div></div>
    <div><strong>כותרת במטא־דאטה</strong><div>${esc(meta.title||'לא נמצא')}</div></div><div><strong>תיאור במטא־דאטה</strong><div>${esc(meta.description||'לא נמצא')}</div></div>
 </div><div class="hint">SHA-256 (טביעת אצבע של קובץ המקור): <span dir="ltr">${esc(item.sha256||'טרם חושב')}</span></div><button data-one="hash" class="btn small" ${working||metadataBusy||!item.file?'disabled':''}>חישוב SHA-256</button>${item.metadataError?`<div class="caution">${esc(item.metadataError)}</div>`:''}
 <details class="section" data-section="metadata"><summary class="meta-toggle">הצגת כל שדות המטא־דאטה שנקראו (${keys.length})</summary><div class="hint">לייצוא מלא אפשר להשתמש בכפתור ״כל שדות המטא־דאטה CSV״ או JSON.</div><table class="meta-table"><tbody>${keys.slice(0,1500).map(key=>`<tr><td>${esc(key)}</td><td>${esc(flat[key])}</td></tr>`).join('')}</tbody></table>${keys.length>1500?'<div class="hint">רק 1500 שדות מוצגים כאן. את כולם אפשר לייצא.</div>':''}</details></section>
 <section class="section"><div class="section-title"><h3>2. תיאור AI (לא מידע מאומת)</h3><button data-one="ai" class="btn small" ${working||metadataBusy||!item.file||!item.previewAvailable?'disabled':''}>הפקת תיאור לתמונה זו</button></div>
 <div class="sourcebox" lang="en" dir="ltr">${esc(item.caption||'טרם הופק תיאור AI.')}</div>${item.aiTags.length?`<div class="hint">תגיות מוצעות בלבד: ${esc(item.aiTags.join(' · '))}</div>`:''}
 ${item.aiError?`<div class="caution">${esc(item.aiError)}</div>`:''}<div class="caution">תיאור המכונה עלול להיות שגוי, בעיקר בתצלומים היסטוריים. המודל אינו יודע לזהות אנשים מסוימים, יישובים, תאריכים או אירועים.</div></section>
 <section class="section"><div class="section-title"><h3>3. OCR — טקסט שמופיע בתמונה</h3><button data-one="ocr" class="btn small" ${working||metadataBusy||!item.file||!item.previewAvailable?'disabled':''}>קריאת טקסט לתמונה זו</button></div>
 <div class="sourcebox" dir="auto">${esc(item.ocrText||'טרם בוצעה קריאת טקסט.')}</div>${item.ocrConfidence!==null?`<div class="hint ${item.ocrConfidence<65?'low-confidence':''}">ציון מנוע OCR: ${esc(Math.round(item.ocrConfidence))}/100 (אינו אישור לנכונות הטקסט)</div>`:''}${item.ocrConfidence!==null&&item.ocrConfidence<65?'<div class="caution">תוצאה בביטחון נמוך — מומלצת בדיקה ידנית של טקסט המקור.</div>':''}${item.ocrError?`<div class="caution">${esc(item.ocrError)}</div>`:''}${item.ocrNotice?`<div class="hint">${esc(item.ocrNotice)}</div>`:''}
 </section>
 <section class="section"><h3>4. פרטי קטלוג — עריכה אנושית</h3><div class="hint">השדות האלה מיועדים לעריכה אנושית ולאמת הארכיונית. שינוי כאן לא משנה את התמונה המקורית.</div>
 ${['settlement','photographer','collection'].map(key=>`<datalist id="history-${key}">${[...new Set(items.map(i=>i.record[key]).filter(Boolean))].slice(0,100).map(value=>`<option value="${esc(value)}"></option>`).join('')}</datalist>`).join('')}
 <div class="fields">${Object.entries(FIELD_NAMES).map(([key,label])=>`<label class="${['description','notes','people'].includes(key)?'wide':''}">${esc(label)}${['description','notes'].includes(key)?`<textarea data-field="${esc(key)}" rows="3">${esc(item.record[key])}</textarea>`:`<input type="text" data-field="${esc(key)}" ${['settlement','photographer','collection'].includes(key)?`list="history-${key}"`:''} value="${esc(item.record[key])}">`}</label>`).join('')}
 <label>סטטוס אימות<select data-field="verification"><option ${item.record.verification==='ממתין לבדיקה'?'selected':''}>ממתין לבדיקה</option><option ${item.record.verification==='דורש אימות'?'selected':''}>דורש אימות</option><option ${item.record.verification==='נבדק ואומת'?'selected':''}>נבדק ואומת</option></select></label></div>
 </section>`;
 for(const el of root.querySelectorAll('details[data-section]'))if(openSections.includes(el.dataset.section))el.open=true;
 root.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('input',()=>{const target=findItem(currentId);if(!target)return;target.record[input.dataset.field]=input.value;markDirty({catalog:true});if(input.dataset.field==='title')scheduleList();}));
 root.querySelectorAll('[data-one]').forEach(btn=>btn.addEventListener('click',()=>runSingle(item,btn.dataset.one)));
 // Avoid destroying focused buttons or stealing a click after a blur.
 root.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('blur',()=>{
   setTimeout(()=>{if(!isEditingDetail()&&!$('detail').contains(document.activeElement))safeRenderDetail();},0);
 }));
}
function inferTags(caption){const vocab={people:'אנשים',person:'אדם',man:'איש',woman:'אישה',child:'ילד',children:'ילדים',family:'משפחה',group:'קבוצה',building:'מבנה',house:'בית',houses:'בתים',street:'רחוב',road:'דרך',tree:'עץ',trees:'עצים',garden:'גינה',flower:'פרחים',flowers:'פרחים',field:'שדה',fields:'שדות',farm:'חקלאות',tractor:'טרקטור',car:'מכונית',truck:'משאית',bus:'אוטובוס',bicycle:'אופניים',cow:'פרה',horse:'סוס',dog:'כלב',cat:'חתול',bird:'ציפור',birds:'ציפורים',baby:'תינוק',school:'בית ספר',classroom:'כיתה',water:'מים',river:'נחל',mountain:'הר',sky:'שמיים',landscape:'נוף',grass:'דשא',military:'צבא',soldier:'חייל',soldiers:'חיילים',uniform:'מדים',black:'שחור',white:'לבן',old:'ישן',historic:'היסטורי',photo:'תצלום',picture:'תמונה',table:'שולחן',chair:'כיסא',food:'אוכל',meal:'ארוחה',wedding:'חתונה',celebration:'חגיגה',crowd:'קהל',beach:'חוף',ship:'ספינה',train:'רכבת'};
 const words=(caption.toLowerCase().match(/[a-z]+/g)||[]);return [...new Set(words.filter(w=>own(vocab,w)).map(w=>vocab[w]))].slice(0,14);}
async function getCaptionerWasm(pipeline,options){return pipeline('image-to-text','Xenova/vit-gpt2-image-captioning',{...options,device:'wasm',dtype:'q8'});}
async function getCaptioner(){
 if(adapters.captioner)return adapters.captioner;
 if(!captionerPromise){captionerPromise=(async()=>{
  status('טוענים ספריית AI חינמית...');
  const {pipeline,env}=await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');env.allowLocalModels=false;
  const options={progress_callback:(p)=>{if(p?.status==='progress'&&typeof p.progress==='number')$('libStatus').textContent='הורדת מודל AI: '+Math.round(p.progress)+'% ('+text(p.file||'מודל')+')';}};
  if(navigator.gpu){try{status('מנסים להפעיל AI דרך WebGPU...');const pipe=await pipeline('image-to-text','Xenova/vit-gpt2-image-captioning',{...options,device:'webgpu',dtype:'fp32'});$('libStatus').textContent='AI מוכן (WebGPU)';return async(...args)=>{try{return await pipe(...args);}catch(e){console.warn('WebGPU inference failed; retry on WASM',e);$('libStatus').textContent='AI: עוברים ל-WASM';captionerPromise=null;const wasm=await getCaptionerWasm(pipeline,options);captionerPromise=Promise.resolve(wasm);return wasm(...args);}};}catch(e){console.warn('WebGPU unsupported, falling back to wasm',e);}}
  status('מורידים מודל AI חינמי; בטעינה ראשונה מדובר בקובץ גדול.');
  const pipe=await getCaptionerWasm(pipeline,options);
  $('libStatus').textContent='AI מוכן (WASM).';return pipe;
 })().catch(e=>{captionerPromise=null;throw e;});}
 return captionerPromise;
}
async function getOCR(){if(adapters.ocrWorker)return adapters.ocrWorker;const lang=$('ocrLang').value;if(ocrWorker&&workerLang===lang)return ocrWorker;if(ocrWorker){await ocrWorker.terminate();ocrWorker=null;}
 const Tesseract=await getTesseract();if(!Tesseract)throw new Error('ספריית OCR לא זמינה.');
 status('מורידים בפעם הראשונה קובצי שפה ל-OCR ('+lang+')...');
 const w=await globalThis.Tesseract.createWorker(lang,1,{logger:(m)=>{if(m&&typeof m.progress==='number')$('libStatus').textContent='OCR: '+text(m.status)+' '+Math.round(m.progress*100)+'%';}});
 ocrWorker=w;workerLang=lang;return w;}
async function doCaption(item){item.aiError='';item.aiTried=true;try{const pipe=await getCaptioner();status('AI מתאר: '+item.name);if(!item.previewAvailable)throw new Error('הפורמט אינו נתמך לתצוגה בדפדפן; יש להמיר ל-JPG או PNG.');const output=await pipe(item.file,{max_new_tokens:45});
 const caption=Array.isArray(output)?output[0]?.generated_text:output?.generated_text;item.caption=typeof caption==='string'?caption.trim():'';item.aiTags=inferTags(item.caption);if(!item.caption)throw new Error('המודל לא החזיר תיאור.');}
 catch(e){item.aiError='לא ניתן להפעיל AI: '+text(e?.message||e);item.caption='';}}

async function prepareOcrImage(file){
 if(!$('ocrPreprocess').checked)return file;
 try {
  const bitmap=await createImageBitmap(file),scale=Math.min(2.2,2200/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const img=ctx.getImageData(0,0,canvas.width,canvas.height),data=img.data;
  for(let j=0;j<data.length;j+=4){const grey=.299*data[j]+.587*data[j+1]+.114*data[j+2];const adjusted=Math.max(0,Math.min(255,(grey-128)*1.35+128));data[j]=data[j+1]=data[j+2]=adjusted;}
  ctx.putImageData(img,0,0);return canvas;
 }catch(e){console.warn('OCR preprocess failed; using original',e);return file;}
}

async function doOCR(item){item.ocrError='';item.ocrNotice='';item.ocrTried=true;try{const worker=await getOCR();status('קוראים טקסט: '+item.name);if(!item.previewAvailable)throw new Error('הפורמט אינו נתמך בדפדפן; יש להמיר ל-JPG או PNG.');const out=await worker.recognize(await prepareOcrImage(item.file));item.ocrText=text(out?.data?.text).trim();item.ocrConfidence=out?.data?.confidence??null;
 if(!item.ocrText)item.ocrNotice='לא זוהה טקסט ברור. אפשר לנסות שוב ידנית עם שפה או הגדרות אחרות.';else item.ocrNotice='';}
 catch(e){item.ocrError='לא ניתן להפעיל OCR: '+text(e?.message||e);item.ocrText='';}}
async function fileHash(file){if(!globalThis.crypto?.subtle)throw new Error('יש לפתוח באתר HTTPS כדי לחשב SHA-256.');if(file.size>200*1024*1024)throw new Error('מטעמי זיכרון, חישוב SHA-256 בתוך הדפדפן מוגבל לקבצים עד 200MB.');const bytes=await file.arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');}
async function runSingle(item,kind){if(working||metadataBusy||!item.file)return;
 if((kind==='ai'||kind==='ocr')&&!confirm('הפעלת '+(kind==='ai'?'AI':'OCR')+' עשויה להוריד קובצי מודל/שפה גדולים מספקים חיצוניים. להמשיך?'))return;setBusy(true);stopRequested=false;progress(0,1);try{if(kind==='ai')await doCaption(item);else if(kind==='ocr')await doOCR(item);else if(kind==='hash'){item.sha256=await fileHash(item.file).catch(e=>{flash(e.message);return '';});if(item.sha256){const dups=items.filter(other=>other!==item&&other.sha256===item.sha256);if(dups.length)flash('נמצאה כפילות זהה לפי SHA-256: '+dups.length+' קבצים נוספים.');}}progress(1,1);status('הסתיים עיבוד: '+item.name);markDirty({analysis:kind==='ai'||kind==='ocr'});refresh();if(item.aiError&&kind==='ai')flash(item.aiError);if(item.ocrError&&kind==='ocr')flash(item.ocrError);}finally{setBusy(false);}}
async function runAll(){if(working||metadataBusy||items.length===0)return;const doAi=$('doAi').checked,doOcr=$('doOcr').checked;if(!doAi&&!doOcr){flash('יש לבחור לפחות אפשרות ניתוח אחת. המטא־דאטה כבר חולץ.');return;}
 if((doAi||doOcr)&&!confirm('להפעיל עיבוד '+(doAi?'AI ':'')+(doOcr?'OCR':'')+'? הספריות וקובצי המודל/השפה יורדו מספקים חיצוניים וייתכנו מאות מגה־בייט או יותר בהפעלה הראשונה. התמונות מעובדות בדפדפן.'))return;
 setBusy(true);stopRequested=false;const pending=items.filter(i=>i.file&&i.previewAvailable&&((doAi&&!i.caption)||(doOcr&&(!i.ocrTried||i.ocrError))));let done=0,aiUnavailable=false;progress(0,pending.length);
 try{for(const item of pending){if(stopRequested)break;if(doAi&&!item.caption&&!aiUnavailable){await doCaption(item);if(item.aiError&&!captionerPromise)aiUnavailable=true;}if(stopRequested){done++;progress(done,pending.length);break;}
 if(doOcr&&(!item.ocrTried||item.ocrError))await doOCR(item);done++;progress(done,pending.length);markDirty({analysis:true});setCounts();if(currentId===item.id)safeRenderDetail();scheduleList();}
 status(stopRequested?'הניתוח נעצר לאחר התמונה הנוכחית.':'הניתוח הסתיים. אפשר לעיין בפרטים ולייצא CSV או JSON.');}
 finally{setBusy(false);refresh();}}
const PRIVATE_META = /(?:gps|latitude|longitude|geo.?tag|location|coordinates?|country|city|address|street)/i;
const PERSONAL_META = /(?:person|people|subject|owner|contact|email|phone|face|serial|device.?id|unique.?id|username|uuid)/i;
function scrub(value, hideGps, hidePersonal, depth=0){
 if(depth>12)return '[nested metadata omitted]';
 if(Array.isArray(value))return value.map(x=>scrub(x,hideGps,hidePersonal,depth+1));
 if(!isPlain(value))return value;
 const out={};
 for(const [k,v] of Object.entries(value)){
  if((hideGps&&PRIVATE_META.test(k))||(hidePersonal&&PERSONAL_META.test(k)))continue;
  out[k]=scrub(v,hideGps,hidePersonal,depth+1);
 }
 return out;
}
function exportable(item,forSharing=true){
 const hideGps=forSharing&&$('hideGps').checked, hidePersonal=forSharing&&$('hidePersonal').checked;
 const safeRecord={...item.record};
 if(hidePersonal)safeRecord.people='';
 const machine={captionEnglish:item.caption,tagsHebrew:item.aiTags,ocrText:forSharing&&$('hideOcr').checked?'':item.ocrText,ocrTried:item.ocrTried,ocrNotice:item.ocrNotice||'',ocrConfidence:item.ocrConfidence,ocrError:item.ocrError,aiError:item.aiError};
 return {fileName:item.name,relativePath:hidePersonal?item.name:(item.path||item.name),fileSizeBytes:item.size,fileType:item.fileType,
  fileModifiedAt:item.lastModified?new Date(item.lastModified).toISOString():'',imageWidth:item.width,imageHeight:item.height,
  sourceMetadata:scrub(item.metadata,hideGps,hidePersonal),metadataExtractionWarning:item.metadataError,
  sha256:item.sha256||'',extractedFromSource:scrub(item.summary||{},hideGps,hidePersonal),machineSuggestions:machine,verifiedCatalog:safeRecord};
}
function safeCsvCell(v){
 let s=typeof v==='object'&&v!==null?JSON.stringify(v):text(v);
 const cleanNumeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s.trim());
 if(!cleanNumeric&&/^[\s\r\n]*[=+@\-\t\r]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
function toCsv(rows){return '\ufeff'+rows.map(r=>r.map(safeCsvCell).join(',')).join('\r\n');}
function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
function nowName(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function excelWarning(rows){if(rows[0].length>16384)return 'הייצוא מכיל '+rows[0].length+' עמודות, מעבר למגבלת Excel (16,384). מומלץ JSONL.';
 if(rows.some(row=>row.some(cell=>text(cell).length>32767)))return 'חלק מהתאים ארוכים ממגבלת Excel (32,767 תווים), אך CSV המקורי לא נקטע. מומלץ JSONL.';
 return '';}
let previewTimer=0;
function scheduleExportPreview(){clearTimeout(previewTimer);previewTimer=setTimeout(updateExportPreview,160);}
function updateExportPreview(){
 const gps=$('hideGps').checked,personal=$('hidePersonal').checked,ocr=$('hideOcr').checked;
 const markers=[`GPS: ${gps?'❌ יוסר':'✅ יישמר'}`,`זיהוי אנשים ונתוני קשר: ${personal?'❌ יוסרו':'✅ יישמרו'}`,`טקסט OCR: ${ocr?'❌ יוסר':'✅ יישמר'}`,'צלם וזכויות: ✅ יישמרו','שמות קבצים ושדות חופשיים: ⚠️ דורשים בדיקה'];
 $('shareExportSummary').textContent=markers.join(' | ');
 if(!$('exportPreviewPanel').open)return;
 if(!items.length){$('sharePreviewJson').textContent='יש להוסיף תמונות.';return;}
 const item=exportable(items[0],true);
 const example={fileName:item.fileName,relativePath:item.relativePath,extractedFromSource:item.extractedFromSource,verifiedCatalog:item.verifiedCatalog,machineSuggestions:{ocrText:item.machineSuggestions.ocrText}};
 $('sharePreviewJson').textContent=JSON.stringify(example,null,2).slice(0,7000)+'\n(דוגמה מתוך הרשומה הראשונה; ייתכנו שדות נוספים בייצוא המלא)';
}
function exportCatalog(){
 const headers=['שם קובץ','נתיב יחסי','גודל בבתים','פורמט','רוחב','גובה','תאריך שינוי קובץ (לא צילום)','תאריך צילום שרשום במטא־דאטה (לא מאומת)','מצלמה ממטא־דאטה','צלם ממטא־דאטה','זכויות ממטא־דאטה','GPS קו רוחב','GPS קו אורך','כותרת קטלוג מאומתת','יישוב','שנה מאומתת','צלם מאומת','זכויות / הרשאה','תיאור בעברית מאומת','אנשים מאומתים','אוסף','מילות מפתח מאושרות','הערות','סטטוס אימות','תיאור AI באנגלית (הצעה)','תגיות AI מוצעות','טקסט OCR (דורש בדיקה)','ציון OCR','שגיאות AI/OCR','טביעת אצבע SHA-256','אזהרות חילוץ מטא־דאטה'];
 const rows=items.map(i=>{const v=exportable(i),m=v.extractedFromSource,r=v.verifiedCatalog;
 return [i.name,v.relativePath,i.size,i.fileType,i.width,i.height,i.lastModified?new Date(i.lastModified).toISOString():'',m.date,m.camera,m.author,m.copyright,m.latitude,m.longitude,r.title,r.settlement,r.year,r.photographer,r.rights,r.description,r.people,r.collection,r.tags,r.notes,r.verification,i.caption,i.aiTags.join('; '),v.machineSuggestions.ocrText,i.ocrConfidence??'',i.aiError+' '+i.ocrError,i.sha256||'',i.metadataError];});
 const table=[headers,...rows],warning=excelWarning(table);if(warning)alert(warning);
 download('archive-catalog-'+nowName()+'.csv',toCsv(table),'text/csv;charset=utf-8');flash('קטלוג CSV נשמר במחשב.');
}
function exportDublinCore(){
 const headers=['dc:identifier','dc:title','dc:description','dc:creator','dc:date','dcterms:spatial','dc:subject','dc:rights','dc:source','dc:format','dc:relation'];
 const rows=items.map(i=>{const r=exportable(i).verifiedCatalog;
  return [i.sha256||i.path||i.name,r.title||i.name,r.description||'',r.photographer||'',r.year||'',r.settlement||'',r.tags||'',r.rights||'',r.collection||'',i.fileType||'',exportable(i).relativePath||''];
 });
 const csv=toCsv([headers,...rows]);const warning=excelWarning([headers,...rows]);if(warning)alert(warning);
 download('archive-dublin-core-'+nowName()+'.csv',csv,'text/csv;charset=utf-8');flash('יוצא Dublin Core CSV — מיפוי מוצע הדורש בדיקת ארכיון.');
}
function exportWide(){
 const fs=items.map(i=>flatten(exportable(i).sourceMetadata));const all=[...new Set(fs.flatMap(x=>Object.keys(x)))].sort();
 const headers=['שם קובץ','נתיב יחסי','גודל בבתים','רוחב','גובה','SHA-256','אזהרות חילוץ',...all];
 if(headers.length>16384){flash('יותר מ-16,384 עמודות. יש להשתמש בייצוא JSONL במקום CSV.');return;}
 const rows=items.map((i,n)=>[i.name,exportable(i).relativePath,i.size,i.width,i.height,i.sha256||'',i.metadataError,...all.map(key=>fs[n][key]??'')]);
 const table=[headers,...rows],warning=excelWarning(table);if(warning)alert(warning);
 download('archive-all-metadata-'+nowName()+'.csv',toCsv(table),'text/csv;charset=utf-8');flash('כל שדות המקור המותרים לייצוא נשמרו ב-CSV.');
}
function makeProject(forSharing=true){return {schemaVersion:2,name:APP_NAME,version:APP_VERSION,savedAt:new Date().toISOString(),notice:'No image files included; AI/OCR are unverified machine suggestions.',items:items.map(x=>exportable(x,forSharing))};}
function exportJson(forSharing=true){
 if(!forSharing && !confirm('גיבוי מלא מכיל גם שדות GPS, צלם וזכויות, OCR ופרטים אישיים. הגיבוי מיועד לשמירה פרטית בלבד. להוריד?'))return;
 const result=JSON.stringify(makeProject(forSharing),null,2),size=new Blob([result]).size;
 if(items.length>MAX_ITEMS||size>MAX_JSON_BYTES){alert('הפרויקט בגודל '+humanBytes(size)+' לא יוכל להיטען חזרה עקב מגבלת '+humanBytes(MAX_JSON_BYTES)+' או '+MAX_ITEMS+' רשומות. ייצוא JSON בוטל. ניתן לייצא JSONL לארכוב, או לחלק לפרויקטים קטנים יותר.');return;}
 download((forSharing?'archive-share-':'archive-private-backup-')+nowName()+'.json',result,'application/json;charset=utf-8');if(!forSharing){unsavedCatalog=false;unsavedAnalysis=false;lastAutosaveFailure=false;}flash('הפרויקט יוצא. תמונות אינן כלולות.');
}
function exportJsonl(){
 if(!confirm('ייצוא JSONL מלא כולל מטא־דאטה, GPS, טקסט OCR ופרטים מזהים. מיועד לגיבוי פרטי. להוריד?'))return;
 const chunks=items.map(x=>JSON.stringify({schemaVersion:2,...exportable(x,false)})+'\n');
 download('archive-private-backup-'+nowName()+'.jsonl',new Blob(chunks,{type:'application/x-ndjson'}),'application/x-ndjson');
 unsavedAnalysis=false;unsavedCatalog=false;lastAutosaveFailure=false;flash('JSONL מלא יוצר. ניתן לטעון אותו מחדש באתר.');
}
async function readJsonl(file){
 if(file.size>512*1024*1024)throw new Error('JSONL גדול מ-512MB. יש לפצל לפרויקטים.');
 if(!file.stream)throw new Error('הדפדפן אינו תומך בייבוא JSONL זורם.');
 const reader=file.stream().getReader(),decoder=new TextDecoder(),records=[];
 let carry='';
 async function parseLine(line){if(!line.trim())return;
  const item=JSON.parse(line);if(item.schemaVersion!==2)throw new Error('גרסת שורה לא נתמכת ב-JSONL');
  records.push(item);if(records.length>MAX_ITEMS)throw new Error('JSONL מכיל יותר מדי תמונות');
 }
 try{for(;;){const {done,value}=await reader.read();if(done)break;carry+=decoder.decode(value,{stream:true});
   if(carry.length>15*1024*1024)throw new Error('שורת JSONL גדולה מדי.');
   let offset;while((offset=carry.indexOf('\n'))!==-1){await parseLine(carry.slice(0,offset));carry=carry.slice(offset+1);}
  }
  carry+=decoder.decode();await parseLine(carry);
 }finally{reader.releaseLock();}
 return validProject({schemaVersion:2,items:records});
}
function validProject(obj){
 if(!isPlain(obj)||!Array.isArray(obj.items)||obj.items.length>MAX_ITEMS)throw new Error('מבנה פרויקט שגוי או יותר מדי תמונות.');
 if(obj.schemaVersion!==undefined&&obj.schemaVersion!==2)throw new Error('גרסת סכמת JSON אינה נתמכת.');
 for(const src of obj.items){
  if(!isPlain(src)||typeof src.fileName!=='string'||src.fileName.length>2000||!isPlain(src.sourceMetadata||{})||!isPlain(src.extractedFromSource||{})||!isPlain(src.verifiedCatalog||{})||!isPlain(src.machineSuggestions||{}))throw new Error('נמצאו טיפוסים לא תקינים ברשומת תמונה.');
 }
 return obj;
}
function clearMemory(){selectedIds.clear();updateBatchSelection();for(const old of items){if(old.url)URL.revokeObjectURL(old.url);if(old.thumbUrl)URL.revokeObjectURL(old.thumbUrl);}items.length=0;currentId=null;visibleLimit=PAGE_SIZE;}
function loadProject(obj){
 validProject(obj);clearMemory();
 for(const src of obj.items){
  const id='p'+(++sequence),s=src.machineSuggestions||{},record={title:'',settlement:'',year:'',photographer:'',rights:'',description:'',people:'',collection:'',tags:'',notes:'',verification:'ממתין לבדיקה'};
  for(const key of Object.keys(record))if(typeof src.verifiedCatalog?.[key]==='string')record[key]=src.verifiedCatalog[key].slice(0,100000);
  const path=typeof src.relativePath==='string'?src.relativePath:src.fileName;
  const item={id,file:null,url:null,thumbUrl:null,path,name:src.fileName,size:Number(src.fileSizeBytes)||0,fileType:src.fileType||'',lastModified:src.fileModifiedAt?Date.parse(src.fileModifiedAt)||0:0,width:src.imageWidth??null,height:src.imageHeight??null,metadata:src.sourceMetadata||{},metadataDone:true,metadataError:src.metadataExtractionWarning||'',sha256:typeof src.sha256==='string'?src.sha256:'',previewAvailable:false,summary:src.extractedFromSource||{},caption:typeof s.captionEnglish==='string'?s.captionEnglish:'',aiTags:Array.isArray(s.tagsHebrew)?s.tagsHebrew.filter(x=>typeof x==='string'):[],ocrText:typeof s.ocrText==='string'?s.ocrText:'',ocrConfidence:typeof s.ocrConfidence==='number'?s.ocrConfidence:null,ocrError:typeof s.ocrError==='string'?s.ocrError:'',ocrNotice:typeof s.ocrNotice==='string'?s.ocrNotice:'',aiError:typeof s.aiError==='string'?s.aiError:'',ocrTried:typeof s.ocrTried==='boolean'?s.ocrTried:!!s.ocrText,aiTried:!!s.captionEnglish,record};
  items.push(item);if(!currentId)currentId=id;
 }
 progress(0,1);refresh();
}
async function importJson(file){
 if(!file||guardRecovery())return;
 try {
  const isJsonl=/\.jsonl$/i.test(file.name);
  if(!isJsonl&&file.size>MAX_JSON_BYTES)throw new Error('קובץ JSON גדול מדי (מעל 25MB); אפשר לייבא JSONL במקום.');
  const obj=isJsonl?await readJsonl(file):validProject(JSON.parse(await file.text()));
  if(items.length&&!confirm('טעינת פרויקט תחליף את הרשומות והעריכות הקיימות. האם להמשיך?'))return;
  loadProject(obj);unsavedCatalog=false;unsavedAnalysis=false;markDirty();status('פרויקט JSON נטען. לתהליכי OCR ו-AI יש לצרף שוב את קובצי התמונות המקוריים.');flash('הפרויקט נטען ללא התמונות המקוריות.');
 }catch(e){flash('ייבוא נכשל: '+text(e.message));}
}
async function reset(){
 if(guardRecovery())return;
 if(!confirm('למחוק את כל הרשומות והטיוטה המקומית? אם אין קובץ JSON שיוצא, לא ניתן יהיה לשחזר.'))return;
 clearMemory();stopRequested=true;
 if(ocrWorker){try{await ocrWorker.terminate();}catch(e){console.warn(e)}ocrWorker=null;workerLang=null;} if(adapters.ocrWorker?.terminate)await adapters.ocrWorker.terminate();
 await forgetDraft();if(restoredDraftKey&&restoredDraftKey!==draftSessionKey)await forgetDraft(restoredDraftKey);restoredDraftKey=null;unsavedCatalog=false;unsavedAnalysis=false;progress(0,1);status('הרשימה והטיוטה המקומית נוקו.');refresh();
}
$('filesInput').addEventListener('change',e=>{addFiles([...e.target.files]);e.target.value='';});
$('folderInput').addEventListener('change',e=>{addFiles([...e.target.files]);e.target.value='';});
$('pickFiles').addEventListener('click',()=>$('filesInput').click());
$('pickFolder').addEventListener('click',()=>$('folderInput').click());
const drop=$('dropzone');
for(const evt of ['dragenter','dragover'])drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.add('drag');});
for(const evt of ['dragleave','drop'])drop.addEventListener(evt,e=>{e.preventDefault();drop.classList.remove('drag');});
function isFileDrop(e){return [...(e.dataTransfer?.types||[])].includes('Files');}
window.addEventListener('dragover',e=>{if(isFileDrop(e))e.preventDefault();});
window.addEventListener('drop',e=>{if(isFileDrop(e)){e.preventDefault();if(!(e.target instanceof Node && drop.contains(e.target)))flash('יש לשחרר את הקבצים בתוך אזור ההעלאה.');}});
window.addEventListener('beforeunload',e=>{if((unsavedCatalog||unsavedAnalysis||lastAutosaveFailure)&&items.length){e.preventDefault();e.returnValue='';}});
async function traverseEntry(entry,prefix=''){
 if(!entry)return [];
 if(entry.isFile){return await new Promise(resolve=>entry.file(file=>{Object.defineProperty(file,'relativePath',{value:prefix+file.name,configurable:true});resolve([file]);},()=>resolve([])));}
 if(entry.isDirectory){const reader=entry.createReader();const entries=[];for(;;){const batch=await new Promise(resolve=>reader.readEntries(resolve,()=>resolve([])));if(!batch.length)break;entries.push(...batch);}
  const nested=await Promise.all(entries.map(x=>traverseEntry(x,prefix+entry.name+'/')));return nested.flat();
 }
 return [];
}
drop.addEventListener('drop',async e=>{
 if(working)return;
 const entries=[...(e.dataTransfer?.items||[])].map(x=>x.webkitGetAsEntry?.()).filter(Boolean);
 if(entries.some(x=>x.isDirectory)){status('קוראים את תיקיות הקבצים...');const groups=await Promise.all(entries.map(x=>traverseEntry(x)));addFiles(groups.flat());}
 else addFiles([...(e.dataTransfer?.files||[])]);
});
$('searchInput').addEventListener('input',()=>{visibleLimit=PAGE_SIZE;scheduleList();});
$('runAll').addEventListener('click',runAll);
$('stopRun').addEventListener('click',()=>{stopRequested=true;status('מתבקשת עצירה לאחר הפעולה הנוכחית...');});
$('csvBtn').addEventListener('click',exportCatalog);$('wideBtn').addEventListener('click',exportWide);$('dcBtn').addEventListener('click',exportDublinCore);
$('jsonBtn').addEventListener('click',()=>exportJson(true));$('backupBtn').addEventListener('click',()=>exportJson(false));$('jsonlBtn').addEventListener('click',exportJsonl);
$('importBtn').addEventListener('click',()=>$('importInput').click());
$('importInput').addEventListener('change',e=>{if(e.target.files[0])importJson(e.target.files[0]);e.target.value='';});
$('clearBtn').addEventListener('click',reset);
$('restoreDraft').addEventListener('click',()=>{const data=pendingRecovery;if(!data)return;if(items.length&&!confirm('שחזור הטיוטה יחליף את הרשומות הנוכחיות. להמשיך?'))return;
 try{loadProject(data);restoredDraftKey=data.draftKey||'active';recoveryPending=false;pendingRecovery=null;$('recoveryBanner').hidden=true;unsavedCatalog=false;
 $('draftStatus').textContent='טיוטה שוחזרה. יש לצרף תמונות מחדש ולייצא גיבוי מלא.';flash('טיוטה שוחזרה — ללא תמונות וללא מטא־דאטה מקורי.');}catch(e){flash('שחזור נכשל: '+e.message);}});
$('discardDraft').addEventListener('click',async()=>{if(!pendingRecovery)return;await forgetDraft(pendingRecovery.draftKey||'active');$('draftStatus').textContent='הטיוטה הקודמת נמחקה. אפשר להתחיל פרויקט חדש.';});
$('deleteAllDrafts').addEventListener('click', async()=>{
 if(!confirm('למחוק את כל הטיוטות המקומיות בדפדפן הזה, כולל טיוטות ישנות שעלולות להכיל מטא־דאטה רגיש? לא ניתן לבטל פעולה זו.'))return;
 try{await deleteAllLocalDrafts();flash('כל הטיוטות המקומיות נמחקו.');}
 catch(e){console.warn(e);flash('מחיקת הטיוטות נכשלה: '+text(e.message));}
});
$('autosaveOptIn').addEventListener('change',()=>{if(guardRecovery()){$('autosaveOptIn').checked=false;return;}if($('autosaveOptIn').checked){markDirty({catalog:true});flash('שמירה מקומית הופעלה. רק שדות הקטלוג נשמרים במכשיר זה, ללא תמונות ומטא־דאטה.');}else{clearTimeout(saveTimer);unsavedCatalog=items.length>0;lastAutosaveFailure=false;void forgetDraft().then(()=>{$('draftStatus').textContent='שמירה אוטומטית כבויה והטיוטה של חלון זה נמחקה. יש לייצא גיבוי.';});}});

$('exportPreviewPanel').addEventListener('toggle',updateExportPreview);
for(const id of ['hideGps','hidePersonal','hideOcr'])$(id).addEventListener('change',scheduleExportPreview);
$('selectShown').addEventListener('click',()=>{for(const item of filteredItems().slice(0,visibleLimit))selectedIds.add(item.id);renderList();});
$('unselectAll').addEventListener('click',()=>{selectedIds.clear();renderList();});
$('applyBatch').addEventListener('click',applyBatch);
$('appVersion').textContent=APP_VERSION;
setCounts();checkRecovery();
// Photos stay local; catalog text can be saved to IndexedDB in this browser.
})();
