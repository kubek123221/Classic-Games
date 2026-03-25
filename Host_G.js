// Host_G.js - NAPRAWIONA WERSJA
import { auth, db, doc, setDoc, collection, getDocs, query, where, addDoc, deleteDoc } from './firebase-config.js';

let gameSettings = {
    gameName: '',
    visibility: 'public',
    maxPlayers: 2,
    mods: {},
    thirdPlayerType: 'bot',
    invitedPlayers: [],
    hostId: null,
    hostName: null
};
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser) {
        document.getElementById('username-nav').textContent = currentUser.username;
        const hostNameElement = document.getElementById('hostName');
        if (hostNameElement) hostNameElement.textContent = `${currentUser.username} (Host)`;
        gameSettings.hostName = currentUser.username;
        gameSettings.hostId = currentUser.uid || currentUser.username;
    } else {
        alert('Musisz być zalogowany, aby stworzyć grę!');
        window.location.href = 'login.html';
    }
    
    loadInitialModifications();
    setVisibility('public');
    setMaxPlayers(2);
    setThirdPlayerType('bot');
});

function loadInitialModifications() {
    // Załaduj domyślne modyfikacje lub z localStorage
    const savedMods = localStorage.getItem('gameMods');
    if (savedMods) {
        gameSettings.mods = JSON.parse(savedMods);
        // Ustaw checkboxy zgodnie z zapisanymi modyfikacjami
        for (const modId in gameSettings.mods) {
            const checkbox = document.getElementById(`host-mod-${modId.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
            if (checkbox) {
                checkbox.checked = gameSettings.mods[modId];
            }
        }
    }
}

function setVisibility(type) {
    gameSettings.visibility = type;
    document.getElementById('publicBtn').classList.toggle('active', type === 'public');
    document.getElementById('privateBtn').classList.toggle('active', type === 'private');
}

function setMaxPlayers(count) {
    gameSettings.maxPlayers = count;
    document.getElementById('players2').classList.toggle('active', count === 2);
    document.getElementById('players3').classList.toggle('active', count === 3);
    
    const thirdSlot = document.getElementById('thirdSlot');
    if (thirdSlot) {
        thirdSlot.style.display = count === 3 ? 'flex' : 'none';
        if (count < 3 && document.getElementById('host-mod-third')?.checked) {
            document.getElementById('host-mod-third').checked = false;
            toggleThirdPlayer();
        }
    }
}

function toggleThirdPlayer() {
    const isChecked = document.getElementById('host-mod-third').checked;
    const thirdPlayerSection = document.getElementById('thirdPlayerSection');
    const players3Btn = document.getElementById('players3');

    if (thirdPlayerSection) {
        thirdPlayerSection.style.display = isChecked ? 'block' : 'none';
    }
    
    if (players3Btn) {
        players3Btn.disabled = !isChecked;
        players3Btn.classList.toggle('disabled', !isChecked);
        if (isChecked && gameSettings.maxPlayers < 3) {
            setMaxPlayers(3);
        } else if (!isChecked && gameSettings.maxPlayers === 3) {
            setMaxPlayers(2);
        }
    }
}

function setThirdPlayerType(type) {
    gameSettings.thirdPlayerType = type;
    document.getElementById('thirdBot').classList.toggle('active', type === 'bot');
    document.getElementById('thirdPlayer').classList.toggle('active', type === 'player');
}

function openInviteModal() {
    document.getElementById('inviteModal').style.display = 'flex';
    searchPlayers();
}

function closeInviteModal() {
    document.getElementById('inviteModal').style.display = 'none';
    const searchInput = document.getElementById('playerSearch');
    const resultsDiv = document.getElementById('searchResults');
    if (searchInput) searchInput.value = '';
    if (resultsDiv) resultsDiv.innerHTML = '<p class="no-results">Wpisz minimum 3 znaki, aby rozpocząć wyszukiwanie...</p>';
}

async function searchPlayers() {
    const searchInput = document.getElementById('playerSearch').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    if (!currentUser) return;

    if (searchInput.length < 3) {
        resultsDiv.innerHTML = '<p class="no-results">Wpisz minimum 3 znaki...</p>';
        return;
    }

    try {
        const usersCollection = collection(db, "users");
        const q = query(usersCollection, where('username', '>=', searchInput), where('username', '<=', searchInput + '\uf8ff'));
        const querySnapshot = await getDocs(q);
        
        const playersInGame = gameSettings.invitedPlayers || [];
        
        let resultsHTML = '';
        querySnapshot.forEach(docSnap => {
            const user = docSnap.data();
            if (user.username && 
                user.username.toLowerCase().includes(searchInput) && 
                user.username !== currentUser.username && 
                !playersInGame.includes(user.username)) 
            {
                resultsHTML += `<div class="search-result-item"><span>${user.username}</span><button onclick="invitePlayer('${user.username}')">Zaproś</button></div>`;
            }
        });

        resultsDiv.innerHTML = resultsHTML || '<p class="no-results">Nie znaleziono graczy.</p>';
    } catch (error) {
        console.error('Błąd wyszukiwania graczy:', error);
        resultsDiv.innerHTML = '<div class="no-results">Błąd wyszukiwania</div>';
    }
}

function invitePlayer(username) {
    if (!gameSettings.invitedPlayers.includes(username)) {
        gameSettings.invitedPlayers.push(username);
    }
    
    const invitedPlayersDiv = document.getElementById('invitedPlayers');
    const emptySlots = Array.from(invitedPlayersDiv.querySelectorAll('.player-slot.empty'));

    if (emptySlots.length > 0) {
        const slot = emptySlots[0];
        slot.classList.remove('empty');
        slot.innerHTML = `
            <span class="slot-icon">👤</span>
            <span class="slot-name">${username}</span>
            <span class="slot-status pending">Oczekuje...</span>
            <button class="remove-btn" onclick="removePlayer('${username}')">✕</button>
        `;
    }
    
    closeInviteModal();
}

function removePlayer(username) {
    gameSettings.invitedPlayers = gameSettings.invitedPlayers.filter(p => p !== username);
    location.reload();
}

// Funkcja pomocnicza do tworzenia pustej planszy
function createEmptyBoard(isBigger = false) {
    const size = isBigger ? 25 : 9; // 5x5 lub 3x3
    return Array(size).fill('');
}

function getSelectedModifications() {
    const mods = {};
    const modificationCheckboxes = {
        'host-mod-bigger': 'biggerBoard',
        'host-mod-blocks': 'randomBlocks',
        'host-mod-timer': 'timer',
        'host-mod-powerups': 'powerups',
        'host-mod-rotating': 'rotating',
        'host-mod-3d': 'mode3d',
        'host-mod-shuffle': 'shuffle',
        'host-mod-dynamic': 'dynamic',
        'host-mod-third': 'thirdPlayer',
        'host-mod-battle': 'battle',
        'host-mod-theme': 'theme',
        'host-mod-memory': 'memory',
        'host-mod-chaos': 'chaos'
    };

    for (const id in modificationCheckboxes) {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            mods[modificationCheckboxes[id]] = checkbox.checked;
        }
    }
    return mods;
}

async function createGame() {
    let gameName = document.getElementById('gameName')?.value.trim();
    if (!gameName) {
        gameName = `Gra gracza ${currentUser.username}`;
    }
    
    gameSettings.gameName = gameName;
    const selectedMods = getSelectedModifications();
    const finalMaxPlayers = (selectedMods.thirdPlayer && gameSettings.thirdPlayerType === 'player') ? 3 : 2;

    const gameData = {
        gameName: gameSettings.gameName,
        host: gameSettings.hostName,
        hostName: gameSettings.hostName, // Dodane dla kompatybilności
        visibility: gameSettings.visibility,
        status: 'waiting',
        players: [gameSettings.hostName],
        maxPlayers: finalMaxPlayers,
        modifications: selectedMods,
        board: createEmptyBoard(selectedMods.biggerBoard),
        gameActive: true,
        currentPlayerSymbol: 'X',
        winner: null,
        gameStats: {
            X: { player: gameSettings.hostName, wins: 0 },
            O: { player: null, wins: 0 },
            draws: 0
        },
        createdAt: new Date().toISOString()
    };
    
    if (selectedMods.thirdPlayer && gameSettings.thirdPlayerType === 'bot') {
        gameData.players.push("Bot AI");
        gameData.gameStats['△'] = { player: "Bot AI", wins: 0 };
        gameData.maxPlayers = 3;
    }

    console.log("Tworzenie gry z danymi:", gameData);

    try {
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const gameRef = doc(db, "games", gameId);
        
        await setDoc(gameRef, gameData);

        console.log("Gra stworzona pomyślnie z ID:", gameId);

        localStorage.setItem('currentGameId', gameId);
        localStorage.setItem('isGameHost', 'true');
        
        alert(`✅ Gra "${gameSettings.gameName}" utworzona!\nID: ${gameId}\n\nPrzechodzę do pokoju gry...`);
        
        window.location.href = 'kolko-i-krzyzyk.html';
        
    } catch (error) {
        console.error('Błąd tworzenia gry:', error);
        alert('❌ Błąd tworzenia gry: ' + error.message);
    }
}

// Eksporty do HTML
window.setVisibility = setVisibility;
window.setMaxPlayers = setMaxPlayers;
window.toggleThirdPlayer = toggleThirdPlayer;
window.setThirdPlayerType = setThirdPlayerType;
window.openInviteModal = openInviteModal;
window.closeInviteModal = closeInviteModal;
window.searchPlayers = searchPlayers;
window.invitePlayer = invitePlayer;
window.removePlayer = removePlayer;
window.createGame = createGame;

console.log('Host_G.js załadowany pomyślnie!');