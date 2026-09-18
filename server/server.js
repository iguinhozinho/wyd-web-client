import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.json');

let db = {};
if (fs.existsSync(DB_PATH)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
        console.error('Erro ao ler database.json:', e);
    }
}

function saveDb() {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

const SAVE_FIELDS = [
    'level', 'xp', 'gold', 'kills', 'hero', 'weapon', 'stats', 'statPoints',
    'inventory', 'equipment', 'quest'
];

function sanitizeState(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const clean = {};
    for (const field of SAVE_FIELDS) {
        if (Object.hasOwn(input, field)) clean[field] = input[field];
    }
    const encoded = JSON.stringify(clean);
    if (encoded.length > 100_000) return null;
    return clean;
}

const wss = new WebSocketServer({ port: 7556 });

console.log('Servidor rodando na porta 7556...');

wss.on('connection', (ws) => {
    let currentUser = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'login') {
                const { username } = data;
                if (!db[username]) {
                    db[username] = {
                        username,
                        level: 1,
                        xp: 0,
                        gold: 0,
                        kills: 0,
                        hero: 'transknight'
                    };
                    saveDb();
                }
                currentUser = username;
                ws.send(JSON.stringify({ type: 'sync', state: db[username] }));
                console.log(`User logged in: ${username}`);
            }

            if (data.type === 'attack') {
                if (!currentUser) return;
                const state = db[currentUser];
                // Lógica simples do servidor autoritativo
                state.kills++;
                state.xp += 25;
                state.gold += 10;
                
                if (state.xp >= state.level * 100) {
                    state.xp -= state.level * 100;
                    state.level++;
                }
                
                saveDb();
                ws.send(JSON.stringify({ type: 'sync', state }));
            }

            if (data.type === 'save') {
                if (!currentUser) return;
                const next = sanitizeState(data.state);
                if (!next) return;
                db[currentUser] = { ...db[currentUser], ...next, username: currentUser };
                saveDb();
                ws.send(JSON.stringify({ type: 'saved' }));
            }

            if (data.type === 'upgrade') {
                if (!currentUser) return;
                const state = db[currentUser];
                const cost = 100 * state.level;
                if (state.gold >= cost) {
                    state.gold -= cost;
                    state.level++; // Só simulando melhoria como nível
                    saveDb();
                    ws.send(JSON.stringify({ type: 'sync', state }));
                }
            }

            if (data.type === 'move') {
                if (!currentUser) return;
                // Opcional: servidor validar movimento, mas por agora, apenas aceitamos.
                // Na versão final, seria validado contra colisões no servidor.
            }

        } catch (e) {
            console.error('Invalid message:', e);
        }
    });

    ws.on('close', () => {
        if (currentUser) {
            console.log(`User logged out: ${currentUser}`);
            currentUser = null;
        }
    });
});
