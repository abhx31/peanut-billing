const $=s=>document.querySelector(s);
let isOwner=false,costs={},costsLoaded=false,migrating=false,db=null,ready=false,D={lots:[],bills:[],patti:[],opening:[],gcust:[],hamali:10,next:1,firm:"Peanut Traders"},R={lots:[],stockin:[],bills:[],pays:[],expenses:[],patti:[],gstcust:[],opening:[],opay:[],xfer:[],closing:[],hpaid:[],cjset:[],meta:{}};
const n=v=>parseFloat(v)||0,r2=v=>Math.round(v*100)/100,f=v=>"₹"+r2(v).toLocaleString("en-IN");
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const p2=v=>String(v).padStart(2,"0"),bno=b=>(b.kind==="gst"?"GST "+b.no:p2(b.no))+locT(b),locT=o=>o.loc==="NM"?" (New Mahavir)":"";
let LOC="";try{LOC=localStorage.getItem("loc")||""}catch(e){}
const lb=l=>LOC==="NM"?l.stk.N:l.stk.M;
const fyOf=d=>{const y=+d.slice(0,4),m=+d.slice(5,7),a=m>=4?y:y-1;return a+"-"+p2((a+1)%100)};
const nextNo=d=>D.bills.filter(b=>b.kind!=="gst"&&b.fy===fyOf(d)).reduce((m,b)=>Math.max(m,b.no),0)+1;
const cashP=b=>S(b.pays.filter(p=>p.m==="Cash"),p=>p.a),upiP=b=>S(b.pays.filter(p=>p.m==="UPI"),p=>p.a),paid=b=>b.pays.reduce((s,p)=>s+p.a,0),cjP=b=>S(b.pays.filter(p=>p.m==="CJ"),p=>p.a),pm=x=>{x=(x||"").toLowerCase();return x==="upi"?"UPI":x==="cj"?"CJ":"Cash"},key=s=>s.trim().toLowerCase();
const banner=t=>{const b=$("#bn");b.textContent=t;b.hidden=!t};
function say(m){const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(say.t);say.t=setTimeout(()=>{t.hidden=true},5000)}
function dlg(title,fields,okText){
 return new Promise(res=>{
  $("#dlgb").innerHTML=`<h2 style="margin:0 0 10px">${esc(title)}</h2>`+fields.map((f,i)=>f.type==="msg"?`<div class="empty" style="margin-bottom:8px">${f.label}</div>`:f.type==="select"?`<label style="margin-bottom:8px">${esc(f.label)}<select id="dl${i}">${f.options.map(o=>`<option>${esc(o)}</option>`).join("")}</select></label>`:`<label style="margin-bottom:8px">${esc(f.label)}<input id="dl${i}" type="${f.type||"text"}" step="any" inputmode="${f.type==="number"?"decimal":"text"}" value="${esc(f.value==null?"":f.value)}"></label>`).join("")+`<div class="row" style="margin-top:10px"><button class="btn" id="dlok" type="button">${okText||"OK"}</button><button class="sm" id="dlno" type="button" style="padding:10px 16px">Cancel</button></div>`;
  $("#dlg").hidden=false;const first=$("#dl"+fields.findIndex(f=>f.type!=="msg"));if(first)setTimeout(()=>first.focus(),50);
  const close=v=>{$("#dlg").hidden=true;res(v)};
  $("#dlok").onclick=()=>close(fields.map((f,i)=>f.type==="msg"?null:$("#dl"+i).value));
  $("#dlno").onclick=()=>close(null);
 });
}
const yn=async(m,t)=>!!(await dlg(t||"Please confirm",[{type:"msg",label:esc(m)}],"Yes"));
let printed=false;window.addEventListener("beforeprint",()=>{printed=true});
function doPrint(h,size){size=size||"A5";$("#pgsz").textContent="@page{size:"+size+" portrait;margin:"+(size==="A4"?"10mm":"8mm")+"}";$("#inv").className=size==="A4"?"a4":"a5";$("#inv").innerHTML=h;printed=false;try{window.print()}catch(e){}if(!printed)say("Printing is blocked in this window. Tap View, then Save as file, and print the file from your browser.")}
async function W(fn){
 if(!db){say("Shared storage is not connected. Open this page signed in to Claude.");return false}
 try{await fn();return true}catch(e){say("Could not save: "+(e&&(e.message||e.code))+"\nIf you have view-only access, ask the owner to give you edit access.");return false}
}
const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
function rebuild(){
 const sold={},soldN={},got={},pm={},xo={},xb={};
 R.bills.forEach(b=>itemsOf(b).forEach(i=>{sold[i.lotId]=(sold[i.lotId]||0)+i.bags;if(b.loc==="NM")soldN[i.lotId]=(soldN[i.lotId]||0)+i.bags}));
 R.xfer.forEach(x=>{const m=x.dir==="back"?xb:xo;m[x.lotId]=(m[x.lotId]||0)+x.bags});
 R.stockin.forEach(s=>got[s.lotId]=(got[s.lotId]||0)+s.bags);
 R.pays.forEach(p=>(pm[p.billId]||(pm[p.billId]=[])).push(p));
 D.lots=R.lots.map(l=>({...l,cost:costs[l.id]||0,hasCost:costs[l.id]!==undefined,bags:(got[l.id]||0)-(sold[l.id]||0),recvN:(xo[l.id]||0)-(xb[l.id]||0),soldN:soldN[l.id]||0,stk:{M:(got[l.id]||0)-(xo[l.id]||0)+(xb[l.id]||0)-((sold[l.id]||0)-(soldN[l.id]||0)),N:(xo[l.id]||0)-(xb[l.id]||0)-(soldN[l.id]||0)}})).sort((a,b)=>(a.at||0)-(b.at||0));
 D.bills=R.bills.map(b=>({...b,fy:b.fy||fyOf(b.date),items:itemsOf(b),profit:S(itemsOf(b),i=>i.amount-i.kg*(costs[i.lotId]||0)),pays:pm[b.id]||[]})).sort((a,b)=>a.no-b.no);
 D.gcust=[...R.gstcust].sort((a,b)=>a.name.localeCompare(b.name));
 D.opening=R.opening.map(o=>({...o,pays:R.opay.filter(p=>p.openId===o.id)})).sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.at||0)-(b.at||0));
 D.patti=[...R.patti].sort((a,b)=>a.no-b.no);
 D.hamali=R.meta.hamali??10;D.firm=R.meta.firm||"Peanut Traders";
 D.next=D.bills.reduce((m,b)=>Math.max(m,b.no),0)+1;
 migrate();render();
}
async function migrate(){
 if(!isOwner||!costsLoaded||!ready||migrating)return;
 const ol=R.lots.filter(l=>l.cost!==undefined),ob=R.bills.filter(b=>b.profit!==undefined);
 if(!ol.length&&!ob.length)return;
 migrating=true;let ok=false;
 try{
  const nc={...costs};ol.forEach(l=>{if(nc[l.id]===undefined)nc[l.id]=n(l.cost)});
  await db.doc("private/costs").set(nc);
  for(const l of ol){const {id,cost,...rest}=l;await db.doc("lots/"+id).set(rest)}
  for(const b of ob){const {id,profit,...rest}=b;await db.doc("bills/"+id).set(rest)}
 ok=true}catch(e){}
 migrating=false;if(ok)rebuild();
}
function applyRole(known){
 document.querySelector('nav [data-t="profit"]').hidden=!isOwner;
 $("#rvf").hidden=!isOwner;
 $("#fcard").hidden=!isOwner;
 document.querySelector('nav [data-t="patti"]').hidden=!isOwner;
 $("#lcw").hidden=!isOwner;
 $("#role").textContent=known?(isOwner?"Owner view: profit and cost are visible only to owners":"Staff view"):"";
}
const sub=(name,k)=>db.collection(name).onSnapshot(s=>{R[k]=rows(s);ready=true;rebuild()},e=>banner("Connection problem ("+e.code+"). Reload the page."));
const setMeta=(firm,hamali,extra)=>db.doc("meta/settings").set({...R.meta,firm,hamali,...(extra||{})});
const S=(a,fn)=>a.reduce((t,x)=>t+fn(x),0),allPays=()=>D.bills.flatMap(b=>b.pays.map(p=>({...p,b}))).concat(D.opening.flatMap(o=>o.pays.map(p=>({...p,b:{cust:o.cust,no:"Old due",loc:p.loc}}))));

document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
 document.querySelectorAll("nav button").forEach(x=>x.classList.toggle("on",x===b));
 ["dash","bill","gst","gcust","patti","lots","day","stock","nm","ledger","exp","ham","cj","recv","bal","profit"].forEach(id=>$("#"+id).hidden=id!==b.dataset.t);render()});
$("#firm").onclick=async()=>{const r=await dlg("Firm name",[{label:"Firm name",value:D.firm}]);if(r&&r[0].trim())W(()=>setMeta(r[0].trim(),D.hamali))};

let cart=[];
function curItem(){
 const lot=D.lots.find(l=>l.id==$("#bl").value),bags=n($("#bb").value),kg=n($("#bk").value),rate=n($("#bp").value);
 return lot&&bags>0&&kg>0&&rate>0?{lotId:lot.id,lot:lot.name,bags,kg,rate,wts:$("#bw").value.trim().replace(/\s+/g," "),amount:kg*rate}:null;
}
function calc(){
 const cur=curItem(),items=cart.concat(cur?[cur]:[]),hr=n($("#bh").value),g=0,cash=n($("#bcash").value),upi=n($("#bupi").value),cj=n($("#bcj").value);
 const bags=S(items,i=>i.bags),kg=S(items,i=>i.kg),amount=S(items,i=>i.amount),ham=bags*hr,gst=amount*g/100,total=amount+ham+gst,bal=total-cash-upi-cj;
 const profit=S(items,i=>{const l=D.lots.find(x=>x.id==i.lotId);return i.amount-i.kg*(l?l.cost:0)});
 return{items,bags,kg,amount,ham,gst,total,bal,profit,hr,g,cash,upi,cj};
}
function addItem(){
 const it=curItem();
 if(!it){$("#msg").textContent="Pick a lot and enter bags, weight and price first.";return}
 cart.push(it);["bb","bk","bw","bp"].forEach(id=>$("#"+id).value="");$("#bwi").textContent="";$("#msg").textContent="";drawCart();preview();
}
function rmItem(i){cart.splice(i,1);drawCart();preview()}
function drawCart(){
 $("#cart").innerHTML=cart.length?`<table><tr><th>Lot / quality</th><th>Bags</th><th>Kg</th><th>Price/kg</th><th>Amount</th><th></th></tr>${cart.map((i,x)=>`<tr><td>${esc(i.lot)}</td><td>${i.bags}</td><td>${i.kg}</td><td>${f(i.rate)}</td><td>${f(i.amount)}</td><td><button class="sm del" type="button" onclick="rmItem(${x})">Remove</button></td></tr>`).join("")}</table>`:`<div class="empty">No lot added yet. Fill in a lot below, then tap the add button, or just save if the bill has one lot.</div>`;
}
$("#additem").onclick=addItem;
function itemsOf(b){return b.items||[{lotId:b.lotId,lot:b.lot,bags:b.bags,kg:b.kg,rate:b.rate,wts:b.wts||"",amount:b.amount}]}
function preview(){
 const c=calc(),d0=$("#bd").value||today();
 $("#nb").textContent="Bill no. "+p2(nextNo(d0))+"  ·  period "+fyOf(d0);
 $("#pv").innerHTML=[["Bags · kg",c.bags+" · "+r2(c.kg)],["Amount (kg × price)",f(c.amount)],["Hamali",f(c.ham)],c.g?["GST "+c.g+"%",f(c.gst)]:null,["Total",f(c.total)],["Balance",f(c.bal)],isOwner?["Profit on this bill",f(c.profit)]:null]
 .filter(Boolean).map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
}
function fillLots(){
 const cur=$("#bl").value;
 $("#bl").innerHTML=D.lots.length?D.lots.map(l=>`<option value="${l.id}">${esc(l.name)} (${lb(l)} bags left${LOC?" at New Mahavir":""})</option>`).join(""):`<option value="">${ready?"Add a lot first":"Loading…"}</option>`;
 if(cur)$("#bl").value=cur;
}
function wparse(sel){sel=sel||"#bw";
 let cnt=0,tot=0;
 ($(sel).value.split(/[\s,;]+/).filter(Boolean)).forEach(t=>{
  const m=t.match(/^(\d+)[x*×](\d*\.?\d+)$/i);
  if(m){cnt+=+m[1];tot+=m[1]*m[2]}else if(n(t)>0){cnt++;tot+=n(t)}
 });
 return{cnt,tot:r2(tot)};
}
$("#bw").addEventListener("input",()=>{
 const w=wparse();
 if(w.cnt){$("#bk").value=w.tot;$("#bb").value=w.cnt}
 $("#bwi").textContent=w.cnt?w.cnt+" bags · total "+w.tot+" kg":"";
 preview();
});
["bd","bl","bb","bk","bp","bh","bcash","bupi","bcj"].forEach(id=>$("#"+id).addEventListener("input",preview));
function prevHint(){
 const k=key($("#bc").value),c=k&&custs().find(x=>key(x.name)===k);
 $("#prev").textContent=c&&c.bal>0.5?"Earlier balance of this customer: "+f(c.bal)+" (not included in this bill's total)":"";
}
$("#bc").addEventListener("input",prevHint);
$("#credit").onclick=()=>setCredit(!$("#credit").classList.contains("on"));
function setCredit(on){
 const b=$("#credit");b.classList.toggle("on",on);b.setAttribute("aria-pressed",on);
 ["bcash","bupi","bcj"].forEach(id=>{const e=$("#"+id);e.disabled=on;if(on)e.value=""});
 preview();
}

