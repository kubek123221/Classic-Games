// profil.js - v2
import {
    auth, db, signOut, onAuthStateChanged,
    doc, getDoc, updateDoc,
    getUserProfile
} from './firebase-config.js';

const DEFAULT_AVATAR = 'https://api.dicebear.com/7.x/avataaars/svg?seed=default';

const avatarCollections = {
    default: ['Felix','Aneka','Max','Luna','Oscar','Mia','Leo','Zoe','Jack','Emma','Oliver','Sofia']
        .map(s=>`https://api.dicebear.com/7.x/avataaars/svg?seed=${s}`),
    gaming: [
        ...[1,2,3,4,5,6].map(i=>`https://api.dicebear.com/7.x/bottts/svg?seed=Gamer${i}`),
        ...[1,2,3,4,5,6].map(i=>`https://api.dicebear.com/7.x/pixel-art/svg?seed=Player${i}`)
    ],
    animals: ['Cat','Dog','Fox','Bear','Wolf','Lion','Tiger','Panda','Rabbit','Owl','Eagle','Dragon']
        .map(s=>`https://api.dicebear.com/7.x/adventurer/svg?seed=${s}`)
};

const bannerOptions = [
    'linear-gradient(135deg,#00d4ff 0%,#7c3aed 100%)',
    'linear-gradient(135deg,#00ff88 0%,#00a855 100%)',
    'linear-gradient(135deg,#ff4466 0%,#ff8c00 100%)',
    'linear-gradient(135deg,#f472b6 0%,#7c3aed 100%)',
    'linear-gradient(135deg,#0ea5e9 0%,#00ff88 100%)',
    'linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)',
    'linear-gradient(135deg,#8b5cf6 0%,#ec4899 100%)',
    'linear-gradient(135deg,#06b6d4 0%,#3b82f6 100%)',
    'linear-gradient(135deg,#10b981 0%,#059669 100%)',
    'linear-gradient(135deg,#f97316 0%,#eab308 100%)'
];

const achievements = [
    { id:'first_win',  icon:'🏆', name:'Pierwsza wygrana', desc:'Wygraj swoją pierwszą grę',   cond:s=>s.totalWins>=1 },
    { id:'winner_10',  icon:'⭐', name:'Zwycięzca',         desc:'Wygraj 10 gier',              cond:s=>s.totalWins>=10 },
    { id:'winner_50',  icon:'👑', name:'Mistrz',            desc:'Wygraj 50 gier',              cond:s=>s.totalWins>=50 },
    { id:'points_100', icon:'💯', name:'Setka',             desc:'Zdobądź 100 punktów',         cond:s=>s.totalPoints>=100 },
    { id:'points_500', icon:'💎', name:'Kolekcjoner',       desc:'Zdobądź 500 punktów',         cond:s=>s.totalPoints>=500 },
    { id:'ttt_master', icon:'⭕', name:'Mistrz Kółka',      desc:'Wygraj 20 gier w K&K',        cond:s=>s.tttWins>=20 },
    { id:'bs_master',  icon:'🚢', name:'Admirał',           desc:'Wygraj 20 gier w Statki',     cond:s=>s.bsWins>=20 },
    { id:'games_100',  icon:'🎮', name:'Gracz',             desc:'Rozegraj 100 gier',           cond:s=>s.totalGames>=100 }
];

let cu = null; // currentUser object z Firebase

// ── AUTH ──────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'login.html'; return; }
    try {
        cu = await getUserProfile(user.uid);
        if (!cu) { window.location.href = 'login.html'; return; }
        loadProfile();
        loadStats();
        loadAchievements();
    } catch (e) {
        console.error(e);
        showToast('❌ Błąd ładowania profilu', 'error');
    }
});

// ── PROFIL ────────────────────────────────────────────────────────────────────
function loadProfile() {
    const avatar = cu.avatar || DEFAULT_AVATAR;
    const banner = cu.banner || bannerOptions[0];
    setAll('src', ['profileAvatarLarge','avatarImg','dropdownAvatar'], avatar);
    document.getElementById('profileBanner').style.background = banner;
    setText('profileDisplayName', cu.username);
    setText('username',           cu.username);
    setText('dropdownUsername',   cu.username);
    setText('profileEmail',       cu.email);
    setText('dropdownEmail',      cu.email);
    if (cu.createdAt) {
        const d = cu.createdAt.toDate ? cu.createdAt.toDate() : new Date(cu.createdAt);
        setText('profileJoined', d.toLocaleDateString('pl-PL'));
    }
    updateStatus();
}

