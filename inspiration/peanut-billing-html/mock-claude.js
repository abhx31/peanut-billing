/* DEV ONLY. A stand-in for the three things app.js expects from its host:
     window.claude.use("db")        shared documents (here: kept in localStorage)
     window.claude.use("user")      who is signed in and their role
     window.claude.use("downloads") save a file
   Open index.html?role=staff to see the staff view (default is the owner view).
   In production replace this file with an adapter that talks to your own API (see SPEC.md). */
(function(){
  var KEY='pb-mock-data', role=new URLSearchParams(location.search).get('role')||'owner';
  var store={};try{store=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
  var subs=[];
  var save=function(){try{localStorage.setItem(KEY,JSON.stringify(store))}catch(e){}};
  var copy=function(x){return JSON.parse(JSON.stringify(x))};
  var err=function(code){var e=new Error(code);e.code=code;return e};
  var hidden=function(c){return role==='staff'&&(c==='private'||c==='patti')};
  function colSnap(c){var m=store[c]||{};return{docs:hidden(c)?[]:Object.keys(m).map(function(id){return{id:id,exists:true,data:function(){return copy(m[id])}}})}}
  function docSnap(c,id){var d=!hidden(c)&&(store[c]||{})[id];return{id:id,exists:!!d,data:function(){return d?copy(d):undefined}}}
  function sub(c,id,cb){var s={c:c,fire:function(){cb(id==null?colSnap(c):docSnap(c,id))}};subs.push(s);setTimeout(s.fire,0);return function(){subs.splice(subs.indexOf(s),1)}}
  function write(op,path,data){
    var p=path.split('/'),c=p[0],id=p[1];
    if(hidden(c))return Promise.reject(err('permission-denied'));
    store[c]=store[c]||{};
    if(op==='delete')delete store[c][id];
    else if(op==='set')store[c][id]=copy(data);
    else{if(!store[c][id])return Promise.reject(err('not-found'));Object.assign(store[c][id],copy(data))}
    save();subs.slice().forEach(function(s){if(s.c===c)s.fire()});
    return Promise.resolve();
  }
  var db={
    collection:function(n){return{
      onSnapshot:function(cb){return sub(n,null,cb)},
      add:function(d){var id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);return write('set',n+'/'+id,d).then(function(){return{id:id}})}
    }},
    doc:function(path){var p=path.split('/');return{
      onSnapshot:function(cb){return sub(p[0],p[1],cb)},
      set:function(d){return write('set',path,d)},
      update:function(d){return write('update',path,d)},
      delete:function(){return write('delete',path)}
    }}
  };
  var user={name:'Local '+role,role:role,
    isOwner:function(){return Promise.resolve(role==='owner')},
    canEdit:function(){return Promise.resolve(role==='owner'||role==='editor')},
    can:function(l){return Promise.resolve(l==='data.write'?true:role!=='staff')}};
  var downloads={save:function(o){
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([o.data],{type:'text/plain;charset=utf-8'}));
    a.download=o.filename||'download.txt';document.body.appendChild(a);a.click();setTimeout(function(){a.remove()},500);return Promise.resolve();
  }};
  window.claude={use:function(n){return Promise.resolve(n==='db'?db:n==='user'?user:n==='downloads'?downloads:null)}};
})();
