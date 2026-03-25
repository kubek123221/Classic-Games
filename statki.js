// statki.js - v2 (tylko tryb Bot + modyfikacje, bez osobnego Online)
import {
    auth, db, onAuthStateChanged,
    doc, getDoc,
    updateGameStats, getUserProfile
} from './firebase-config.js';

const BOARD_SIZE = 10;
const SHIPS = [
    { name:'battleship', size:4, count:1, icon:'🚢' },
    { name:'cruiser',    size:3, count:2, icon:'⛴️' },
    { name:'destroyer',  size:2, count:3, icon:'🛥️' },
    { name:'submarine',  size:1, count:4, icon:'⛵' }
];

// Poziomy trudności bota
const BOT_DIFFICULTY = {
    easy:   { smart: 0.0, label: '😊 Łatwy' },
    normal: { smart: 0.5, label: '😐 Normalny' },
    hard:   { smart: 1.0, label: '😈 Trudny' }
};

let botDifficulty = 'normal';

let gameState = {
    phase: 'setup',
    playerBoard: [], enemyBoard: [],
    playerShips: [], enemyShips: [],
    playerTurn: true,
    stats: { playerHits:0, playerMisses:0, enemyHits:0, enemyMisses:0, gamesWon:0 },
    computerLastHit: null,
    computerTargets: [],
    computerProcessing: false
};

function safeT(k) { return typeof t==='function' ? t(k) : k; }

document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    updatePageTranslations();
    const cu = JSON.parse(localStorage.getItem('currentUser'));
    const nav = document.getElementById('username-nav');
    if (cu && nav) {
        nav.textContent = cu.username;
        const profileLink = document.getElementById('navProfileLink');
        if (profileLink) profileLink.style.display = 'flex';
    }
});

// ── TRYB GRY ──────────────────────────────────────────────────────────────────
function setDifficulty(diff) {
    botDifficulty = diff;
    document.querySelectorAll('.difficulty-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.difficulty === diff));
    updateDifficultyLabel();
}

function updateDifficultyLabel() {
    const el = document.getElementById('difficultyLabel');
    if (el) el.textContent = BOT_DIFFICULTY[botDifficulty]?.label || '';
}

// ── INICJALIZACJA GRY ─────────────────────────────────────────────────────────
function initGame() {
    gameState.playerBoard = createEmptyBoard();
    gameState.enemyBoard  = createEmptyBoard();
    gameState.playerShips = []; gameState.enemyShips = [];
    gameState.phase = 'setup'; gameState.playerTurn = true;
    gameState.computerLastHit = null; gameState.computerTargets = [];
    gameState.computerProcessing = false;
    renderBoard('playerBoard', gameState.playerBoard, true, false);
    renderBoard('enemyBoard',  gameState.enemyBoard,  false, false);
    updateStatusText(safeT('clickAutoSetup'));
    resetShipLives();
    const sb = document.getElementById('startBtn'); if (sb) sb.disabled = true;
}

function createEmptyBoard() {
    return Array.from({length:BOARD_SIZE}, ()=>Array.from({length:BOARD_SIZE}, ()=>({ship:null,hit:false,miss:false})));
}

// ── RENDEROWANIE ──────────────────────────────────────────────────────────────
function renderBoard(elementId, board, isPlayer, canAttack) {
    const el = document.getElementById(elementId); if (!el) return;
    el.innerHTML = '';
    for (let i=0;i<BOARD_SIZE;i++) {
        for (let j=0;j<BOARD_SIZE;j++) {
            const cell = document.createElement('div');
            cell.className = 'cell'; cell.dataset.row=i; cell.dataset.col=j;
            const cd = board[i][j];
            if (cd.hit && cd.ship) { cell.classList.add('hit'); cell.innerHTML='<span class="hit-marker">✕</span>'; }
            else if (cd.miss) { cell.classList.add('miss'); cell.innerHTML='<span class="miss-marker">○</span>'; }
            else if (cd.ship && (isPlayer || gameState.phase==='ended')) cell.classList.add('ship');
            if (canAttack && !cd.hit && !cd.miss) {
                cell.addEventListener('click', ()=>handleAttack(i,j));
                cell.classList.add('attackable');
            }
            el.appendChild(cell);
        }
    }
}

// ── ROZMIESZCZANIE ────────────────────────────────────────────────────────────
function autoSetupShips() {
    gameState.playerShips = []; gameState.playerBoard = createEmptyBoard();
    for (const st of SHIPS) {
        for (let idx=0;idx<st.count;idx++) {
            let placed=false,att=0;
            while (!placed && att<200) {
                const r=Math.floor(Math.random()*BOARD_SIZE), c=Math.floor(Math.random()*BOARD_SIZE), h=Math.random()>.5;
                if (canPlaceShip(gameState.playerBoard,r,c,st.size,h)) {
                    const ship=placeShip(gameState.playerBoard,r,c,st.size,h,st.name,st.icon);
                    ship.shipIndex=idx; ship.shipSize=st.size; gameState.playerShips.push(ship); placed=true;
                }
                att++;
            }
        }
    }
    renderBoard('playerBoard', gameState.playerBoard, true, false);
    const sb=document.getElementById('startBtn'); if(sb) sb.disabled=false;
    updateStatusText(safeT('shipsPlaced'));
}

function canPlaceShip(board, row, col, size, horizontal) {
    if (horizontal?col+size>BOARD_SIZE:row+size>BOARD_SIZE) return false;
    for (let i=0;i<size;i++) {
        const r=horizontal?row:row+i, c=horizontal?col+i:col;
        for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
            const nr=r+dr,nc=c+dc;
            if (nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&board[nr][nc].ship) return false;
        }
    }
    return true;
}