$("#save").onclick=()=>saveBill(false);
$("#savep").onclick=()=>saveBill(true);
$("#savev").onclick=()=>saveBill("view");
async function saveBill(pr){
 const c=calc(),cust=$("#bc").value.trim(),m=$("#msg");
 if(!cust||!c.items.length){m.textContent="Enter the customer and at least one lot with bags, weight and price.";return}
 const need={};c.items.forEach(i=>need[i.lotId]=(need[i.lotId]||0)+i.bags);
 for(const id in need){const l=D.lots.find(x=>x.id==id);if(l&&need[id]>lb(l)&&!(await yn("Only "+lb(l)+" bags of "+l.name+" in stock at "+(LOC?"New Mahavir":"the main store")+". Continue?")))return}
 const d=$("#bd").value||today(),no=nextNo(d),pays=[];
 if(c.cash>0)pays.push({d,m:"Cash",a:c.cash});if(c.upi>0)pays.push({d,m:"UPI",a:c.upi});if(c.cj>0)pays.push({d,m:"CJ",a:c.cj});
 const bill={...(LOC?{loc:LOC}:{}),no,fy:fyOf(d),date:d,cust,items:c.items,lot:[...new Set(c.items.map(i=>i.lot))].join(" + "),bags:c.bags,kg:r2(c.kg),rate:r2(c.amount/c.kg),ham:c.ham,g:c.g,gst:c.gst,amount:c.amount,total:c.total,at:Date.now()};
 let id=null;
 const ok=await W(async()=>{
  const ref=await db.collection("bills").add(bill);id=ref.id;
  for(const p of pays)await db.collection("pays").add({billId:id,...p});
  if(c.hr!==D.hamali)await setMeta(D.firm,c.hr);
 });
 if(!ok)return;
 m.textContent="Saved bill no. "+p2(no)+(c.cash+c.upi+c.cj<c.total-0.005?" (balance "+f(c.bal)+")":"");
 cart=[];["bc","bb","bk","bw","bp","bcash","bupi","bcj"].forEach(id=>$("#"+id).value="");$("#bwi").textContent="";
 setCredit(false);drawCart();preview();
 if(pr==="view")viewObj({...bill,id,pays});else if(pr)printObj({...bill,id,pays});
}
$("#addlot").onclick=()=>{
 const name=$("#ln").value.trim();if(!name)return;
 const bags=n($("#lb").value),cost=n($("#lc").value);
 W(async()=>{
  const ref=await db.collection("lots").add({name,at:Date.now()});
  if(isOwner&&cost>0)await db.doc("private/costs").set({...costs,[ref.id]:cost});
  if(bags>0)await db.collection("stockin").add({lotId:ref.id,bags,d:today()});
 }).then(ok=>{if(ok)["ln","lb","lc"].forEach(id=>$("#"+id).value="")});
};
async function moveNM(id){
 const l=D.lots.find(x=>x.id==id),r=await dlg("Move to New Mahavir",[{type:"msg",label:esc(l.name)+" · main store has "+l.stk.M+" bags"},{label:"Bags to move",type:"number"},{label:"Vehicle or note (optional)"}],"Move");
 if(!r)return;const v=n(r[1]);if(v<=0)return;
 if(v>l.stk.M&&!(await yn("Only "+l.stk.M+" bags in the main store. Move anyway?")))return;
 W(()=>db.collection("xfer").add({lotId:id,lot:l.name,bags:v,dir:"out",d:today(),note:r[2].trim(),at:Date.now()})).then(k=>{if(k)say("Moved "+v+" bags of "+l.name+" to New Mahavir.")});
}
async function addBags(id){const l=D.lots.find(x=>x.id==id),r=await dlg("Add stock",[{type:"msg",label:esc(l.name)},{label:"Bags to add",type:"number"}],"Add");const v=r?n(r[1]):0;if(v>0)W(()=>db.collection("stockin").add({lotId:id,bags:v,d:today()}))}
async function setCost(id){if(!isOwner)return;const l=D.lots.find(x=>x.id==id),r=await dlg("Cost per kg",[{type:"msg",label:esc(l.name)},{label:"Cost per kg (₹)",type:"number",value:l.cost}],"Save");if(r)W(()=>db.doc("private/costs").set({...costs,[id]:n(r[1])}))}
async function delLot(id){if(await yn("Delete this lot? Old bills keep its name."))W(()=>db.doc("lots/"+id).delete())}
async function receive(id){
 const b=D.bills.find(x=>x.id==id),r=await dlg("Receive payment",[{type:"msg",label:"Bill no. "+esc(bno(b))+" · balance "+f(b.total-paid(b))},{label:"Amount received (₹)",type:"number"},{label:"Received as",type:"select",options:["Cash","UPI","CJ"]}],"Save");
 if(!r)return;const a=n(r[1]);if(a<=0)return;
 W(()=>db.collection("pays").add({billId:id,d:today(),m:r[2],a}));
}
async function delBill(id){
 if(!(await yn("Delete this bill and return its bags to stock?")))return;
 const b=D.bills.find(x=>x.id==id);
 W(async()=>{for(const p of b.pays)await db.doc("pays/"+p.id).delete();await db.doc("bills/"+id).delete()});
}
async function receiveCust(i){
 const c=custs().filter(x=>x.bal>0.5)[i];if(!c)return;
 const r=await dlg("Receive payment",[{type:"msg",label:esc(c.name)+" · balance "+f(c.bal)},{label:"Amount received (₹)",type:"number"},{label:"Received as",type:"select",options:["Cash","UPI","CJ"]}],"Save");
 if(!r)return;let a=n(r[1]);if(a<=0)return;const m=r[2];
 W(async()=>{
  for(const o of D.opening.filter(x=>key(x.cust)===key(c.name))){
   const due=o.amount-S(o.pays,p=>p.a);if(due<=0.005||a<=0.005)continue;
   const t=Math.min(due,a);await db.collection("opay").add({openId:o.id,cust:o.cust,loc:LOC,d:today(),m,a:t});a-=t;
  }
  for(const b of D.bills.filter(x=>key(x.cust)===key(c.name)).sort((x,y)=>x.no-y.no)){
   const due=b.total-paid(b);if(due<=0.005||a<=0.005)continue;
   const t=Math.min(due,a);await db.collection("pays").add({billId:b.id,d:today(),m,a:t});a-=t;if(a<=0.005)break;
  }
 });
}
function printBill(id){printObj(D.bills.find(x=>x.id==id))}
function invHtml(b){
 if(b.kind==="gst")return gstHtml(b);
 const p=paid(b);
 return `<h2 style="margin:0">${esc(D.firm)}</h2><p>Bill no. ${bno(b)} &nbsp; Period: ${b.fy||fyOf(b.date)} &nbsp; Date: ${b.date}<br>Customer: <b>${esc(b.cust)}</b></p>
 <table><tr><th class="l">Lot / quality</th><th>Bags</th><th>Weight (kg)</th><th>Price/kg</th><th>Amount</th></tr>
 ${itemsOf(b).map(i=>`<tr><td>${esc(i.lot)}</td><td>${i.bags}</td><td>${i.kg}</td><td>${f(i.rate)}</td><td>${f(i.amount)}</td></tr>`).join("")}${itemsOf(b).length>1?`<tr><th class="l">Total</th><th>${b.bags}</th><th>${b.kg}</th><th></th><th>${f(b.amount)}</th></tr>`:""}</table>
 ${itemsOf(b).some(i=>i.wts)?`<p style="font-size:12px">Bag weights (kg):<br>${itemsOf(b).filter(i=>i.wts).map(i=>esc(i.lot)+": "+esc(i.wts)).join("<br>")}</p>`:""}
 <p style="text-align:right">Hamali: ${f(b.ham)}<br>${b.g?"GST "+b.g+"%: "+f(b.gst)+"<br>":""}<b>Total: ${f(b.total)}</b><br>Paid: ${f(p)}<br><b>Balance: ${f(b.total-p)}</b></p>`;
}
function printObj(b){doPrint(invHtml(b),b.kind==="gst"?"A4":"A5")}
let ovHtml="",ovSize="A5";
function editBill(id){
 const b=D.bills.find(x=>x.id==id);if(!b)return;
 const rows=b.items.map((i,x)=>{const has=D.lots.some(l=>l.id===i.lotId);return`<div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:8px"><label>Lot / quality<select id="ebl${x}">${has?"":`<option value="${esc(i.lotId)}" selected>${esc(i.lot)}</option>`}${D.lots.map(l=>`<option value="${l.id}"${l.id===i.lotId?" selected":""}>${esc(l.name)}</option>`).join("")}</select></label><label>Price per kg (₹)<input type="number" id="ebp${x}" step="0.01" value="${i.rate}" inputmode="decimal"></label><div class="empty" style="grid-column:1/-1">${i.bags} bags · ${i.kg} kg</div></div>`}).join("");
 showHtml(`<h2 style="margin:0 0 4px;color:#000">Edit bill ${bno(b)}</h2><div class="empty" style="margin-bottom:8px">${esc(b.cust)} · change the lot or price. Bags, weight and payments stay the same.</div>${rows}<button class="btn" type="button" onclick="saveEditBill('${id}')">Save changes</button>`);
 $("#ovp").hidden=true;$("#ovs").hidden=true;
}
function saveEditBill(id){
 const b=D.bills.find(x=>x.id==id);
 const items=b.items.map((i,x)=>{const l=D.lots.find(y=>y.id===$("#ebl"+x).value),r=n($("#ebp"+x).value);return{...i,lotId:l?l.id:i.lotId,lot:l?l.name:i.lot,rate:r,amount:r2(i.kg*r)}});
 if(items.some(i=>i.rate<=0)){say("Enter a price for every lot.");return}
 const goods=S(items,i=>i.amount),gst=r2(goods*(b.g||0)/100),upd={items,lot:[...new Set(items.map(i=>i.lot))].join(" + "),rate:r2(goods/b.kg),amount:goods,gst,total:goods+(b.ham||0)+gst};
 W(()=>db.doc("bills/"+id).update(upd)).then(ok=>{if(ok)$("#ov").hidden=true});
}
function showHtml(h,size){ovSize=size||"A5";$("#ovp").hidden=false;$("#ovs").hidden=false;ovHtml=h;$("#ovb").innerHTML=h;$("#ov").hidden=false;$("#ov").scrollTop=0}
function viewObj(b){showHtml(invHtml(b),b.kind==="gst"?"A4":"A5")}
function viewBill(id){viewObj(D.bills.find(x=>x.id==id))}
$("#ovc").onclick=()=>{$("#ov").hidden=true};
$("#ovp").onclick=()=>doPrint(ovHtml,ovSize);
$("#ovs").onclick=async()=>{
 const h=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill</title><style>@page{size:${ovSize} portrait;margin:${ovSize==="A4"?"10mm":"8mm"}}body{font:14px system-ui,sans-serif;margin:16px;color:#000}table{border-collapse:collapse}th,td{padding:4px 7px;text-align:left}.gs td,.gs th{border:1px solid #000}table:not(.gs) td,table:not(.gs) th{border-bottom:1px solid #999}</style></head><body>${ovHtml}</body></html>`;
 try{const d=await claude.use("downloads");await d.save({filename:"bill-"+today()+".html",data:h});say("Saved. Open the file and print it from your browser.")}catch(e){say("Could not save the file.")}
};
function custs(){
 const m={},g=(k,nm)=>m[k]||(m[k]={name:nm,open:0,billed:0,paid:0});
 D.bills.forEach(b=>{const c=g(key(b.cust),b.cust);c.billed+=b.total;c.paid+=paid(b)});
 D.opening.forEach(o=>{const c=g(key(o.cust),o.cust);c.open+=o.amount;c.paid+=S(o.pays,p=>p.a)});
 return Object.values(m).map(c=>({...c,bal:c.open+c.billed-c.paid}));
}
$("#rvadd").onclick=()=>{
 const cust=$("#rvc").value.trim(),a=n($("#rva").value);
 if(!cust||a<=0){say("Enter the customer and the amount due.");return}
 W(()=>db.collection("opening").add({cust,amount:a,date:$("#rvd").value||today(),note:$("#rvn").value.trim(),at:Date.now()})).then(ok=>{if(ok)["rvc","rva","rvn"].forEach(i=>$("#"+i).value="")});
};
const gO=id=>D.opening.find(x=>x.id===id);
async function rvReceive(id){
 const o=gO(id),due=o.amount-S(o.pays,p=>p.a),r=await dlg("Receive payment",[{type:"msg",label:esc(o.cust)+" · old due "+f(due)},{label:"Amount received (₹)",type:"number"},{label:"Received as",type:"select",options:["Cash","UPI","CJ"]}],"Save");
 if(!r)return;const a=n(r[1]);if(a<=0)return;const m=r[2];
 W(()=>db.collection("opay").add({openId:id,cust:o.cust,loc:LOC,d:today(),m,a}));
}
async function rvEdit(id){const o=gO(id),r=await dlg("Correct old due",[{type:"msg",label:esc(o.cust)},{label:"Amount due (₹)",type:"number",value:o.amount}],"Save");if(r&&n(r[1])>0)W(()=>db.doc("opening/"+id).update({amount:n(r[1])}))}
async function rvDel(id){const o=gO(id);if(!(await yn("Delete this old due"+(o.pays.length?" and its "+o.pays.length+" payment(s)":"")+"?")))return;W(async()=>{for(const p of o.pays)await db.doc("opay/"+p.id).delete();await db.doc("opening/"+id).delete()})}
function renderRecv(){
 $("#rvl").innerHTML=[...new Set(custs().map(c=>c.name).concat(D.gcust.map(c=>c.name)))].map(x=>`<option value="${esc(x)}">`).join("");
 if(!$("#rvd").value)$("#rvd").value=today();
 const tot=S(D.opening,o=>o.amount),got=S(D.opening,o=>S(o.pays,p=>p.a));
 $("#rvs").innerHTML=[["Old dues entered",f(tot)],["Received so far",f(got)],["Still due",f(tot-got)],["Customers",new Set(D.opening.map(o=>key(o.cust))).size]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 $("#rvt").innerHTML=D.opening.length?`<table><tr><th>Customer</th><th>As of</th><th>Old due</th><th>Received</th><th>Still due</th><th>Note</th><th></th></tr>${D.opening.map(o=>{const g=S(o.pays,p=>p.a),d=o.amount-g;return`<tr><td>${esc(o.cust)}</td><td class="l">${o.date||""}</td><td>${f(o.amount)}</td><td>${f(g)}</td><td class="${d>0.5?"neg":""}">${f(d)}</td><td class="l">${esc(o.note||"")}</td><td>${d>0.5?`<button class="sm" onclick="rvReceive('${o.id}')">Receive</button>`:""}${isOwner?`<button class="sm" onclick="rvEdit('${o.id}')">Edit</button><button class="sm del" onclick="rvDel('${o.id}')">Delete</button>`:""}</td></tr>`}).join("")}<tr><th>Total</th><th></th><th>${f(tot)}</th><th>${f(got)}</th><th>${f(tot-got)}</th><th></th><th></th></tr></table>`:`<div class="empty">No old dues entered yet.</div>`;
}
function renderBal(){
 $("#cl").innerHTML=custs().map(c=>`<option value="${esc(c.name)}">`).join("");
 const all=custs().sort((a,b)=>b.bal-a.bal),due=all.filter(x=>x.bal>0.5);
 const q=key($("#bsr").value||""),shown=all.filter(c=>!q||key(c.name).includes(q));
 $("#bt").innerHTML=shown.length?`<table><tr><th>Customer</th><th>Old due</th><th>Total billed</th><th>Paid</th><th>Balance</th><th></th></tr>${shown.map(c=>{const i=due.indexOf(c);return`<tr><td>${esc(c.name)}</td><td>${f(c.open)}</td><td>${f(c.billed)}</td><td>${f(c.paid)}</td><td class="${c.bal>0.5?"neg":""}">${f(c.bal)}</td><td>${i>=0?`<button class="sm" onclick="receiveCust(${i})">Receive</button>`:""}</td></tr>`}).join("")}<tr><th>${q?"Shown":"All customers"}</th><th>${f(shown.reduce((s,c)=>s+c.open,0))}</th><th>${f(shown.reduce((s,c)=>s+c.billed,0))}</th><th>${f(shown.reduce((s,c)=>s+c.paid,0))}</th><th>${f(shown.reduce((s,c)=>s+c.bal,0))}</th><th></th></tr></table>`:`<div class="empty">${q?"No customer matches your search.":"No bills yet. Balances appear here when a customer has not paid in full."}</div>`;
}
function cjBal(before){return S(allPays().filter(p=>p.m==="CJ"&&p.d<before),p=>p.a)-S(R.cjset.filter(x=>x.date<before),x=>x.amt)}
function cashBal(mode,before){
 const k=mode==="Cash"?"cash":"bank",c=R.closing.filter(x=>x.date<before&&x[k]!==undefined).sort((a,b)=>b.date.localeCompare(a.date))[0],from=c?c.date:"",lo=d=>d>from&&d<before;
 const base=c?n(c[k]):n(R.meta[mode==="Cash"?"openCash":"openBank"]);
 return base+S(allPays().filter(p=>p.m===mode&&lo(p.d)),p=>p.a)+S(R.cjset.filter(x=>x.mode===mode&&lo(x.date)),x=>x.amt)-S(R.expenses.filter(e=>e.mode===mode&&lo(e.date)),e=>e.amt)-S(R.patti.filter(x=>x.paidMode===mode&&x.paidDate&&lo(x.paidDate)),x=>x.net);
}
function renderDash(){
 const d=today(),r=byStore(d),T=k=>r[0][1][k]+r[1][1][k],bx=a=>a.map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 $("#dbx").innerHTML=bx([["Sales today",f(T("sales"))],["Cash received",f(T("ci"))],["UPI received",f(T("ui"))],["CJ received",f(T("cj"))],["Balance given (credit)",f(T("cr"))],["Expenses today",f(T("ce")+T("ue"))],...(isOwner?[["Profit today",f(T("profit"))]]:[])]);
 $("#dbs").innerHTML=storeTbl(d,false);
 const pend=S(D.bills,b=>b.total-paid(b))+S(D.opening,o=>o.amount-S(o.pays,p=>p.a));
 $("#dby").innerHTML=bx([...(isOwner?[["Cash in hand (book)",f(cashBal("Cash","9999-12-31"))],["Bank / UPI (book)",f(cashBal("UPI","9999-12-31"))],["With CJ (to collect)",f(cjBal("9999-12-31"))]]:[]),["Owed by customers",f(pend)],["Main store stock",S(D.lots,l=>l.stk.M)+" bags"],["New Mahavir stock",S(D.lots,l=>l.stk.N)+" bags"],...(isOwner?[["Patti not yet paid",f(S(D.patti.filter(x=>!x.paidMode),x=>x.net))]]:[])]);
 const L=[...D.bills].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.at||0)-(a.at||0)).slice(0,8);
 $("#dbl").innerHTML=L.length?`<table><tr><th>No.</th><th>Date</th><th>Customer</th><th>Total</th><th>Balance</th><th></th></tr>${L.map(b=>{const bal=b.total-paid(b);return`<tr><td>${bno(b)}</td><td class="l">${b.date}</td><td class="l">${esc(b.cust)}</td><td>${f(b.total)}</td><td class="${bal>0.5?"neg":""}">${f(bal)}</td><td><button class="sm" onclick="viewBill('${b.id}')">View</button></td></tr>`}).join("")}</table>`:`<div class="empty">No bills yet.</div>`;
}
function byStore(d){
 const P=allPays().filter(p=>p.d===d),mk=loc=>{
  const bs=D.bills.filter(b=>b.date===d&&(b.loc||"")===loc),ps=P.filter(p=>(p.b.loc||"")===loc),ex=R.expenses.filter(e=>e.date===d&&(e.loc||"")===loc);
  const ci=S(ps.filter(p=>p.m==="Cash"),p=>p.a),ui=S(ps.filter(p=>p.m==="UPI"),p=>p.a),cj=S(ps.filter(p=>p.m==="CJ"),p=>p.a),ce=S(ex.filter(e=>e.mode==="Cash"),e=>e.amt),ue=S(ex.filter(e=>e.mode==="UPI"),e=>e.amt),hm=S(bs,b=>b.ham||0);
  return{bills:bs.length,bags:S(bs,b=>b.bags),sales:S(bs,b=>b.total),ci,ui,cj,cr:S(bs,b=>b.total-paid(b)),ce,ue,hm,net:ci-ce,profit:S(bs,b=>b.profit)};
 };
 return[["Main store",mk("")],["New Mahavir",mk("NM")]];
}
function storeTbl(d,led){
 const r=byStore(d),T=k=>r[0][1][k]+r[1][1][k],sty=n=>n==="New Mahavir"?' style="font-weight:600"':"";
 const cols=led?[["Sales","sales"],["Cash in","ci"],["UPI in","ui"],["CJ in","cj"],["Cash exp.","ce"],["UPI exp.","ue"],["Net cash","net"]]:[["Bills","bills",1],["Bags","bags",1],["Sales","sales"],["Cash in","ci"],["UPI in","ui"],["CJ in","cj"],["Credit given","cr"]];
 if(isOwner)cols.push(["Profit","profit"]);
 const fv=(c,v)=>c[2]?v:f(v);
 return `<table><tr><th>Store</th>${cols.map(c=>`<th>${c[0]}</th>`).join("")}</tr>${r.map(([nm,x])=>`<tr><td${sty(nm)}>${nm}</td>${cols.map(c=>`<td${sty(nm)}>${fv(c,x[c[1]])}</td>`).join("")}</tr>`).join("")}<tr><th>Total</th>${cols.map(c=>`<th>${fv(c,T(c[1]))}</th>`).join("")}</tr></table>`;
}
$("#xfdt").value=today();$("#nmd").value=today();
$("#xfadd").onclick=async()=>{
 const l=D.lots.find(x=>x.id==$("#xfl").value),b=n($("#xfb").value),dir=$("#xfd").value;
 if(!l||b<=0){say("Choose a lot and enter the bags.");return}
 const av=dir==="out"?l.stk.M:l.stk.N;
 if(b>av&&!(await yn("Only "+av+" bags available at the "+(dir==="out"?"main store":"New Mahavir")+". Continue?")))return;
 W(()=>db.collection("xfer").add({lotId:l.id,lot:l.name,bags:b,dir,d:$("#xfdt").value||today(),note:$("#xfn").value.trim(),at:Date.now()})).then(ok=>{if(ok)["xfb","xfn"].forEach(i=>$("#"+i).value="")});
};
async function delXfer(id){if(await yn("Delete this transfer? The stock moves back."))W(()=>db.doc("xfer/"+id).delete())}
function renderNM(){
 const cur=$("#xfl").value;
 $("#xfl").innerHTML=D.lots.length?D.lots.map(l=>`<option value="${l.id}">${esc(l.name)} · Main ${l.stk.M} · New Mahavir ${l.stk.N}</option>`).join(""):`<option value="">Add a lot first</option>`;
 if(cur)$("#xfl").value=cur;
 $("#nms").innerHTML=D.lots.length?`<table><tr><th>Lot / quality</th><th>Received</th><th>Sold</th><th>Left</th></tr>${D.lots.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.recvN}</td><td>${l.soldN}</td><td class="${l.stk.N<0?"neg":""}"><b>${l.stk.N}</b></td></tr>`).join("")}<tr><th>Total</th><th>${S(D.lots,l=>l.recvN)}</th><th>${S(D.lots,l=>l.soldN)}</th><th>${S(D.lots,l=>l.stk.N)}</th></tr></table>`:`<div class="empty">No lots yet.</div>`;
 const d=$("#nmd").value||today(),bs=D.bills.filter(b=>b.date===d&&b.loc==="NM"),x=byStore(d)[1][1];
 $("#nmx").innerHTML=[["Bills",x.bills],["Bags sold",x.bags],["Sales",f(x.sales)],["Cash received",f(x.ci)],["UPI received",f(x.ui)],["CJ received",f(x.cj)],["Credit given",f(x.cr)],...(isOwner?[["Profit",f(x.profit)]]:[])].map(y=>`<div><span>${y[0]}</span><b>${y[1]}</b></div>`).join("");
 $("#nmb").innerHTML=bs.length?`<table><tr><th>No.</th><th>Customer</th><th>Lot</th><th>Bags</th><th>Total</th><th>Paid</th><th>Balance</th><th></th></tr>${bs.map(b=>{const pd=paid(b);return`<tr><td>${bno(b)}</td><td class="l">${esc(b.cust)}</td><td class="l">${esc(b.lot)}</td><td>${b.bags}</td><td>${f(b.total)}</td><td>${f(pd)}</td><td class="${b.total-pd>0.5?"neg":""}">${f(b.total-pd)}</td><td><button class="sm" onclick="viewBill('${b.id}')">View</button><button class="sm" onclick="printBill('${b.id}')">Print</button></td></tr>`}).join("")}</table>`:`<div class="empty">No New Mahavir bills on this date.</div>`;
 const t=[...R.xfer].sort((a,b)=>(b.d||"").localeCompare(a.d||"")||(b.at||0)-(a.at||0)).slice(0,30);
 $("#nmt").innerHTML=t.length?`<table><tr><th>Date</th><th>Lot</th><th>Bags</th><th>Direction</th><th>Note</th><th></th></tr>${t.map(x=>`<tr><td>${x.d||""}</td><td class="l">${esc(x.lot||"")}</td><td>${x.bags}</td><td class="l">${x.dir==="back"?"New Mahavir → Main":"Main → New Mahavir"}</td><td class="l">${esc(x.note||"")}</td><td>${isOwner?`<button class="sm del" onclick="delXfer('${x.id}')">Delete</button>`:""}</td></tr>`).join("")}</table>`:`<div class="empty">No transfers yet.</div>`;
}
$("#nmd").addEventListener("input",render);
function locBar(){const nm=LOC==="NM",b=$("#locbar");b.style.background=nm?"var(--acc)":"";b.style.color=nm?"var(--on)":"";$("#locmsg").textContent=nm?"Billing at New Mahavir":"Billing at Main store";$("#loc").value=LOC}
$("#loc").addEventListener("change",()=>{LOC=$("#loc").value;try{localStorage.setItem("loc",LOC)}catch(e){}$("#xs").value=LOC;render()});
function renderCJ(){
 const rc=allPays().filter(p=>p.m==="CJ"),got=S(rc,p=>p.a),set=S(R.cjset,x=>x.amt),t=today();
 if(!$("#cjdt").value)$("#cjdt").value=t;
 $("#cjf").hidden=$("#cjsave").hidden=!isOwner;
 $("#cjx").innerHTML=[["With CJ now",f(got-set)],["Received via CJ (all)",f(got)],["CJ paid you (all)",f(set)],["Received via CJ today",f(S(rc.filter(p=>p.d===t),p=>p.a))]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 const ss=[...R.cjset].sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.at||0)-(a.at||0));
 $("#cjs").innerHTML=ss.length?`<table><tr><th>Date</th><th>Amount</th><th>Received as</th><th>Note</th><th></th></tr>${ss.map(x=>`<tr><td class="l">${x.date}</td><td>${f(x.amt)}</td><td>${x.mode}</td><td class="l">${esc(x.note||"")}</td><td>${isOwner?`<button class="sm del" onclick="delCjs('${x.id}')">Delete</button>`:""}</td></tr>`).join("")}</table>`:`<div class="empty">No settlements yet.</div>`;
 const rs=[...rc].sort((a,b)=>b.d.localeCompare(a.d)).slice(0,40);
 $("#cjr").innerHTML=rs.length?`<table><tr><th>Date</th><th>Bill no.</th><th>Customer</th><th>Amount</th></tr>${rs.map(p=>`<tr><td class="l">${p.d}</td><td>${bno(p.b)}</td><td class="l">${esc(p.b.cust)}</td><td>${f(p.a)}</td></tr>`).join("")}</table>`:`<div class="empty">Nothing received through CJ yet. Choose "Paid via CJ" on a bill.</div>`;
}
$("#cjsave").onclick=()=>{const a=n($("#cja").value);if(a<=0){say("Enter the amount CJ gave you.");return}W(()=>db.collection("cjset").add({date:$("#cjdt").value||today(),amt:a,mode:$("#cjm").value,note:$("#cjn").value.trim(),at:Date.now()})).then(ok=>{if(ok)["cja","cjn"].forEach(i=>$("#"+i).value="")})};
async function delCjs(id){if(await yn("Delete this settlement?"))W(()=>db.doc("cjset/"+id).delete())}
const hamDay=d=>{const bs=D.bills.filter(b=>b.date===d&&(b.ham||0)>0);return{bs,bags:S(bs,b=>b.bags),amt:S(bs,b=>b.ham||0)}};
const hamPaid=d=>{const h=R.hpaid.find(x=>x.date===d);return h&&R.expenses.some(e=>e.id===h.expId)?h:null};
function renderHam(){
 const d=$("#hmd").value||today(),h=hamDay(d),hp=hamPaid(d);
 $("#hmx").innerHTML=[["Bills with hamali",h.bs.length],["Bags",h.bags],["Hamali to pay",f(h.amt)],["Status",hp?"Paid "+f(hp.amt)+" ("+hp.mode+")":"Not paid yet"]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 $("#hmpay").hidden=!!hp||!h.amt;$("#hmun").hidden=!hp;
 $("#hmb").innerHTML=h.bs.length?`<table><tr><th>Bill no.</th><th>Customer</th><th>Bags</th><th>₹ per bag</th><th>Hamali</th></tr>${h.bs.map(b=>`<tr><td>${bno(b)}</td><td class="l">${esc(b.cust)}</td><td>${b.bags}</td><td>${f(b.ham/b.bags)}</td><td>${f(b.ham)}</td></tr>`).join("")}<tr><th>Total</th><th></th><th>${h.bags}</th><th></th><th>${f(h.amt)}</th></tr></table>`:`<div class="empty">No hamali on this date.</div>`;
 const ds=[...new Set(D.bills.filter(b=>(b.ham||0)>0).map(b=>b.date))].sort().reverse().slice(0,14);
 $("#hmr").innerHTML=ds.length?`<table><tr><th>Date</th><th>Bags</th><th>Hamali</th><th>Paid</th></tr>${ds.map(x=>{const t=hamDay(x),q=hamPaid(x);return`<tr><td class="l">${x}</td><td>${t.bags}</td><td>${f(t.amt)}</td><td class="${q?"":"neg"}">${q?f(q.amt)+" ("+q.mode+")":"Not paid"}</td></tr>`}).join("")}<tr><th>Not paid yet</th><th></th><th>${f(S(ds.filter(x=>!hamPaid(x)),x=>hamDay(x).amt))}</th><th></th></tr></table>`:`<div class="empty">No hamali yet.</div>`;
}
$("#hmpay").onclick=async()=>{
 const d=$("#hmd").value||today(),h=hamDay(d);if(!h.amt){say("No hamali on this date.");return}
 const r=await dlg("Hamali payment",[{type:"msg",label:h.bags+" bags · hamali "+f(h.amt)},{label:"Amount paid (₹)",type:"number",value:h.amt},{label:"Paid by",type:"select",options:["Cash","UPI"]}],"Save");
 if(!r)return;const a=n(r[1]),m=r[2];if(a<=0)return;
 W(async()=>{const x=await db.collection("expenses").add({date:d,cat:"Hamali",note:"Hamali for "+h.bags+" bags",amt:a,mode:m,hm:true,at:Date.now()});await db.doc("hpaid/"+d).set({date:d,amt:a,mode:m,expId:x.id})});
};
$("#hmun").onclick=async()=>{const d=$("#hmd").value||today(),hp=hamPaid(d);if(!hp||!(await yn("Undo this hamali payment?")))return;W(async()=>{await db.doc("expenses/"+hp.expId).delete();await db.doc("hpaid/"+d).delete()})};
$("#hmd").addEventListener("input",render);
function renderStock(){
 const got={},sold={},kgs={};
 R.stockin.forEach(x=>got[x.lotId]=(got[x.lotId]||0)+x.bags);
 D.bills.forEach(b=>b.items.forEach(i=>{sold[i.lotId]=(sold[i.lotId]||0)+i.bags;kgs[i.lotId]=(kgs[i.lotId]||0)+i.kg}));
 const L=D.lots.map(l=>({...l,added:got[l.id]||0,sold:sold[l.id]||0,kg:kgs[l.id]||0}));
 $("#sts").innerHTML=[["Lots",L.length],["Bags added",S(L,l=>l.added)],["Bags sold",S(L,l=>l.sold)],["Main store left",S(L,l=>l.stk.M)],["New Mahavir left",S(L,l=>l.stk.N)],["Total left",S(L,l=>l.bags)]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 $("#stt").innerHTML=L.length?`<table><tr><th>Lot / quality</th><th>Added</th><th>Sold</th><th>Main store</th><th>New Mahavir</th><th>Total left</th><th>Sent to NM</th><th>Kg sold</th>${isOwner?"<th>Cost/kg</th>":""}<th></th></tr>${L.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.added}</td><td>${l.sold}</td><td class="${l.stk.M<0?"neg":""}">${l.stk.M}</td><td class="${l.stk.N<0?"neg":""}">${l.stk.N}</td><td class="${l.bags<=0?"neg":""}"><b>${l.bags}</b></td><td>${l.recvN}</td><td>${r2(l.kg)}</td>${isOwner?`<td>${f(l.cost)}</td>`:""}<td><button class="sm" onclick="addBags('${l.id}')">+ Bags</button><button class="sm" onclick="moveNM('${l.id}')">Move to New Mahavir</button></td></tr>`).join("")}</table>`:`<div class="empty">${ready?"No lots yet. Add one in the Add lots tab.":"Loading…"}</div>`;
 const nm={};R.lots.forEach(l=>nm[l.id]=l.name);
 const h=[...R.stockin].sort((a,b)=>(b.d||"").localeCompare(a.d||"")).slice(0,30);
 $("#sth").innerHTML=h.length?`<table><tr><th>Date</th><th>Lot / quality</th><th>Bags added</th></tr>${h.map(x=>`<tr><td>${x.d||""}</td><td class="l">${esc(nm[x.lotId]||"(deleted lot)")}</td><td>${x.bags}</td></tr>`).join("")}</table>`:`<div class="empty">No stock entries yet.</div>`;
}
function renderExp(){
 const d=$("#xd").value||today(),ex=R.expenses.filter(e=>e.date===d).sort((a,b)=>(a.at||0)-(b.at||0));
 $("#xl").innerHTML=ex.length?`<table><tr><th>Category</th><th>Note</th><th>Paid by</th><th>Amount</th><th></th></tr>${ex.map(e=>`<tr><td>${esc(e.cat)}${locT(e)}</td><td class="l">${esc(e.note||"")}</td><td>${e.mode}</td><td>${f(e.amt)}</td><td><button class="sm del" onclick="delExp('${e.id}')">Delete</button></td></tr>`).join("")}<tr><th>Total</th><th></th><th>Cash ${f(S(ex.filter(e=>e.mode==="Cash"),e=>e.amt))} · UPI ${f(S(ex.filter(e=>e.mode==="UPI"),e=>e.amt))}</th><th>${f(S(ex,e=>e.amt))}</th><th></th></tr></table>`:`<div class="empty">No expenses on this date.</div>`;
}
const nextPNo=d=>R.patti.filter(x=>(x.fy||fyOf(x.date))===fyOf(d)).reduce((m,x)=>Math.max(m,x.no),0)+1;
function pcalc(){
 const bags=n($("#pb").value),kg=n($("#pk").value),rate=n($("#pp").value),amount=kg*rate;
 const cdOn=$("#pcdOn").checked,labOn=$("#plbOn").checked,brOn=$("#pbrOn").checked,trOn=$("#ptrOn").checked;
 const cdPct=n($("#pcdP").value),labRate=n($("#plb").value),brRate=n($("#pbr").value);
 const cd=cdOn?amount*cdPct/100:0,labor=labOn?bags*labRate:0,broker=brOn?bags*brRate:0,trans=trOn?n($("#ptr").value):0;
 return{bags,kg,rate,amount,cdOn,cdPct,cd,labOn,labRate,labor,brOn,brRate,broker,trOn,trans,net:amount-cd-labor+broker-trans};
}
function ppreview(){
 const c=pcalc(),d=$("#pd").value||today();
 $("#pnb").textContent="Patti no. "+p2(nextPNo(d))+"  ·  period "+fyOf(d);
 $("#ppv").innerHTML=[["Amount (kg × price)",f(c.amount)],c.cdOn?["CD "+c.cdPct+"% (−)",f(c.cd)]:null,c.labOn?["Labour (−)",f(c.labor)+(c.bags?"":" – enter bags")]:null,c.brOn?["Brokerage (+)",f(c.broker)+(c.bags?"":" – enter bags")]:null,c.trOn?["Transportation (−)",f(c.trans)]:null,["Net payable",f(c.net)]]
 .filter(Boolean).map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
}
[["pcdOn","pcdP"],["plbOn","plb"],["pbrOn","pbr"],["ptrOn","ptr"]].forEach(([c,i])=>$("#"+c).addEventListener("change",()=>{$("#"+i).disabled=!$("#"+c).checked;ppreview()}));
["pd","pb","pk","pp","pcdP","plb","pbr","ptr"].forEach(id=>$("#"+id).addEventListener("input",ppreview));
$("#pw").addEventListener("input",()=>{
 const w=wparse("#pw");
 if(w.cnt){$("#pk").value=w.tot;$("#pb").value=w.cnt}
 $("#pwi").textContent=w.cnt?w.cnt+" bags · total "+w.tot+" kg":"";
 ppreview();
});
function pattiHtml(p){
 const row=(l,v)=>v?`${l}: ${v}<br>`:"";
 return `<h2 style="margin:0">${esc(D.firm)}</h2><p><b>PATTI BILL (Purchase)</b><br>Patti no. ${p2(p.no)} &nbsp; Period: ${p.fy||fyOf(p.date)} &nbsp; Date: ${p.date}<br>Seller: <b>${esc(p.party)}</b></p>
 <table><tr><th class="l">Item</th><th>Bags</th><th>Weight (kg)</th><th>Price/kg</th><th>Amount</th></tr>
 <tr><td>${esc(p.lot||"Peanuts")}</td><td>${p.bags}</td><td>${p.kg}</td><td>${f(p.rate)}</td><td>${f(p.amount)}</td></tr></table>
 ${p.wts?`<p style="font-size:12px">Bag weights (kg): ${esc(p.wts)}</p>`:""}
 <p style="text-align:right">Amount: ${f(p.amount)}<br>${row("CD "+p.cdPct+"% (−)",p.cd?f(p.cd):"")}${row("Labour ₹"+p.labRate+" × "+p.bags+" bags (−)",p.labor?f(p.labor):"")}${row("Brokerage ₹"+p.brRate+" × "+p.bags+" bags ("+(p.brSign===-1?"−":"+")+")",p.broker?f(p.broker):"")}${row("Transportation (−)",p.transport?f(p.transport):"")}<b>Net payable: ${f(p.net)}</b></p>`;
}
async function savePatti(view){
 const c=pcalc(),party=$("#pn").value.trim(),m=$("#pmsg");
 if(!party||c.bags<=0||c.kg<=0||c.rate<=0){m.textContent="Enter seller name, bags, weight and price.";return}
 const d=$("#pd").value||today(),no=nextPNo(d);
 const doc={no,fy:fyOf(d),date:d,party,lot:$("#pq").value.trim(),wts:$("#pw").value.trim().replace(/\s+/g," "),bags:c.bags,kg:r2(c.kg),rate:c.rate,amount:c.amount,
  cdPct:c.cdOn?c.cdPct:0,cd:c.cd,labRate:c.labOn?c.labRate:0,labor:c.labor,brRate:c.brOn?c.brRate:0,broker:c.broker,transport:c.trans,brSign:1,net:c.net,paidMode:$("#ppm").value,paidDate:$("#ppm").value?d:"",at:Date.now()};
 let id=null;
 const ok=await W(async()=>{const r=await db.collection("patti").add(doc);id=r.id});
 if(!ok)return;
 m.textContent="Saved patti no. "+p2(no);
 ["pn","pq","pb","pw","pk","pp","ptr","ppm"].forEach(i=>$("#"+i).value="");$("#pwi").textContent="";ppreview();
 if(view)showHtml(pattiHtml({...doc,id}));
}
$("#psave").onclick=()=>savePatti(false);
$("#psavev").onclick=()=>savePatti(true);
const getP=id=>D.patti.find(x=>x.id==id);
function viewPatti(id){showHtml(pattiHtml(getP(id)))}
function printPatti(id){doPrint(pattiHtml(getP(id)),"A5")}
async function markPaid(id){const p=getP(id),r=await dlg("Mark patti paid",[{type:"msg",label:"Patti no. "+p2(p.no)+" · "+esc(p.party)+" · net payable "+f(p.net)},{label:"Paid by",type:"select",options:["Cash","UPI"]}],"Mark paid");if(r)W(()=>db.doc("patti/"+id).update({paidMode:r[1],paidDate:today()}))}
async function delPatti(id){if(await yn("Delete this patti bill?"))W(()=>db.doc("patti/"+id).delete())}
function renderPatti(){
 $("#pql").innerHTML=D.lots.map(l=>`<option value="${esc(l.name)}">`).join("");
 const d=$("#pld").value,ps=D.patti.filter(x=>x.date===d);
 $("#pls").innerHTML=ps.length?`<table><tr><th>No.</th><th>Seller</th><th>Lot</th><th>Bags</th><th>Kg</th><th>Amount</th><th>Net payable</th><th>Paid</th><th></th></tr>${ps.map(x=>`<tr><td>${p2(x.no)}</td><td class="l">${esc(x.party)}</td><td class="l">${esc(x.lot||"")}</td><td>${x.bags}</td><td>${x.kg}</td><td>${f(x.amount)}</td><td>${f(x.net)}</td><td>${x.paidMode||"<span class=neg>Not paid</span>"}</td><td>${x.paidMode?"":`<button class="sm" onclick="markPaid('${x.id}')">Mark paid</button>`}<button class="sm" onclick="viewPatti('${x.id}')">View</button><button class="sm" onclick="printPatti('${x.id}')">Print</button><button class="sm del" onclick="delPatti('${x.id}')">Delete</button></td></tr>`).join("")}<tr><th>Total</th><th></th><th></th><th>${S(ps,x=>x.bags)}</th><th>${r2(S(ps,x=>x.kg))}</th><th>${f(S(ps,x=>x.amount))}</th><th>${f(S(ps,x=>x.net))}</th><th></th><th></th></tr></table>`:`<div class="empty">No patti bills on this date.</div>`;
}
$("#pld").addEventListener("input",render);
const STATES={"01":"Jammu and Kashmir","02":"Himachal Pradesh","03":"Punjab","04":"Chandigarh","05":"Uttarakhand","06":"Haryana","07":"Delhi","08":"Rajasthan","09":"Uttar Pradesh","10":"Bihar","11":"Sikkim","12":"Arunachal Pradesh","13":"Nagaland","14":"Manipur","15":"Mizoram","16":"Tripura","17":"Meghalaya","18":"Assam","19":"West Bengal","20":"Jharkhand","21":"Odisha","22":"Chhattisgarh","23":"Madhya Pradesh","24":"Gujarat","26":"Dadra and Nagar Haveli and Daman and Diu","27":"Maharashtra","28":"Andhra Pradesh","29":"Karnataka","30":"Goa","31":"Lakshadweep","32":"Kerala","33":"Tamil Nadu","34":"Puducherry","35":"Andaman and Nicobar Islands","36":"Telangana","37":"Andhra Pradesh","38":"Ladakh"};
const GDEF={name:"Mahavir Enterprises",addr:"Shop No.57/2, Surevey No.-127/1\nMalakpet, Hyderabad - 500036",fssai:"13626015000129",gstin:"36ACHFM4466F1Z2",state:"Telangana",code:"36",email:"mahavirent.hyd@gmail.com",bh:"",bn:"",ba:"",bi:"",decl:"We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."};
const GP=()=>({...GDEF,...(R.meta.gstProfile||{})});
const n2=v=>Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
function words(x){
 const o=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],t=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
 const two=v=>v<20?o[v]:t[Math.floor(v/10)]+(v%10?" "+o[v%10]:"");
 const three=v=>(v>=100?o[Math.floor(v/100)]+" Hundred"+(v%100?" ":""):"")+(v%100?two(v%100):"");
 const w=v=>{if(v===0)return"Zero";let q="";const cr=Math.floor(v/1e7),la=Math.floor(v%1e7/1e5),th=Math.floor(v%1e5/1e3),re=v%1e3;
  if(cr)q+=w(cr)+" Crore ";if(la)q+=two(la)+" Lakh ";if(th)q+=two(th)+" Thousand ";if(re)q+=three(re);return q.trim()};
 const rs=Math.floor(x+1e-9),ps=Math.round((x-rs)*100);
 return"INR "+w(rs)+(ps?" and "+two(ps)+" Paise":"")+" Only";
}
const nextG=d=>{const fy=fyOf(d),st=n((R.meta.gstStart||{})[fy])||1;return Math.max(st-1,D.bills.filter(b=>b.kind==="gst"&&b.fy===fy).reduce((m,b)=>Math.max(m,b.no),0))+1};
function gtax(items,pct,intra){
 const half=pct/2,g={};
 items.forEach(i=>g[i.hsn||""]=(g[i.hsn||""]||0)+i.amount);
 const rows=Object.entries(g).map(([hsn,tv])=>({hsn,tv:r2(tv),cg:intra?r2(tv*half/100):0,sg:intra?r2(tv*half/100):0,ig:intra?0:r2(tv*pct/100)}));
 return{rows,cgst:r2(S(rows,x=>x.cg)),sgst:r2(S(rows,x=>x.sg)),igst:r2(S(rows,x=>x.ig))};
}
let gcart=[],gcr=false;
const gcustBy=id=>D.gcust.find(c=>c.id==id);
function gcur(){
 const lot=D.lots.find(l=>l.id==$("#gl").value),bags=n($("#gb").value),kg=n($("#gk").value);
 let amount=n($("#ga").value),rate=n($("#gp").value);
 if(amount>0)rate=kg?amount/kg:0;else amount=kg*rate;
 return lot&&bags>0&&kg>0&&amount>0?{lotId:lot.id,lot:lot.name,desc:$("#gds").value.trim()||"Ground Nuts",hsn:$("#ghs").value.trim(),bags,kg,rate:r2(rate),wts:$("#gw").value.trim().replace(/\s+/g," "),amount:r2(amount)}:null;
}
function gcalc(){
 const cur=gcur(),items=gcart.concat(cur?[cur]:[]),by=gcustBy($("#gcu").value),pr=GP(),intra=!by||String(by.code)===String(pr.code),pct=n($("#grt").value);
 const tx=gtax(items,pct,intra),taxable=r2(S(items,i=>i.amount)),sub=taxable+tx.cgst+tx.sgst+tx.igst,total=Math.round(sub),ro=r2(total-sub);
 const cash=gcr?0:n($("#gcash").value),upi=gcr?0:n($("#gupi").value),cj=gcr?0:n($("#gcj").value);
 const profit=S(items,i=>{const l=D.lots.find(x=>x.id==i.lotId);return i.amount-i.kg*(l?l.cost:0)});
 return{items,by,intra,pct,tx,taxable,total,ro,cash,upi,cj,bal:total-cash-upi-cj,bags:S(items,i=>i.bags),kg:S(items,i=>i.kg),profit};
}
function gpreview(){
 const c=gcalc(),d=$("#gd").value||today();
 $("#gnb").textContent="Invoice no. "+nextG(d)+"  ·  period "+fyOf(d);
 $("#gpv").innerHTML=[["Taxable value",f(c.taxable)],c.intra?["CGST "+c.pct/2+"%",f(c.tx.cgst)]:null,c.intra?["SGST "+c.pct/2+"%",f(c.tx.sgst)]:null,c.intra?null:["IGST "+c.pct+"%",f(c.tx.igst)],["Round off",f(c.ro)],["Total",f(c.total)],["Balance",f(c.bal)],isOwner?["Profit on this invoice",f(c.profit)]:null].filter(Boolean).map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
}
function gfill(){
 const opts=`<option value="">Select customer</option>`+D.gcust.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");
 ["gcu","gco"].forEach(id=>{const e=$("#"+id),v=e.value;e.innerHTML=opts;if(v)e.value=v});
 const l=$("#gl"),v=l.value;l.innerHTML=D.lots.length?D.lots.map(x=>`<option value="${x.id}">${esc(x.name)} (${lb(x)} bags left${LOC?" at New Mahavir":""})</option>`).join(""):`<option value="">Add a lot first</option>`;if(v)l.value=v;
}
function gdraw(){
 $("#gcart").innerHTML=gcart.length?`<table><tr><th>Description</th><th>Bags</th><th>Kg</th><th>Rate</th><th>Amount</th><th></th></tr>${gcart.map((i,x)=>`<tr><td>${esc(i.desc)} <span class="empty">(${esc(i.lot)})</span></td><td>${i.bags}</td><td>${i.kg}</td><td>${f(i.rate)}</td><td>${f(i.amount)}</td><td><button class="sm del" type="button" onclick="grm(${x})">Remove</button></td></tr>`).join("")}</table>`:`<div class="empty">No lot added yet. Fill in a lot below and tap the add button, or just save if the invoice has one lot.</div>`;
}
function grm(i){gcart.splice(i,1);gdraw();gpreview()}
$("#gadd").onclick=()=>{
 const it=gcur();if(!it){$("#gmsg").textContent="Pick a lot and enter bags, weight and rate (or amount) first.";return}
 gcart.push(it);["gb","gk","gw","gp","ga"].forEach(i=>$("#"+i).value="");$("#gwi").textContent="";$("#gmsg").textContent="";gdraw();gpreview();
};
$("#gw").addEventListener("input",()=>{const w=wparse("#gw");if(w.cnt){$("#gk").value=w.tot;$("#gb").value=w.cnt}$("#gwi").textContent=w.cnt?w.cnt+" bags · total "+w.tot+" kg":"";gpreview()});
["gd","gcu","gco","gb","gk","gp","ga","gl","grt","gcash","gupi","gcj"].forEach(id=>$("#"+id).addEventListener("input",gpreview));
$("#gsame").addEventListener("change",()=>{$("#gcow").hidden=$("#gsame").checked});
$("#gcredit").onclick=()=>{gcr=!gcr;const b=$("#gcredit");b.classList.toggle("on",gcr);b.setAttribute("aria-pressed",gcr);["gcash","gupi","gcj"].forEach(i=>{$("#"+i).disabled=gcr;if(gcr)$("#"+i).value=""});gpreview()};
async function gsaveBill(mode){
 const c=gcalc(),m=$("#gmsg"),by=c.by,cn=$("#gsame").checked?by:gcustBy($("#gco").value);
 if(!by){m.textContent="Select the buyer. Add customers in the GST customers tab.";return}
 if(!cn){m.textContent="Select the consignee.";return}
 if(!c.items.length){m.textContent="Add at least one lot with bags, weight and rate.";return}
 const need={};c.items.forEach(i=>need[i.lotId]=(need[i.lotId]||0)+i.bags);
 for(const id in need){const l=D.lots.find(x=>x.id==id);if(l&&need[id]>lb(l)&&!(await yn("Only "+lb(l)+" bags of "+l.name+" in stock at "+(LOC?"New Mahavir":"the main store")+". Continue?")))return}
 const d=$("#gd").value||today(),no=nextG(d),pays=[],pk=o=>({name:o.name,gstin:o.gstin||"",address:o.address||"",state:o.state||"",code:o.code||""}),v=id=>$("#"+id).value.trim();
 if(c.cash>0)pays.push({d,m:"Cash",a:c.cash});if(c.upi>0)pays.push({d,m:"UPI",a:c.upi});if(c.cj>0)pays.push({d,m:"CJ",a:c.cj});
 const bill={...(LOC?{loc:LOC}:{}),kind:"gst",no,fy:fyOf(d),date:d,cust:by.name,custId:by.id,buyer:pk(by),consignee:pk(cn),seller:GP(),
  hdr:{ewb:v("gew"),veh:v("gve"),through:v("gth"),dest:v("gde"),dn:v("gdn"),mp:v("gmp"),rf:v("grf"),or:v("gor"),bo:v("gbo"),bd:v("gbd"),dd:v("gdd"),dt:v("gdt"),lr:v("glr"),td:v("gtd")},
  items:c.items,lot:[...new Set(c.items.map(i=>i.lot))].join(" + "),bags:c.bags,kg:r2(c.kg),rate:r2(c.taxable/c.kg),ham:0,g:c.pct,gst:r2(c.tx.cgst+c.tx.sgst+c.tx.igst),
  tax:{intra:c.intra,pct:c.pct,cgst:c.tx.cgst,sgst:c.tx.sgst,igst:c.tx.igst,ro:c.ro},amount:c.taxable,total:c.total,at:Date.now()};
 let id=null;
 const ok=await W(async()=>{const r=await db.collection("bills").add(bill);id=r.id;for(const p of pays)await db.collection("pays").add({billId:id,...p})});
 if(!ok)return;
 m.textContent="Saved GST invoice "+no+(c.bal>0.5?" (balance "+f(c.bal)+")":"");
 gcart=[];["gb","gk","gw","gp","ga","gcash","gupi","gcj","gew","gve","gde"].forEach(i=>$("#"+i).value="");$("#gwi").textContent="";
 if(gcr)$("#gcredit").click();gdraw();gpreview();
 if(mode==="view")viewObj({...bill,id,pays});else if(mode==="print")printObj({...bill,id,pays});
}
$("#gsave").onclick=()=>gsaveBill();$("#gsavev").onclick=()=>gsaveBill("view");$("#gsavep").onclick=()=>gsaveBill("print");