function updateStatus() {
    const s = calcStats();
    let icon='🎮', text='Aktywny gracz';
    if (s.totalPoints>=1000){icon='👑';text='Legendarny gracz';}
    else if(s.totalPoints>=500){icon='💎';text='Ekspert';}
    else if(s.totalPoints>=100){icon='⭐';text='Doświadczony gracz';}
    else if(s.totalWins>=10){icon='🏆';text='Zwycięzca';}
    setText('statusIcon', icon);
    setText('statusText', text);
}

function calcStats() {
    const ttt = cu.stats?.tictactoe  || {};
    const bs  = cu.stats?.battleship || {};
    const sum = cu.stats?.summary    || {};
    return {
        tttWins:     ttt.wins        || 0,
        tttLosses:   ttt.losses      || 0,
        tttDraws:    ttt.draws       || 0,
        tttPoints:   ttt.points      || 0,
        tttPlayed:   ttt.gamesPlayed || 0,
        bsWins:      bs.wins         || 0,
        bsLosses:    bs.losses       || 0,
        bsPoints:    bs.points       || 0,
        bsPlayed:    bs.gamesPlayed  || 0,
        bsShots:     bs.totalShots   || 0,
        bsHits:      bs.totalHits    || 0,
        totalWins:   sum.totalWins   || 0,
        totalGames:  sum.totalGames  || 0,
        totalPoints: sum.totalPoints || 0
    };
}

function loadStats() {
    const s = calcStats();
    // Łączne
    setText('totalPoints', s.totalPoints);
    setText('totalWins',   s.totalWins);
    setText('totalGames',  s.totalGames);
    setText('winRate',     s.totalGames>0 ? Math.round(s.totalWins/s.totalGames*100)+'%' : '0%');
    // K&K
    setText('tttPoints', s.tttPoints);
    setText('tttWins',   s.tttWins);
    setText('tttLosses', s.tttLosses);
    setText('tttDraws',  s.tttDraws);
    const tttTotal = s.tttWins + s.tttLosses + s.tttDraws;
    const tttRate  = tttTotal>0 ? Math.round(s.tttWins/tttTotal*100) : 0;
    setWidth('tttProgress', tttRate);
    setText('tttWinRate', tttRate+'% wygranych');
    // Statki
    setText('bsPoints',  s.bsPoints);
    setText('bsWins',    s.bsWins);
    setText('bsLosses',  s.bsLosses);
    const bsTotal  = s.bsWins + s.bsLosses;
    const bsRate   = bsTotal>0 ? Math.round(s.bsWins/bsTotal*100) : 0;
    const accuracy = s.bsShots>0 ? Math.round(s.bsHits/s.bsShots*100) : 0;
    setText('bsAccuracy', accuracy+'%');
    setWidth('bsProgress', bsRate);
    setText('bsWinRate', bsRate+'% wygranych');
}

function loadAchievements() {
    const grid = document.getElementById('achievementsGrid');
    const s = calcStats();
    grid.innerHTML = '';
    achievements.forEach(a => {
        const div = document.createElement('div');
        div.className = 'ach-item' + (a.cond(s) ? '' : ' locked');
        div.innerHTML = `<div class="ach-icon">${a.icon}</div><div class="ach-name">${a.name}</div><div class="ach-desc">${a.desc}</div>`;
        grid.appendChild(div);
    });
}

// ── NAVBAR DROPDOWN ───────────────────────────────────────────────────────────
window.toggleProfileMenu = () => document.getElementById('profileDropdown').classList.toggle('active');
document.addEventListener('click', e => {
    const dd=document.getElementById('profileDropdown');
    const av=document.getElementById('profileAvatar');
    if(dd&&av&&!dd.contains(e.target)&&!av.contains(e.target)) dd.classList.remove('active');
});

