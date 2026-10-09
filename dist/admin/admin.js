'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pages=[
  ['sales','Point of sale','Counter sales and receipts'],['wholesale','Wholesale','Wholesale billing'],['online','Online orders','Orders and fulfilment'],
  ['inventory','Inventory','Products, prices and stock'],['shop','Shop stock','Warehouse transfers'],['returns','Returns','Product returns'],
  ['exchange','Exchanges','Product exchanges'],['riders','Rider pickups','Delivery pickups'],['riders-payments','Rider payments','Payments and reconciliation'],
  ['riders-reports','Rider reports','Delivery performance'],['reports','Sales reports','Sales and staff reporting'],['audit','Audit log','Activity history'],['settings','Settings & users','Employees and configuration']
].map(([id,label,description])=>({id,label,description}));
let companies=[],editing=null,logo='';
const token=()=>sessionStorage.getItem('ng_platform_session')||'';
async function api(channel,...args){
  const response=await fetch('/api/pos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,args,token:token()||null})});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||payload.ok===false){if(response.status===401&&channel!=='platform:admin:login')showLogin();throw new Error(payload.error||'Request failed.');}
  return payload.result;
}
function showLogin(){sessionStorage.removeItem('ng_platform_session');$('admin-view').hidden=true;$('login-view').hidden=false;}
function showAdmin(){$('login-view').hidden=true;$('admin-view').hidden=false;}
function metric(label,value,note){return `<article class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;}
function render(){
  const query=$('search').value.trim().toLowerCase(),rows=companies.filter(c=>c.name.toLowerCase().includes(query));
  $('company-count').textContent=companies.length;
  $('metrics').innerHTML=metric('Total companies',companies.length,`${companies.filter(c=>c.active).length} active`)+metric('VIP companies',companies.filter(c=>c.plan==='VIP').length,'Premium workspaces')+metric('Active access',companies.filter(c=>c.active).length,'Can sign in now')+metric('Disabled',companies.filter(c=>!c.active).length,'Access suspended');
  $('company-rows').innerHTML=rows.length?rows.map(c=>`<tr><td><div class="company-cell">${c.logo?`<img class="avatar" src="${esc(c.logo)}" alt="">`:`<span class="avatar">${esc(c.name.slice(0,2).toUpperCase())}</span>`}<div><strong>${esc(c.name)}</strong><small>${esc(c.phone||'Company workspace')}</small></div></div></td><td><span class="pill">${esc(c.plan)}</span></td><td>${c.pages.length} / ${pages.length}</td><td><span class="status ${c.active?'':'off'}">${c.active?'Active':'Disabled'}</span></td><td>${new Date(c.createdAt).toLocaleDateString()}</td><td><div class="actions"><a href="/pos?company=${encodeURIComponent(c.name)}" target="_blank"><button>Open POS ↗</button></a><button data-edit="${c.id}">Edit</button><button data-toggle="${c.id}">${c.active?'Disable':'Enable'}</button>${c.isSystem?'':`<button class="danger" data-delete="${c.id}">Delete</button>`}</div></td></tr>`).join(''):'<tr><td colspan="6" class="muted">No companies found.</td></tr>';
}
async function refresh(){companies=await api('platform:admin:overview');showAdmin();render();$('updated').textContent='Updated '+new Date().toLocaleTimeString();}
function openEditor(company=null){
  editing=company;logo=company?.logo||'';const form=$('company-form');form.reset();form.elements.id.value=company?.id||'';
  $('dialog-title').textContent=company?'Edit company':'Create company';$('save-company').textContent=company?'Save changes →':'Create company →';
  document.querySelectorAll('.create-only').forEach(el=>el.hidden=!!company);form.elements.username.required=!company;form.elements.password.required=!company;
  if(company){for(const key of ['name','plan','phone','address'])form.elements[key].value=company[key]||'';}
  const chosen=company?.pages||pages.map(page=>page.id);
  $('modules').innerHTML=pages.map(page=>`<label class="module"><input type="checkbox" value="${page.id}" ${chosen.includes(page.id)?'checked':''}><span><strong>${esc(page.label)}</strong><small>${esc(page.description)}</small></span></label>`).join('');
  $('form-error').textContent='';$('company-dialog').showModal();
}
$('login-form').onsubmit=async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('login-error').textContent='';try{const data=Object.fromEntries(new FormData(event.currentTarget));const user=await api('platform:admin:login',data.username,data.password);sessionStorage.setItem('ng_platform_session',user.token);event.currentTarget.reset();await refresh();}catch(error){$('login-error').textContent=error.message;}finally{button.disabled=false;}};
$('company-form').onsubmit=async event=>{event.preventDefault();const button=$('save-company');button.disabled=true;$('form-error').textContent='';try{const data=Object.fromEntries(new FormData(event.currentTarget));delete data.logoFile;data.logo=logo;data.pages=[...$('modules').querySelectorAll('input:checked')].map(input=>input.value);if(editing)data.id=editing.id;const saved=await api(editing?'platform:admin:update':'platform:admin:create',data);$('company-dialog').close();$('notice').textContent=editing?`${saved.name} updated.`:`${saved.name} created. Its POS workspace is ready.`;await refresh();}catch(error){$('form-error').textContent=error.message;}finally{button.disabled=false;}};
$('company-rows').onclick=async event=>{const edit=event.target.closest('[data-edit]'),toggle=event.target.closest('[data-toggle]'),remove=event.target.closest('[data-delete]');try{if(edit)openEditor(companies.find(c=>c.id===edit.dataset.edit));if(toggle){const company=companies.find(c=>c.id===toggle.dataset.toggle);toggle.disabled=true;await api('platform:admin:toggle',company.id,!company.active);$('notice').textContent=`${company.name} ${company.active?'disabled':'enabled'}.`;await refresh();}if(remove){const company=companies.find(c=>c.id===remove.dataset.delete);const typed=prompt(`Permanent deletion removes all POS data for ${company.name}.\n\nType the exact company name to continue:`);if(typed===null)return;if(typed!==company.name)throw new Error('Company name did not match. Nothing was deleted.');if(!confirm(`Permanently delete ${company.name} and all of its POS data? This cannot be undone.`))return;remove.disabled=true;await api('platform:admin:delete',company.id,typed);$('notice').textContent=`${company.name} permanently deleted.`;await refresh();}}catch(error){$('notice').textContent=error.message;}finally{if(toggle)toggle.disabled=false;if(remove)remove.disabled=false;}};
$('new-company').onclick=()=>openEditor();$('close-dialog').onclick=$('cancel').onclick=()=>$('company-dialog').close();$('refresh').onclick=()=>refresh().catch(error=>$('notice').textContent=error.message);$('search').oninput=render;$('logout').onclick=showLogin;
$('select-all').onclick=()=>{$('modules').querySelectorAll('input').forEach(input=>input.checked=true);};
$('company-form').elements.logoFile.onchange=async event=>{const file=event.target.files[0];if(!file){logo=editing?.logo||'';return;}if(file.size>250000||!['image/png','image/jpeg','image/webp'].includes(file.type)){event.target.value='';$('form-error').textContent='Choose PNG, JPEG or WebP up to 250 KB.';return;}logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});};
if(token())refresh().catch(showLogin);else showLogin();
