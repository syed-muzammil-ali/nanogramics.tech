const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

test('history and detail use the exact transfer, show totals, and invoke read-only APIs', async () => {
  const elements = new Map(), calls = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id,{innerHTML:'',textContent:'',disabled:false,open:false,showModal(){this.open=true;},classList:{toggle(){}}});
    return elements.get(id);
  };
  const transfer = {id:1,transfer_number:'SHOP-original-reference',person_name:'Ahmed',shop_name:'Main Shop',source_name:'Warehouse',transferred_at:'2026-09-12T14:30:00',created_at:'2026-09-12T14:30:00',posted_at:'2026-09-12T14:30:00',created_by_username:'Cashier',status:'posted',total_products:3,total_quantity:18,items:[{brand:'Saya',product_name:'3 Piece Suit',quantity:5},{brand:'Sapphire',product_name:'Bedsheet',quantity:10},{brand:'J.',product_name:'Kurta',quantity:3}]};
  const context=vm.createContext({document:{getElementById:element},API:{invoke:async(channel,id)=>{calls.push([channel,id]);return channel==='shop:list'?[transfer]:transfer;}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'shop.js'),'utf8')+';globalThis.manager=shopManager',context);
  const manager=context.manager;
  await manager.loadHistory(0);
  const history=element('shop-history').innerHTML;
  for(const text of ['ST-00001','Ahmed','Main Shop','12-09-2026','02:30 PM','18 pcs','Completed','data-id="1"']) assert.ok(history.includes(text),text);
  await manager.details(1);
  const detail=element('shop-detail-content').innerHTML;
  for(const text of ['Transfer #ST-00001','Saya','Sapphire','Kurta','18 pcs','Cashier','SHOP-original-reference','read-only']) assert.ok(detail.includes(text),text);
  assert.ok(!/<input|<select|contenteditable|onclick=/i.test(detail));
  assert.deepEqual(calls,[['shop:list',0],['shop:details',1]]);
  assert.equal(element('shop-detail').open,true);
});
