'use strict';

function downloadFile(name, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const a = document.createElement('a');
  a.href = url;
  a.download = name.replace(/[\\/:*?"<>|]/g, '_');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function workflowMenu() {
  dialog('Project tools', `
    <div class="workflow-grid">
      <button type="button" data-workflow="requirements">Requirements & AI checklist</button>
      <button type="button" data-workflow="changes">Track requirement changes</button>
      <button type="button" data-workflow="instructions">Generate revision instructions</button>
      <button type="button" data-workflow="compare">Compare evidence</button>
      <button type="button" data-workflow="backup">Export project backup</button>
      <button type="button" data-workflow="restore">Import project backup</button>
    </div><p class="hint">Projects and attachments are stored in this browser.</p>`, async () => {});
  $('#submit').hidden = true;
}

function requirementDialog() {
  dialog('Requirements & AI checklist', area('Project requirements', 'requirement', project.requirement || '') +
    '<p class="hint">Download the prompt for an AI assistant. Review its JSON response and paste it below to import.</p>' +
    area('AI checklist JSON (optional)', 'ai-list', ''), async () => {
    const requirement = value('requirement');
    let additions = [];
    if (value('ai-list')) {
      let data;
      try { data = JSON.parse(value('ai-list')); } catch { throw Error('The checklist must be valid JSON.'); }
      if (!Array.isArray(data) || data.length > 100 || !data.every(c =>
        c && typeof c.title === 'string' && c.title.trim() && c.title.length <= 180 &&
        typeof c.detail === 'string' && c.detail.length <= 4000)) {
        throw Error('Provide up to 100 items with title and detail strings.');
      }
      additions = data.map(c => ({id:uid(), title:c.title.trim(), detail:c.detail.trim(), status:'pending', note:'', evidence:[]}));
    }
    await save(p => {
      if ((p.requirement || '') !== requirement) {
        if (p.criteria.length) {
          (p.changes ||= []).push({
            at:new Date().toISOString(),
            text:'Updated project requirements',
            affected:p.criteria.map(c => ({title:c.title,status:c.status,note:c.note}))
          });
        }
        p.requirement = requirement;
        p.criteria.forEach(invalidate);
      }
      p.criteria.push(...additions);
    });
    if (!criterionId && additions.length) criterionId = additions[0].id;
    await render();
  });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Download AI prompt';
  btn.onclick = () => {
    const requirement = value('requirement');
    if (!requirement) { $('#form-error').textContent = 'Enter project requirements first.'; return; }
    const prompt = `Write observable, testable acceptance criteria for the requirements below. Return only a JSON array with title and detail strings. Do not claim the work has been reviewed.\n\nRequirements:\n${requirement}\n\nExample:\n[{"title":"Show confirmation after submission","detail":"Show a success message after submission."}]`;
    downloadFile('checklist-prompt.txt', prompt, 'text/plain;charset=utf-8');
  };
  $('#fields').append(btn);
}

function changesDialog() {
  const checks = project.criteria.map(c => `<label><input type="checkbox" value="${esc(c.id)}" style="width:auto"> ${esc(c.title)} · ${labels[c.status]}</label>`).join('');
  dialog('Track requirement changes', area('Change description', 'change-text', '', true) +
    '<p class="hint">Select affected criteria. They will return to pending and previous review notes will be kept in the history.</p>' +
    (checks || '<p>There are no criteria yet.</p>') +
    `<details><summary>View change history（${(project.changes || []).length}）</summary>${(project.changes || []).map(change => `<p class="note">${esc(change.at)}　${esc(change.text)}\n${esc(change.affected.map(c => c.title + '：' + labels[c.status] + (c.note ? ' / ' + c.note : '')).join('\n'))}</p>`).join('')}</details>`, async () => {
      const text = necessary(value('change-text'));
      const selected = [...$('#fields').querySelectorAll('input[type=checkbox]:checked')].map(el => el.value);
      await save(p => {
        const affected = p.criteria.filter(c => selected.includes(c.id));
        (p.changes ||= []).push({at:new Date().toISOString(), text, affected:affected.map(c => ({title:c.title,status:c.status,note:c.note}))});
        affected.forEach(invalidate);
      });
      await render();
    });
}

function instructionDialog() {
  const items = project.criteria.filter(c => c.status === 'fix');
  const content = [
    '# Revision task · ' + project.name, '',
    'Revise the delivery using the review feedback below. Provide new evidence for another review.', '',
    ...items.flatMap(c => [
      '## ' + c.title, c.detail, 'Review feedback: ' + c.note,
      ...c.evidence.map(e => '- Evidence: ' + e.name + ' · ' + anchor(e) + (e.caption ? ' · ' + e.caption : '')),
      ''
    ])
  ].join('\n');
  dialog('Generate revision instructions', '<p class="hint">Includes criteria marked as needing changes. Provide evidence files separately to the person or AI making revisions.</p>' +
    area('Revision instructions', 'instruction-text', content), async () => {
      downloadFile(project.name + '-Revision instructions.md', value('instruction-text'), 'text/markdown;charset=utf-8');
    });
  $('#submit').textContent = 'Download';
  if (!items.length) $('#form-error').textContent = 'No criteria are currently marked as needing changes.';
}

async function backupProject() {
  const snapshot = structuredClone(project);
  const files = {};
  for (const c of snapshot.criteria) for (const e of c.evidence) {
    if (e.kind !== 'text') files[e.id] = await portableSource(e);
    delete e.path;
  }
  downloadFile(snapshot.name + '-project-backup.json', JSON.stringify({format:'review-desk-backup', version:1, project:snapshot, files}), 'application/json');
}

async function restoreProject(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw Error('The backup is not valid JSON.'); }
  if (data.format !== 'review-desk-backup' || data.version !== 1 || !data.project || typeof data.project.name !== 'string' || !Array.isArray(data.project.criteria) || !data.files || typeof data.files !== 'object') throw Error('This project backup is not recognized.');
  const p = data.project;
  const attachments = [];
  p.id = uid(); p.revision = 0; p.name = p.name + ' (imported)';
  if (p.changes !== undefined && !Array.isArray(p.changes)) throw Error('Invalid change history.');
  for (const c of p.criteria) {
    if (!c || typeof c.title !== 'string' || typeof c.detail !== 'string' || !['pending','pass','fix'].includes(c.status) || typeof c.note !== 'string' || !Array.isArray(c.evidence)) throw Error('Invalid criterion.');
    c.id = uid();
    for (const e of c.evidence) {
      if (!e || !['image','video','text'].includes(e.kind) || typeof e.name !== 'string' || typeof e.caption !== 'string') throw Error('Invalid evidence.');
      const oldId = e.id;
      e.id = uid();
      delete e.path;
      if (e.kind === 'text') {
        if (typeof e.text !== 'string' || !Number.isInteger(e.paragraph) || e.paragraph < 1 || e.paragraph > paragraphs(e.text).length) throw Error('Invalid document location.');
      } else {
        if (e.kind === 'image' && (![e.x,e.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100))) throw Error('Invalid image position.');
        if (e.kind === 'video' && (!Number.isFinite(e.time) || e.time < 0)) throw Error('Invalid video timestamp.');
        const encoded = data.files[oldId];
        const mime = e.kind === 'image' ? /^data:image\/(png|jpeg|webp);base64,/ : /^data:video\/(mp4|webm);base64,/;
        if (typeof encoded !== 'string' || !mime.test(encoded)) throw Error('A backup attachment is missing or unsupported.');
        const blob = await (await fetch(encoded)).blob();
        attachments.push({id:e.id, blob});
      }
    }
  }
  const tx = db.transaction(['projects','files'],'readwrite');
  const completion = done(tx);
  tx.objectStore('projects').add(p);
  for (const attachment of attachments) tx.objectStore('files').add(attachment.blob,attachment.id);
  await completion;
  await switchProject(p.id);
}

function compareDialog() {
  const images = criterion()?.evidence.filter(e => e.kind === 'image') || [];
  if (images.length < 2) { toast('Attach at least two images to this criterion first.'); return; }
  const options = images.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  dialog('Compare images', `<div class="compare-controls"><label>Left<select id="compare-left">${options}</select></label><label>Right<select id="compare-right">${options}</select></label></div><div class="compare-view"><div id="left-view"></div><div id="right-view"></div></div>`, async () => {}, () => urls.forEach(URL.revokeObjectURL));
  $('#submit').hidden = true;
  $('#compare-right').selectedIndex = 1;
  const urls = [];
  async function update(id, target) {
    const e = images.find(item => item.id === $(id).value);
    let src = e.path;
    if (!src) {
      const blob = await request(db.transaction('files').objectStore('files').get(e.id));
      if (!blob) { $(target).textContent = 'Attachment not found'; return; }
      src = URL.createObjectURL(blob); urls.push(src);
    }
    $(target).innerHTML = filePart(e,src);
  }
  $('#compare-left').onchange = () => update('#compare-left','#left-view');
  $('#compare-right').onchange = () => update('#compare-right','#right-view');
  update('#compare-left','#left-view'); update('#compare-right','#right-view');
}

document.addEventListener('DOMContentLoaded', () => {
  const button = document.createElement('button');
  button.textContent = 'Project tools';
  button.type = 'button';
  button.onclick = workflowMenu;
  document.querySelector('header nav').append(button);
  $('#dialog').addEventListener('close', () => { $('#submit').hidden = false; });
  $('#fields').addEventListener('click', async event => {
    const action = event.target.dataset.workflow;
    if (!action) return;
    await new Promise(resolve => {
      $('#dialog').addEventListener('close', resolve, {once:true});
      $('#dialog').close();
    });
    try {
      if (action === 'requirements') requirementDialog();
      if (action === 'changes') changesDialog();
      if (action === 'instructions') instructionDialog();
      if (action === 'compare') compareDialog();
      if (action === 'backup') { await backupProject(); toast('Backup created'); }
      if (action === 'restore') {
        dialog('Import project backup', '<label for="backup-file">Choose a Review Desk JSON backup</label><input id="backup-file" type="file" accept=".json,application/json" required><p class="hint">Import creates an independent project.</p>', async () => {
          const file = $('#backup-file').files[0];
          if (!file) throw Error('Choose a backup file.');
          await restoreProject(file);
        });
      }
    } catch (error) { toast(error.message); }
  });
});
