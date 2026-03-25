// home.js - v2
import {
    auth, db, signOut, onAuthStateChanged,
    collection, getDocs, doc, getDoc,
    getUserProfile, migrateOldUserData, createUserProfile
} from './firebase-config.js';

function safeT(k) { return typeof t === 'function' ? t(k) : k; }

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showEl(id)  { const el = document.getElementById(id); if (el) el.style.display = 'block'; }
function hideEl(id)  { const el = document.getElementById(id); if (el) el.style.display = 'none'; }

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            let profile = await getUserProfile(user.uid);

            // Auto-migracja: użytkownik istnieje w starej strukturze bez subkolekcji
            if (!profile) {
                const raw = await getDoc(doc(db, "users", user.uid));
                if (raw.exists()) {
                    const d = raw.data();
                    if (d.stats) await migrateOldUserData(user.uid, d.stats);
                    else         await createUserProfile(user.uid, user.email, d.username || 'Gracz');
                    profile = await getUserProfile(user.uid);
                }
            }
            if (!profile) return;

            // Zapisz do localStorage
            localStorage.setItem('currentUser', JSON.stringify({
                uid: user.uid, email: user.email,
                username: profile.username, stats: profile.stats
            }));

            // Navbar — pokaż dropdown, ukryj przycisk login
            hideEl('loginBtn');
            showEl('navProfileWrap');

            const first = profile.username.charAt(0).toUpperCase();

            // Mały awatar w przycisku
            const navCircle = document.getElementById('navAvatarCircle');
            if (navCircle) {
                if (profile.avatar) navCircle.innerHTML = `<img src="${profile.avatar}" alt="av">`;
                else navCircle.textContent = first;
            }

            // Duży awatar w nagłówku dropdownu
            const ddBig = document.getElementById('ddAvatarBig');
            if (ddBig) {
                if (profile.avatar) ddBig.innerHTML = `<img src="${profile.avatar}" alt="av">`;
                else ddBig.textContent = first;
            }

            setEl('navUsername', profile.username);
            setEl('ddName',      profile.username);
            setEl('ddEmail',     profile.email);

            loadUserStats(profile.stats);

        } catch (err) { console.error('Auth error:', err); }
    } else {
        localStorage.removeItem('currentUser');
        showEl('loginBtn');
        hideEl('navProfileWrap');
        resetStats();
    }
});

function resetStats() {
    ['tictactoe-wins','tictactoe-wins-card','tictactoe-points',
     'battleship-wins','battleship-wins-card','battleship-points'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '0';
    });
}

function loadUserStats(stats) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
    const ttt = stats?.tictactoe  || {};
    const bs  = stats?.battleship || {};
    set('tictactoe-wins',       ttt.wins);
    set('tictactoe-wins-card',  ttt.wins);
    set('tictactoe-points',     ttt.points);
    set('battleship-wins',      bs.wins);
    set('battleship-wins-card', bs.wins);
    set('battleship-points',    bs.points);
}

async function loadLeaderboard() {
    const div = document.getElementById('leaderboard');
    if (!div) return;
    div.innerHTML = '<p class="loading-text">⏳ Ładowanie rankingu...</p>';

    try {
        const snap = await getDocs(collection(db, "users"));
        const players = [];

        for (const userDoc of snap.docs) {
            const base = userDoc.data();
            if (!base.username) continue;

            const sumSnap = await getDoc(doc(db, "users", userDoc.id, "stats", "summary"));
            let tp = 0, tw = 0, tg = 0;

            if (sumSnap.exists()) {
                const s = sumSnap.data();
                tp = s.totalPoints || 0;
                tw = s.totalWins   || 0;
                tg = s.totalGames  || 0;
            } else {
                // Fallback stara struktura
                tp = (base.stats?.tictactoePoints||0) + (base.stats?.battleship?.points||0);
                tw = (base.stats?.tictactoeWins||0)   + (base.stats?.battleship?.wins||0);
            }
            players.push({ username: base.username, totalPoints: tp, totalWins: tw, totalGames: tg });
        }

        players.sort((a, b) => b.totalPoints - a.totalPoints);
        div.innerHTML = '';

        if (!players.length) {
            div.innerHTML = `<p class="empty-text">${safeT('noPlayers')}</p>`;
            return;
        }

        const medals = ['🥇','🥈','🥉'];
        players.slice(0, 10).forEach((p, i) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            item.style.animationDelay = `${i * 0.05}s`;
            item.innerHTML = `
                <span class="rank">${medals[i] || (i+1)}</span>
                <span class="player-name">${p.username}</span>
                <div class="player-meta">
                    <span class="game-wins">🏆 ${p.totalWins} wyg. | 🎮 ${p.totalGames} gier</span>
                    <span class="player-points">${p.totalPoints} ${safeT('points')}</span>
                </div>
            `;
            div.appendChild(item);
        });
    } catch (err) {
        console.error(err);
        div.innerHTML = '<p class="error-text">❌ Błąd ładowania rankingu</p>';
    }
}

function updatePageTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = safeT(el.getAttribute('data-i18n')));
    loadLeaderboard();
}
window.updatePageTranslations = updatePageTranslations;
window.loadLeaderboard = loadLeaderboard;
document.addEventListener('DOMContentLoaded', loadLeaderboard);