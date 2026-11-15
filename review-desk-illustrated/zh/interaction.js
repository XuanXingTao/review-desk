'use strict';

function attach() {
  const id=criterionId;
  let sourceURL, attachment, details, generation=0;
  function release() {
    generation++;
    if(sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL=null;
  }
  dialog('关联证据', '<label for="attachment">选择本地交付物</label><input required id="attachment" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.txt,.md"><p class="hint">支持 PNG、JPG、WebP、MP4、WebM 或 UTF-8 文本。文档按空行分段。</p><div id="locator"></div>'+area('这份证据说明什么？（选填）','caption'), async()=>{
    if(!attachment || !details) throw Error('请先选择并定位一份可预览的文件。');
    const e={id:uid(), name:attachment.name, caption:value('caption'), ...details};
    if(e.kind==='video') {
      const video=$('#locator video');
      if(video.readyState<2 || video.seeking) throw Error('请等视频画面加载后重试。');
      e.time=video.currentTime;
    }
    if(e.kind==='text') e.paragraph=Number($('#paragraph').value);
    await save(p=>{
      const c=p.criteria.find(c=>c.id===id);
      c.evidence.push(e);
      invalidate(c);
    }, e.kind==='text'?null:{id:e.id,blob:attachment});
    evidenceId=e.id;
    await render();
  },release);
  $('#attachment').onchange=async event=>{
    release();
    const version=generation;
    const file=event.target.files[0];
    const box=$('#locator');
    attachment=null;details=null;box.replaceChildren();$('#form-error').textContent='';
    if(!file) return;
    try {
      if(/\.(md|txt)$/i.test(file.name)) {
        if(file.size>2*1024*1024) throw Error('此版支持 2 MB 以内的文本文件。');
        const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
        if(version!==generation) return;
        const blocks=paragraphs(text);
        if(!blocks.length) throw Error('文档内容为空。');
        box.innerHTML='<label for="paragraph">关联段落</label><select id="paragraph">'+blocks.map((p,i)=>`<option value="${i+1}">第 ${i+1} 段　${esc(p.slice(0,42))}</option>`).join('')+'</select><p class="hint" id="excerpt"></p>';
        const excerpt=()=>{$('#excerpt').textContent=blocks[Number($('#paragraph').value)-1];};
        $('#paragraph').onchange=excerpt;excerpt();
        details={kind:'text',text};
      } else if(/^image\/(png|jpeg|webp)$/.test(file.type)) {
        sourceURL=URL.createObjectURL(file);
        box.innerHTML=`<p class="hint">点击截图设置标记，或使用下方坐标（%）。</p><div class="stage"><div class="picture"><img alt="待定位截图" src="${esc(sourceURL)}">${mark(50,50)}</div></div><div class="actions"><label for="px">横向</label><input type="number" id="px" min="0" max="100" value="50" required><label for="py">纵向</label><input type="number" id="py" min="0" max="100" value="50" required></div>`;
        await box.querySelector('img').decode();
        if(version!==generation) return;
        details={kind:'image',x:50,y:50};
        const picture=box.querySelector('.picture');
        function position() {
          details.x=Number($('#px').value);details.y=Number($('#py').value);
          picture.querySelector('.pin').style.cssText=`left:${details.x}%;top:${details.y}%`;
        }
        $('#px').oninput=$('#py').oninput=position;
        picture.onclick=event=>{
          const rect=picture.getBoundingClientRect();
          $('#px').value=Math.round(100*(event.clientX-rect.left)/rect.width);
          $('#py').value=Math.round(100*(event.clientY-rect.top)/rect.height);
          position();
        };
      } else if(/^video\/(mp4|webm)$/.test(file.type)) {
        sourceURL=URL.createObjectURL(file);
        box.innerHTML=`<p class="hint">把播放头移到需要复核的时刻，保存时记录当前时间。</p><div class="stage"><video controls playsinline preload="auto" src="${esc(sourceURL)}"></video></div>`;
        box.querySelector('video').onerror=()=>{if(version===generation){details=null;$('#form-error').textContent='浏览器无法解码这段视频。';}};
        details={kind:'video'};
      } else throw Error('请选择支持的文件格式。');
      attachment=file;
    } catch(error) {
      if(version===generation) $('#form-error').textContent=error.message;
    }
  };
}
function detach() {
  const c=criterion(), e=c.evidence.find(e=>e.id===evidenceId);
  dialog('移除证据',`<p>从这条条件移除「${esc(e.name)}」并重新复核？磁盘上的原文件会保留。</p>`,async()=>{
    await save(p=>{
      const item=p.criteria.find(item=>item.id===c.id);
      item.evidence=item.evidence.filter(item=>item.id!==e.id);
      invalidate(item);
    },{remove:[e.id]});
    await render();
  });
}
$('#app').addEventListener('click',async event=>{
  const button=event.target.closest('button');
  if(!button) return;
  try {
    if(button.dataset.item) {criterionId=button.dataset.item;evidenceId=undefined;await render();return;}
    if(button.dataset.evidence) {evidenceId=button.dataset.evidence;await render();return;}
    switch(button.dataset.act) {
      case 'add': editCriterion();break;
      case 'edit': editCriterion(criterion());break;
      case 'attach': attach();break;
      case 'detach': detach();break;
      case 'pass': case 'fix': review(button.dataset.act);break;
      case 'export': exportDialog();break;
      case 'seek': {
        const v=$('#preview video');v.pause();v.currentTime=criterion().evidence.find(e=>e.id===evidenceId).time;break;
      }
    }
  }catch(error){toast(error.message);}
});
$('#new-project').onclick=()=>dialog('新建验收单',field('交付项目名称','project-name','',true),async()=>{
  const p={id:uid(),name:necessary(value('project-name')),revision:0,criteria:[]};
  const tx=db.transaction('projects','readwrite');
  tx.objectStore('projects').add(p);await done(tx);await switchProject(p.id);
});
$('#projects').onchange=event=>switchProject(event.target.value).catch(error=>toast(error.message));
$('#close').onclick=$('#cancel').onclick=()=>$('#dialog').close();
$('#dialog').addEventListener('close',()=>{releaseDialog?.();releaseDialog=null;$('#fields').replaceChildren();});
$('#form').onsubmit=async event=>{
  event.preventDefault();
  if($('#submit').disabled) return;
  $('#submit').disabled=true;
  const exporting=$('#submit').textContent==='导出';
  try {await submitAction();$('#dialog').close();toast(exporting?'报告已生成':'已保存到本机');}
  catch(error){$('#form-error').textContent=error.name==='QuotaExceededError'?'浏览器存储空间不足，请选择较小的文件。':error.message;}
  finally{$('#submit').disabled=false;}
};
initialize().catch(error=>{$('#app').textContent='无法打开本地存储。请用正常模式的 Edge 或 Chrome 打开此文件。'+error.message;});
