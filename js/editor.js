let manifest=[], activeIdx=null, dragSrc=null;
let _fileHandle=null, _saveTimer=null, _saving=false;

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;')}

async function openFile(){
  try{
    const [handle]=await window.showOpenFilePicker({
      types:[{description:'JSON',accept:{'application/json':['.json']}}],
      multiple:false
    });
    _fileHandle=handle;
    const file=await handle.getFile();
    const text=await file.text();
    manifest=JSON.parse(text);
    if(!Array.isArray(manifest))throw new Error('Must be an array');
    setFileStatus(handle.name,'saved');
    startEditor();
  }catch(e){
    if(e.name==='AbortError')return;
    document.getElementById('import-error').textContent='Error: '+e.message;
  }
}

async function scheduleAutoSave() {
  if (!_fileHandle) return;
  setFileStatus(null, 'unsaved');
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(performAutosave, 3000);
}

async function performAutosave() {
  try {
    localStorage.setItem('manifest_backup', JSON.stringify(manifest));
    setFileStatus(null, 'saved');
  } catch (e) {
    console.error("Autosave failed:", e);
  }
}

async function saveFile() {
  if (!_fileHandle || _saving) return;
  _saving = true;
  try {
    const writable = await _fileHandle.createWritable();
    await writable.write(JSON.stringify(manifest, null, 2));
    await writable.close();
    setFileStatus(_fileHandle.name, 'saved');
    showToast('Saved to file');
  } catch (e) {
    console.error('Manual save failed:', e);
  } finally {
    _saving = false;
  }
}

// Copy JSON button: uses live in-memory manifest if available, else falls back to localStorage autosave
function copyAutosaveJSON(){
  let json;
  if(manifest && manifest.length > 0){
    json = JSON.stringify(manifest, null, 2);
  } else {
    const backup = localStorage.getItem('manifest_backup');
    if(!backup){ showToast('No data to copy'); return; }
    json = backup;
  }
  navigator.clipboard.writeText(json).then(()=>{
    showToast('JSON copied!');
  }).catch(()=>{
    showToast('Copy failed');
  });
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),1800);
}

function setFileStatus(name,state){
  const el=document.getElementById('file-status');
  const filename=name||(el.dataset.name||'');
  el.dataset.name=filename||'';
  const dot=state==='saved'?'●':state==='unsaved'?'○':'✕';
  const col=state==='saved'?'var(--dim)':state==='unsaved'?'var(--accent)':'#b44';
  el.innerHTML=`<span style="color:${col};margin-right:4px">${dot}</span>${esc(filename)}`;
}

function showImport(){
  document.getElementById('import-panel').style.display='flex';
  document.getElementById('sidebar').style.display='none';
  document.getElementById('editor-area').style.display='none';
}

function loadEmpty(){manifest=[];_fileHandle=null;document.getElementById('file-status').textContent='';startEditor()}

function startEditor(){
  document.getElementById('import-panel').style.display='none';
  document.getElementById('sidebar').style.display='flex';
  document.getElementById('editor-area').style.display='flex';
  renderSidebar();
  if(manifest.length>0)selectEntry(0);
}

function renderSidebar(){
  const list=document.getElementById('entry-list');
  list.innerHTML='';
  manifest.forEach((p,i)=>{
    const el=document.createElement('div');
    el.className='entry-item'+(i===activeIdx?' active':'')+(!p.desc?' wip':'');
    el.onclick=()=>selectEntry(i);
    const thumb=p.thumb
      ?`<img class="entry-thumb-s" src="${esc(p.thumb)}" onerror="this.style.display='none'">`
      :`<div class="entry-ph">${esc((p.title||'?').slice(0,3))}</div>`;
    el.innerHTML=`${thumb}<div class="entry-info"><div class="entry-name">${esc(p.title||'(untitled)')}</div><div class="entry-year">${esc(p.year||'')}</div></div>${!p.desc?'<div class="wip-dot"></div>':''}`;
    list.appendChild(el);
  });
  document.getElementById('entry-count').textContent=manifest.length+' entries';
}

function selectEntry(i){activeIdx=i;renderSidebar();renderForm();renderPreview()}

function addEntry(){
  manifest.push({id:'new-entry',title:'New Entry',date:'',year:'',category:'',tags:[],thumb:'',desc:'',breakdown:[],media:[],links:[]});
  selectEntry(manifest.length-1);
}

function deleteEntry(){
  if(activeIdx===null||!confirm('Delete "'+manifest[activeIdx].title+'"?'))return;
  manifest.splice(activeIdx,1);
  activeIdx=Math.min(activeIdx,manifest.length-1);
  if(manifest.length===0){activeIdx=null;document.getElementById('editor-form').innerHTML='';document.getElementById('preview-col').innerHTML=''}
  renderSidebar();
  if(activeIdx!==null){renderForm();renderPreview()}
}

