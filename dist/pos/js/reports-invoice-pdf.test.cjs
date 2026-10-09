const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture(admin = true) {
  const calls = [], toasts = [];
  const context = vm.createContext({ getTodayDate: () => '2026-09-12', auth: {isAdmin: () => admin},
    formatCurrency: String, formatDate: String, formatTime: String,
    API: {invoke: async (...args) => { calls.push(args); return {success:true}; }, deleteSale: async id => calls.push(['delete',id])},
    showToast: (...args) => toasts.push(args), showConfirm: async () => false
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'reports.js'), 'utf8') + ';globalThis.manager=reports;', context);
  context.manager.fullData={offline:{sales:[{id:'INV-106450',created_at:'2026-09-12',total:500},{id:'INV-106451',created_at:'2026-09-12',total:700}]}};
  return { context, manager:context.manager, calls, toasts };
}

test('Individual Sales has distinct PDF and admin Delete actions for each exact ID', async () => {
  const f=fixture();
  const html=f.manager.buildOfflineHTML();
  assert.equal((html.match(/title="PDF \/ View Invoice"/g)||[]).length,2);
  assert.equal((html.match(/title="Delete"/g)||[]).length,2);
  for (const id of ['INV-106450','INV-106451']) {
    assert.ok(html.includes(`reports.viewInvoicePdf(&quot;${id}&quot;, this)`));
    const button={disabled:false,textContent:'PDF'};
    await f.manager.viewInvoicePdf(id,button);
    assert.equal(button.disabled,false); assert.equal(button.textContent,'PDF');
  }
  assert.deepEqual(f.calls,[['invoice:pdf:open','INV-106450'],['invoice:pdf:open','INV-106451']]);
  assert.ok(!fixture(false).manager.buildOfflineHTML().includes('reports.deleteSale('));
});

test('PDF errors allow retry; repeated clicks do not issue a second call', async () => {
  const f=fixture(); let resolve;
  f.context.API.invoke=()=>new Promise(r=>resolve=r);
  const button={disabled:false,textContent:'PDF'};
  const pending=f.manager.viewInvoicePdf('INV-106450',button);
  assert.equal(button.disabled,true);
  await f.manager.viewInvoicePdf('INV-106450',button);
  resolve({success:false,error:'Disk unavailable'}); await pending;
  assert.equal(button.disabled,false);
  assert.match(f.toasts[0][0],/Disk unavailable.*retry/);
  assert.equal(f.calls.length,0);
});

test('Delete still requires admin permission and confirmation', async () => {
  const nonadmin=fixture(false); await nonadmin.manager.deleteSale('INV-106450');
  assert.equal(nonadmin.calls.length,0);
  const admin=fixture(); await admin.manager.deleteSale('INV-106450');
  assert.equal(admin.calls.length,0);
  admin.context.showConfirm=async()=>true; admin.manager.generateReport=async()=>{};
  await admin.manager.deleteSale('INV-106450');
  assert.deepEqual(admin.calls,[['delete','INV-106450']]);
});

test('hosted POS replaces Electron PDF IPC with browser print/export guidance', () => {
  const source=fs.readFileSync(path.join(__dirname,'../../../api/pos.js'),'utf8');
  assert.ok(source.includes("case 'invoice:pdf:open'"));
  assert.ok(source.includes('Use browser print/export'));
  assert.ok(!source.includes('ipcMain.handle'));
});