// ── AVATAR ────────────────────────────────────────────────────────────────────
window.openAvatarSelector  = () => { document.getElementById('avatarModal').classList.add('active'); loadAvatarGrid('default'); };
window.closeAvatarSelector = () => document.getElementById('avatarModal').classList.remove('active');
window.switchAvatarTab = (tab) => {
    document.querySelectorAll('.avatar-tab').forEach(t=>t.classList.remove('active'));
    document.querySelector(`.avatar-tab[onclick*="${tab}"]`).classList.add('active');
    const grid=document.getElementById('avatarGrid');
    const custom=document.getElementById('customAvatarInput');
    if(tab==='custom'){grid.style.display='none';custom.style.display='flex';}
    else{grid.style.display='grid';custom.style.display='none';loadAvatarGrid(tab);}
};
function loadAvatarGrid(col) {
    const grid=document.getElementById('avatarGrid'); grid.innerHTML='';
    (avatarCollections[col]||[]).forEach(url=>{
        const div=document.createElement('div');
        div.className='avatar-opt'+(cu.avatar===url?' selected':'');
        div.innerHTML=`<img src="${url}" alt="Avatar">`;
        div.onclick=()=>selectAvatar(url,div);
        grid.appendChild(div);
    });
}
async function selectAvatar(url, el) {
    document.querySelectorAll('.avatar-opt').forEach(o=>o.classList.remove('selected'));
    el.classList.add('selected');
    try {
        await updateDoc(doc(db,"users",cu.uid),{avatar:url});
        cu.avatar=url;
        setAll('src',['profileAvatarLarge','avatarImg','dropdownAvatar'],url);
        showToast('✅ Avatar zmieniony!','success');
        setTimeout(window.closeAvatarSelector,500);
    } catch(e){showToast('❌ Błąd zmiany avatara','error');}
}
window.setCustomAvatar = async () => {
    const url=document.getElementById('customAvatarUrl').value.trim();
    if(!url){showToast('Wpisz URL','error');return;}
    const img=new Image();
    img.onload=async()=>{
        try{
            await updateDoc(doc(db,"users",cu.uid),{avatar:url});
            cu.avatar=url;
            setAll('src',['profileAvatarLarge','avatarImg','dropdownAvatar'],url);
            showToast('✅ Avatar zmieniony!','success');
            window.closeAvatarSelector();
        }catch(e){showToast('❌ Błąd','error');}
    };
    img.onerror=()=>showToast('❌ Nieprawidłowy URL','error');
    img.src=url;
};

// ── BANER ─────────────────────────────────────────────────────────────────────
window.openBannerSelector = () => {
    const grid=document.getElementById('bannerGrid'); grid.innerHTML='';
    bannerOptions.forEach(g=>{
        const div=document.createElement('div');
        div.className='banner-opt'+(cu.banner===g?' selected':'');
        div.style.background=g;
        div.onclick=()=>selectBanner(g,div);
        grid.appendChild(div);
    });
    document.getElementById('bannerModal').classList.add('active');
};
window.closeBannerSelector = () => document.getElementById('bannerModal').classList.remove('active');
async function selectBanner(g, el) {
    document.querySelectorAll('.banner-opt').forEach(o=>o.classList.remove('selected'));
    el.classList.add('selected');
    try{
        await updateDoc(doc(db,"users",cu.uid),{banner:g});
        cu.banner=g;
        document.getElementById('profileBanner').style.background=g;
        showToast('✅ Baner zmieniony!','success');
        setTimeout(window.closeBannerSelector,500);
    }catch(e){showToast('❌ Błąd zmiany banera','error');}
}

// ── NAZWA ─────────────────────────────────────────────────────────────────────
window.openNameEditor = () => {
    document.getElementById('newUsername').value=cu.username;
    setText('charCount',cu.username.length);
    document.getElementById('nameModal').classList.add('active');
};
window.closeNameEditor = () => document.getElementById('nameModal').classList.remove('active');
document.getElementById('newUsername')?.addEventListener('input',e=>setText('charCount',e.target.value.length));
window.saveNewUsername = async () => {
    const val=document.getElementById('newUsername').value.trim();
    if(val.length<3||val.length>20){showToast('❌ Nazwa 3–20 znaków','error');return;}
    if(!/^[a-zA-Z0-9_]+$/.test(val)){showToast('❌ Tylko litery, cyfry i _','error');return;}
    try{
        await updateDoc(doc(db,"users",cu.uid),{username:val});
        cu.username=val;
        setText('profileDisplayName',val);
        setText('username',val);
        setText('dropdownUsername',val);
        showToast('✅ Nazwa zmieniona!','success');
        window.closeNameEditor();
    }catch(e){showToast('❌ Błąd zmiany nazwy','error');}
};

// ── LOGOUT ────────────────────────────────────────────────────────────────────
window.logout = async () => {
    try{await signOut(auth);localStorage.removeItem('currentUser');window.location.href='index.html';}
    catch(e){showToast('❌ Błąd wylogowania','error');}
};

// ── HELPERY ───────────────────────────────────────────────────────────────────
function setText(id,val){const el=document.getElementById(id);if(el)el.textContent=val;}
function setAll(attr,ids,val){ids.forEach(id=>{const el=document.getElementById(id);if(el)el[attr]=val;});}
function setWidth(id,pct){const el=document.getElementById(id);if(el)el.style.width=pct+'%';}
function showToast(msg,type='info'){
    const c=document.getElementById('toastContainer');
    const t=document.createElement('div');
    t.className=`toast ${type}`;t.textContent=msg;c.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(20px)';t.style.transition='all .3s';setTimeout(()=>t.remove(),300);},2800);
}