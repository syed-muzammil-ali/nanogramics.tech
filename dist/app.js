const demoData = {
  pos: {number:'01',url:'point-of-sale',overline:'YOUR BUSINESS, AT A GLANCE',title:'A good day to grow.',label1:'Today’s revenue',value1:'Rs. 84,250',trend1:'↗ 12.8% vs. yesterday',label2:'Orders completed',value2:'128',trend2:'Everything in sync',chart:'Sales overview',bottomTitle:'Less busywork. More business.',bottomCopy:'Sales, stock, and customers. Connected.',bars:[39,58,48,76,63,93,73]},
  erp: {number:'02',url:'business-operations',overline:'ONE VIEW. EVERY MOVING PART.',title:'Everything, connected.',label1:'Inventory value',value1:'Rs. 2.4M',trend1:'Across 3 locations',label2:'Orders to fulfil',value2:'42',trend2:'Updated in real time',chart:'Weekly order fulfilment',bottomTitle:'Your whole operation. One workspace.',bottomCopy:'Inventory, purchasing, and teams. Aligned.',bars:[48,65,73,57,82,89,97]},
  saas: {number:'03',url:'saas-platform',overline:'YOUR NEXT BIG IDEA, IN MOTION.',title:'Built for your next step.',label1:'Active users',value1:'2,480',trend1:'↗ 18.4% this month',label2:'Active workspaces',value2:'186',trend2:'Made for collaboration',chart:'Platform activity',bottomTitle:'From an idea to an everyday essential.',bottomCopy:'A product shaped around your customers.',bars:[26,38,53,64,60,80,96]}
};
const demoTabs = [...document.querySelectorAll('[data-demo]')];
function showDemo(tab) {
  const data = demoData[tab.dataset.demo];
  demoTabs.forEach(t=>{t.setAttribute('aria-selected',String(t===tab));t.tabIndex=t===tab?0:-1;});
  document.getElementById('demo-panel').setAttribute('aria-labelledby',tab.id);
  document.querySelector('.version').textContent=`${data.number} / 03`;
  const values={'app-url':`workspace / ${data.url}`,'demo-overline':data.overline,'demo-title':data.title,'metric-label-1':data.label1,'metric-value-1':data.value1,'metric-trend-1':data.trend1,'metric-label-2':data.label2,'metric-value-2':data.value2,'metric-trend-2':data.trend2,'chart-title':data.chart,'demo-bottom-title':data.bottomTitle,'demo-bottom-copy':data.bottomCopy};
  Object.entries(values).forEach(([id,value])=>document.getElementById(id).textContent=value);
  document.querySelectorAll('.bars>div').forEach((bar,i)=>bar.style.setProperty('--height',`${data.bars[i]}%`));
  const labels = document.querySelectorAll('.chart-labels span');
  (tab.dataset.demo==='pos'?['90k','60k','30k']:tab.dataset.demo==='erp'?['100','65','30']:['3k','2k','1k']).forEach((text,i)=>labels[i].textContent=text);
  document.querySelector('.chart').setAttribute('aria-label',`Illustrative ${data.chart.toLowerCase()} chart; sample data`);
}
demoTabs.forEach((tab,index)=>{
  tab.addEventListener('click',()=>showDemo(tab));
  tab.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    let next=event.key==='Home'?0:event.key==='End'?demoTabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+demoTabs.length)%demoTabs.length;
    demoTabs[next].focus();showDemo(demoTabs[next]);
  });
});
const toggle=document.querySelector('.menu-toggle');
const nav=document.getElementById('navigation');
function closeMenu(){if(!nav||!toggle)return;nav.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Open navigation');}
if(toggle&&nav){
  toggle.addEventListener('click',()=>{const open=nav.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&nav.classList.contains('is-open')){closeMenu();toggle.focus();}});
  document.addEventListener('click',e=>{if(!nav.contains(e.target)&&!toggle.contains(e.target))closeMenu();});
  const compactNavigation=window.matchMedia('(max-width: 1100px)');
  compactNavigation.addEventListener('change',closeMenu);
}
const serviceSelect=document.getElementById('service-select');
if(serviceSelect)document.querySelectorAll('[data-service]').forEach(link=>link.addEventListener('click',()=>{serviceSelect.value=link.dataset.service;serviceSelect.dispatchEvent(new Event('change',{bubbles:true}));}));
const year=document.getElementById('year');
if(year)year.textContent=new Date().getFullYear();
const revealSelectors='.section-heading,.hero-copy,.hero-visual,.expertise-strip,.service,.work-link,.studio-statement>*,.process-grid article,.contact-copy,.contact form,.projects-toolbar,.project-filters,.project-card,.concept-divider,.clients-cta>*,.services-close>*';
document.querySelectorAll(revealSelectors).forEach(item=>{
  if(!item.classList.contains('reveal'))item.classList.add('reveal');
});
document.querySelectorAll('.service-grid .service:nth-child(3n+2),.process-grid article:nth-child(even),.project-grid .project-card:nth-child(even)').forEach(item=>item.classList.add('reveal-delay'));
const revealItems=[...document.querySelectorAll('.reveal')];
if(revealItems.length){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)revealItems.forEach(item=>item.classList.add('is-visible'));
  else{
    const revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{
      if(!entry.isIntersecting)return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }),{threshold:.14,rootMargin:'0px 0px -8%'});
    revealItems.forEach(item=>revealObserver.observe(item));
  }
}