function placeShip(board, row, col, size, horizontal, name, icon) {
    const ship = {name,size,hits:0,positions:[],icon,sunk:false,shipIndex:0,shipSize:size};
    for (let i=0;i<size;i++) {
        const r=horizontal?row:row+i, c=horizontal?col+i:col;
        board[r][c].ship=ship; ship.positions.push({row:r,col:c});
    }
    return ship;
}

// ── BITWA ─────────────────────────────────────────────────────────────────────
function startBattle() {
    if (!gameState.playerShips.length) { updateStatusText(safeT('placeShipsFirst')); return; }
    gameState.enemyShips = []; gameState.enemyBoard = createEmptyBoard();
    for (const st of SHIPS) {
        for (let idx=0;idx<st.count;idx++) {
            let placed=false,att=0;
            while (!placed&&att<200) {
                const r=Math.floor(Math.random()*BOARD_SIZE),c=Math.floor(Math.random()*BOARD_SIZE),h=Math.random()>.5;
                if (canPlaceShip(gameState.enemyBoard,r,c,st.size,h)) {
                    const s=placeShip(gameState.enemyBoard,r,c,st.size,h,st.name,st.icon);
                    s.shipIndex=idx; s.shipSize=st.size; gameState.enemyShips.push(s); placed=true;
                }
                att++;
            }
        }
    }
    gameState.phase='battle';
    hide('setupControls'); show('gameControls');
    renderBoard('playerBoard', gameState.playerBoard, true, false);
    renderBoard('enemyBoard',  gameState.enemyBoard,  false, true);
    updateStatusText(safeT('yourTurn'));
    const title=document.getElementById('gameStatusTitle'); if(title) title.textContent=safeT('battleInProgress');
}

