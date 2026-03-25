// firebase-config.js - v2 | Nowy projekt: classic-game-v2
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getFirestore,
    doc, setDoc, getDoc, updateDoc, deleteDoc,
    collection, getDocs, addDoc,
    query, where, orderBy, limit, onSnapshot,
    increment, serverTimestamp, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── NOWY PROJEKT FIREBASE ─────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyB3tpGYv9UuTa9-TSHQltR_t1CEoTEIYVI",
    authDomain:        "classic-game-v2.firebaseapp.com",
    projectId:         "classic-game-v2",
    storageBucket:     "classic-game-v2.firebasestorage.app",
    messagingSenderId: "18473148979",
    appId:             "1:18473148979:web:0894a22b43f52c54d57946",
    measurementId:     "G-2YJTX5F2NK"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── STRUKTURA FIRESTORE ───────────────────────────────────────────────────────
//
//  users/{uid}
//    username, email, avatar, banner, createdAt, lastSeen
//
//  users/{uid}/stats/tictactoe
//    wins, losses, draws, points, gamesPlayed
//
//  users/{uid}/stats/battleship
//    wins, losses, points, gamesPlayed, totalShots, totalHits
//
//  users/{uid}/stats/summary          ← cache dla rankingu (szybkie reads)
//    totalPoints, totalWins, totalGames
//
//  games/{gameId}
//    type: "tictactoe" | "battleship"
//    gameName, host, hostUid, visibility, status, players[], maxPlayers
//    modifications, board, currentPlayer, winner, createdAt
//
// ─────────────────────────────────────────────────────────────────────────────

// Tworzy pełny profil użytkownika z subkolekcjami
async function createUserProfile(uid, email, username) {
    const batch = writeBatch(db);

    batch.set(doc(db, "users", uid), {
        username,
        email,
        avatar:    null,
        banner:    null,
        createdAt: serverTimestamp(),
        lastSeen:  serverTimestamp()
    });

    batch.set(doc(db, "users", uid, "stats", "tictactoe"), {
        wins: 0, losses: 0, draws: 0, points: 0, gamesPlayed: 0
    });

    batch.set(doc(db, "users", uid, "stats", "battleship"), {
        wins: 0, losses: 0, points: 0, gamesPlayed: 0, totalShots: 0, totalHits: 0
    });

    batch.set(doc(db, "users", uid, "stats", "summary"), {
        totalPoints: 0, totalWins: 0, totalGames: 0
    });

    await batch.commit();
}

// Pobiera pełny profil użytkownika ze wszystkimi subkolekcjami
async function getUserProfile(uid) {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (!userSnap.exists()) return null;

    const [tttSnap, bsSnap, sumSnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "stats", "tictactoe")),
        getDoc(doc(db, "users", uid, "stats", "battleship")),
        getDoc(doc(db, "users", uid, "stats", "summary"))
    ]);

    return {
        uid,
        ...userSnap.data(),
        stats: {
            tictactoe: tttSnap.exists()
                ? tttSnap.data()
                : { wins:0, losses:0, draws:0, points:0, gamesPlayed:0 },
            battleship: bsSnap.exists()
                ? bsSnap.data()
                : { wins:0, losses:0, points:0, gamesPlayed:0, totalShots:0, totalHits:0 },
            summary: sumSnap.exists()
                ? sumSnap.data()
                : { totalPoints:0, totalWins:0, totalGames:0 }
        }
    };
}

// Aktualizuje statystyki po zakończeniu gry
// game:   'tictactoe' | 'battleship'
// result: 'win' | 'loss' | 'draw'
// extraData: opcjonalne dodatkowe pola (np. totalShots, totalHits dla statków)
async function updateGameStats(uid, game, result, extraData = {}) {
    const pointsMap = {
        tictactoe:  { win: 10, loss: 2, draw: 5 },
        battleship: { win: 20, loss: 5, draw: 0 }
    };
    const pts = pointsMap[game]?.[result] ?? 0;

    const updates = {
        gamesPlayed: increment(1),
        points:      increment(pts),
        ...extraData
    };
    if (result === 'win')  updates.wins   = increment(1);
    if (result === 'loss') updates.losses = increment(1);
    if (result === 'draw') updates.draws  = increment(1);

    const batch = writeBatch(db);
    batch.update(doc(db, "users", uid, "stats", game), updates);
    batch.update(doc(db, "users", uid, "stats", "summary"), {
        totalGames:  increment(1),
        totalPoints: increment(pts),
        ...(result === 'win' ? { totalWins: increment(1) } : {})
    });
    // Zaktualizuj lastSeen
    batch.update(doc(db, "users", uid), { lastSeen: serverTimestamp() });

    await batch.commit();
}

// Migracja starych użytkowników (stara płaska struktura → nowe subkolekcje)
async function migrateOldUserData(uid, oldStats) {
    if (!oldStats) return;

    const ttt = {
        wins:        oldStats.tictactoeWins        || 0,
        losses:      oldStats.tictactoeLosses      || 0,
        draws:       oldStats.tictactoeDraws        || 0,
        points:      oldStats.tictactoePoints       || 0,
        gamesPlayed: (oldStats.tictactoeWins     || 0)
                   + (oldStats.tictactoeLosses   || 0)
                   + (oldStats.tictactoeDraws    || 0)
    };
    const bs = {
        wins:        oldStats.battleship?.wins   || 0,
        losses:      oldStats.battleship?.losses || 0,
        points:      oldStats.battleship?.points || 0,
        gamesPlayed: (oldStats.battleship?.wins  || 0) + (oldStats.battleship?.losses || 0),
        totalShots:  0,
        totalHits:   0
    };
    const summary = {
        totalPoints: ttt.points + bs.points,
        totalWins:   ttt.wins   + bs.wins,
        totalGames:  ttt.gamesPlayed + bs.gamesPlayed
    };

    const batch = writeBatch(db);
    batch.set(doc(db, "users", uid, "stats", "tictactoe"), ttt,     { merge: true });
    batch.set(doc(db, "users", uid, "stats", "battleship"), bs,      { merge: true });
    batch.set(doc(db, "users", uid, "stats", "summary"),    summary, { merge: true });
    await batch.commit();
}

// ── EKSPORTY ──────────────────────────────────────────────────────────────────
export {
    auth, db,
    // Auth
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged,
    // Firestore primitives
    doc, setDoc, getDoc, updateDoc, deleteDoc,
    collection, getDocs, addDoc,
    query, where, orderBy, limit, onSnapshot,
    increment, serverTimestamp, writeBatch, runTransaction,
    // Helpery wysokiego poziomu
    createUserProfile,
    getUserProfile,
    updateGameStats,
    migrateOldUserData
};