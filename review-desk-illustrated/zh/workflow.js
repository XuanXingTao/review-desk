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
  dialog('项目工具', `
    <div class="workflow-grid">
      <button type="button" data-workflow="requirements">需求与 AI 清单</button>
      <button type="button" data-workflow="changes">追踪需求变更</button>
      <button type="button" data-workflow="instructions">生成修改指令</button>
      <button type="button" data-workflow="compare">对比证据</button>
      <button type="button" data-workflow="backup">导出项目备份</button>
      <button type="button" data-workflow="restore">导入项目备份</button>
    </div><p class="hint">项目与附件保存在本机浏览器中。</p>`, async () => {});
  $('#submit').hidden = true;
}

function requirementDialog() {
  dialog('需求与 AI 清单', area('项目需求', 'requirement', project.requirement || '') +
    '<p class="hint">保存需求后，可下载提示词交给 AI。把 AI 返回的 JSON 粘贴到下方，经检查后导入。</p>' +
    area('AI 返回的清单 JSON（选填）', 'ai-list', ''), async () => {
    const requirement = value('requirement');
    let additions = [];
    if (value('ai-list')) {
      let data;
      try { data = JSON.parse(value('ai-list')); } catch { throw Error('清单必须是有效 JSON。'); }
      if (!Array.isArray(data) || data.length > 100 || !data.every(c =>
        c && typeof c.title === 'string' && c.title.trim() && c.title.length <= 180 &&
        typeof c.detail === 'string' && c.detail.length <= 4000)) {
        throw Error('请提供最多 100 条包含 title 和 detail 文本的清单。');
      }
      additions = data.map(c => ({id:uid(), title:c.title.trim(), detail:c.detail.trim(), status:'pending', note:'', evidence:[]}));
    }
    await save(p => {
      if ((p.requirement || '') !== requirement) {
        if (p.criteria.length) {
          (p.changes ||= []).push({
            at:new Date().toISOString(),
            text:'更新项目需求',
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
  btn.textContent = '下载 AI 清单提示词';
  btn.onclick = () => {
    const requirement = value('requirement');
    if (!requirement) { $('#form-error').textContent = '请先填写项目需求。'; return; }
    const prompt = `请根据以下需求编写可观察、可验证的验收条件。只返回 JSON 数组，每项包含 title 和 detail 两个字符串，不要声称已经完成验收。\n\n需求：\n${requirement}\n\n格式示例：\n[{"title":"提交后显示确认信息","detail":"点击提交后页面展示成功提示。"}]`;
    downloadFile('验收清单提示词.txt', prompt, 'text/plain;charset=utf-8');
  };
  $('#fields').append(btn);
}

function changesDialog() {
  const checks = project.criteria.map(c => `<label><input type="checkbox" value="${esc(c.id)}" style="width:auto"> ${esc(c.title)} · ${labels[c.status]}</label>`).join('');
  dialog('追踪需求变更', area('变更内容', 'change-text', '', true) +
    '<p class="hint">选择受影响的验收条件，保存后这些条件会重新进入待复核。原意见会保留在变更记录中。</p>' +
    (checks || '<p>当前没有验收条件。</p>') +
    `<details><summary>查看历史变更（${(project.changes || []).length}）</summary>${(project.changes || []).map(change => `<p class="note">${esc(change.at)}　${esc(change.text)}\n${esc(change.affected.map(c => c.title + '：' + labels[c.status] + (c.note ? ' / ' + c.note : '')).join('\n'))}</p>`).join('')}</details>`, async () => {
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
    '# 修改任务 · ' + project.name, '',
    '请根据以下人工复核意见修改交付物。完成后提供对应的新证据供再次复核。', '',
    ...items.flatMap(c => [
      '## ' + c.title, c.detail, '修改意见：' + c.note,
      ...c.evidence.map(e => '- 参考证据：' + e.name + ' · ' + anchor(e) + (e.caption ? ' · ' + e.caption : '')),
      ''
    ])
  ].join('\n');
  dialog('生成修改指令', '<p class="hint">包含当前标记为「需修改」的条件和意见。证据文件需要另外提供给执行修改的 AI。</p>' +
    area('修改指令', 'instruction-text', content), async () => {
      downloadFile(project.name + '-修改指令.md', value('instruction-text'), 'text/markdown;charset=utf-8');
    });
  $('#submit').textContent = '下载';
  if (!items.length) $('#form-error').textContent = '当前没有标记为「需修改」的条件。';
}

async function backupProject() {
  const snapshot = structuredClone(project);
  const files = {};
  for (const c of snapshot.criteria) for (const e of c.evidence) {
    if (e.kind !== 'text') files[e.id] = await portableSource(e);
    delete e.path;
  }
  downloadFile(snapshot.name + '-项目备份.json', JSON.stringify({format:'review-desk-backup', version:1, project:snapshot, files}), 'application/json');
}

async function restoreProject(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw Error('备份不是有效的 JSON 文件。'); }
  if (data.format !== 'review-desk-backup' || data.version !== 1 || !data.project || typeof data.project.name !== 'string' || !Array.isArray(data.project.criteria) || !data.files || typeof data.files !== 'object') throw Error('无法识别此项目备份。');
  const p = data.project;
  const attachments = [];
  p.id = uid(); p.revision = 0; p.name = p.name + '（导入）';
  if (p.changes !== undefined && !Array.isArray(p.changes)) throw Error('变更记录格式有误。');
  for (const c of p.criteria) {
    if (!c || typeof c.title !== 'string' || typeof c.detail !== 'string' || !['pending','pass','fix'].includes(c.status) || typeof c.note !== 'string' || !Array.isArray(c.evidence)) throw Error('验收条件格式有误。');
    c.id = uid();
    for (const e of c.evidence) {
      if (!e || !['image','video','text'].includes(e.kind) || typeof e.name !== 'string' || typeof e.caption !== 'string') throw Error('证据格式有误。');
      const oldId = e.id;
      e.id = uid();
      delete e.path;
      if (e.kind === 'text') {
        if (typeof e.text !== 'string' || !Number.isInteger(e.paragraph) || e.paragraph < 1 || e.paragraph > paragraphs(e.text).length) throw Error('文档证据定位有误。');
      } else {
        if (e.kind === 'image' && (![e.x,e.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100))) throw Error('截图定位有误。');
        if (e.kind === 'video' && (!Number.isFinite(e.time) || e.time < 0)) throw Error('视频定位有误。');
        const encoded = data.files[oldId];
        const mime = e.kind === 'image' ? /^data:image\/(png|jpeg|webp);base64,/ : /^data:video\/(mp4|webm);base64,/;
        if (typeof encoded !== 'string' || !mime.test(encoded)) throw Error('备份中的附件缺失或格式不受支持。');
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
  if (images.length < 2) { toast('请先为当前条件关联至少两张截图。'); return; }
  const options = images.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  dialog('对比截图', `<div class="compare-controls"><label>左侧<select id="compare-left">${options}</select></label><label>右侧<select id="compare-right">${options}</select></label></div><div class="compare-view"><div id="left-view"></div><div id="right-view"></div></div>`, async () => {}, () => urls.forEach(URL.revokeObjectURL));
  $('#submit').hidden = true;
  $('#compare-right').selectedIndex = 1;
  const urls = [];
  async function update(id, target) {
    const e = images.find(item => item.id === $(id).value);
    let src = e.path;
    if (!src) {
      const blob = await request(db.transaction('files').objectStore('files').get(e.id));
      if (!blob) { $(target).textContent = '附件不存在'; return; }
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
  button.textContent = '项目工具';
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
      if (action === 'backup') { await backupProject(); toast('备份已生成'); }
      if (action === 'restore') {
        dialog('导入项目备份', '<label for="backup-file">选择 Review Desk JSON 备份</label><input id="backup-file" type="file" accept=".json,application/json" required><p class="hint">导入后创建独立项目，原项目保持原样。</p>', async () => {
          const file = $('#backup-file').files[0];
          if (!file) throw Error('请选择备份文件。');
          await restoreProject(file);
        });
      }
    } catch (error) { toast(error.message); }
  });
});
