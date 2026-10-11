import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePaymentProof,lookupInvoice,onlineReturnSummary,availableRiderOrders,buildRiderPickup} from '../api/pos.js';
test('payment proof validates MIME, signature and payload size',()=>{
 const proof={name:'slip.png',mime:'image/png',base64:'iVBORw0KGgo='};assert.equal(validatePaymentProof(proof).name,'slip.png');
 assert.throws(()=>validatePaymentProof({...proof,base64:'invalid'}),/image type/);assert.throws(()=>validatePaymentProof({...proof,mime:'text/html'}),/PNG/);
 assert.throws(()=>validatePaymentProof({...proof,base64:Buffer.alloc(2*1024*1024+1).toString('base64')}),/2 MB/);
});
test('scanner lookup resolves original mixed-case invoice and uses its canonical ID for items',async()=>{
 const client={query:async(sql,args)=>{if(sql.includes('FROM pos_sales')){assert.equal(args[0],'SALE-AB12');return {rows:[{id:'sale-ab12',subtotal:100,discount:0}]};}if(sql.includes('FROM pos_sale_items')){assert.equal(args[0],'sale-ab12');return {rows:[{code:'A',name:'Suit',qty:1,price:100}]};}return {rows:[]};}};
 const result=await lookupInvoice(client,' *SALE-AB12* ');assert.equal(result.success,true);assert.equal(result.data.id,'sale-ab12');assert.equal(result.data.items[0].available,1);
});
test('return report counts invoice returns and legacy returned orders separately from simple returns',()=>{
 assert.deepEqual(onlineReturnSummary([{return_amount:50,return_pieces:1}],[{refund_amount:200,return_qty:2}],[{total:300,items:[{qty:3}]}]),{returnAmount:550,returnPieces:6});
});
test('pickup availability returns existing orders and excludes private slip contents',async()=>{
 const client={query:async(sql,args)=>{assert.match(sql,/NOT EXISTS/);assert.equal(args[1],'pickup-1');return {rows:[{id:'KHI123',items_json:'[{"qty":2}]',payment_proof_json:'private'}]};}};
 const orders=await availableRiderOrders(client,{pickup_id:'pickup-1'});assert.equal(orders[0].id,'KHI123');assert.equal(orders[0].payment_proof_json,undefined);assert.equal(orders[0].payment_proof_available,true);
});
test('paid and returned online parcels are excluded from rider collection balance',()=>{
 const base={id:'p',pickup_at:'2026-10-09',settlement:'informational',parcels_json:[{online_order_id:'PAID',payment_type:'paid',order_total_cents:20000,total_cents:20000,products:[],returns:[]},{online_order_id:'COD',payment_type:'cod',order_total_cents:10000,total_cents:10000,products:[],returns:[]}]};
 assert.equal(buildRiderPickup(base).totals.outstanding_cents,10000);base.parcels_json[1].returned=true;assert.equal(buildRiderPickup(base).totals.outstanding_cents,0);
});