function renderForm(){
  if(activeIdx===null)return;
  const p=manifest[activeIdx];
  document.getElementById('editor-form').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <span style="font-family:var(--font-display);font-size:0.95rem">${esc(p.title||'(untitled)')}</span>
      <button class="btn danger" style="font-size:10px;padding:3px 8px" onclick="deleteEntry()">Delete</button>
    </div>
    <div class="sec">Identity</div>
    <div class="field"><label class="field-label">ID</label><input id="f-id" value="${esc(p.id||'')}"></div>
    <div class="field"><label class="field-label">Title</label><input id="f-title" value="${esc(p.title||'')}"></div>
    <div class="field-row">
      <div class="field"><label class="field-label">Date</label><input id="f-date" value="${esc(p.date||'')}" placeholder="2025-04-06"></div>
      <div class="field"><label class="field-label">Year (display)</label><input id="f-year" value="${esc(p.year||'')}"></div>
    </div>
    <div class="field"><label class="field-label">Category</label><input id="f-category" value="${esc(p.category||'')}"></div>
    <div class="field"><label class="field-label">Margin note (handwritten on the home page, optional)</label><input id="f-note" value="${esc(p.note||'')}" placeholder="e.g. scope creep sucks lol"></div>
    <div class="sec">Thumbnail</div>
    <div class="field"><label class="field-label">Path</label><input id="f-thumb" value="${esc(p.thumb||'')}" placeholder="resources/project/thumb.jpg"></div>
    <button class="btn" style="font-size:10px;margin-bottom:1rem" onclick="pickThumb()">Browse…</button>
    <div class="sec">Tags</div>
    <div class="tags-wrap" id="tags-wrap"></div>
    <div class="tag-add"><input id="tag-input" placeholder="add tag…" onkeydown="if(event.key==='Enter'){addTag();event.preventDefault()}"><button class="btn" onclick="addTag()">+</button></div>
    <div class="sec">Article</div>
    <button class="btn primary" onclick="openArticle()">Write article…</button>
    <div class="article-meta" id="article-meta">${wordCount(p.desc)} words</div>
    <div class="sec">Breakdown</div>
    <div id="breakdown-list"></div>
    <button class="btn" style="font-size:10px;margin-top:5px" onclick="addBreakdown()">+ Add item</button>
    <div class="sec">Media</div>
    <div class="media-list" id="media-list"></div>
    <div class="media-add-row">
      <button class="btn" onclick="addMedia('image')">+ Image</button>
      <button class="btn" onclick="addMedia('audio')">+ Audio</button>
      <button class="btn" onclick="addMedia('youtube')">+ YouTube</button>
      <button class="btn" onclick="addMedia('vimeo')">+ Vimeo</button>
      <button class="btn" onclick="addMedia('break')">+ Break</button>
      <button class="btn" onclick="pickMediaBatch()">Browse files…</button>
    </div>
    <div class="sec">Links</div>
    <div class="links-list" id="links-list"></div>
    <button class="btn" style="font-size:10px;margin-top:5px" onclick="addLink()">+ Add link</button>
  `;
  renderTags();renderBreakdown();renderMediaList();renderLinks();bindFields();
}

function bindFields(){
  ['id','title','date','year','category','note','thumb'].forEach(k=>{
    const el=document.getElementById('f-'+k);if(!el)return;
    el.addEventListener('input',()=>{
      manifest[activeIdx][k]=el.value;
      if(['title','thumb','desc'].includes(k))renderSidebar();
      renderPreview();
    });
  });
}

function renderTags(){
  const p=manifest[activeIdx],w=document.getElementById('tags-wrap');if(!w)return;
  w.innerHTML=(p.tags||[]).map((t,i)=>`<div class="tag-chip">${esc(t)}<button onclick="removeTag(${i})">×</button></div>`).join('');
}
function addTag(){const inp=document.getElementById('tag-input');const v=inp.value.trim().toLowerCase();if(!v)return;(manifest[activeIdx].tags=manifest[activeIdx].tags||[]).push(v);inp.value='';renderTags();renderPreview()}
function removeTag(i){manifest[activeIdx].tags.splice(i,1);renderTags();renderPreview()}

function renderBreakdown(){
  const p=manifest[activeIdx],el=document.getElementById('breakdown-list');if(!el)return;
  el.innerHTML=(p.breakdown||[]).map((b,i)=>`<div style="display:flex;gap:5px;margin-bottom:4px"><input value="${esc(b)}" style="flex:1;font-size:11px;background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:4px 7px;font-family:var(--font-body);color:var(--text)" oninput="manifest[activeIdx].breakdown[${i}]=this.value;renderPreview()"><button class="btn danger" style="font-size:10px;padding:2px 7px" onclick="manifest[activeIdx].breakdown.splice(${i},1);renderBreakdown();renderPreview()">×</button></div>`).join('');
}
function addBreakdown(){(manifest[activeIdx].breakdown=manifest[activeIdx].breakdown||[]).push('');renderBreakdown()}

function renderMediaList(){
  const p=manifest[activeIdx],el=document.getElementById('media-list');if(!el)return;
  el.innerHTML='';
  (p.media||[]).forEach((m,i)=>{
    const item=document.createElement('div');
    item.className='media-item';item.draggable=true;item.dataset.idx=i;
    let body=`<div class="media-type-label">${m.type}</div>`;
    if(m.type==='image'||m.type==='audio'){
      body+=`<div style="display:flex;gap:4px;margin-bottom:3px"><input value="${esc(m.src||'')}" placeholder="path/to/file" oninput="manifest[activeIdx].media[${i}].src=this.value;renderPreview()"><button class="btn" style="font-size:9px;padding:1px 6px" onclick="pickMediaFor(${i})">…</button></div>`;
      body+=`<input value="${esc(m.caption||'')}" placeholder="caption" oninput="manifest[activeIdx].media[${i}].caption=this.value;renderPreview()">`;
    }else if(m.type==='youtube'||m.type==='vimeo'){
      body+=`<input value="${esc(m.id||'')}" placeholder="${m.type==='youtube'?'YouTube video ID':'Vimeo video ID'}" oninput="manifest[activeIdx].media[${i}].id=this.value;renderPreview()" style="margin-bottom:3px">`;
      body+=`<input value="${esc(m.caption||'')}" placeholder="caption" oninput="manifest[activeIdx].media[${i}].caption=this.value;renderPreview()">`;
    }else{body+=`<span style="font-size:10px;color:var(--dim)">spacer</span>`}
    item.innerHTML=`<span class="drag-handle">⠿</span><div class="media-body">${body}</div><button class="media-del" onclick="manifest[activeIdx].media.splice(${i},1);renderMediaList();renderPreview()">×</button>`;
    item.addEventListener('dragstart',e=>{dragSrc=i;item.classList.add('dragging');e.dataTransfer.effectAllowed='move'});
    item.addEventListener('dragend',()=>item.classList.remove('dragging'));
    item.addEventListener('dragover',e=>e.preventDefault());
    item.addEventListener('drop',e=>{
      e.preventDefault();if(dragSrc===null||dragSrc===i)return;
      const arr=manifest[activeIdx].media;const[mv]=arr.splice(dragSrc,1);arr.splice(i,0,mv);dragSrc=null;renderMediaList();renderPreview();
    });
    el.appendChild(item);
  });
}
function addMedia(type){
  const defaults={image:{type:'image',src:'',caption:''},audio:{type:'audio',src:'',caption:''},youtube:{type:'youtube',id:'',caption:''},vimeo:{type:'vimeo',id:'',caption:''},break:{type:'break'}};
  (manifest[activeIdx].media=manifest[activeIdx].media||[]).push(defaults[type]||{type,src:'',caption:''});
  renderMediaList();renderPreview();
}

function renderLinks(){
  const p=manifest[activeIdx],el=document.getElementById('links-list');if(!el)return;
  el.innerHTML=(p.links||[]).map((l,i)=>`<div class="link-row"><input value="${esc(l.label||'')}" placeholder="label" style="width:70px;flex:none" oninput="manifest[activeIdx].links[${i}].label=this.value;renderPreview()"><input value="${esc(l.href||'')}" placeholder="https://…" oninput="manifest[activeIdx].links[${i}].href=this.value"><label><input type="checkbox" ${l.primary?'checked':''} onchange="manifest[activeIdx].links[${i}].primary=this.checked;renderPreview()"> primary</label><button onclick="manifest[activeIdx].links.splice(${i},1);renderLinks();renderPreview()">×</button></div>`).join('');
}
function addLink(){(manifest[activeIdx].links=manifest[activeIdx].links||[]).push({label:'',href:'',primary:false});renderLinks()}

function formatDesc(desc){
  if(!desc)return'';
  return desc.split('\n').map(line=>{
    if(line.startsWith('# '))return`<div class="drawer-desc-heading">${esc(line.slice(2))}</div>`;
    if(line==='')return`<br>`;
    return`<p>${esc(line)}</p>`;
  }).join('');
}

function buildMediaPreview(media){
  return(media||[]).map(m=>{
    if(m.type==='youtube')return`<div><div class="embed-ratio-p"><iframe src="https://www.youtube.com/embed/${esc(m.id||'')}" allowfullscreen loading="lazy"></iframe></div>${m.caption?`<div class="embed-caption-p">${esc(m.caption)}</div>`:''}</div>`;
    if(m.type==='vimeo')return`<div><div class="embed-ratio-p"><iframe src="https://player.vimeo.com/video/${esc(m.id||'')}" allowfullscreen loading="lazy"></iframe></div>${m.caption?`<div class="embed-caption-p">${esc(m.caption)}</div>`:''}</div>`;
    if(m.type==='image'&&m.src)return`<div><img class="embed-img-p" src="${esc(m.src)}" alt="${esc(m.caption||'')}" loading="lazy" onerror="this.style.opacity=0.25">${m.caption?`<div class="embed-caption-p">${esc(m.caption)}</div>`:''}</div>`;
    if(m.type==='image')return`<div style="background:var(--bg3);border:1px solid var(--line);border-radius:calc(var(--radius) - 2px);aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--dim);font-style:italic">no src set</div>`;
    if(m.type==='audio')return`
      <div class="audio-card-p">
        <div class="audio-label-p">${esc(m.caption||m.src||'audio')}</div>
        ${m.src?`<audio class="audio-player-p" src="${esc(m.src)}" preload="none"></audio>`:''}
        <div class="audio-controls-p">
          <button class="audio-btn-p" onclick="(function(btn){const card=btn.closest('.audio-card-p');const a=card.querySelector('audio');if(!a)return;a.paused?(a.play(),btn.textContent='▐▐'):(a.pause(),btn.textContent='▶')})(this)">▶</button>
          <div class="audio-progress-wrap-p" onclick="(function(el,ev){const a=el.closest('.audio-card-p').querySelector('audio');if(!a||!a.duration)return;const r=el.getBoundingClientRect();a.currentTime=((ev.clientX-r.left)/r.width)*a.duration})(this,event)">
            <div class="audio-progress-bar-p"></div>
          </div>
          <span class="audio-time-p">0:00</span>
        </div>
      </div>`;
    if(m.type==='break')return`<div class="media-break-p"></div>`;
    return'';
  }).join('');
}

function renderPreview(){
  scheduleAutoSave();
  if(activeIdx===null)return;
  const p=manifest[activeIdx];
  const isWip=!p.desc;
  const ratioClass='r43';

  let thumbHtml='';
  if(p.thumb){
    thumbHtml=`<img class="p-card-thumb-preview ${ratioClass}" src="${esc(p.thumb)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="p-card-ph ${ratioClass}" style="display:none">${esc((p.title||'').slice(0,4))}</div>`;
  }else{
    thumbHtml=`<div class="p-card-ph ${ratioClass}">${esc((p.title||'').slice(0,4))}</div>`;
  }

  const tags=(p.tags||[]).map(t=>`<span class="p-card-tag-p">${esc(t)}</span>`).join('');
  const dtags=(p.tags||[]).map(t=>`<span class="drawer-tag">${esc(t)}</span>`).join('');
  const links=(p.links||[]).map(l=>`<a class="drawer-link-p${l.primary?' prim':''}">${esc(l.label||'link')}</a>`).join('');
  const bd=p.breakdown&&p.breakdown.length?`<div class="drawer-breakdown"><div class="drawer-breakdown-label">Process</div><ul>${p.breakdown.map(b=>`<li>${esc(b)}</li>`).join('')}</ul></div>`:'';
  const mediaSrc=buildMediaPreview(p.media);

  document.getElementById('preview-col').innerHTML=`
    <div class="preview-section-label">Card</div>
    <div class="p-card-preview${isWip?' wip':''}">
      ${thumbHtml}
      <div class="p-card-body-p">
        <div class="p-card-title-p">${esc(p.title||'(untitled)')}</div>
        <div class="p-card-meta-p">
          <span class="p-card-year-p">${esc(p.year||'')}</span>
          ${tags}
        </div>
      </div>
    </div>
    <div class="preview-section-label" style="margin-top:1.25rem">Drawer</div>
    <div class="drawer-preview-wrap" id="drawer-preview-wrap">
      <div class="drawer-preview-scale" id="drawer-preview-scale">
        <div class="drawer-preview">
          <div class="drawer-inner">
            <div>
              <div class="drawer-eyebrow">${esc(p.year||'')} · ${esc(p.category||'')}</div>
              <div class="drawer-title">${esc(p.title||'(untitled)')}</div>
              <div class="drawer-tags">${dtags}</div>
              ${p.desc?`<div class="drawer-desc">${formatDesc(p.desc)}</div>`:'<div style="color:var(--dim);font-size:12px;font-style:italic">No description yet.</div>'}
              ${bd}
              <div class="drawer-links">${links}<span class="drawer-link-p">close</span></div>
            </div>
            <div class="media-stack-p">${mediaSrc||'<div style="color:var(--dim);font-size:12px;font-style:italic">No media yet.</div>'}</div>
          </div>
        </div>
      </div>
    </div>`;
  requestAnimationFrame(scaleDrawerPreview);
}

