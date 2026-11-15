'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const uid = () => crypto.randomUUID();
const labels = {pending:'Pending', pass:'Passed', fix:'Needs changes'};
const kinds = {image:'Image', video:'Video', text:'Document'};
const paragraphs = text => text.trim().split(/\r?\n[ \t]*\r?\n/).filter(Boolean);
const clock = time => `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4,'0')}`;
const anchor = e => e.kind === 'image' ? `Horizontal ${e.x}% · Vertical ${e.y}%` : e.kind === 'video' ? clock(e.time) : `Paragraph ${e.paragraph}`;
const request = req => new Promise((resolve,reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const done = tx => new Promise((resolve,reject) => {tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error || Error('Save interrupted'));});
let db, project, criterionId, evidenceId, viewerURL, renderId = 0, submitAction, releaseDialog, toastTimer;
const criterion = () => project.criteria.find(c => c.id === criterionId);
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  toastTimer = setTimeout(() => $('#toast').textContent = '', 4200);
}
function invalidate(c) { c.status = 'pending'; c.note = ''; }

async function initialize() {
  const opening = indexedDB.open('review-desk-en-v1',1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore('projects',{keyPath:'id'});
    opening.result.createObjectStore('files');
  };
  db = await request(opening);
  const tx = db.transaction('projects','readwrite');
  const completion = done(tx);
  const store = tx.objectStore('projects');
  if (!(await request(store.count()))) store.add(window.demoProject());
  await completion;
  const projects = await request(db.transaction('projects').objectStore('projects').getAll());
  const active = localStorage.getItem('review-desk-en-project');
  await switchProject((projects.find(p => p.id === active) || projects[0]).id);
  $('#app').removeAttribute('aria-busy');
}

async function switchProject(id) {
  const all = await request(db.transaction('projects').objectStore('projects').getAll());
  project = all.find(p => p.id === id) || all[0];
  localStorage.setItem('review-desk-en-project',project.id);
  $('#projects').innerHTML = all.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#projects').value = project.id;
  criterionId = project.criteria[0]?.id;
  evidenceId = undefined;
  await render();
}

