const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findGame } = require('./catalog');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'accounts.json');
const SECRET_PATH = path.join(DATA_DIR, 'session.secret');
const COOKIE = 'wag_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

const ACCENTS = ['#e4c27a', '#e07a5f', '#81b29a', '#7eb6d6', '#c986b0', '#f3efe6'];

const MESSAGES = {
    signed_out: 'Sign in to open the library.',
    username_taken: 'That name is already on the couch.',
    invalid: 'Use 3–20 letters, numbers, or underscores, and a password of at least 8 characters.',
    bad_login: 'That name and password do not match.',
    rate_limited: 'Too many tries. Wait a minute and come back.',
    couch_full: 'Four players is the whole couch.',
    bad_accent: 'Pick one of the profile colors.',
    bad_name: 'Give that player a name.',
    unknown_game: 'That game is not on the shelf.',
};

const failures = new Map();

function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function secret() {
    ensureDataDir();
    if (fs.existsSync(SECRET_PATH)) return fs.readFileSync(SECRET_PATH, 'utf8').trim();
    const value = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_PATH, value, { mode: 0o600 });
    return value;
}

function readStore() {
    ensureDataDir();
    if (!fs.existsSync(STORE_PATH)) return { users: [] };
    try {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
        if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
        return parsed;
    } catch {
        return { users: [] };
    }
}

function writeStore(store) {
    ensureDataDir();
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, STORE_PATH);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 32).toString('hex');
    return { salt, hash };
}

function passwordMatches(password, user) {
    const next = crypto.scryptSync(password, user.passwordSalt, 32);
    const prev = Buffer.from(user.passwordHash, 'hex');
    if (next.length !== prev.length) return false;
    return crypto.timingSafeEqual(next, prev);
}

function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
}

function verify(token) {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload.uid || !payload.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

function readCookie(req) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [name, ...rest] = part.trim().split('=');
        if (name === COOKIE) return decodeURIComponent(rest.join('='));
    }
    return '';
}

function setSessionCookie(res, userId) {
    const token = sign({ uid: userId, exp: Date.now() + SESSION_MS });
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    res.setHeader(
        'Set-Cookie',
        `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${secure}`
    );
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function publicUser(user) {
    const sessions = user.sessions || [];
    const minutes = Math.round(
        sessions.reduce((sum, session) => {
            if (!session.endedAt) return sum;
            return sum + Math.max(0, session.endedAt - session.startedAt);
        }, 0) / 60000
    );
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        tagline: user.tagline || '',
        accent: user.accent,
        favorites: user.favorites || [],
        couch: user.couch || [],
        createdAt: user.createdAt,
        stats: {
            plays: sessions.length,
            minutes,
            lastGameId: sessions.length ? sessions[sessions.length - 1].gameId : null,
        },
        recent: sessions.slice(-8).reverse().map((session) => ({
            gameId: session.gameId,
            startedAt: session.startedAt,
            endedAt: session.endedAt || null,
        })),
    };
}

function findUser(store, id) {
    return store.users.find((user) => user.id === id) || null;
}

function readSessionUser(req) {
    const payload = verify(readCookie(req));
    if (!payload) return null;
    const store = readStore();
    const user = findUser(store, payload.uid);
    return user ? publicUser(user) : null;
}

function validUsername(username) {
    return typeof username === 'string' && /^[a-z0-9_]{3,20}$/i.test(username);
}

function cleanText(value, max) {
    return String(value || '')
        .replace(/[\u0000-\u001f]/g, '')
        .trim()
        .slice(0, max);
}

function tooManyFailures(key) {
    const entry = failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.at > 10 * 60 * 1000) {
        failures.delete(key);
        return false;
    }
    return entry.count >= 8;
}

function markFailure(key) {
    const entry = failures.get(key);
    if (!entry || Date.now() - entry.at > 10 * 60 * 1000) {
        failures.set(key, { count: 1, at: Date.now() });
        return;
    }
    entry.count += 1;
    entry.at = Date.now();
}

function sendError(res, status, error) {
    res.status(status).json({ error, message: MESSAGES[error] || 'Something went wrong.' });
}

function notePlay(userId, gameId) {
    const store = readStore();
    const user = findUser(store, userId);
    if (!user) return;
    user.sessions = user.sessions || [];
    const open = user.sessions.find((session) => !session.endedAt);
    if (open) open.endedAt = Date.now();
    user.sessions.push({
        id: crypto.randomBytes(4).toString('hex'),
        gameId,
        startedAt: Date.now(),
        endedAt: null,
    });
    writeStore(store);
}

function noteStop(userId) {
    if (!userId) return;
    const store = readStore();
    const user = findUser(store, userId);
    if (!user || !user.sessions) return;
    const open = [...user.sessions].reverse().find((session) => !session.endedAt);
    if (open) open.endedAt = Date.now();
    writeStore(store);
}