function gstHtml(b){
 const s=b.seller||GP(),h=b.hdr||{},by=b.buyer,cn=b.consignee||by,tx=b.tax,it=b.items,half=tx.pct/2;
 const a=v=>esc(v||"").replace(/\n/g,"<br>"),MO=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 const dt=d=>{if(!d)return"";const q=d.split("-");return q.length===3?+q[2]+"-"+MO[+q[1]-1]+"-"+q[0].slice(2):d};
 const party=(t,o)=>`<div class="bt">${t}<br><b>${esc(o.name)}</b><br>${a(o.address)}<br>GSTIN/UIN : ${esc(o.gstin)}<br>State Name : ${esc(o.state)}, Code : ${esc(o.code)}</div>`;
 const c3=(l,v)=>`<td colspan="2">${l}<br><b>${a(v)}</b></td>`,c2=(l,v)=>`<td colspan="3">${l}<br><b>${a(v)}</b></td>`;
 const hs=gtax(it,tx.pct,tx.intra),tt=r2(tx.cgst+tx.sgst+tx.igst);
 const trow=(l,r,v)=>`<tr><td></td><td class="r b"><i>${l}</i></td><td></td><td></td><td class="r"><i>${r}</i></td><td>${r?"%":""}</td><td class="r b">${v}</td></tr>`;
 return `<div class="gi"><div style="text-align:center;font-size:16px;font-weight:700;margin-bottom:6px">Tax Invoice</div>
<table><tr><td class="np" style="width:50%"><div><b style="font-size:13px">${esc(s.name)}</b><br>${a(s.addr)}<br>FSSAI No. : ${esc(s.fssai)}<br>GSTIN/UIN: ${esc(s.gstin)}<br>State Name : ${esc(s.state)}, Code : ${esc(s.code)}<br>E-Mail : ${esc(s.email)}</div>${party("Consignee (Ship to)",cn)}${party("Buyer (Bill to)",by)}</td>
<td class="np"><table><tr>${c3("Invoice No.",b.no)}${c3("e-Way Bill No.",h.ewb)}${c3("Dated",dt(b.date))}</tr>
<tr>${c2("Delivery Note",h.dn)}${c2("Mode/Terms of Payment",h.mp)}</tr><tr>${c2("Reference No. &amp; Date.",h.rf)}${c2("Other References",h.or)}</tr>
<tr>${c2("Buyer's Order No.",h.bo)}${c2("Dated",dt(h.bd))}</tr><tr>${c2("Dispatch Doc No.",h.dd)}${c2("Delivery Note Date",dt(h.dt))}</tr>
<tr>${c2("Dispatched through",h.through)}${c2("Destination",h.dest)}</tr><tr>${c2("Bill of Lading/LR-RR No.",h.lr)}${c2("Motor Vehicle No.",h.veh)}</tr>
<tr><td colspan="6" style="height:60px">Terms of Delivery<br><b>${a(h.td)}</b></td></tr></table></td></tr></table>
<table><tr><th style="width:4%">SI No.</th><th>Description of Goods</th><th style="width:13%">HSN/SAC</th><th class="r" style="width:15%">Quantity</th><th class="r" style="width:11%">Rate</th><th style="width:6%">per</th><th class="r" style="width:16%">Amount</th></tr>
${it.map((x,i)=>`<tr><td class="r">${i+1}</td><td><b>${esc(x.desc||x.lot)}</b></td><td>${esc(x.hsn||"")}</td><td class="r"><b>${n2(x.kg)} kgs</b><br><i>(${x.bags} Bag)</i></td><td class="r">${n2(x.rate)}</td><td>kgs</td><td class="r b">${n2(x.amount)}</td></tr>`).join("")}
${tx.intra?trow("CGST",n2(half),n2(tx.cgst))+trow("SGST",n2(half),n2(tx.sgst)):trow("IGST",n2(tx.pct),n2(tx.igst))}
${tx.ro?trow("Round Off","",(tx.ro<0?"(-)":"")+n2(Math.abs(tx.ro))):""}
<tr style="height:40px"><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td></td><td class="r">Total</td><td></td><td class="r b">${n2(S(it,x=>x.kg))} kgs</td><td></td><td></td><td class="r b" style="font-size:14px">₹ ${n2(b.total)}</td></tr></table>
<table><tr><td style="border-top:0">Amount Chargeable (in words)<span style="float:right"><i>E. &amp; O.E</i></span><br><b style="font-size:13px">${words(b.total)}</b></td></tr></table>
<table><tr><th rowspan="2">HSN/SAC</th><th class="r" rowspan="2">Taxable Value</th>${tx.intra?`<th colspan="2" class="r">CGST</th><th colspan="2" class="r">SGST/UTGST</th>`:`<th colspan="2" class="r">IGST</th>`}<th class="r" rowspan="2">Total Tax Amount</th></tr>
<tr>${tx.intra?`<th class="r">Rate</th><th class="r">Amount</th><th class="r">Rate</th><th class="r">Amount</th>`:`<th class="r">Rate</th><th class="r">Amount</th>`}</tr>
${hs.rows.map(x=>`<tr><td>${esc(x.hsn)}</td><td class="r">${n2(x.tv)}</td>${tx.intra?`<td class="r">${n2(half)}%</td><td class="r">${n2(x.cg)}</td><td class="r">${n2(half)}%</td><td class="r">${n2(x.sg)}</td>`:`<td class="r">${n2(tx.pct)}%</td><td class="r">${n2(x.ig)}</td>`}<td class="r">${n2(x.cg+x.sg+x.ig)}</td></tr>`).join("")}
<tr><td class="r b">Total</td><td class="r b">${n2(b.amount)}</td>${tx.intra?`<td></td><td class="r b">${n2(tx.cgst)}</td><td></td><td class="r b">${n2(tx.sgst)}</td>`:`<td></td><td class="r b">${n2(tx.igst)}</td>`}<td class="r b">${n2(tt)}</td></tr></table>
<table><tr><td style="border-top:0">Tax Amount (in words) : <b>${words(tt)}</b></td></tr></table>
<table><tr><td style="width:50%;height:80px;vertical-align:bottom"><u>Declaration</u><br>${a(s.decl)}</td><td>Company's Bank Details<br>A/c Holder's Name : ${esc(s.bh)}<br>Bank Name : ${esc(s.bn)}<br>A/c No. : ${esc(s.ba)}<br>Branch &amp; IFS Code : ${esc(s.bi)}<div class="r b" style="margin-top:8px">for ${esc(s.name)}</div><div class="r" style="margin-top:18px">Authorised Signatory</div></td></tr></table>
<div style="text-align:center;margin-top:6px">This is a Computer Generated Invoice</div></div>`;
}