// Store the review and its attachments in one transaction. Reject stale edits from other tabs.
async function save(change, extra) {
  const tx = db.transaction(['projects','files'],'readwrite');
  const completion = done(tx);
  const store = tx.objectStore('projects');
  const fresh = await request(store.get(project.id));
  if (fresh.revision !== project.revision) {
    await completion;
    throw Error('This review was updated in another tab. Close this dialog and refresh before retrying.');
  }
  change(fresh);
  fresh.revision++;
  if (extra?.blob) tx.objectStore('files').put(extra.blob,extra.id);
  for (const id of extra?.remove || []) tx.objectStore('files').delete(id);
  store.put(fresh);
  await completion;
  project = fresh;
}
function mark(x,y) {return `<i class="pin" style="left:${Number(x)}%;top:${Number(y)}%" aria-hidden="true"></i>`;}
function filePart(e, url) {
  if (e.kind === 'image') return `<div class="picture"><img src="${esc(url)}" alt="${esc(e.name)}">${mark(e.x,e.y)}</div>`;
  if (e.kind === 'video') return `<video controls playsinline preload="auto" src="${esc(url)}" aria-label="${esc(e.name)}"></video>`;
  return `<div class="doc-wrap"><div class="document">${paragraphs(e.text).map((p,i) => `<div class="paragraph ${i+1 === e.paragraph ? 'selected':''}"><span>${i+1}</span><p>${esc(p)}</p></div>`).join('')}</div></div>`;
}
async function render() {
  const version = ++renderId;
  if (viewerURL) { URL.revokeObjectURL(viewerURL); viewerURL = null; }
  const all = project.criteria;
  const c = criterion();
  const passed = all.filter(c => c.status === 'pass').length;
  const pending = all.filter(c => c.status === 'pending').length;
  const e = c?.evidence.find(e => e.id === evidenceId) || c?.evidence[0];
  evidenceId = e?.id;
  $('#app').innerHTML = `<div class="title-row"><div><h1>${esc(project.name)}</h1><div class="meta">${all.length} criteria　·　${passed} Passed　·　${pending} Pending　·　${all.length-passed-pending} Needs changes</div></div><button data-act="export">↓ Export report</button></div>
    <div class="workspace"><aside class="panel"><div class="panel-top"><h2>Review checklist</h2><button data-act="add">＋ Add criterion</button></div><div class="list">
    ${all.map(item => `<button class="item ${item.id === criterionId ? 'active':''}" data-item="${esc(item.id)}" aria-pressed="${item.id === criterionId}"><span class="pill ${item.status}">${labels[item.status]}</span><strong>${esc(item.title)}</strong><small>${item.evidence.length} ${item.evidence.length === 1 ? 'attachment' : 'attachments'}</small></button>`).join('') || '<div class="empty">No criteria yet.</div>'}</div><div class="progress" aria-label="Review progress"><div style="width:${all.length ? 100*passed/all.length : 0}%"></div></div></aside>
    <section class="panel">${c ? `<div class="reading"><div class="detail-title"><h2>${esc(c.title)}</h2><button class="plain" data-act="edit">Edit</button></div><p class="sub">${esc(c.detail)}</p></div>
    <div class="evidence-nav">${c.evidence.map((item,i) => `<button data-evidence="${esc(item.id)}" class="${item.id === evidenceId?'chosen':''}">${kinds[item.kind]} ${i+1}</button>`).join('')}<button data-act="attach">＋ Attach evidence</button></div>
    ${e ? `<div class="viewer"><div class="viewer-head"><div class="file-info"><strong>${esc(e.name)}</strong><small>${kinds[e.kind]} position　${esc(anchor(e))}</small></div><div class="actions">${e.kind === 'video'?'<button class="plain" data-act="seek">Return to mark</button>':''}<button class="plain" data-act="detach">Remove</button></div></div><div class="stage" id="preview"></div>${e.caption ? `<p class="caption">${esc(e.caption)}</p>`:''}</div>`:'<div class="empty">Attach an image, video, or document to review this criterion.</div>'}
    ${c.note ? `<p class="note"><b>Review note　</b>${esc(c.note)}</p>`:''}
    <div class="bottom"><span class="pill ${c.status}">${labels[c.status]}</span><div class="actions"><button data-act="fix">Needs changes</button><button data-act="pass" class="primary" ${c.evidence.length?'':'disabled title="Attach evidence first"'}>✓ Mark passed</button></div></div>`:'<div class="empty"><h2>What should this delivery achieve?</h2><p>Add a review criterion, then attach the relevant evidence.</p></div>'}</section></div>`;
  if (!e) return;
  let url = e.path;
  if (e.kind !== 'text' && !url) {
    const blob = await request(db.transaction('files').objectStore('files').get(e.id));
    if (version !== renderId) return;
    if (!blob) { $('#preview').textContent = 'Could not load the attachment. Remove it and attach it again.'; return; }
    url = viewerURL = URL.createObjectURL(blob);
  }
  $('#preview').innerHTML = filePart(e,url);
  const player = $('#preview video');
  if (player) player.addEventListener('loadedmetadata',() => {player.currentTime = e.time;},{once:true});
  const highlight = $('#preview .selected');
  if (highlight) {
    const doc = $('.document');
    doc.scrollTop += highlight.getBoundingClientRect().top - doc.getBoundingClientRect().top - 40;
  }
}
function dialog(title, fields, action, cleanup) {
  releaseDialog = cleanup;
  submitAction = action;
  $('#dialog-title').textContent = title;
  $('#fields').innerHTML = fields + '<p class="hint error" id="form-error" role="alert"></p>';
  $('#submit').disabled = false;
  $('#submit').textContent = 'Save';
  $('#dialog').showModal();
}
const field = (label,id,value='',required=false) => `<label for="${id}">${label}</label><input id="${id}" maxlength="180" value="${esc(value)}" ${required?'required':''}>`;
const area = (label,id,value='',required=false) => `<label for="${id}">${label}</label><textarea id="${id}" rows="3" maxlength="4000" ${required?'required':''}>${esc(value)}</textarea>`;
function value(id) { return document.getElementById(id).value.trim(); }
function necessary(s) {if (!s) throw Error('Please enter a value.');return s;}
function editCriterion(existing) {
  dialog(existing?'Edit criterion':'Add criterion',field('Criterion','ctitle',existing?.title,true)+area('How to verify','detail',existing?.detail)+(existing?'<p class="hint">Changing a criterion requires another review.</p><label><input type="checkbox" id="remove-condition" style="width:auto"> Delete this criterion and its attached evidence</label>':''),async () => {
    if(existing && $('#remove-condition').checked) {
      await save(p => {p.criteria=p.criteria.filter(c=>c.id!==existing.id);},{remove:existing.evidence.map(e=>e.id)});
      criterionId=project.criteria[0]?.id;
      await render();
      return;
    }
    const title = necessary(value('ctitle')), detail = value('detail');
    const id = existing?.id || uid();
    await save(p => {
      if (existing) {
        const c=p.criteria.find(c=>c.id===id);
        if(c.title!==title || c.detail!==detail) {Object.assign(c,{title,detail});invalidate(c);}
      } else p.criteria.push({id,title,detail,status:'pending',note:'',evidence:[]});
    });
    criterionId=id;
    await render();
  });
}
function review(status) {
  const id=criterionId;
  dialog(labels[status],area(status==='fix'?'What needs to change?':'Review note (optional)','reason',criterion().note,status==='fix'),async()=>{
    const note=value('reason');
    if (status==='fix') necessary(note);
    await save(p => Object.assign(p.criteria.find(c=>c.id===id),{status,note}));
    await render();
  });
}
function report() {
  const plain = s => String(s).replace(/[\r\n]+/g,' ').replace(/[\\`*_~<>#!|[\]()]/g,'\\$&');
  const lines=[`# ${plain(project.name)}`,'',`Exported ${new Date().toISOString()}`,''];
  for (const c of project.criteria) {
    lines.push(`## ${labels[c.status]} · ${plain(c.title)}`,'',plain(c.detail),'');
    if(c.note) lines.push(`Review note：${plain(c.note)}`,'');
    for(const e of c.evidence) {
      lines.push(`- ${kinds[e.kind]} · ${plain(e.name)} · ${anchor(e)}${e.caption?' · '+plain(e.caption):''}`);
      if(e.kind==='text') lines.push(`  > ${plain(paragraphs(e.text)[e.paragraph-1])}`);
    }
    lines.push('');
  }
  const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download=project.name.replace(/[\\/:*?"<>|]/g,'_')+'-review-report.md';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
