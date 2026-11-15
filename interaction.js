'use strict';

function attach() {
  const id=criterionId;
  let sourceURL, attachment, details, generation=0;
  function release() {
    generation++;
    if(sourceURL) URL.revokeObjectURL(sourceURL);
    sourceURL=null;
  }
  dialog('Attach evidence', '<label for="attachment">Choose a local file</label><input required id="attachment" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,.txt,.md"><p class="hint">Supports PNG, JPG, WebP, MP4, WebM and UTF-8 text. Blank lines separate paragraphs.</p><div id="locator"></div>'+area('What does this evidence show? (optional)','caption'), async()=>{
    if(!attachment || !details) throw Error('Choose a file and set its location first.');
    const e={id:uid(), name:attachment.name, caption:value('caption'), ...details};
    if(e.kind==='video') {
      const video=$('#locator video');
      if(video.readyState<2 || video.seeking) throw Error('Wait for the video to load before saving.');
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
        if(file.size>2*1024*1024) throw Error('Text files must be 2 MB or smaller.');
        const text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
        if(version!==generation) return;
        const blocks=paragraphs(text);
        if(!blocks.length) throw Error('The document is empty.');
        box.innerHTML='<label for="paragraph">Choose paragraph</label><select id="paragraph">'+blocks.map((p,i)=>`<option value="${i+1}">Paragraph ${i+1}　${esc(p.slice(0,42))}</option>`).join('')+'</select><p class="hint" id="excerpt"></p>';
        const excerpt=()=>{$('#excerpt').textContent=blocks[Number($('#paragraph').value)-1];};
        $('#paragraph').onchange=excerpt;excerpt();
        details={kind:'text',text};
      } else if(/^image\/(png|jpeg|webp)$/.test(file.type)) {
        sourceURL=URL.createObjectURL(file);
        box.innerHTML=`<p class="hint">Click the image or enter coordinates below (%).</p><div class="stage"><div class="picture"><img alt="Image to mark" src="${esc(sourceURL)}">${mark(50,50)}</div></div><div class="actions"><label for="px">Horizontal</label><input type="number" id="px" min="0" max="100" value="50" required><label for="py">Vertical</label><input type="number" id="py" min="0" max="100" value="50" required></div>`;
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
        box.innerHTML=`<p class="hint">Move the playhead to the desired moment. Saving records the current time.</p><div class="stage"><video controls playsinline preload="auto" src="${esc(sourceURL)}"></video></div>`;
        box.querySelector('video').onerror=()=>{if(version===generation){details=null;$('#form-error').textContent='Your browser cannot decode this video.';}};
        details={kind:'video'};
      } else throw Error('Choose a supported file format.');
      attachment=file;
    } catch(error) {
      if(version===generation) $('#form-error').textContent=error.message;
    }
  };
}
function detach() {
  const c=criterion(), e=c.evidence.find(e=>e.id===evidenceId);
  dialog('Remove evidence',`<p>Remove “${esc(e.name)}” from this criterion and review again? The original file remains on disk.</p>`,async()=>{
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
$('#new-project').onclick=()=>dialog('New review',field('Project name','project-name','',true),async()=>{
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
  const exporting=$('#submit').textContent==='Export';
  try {await submitAction();$('#dialog').close();toast(exporting?'Report generated':'Saved locally');}
  catch(error){$('#form-error').textContent=error.name==='QuotaExceededError'?'Browser storage is full. Choose a smaller file.':error.message;}
  finally{$('#submit').disabled=false;}
};
initialize().catch(error=>{$('#app').textContent='Cannot open local storage. Open this file in Edge or Chrome outside private mode. '+error.message;});