let editCust=null;
$("#cg").addEventListener("input",()=>{const g=$("#cg").value.toUpperCase();$("#cg").value=g;const c=g.slice(0,2);if(STATES[c]){$("#cc").value=c;$("#cs").value=STATES[c]}});
function clrCust(){editCust=null;["cn","cg","cs","cc","cp","ca"].forEach(i=>$("#"+i).value="");$("#cmsg").textContent=""}
$("#cclr").onclick=clrCust;
$("#csave").onclick=async()=>{
 const o={name:$("#cn").value.trim(),gstin:$("#cg").value.trim().toUpperCase(),state:$("#cs").value.trim(),code:$("#cc").value.trim(),phone:$("#cp").value.trim(),address:$("#ca").value.trim()};
 if(!o.name){$("#cmsg").textContent="Enter the customer name.";return}
 if(o.gstin&&o.gstin.length!==15&&!(await yn("GSTIN should be 15 characters. Save anyway?")))return;
 W(()=>editCust?db.doc("gstcust/"+editCust).set({...gcustBy(editCust),id:undefined,...o}):db.collection("gstcust").add({...o,at:Date.now()})).then(ok=>{if(ok){clrCust();$("#cmsg").textContent="Saved"}});
};
function editC(id){const c=gcustBy(id);editCust=id;$("#cn").value=c.name;$("#cg").value=c.gstin||"";$("#cs").value=c.state||"";$("#cc").value=c.code||"";$("#cp").value=c.phone||"";$("#ca").value=c.address||"";$("#cmsg").textContent="Editing – tap Save customer to update";window.scrollTo(0,0)}
async function delC(id){if(await yn("Delete this customer? Their invoices stay."))W(()=>db.doc("gstcust/"+id).delete())}
const cInv=c=>D.bills.filter(b=>b.kind==="gst"&&(b.custId===c.id||(!b.custId&&key(b.cust)===key(c.name))));
function custInv(id){
 const c=gcustBy(id),bs=cInv(c);
 showHtml(`<h2 style="margin:0">${esc(c.name)}</h2><p>GSTIN ${esc(c.gstin||"-")} · ${esc(c.state||"")}<br>${esc(c.address||"").replace(/\n/g,"<br>")}</p>${bs.length?`<table><tr><th class="l">Invoice</th><th>Date</th><th>Total</th><th>Balance</th><th></th></tr>${bs.map(b=>`<tr><td>${b.no}</td><td>${b.date}</td><td>${f(b.total)}</td><td>${f(b.total-paid(b))}</td><td><button class="sm" onclick="viewBill('${b.id}')">View</button></td></tr>`).join("")}</table>`:"<p>No GST invoices yet.</p>"}`);
}
function renderGcust(){
 $("#clist").innerHTML=D.gcust.length?`<table><tr><th>Customer</th><th>GSTIN</th><th>State</th><th>Invoices</th><th>Billed</th><th>Balance</th><th></th></tr>${D.gcust.map(c=>{const bs=cInv(c),bl=S(bs,b=>b.total-paid(b));return`<tr><td class="l">${esc(c.name)}</td><td class="l">${esc(c.gstin||"")}</td><td class="l">${esc(c.state||"")}</td><td>${bs.length}</td><td>${f(S(bs,b=>b.total))}</td><td class="${bl>0.5?"neg":""}">${f(bl)}</td><td><button class="sm" onclick="custInv('${c.id}')">Invoices</button><button class="sm" onclick="editC('${c.id}')">Edit</button><button class="sm del" onclick="delC('${c.id}')">Delete</button></td></tr>`}).join("")}</table>`:`<div class="empty">No GST customers yet. Add the first one above.</div>`;
 if(isOwner&&!$("#fn").dataset.f){const q=GP();$("#fn").dataset.f=1;$("#fn").value=q.name;$("#fg").value=q.gstin;$("#ff").value=q.fssai;$("#fe").value=q.email;$("#fs").value=q.state;$("#fc").value=q.code;$("#fa").value=q.addr;$("#fbh").value=q.bh;$("#fbn").value=q.bn;$("#fba").value=q.ba;$("#fbi").value=q.bi;$("#fdc").value=q.decl;$("#fnx").value=(R.meta.gstStart||{})[fyOf(today())]||""}
}
$("#fsave").onclick=()=>{
 const v=id=>$("#"+id).value.trim(),fy=fyOf(today()),gs={...(R.meta.gstStart||{})};
 if(n(v("fnx"))>0)gs[fy]=Math.round(n(v("fnx")));
 W(()=>setMeta(D.firm,D.hamali,{gstProfile:{name:v("fn"),gstin:v("fg"),fssai:v("ff"),email:v("fe"),state:v("fs"),code:v("fc"),addr:$("#fa").value.trim(),bh:v("fbh"),bn:v("fbn"),ba:v("fba"),bi:v("fbi"),decl:$("#fdc").value.trim()},gstStart:gs})).then(ok=>{if(ok)$("#fmsg").textContent="Saved"});
};
function renderLedger(){
 const d=$("#ld").value||today(),bs=D.bills.filter(b=>b.date===d),pays=allPays().filter(p=>p.d===d),ex=R.expenses.filter(e=>e.date===d);
 const c0=cashBal("Cash",d),u0=cashBal("UPI",d),ci=S(pays.filter(p=>p.m==="Cash"),p=>p.a),ui=S(pays.filter(p=>p.m==="UPI"),p=>p.a),cj=S(pays.filter(p=>p.m==="CJ"),p=>p.a),sc=S(R.cjset.filter(x=>x.date===d&&x.mode==="Cash"),x=>x.amt),su=S(R.cjset.filter(x=>x.date===d&&x.mode==="UPI"),x=>x.amt),j0=cjBal(d);
 const co=S(ex.filter(e=>e.mode==="Cash"),e=>e.amt),uo=S(ex.filter(e=>e.mode==="UPI"),e=>e.amt),pr=S(bs,b=>b.profit);
 const hx=S(ex.filter(e=>e.hm),e=>e.amt),pp=R.patti.filter(x=>x.paidMode&&x.paidDate===d),pc=S(pp.filter(x=>x.paidMode==="Cash"),x=>x.net),pu=S(pp.filter(x=>x.paidMode==="UPI"),x=>x.net);
 const bx=a=>`<div class="sum">${a.map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("")}</div>`;
 const cl=R.closing.find(x=>x.date===d),bkC=c0+ci+sc-co-pc,bkB=u0+ui+su-uo-pu;
 $("#clinfo").innerHTML=[["Cash closing (book)",f(bkC)],["Bank / UPI closing (book)",f(bkB)],...(cl&&cl.cash!==undefined?[["Cash counted",f(cl.cash)],["Difference",f(cl.cash-bkC)]]:[]),...(cl&&cl.bank!==undefined?[["Bank counted",f(cl.bank)],["Bank difference",f(cl.bank-bkB)]]:[])].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 $("#clin").hidden=$("#clsave").hidden=$("#clrm").hidden=!isOwner;
 if($("#ld").dataset.cd!==d+"|"+(cl?1:0)){$("#ld").dataset.cd=d+"|"+(cl?1:0);$("#clc").value=cl&&cl.cash!==undefined?cl.cash:"";$("#clb").value=cl&&cl.bank!==undefined?cl.bank:""}
 $("#lgc").innerHTML=`<div class="card"><h2>Cash in hand</h2>${bx([["Opening",f(c0)],["Cash received",f(ci)],["From CJ (settled)",f(sc)],["Cash expenses",f(co)],...(isOwner?[["Patti paid (cash)",f(pc)]]:[]),["Closing",f(c0+ci+sc-co-pc)]])}
 <h2>Bank / UPI</h2>${bx([["Opening",f(u0)],["UPI received",f(ui)],["From CJ (settled)",f(su)],["UPI expenses",f(uo)],...(isOwner?[["Patti paid (UPI)",f(pu)]]:[]),["Closing",f(u0+ui+su-uo-pu)]])}
 <h2>CJ (money held by CJ)</h2>${bx([["Opening",f(j0)],["Received via CJ",f(cj)],["CJ paid you",f(sc+su)],["Closing",f(j0+cj-sc-su)]])}
 <h2>Day result</h2>${bx([["Sales (total)",f(S(bs,b=>b.total))],["Balance given (credit)",f(S(bs,b=>b.total-paid(b)))],...(isOwner?[["Profit on bills",f(pr)]]:[]),["Expenses",f(co+uo)],...(isOwner?[["Profit after expenses",f(pr-(co+uo-hx))]]:[])])}${isOwner?`<div class="empty">Hamali payments recorded in the Hamali tab are not deducted from profit, because hamali is collected from customers on the bill. Patti payments are purchases and are not counted as expenses.</div>`:""}</div>
 <div class="card"><h2>By store</h2><div class="tw">${storeTbl(d,true)}</div><div class="empty" style="margin-top:6px">Net cash = cash received − cash expenses. Patti payments (owner) are not split by store.</div></div>
 <div class="card"><h2>Money received</h2><div class="tw">${pays.length?`<table><tr><th>Bill no.</th><th>Customer</th><th>Mode</th><th>Amount</th></tr>${pays.map(p=>`<tr><td>${bno(p.b)}</td><td class="l">${esc(p.b.cust)}</td><td>${p.m}</td><td>${f(p.a)}</td></tr>`).join("")}<tr><th>Cash total</th><th></th><th></th><th>${f(ci)}</th></tr><tr><th>UPI total</th><th></th><th></th><th>${f(ui)}</th></tr><tr><th>CJ total</th><th></th><th></th><th>${f(cj)}</th></tr><tr><th>Total received</th><th></th><th></th><th>${f(ci+ui+cj)}</th></tr></table>`:`<div class="empty">No money received on this date.</div>`}</div></div>
 <div class="card"><h2>Expenses</h2><div class="tw">${ex.length?`<table><tr><th>Category</th><th>Note</th><th>Paid by</th><th>Amount</th></tr>${ex.map(e=>`<tr><td>${esc(e.cat)}${locT(e)}</td><td class="l">${esc(e.note||"")}</td><td>${e.mode}</td><td>${f(e.amt)}</td></tr>`).join("")}<tr><th>Total expenses</th><th></th><th>Cash ${f(co)} · UPI ${f(uo)}</th><th>${f(co+uo)}</th></tr></table>`:`<div class="empty">No expenses on this date. Add them in the Expenses tab.</div>`}</div></div>
 ${isOwner?`<div class="card"><h2>Patti payments (purchases paid)</h2><div class="tw">${pp.length?`<table><tr><th>Patti no.</th><th>Seller</th><th>Paid by</th><th>Amount</th></tr>${pp.map(x=>`<tr><td>${p2(x.no)}</td><td class="l">${esc(x.party)}</td><td>${x.paidMode}</td><td>${f(x.net)}</td></tr>`).join("")}</table>`:`<div class="empty">No patti payments on this date.</div>`}</div></div>`:""}
 <div class="card"><h2>Sales</h2><div class="tw">${bs.length?`<table><tr><th>Bill no.</th><th>Customer</th><th>Lot</th><th>Bags</th><th>Kg</th><th>Total</th><th>Paid by cash</th><th>Paid by UPI</th><th>Paid via CJ</th><th>Balance</th></tr>${bs.map(b=>`<tr><td>${bno(b)}</td><td class="l">${esc(b.cust)}</td><td class="l">${esc(b.lot)}</td><td>${b.bags}</td><td>${b.kg}</td><td>${f(b.total)}</td><td>${f(cashP(b))}</td><td>${f(upiP(b))}</td><td>${f(cjP(b))}</td><td>${f(b.total-paid(b))}</td></tr>`).join("")}<tr><th>Total</th><th></th><th></th><th>${S(bs,b=>b.bags)}</th><th>${r2(S(bs,b=>b.kg))}</th><th>${f(S(bs,b=>b.total))}</th><th>${f(S(bs,cashP))}</th><th>${f(S(bs,upiP))}</th><th>${f(S(bs,cjP))}</th><th>${f(S(bs,b=>b.total-paid(b)))}</th></tr></table>`:`<div class="empty">No bills on this date.</div>`}</div></div>`;
}
$("#clsave").onclick=()=>{
 const d=$("#ld").value||today(),c=$("#clc").value,b=$("#clb").value;
 if(c===""&&b===""){say("Enter the counted cash or the bank balance.");return}
 const doc={date:d};if(c!=="")doc.cash=n(c);if(b!=="")doc.bank=n(b);
 W(()=>db.doc("closing/"+d).set(doc)).then(ok=>{if(ok)say("Saved. This becomes the opening balance for the next day.")});
};
$("#clrm").onclick=async()=>{const d=$("#ld").value||today();if(R.closing.find(x=>x.date===d)&&(await yn("Remove the saved closing for this date?")))W(()=>db.doc("closing/"+d).delete())};
$("#lp").onclick=()=>{$("#inv").innerHTML=`<h2 style="margin:0">${esc(D.firm)}</h2><p>Daily ledger – ${$("#ld").value||today()}</p>`+$("#lgc").innerHTML;doPrint($("#inv").innerHTML,"A4")};
$("#lo").onclick=async()=>{const r=await dlg("Opening balances",[{label:"Opening cash in hand (₹)",type:"number",value:R.meta.openCash||0},{label:"Opening bank / UPI balance (₹)",type:"number",value:R.meta.openBank||0}],"Save");if(r)W(()=>setMeta(D.firm,D.hamali,{openCash:n(r[0]),openBank:n(r[1])}))};
$("#xadd").onclick=()=>{
 const a=n($("#xa").value),cat=$("#xc").value.trim();if(a<=0||!cat){say("Enter a category and an amount.");return}
 W(()=>db.collection("expenses").add({date:$("#xd").value||today(),cat,note:$("#xn").value.trim(),amt:a,mode:$("#xm").value,...($("#xs").value?{loc:$("#xs").value}:{}),at:Date.now()})).then(ok=>{if(ok)["xc","xn","xa"].forEach(i=>$("#"+i).value="")});
};
async function delExp(id){if(await yn("Delete this expense?"))W(()=>db.doc("expenses/"+id).delete())}
function renderProfit(){
 if(!isOwner){$("#pdw").innerHTML="";$("#pst").innerHTML="";$("#pl").innerHTML="";$("#pbl").innerHTML="";return}
 const fys=[...new Set(D.bills.map(b=>b.fy).concat(fyOf(today())))].sort().reverse(),cur=$("#pf").value||fys[0];
 $("#pf").innerHTML=fys.map(y=>`<option>${y}</option>`).join("")+`<option value="all">All periods</option>`;
 $("#pf").value=cur;
 const bs=D.bills.filter(b=>cur==="all"||b.fy===cur),sum=(a,fn)=>a.reduce((t,x)=>t+fn(x),0);
 const tp=sum(bs,b=>b.profit),kg=sum(bs,b=>b.kg),sales=sum(bs,b=>b.amount);
 const exp=S(R.expenses.filter(e=>!e.hm&&(cur==="all"||fyOf(e.date)===cur)),e=>e.amt);
 $("#pst").innerHTML=[["Total profit",f(tp)],["Expenses",f(exp)],["Profit after expenses",f(tp-exp)],["Sales (before hamali & GST)",f(sales)],["Bills",bs.length],["Kg sold",r2(kg)],["Profit per kg",f(kg?tp/kg:0)]].map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 const dm={};
 bs.forEach(b=>{const x=dm[b.date]||(dm[b.date]={bills:0,bags:0,sales:0,profit:0,exp:0});x.bills++;x.bags+=b.bags;x.sales+=b.amount;x.profit+=b.profit});
 R.expenses.filter(e=>!e.hm&&(cur==="all"||fyOf(e.date)===cur)).forEach(e=>{const x=dm[e.date]||(dm[e.date]={bills:0,bags:0,sales:0,profit:0,exp:0});x.exp+=e.amt});
 const dr=Object.entries(dm).sort((a,b)=>b[0].localeCompare(a[0]));
 $("#pdw").innerHTML=dr.length?`<table><tr><th>Date</th><th>Bills</th><th>Bags</th><th>Sales</th><th>Profit</th><th>Expenses</th><th>Profit after expenses</th></tr>${dr.map(([d,x])=>`<tr><td class="l">${d}</td><td>${x.bills}</td><td>${x.bags}</td><td>${f(x.sales)}</td><td class="${x.profit<0?"neg":""}">${f(x.profit)}</td><td>${f(x.exp)}</td><td class="${x.profit-x.exp<0?"neg":""}">${f(x.profit-x.exp)}</td></tr>`).join("")}<tr><th>Total</th><th>${S(dr,r=>r[1].bills)}</th><th>${S(dr,r=>r[1].bags)}</th><th>${f(S(dr,r=>r[1].sales))}</th><th>${f(S(dr,r=>r[1].profit))}</th><th>${f(S(dr,r=>r[1].exp))}</th><th>${f(S(dr,r=>r[1].profit-r[1].exp))}</th></tr></table>`:`<div class="empty">No bills in this period yet.</div>`;
 const m={};
 bs.forEach(b=>b.items.forEach(i=>{const k=i.lotId||i.lot,l=m[k]||(m[k]={name:i.lot,bags:0,kg:0,sales:0,profit:0,bills:new Set()});l.bags+=i.bags;l.kg+=i.kg;l.sales+=i.amount;l.profit+=i.amount-i.kg*(costs[i.lotId]||0);l.bills.add(b.id)}));
 const ls=Object.values(m).sort((a,b)=>b.profit-a.profit);
 $("#pl").innerHTML=ls.length?`<table><tr><th>Lot / quality</th><th>Bills</th><th>Bags sold</th><th>Kg sold</th><th>Sales</th><th>Cost</th><th>Profit</th><th>Per kg</th></tr>${ls.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.bills.size}</td><td>${l.bags}</td><td>${r2(l.kg)}</td><td>${f(l.sales)}</td><td>${f(l.sales-l.profit)}</td><td class="${l.profit<0?"neg":""}">${f(l.profit)}</td><td>${f(l.kg?l.profit/l.kg:0)}</td></tr>`).join("")}<tr><th>Total</th><th>${bs.length}</th><th>${sum(ls,l=>l.bags)}</th><th>${r2(kg)}</th><th>${f(sales)}</th><th>${f(sales-tp)}</th><th>${f(tp)}</th><th></th></tr></table>`:`<div class="empty">No bills in this period yet.</div>`;
 $("#pbl").innerHTML=bs.length?`<table><tr><th>Bill no.</th><th>Date</th><th>Customer</th><th>Lot</th><th>Kg</th><th>Sales</th><th>Profit</th></tr>${[...bs].reverse().map(b=>`<tr><td>${bno(b)}</td><td class="l">${b.date}</td><td class="l">${esc(b.cust)}</td><td class="l">${esc(b.lot)}</td><td>${b.kg}</td><td>${f(b.amount)}</td><td class="${b.profit<0?"neg":""}">${f(b.profit)}</td></tr>`).join("")}</table>`:`<div class="empty">No bills in this period yet.</div>`;
}
function render(){
 $("#firm").textContent=D.firm+" ✎";
 fillLots();
 if(!$("#bd").value)$("#bd").value=today();
 if(!$("#dd").value)$("#dd").value=today();
 if(!$("#bh").value)$("#bh").value=D.hamali;
 preview();
 const lt=D.lots.length?`<table><tr><th>Lot / quality</th><th>Main store</th><th>New Mahavir</th><th>Sent to NM</th>${isOwner?"<th>Cost/kg</th>":""}<th></th></tr>${D.lots.map(l=>`<tr><td>${esc(l.name)}</td><td>${l.stk.M}</td><td>${l.stk.N}</td><td>${l.recvN}</td>${isOwner?`<td>${l.hasCost?f(l.cost):"<span class=neg>not set</span>"}</td>`:""}<td><button class="sm" onclick="addBags('${l.id}')">+ Bags</button><button class="sm" onclick="moveNM('${l.id}')">Move to New Mahavir</button>${isOwner?`<button class="sm" onclick="setCost('${l.id}')">Cost</button>`:""}<button class="sm del" onclick="delLot('${l.id}')">Delete</button></td></tr>`).join("")}</table>`:`<div class="empty">${ready?"No lots yet. Add a lot with its bags and cost per kg.":"Loading…"}</div>`;
 $("#lt").innerHTML=lt;$("#st").innerHTML=lt.replace(/<th><\/th>/,"").replace(/<td><button[\s\S]*?<\/td>/g,"");
 const d=$("#dd").value,bs=D.bills.filter(b=>b.date===d);
 const ps=allPays().filter(p=>p.d===d),sum=(a,fn)=>a.reduce((s,x)=>s+fn(x),0);
 const cash=sum(ps.filter(p=>p.m==="Cash"),p=>p.a),upi=sum(ps.filter(p=>p.m==="UPI"),p=>p.a),cj=sum(ps.filter(p=>p.m==="CJ"),p=>p.a);
 const out=sum(D.bills,b=>b.total-paid(b))+sum(D.opening,o=>o.amount-S(o.pays,p=>p.a));
 $("#ds").innerHTML=[["Sales (total)",f(sum(bs,b=>b.total))],["Cash received",f(cash)],["UPI / bank received",f(upi)],["CJ received",f(cj)],["Total received",f(cash+upi+cj)],["Balance given today (credit)",f(sum(bs,b=>b.total-paid(b)))],...(isOwner?[["Profit today",f(sum(bs,b=>b.profit))]]:[]),["Bags sold",sum(bs,b=>b.bags)],["All pending balances",f(out)]]
 .map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join("");
 $("#dt").innerHTML=bs.length?`<table><tr><th>#</th><th>Customer</th><th>Lot</th><th>Bags</th><th>Kg</th><th>Total</th><th>Paid</th><th>Balance</th>${isOwner?"<th>Profit</th>":""}<th></th></tr>${bs.map(b=>{const p=paid(b),bal=b.total-p;return`<tr><td>${bno(b)}</td><td class="l">${esc(b.cust)}</td><td class="l">${esc(b.lot)}</td><td>${b.bags}</td><td>${b.kg}</td><td>${f(b.total)}</td><td>${f(p)}</td><td class="${bal>0.5?"neg":""}">${f(bal)}</td>${isOwner?`<td>${f(b.profit)}</td>`:""}<td><button class="sm" onclick="viewBill('${b.id}')">View</button><button class="sm" onclick="printBill('${b.id}')">Print</button>${bal>0.5?`<button class="sm" onclick="receive('${b.id}')">Receive</button>`:""}${isOwner&&b.kind!=="gst"?`<button class="sm" onclick="editBill('${b.id}')">Edit</button>`:""}<button class="sm del" onclick="delBill('${b.id}')">Delete</button></td></tr>`}).join("")}</table>`:`<div class="empty">No bills on this date.</div>`;
 if(!$("#gd").value)$("#gd").value=today();
 if(!$("#pd").value)$("#pd").value=today();
 if(!$("#pld").value)$("#pld").value=today();
 if(!$("#ld").value)$("#ld").value=today();
 if(!$("#xd").value)$("#xd").value=today();
 gfill();gdraw();gpreview();renderGcust();locBar();if(!$("#xs").dataset.i){$("#xs").value=LOC;$("#xs").dataset.i=1}renderNM();renderDash();if(!$("#hmd").value)$("#hmd").value=today();renderHam();renderCJ();$("#dsb").innerHTML=storeTbl($("#dd").value||today(),false);renderRecv();ppreview();renderPatti();drawCart();renderStock();renderLedger();renderExp();renderBal();renderProfit();prevHint();
}
$("#dd").addEventListener("input",render);$("#bsr").addEventListener("input",renderBal);$("#pf").addEventListener("input",render);$("#ld").addEventListener("input",render);$("#xd").addEventListener("input",render);