function attachAccountApi(app) {
    app.get('/api/auth/lobby', (_req, res) => {
        const store = readStore();
        res.json({ hasProfiles: store.users.length > 0 });
    });

    app.post('/api/auth/register', (req, res) => {
        const username = cleanText(req.body?.username, 20);
        const password = String(req.body?.password || '');
        const displayName = cleanText(req.body?.displayName, 24) || username;
        if (!validUsername(username) || password.length < 8 || password.length > 72) {
            return sendError(res, 400, 'invalid');
        }
        const store = readStore();
        if (store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
            return sendError(res, 409, 'username_taken');
        }
        const { salt, hash } = hashPassword(password);
        const accent = ACCENTS[store.users.length % ACCENTS.length];
        const user = {
            id: crypto.randomBytes(8).toString('hex'),
            username,
            passwordSalt: salt,
            passwordHash: hash,
            displayName,
            tagline: '',
            accent,
            favorites: [],
            couch: [{ id: crypto.randomBytes(4).toString('hex'), name: displayName, accent }],
            sessions: [],
            createdAt: Date.now(),
        };
        store.users.push(user);
        writeStore(store);
        setSessionCookie(res, user.id);
        res.status(201).json({ profile: publicUser(user) });
    });

    app.post('/api/auth/login', (req, res) => {
        const username = cleanText(req.body?.username, 20);
        const password = String(req.body?.password || '');
        const key = username.toLowerCase();
        if (tooManyFailures(key)) return sendError(res, 429, 'rate_limited');
        const store = readStore();
        const user = store.users.find((entry) => entry.username.toLowerCase() === key);
        if (!user || !passwordMatches(password, user)) {
            markFailure(key);
            return sendError(res, 401, 'bad_login');
        }
        failures.delete(key);
        setSessionCookie(res, user.id);
        res.json({ profile: publicUser(user) });
    });

    app.post('/api/auth/logout', (_req, res) => {
        clearSessionCookie(res);
        res.json({ ok: true });
    });

    app.get('/api/me', (req, res) => {
        const profile = readSessionUser(req);
        if (!profile) return sendError(res, 401, 'signed_out');
        res.json({ profile });
    });

    app.patch('/api/me', (req, res) => {
        const session = verify(readCookie(req));
        if (!session) return sendError(res, 401, 'signed_out');
        const store = readStore();
        const user = findUser(store, session.uid);
        if (!user) return sendError(res, 401, 'signed_out');

        if (req.body?.displayName !== undefined) {
            const displayName = cleanText(req.body.displayName, 24);
            if (!displayName) return sendError(res, 400, 'bad_name');
            user.displayName = displayName;
        }
        if (req.body?.tagline !== undefined) {
            user.tagline = cleanText(req.body.tagline, 80);
        }
        if (req.body?.accent !== undefined) {
            if (!ACCENTS.includes(req.body.accent)) return sendError(res, 400, 'bad_accent');
            user.accent = req.body.accent;
        }
        writeStore(store);
        res.json({ profile: publicUser(user) });
    });

    app.post('/api/me/couch', (req, res) => {
        const session = verify(readCookie(req));
        if (!session) return sendError(res, 401, 'signed_out');
        const store = readStore();
        const user = findUser(store, session.uid);
        if (!user) return sendError(res, 401, 'signed_out');
        user.couch = user.couch || [];
        if (user.couch.length >= 4) return sendError(res, 409, 'couch_full');
        const name = cleanText(req.body?.name, 24);
        if (!name) return sendError(res, 400, 'bad_name');
        const accent = ACCENTS.includes(req.body?.accent) ? req.body.accent : ACCENTS[user.couch.length % ACCENTS.length];
        user.couch.push({ id: crypto.randomBytes(4).toString('hex'), name, accent });
        writeStore(store);
        res.status(201).json({ profile: publicUser(user) });
    });

    app.delete('/api/me/couch/:id', (req, res) => {
        const session = verify(readCookie(req));
        if (!session) return sendError(res, 401, 'signed_out');
        const store = readStore();
        const user = findUser(store, session.uid);
        if (!user) return sendError(res, 401, 'signed_out');
        user.couch = (user.couch || []).filter((player) => player.id !== req.params.id);
        writeStore(store);
        res.json({ profile: publicUser(user) });
    });

    app.post('/api/me/favorite', (req, res) => {
        const session = verify(readCookie(req));
        if (!session) return sendError(res, 401, 'signed_out');
        const gameId = String(req.body?.gameId || '');
        if (!findGame(gameId)) return sendError(res, 404, 'unknown_game');
        const store = readStore();
        const user = findUser(store, session.uid);
        if (!user) return sendError(res, 401, 'signed_out');
        user.favorites = user.favorites || [];
        if (user.favorites.includes(gameId)) {
            user.favorites = user.favorites.filter((id) => id !== gameId);
        } else {
            user.favorites.push(gameId);
        }
        writeStore(store);
        res.json({ profile: publicUser(user) });
    });
}

module.exports = {
    ACCENTS,
    attachAccountApi,
    readSessionUser,
    notePlay,
    noteStop,
    MESSAGES,
};
