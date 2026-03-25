// kolko-i-krzyzyk.js - v2 with online support
import {
    auth, db, onAuthStateChanged,
    doc, getDoc, onSnapshot, updateDoc,
    updateGameStats
} from './firebase-config.js';

// ── STAN GRY ──────────────────────────────────────────────────────────────────
let board = ['','','','','','','','',''];
let currentPlayer = 'X';
let gameActive = true;
let gameMode = 'pvp'; // pvp | bot | online
let botDifficulty = 'easy';
let sessionStats = { xWins: 0, oWins: 0, draws: 0 };
let currentGameResult = null;
let botIsThinking = false;

// Online
let onlineGameId   = null;
let mySymbol       = null;
let isHost         = false;
let onlineListener = null;

const winConditions = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function safeT(k) { return typeof t === 'function' ? t(k) : k; }

const cells = document.querySelectorAll('.cell');
cells.forEach(cell => cell.addEventListener('click', handleCellClick));

// ── INICJALIZACJA ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    const navEl = document.getElementById('username-nav');
    if (cu && navEl) {
        navEl.textContent = cu.username;
        const profileLink = document.getElementById('navProfileLink');
        if (profileLink) profileLink.style.display = 'flex';
    }

    onlineGameId = localStorage.getItem('currentGameId');
    isHost       = localStorage.getItem('isGameHost') === 'true';
    mySymbol     = localStorage.getItem('mySymbol') || 'X';

    if (onlineGameId) {
        startOnlineMode();
    } else {
        updateGameInfo();
        updatePageTranslations();
    }
});

// ── TRYBY GRY ─────────────────────────────────────────────────────────────────
function setGameMode(mode) {
    gameMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    const t = mode === 'pvp' ? document.querySelector('[data-i18n="twoPlayers"]')
            : mode === 'bot' ? document.querySelector('[data-i18n="vsBot"]') : null;
    if (t) t.classList.add('active');
    const ds = document.getElementById('difficultySelector');
    if (ds) ds.style.display = mode === 'bot' ? 'block' : 'none';
    resetGame();
}

