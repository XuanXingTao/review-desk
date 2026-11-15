'use strict';

async function portableSource(e) {
  if(e.path) return window.demoMedia[e.path];
  const blob=await request(db.transaction('files').objectStore('files').get(e.id));
  if(!blob) throw Error(`找不到附件 ${e.name}`);
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
async function portableReport(review) {
  const blocks=[];
  for(const c of review.criteria) {
    const evidence=[];
    for(const e of c.evidence) {
      let preview;
      if(e.kind==='text') {
        preview=`<blockquote>${esc(paragraphs(e.text)[e.paragraph-1])}</blockquote><details><summary>查看全文</summary><pre>${esc(e.text)}</pre></details>`;
      } else {
        const url=await portableSource(e);
        preview=e.kind==='image'?filePart(e,url):`<video controls playsinline preload="metadata" src="${esc(url)}#t=${Number(e.time)}"></video>`;
      }
      evidence.push(`<figure><figcaption><b>${esc(e.name)}</b> · ${kinds[e.kind]} · ${anchor(e)}</figcaption>${preview}<p>${esc(e.caption)}</p></figure>`);
    }
    blocks.push(`<article><small>${labels[c.status]}</small><h2>${esc(c.title)}</h2><p>${esc(c.detail)}</p>${c.note?`<p><b>复核意见</b>　${esc(c.note)}</p>`:''}${evidence.join('')}</article>`);
  }
  const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(review.name)} · 复核报告</title><style>
  *{box-sizing:border-box}body{color:#24392d;background:#f4f5ef;max-width:900px;margin:auto;padding:30px 16px;font:16px/1.65 system-ui,sans-serif;overflow-wrap:anywhere}article{padding:18px 24px;margin:18px 0;background:#fffefa;border:1px solid #ccd5c9;border-radius:12px}small{background:#e7edda;padding:4px 9px;border-radius:16px}h2{margin:6px 0}figure{margin:20px 0 0}figcaption{padding-bottom:8px}.picture{display:inline-block;position:relative;line-height:0;max-width:100%}img,video{max-width:100%;display:block}video{max-height:65vh}.pin{position:absolute;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px #245a42;background:#306e4cb3;transform:translate(-50%,-50%)}pre,blockquote,p{white-space:pre-wrap}blockquote{border-left:4px solid #799e46;margin:12px 0;padding:8px 16px;background:#edf3df}pre{word-break:break-word}summary{cursor:pointer}
  </style><h1>${esc(review.name)}</h1><p>复核报告 · ${new Date().toLocaleDateString('zh-CN')} · ${review.criteria.filter(c=>c.status==='pass').length}/${review.criteria.length} 条已通过</p>${blocks.join('')}</html>`;
  const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download=review.name.replace(/[\\/:*?"<>|]/g,'_')+'-复核报告.html';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function exportDialog() {
  dialog('导出复核报告','<label for="format">报告格式</label><select id="format"><option value="html">HTML · 含原始附件，可离线复核</option><option value="md">Markdown · 仅含结论、定位和段落摘录</option></select><p class="hint">HTML 会包含已关联的完整截图、视频和文档全文，可直接发给复核人。</p>',async()=>{
    if(value('format')==='html') await portableReport(project); else report();
  });
  $('#submit').textContent='导出';
}
