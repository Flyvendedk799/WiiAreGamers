const fs = require('fs');
const path = require('path');

const EXTENSIONS = new Set(['.wbfs', '.iso', '.rvz', '.wad', '.gcm', '.gcz']);

const GAMES = [
    {
        id: 'new-super-mario-bros-wii',
        title: 'New Super Mario Bros. Wii',
        year: 2009,
        players: '1–4',
        genre: 'Platform',
        shelf: 'platform',
        controls: 'platform',
        blurb: 'Four people on one course. Shake to spin, and hand the phone over when someone drops.',
        playNote: 'A jumps. Shake or B spins. Hold the phone sideways and the d-pad still walks.',
        palette: ['#f2d48a', '#d85a3a', '#2a6b4f'],
        motif: 'coins',
        fileHint: 'New Super Mario Bros. Wii.wbfs',
        aliases: ['SMNE01', 'SMNP01', 'SMNJ01', 'New Super Mario Bros Wii', 'New Super Mario Bros. Wii'],
    },
    {
        id: 'mario-kart-wii',
        title: 'Mario Kart Wii',
        year: 2008,
        players: '1–4',
        genre: 'Racing',
        shelf: 'racing',
        controls: 'racing',
        blurb: 'Twelve racers and a couch that can actually fit around the television.',
        playNote: 'A accelerates. B brakes and drifts. The phone can sit in a wheel, or just be the remote.',
        palette: ['#f4f0e6', '#1f4e89', '#e23b3b'],
        motif: 'lanes',
        fileHint: 'Mario Kart Wii.wbfs',
        aliases: ['RMCE01', 'RMCP01', 'RMCJ01', 'Mario Kart Wii'],
    },
    {
        id: 'super-mario-galaxy',
        title: 'Super Mario Galaxy',
        year: 2007,
        players: '1–2',
        genre: 'Platform',
        shelf: 'platform',
        controls: 'motion',
        blurb: 'Small planets, a pointer for star bits, and a second player who can grab the other remote.',
        playNote: 'Point to collect. Shake to spin. A jumps.',
        palette: ['#1b2a4a', '#7eb6e0', '#f0e6c8'],
        motif: 'orbit',
        fileHint: 'Super Mario Galaxy.wbfs',
        aliases: ['RMGE01', 'RMGP01', 'RMGJ01', 'Super Mario Galaxy'],
    },
    {
        id: 'super-mario-galaxy-2',
        title: 'Super Mario Galaxy 2',
        year: 2010,
        players: '1–2',
        genre: 'Platform',
        shelf: 'platform',
        controls: 'motion',
        blurb: 'The second trip around those planets, with a drill on Yoshi and the same pointer.',
        playNote: 'Point, shake, and jump. The second remote picks up star bits.',
        palette: ['#14302a', '#e7c56a', '#8fd0c4'],
        motif: 'orbit',
        fileHint: 'Super Mario Galaxy 2.wbfs',
        aliases: ['SB4E01', 'SB4P01', 'SB4J01', 'Super Mario Galaxy 2'],
    },
    {
        id: 'wii-sports',
        title: 'Wii Sports',
        year: 2006,
        players: '1–4',
        genre: 'Sports',
        shelf: 'motion',
        controls: 'motion',
        blurb: 'Tennis, bowling, boxing, golf, baseball. The game this room was built around.',
        playNote: 'Swing the phone for a hit. Flick up to toss a serve. A confirms.',
        palette: ['#e8f2ea', '#2f6fed', '#f2f4f7'],
        motif: 'burst',
        fileHint: 'Wii Sports.wbfs',
        aliases: ['RSPE01', 'RSPP01', 'RSPJ01', 'Wii Sports', 'game'],
    },
    {
        id: 'wii-sports-resort',
        title: 'Wii Sports Resort',
        year: 2009,
        players: '1–4',
        genre: 'Sports',
        shelf: 'motion',
        controls: 'motion',
        blurb: 'Swordplay, wakeboarding, basketball, and table tennis on the island after the first sports disc.',
        playNote: 'Motion is the whole remote. Recenter the pointer before swordplay or archery.',
        palette: ['#d7f3ff', '#1f8a9e', '#f6e27a'],
        motif: 'burst',
        fileHint: 'Wii Sports Resort.wbfs',
        aliases: ['RZTE01', 'RZTP01', 'RZTJ01', 'Wii Sports Resort'],
    },
    {
        id: 'super-smash-bros-brawl',
        title: 'Super Smash Bros. Brawl',
        year: 2008,
        players: '1–4',
        genre: 'Fighting',
        shelf: 'party',
        controls: 'party',
        blurb: 'Four profiles, four phones, and a stage that ends when the living room does.',
        playNote: 'Stick to move. A attacks. Shake for a smash if you mean it. B is special.',
        palette: ['#2a2438', '#e6e2f2', '#c4564a'],
        motif: 'grid',
        fileHint: 'Super Smash Bros. Brawl.wbfs',
        aliases: ['RSBE01', 'RSBP01', 'RSBJ01', 'Super Smash Bros Brawl', 'Super Smash Bros. Brawl'],
    },
    {
        id: 'mario-party-8',
        title: 'Mario Party 8',
        year: 2007,
        players: '1–4',
        genre: 'Party',
        shelf: 'party',
        controls: 'party',
        blurb: 'Boards, minigames, and an evening that refuses to be short.',
        playNote: 'Pass the phones. Most minigames want a swing, a point, or a button at the same time.',
        palette: ['#ffe08a', '#ef5b8c', '#3d6bff'],
        motif: 'grid',
        fileHint: 'Mario Party 8.wbfs',
        aliases: ['RM8E01', 'RM8P01', 'RM8J01', 'Mario Party 8'],
    },
    {
        id: 'wii-play',
        title: 'Wii Play',
        year: 2006,
        players: '1–2',
        genre: 'Party',
        shelf: 'party',
        controls: 'party',
        blurb: 'Short games for two people who just sat down and do not want a campaign.',
        playNote: 'Point for shooting and finding. A confirms. Two phones can take the two remotes.',
        palette: ['#f7f1e4', '#5b8def', '#f0a35e'],
        motif: 'coins',
        fileHint: 'Wii Play.wbfs',
        aliases: ['RHAP01', 'RHPP01', 'RHAJ01', 'Wii Play'],
    },
    {
        id: 'twilight-princess',
        title: 'The Legend of Zelda: Twilight Princess',
        year: 2006,
        players: '1',
        genre: 'Adventure',
        shelf: 'adventure',
        controls: 'motion',
        blurb: 'A long game for one profile, with the pointer doing the aiming a stick used to do.',
        playNote: 'Point to aim. Swing for the sword. A confirms dialogue.',
        palette: ['#1c2430', '#c6a15b', '#6e8b74'],
        motif: 'ridge',
        fileHint: 'Twilight Princess.wbfs',
        aliases: ['RZDE01', 'RZDP01', 'RZDJ01', 'Twilight Princess', 'The Legend of Zelda Twilight Princess'],
    },
    {
        id: 'donkey-kong-country-returns',
        title: 'Donkey Kong Country Returns',
        year: 2010,
        players: '1–2',
        genre: 'Platform',
        shelf: 'platform',
        controls: 'platform',
        blurb: 'Two people on one barrel line. Shake to roll, and do not let the mine cart talk you into standing up.',
        playNote: 'A jumps. Shake or B rolls. The second player rides along.',
        palette: ['#6b2a22', '#e7b15a', '#2f5c38'],
        motif: 'ridge',
        fileHint: 'Donkey Kong Country Returns.wbfs',
        aliases: ['SF8E01', 'SF8P01', 'SF8J01', 'Donkey Kong Country Returns'],
    },
    {
        id: 'punch-out',
        title: 'Punch-Out!!',
        year: 2009,
        players: '1–2',
        genre: 'Sports',
        shelf: 'motion',
        controls: 'motion',
        blurb: 'One boxer, a coach on the second remote, and a phone that should move like a jab.',
        playNote: 'Jab by punching the phone forward. A and B throw punches if you would rather press.',
        palette: ['#f2efe6', '#111111', '#d4a017'],
        motif: 'burst',
        fileHint: 'Punch-Out!!.wbfs',
        aliases: ['R7PE01', 'R7PP01', 'R7PJ01', 'Punch-Out', 'Punch Out'],
    },
];