async function save(name,data){
 try{const dl=await claude.use("downloads");if(!dl){say("Downloads are not available here.");return}await dl.save({filename:name,data})}catch(e){if(!e||e.code!=="declined")say("Could not download: "+((e&&e.message)||e))}
}
$("#bk1").onclick=()=>{
 const q=v=>'"'+String(v).replace(/"/g,'""')+'"',h=["Bill no","Period","Date","Customer","Lot","Bags","Kg","Rate","Amount","Hamali","GST","Total","Paid","Balance","Profit"],hh=isOwner?h:h.slice(0,-1);
 save("bills-"+today()+".csv",[hh.join(","),...D.bills.map(b=>[bno(b),b.fy,b.date,q(b.cust),q(b.lot),b.bags,b.kg,b.rate,r2(b.amount),r2(b.ham),r2(b.gst),r2(b.total),r2(paid(b)),r2(b.total-paid(b)),...(isOwner?[r2(b.profit)]:[])].join(","))].join("\n"));
};
$("#bk2").onclick=()=>save("peanut-billing-backup-"+today()+".json",JSON.stringify(isOwner?{...R,costs}:R,null,1));

document.addEventListener("wheel",()=>{const a=document.activeElement;if(a&&a.type==="number")a.blur()},{passive:true});
applyRole(false);render();
(async()=>{
 try{db=await window.claude.use("db")}catch(e){db=null}
 if(!db){banner("Shared storage is not available. Open this page signed in to Claude, using the link the owner shared with you.");return}
 try{const u0=await window.claude.use("user");isOwner=u0?((await u0.isOwner())||(await u0.canEdit())):false}catch(e){isOwner=false}
 applyRole(true);
 if(isOwner)db.doc("private/costs").onSnapshot(s=>{costs=s.exists?s.data():{};costsLoaded=true;rebuild()},()=>{});
 sub("lots","lots");sub("stockin","stockin");sub("bills","bills");sub("pays","pays");sub("expenses","expenses");sub("opening","opening");sub("xfer","xfer");sub("closing","closing");sub("hpaid","hpaid");sub("cjset","cjset");sub("opay","opay");sub("gstcust","gstcust");if(isOwner)sub("patti","patti");
 db.doc("meta/settings").onSnapshot(s=>{R.meta=s.exists?s.data():{};rebuild()},()=>{});
 try{const u=await window.claude.use("user");if(u&&(await u.can("data.write"))===false)banner("You have view-only access. Ask the owner to give you edit (Contributor) access to enter bills.")}catch(e){}
})();
