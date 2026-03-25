// lobby.js - centralny hub online
import {
    auth, db, onAuthStateChanged,
    collection, getDocs, addDoc, doc, getDoc, updateDoc, onSnapshot,
    query, where, orderBy, serverTimestamp, deleteDoc
} from './firebase-config.js';

const MODS_TTT = [
    { id: 'bigger',   label: '📏 Większa plansza (5×5)' },
    { id: 'blocks',   label: '🚫 Losowe bloki' },
    { id: 'timer',    label: '⏱️ Czas na ruch (15s)' },
    { id: 'powerups', label: '⚡ Power-upy' },
    { id: 'chaos',    label: '😈 Tryb oszusta' },
    { id: 'memory',   label: '🧠 Tryb pamięci' }
];

const MODS_BS = [
    { id: 'timer',    label: '⏱️ Czas na ruch (15s)' },
    { id: 'fog',      label: '🌫️ Mgła wojny' },
    { id: 'mines',    label: '💣 Miny' },
    { id: 'radar',    label: '📡 Radar (raz na 5 ruchów)' }
];

let currentUser    = null;
let selectedType   = 'tictactoe';
let selectedVis    = 'public';
let currentFilter  = 'all';
let allGames       = [];
let gamesListener  = null;

function safeT(k) { return typeof t === 'function' ? t(k) : k; }

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    renderMods('tictactoe');
    startRealtimeListener();
});

onAuthStateChanged(auth, user => {
    currentUser = user ? JSON.parse(localStorage.getItem('currentUser')) || { uid: user.uid } : null;
    const nav = document.getElementById('username-nav');
    if (nav) nav.textContent = currentUser?.username || safeT('guest');
    document.getElementById('notLoggedWarn').style.display = user ? 'none' : 'flex';
    document.getElementById('createBtn').disabled = !user;
});

// ── GAME TYPE ─────────────────────────────────────────────────────────────────
function setGameType(type) {
    selectedType = type;
    document.querySelectorAll('.game-pick').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    renderMods(type);
}

function renderMods(type) {
    const grid = document.getElementById('modsGrid');
    const mods = type === 'tictactoe' ? MODS_TTT : MODS_BS;
    grid.innerHTML = '';
    mods.forEach(m => {
        const lbl = document.createElement('label');
        lbl.className = 'mod-check';
        lbl.innerHTML = `<input type="checkbox" id="mod-${m.id}"><span>${m.label}</span>`;
        grid.appendChild(lbl);
    });
}

function setVisibility(v) {
    selectedVis = v;
    document.getElementById('publicBtn').classList.toggle('active', v === 'public');
    document.getElementById('privateBtn').classList.toggle('active', v === 'private');
}

// ── CREATE GAME ───────────────────────────────────────────────────────────────
async function createGame() {
    if (!currentUser) { showToast('⚠️ Zaloguj się aby grać online!', 'warn'); return; }

    const name  = document.getElementById('gameName').value.trim() || `Gra gracza ${currentUser.username || 'Host'}`;
    const mods  = {};
    const modDefs = selectedType === 'tictactoe' ? MODS_TTT : MODS_BS;
    modDefs.forEach(m => { mods[m.id] = !!document.getElementById(`mod-${m.id}`)?.checked; });

    const gameData = {
        type:       selectedType,
        gameName:   name,
        host:       currentUser.username || currentUser.uid,
        hostUid:    currentUser.uid,
        visibility: selectedVis,
        status:     'waiting',
        players:    [{ uid: currentUser.uid, username: currentUser.username || 'Host', symbol: 'X', ready: false }],
        maxPlayers: 2,
        modifications: mods,
        createdAt:  serverTimestamp()
    };

    try {
        const ref = await addDoc(collection(db, "games"), gameData);
        showToast('✅ Gra utworzona!', 'success');

        // Zapisz i przekieruj
        localStorage.setItem('currentGameId', ref.id);
        localStorage.setItem('isGameHost', 'true');
        localStorage.setItem('mySymbol', 'X');

        const dest = selectedType === 'tictactoe' ? 'kolko-i-krzyzyk.html' : 'statki.html';
        setTimeout(() => window.location.href = dest, 700);
    } catch (err) {
        console.error(err);
        showToast('❌ Błąd tworzenia gry: ' + err.message, 'error');
    }
}

// ── LOAD GAMES ────────────────────────────────────────────────────────────────
function startRealtimeListener() {
    if (gamesListener) gamesListener();
    const q = query(collection(db, "games"), where("status", "==", "waiting"), where("visibility", "==", "public"));
    gamesListener = onSnapshot(q, snap => {
        allGames = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderGames();
    }, err => console.error('Listener error:', err));
}

async function loadGames() {
    try {
        const q = query(collection(db, "games"), where("status","==","waiting"), where("visibility","==","public"));
        const snap = await getDocs(q);
        allGames = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderGames();
        showToast('↻ Odświeżono', 'info');
    } catch (e) { showToast('❌ Błąd ładowania', 'error'); }
}

function filterGames(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.dataset.game === type));
    renderGames();
}

function filterByHost() {
    renderGames();
}

