// login.js - v2
import {
    auth, db,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    doc, getDoc,
    createUserProfile, getUserProfile, migrateOldUserData
} from './firebase-config.js';

function safeT(k) { return typeof t === 'function' ? t(k) : k; }

function showTab(tab) {
    document.getElementById('loginForm').classList.toggle('active', tab === 'login');
    document.getElementById('registerForm').classList.toggle('active', tab === 'register');
    document.querySelectorAll('.tab').forEach((el, i) => el.classList.toggle('active', (tab==='login'?0:1)===i));
    document.getElementById('loginMessage').textContent = '';
    document.getElementById('registerMessage').textContent = '';
}

function setMsg(id, text, ok = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.style.color = ok ? '#00ff88' : '#ff4466';
}

function fbError(code) {
    const m = {
        'auth/wrong-password':'❌ Błędny email lub hasło!',
        'auth/user-not-found':'❌ Błędny email lub hasło!',
        'auth/invalid-credential':'❌ Błędny email lub hasło!',
        'auth/invalid-email':'❌ Nieprawidłowy format email!',
        'auth/email-already-in-use':'❌ Ten email jest już zarejestrowany!',
        'auth/weak-password':'❌ Hasło musi mieć min. 6 znaków!',
        'auth/too-many-requests':'❌ Zbyt wiele prób. Spróbuj później.',
        'auth/network-request-failed':'❌ Brak połączenia z internetem.'
    };
    return m[code] || `❌ Błąd: ${code}`;
}

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginUsername').value.trim();
    const pw    = document.getElementById('loginPassword').value;
    const btn   = this.querySelector('.submit-btn');
    btn.disabled = true; btn.textContent = '⏳ Logowanie...';

    try {
        const cred    = await signInWithEmailAndPassword(auth, email, pw);
        let   profile = await getUserProfile(cred.user.uid);

        // Auto-migracja ze starej struktury jeśli potrzebna
        if (!profile) {
            const raw = await getDoc(doc(db, "users", cred.user.uid));
            if (raw.exists() && raw.data().stats) {
                await migrateOldUserData(cred.user.uid, raw.data().stats);
                profile = await getUserProfile(cred.user.uid);
            }
        }

        if (!profile) throw { code: 'no-profile' };

        localStorage.setItem('currentUser', JSON.stringify({
            uid: profile.uid, email: profile.email,
            username: profile.username, stats: profile.stats
        }));
        setMsg('loginMessage', '✅ Zalogowano! Przekierowanie...', true);
        setTimeout(() => window.location.href = 'index.html', 1100);
    } catch (err) {
        setMsg('loginMessage', fbError(err.code));
        btn.disabled = false; btn.textContent = safeT('loginBtn');
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value.trim();
    const email    = document.getElementById('registerEmail').value.trim();
    const pw       = document.getElementById('registerPassword').value;
    const pw2      = document.getElementById('registerPasswordConfirm').value;
    const btn      = this.querySelector('.submit-btn');

    if (username.length < 3)  { setMsg('registerMessage', '❌ Nazwa min. 3 znaki!'); return; }
    if (pw.length < 6)        { setMsg('registerMessage', '❌ Hasło min. 6 znaków!'); return; }
    if (pw !== pw2)           { setMsg('registerMessage', '❌ Hasła nie są zgodne!'); return; }

    btn.disabled = true; btn.textContent = '⏳ Rejestracja...';

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pw);
        await createUserProfile(cred.user.uid, email, username);
        setMsg('registerMessage', '✅ Konto utworzone! Możesz się zalogować.', true);
        document.getElementById('registerForm').reset();
        setTimeout(() => showTab('login'), 2000);
    } catch (err) {
        setMsg('registerMessage', fbError(err.code));
        btn.disabled = false; btn.textContent = safeT('registerBtn');
    }
});

function updatePageTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = safeT(el.getAttribute('data-i18n')));
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = safeT(el.getAttribute('data-i18n-placeholder')));
}
window.updatePageTranslations = updatePageTranslations;
window.showTab = showTab;
document.addEventListener('DOMContentLoaded', updatePageTranslations);