const serviceSections=[...document.querySelectorAll('.service-section')];
if(serviceSections.length){
  const serviceIndex=document.querySelector('.services-index-inner');
  const serviceLinks=[...(serviceIndex?.querySelectorAll('a')||[])];
  let activeService;
  let serviceScrollFrame;

  const setActiveService=section=>{
    if(!section||section===activeService)return;
    activeService=section;
    serviceSections.forEach(item=>item.classList.toggle('is-active',item===section));
    serviceLinks.forEach(link=>{
      const isActive=link.hash===`#${section.id}`;
      link.classList.toggle('is-active',isActive);
      if(isActive)link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
    const activeLink=serviceLinks.find(link=>link.hash===`#${section.id}`);
    if(activeLink&&serviceIndex){
      const targetLeft=activeLink.offsetLeft-(serviceIndex.clientWidth-activeLink.offsetWidth)/2;
      serviceIndex.scrollTo({left:Math.max(0,targetLeft),behavior:'smooth'});
    }
  };

  const updateActiveService=()=>{
    serviceScrollFrame=undefined;
    const focusLine=window.innerHeight*.46;
    const section=serviceSections.find(item=>{
      const bounds=item.getBoundingClientRect();
      return bounds.top<=focusLine&&bounds.bottom>focusLine;
    })||serviceSections.reduce((closest,item)=>{
      const distance=Math.abs(item.getBoundingClientRect().top-focusLine);
      return distance<closest.distance?{item,distance}:closest;
    },{item:serviceSections[0],distance:Infinity}).item;
    setActiveService(section);
  };

  const requestServiceUpdate=()=>{
    if(!serviceScrollFrame)serviceScrollFrame=requestAnimationFrame(updateActiveService);
  };
  window.addEventListener('scroll',requestServiceUpdate,{passive:true});
  window.addEventListener('resize',requestServiceUpdate);
  serviceLinks.forEach(link=>link.addEventListener('click',()=>{
    const target=document.querySelector(link.hash);
    if(target)setActiveService(target);
  }));
  updateActiveService();
}
let briefUrl;
const projectForm=document.getElementById('project-form');
if(projectForm){
  const query=new URLSearchParams(window.location.search);
  const selectedService=query.get('service');
  if([...serviceSelect.options].some(option=>option.value===selectedService))serviceSelect.value=selectedService;
  if(projectForm.elements.meetingDate)projectForm.elements.meetingDate.min=new Date().toISOString().slice(0,10);
  const project=query.get('project');
  if(project&&selectedService===serviceSelect.value)projectForm.elements.brief.value=`I’d like to discuss a project similar to ${project.slice(0,100)}${query.get('kind')==='client'?'':' (concept)'}.\n\nMy goals: `;
  const resetBrief=()=>{
    document.getElementById('form-result').hidden=true;
    document.getElementById('download-brief').removeAttribute('href');
    if(briefUrl){URL.revokeObjectURL(briefUrl);briefUrl=undefined;}
  };
  projectForm.addEventListener('input',event=>{event.target.setCustomValidity?.('');resetBrief();});
  projectForm.addEventListener('change',resetBrief);
}
function createBriefDownload(data){
  const brief=`NANOGRAMICS — MEETING REQUEST\n\nName: ${data.get('name').trim()}\nEmail: ${data.get('email').trim()}\nService: ${data.get('service')}\nPreferred meeting date: ${data.get('meetingDate')}\n\nSmall message\n${data.get('brief').trim()}\n\nCreated with the Nanogramics website.\n`;
  if(briefUrl)URL.revokeObjectURL(briefUrl);
  briefUrl=URL.createObjectURL(new Blob([brief],{type:'text/plain;charset=utf-8'}));
  document.getElementById('download-brief').href=briefUrl;
}
if(projectForm)projectForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  for(const field of [form.elements.name,form.elements.brief])field.setCustomValidity(field.value.trim()?'':'Please enter a value, not only spaces.');
  if(!form.reportValidity())return;
  const data=new FormData(form);
  const result=document.getElementById('form-result');
  const resultTitle=result.querySelector('strong');
  const resultCopy=result.querySelector('p');
  const submitButton=form.querySelector('button[type="submit"]');
  submitButton.disabled=true;
  submitButton.textContent='Saving request...';
  createBriefDownload(data);
  try{
    const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(data))});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.errors?.join(' ')||payload.error||'Your request could not be saved.');
    resultTitle.textContent='Your request has been saved.';
    resultCopy.textContent=`Inquiry #${payload.inquiryId} is now in the Nanogramics project database. You can also download a copy for your records.`;
    form.reset();
    if(form.elements.meetingDate)form.elements.meetingDate.min=new Date().toISOString().slice(0,10);
  }catch(error){
    resultTitle.textContent='Your request is ready to download.';
    resultCopy.textContent=`The database is not connected in this preview, so nothing was sent. ${error.message} Download the request and share it with the Nanogramics team.`;
  }finally{
    submitButton.disabled=false;
    submitButton.innerHTML='Create meeting request <span>↗</span>';
    result.hidden=false;
    result.focus();
  }
});