function scaleDrawerPreview(){
  const wrap=document.getElementById('drawer-preview-wrap');
  const inner=document.getElementById('drawer-preview-scale');
  if(!wrap||!inner)return;
  const REAL_WIDTH=1100;
  const available=wrap.clientWidth;
  if(!available)return;
  inner.style.zoom=available/REAL_WIDTH;
  inner.style.width=REAL_WIDTH+'px';
}

function wordCount(text){
  const t=(text||'').trim();
  return t?t.split(/\s+/).length:0;
}

function openArticle(){
  if(activeIdx===null)return;
  const p=manifest[activeIdx];
  const input=document.getElementById('article-input');
  document.getElementById('article-title').textContent=p.title||'(untitled)';
  input.value=p.desc||'';
  document.getElementById('article-view').hidden=false;
  updateArticle();
  input.focus();
}

function closeArticle(){
  document.getElementById('article-view').hidden=true;
  renderSidebar();
  renderForm();
  renderPreview();
}

function updateArticle(){
  const input=document.getElementById('article-input');
  if(activeIdx!==null)manifest[activeIdx].desc=input.value;
  document.getElementById('article-preview').innerHTML=formatDesc(input.value)||'<p class="article-empty">Nothing yet.</p>';
  document.getElementById('article-count').textContent=wordCount(input.value)+' words';
  scheduleAutoSave();
}

