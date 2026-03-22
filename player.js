/* ══ 音乐播放器 ══ */
(()=>{
  const toastBox=document.getElementById('toast-container');
  function showToast(msg,type='default',dur=2800){
    const el=document.createElement('div');
    el.className=`toast ${type}`;
    el.innerHTML=`<span class="toast-dot"></span>${msg}`;
    toastBox.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    let t=setTimeout(dismiss,dur);
    function dismiss(){
      el.classList.remove('show');
      el.addEventListener('transitionend',()=>el.remove(),{once:true});
    }
    el.addEventListener('mouseenter',()=>clearTimeout(t));
    el.addEventListener('mouseleave',()=>{t=setTimeout(dismiss,dur);});
  }

  const PKEY         = 'musicPlayerState';
  const PLAYLIST_KEY = 'musicPlayerPlaylist';
  const DB_NAME      = 'MusicPlayerDB';
  const DB_VER       = 1;
  const STORE        = 'localTracks';
  const DEFAULT_PLAYER_GAP = 16;

  /* ── 内置曲目：只填 src，名称/作者自动解析 ── */
  const BUILTIN_SRCS = [
    'music/Halsey - Without Me.mp3',
	'music/Blaxy Girls - If You Feel My Love (Chaow Mix).mp3',
	'music/Bicep - Glue.mp3',
	'music/Charli xcx - Boom Clap (From the Motion Picture Das Schicksal ist ein mieser Verräter).mp3',
	'music/Crystal Castles - Crimewave.mp3',
	'music/KNSRK - Inspired by Crystals.mp3',
	'music/ondi vil,Teqkoi,Sense - Midnight Feeling.mp3',
	'music/Oscar Anton,Clementine - nuits dete.mp3',
	'music/polnalyubvi - Твои глаза.mp3',
	'music/Prinzhorn Dance School - Reign.mp3',
  ];

  let tracks = [];
  let builtinTracks = [];

  const player    = document.getElementById('music-player');
  const audio     = new Audio();
  audio.volume    = 0.75;
  let curIdx=-1, isPlaying=false, isShuffle=false, isRepeat=false,
      isDragging=false, isCollapsed=false;

  const elPlay     = document.getElementById('mp-play');
  const elSong     = document.getElementById('mp-song');
  const elArtist   = document.getElementById('mp-artist');
  const elEmoji    = document.getElementById('mp-cover-emoji');
  const elCoverImg = document.getElementById('mp-cover-img');
  const elCur      = document.getElementById('mp-cur');
  const elDur      = document.getElementById('mp-dur');
  const elFill     = document.getElementById('mp-fill');
  const elBar      = document.getElementById('mp-bar');
  const elShuffle  = document.getElementById('mp-shuffle');
  const elRepeat   = document.getElementById('mp-repeat');
  const elVolFill  = document.getElementById('mp-vol-fill');
  const elVolBar   = document.getElementById('mp-vol-bar');
  const elVolIcon  = document.getElementById('mp-vol-icon');
  const elList     = document.getElementById('mp-playlist');
  const elListBtn  = document.getElementById('mp-list-btn');
  const elCollapse = document.getElementById('mp-collapse');
  const elUpload      = document.getElementById('mp-upload');
  const elUploadInput = document.getElementById('mp-upload-input');
  const savedState = (()=>{ try{return JSON.parse(sessionStorage.getItem(PKEY)||'null');}catch(e){ return null; } })();

  function fmt(s){ s=Math.floor(s||0); return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }

  function getTrackRef(track){
    if(track?.isLocal && track.dbId){
      return {kind:'local',dbId:track.dbId};
    }
    if(track?.src && BUILTIN_SRCS.includes(track.src)){
      return {kind:'builtin',src:track.src};
    }
    if(track?.src){
      return {
        kind:'remote',
        src:track.src,
        name:track.name||nameFromSrc(track.src),
        artist:track.artist||'',
        cover:track.cover||null,
        emoji:track.emoji||'🎵'
      };
    }
    return null;
  }

  function trackRefKey(ref){
    if(!ref?.kind) return null;
    if(ref.kind==='local') return `local:${ref.dbId}`;
    return `${ref.kind}:${ref.src||''}`;
  }

  function persistPlaylist(){
    try{
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(tracks.map(getTrackRef).filter(Boolean)));
    }catch(e){}
  }

  function readPlaylistSnapshot(){
    try{
      const raw=localStorage.getItem(PLAYLIST_KEY);
      if(raw===null) return null;
      const parsed=JSON.parse(raw);
      return Array.isArray(parsed)?parsed:null;
    }catch(e){
      return null;
    }
  }

  function hydratePlaylist(snapshot,builtins,locals){
    const builtinMap=new Map(builtins.map(track=>[track.src,track]));
    const localMap=new Map(locals.map(track=>[track.dbId,track]));
    if(!Array.isArray(snapshot)) return [...builtins,...locals];

    const restored=[];
    const seenKeys=new Set();
    function pushTrack(track){
      const key=trackRefKey(getTrackRef(track));
      if(!key||seenKeys.has(key)) return;
      seenKeys.add(key);
      restored.push(track);
    }
    for(const ref of snapshot){
      if(!ref?.kind) continue;
      if(ref.kind==='builtin' && builtinMap.has(ref.src)){
        pushTrack(builtinMap.get(ref.src));
        continue;
      }
      if(ref.kind==='local' && localMap.has(ref.dbId)){
        pushTrack(localMap.get(ref.dbId));
        continue;
      }
      if(ref.kind==='remote' && ref.src){
        pushTrack({
          name:ref.name||nameFromSrc(ref.src),
          artist:ref.artist||'',
          cover:ref.cover||null,
          emoji:ref.emoji||'🎵',
          src:ref.src,
          isLocal:false,
          dbId:null
        });
      }
    }
    return restored;
  }

  function restoreBuiltinTracks(){
    if(!builtinTracks.length){
      showMsg('内置曲目尚未加载完成','default');
      return;
    }
    const existingKeys=new Set(tracks.map(track=>trackRefKey(getTrackRef(track))).filter(Boolean));
    const missing=builtinTracks.filter(track=>{
      const key=trackRefKey(getTrackRef(track));
      return key&&!existingKeys.has(key);
    });
    if(!missing.length){
      showMsg('内置曲目已经都在歌单里了','default');
      return;
    }

    tracks=[...tracks,...missing];
    persistPlaylist();
    renderPlaylist();
    if(curIdx<0&&tracks.length) loadTrack(0,false);
    showMsg(`已恢复 ${missing.length} 首内置曲目`,'success');
  }

  /* ══ IndexedDB ══ */
  let db = null;
  function openDB(){
    return new Promise((res,rej)=>{
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e =>
        e.target.result.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});
      req.onsuccess = e => { db=e.target.result; res(db); };
      req.onerror   = ()=> rej(req.error);
    });
  }
  function dbGetAll(){
    return new Promise((res,rej)=>{
      const req = db.transaction(STORE,'readonly').objectStore(STORE).getAll();
      req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
    });
  }
  function dbPut(rec){
    return new Promise((res,rej)=>{
      const req = db.transaction(STORE,'readwrite').objectStore(STORE).put(rec);
      req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
    });
  }
  function dbDelete(id){
    return new Promise((res,rej)=>{
      const req=db.transaction(STORE,'readwrite').objectStore(STORE).delete(id);
      req.onsuccess=()=>res(); req.onerror=()=>rej(req.error);
    });
  }

  /* ══ 元数据解析 ══ */
  /* 从路径/URL 截取文件名（兼容相对路径） */
  function nameFromSrc(src){
    try{
      // 先尝试当作 URL
      const seg = new URL(src, location.href).pathname.split('/').pop();
      return decodeURIComponent(seg).replace(/\.[^.]+$/,'') || src;
    }catch(e){
      // 纯文件名或相对路径
      return src.split('/').pop().replace(/\.[^.]+$/,'') || src;
    }
  }

  function parseID3fromBlob(blob){
    return new Promise(res=>{
      if(!window.jsmediatags){ res({}); return; }
      window.jsmediatags.read(blob,{
        onSuccess(tag){
          const t=tag.tags, r={};
          if(t.title)  r.name  =t.title;
          if(t.artist) r.artist=t.artist;
          if(t.picture){
            const {data,format}=t.picture;
            r.cover='data:'+format+';base64,'+btoa(data.reduce((s,b)=>s+String.fromCharCode(b),''));
          }
          res(r);
        },
        onError(){ res({}); }
      });
    });
  }

  /* 从 src 字符串获取元数据：fetch→blob→ID3；失败用文件名兜底 */
  async function metaFromSrc(src){
    try{
      const ctrl=new AbortController();
      const tid=setTimeout(()=>ctrl.abort(),8000);
      const resp=await fetch(src,{signal:ctrl.signal});
      clearTimeout(tid);
      if(!resp.ok) throw new Error('fetch failed');
      const blob=await resp.blob();
      const m=await parseID3fromBlob(blob);
      return m;
    }catch(e){ return {}; }
  }

  /* ══ 封面 ══ */
  function setCover(img,emoji){
    if(img){
      elCoverImg.src=img; elCoverImg.style.display='block'; elEmoji.style.display='none';
    }else{
      elCoverImg.style.display='none'; elEmoji.style.display='block';
      elEmoji.textContent=emoji||'🎵';
    }
  }

  /* ══ 内置曲目 ══ */
  async function initBuiltins(){
    const out=[];
    for(const src of BUILTIN_SRCS){
      const fallback=nameFromSrc(src);
      const meta=await metaFromSrc(src);
      out.push({
        name:   meta.name   || fallback,
        artist: meta.artist || '',
        cover:  meta.cover  || null,
        emoji:'🎵', src, isLocal:false, dbId:null
      });
    }
    return out;
  }

  /* ══ 从 IndexedDB 恢复本地曲目 ══ */
  async function loadFromDB(){
    const rows=await dbGetAll();
    const out=[];
    for(const row of rows){
      try{
        // 用保存好的元数据直接构建，不重解析（快）
        const blob=new Blob([row.fileData],{type:row.mimeType||'audio/mpeg'});
        const blobUrl=URL.createObjectURL(blob);
        out.push({
          name:   row.name   || '未知曲目',
          artist: row.artist || '未知艺术家',
          cover:  row.cover  || null,
          emoji:'🎵', src:blobUrl, isLocal:true, dbId:row.id
        });
      }catch(e){ /* 损坏跳过 */ }
    }
    return out;
  }

  /* ══ 上传处理 ══ */
  elUpload.addEventListener('click',()=>elUploadInput.click());
  elUploadInput.addEventListener('change', async e=>{
    const files=[...e.target.files];
    if(!files.length) return;
    e.target.value='';
    showMsg('正在解析…','default',10000);

    const existingNames=new Set(tracks.map(t=>t.name));
    const newTracks=[]; let skipped=0;
    for(const file of files){
      // 1. 先解析元数据拿名称
      const meta=await parseID3fromBlob(file);
      const name  =meta.name  ||file.name.replace(/\.[^.]+$/,'');

      // 去重：当前列表已有同名曲目则跳过
      if(existingNames.has(name)){ skipped++; continue; }
      existingNames.add(name); // 防止同批次重复文件

      const artist=meta.artist||'未知艺术家';
      const cover =meta.cover ||null;

      // 2. 存入 IndexedDB
      const ab=await file.arrayBuffer();
      const id=await dbPut({fileData:ab, mimeType:file.type, name, artist, cover});

      // 3. 构建 track
      const blobUrl=URL.createObjectURL(new Blob([ab],{type:file.type}));
      newTracks.push({name,artist,cover,emoji:'🎵',src:blobUrl,isLocal:true,dbId:id});
    }

    if(newTracks.length){
      const firstNew=tracks.length;
      tracks=[...tracks,...newTracks];
      persistPlaylist();
      renderPlaylist();
      loadTrack(firstNew);
    }
    const msg=newTracks.length
      ? `已添加 ${newTracks.length} 首`+(skipped?`，跳过重复 ${skipped} 首`:'')
      : `全部重复，未添加（${skipped} 首）`;
    showMsg(msg, newTracks.length?'success':'default');
  });

  /* ══ 导出/导入按钮（注入到 HTML #mp-drag 按钮容器）══ */
  function injectIOButtons(){
    // 按钮容器是 #mp-drag 的最后一个子 div
    const wrap=document.getElementById('mp-drag').querySelector('div:last-child');
    if(!wrap||document.getElementById('mp-io-export')) return;

    // 导出按钮
    const expBtn=document.createElement('button');
    expBtn.id='mp-io-export'; expBtn.className='mp-upload-btn';
    expBtn.title='导出曲目列表'; expBtn.textContent='↑';

    // 恢复内置曲目按钮
    const restoreBtn=document.createElement('button');
    restoreBtn.id='mp-restore-builtins'; restoreBtn.className='mp-upload-btn';
    restoreBtn.title='恢复内置曲目'; restoreBtn.textContent='↺';

    // 导入 label+input
    const impLabel=document.createElement('label');
    impLabel.className='mp-upload-btn'; impLabel.title='导入曲目列表';
    impLabel.textContent='↓'; impLabel.style.cursor='pointer';
    const impInput=document.createElement('input');
    impInput.type='file'; impInput.accept='.json'; impInput.style.display='none';
    impLabel.appendChild(impInput);

    // 插到 ＋ 按钮前面
    const uploadBtn=document.getElementById('mp-upload');
    wrap.insertBefore(impLabel,uploadBtn);
    wrap.insertBefore(expBtn,impLabel);
    wrap.insertBefore(restoreBtn,expBtn);

    restoreBtn.addEventListener('click',e=>{
      e.stopPropagation();
      restoreBuiltinTracks();
    });

    /* 导出：本地曲目把二进制数据一起打包进 JSON（base64），不依赖 dbId */
    expBtn.addEventListener('click',async e=>{
      e.stopPropagation();
      showMsg('正在打包…','default',30000);
      const rows=await dbGetAll();
      const dbMap=Object.fromEntries(rows.map(r=>[r.id,r]));

      const payload=[];
      for(const t of tracks){
        if(t.isLocal && t.dbId){
          const row=dbMap[t.dbId];
          if(row){
            // ArrayBuffer → base64
            const bytes=new Uint8Array(row.fileData);
            let bin=''; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
            payload.push({
              name:t.name, artist:t.artist, cover:t.cover,
              isLocal:true, mimeType:row.mimeType||'audio/mpeg',
              fileData:btoa(bin)   // base64 音频数据
            });
          }
        } else {
          payload.push({
            name:t.name, artist:t.artist, cover:t.cover,
            isLocal:false, src:t.src
          });
        }
      }
      const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url; a.download='playlist_'+new Date().toISOString().slice(0,10)+'.json';
      a.style.display='none'; document.body.appendChild(a); a.click();
      setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
      showMsg('曲目列表已导出','success');
    });

    /* 导入：从 JSON 里的 base64 数据还原文件写入 IndexedDB，完全不依赖 dbId */
    impInput.addEventListener('change',async e=>{
      const file=e.target.files[0]; if(!file) return; e.target.value='';
      let imported;
      try{ imported=JSON.parse(await file.text()); }
      catch(e){ showMsg('JSON 格式错误','danger'); return; }

      showMsg('正在导入…','default',30000);
      const result=[]; let ok=0, skip=0, fail=0;

      // 预拿一次 DB 和当前 tracks，用于全程去重
      const existingRows=await dbGetAll();
      // 当前播放列表中已存在的曲目（名称作为 key）
      const existingNames=new Set(tracks.map(t=>t.name));

      for(const item of imported){
        try{
          if(item.isLocal && item.fileData){
            // base64 → ArrayBuffer
            const bin=atob(item.fileData);
            const ab=new ArrayBuffer(bin.length);
            const view=new Uint8Array(ab);
            for(let i=0;i<bin.length;i++) view[i]=bin.charCodeAt(i);

            const trackName=item.name||'未知曲目';

            // 去重：当前列表或 DB 里已有同名同大小的，跳过
            if(existingNames.has(trackName)){
              skip++; continue;
            }
            const dup=existingRows.find(r=>r.name===trackName&&r.fileData.byteLength===ab.byteLength);
            let dbId;
            if(dup){
              dbId=dup.id;
            } else {
              dbId=await dbPut({
                fileData:ab, mimeType:item.mimeType||'audio/mpeg',
                name:trackName, artist:item.artist||'', cover:item.cover||null
              });
            }
            const blob=new Blob([ab],{type:item.mimeType||'audio/mpeg'});
            result.push({
              name:trackName, artist:item.artist||'',
              cover:item.cover||null, emoji:'🎵',
              src:URL.createObjectURL(blob), isLocal:true, dbId
            });
            existingNames.add(trackName); // 防止同一批里重复
            ok++;
          } else if(!item.isLocal && item.src){
            const trackName=item.name||nameFromSrc(item.src);
            if(existingNames.has(trackName)){ skip++; continue; }
            result.push({
              name:trackName, artist:item.artist||'',
              cover:item.cover||null, emoji:'🎵',
              src:item.src, isLocal:false, dbId:null
            });
            existingNames.add(trackName);
            ok++;
          } else { fail++; }
        }catch(err){ fail++; }
      }

      // 追加到现有列表（而不是替换）
      tracks=[...tracks,...result];
      persistPlaylist();
      renderPlaylist();
      if(tracks.length&&curIdx<0) loadTrack(0);
      const msg=`已导入 ${ok} 首`
        +(skip?`，跳过重复 ${skip} 首`:'')
        +(fail?`，失败 ${fail} 首`:'');
      showMsg(msg, ok>0?'success':'default', 4000);
    });
  }

  /* ══ Toast ══ */
  function showMsg(msg,type='default',dur=2800){
    const box=document.getElementById('toast-container'); if(!box)return;
    if(type==='success') box.querySelectorAll('.toast').forEach(el=>{
      el.classList.remove('show');
      el.addEventListener('transitionend',()=>el.remove(),{once:true});
    });
    const el=document.createElement('div');
    el.className=`toast ${type}`;
    el.innerHTML=`<span class="toast-dot"></span>${msg}`;
    box.appendChild(el);
    requestAnimationFrame(()=>el.classList.add('show'));
    setTimeout(()=>{el.classList.remove('show');el.addEventListener('transitionend',()=>el.remove(),{once:true});},dur);
  }

  /* ══ 状态保存/恢复 ══ */
  function saveState(){
    const currentTrack=curIdx>=0?tracks[curIdx]:null;
    sessionStorage.setItem(PKEY,JSON.stringify({
      curIdx, currentTime:audio.currentTime, volume:audio.volume,
      isShuffle,isRepeat,isCollapsed, wasPlaying:isPlaying,
      listOpen:elList.classList.contains('open'),
      posX:player.style.left||null, posY:player.style.top||null,
      currentTrackRef:getTrackRef(currentTrack)
    }));
  }

  let _pendingResume=false;
  function _tryResume(e){
    if(!_pendingResume) return;
    if(e&&e.target?.closest?.('#mp-play')) return;
    _pendingResume=false; playAudio();
    document.removeEventListener('click',  _tryResume,true);
    document.removeEventListener('keydown',_tryResume,true);
  }
  document.addEventListener('click',  _tryResume,true);
  document.addEventListener('keydown',_tryResume,true);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState!=='visible') return;
    if(_pendingResume){ _tryResume(null); return; }
    try{
      const st=JSON.parse(sessionStorage.getItem(PKEY)||'{}');
      if(st.wasPlaying&&curIdx>=0&&!isPlaying){
        audio.play().catch(()=>{});
        isPlaying=true; elPlay.textContent='⏸'; player.classList.add('playing');
      }
    }catch(e){}
  });

  function hasExplicitPlayerPosition(){
    return !!(player.style.left && player.style.top);
  }

  function dockPlayerToDefaultCorner(){
    player.style.left='';
    player.style.top='';
    player.style.right=DEFAULT_PLAYER_GAP+'px';
    player.style.bottom=DEFAULT_PLAYER_GAP+'px';
  }

  function clampExplicitPlayerPosition(){
    if(!hasExplicitPlayerPosition()) return;
    const maxX=Math.max(0, window.innerWidth-player.offsetWidth);
    const maxY=Math.max(0, window.innerHeight-player.offsetHeight);
    const x=Math.max(0, Math.min(maxX, parseFloat(player.style.left)||0));
    const y=Math.max(0, Math.min(maxY, parseFloat(player.style.top)||0));
    player.style.left=x+'px';
    player.style.top =y+'px';
  }

  function applyInitialPlayerLayout(st){
    if(st?.posX && st?.posY){
      player.style.right='auto';
      player.style.bottom='auto';
      player.style.left=st.posX;
      player.style.top=st.posY;
      clampExplicitPlayerPosition();
    }else{
      dockPlayerToDefaultCorner();
    }

    isCollapsed=!!st?.isCollapsed;
    player.classList.toggle('collapsed', isCollapsed);
    elList.classList.toggle('open', !!st?.listOpen);
    elListBtn.classList.toggle('active', !!st?.listOpen);
  }

  function revealPlayer(){
    player.classList.remove('mp-pending-init');
  }

  function restoreState(st){
    if(!st) return;
    if(st.posX && st.posY){player.style.right='auto';player.style.bottom='auto';player.style.left=st.posX;player.style.top=st.posY;}
    else{ dockPlayerToDefaultCorner(); }
    clampExplicitPlayerPosition();
    setVolume(st.volume??0.75);
    if(st.isShuffle){isShuffle=true;elShuffle.style.color='var(--accent,#7eaaff)';}
    if(st.isRepeat) {isRepeat=true; elRepeat.style.color='var(--accent,#7eaaff)';audio.loop=true;}
    if(st.isCollapsed){isCollapsed=true;player.classList.add('collapsed');}
    if(st.listOpen){elList.classList.add('open');elListBtn.classList.add('active');}
    const restoreIdx=(()=>{
      const refKey=trackRefKey(st.currentTrackRef);
      if(refKey){
        const matchedIdx=tracks.findIndex(track=>trackRefKey(getTrackRef(track))===refKey);
        if(matchedIdx>=0) return matchedIdx;
      }
      if(st.curIdx>=0&&st.curIdx<tracks.length) return st.curIdx;
      return -1;
    })();
    if(restoreIdx>=0){
      loadTrack(restoreIdx,false);
      audio.addEventListener('loadedmetadata',function h(){
        audio.currentTime=st.currentTime||0;
        audio.removeEventListener('loadedmetadata',h);
        if(st.wasPlaying) _pendingResume=true;
      });
    }
  }

  window.addEventListener('beforeunload',saveState);
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');
    if(a&&!a.target&&a.href&&!a.href.startsWith('javascript')) saveState();
  },true);

  /* ══ 播放控制 ══ */
  function loadTrack(idx,autoplay=true){
    curIdx=idx; const t=tracks[idx];
    elSong.textContent=t.name; elArtist.textContent=t.artist||'';
    setCover(t.cover||null,t.emoji);
    audio.src=t.src; elFill.style.width='0%';
    elCur.textContent='0:00'; elDur.textContent='0:00';
    renderPlaylist(); if(autoplay) playAudio();
  }
  function playAudio(){audio.play().catch(()=>{});isPlaying=true;elPlay.textContent='⏸';player.classList.add('playing');}
  function pauseAudio(){audio.pause();isPlaying=false;elPlay.textContent='▶';player.classList.remove('playing');}

  elPlay.onclick=()=>{ if(curIdx<0){if(tracks.length)loadTrack(0);return;} isPlaying?pauseAudio():playAudio(); };
  document.getElementById('mp-prev').onclick=()=>loadTrack(curIdx<=0?tracks.length-1:curIdx-1);
  document.getElementById('mp-next').onclick=nextTrack;
  function nextTrack(){ if(!tracks.length)return; loadTrack(isShuffle?Math.floor(Math.random()*tracks.length):(curIdx+1)%tracks.length); }

  elShuffle.onclick=()=>{isShuffle=!isShuffle;elShuffle.style.color=isShuffle?'var(--accent,#7eaaff)':'';}; 
  elRepeat.onclick =()=>{isRepeat=!isRepeat;  elRepeat.style.color=isRepeat?'var(--accent,#7eaaff)':'';audio.loop=isRepeat;};

  audio.addEventListener('timeupdate',()=>{
    if(!audio.duration)return;
    elFill.style.width=(audio.currentTime/audio.duration*100)+'%';
    elCur.textContent=fmt(audio.currentTime); elDur.textContent=fmt(audio.duration);
  });
  audio.addEventListener('ended',()=>{ if(!isRepeat) nextTrack(); });
  audio.addEventListener('loadedmetadata',()=>{ elDur.textContent=fmt(audio.duration); });

  elBar.addEventListener('click',e=>{
    if(!audio.duration)return;
    const r=elBar.getBoundingClientRect();
    audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration;
  });

  function setVolume(v){
    audio.volume=Math.max(0,Math.min(1,v));
    elVolFill.style.width=(audio.volume*100)+'%';
    elVolIcon.textContent=audio.volume===0?'🔇':audio.volume<0.5?'🔈':'🔉';
  }
  elVolBar.addEventListener('click',e=>{ const r=elVolBar.getBoundingClientRect(); setVolume((e.clientX-r.left)/r.width); });
  elVolIcon.addEventListener('click',()=>setVolume(audio.volume>0?0:0.75));

  /* ══ 播放列表 ══ */
  async function deleteTrack(i){
    const t=tracks[i];
    if(t.isLocal&&t.dbId) await dbDelete(t.dbId).catch(()=>{});
    if(t.src&&t.src.startsWith('blob:')) URL.revokeObjectURL(t.src);
    tracks.splice(i,1);
    if(curIdx===i){
      if(tracks.length){ loadTrack(Math.min(i,tracks.length-1)); }
      else{ curIdx=-1; pauseAudio(); elSong.textContent='上传或选择曲目'; elArtist.textContent='— —'; setCover(null,'🎵'); }
    } else if(curIdx>i){ curIdx--; }
    persistPlaylist();
    renderPlaylist();
  }

  function renderPlaylist(){
    elList.innerHTML=tracks.map((t,i)=>`
      <div class="mp-track-item ${i===curIdx?'active':''}" data-i="${i}">
        <span class="mp-track-num">${i===curIdx&&isPlaying?'♪':i+1}</span>
        <span class="mp-track-name">${t.name}</span>
        <span class="mp-track-dur mp-track-artist">${t.artist||''}</span>
        <button class="mp-del-btn" data-i="${i}" title="删除">✕</button>
      </div>`).join('');
    elList.querySelectorAll('.mp-track-item').forEach(el=>{
      el.addEventListener('click',e=>{
        if(e.target.closest('.mp-del-btn')) return;
        loadTrack(+el.dataset.i);
      });
    });
    elList.querySelectorAll('.mp-del-btn').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.stopPropagation();
        deleteTrack(+btn.dataset.i);
      });
    });
  }
  elListBtn.addEventListener('click',()=>{elList.classList.toggle('open');elListBtn.classList.toggle('active');});

  /* ResizeObserver：播放器尺寸变化时（展开/收起动画过程中持续触发）自动校正位置 */
  new ResizeObserver(()=>{
    if(isDragging || !hasExplicitPlayerPosition()) return; // 默认停靠右下角时不改写为 0,0
    clampExplicitPlayerPosition();
  }).observe(player);

  window.addEventListener('resize',()=>{
    clampExplicitPlayerPosition();
  });

  elCollapse.addEventListener('click',e=>{
    e.stopPropagation(); isCollapsed=!isCollapsed;
    player.classList.toggle('collapsed', isCollapsed);
  });

  /* ══ 拖拽 ══ */
  const dragHandle=document.getElementById('mp-drag');
  let dragOffX=0,dragOffY=0;
  dragHandle.addEventListener('mousedown',e=>{
    if(e.target.closest('button')||e.target.closest('label')) return;
    isDragging=true; player.classList.add('dragging-player');
    const r=player.getBoundingClientRect();
    dragOffX=e.clientX-r.left; dragOffY=e.clientY-r.top;
    player.style.right='auto'; player.style.bottom='auto';
    player.style.left=r.left+'px'; player.style.top=r.top+'px';
    e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!isDragging)return;
    player.style.left=Math.max(0,Math.min(window.innerWidth-player.offsetWidth,  e.clientX-dragOffX))+'px';
    player.style.top =Math.max(0,Math.min(window.innerHeight-player.offsetHeight,e.clientY-dragOffY))+'px';
  });
  function stopDrag(){
    if(!isDragging) return;
    isDragging=false;
    player.classList.remove('dragging-player');
  }
  document.addEventListener('mouseup', stopDrag);
  // 鼠标移出窗口后松开再移回来也能正确停止拖拽
  window.addEventListener('blur', stopDrag);
  document.addEventListener('mouseleave', stopDrag);

  applyInitialPlayerLayout(savedState);
  revealPlayer();

  /* ══ 主初始化 ══ */
  async function init(){
    await openDB();
    injectIOButtons();                          // 注入 ↑↓ 按钮

    const [builtins,locals]=await Promise.all([
      initBuiltins(),
      loadFromDB(),
    ]);
    builtinTracks=builtins;
    const playlistSnapshot=readPlaylistSnapshot();
    tracks=hydratePlaylist(playlistSnapshot,builtins,locals);
    persistPlaylist();
    renderPlaylist();
    setVolume(0.75);

    restoreState(savedState);
  }

  init();
})();
