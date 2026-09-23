import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist');
const pages=new Map();
for(const name of ['index.html','clients.html','founder.html','services.html'])pages.set(name,await readFile(path.join(root,name),'utf8'));
let checked=0;
for(const [name,html] of pages){
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,`${name}: duplicate IDs`);
  assert.equal([...html.matchAll(/<h1[ >]/g)].length,1,`${name}: expected one main heading`);
  for(const [,attribute,value] of html.matchAll(/\b(href|src)="([^"]+)"/g)){
    if(/^(https?:|mailto:|tel:|data:)/.test(value))continue;
    const url=new URL(value.replaceAll('&amp;','&'),'http://local/'+name);
    const file=url.pathname.slice(1)||'index.html';
    await access(path.join(root,file));
    if(url.hash){
      const target=pages.get(file)||await readFile(path.join(root,file),'utf8');
      assert.ok(target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`),`${name}: missing target ${value}`);
    }
    checked++;
  }
}
const clients=pages.get('clients.html');
assert.equal([...clients.matchAll(/class="project-card /g)].length,9,'Expected four real website projects plus five concepts');
for(const [category,count] of [['systems',2],['social',3],['websites',4]])assert.equal([...clients.matchAll(new RegExp(`data-category="${category}"`,'g'))].length,count);
assert.equal([...clients.matchAll(/data-kind="client"/g)].length,4,'Expected four real client entries');
assert.equal([...clients.matchAll(/<img\b[^>]*\bsrc="assets\/projects\//g)].length,7,'Expected four supplied screenshots plus three generated social concept assets');
for(const [,id] of clients.matchAll(/data-preview="([^"]+)"/g))assert.ok(clients.includes(`id="${id}"`),`Missing screenshot target ${id}`);
const home=pages.get('index.html');
const services=[...home.matchAll(/data-service="([^"]+)"/g)].map(match=>match[1]);
assert.equal(services.length,6);
services.forEach(service=>assert.ok(home.includes(`<option>${service}</option>`),`Missing inquiry option ${service}`));
for(const [,value] of clients.matchAll(/href="index\.html\?service=([^&]+)&amp;project=/g))assert.ok(services.includes(decodeURIComponent(value)),'Invalid portfolio service link');
const founder=pages.get('founder.html');
assert.ok(founder.includes('assets/founder/syed-muzammil-ali.jpeg'),'Founder portrait is missing');
assert.ok(founder.includes('Syed Muzammil Ali'),'Founder name is missing');
for(const name of ['index.html','clients.html','founder.html','services.html']){
  const headerNav=pages.get(name).match(/<nav id="navigation"[^>]*>.*?<\/nav>/is)?.[0]||'';
  assert.ok(!headerNav.includes('founder.html'),`${name}: founder must not appear in the header navigation`);
}
const servicesPage=pages.get('services.html');
for(const id of ['saas','pos','erp','websites','social','design'])assert.ok(servicesPage.includes(`id="${id}"`),`Missing detailed service section: ${id}`);
console.log(`PASS: ${checked} local assets/links, unique IDs, headings, six services, four screenshot targets, and portfolio counts (4 client websites + 2 system / 3 social concepts).`);