const portfolioFilters=document.querySelector('.project-filters');
if(portfolioFilters){
  const buttons=[...portfolioFilters.querySelectorAll('[data-filter]')];
  const cards=[...document.querySelectorAll('.project-card')];
  portfolioFilters.hidden=false;
  buttons.forEach(button=>button.addEventListener('click',()=>{
    const category=button.dataset.filter;
    let visible=0;
    buttons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
    cards.forEach(card=>{
      card.hidden=category!=='all'&&card.dataset.category!==category;
      if(!card.hidden)visible++;
    });
    const label={all:'',systems:'POS & ERP ',social:'social media ',websites:'website '}[category];
    const clientCount=cards.filter(card=>!card.hidden&&card.dataset.kind==='client').length;
    document.getElementById('project-count').textContent=category==='all'?`${clientCount} client projects · ${visible-clientCount} concepts`:clientCount?`${clientCount} website projects`:`${visible} ${label}concept${visible===1?'':'s'}`;
    const divider=document.querySelector('[data-concept-divider]');
    if(divider)divider.hidden=category==='websites';
  }));
}

const screenshotDialog=document.getElementById('screenshot-dialog');
if(screenshotDialog){
  let previewTrigger;
  document.querySelectorAll('[data-preview]').forEach(button=>button.addEventListener('click',()=>{
    const source=document.getElementById(button.dataset.preview)?.querySelector('.project-screenshot img');
    if(!source)return;
    previewTrigger=button;
    const preview=source.cloneNode();
    preview.loading='eager';
    const frame=document.createElement('div');
    frame.className='product-preview-frame';
    const chrome=document.createElement('div');
    chrome.className='product-preview-chrome';
    chrome.innerHTML='<span class="browser-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Landing page preview</span>';
    const viewport=document.createElement('div');
    viewport.className='product-preview-viewport';
    viewport.append(preview);
    frame.append(chrome,viewport);
    document.getElementById('screenshot-image-slot').replaceChildren(frame);
    document.getElementById('screenshot-title').textContent=button.dataset.title;
    screenshotDialog.showModal();
    document.body.classList.add('preview-open');
  }));
  screenshotDialog.querySelector('.close-preview').addEventListener('click',()=>screenshotDialog.close());
  screenshotDialog.addEventListener('click',event=>{
    const bounds=screenshotDialog.getBoundingClientRect();
    if(event.target===screenshotDialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))screenshotDialog.close();
  });
  screenshotDialog.addEventListener('close',()=>{document.body.classList.remove('preview-open');previewTrigger?.focus();});
}