function normalize(value) {
    return String(value)
        .toLowerCase()
        .replace(/['’.]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function findGame(gameId) {
    return GAMES.find((game) => game.id === gameId) || null;
}

function romRoots(rootDir) {
    const roots = [];
    if (process.env.ROM_DIR) roots.push(process.env.ROM_DIR);
    roots.push(path.join(rootDir, 'roms'));
    if (process.env.ROM_PATH) roots.push(path.dirname(process.env.ROM_PATH));
    roots.push(rootDir);
    return [...new Set(roots)];
}

function collectFiles(rootDir) {
    const files = [];
    for (const dir of romRoots(rootDir)) {
        if (!dir || !fs.existsSync(dir)) continue;
        let stat;
        try {
            stat = fs.statSync(dir);
        } catch {
            continue;
        }
        if (!stat.isDirectory()) continue;
        let entries = [];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            continue;
        }
        for (const name of entries) {
            const ext = path.extname(name).toLowerCase();
            if (!EXTENSIONS.has(ext)) continue;
            files.push(path.join(dir, name));
        }
    }
    return files;
}

function aliasHits(stem, alias) {
    const a = normalize(alias);
    if (!a) return false;
    if (stem === a) return true;
    if (!a.includes(' ') && a.length >= 6 && stem.replace(/\s/g, '').includes(a)) return true;
    if (a.includes(' ') && stem.startsWith(a + ' ')) return true;
    return false;
}

function longerAliasOwns(stem, alias, gameId) {
    const length = normalize(alias).length;
    return GAMES.some((other) => {
        if (other.id === gameId) return false;
        return other.aliases.some((otherAlias) => {
            return normalize(otherAlias).length > length && aliasHits(stem, otherAlias);
        });
    });
}

function resolveRomPath(gameId, rootDir) {
    const game = findGame(gameId);
    if (!game) return null;

    let best = null;
    let bestLen = -1;
    for (const file of collectFiles(rootDir)) {
        const stem = normalize(path.basename(file, path.extname(file)));
        for (const alias of game.aliases) {
            if (!aliasHits(stem, alias)) continue;
            if (longerAliasOwns(stem, alias, game.id)) continue;
            const len = normalize(alias).length;
            if (len > bestLen) {
                best = file;
                bestLen = len;
            }
        }
    }
    if (best) return best;

    if (game.id === 'wii-sports') {
        if (process.env.ROM_PATH && fs.existsSync(process.env.ROM_PATH)) return process.env.ROM_PATH;
        const legacy = path.join(rootDir, 'game.wbfs');
        if (fs.existsSync(legacy)) return legacy;
    }
    return null;
}

function listGames(rootDir) {
    return GAMES.map((game) => ({
        id: game.id,
        title: game.title,
        year: game.year,
        players: game.players,
        genre: game.genre,
        shelf: game.shelf,
        controls: game.controls,
        blurb: game.blurb,
        playNote: game.playNote,
        palette: game.palette,
        motif: game.motif,
        fileHint: game.fileHint,
        installed: Boolean(resolveRomPath(game.id, rootDir)),
    }));
}

module.exports = {
    GAMES,
    findGame,
    resolveRomPath,
    listGames,
};
