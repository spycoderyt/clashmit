const $=id=>document.getElementById(id);let busy=false,lastMusic=null;
async function api(path,body){const response=await fetch('/api/admin/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'same-origin'});return read(response);}
async function read(response){const data=await response.json();if(!response.ok){if(response.status===401){$('login').hidden=false;$('controls').hidden=true;}throw Error(data.error||'Request failed');}return data;}
function musicButtons(){const selected=!!lastMusic?.trackId;$('music-play').disabled=busy||!selected;$('music-stop').disabled=busy||!lastMusic?.playing;}
function render(data){
 $('login').hidden=true;$('controls').hidden=false;const r=data.round,seconds=r.endsAt?Math.max(0,Math.ceil((r.endsAt-data.serverTime)/1000)):0;
 $('round').textContent=`${r.mode==='koth'?'King of the Hill':'FFA'} · ${r.phase==='playing'?(r.endsAt?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Live'):'Ended'}`;$('details').textContent=r.king?`${r.king.name} has the crown`:'';
 $('players').replaceChildren(...data.players.map(p=>{const li=document.createElement('li');li.textContent=p.name+(p.ready?' · ready':' · scanning');return li;}));
 lastMusic=data.music;const m=lastMusic;
 $('music-status').textContent=m?.trackId?`${m.title} · ${m.playing?'Playing':'Stopped'}`:'No song selected.';
 if(document.activeElement!==$('music-volume'))$('music-volume').value=Math.round((m?.volume??.12)*100);
 $('music-volume-label').textContent=$('music-volume').value+'%';$('music-loop').checked=m?.loop!==false;musicButtons();
}
async function action(work,success){if(busy)return;busy=true;for(const b of $('controls').querySelectorAll('button'))b.disabled=true;try{render(await work());$('error').textContent=success;}catch(error){$('error').textContent=error.message;}finally{busy=false;for(const b of $('controls').querySelectorAll('button'))b.disabled=false;musicButtons();}}
async function refresh(){if(busy||document.hidden)return;try{render(await api('state'));}catch(error){if(!$('controls').hidden||error.message.includes('ADMIN_PASSWORD'))$('error').textContent=error.message;}}
$('login').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;try{await api('login',{password:$('password').value});$('password').value='';$('error').textContent='';render(await api('state'));}catch(error){$('error').textContent=error.message;}finally{busy=false;musicButtons();}};
for(const button of document.querySelectorAll('[data-action]'))button.onclick=()=>action(()=>api('command',{action:button.dataset.action,mode:button.dataset.mode}),'Broadcast sent to the arena.');
for(const button of document.querySelectorAll('[data-music]'))button.onclick=()=>action(()=>api('music',{action:button.dataset.music}),button.dataset.music==='play'?'Music started for everyone in the game.':'Music stopped for everyone.');
$('music-upload').onsubmit=event=>{event.preventDefault();const file=$('music-file').files[0];if(!file)return;if(file.size>20*1024*1024){$('error').textContent='Choose an MP3 no larger than 20 MB.';return;}$('error').textContent='Uploading song…';void action(async()=>read(await fetch('/api/admin/music/upload?name='+encodeURIComponent(file.name),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'audio/mpeg'},body:file})),'Song ready. Press Play for everyone to start it.');};
$('youtube-form').onsubmit=event=>{event.preventDefault();$('error').textContent='Converting YouTube audio… This can take a minute or two.';void action(()=>api('music/youtube',{url:$('youtube-url').value.trim()}),'Song converted. Press Play for everyone to start it.');};
$('music-volume').oninput=()=>$('music-volume-label').textContent=$('music-volume').value+'%';
$('music-volume').onchange=()=>action(()=>api('music',{action:'volume',volume:Number($('music-volume').value)/100}),'Music volume updated.');
$('music-loop').onchange=()=>action(()=>api('music',{action:'loop',loop:$('music-loop').checked}),'Loop setting updated.');
$('logout').onclick=async()=>{try{await api('logout',{});$('controls').hidden=true;$('login').hidden=false;$('error').textContent='Signed out.';}catch(error){$('error').textContent=error.message;}};
void refresh();setInterval(refresh,2000);