// ── ATAK GRACZA ───────────────────────────────────────────────────────────────
function handleAttack(row, col) {
    if (!gameState.playerTurn||gameState.phase!=='battle'||gameState.computerProcessing) return;
    const cell=gameState.enemyBoard[row][col];
    if (cell.hit||cell.miss) return;

    if (cell.ship) {
        cell.hit=true; cell.ship.hits++; gameState.stats.playerHits++;
        updateShipLife('enemy', cell.ship);
        if (cell.ship.hits>=cell.ship.size) {
            cell.ship.sunk=true; markSunkShip(gameState.enemyBoard,cell.ship);
            updateStatusText(safeT('shipSunk'));
            renderBoard('enemyBoard',gameState.enemyBoard,false,true); updateStats();
            if (checkWin(gameState.enemyShips)) { endGame(true); return; }
        } else { updateStatusText(safeT('hitSuccess')); renderBoard('enemyBoard',gameState.enemyBoard,false,true); updateStats(); }
    } else {
        cell.miss=true; gameState.stats.playerMisses++;
        gameState.playerTurn=false;
        updateStatusText(safeT('missedShot'));
        renderBoard('enemyBoard',gameState.enemyBoard,false,false); updateStats();
        setTimeout(()=>computerTurn(), 900);
    }
}

// ── BOT KOMPUTERA ─────────────────────────────────────────────────────────────
function computerTurn() {
    if (gameState.phase!=='battle'||gameState.computerProcessing) return;
    gameState.computerProcessing=true;
    updateStatusText(safeT('enemyTurn'));

    setTimeout(()=>{
        const {row,col} = getBotMove();
        const cell=gameState.playerBoard[row][col];

        if (cell.ship) {
            cell.hit=true; cell.ship.hits++; gameState.stats.enemyHits++;
            gameState.computerLastHit={row,col};
            updateShipLife('player',cell.ship);

            if (cell.ship.hits>=cell.ship.size) {
                cell.ship.sunk=true; markSunkShip(gameState.playerBoard,cell.ship);
                gameState.computerLastHit=null; gameState.computerTargets=[];
                updateStatusText(safeT('enemySunkShip'));
                renderBoard('playerBoard',gameState.playerBoard,true,false); updateStats();
                gameState.computerProcessing=false;
                if (checkWin(gameState.playerShips)) endGame(false);
                else setTimeout(()=>computerTurn(),900);
            } else {
                addNeighborTargets(row,col);
                updateStatusText(safeT('enemyHit'));
                renderBoard('playerBoard',gameState.playerBoard,true,false); updateStats();
                gameState.computerProcessing=false;
                setTimeout(()=>computerTurn(),900);
            }
        } else {
            cell.miss=true; gameState.stats.enemyMisses++;
            updateStatusText(safeT('enemyMissed'));
            renderBoard('playerBoard',gameState.playerBoard,true,false); updateStats();
            gameState.playerTurn=true; gameState.computerProcessing=false;
            setTimeout(()=>updateStatusText(safeT('yourTurn')),700);
        }
    }, getBotDelay());
}

function getBotDelay() {
    // Trudniejszy bot myśli dłużej (bardziej realistycznie)
    return botDifficulty==='hard' ? 1200 : botDifficulty==='normal' ? 900 : 700;
}

function getBotMove() {
    const smartChance = BOT_DIFFICULTY[botDifficulty]?.smart ?? 0.5;

    // Inteligentny ruch (używaj kolejki)
    if (Math.random() < smartChance) {
        while (gameState.computerTargets.length>0) {
            const t=gameState.computerTargets.shift();
            const c=gameState.playerBoard[t.row][t.col];
            if (!c.hit&&!c.miss) return t;
        }
    }

    // Losowy strzał
    let row,col,att=0;
    do { row=Math.floor(Math.random()*BOARD_SIZE); col=Math.floor(Math.random()*BOARD_SIZE); att++; }
    while ((gameState.playerBoard[row][col].hit||gameState.playerBoard[row][col].miss)&&att<100);
    return {row,col};
}

function addNeighborTargets(row,col) {
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc])=>{
        const nr=row+dr,nc=col+dc;
        if (nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE) {
            const c=gameState.playerBoard[nr][nc];
            if (!c.hit&&!c.miss&&!gameState.computerTargets.some(t=>t.row===nr&&t.col===nc))
                gameState.computerTargets.push({row:nr,col:nc});
        }
    });
}

