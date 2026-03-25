// Join.js - v2 (zachowany dla wstecznej kompatybilności, główny flow → lobby.html)
import {
    db, collection, getDocs, query, where, onSnapshot,
    doc, getDoc, updateDoc
} from './firebase-config.js';

let gamesListener = null;

document.addEventListener('DOMContentLoaded', () => {
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    if (!cu) { alert('Musisz być zalogowany!'); window.location.href = 'login.html'; return; }
    const nav = document.getElementById('username-nav');
    if (nav) nav.textContent = cu.username;
    loadGames();
    startRealtimeListener();
});

function startRealtimeListener() {
    const q = query(collection(db,"games"),
        where("status","==","waiting"),
        where("visibility","==","public")
    );
    gamesListener = onSnapshot(q, () => loadGames(), err => console.error(err));
}

async function loadGames() {
    const list = document.getElementById('gamesList');
    if (!list) return;
    list.innerHTML = '<div class="loading-state">⏳ Ładowanie gier...</div>';
    try {
        const q = query(collection(db,"games"),
            where("status","==","waiting"),
            where("visibility","==","public")
        );
        const snap = await getDocs(q);
        const games = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.innerHTML = '';
        if (!games.length) {
            list.innerHTML = '<div class="empty-state"><p>😔 Brak dostępnych gier</p><p>Stwórz własną lub sprawdź <a href="lobby.html">Lobby Online</a></p></div>';
            return;
        }
        games.forEach((g, i) => {
            const card = createCard(g);
            card.style.animationDelay = `${i*0.05}s`;
            list.appendChild(card);
        });
    } catch (e) {
        console.error(e);
        list.innerHTML = '<div class="error-state">❌ Błąd ładowania gier</div>';
    }
}

function createCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const curr = game.players?.length || 1;
    const max  = game.maxPlayers || 2;
    const full = curr >= max;
    const mods = Object.entries(game.modifications || {}).filter(([,v])=>v).map(([k])=>getModIcon(k)).slice(0,5).join(' ');
    const typeLabel = game.type === 'battleship' ? '🚢 Statki' : '⭕❌ Kółko i Krzyżyk';
    card.innerHTML = `
        <div class="game-card-top">
            <h3>${game.gameName || 'Gra'}</h3>
            <span class="game-status-badge ${full?'badge-full':'badge-available'}">${full?'🔴 PEŁNA':'🟢 WOLNA'}</span>
        </div>
        <div class="game-info-rows">
            <div class="info-row"><span class="info-lbl">🎮 Gra</span><span class="info-val">${typeLabel}</span></div>
            <div class="info-row"><span class="info-lbl">👑 Host</span><span class="info-val">${game.host}</span></div>
            <div class="info-row"><span class="info-lbl">👥 Gracze</span><span class="info-val">${curr}/${max}</span></div>
            ${mods ? `<div class="info-row"><span class="info-lbl">🔧 Mody</span><span class="info-val">${mods}</span></div>` : ''}
        </div>
        <button class="btn-join ${full?'disabled':''}" ${full?'disabled':''} onclick="joinGame('${game.id}')">
            ${full ? '❌ PEŁNA' : '✅ DOŁĄCZ'}
        </button>
    `;
    return card;
}

function getModIcon(k) {
    const m = {bigger:'📏',blocks:'🚫',timer:'⏱️',powerups:'⚡',rotating:'🔄',mode3d:'🎲',
               shuffle:'🌀',dynamic:'🏃',thirdPlayer:'🔺',battle:'⚔️',theme:'🎨',memory:'🧠',chaos:'😈'};
    return m[k] || '🎮';
}

async function searchByHost() {
    const val = document.getElementById('hostSearch')?.value.trim().toLowerCase() || '';
    if (val.length < 2) { loadGames(); return; }
    const list = document.getElementById('gamesList');
    list.innerHTML = '<div class="loading-state">⏳ Wyszukiwanie...</div>';
    try {
        const snap = await getDocs(collection(db,"games"));
        const games = snap.docs.map(d=>({id:d.id,...d.data()}))
            .filter(g=>(g.host||'').toLowerCase().includes(val) && g.status==='waiting');
        list.innerHTML = '';
        if (!games.length) { list.innerHTML='<div class="empty-state"><p>Brak gier tego hosta</p></div>'; return; }
        games.forEach(g=>list.appendChild(createCard(g)));
    } catch(e){ list.innerHTML='<div class="error-state">❌ Błąd wyszukiwania</div>'; }
}

async function joinGame(gameId) {
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    if (!cu) { alert('Musisz być zalogowany!'); return; }
    try {
        const ref  = doc(db,"games",gameId);
        const snap = await getDoc(ref);
        if (!snap.exists()) { alert('Gra nie istnieje!'); loadGames(); return; }
        const data = snap.data();
        if (data.status !== 'waiting') { alert('Gra już się rozpoczęła!'); loadGames(); return; }
        if ((data.players?.length||1) >= data.maxPlayers) { alert('Gra jest pełna!'); return; }
        if (data.players?.some(p=>p.uid===cu.uid)) {
            localStorage.setItem('currentGameId', gameId);
            window.location.href = data.type==='battleship' ? 'statki.html' : 'kolko-i-krzyzyk.html';
            return;
        }
        const newPlayer = { uid: cu.uid, username: cu.username, symbol: 'O', ready: false };
        await updateDoc(ref, {
            players: [...(data.players||[]), newPlayer],
            status: 'ready'
        });
        localStorage.setItem('currentGameId', gameId);
        localStorage.setItem('isGameHost', 'false');
        localStorage.setItem('mySymbol', 'O');
        alert(`✅ Dołączono do: ${data.gameName}`);
        setTimeout(() => window.location.href = data.type==='battleship' ? 'statki.html' : 'kolko-i-krzyzyk.html', 600);
    } catch(e){ console.error(e); alert('❌ Błąd dołączania'); }
}

window.addEventListener('beforeunload', () => { if (gamesListener) gamesListener(); });
window.loadGames    = loadGames;
window.searchByHost = searchByHost;
window.joinGame     = joinGame;