function setDifficulty(difficulty) {
    botDifficulty = difficulty;
    document.querySelectorAll('.difficulty-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.difficulty === difficulty));
    resetGame();
}

function updateGameInfo() {
    const el = document.getElementById('gameInfoText');
    if (!el) return;
    if (gameMode === 'online') {
        el.textContent = mySymbol === currentPlayer
            ? `🎯 Twój ruch (${mySymbol})`
            : `⏳ Ruch przeciwnika (${currentPlayer})`;
        return;
    }
    if (gameMode === 'bot') {
        const names = { easy: safeT('diffEasy'), normal: safeT('diffNormal'), hard: safeT('diffHard') };
        el.textContent = `${safeT('youVsBot')} ${names[botDifficulty]}`;
    } else {
        el.textContent = safeT('playerXStarts');
    }
}

// ── ONLINE MODE ───────────────────────────────────────────────────────────────
async function startOnlineMode() {
    gameMode = 'online';
    const modeRow = document.querySelector('.game-mode');
    const diffRow = document.getElementById('difficultySelector');
    if (modeRow) modeRow.style.display = 'none';
    if (diffRow) diffRow.style.display = 'none';

    // Pokaż pasek online
    const bar = document.getElementById('onlineInfoBar');
    if (bar) {
        bar.style.display = 'flex';
        const info = document.getElementById('onlineStatusInfo');
        if (info) info.textContent = `🌐 Online — Jesteś: ${mySymbol} | ${isHost ? 'Host' : 'Gość'}`;
    }

    document.getElementById('gameInfoText').textContent = '⏳ Oczekiwanie na przeciwnika...';

    onlineListener = onSnapshot(doc(db, "games", onlineGameId), snap => {
        if (!snap.exists()) { leaveOnlineGame('Gra została usunięta!'); return; }
        const data = snap.data();
        syncOnlineState(data);
    });
}

function syncOnlineState(data) {
    if (!data) return;

    // Synchronizuj planszę
    board = data.board || Array(9).fill('');
    currentPlayer = data.currentPlayer || 'X';
    gameActive    = data.gameActive !== false;

    // Renderuj
    cells.forEach((cell, i) => {
        cell.textContent = board[i] || '';
        cell.className = 'cell';
        if (board[i]) cell.classList.add('taken', board[i].toLowerCase());
    });

    checkWin();

    if (data.status === 'waiting' || data.players?.length < 2) {
        document.getElementById('gameInfoText').textContent = '⏳ Oczekiwanie na przeciwnika...';
        return;
    }

    if (data.winner) {
        const el = document.getElementById('gameInfoText');
        if (data.winner === 'draw') {
            el.textContent = safeT('draw');
        } else {
            const iWon = data.winner === mySymbol;
            el.textContent = iWon ? safeT('youWin') : safeT('botWins').replace('Bot', 'Przeciwnik');
            if (gameActive) {
                gameActive = false;
                const cu = JSON.parse(localStorage.getItem('currentUser'));
                if (cu?.uid) updateGameStats(cu.uid, 'tictactoe', iWon ? 'win' : 'loss').catch(console.error);
            }
        }
        document.querySelectorAll('.cell').forEach(c => c.removeEventListener('click', handleCellClick));
        showOnlineEndButtons();
        return;
    }

    updateGameInfo();
}

async function makeOnlineMove(index) {
    if (!gameActive || board[index] !== '' || currentPlayer !== mySymbol) return;
    const newBoard = [...board];
    newBoard[index] = mySymbol;
    const nextPlayer = mySymbol === 'X' ? 'O' : 'X';

    // Sprawdź zwycięstwo lokalnie
    let winner = null;
    for (const [a,b,c] of winConditions) {
        if (newBoard[a] && newBoard[a] === newBoard[b] && newBoard[a] === newBoard[c]) { winner = mySymbol; break; }
    }
    if (!winner && newBoard.every(c => c !== '')) winner = 'draw';

    try {
        await updateDoc(doc(db, "games", onlineGameId), {
            board: newBoard,
            currentPlayer: winner ? currentPlayer : nextPlayer,
            ...(winner ? { winner, gameActive: false, status: 'finished' } : {})
        });
    } catch (err) { console.error('Move error:', err); }
}

async function leaveOnlineGame(msg = '') {
    if (onlineListener) { onlineListener(); onlineListener = null; }
    localStorage.removeItem('currentGameId');
    localStorage.removeItem('isGameHost');
    localStorage.removeItem('mySymbol');
    if (msg) alert(msg);
    // Nie usuwaj gry — Host może chcieć zostać
}

function showOnlineEndButtons() {
    const ctrl = document.querySelector('.controls');
    if (!ctrl) return;
    ctrl.innerHTML = `
        <button class="reset-btn" onclick="location.href='lobby.html'">🌐 Wróć do Lobby</button>
        <button class="reset-btn" style="margin-left:10px" onclick="leaveAndReset()">🎮 Zagraj offline</button>
    `;
}

window.leaveAndReset = function() {
    leaveOnlineGame();
    location.reload();
};

// ── KLIKNIĘCIE KOMÓRKI ────────────────────────────────────────────────────────
function handleCellClick(e) {
    const index = parseInt(e.target.getAttribute('data-index'));
    if (board[index] !== '' || !gameActive || botIsThinking) return;

    if (gameMode === 'online') { makeOnlineMove(index); return; }

    makeMove(index, currentPlayer);
    if (!gameActive) { setTimeout(() => saveGameResult(), 600); return; }

    if (gameMode === 'bot' && currentPlayer === 'O' && gameActive) {
        botIsThinking = true;
        const el = document.getElementById('gameInfoText');
        if (el) el.textContent = safeT('botThinking');
        setTimeout(() => {
            if (!gameActive) { botIsThinking = false; return; }
            botMove();
            botIsThinking = false;
            if (!gameActive) setTimeout(() => saveGameResult(), 600);
            else { const el2 = document.getElementById('gameInfoText'); if (el2) el2.textContent = safeT('yourMove'); }
        }, 600);
    }
}

function makeMove(index, player) {
    board[index] = player;
    const cell = cells[index];
    cell.textContent = player;
    cell.classList.add('taken', player.toLowerCase());
    requestAnimationFrame(() => requestAnimationFrame(() => { cell.style.animation='none'; cell.style.animation='popIn .3s ease'; }));

    const el = document.getElementById('gameInfoText');

    if (checkWin()) {
        let msg = gameMode === 'bot'
            ? (player === 'X' ? safeT('youWin') : safeT('botWins'))
            : `${safeT('playerWins')} ${player} ${safeT('wins2')}`;
        if (el) el.textContent = msg;
        gameActive = false;
        sessionStats[player==='X'?'xWins':'oWins']++;
        currentGameResult = player === 'X' ? 'win' : 'loss';
        updateStats(); return;
    }
    if (board.every(c => c !== '')) {
        if (el) el.textContent = safeT('draw');
        gameActive = false; sessionStats.draws++; currentGameResult = 'draw';
        updateStats(); return;
    }
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    if (gameMode === 'pvp' && el) el.textContent = `${safeT('playerTurn')} ${currentPlayer}`;
}

// ── BOT ───────────────────────────────────────────────────────────────────────
function botMove() {
    const m = botDifficulty==='easy'?botEasy():botDifficulty==='normal'?botNormal():botHard();
    if (m !== -1) makeMove(m, 'O');
}
function botEasy() { const a=board.map((c,i)=>c===''?i:null).filter(i=>i!==null); return a.length?a[Math.floor(Math.random()*a.length)]:-1; }
function botNormal() { return Math.random()<.6?botHard():botEasy(); }
function botHard() {
    let best=-Infinity,bestMove=-1;
    for(let i=0;i<9;i++){if(board[i]===''){board[i]='O';const s=minimax(board,0,false);board[i]='';if(s>best){best=s;bestMove=i;}}}
    return bestMove;
}
function minimax(board,depth,isMax) {
    const r=checkWinner();
    if(r==='O') return 10-depth; if(r==='X') return depth-10; if(r==='draw') return 0;
    if(isMax){let b=-Infinity;for(let i=0;i<9;i++){if(board[i]===''){board[i]='O';b=Math.max(b,minimax(board,depth+1,false));board[i]='';}}return b;}
    else{let b=Infinity;for(let i=0;i<9;i++){if(board[i]===''){board[i]='X';b=Math.min(b,minimax(board,depth+1,true));board[i]='';}}return b;}
}
function checkWinner() {
    for(const[a,b,c] of winConditions){if(board[a]&&board[a]===board[b]&&board[a]===board[c])return board[a];}
    return board.every(c=>c!=='')?'draw':null;
}
function checkWin() {
    for(const[a,b,c] of winConditions){
        if(board[a]&&board[a]===board[b]&&board[a]===board[c]){
            cells[a].classList.add('winner');cells[b].classList.add('winner');cells[c].classList.add('winner');return true;
        }
    }
    return false;
}

// ── ZAPIS WYNIKÓW ─────────────────────────────────────────────────────────────
async function saveGameResult() {
    if (gameMode !== 'bot' || !currentGameResult) return;
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    if (!cu?.uid) { currentGameResult = null; return; }
    try {
        await updateGameStats(cu.uid, 'tictactoe', currentGameResult);
        // Zaktualizuj localStorage
        const profile = await import('./firebase-config.js').then(m => m.getUserProfile(cu.uid));
        if (profile) { cu.stats = profile.stats; localStorage.setItem('currentUser', JSON.stringify(cu)); }
        showSaveNotif();
    } catch (e) { console.error(e); }
    currentGameResult = null;
}

function showSaveNotif() {
    const n = document.createElement('div'); n.className = 'save-notif'; n.textContent = '☁️ Wynik zapisany!';
    document.body.appendChild(n); setTimeout(() => n.remove(), 2500);
}

// ── RESET ─────────────────────────────────────────────────────────────────────
function resetGame() {
    if (gameMode === 'online') return; // nie resetuj gry online
    board = ['','','','','','','','',''];
    currentPlayer = 'X'; gameActive = true; botIsThinking = false; currentGameResult = null;
    cells.forEach(c => { c.textContent=''; c.className='cell'; c.style.animation=''; });
    updateGameInfo();
}

function updateStats() {
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('xWins',sessionStats.xWins); s('oWins',sessionStats.oWins); s('draws',sessionStats.draws);
}

function updatePageTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = safeT(el.getAttribute('data-i18n')));
    updateGameInfo();
}

window.updatePageTranslations = updatePageTranslations;
window.setGameMode  = setGameMode;
window.setDifficulty = setDifficulty;
window.resetGame    = resetGame;
window.leaveOnlineGame = leaveOnlineGame;