// ── POMOCNICZE ────────────────────────────────────────────────────────────────
function markSunkShip(board, ship) {
    ship.positions.forEach(pos=>{
        for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
            const nr=pos.row+dr,nc=pos.col+dc;
            if(nr>=0&&nr<BOARD_SIZE&&nc>=0&&nc<BOARD_SIZE&&!board[nr][nc].ship&&!board[nr][nc].miss) board[nr][nc].miss=true;
        }
    });
}
function checkWin(ships) { return ships.every(s=>s.sunk); }
function updateShipLife(player, ship) {
    const id=ship.shipSize===4?`${player}-ship-4`:`${player}-ship-${ship.shipSize}-${ship.shipIndex}`;
    const el=document.getElementById(id); if(!el) return;
    el.querySelectorAll('.life').forEach((l,i)=>{if(i<ship.hits){l.classList.remove('active');l.classList.add('lost');}});
}
function resetShipLives() { document.querySelectorAll('.life').forEach(l=>{l.classList.remove('lost');l.classList.add('active');}); }

function endGame(playerWon) {
    gameState.phase='ended';
    const title=document.getElementById('gameStatusTitle');
    if(playerWon){updateStatusText(safeT('youWon'));if(title)title.textContent=safeT('victory');gameState.stats.gamesWon++;}
    else{updateStatusText(safeT('youLost'));if(title)title.textContent=safeT('defeat');}
    renderBoard('enemyBoard',gameState.enemyBoard,true,false);
    updateStats(); saveGameResult(playerWon);
}

function newGame() {
    gameState.stats.playerHits=0; gameState.stats.playerMisses=0;
    gameState.stats.enemyHits=0;  gameState.stats.enemyMisses=0;
    show('setupControls'); hide('gameControls');
    initGame();
}

// ── STATYSTYKI ────────────────────────────────────────────────────────────────
function updateStats() {
    const s=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    s('playerHits',gameState.stats.playerHits); s('playerMisses',gameState.stats.playerMisses);
    s('enemyHits',gameState.stats.enemyHits);   s('gamesWon',gameState.stats.gamesWon);
}

function loadStats() {
    const cu=JSON.parse(localStorage.getItem('currentUser'));
    if(cu?.stats?.battleship) gameState.stats.gamesWon=cu.stats.battleship.wins||0;
    updateStats();
}

async function saveGameResult(won) {
    const cu=JSON.parse(localStorage.getItem('currentUser'));
    if(!cu?.uid) return;
    try {
        const totalShots = gameState.stats.playerHits + gameState.stats.playerMisses;
        const extra = totalShots > 0
            ? { totalShots: gameState.stats.playerHits + gameState.stats.playerMisses,
                totalHits:  gameState.stats.playerHits }
            : {};
        await updateGameStats(cu.uid, 'battleship', won?'win':'loss', extra);
        const profile = await getUserProfile(cu.uid);
        if(profile){cu.stats=profile.stats;localStorage.setItem('currentUser',JSON.stringify(cu));}
        showSaveNotif();
    } catch(e){console.error(e);}
}

function showSaveNotif() {
    const n=document.createElement('div');n.className='save-notif';n.textContent='☁️ Wynik zapisany!';
    document.body.appendChild(n);setTimeout(()=>n.remove(),2500);
}

// ── UI HELPERS ────────────────────────────────────────────────────────────────
function updateStatusText(t){const el=document.getElementById('statusText');if(el)el.textContent=t;}
function show(id){const el=document.getElementById(id);if(el)el.style.display='';}
function hide(id){const el=document.getElementById(id);if(el)el.style.display='none';}
function updatePageTranslations(){
    document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=safeT(el.getAttribute('data-i18n')));
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>el.placeholder=safeT(el.getAttribute('data-i18n-placeholder')));
    updateDifficultyLabel();
}

window.updatePageTranslations=updatePageTranslations;
window.autoSetupShips=autoSetupShips;
window.startBattle=startBattle;
window.newGame=newGame;
window.setDifficulty=setDifficulty;