function renderGames() {
    const list   = document.getElementById('gamesList');
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';

    let games = allGames.filter(g => {
        if (currentFilter !== 'all' && g.type !== currentFilter) return false;
        if (search && !(g.host || '').toLowerCase().includes(search)) return false;
        return true;
    });

    list.innerHTML = '';

    if (!games.length) {
        list.innerHTML = `<div class="state-box">
            <div style="font-size:2em;margin-bottom:12px">😔</div>
            <div>Brak dostępnych gier</div>
            <div style="font-size:0.85em;margin-top:6px;opacity:.6">Stwórz swoją lub odśwież</div>
        </div>`;
        return;
    }

    games.forEach((g, i) => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.animationDelay = `${i * 0.04}s`;
        const curr = g.players?.length || 1;
        const max  = g.maxPlayers || 2;
        const full = curr >= max;
        const typeIcon = g.type === 'tictactoe' ? '⭕❌' : '🚢';
        const typeName = g.type === 'tictactoe' ? 'Kółko i Krzyżyk' : 'Statki';
        const activeMods = Object.entries(g.modifications || {}).filter(([,v])=>v).length;

        card.innerHTML = `
            <div class="card-top">
                <div class="card-type-badge">${typeIcon}</div>
                <div class="card-info">
                    <div class="card-name">${g.gameName}</div>
                    <div class="card-sub">${typeName} · 👑 ${g.host}</div>
                </div>
                <div class="card-status ${full?'status-full':'status-open'}">${full?'PEŁNA':'WOLNA'}</div>
            </div>
            <div class="card-meta">
                <span>👥 ${curr}/${max}</span>
                ${activeMods ? `<span>🔧 ${activeMods} modów</span>` : ''}
                <span class="card-time">${formatTime(g.createdAt)}</span>
            </div>
            <button class="card-join-btn ${full?'disabled':''}" ${full?'disabled':''} onclick="openJoinModal('${g.id}')">
                ${full ? '❌ PEŁNA' : '✅ DOŁĄCZ'}
            </button>
        `;
        list.appendChild(card);
    });
}

function formatTime(ts) {
    if (!ts) return '';
    try {
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString('pl-PL', { hour:'2-digit', minute:'2-digit' });
    } catch { return ''; }
}

// ── JOIN MODAL ────────────────────────────────────────────────────────────────
async function openJoinModal(gameId) {
    if (!currentUser) { showToast('⚠️ Zaloguj się aby dołączyć!', 'warn'); return; }
    const game = allGames.find(g => g.id === gameId);
    if (!game) return;

    document.getElementById('modalGameName').textContent = game.gameName;
    const body = document.getElementById('modalBody');
    const activeMods = Object.entries(game.modifications || {}).filter(([,v])=>v).map(([k])=>k);

    body.innerHTML = `
        <div class="modal-info-grid">
            <div class="mi-row"><span>Typ gry</span><span>${game.type==='tictactoe'?'⭕❌ Kółko i Krzyżyk':'🚢 Statki'}</span></div>
            <div class="mi-row"><span>Host</span><span>👑 ${game.host}</span></div>
            <div class="mi-row"><span>Gracze</span><span>${game.players?.length||1}/${game.maxPlayers||2}</span></div>
            <div class="mi-row"><span>Modyfikacje</span><span>${activeMods.length ? activeMods.join(', ') : 'Brak'}</span></div>
        </div>
        <button class="btn-accent" onclick="joinGame('${gameId}')">✅ Dołącz do gry</button>
    `;

    document.getElementById('joinModal').classList.add('active');
}

function closeJoinModal() {
    document.getElementById('joinModal').classList.remove('active');
}

async function joinGame(gameId) {
    if (!currentUser) return;
    try {
        const ref  = doc(db, "games", gameId);
        const snap = await getDoc(ref);
        if (!snap.exists()) { showToast('❌ Gra nie istnieje!', 'error'); return; }

        const data = snap.data();
        if (data.status !== 'waiting') { showToast('❌ Gra już się rozpoczęła!', 'error'); closeJoinModal(); return; }
        if ((data.players?.length||1) >= data.maxPlayers) { showToast('❌ Gra jest pełna!', 'error'); return; }
        if (data.players?.some(p => p.uid === currentUser.uid)) {
            // Już jesteśmy w grze — po prostu wejdź
            localStorage.setItem('currentGameId', gameId);
            localStorage.setItem('isGameHost', 'false');
            window.location.href = data.type === 'tictactoe' ? 'kolko-i-krzyzyk.html' : 'statki.html';
            return;
        }

        const newPlayer = { uid: currentUser.uid, username: currentUser.username || 'Gracz', symbol: 'O', ready: false };
        await updateDoc(ref, {
            players: [...data.players, newPlayer],
            status: 'ready'
        });

        localStorage.setItem('currentGameId', gameId);
        localStorage.setItem('isGameHost', 'false');
        localStorage.setItem('mySymbol', 'O');

        showToast('✅ Dołączono!', 'success');
        closeJoinModal();
        setTimeout(() => window.location.href = data.type === 'tictactoe' ? 'kolko-i-krzyzyk.html' : 'statki.html', 600);
    } catch (err) {
        console.error(err);
        showToast('❌ Błąd dołączania: ' + err.message, 'error');
    }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(20px)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),300); }, 2800);
}

window.addEventListener('beforeunload', () => { if (gamesListener) gamesListener(); });

// exports
window.setGameType    = setGameType;
window.setVisibility  = setVisibility;
window.filterGames    = filterGames;
window.filterByHost   = filterByHost;
window.loadGames      = loadGames;
window.openJoinModal  = openJoinModal;
window.closeJoinModal = closeJoinModal;
window.joinGame       = joinGame;
window.createGame     = createGame;