function insertHeading(){
  const input=document.getElementById('article-input');
  const pos=input.selectionStart;
  const lineStart=input.value.lastIndexOf('\n',pos-1)+1;
  if(input.value.startsWith('# ',lineStart)){input.focus();return}
  input.value=input.value.slice(0,lineStart)+'# '+input.value.slice(lineStart);
  input.setSelectionRange(pos+2,pos+2);
  input.focus();
  updateArticle();
}

document.getElementById('article-input').addEventListener('input',updateArticle);
document.addEventListener('keydown',e=>{
  if(document.getElementById('article-view').hidden)return;
  if(e.key==='Escape')closeArticle();
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveFile()}
});

function pickThumb(){
  const fp=document.getElementById('fp-thumb');
  fp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const name=f.name;
    manifest[activeIdx].thumb=name;
    document.getElementById('f-thumb').value=name;
    renderSidebar();renderPreview();fp.value='';
  };fp.click();
}

function pickMediaBatch(){
  const fp=document.getElementById('fp-media');
  fp.onchange=e=>{
    Array.from(e.target.files).forEach(f=>{
      const type=f.type.startsWith('audio')?'audio':'image';
      (manifest[activeIdx].media=manifest[activeIdx].media||[]).push({type,src:f.name,caption:''});
    });
    renderMediaList();renderPreview();fp.value='';
  };fp.click();
}

let _pendingMediaIdx=null;
function pickMediaFor(i){
  _pendingMediaIdx=i;
  const fp=document.getElementById('fp-media-single');
  fp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    manifest[activeIdx].media[_pendingMediaIdx].src=f.name;
    renderMediaList();renderPreview();fp.value='';
  };fp.click();
}

document.addEventListener('click',e=>{
  const card=e.target.closest('.audio-card-p');
  if(!card)return;
  const audio=card.querySelector('audio');
  if(!audio)return;
  audio.addEventListener('timeupdate',()=>{
    const pct=(audio.currentTime/audio.duration)*100||0;
    const bar=card.querySelector('.audio-progress-bar-p');
    const time=card.querySelector('.audio-time-p');
    if(bar)bar.style.width=pct+'%';
    if(time){const m=Math.floor(audio.currentTime/60);const s=Math.floor(audio.currentTime%60).toString().padStart(2,'0');time.textContent=`${m}:${s}`}
  },{once:false});
  audio.addEventListener('ended',()=>{const btn=card.querySelector('.audio-btn-p');if(btn)btn.textContent='▶';},{once:true});
});

window.addEventListener('resize', scaleDrawerPreview);

showImport();
