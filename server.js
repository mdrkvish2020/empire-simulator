const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const rooms = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(ROOT, requested);
    if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end('Not found');
        return;
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(response);
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 * 1024 });

function send(socket, data) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
}
function roster(room) {
    return [...room.players.values()].map(({ id, name, host, nationId }) => ({ id, name, host, nationId }));
}
function broadcastRoom(room, data) {
    for (const player of room.players.values()) send(player.socket, data);
}
function broadcastRoster(room) {
    broadcastRoom(room, { type: 'roster', code: room.code, players: roster(room) });
}
function makeCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do { code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(''); }
    while (rooms.has(code));
    return code;
}
function leaveRoom(socket) {
    const room = socket.room;
    if (!room) return;
    const leavingId = socket.playerId;
    room.players.delete(leavingId);
    socket.room = null;
    socket.playerId = null;
    if (room.players.size === 0) rooms.delete(room.code);
    else {
        if (room.hostId === leavingId) {
            room.hostId = room.players.keys().next().value;
            send(room.players.get(room.hostId).socket, { type: 'promoted-host' });
        }
        const host = room.players.get(room.hostId);
        if (host) host.host = true;
        broadcastRoster(room);
    }
}

wss.on('connection', socket => {
    socket.on('message', raw => {
        let message;
        try { message = JSON.parse(raw.toString()); } catch { send(socket, { type: 'error', message: 'Invalid lobby message.' }); return; }
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'create' || message.type === 'join') {
            if (socket.room) leaveRoom(socket);
            let room;
            let isHost = message.type === 'create';
            if (isHost) {
                const code = makeCode();
                room = { code, hostId: null, players: new Map(), snapshot: null };
                rooms.set(code, room);
            } else {
                const code = String(message.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                room = rooms.get(code);
                if (!room) { send(socket, { type: 'error', message: 'Lobby not found. Check the code and try again.' }); return; }
                if (room.players.size >= 6) { send(socket, { type: 'error', message: 'This lobby is full (6 players maximum).' }); return; }
            }
            const id = crypto.randomUUID();
            const player = { id, socket, name: String(message.name || 'Player').trim().slice(0, 20) || 'Player', host: isHost };
            room.players.set(id, player);
            socket.room = room;
            socket.playerId = id;
            if (isHost) room.hostId = id;
            send(socket, { type: 'joined', code: room.code, playerId: id, host: isHost });
            broadcastRoster(room);
            if (room.snapshot && !isHost) send(socket, { type: 'snapshot', state: room.snapshot.state, speed: room.snapshot.speed });
            return;
        }

        const room = socket.room;
        if (!room) { send(socket, { type: 'error', message: 'Join a lobby first.' }); return; }
        if (message.type === 'leave') { leaveRoom(socket); send(socket, { type: 'left' }); return; }
        if (message.type === 'snapshot' && socket.playerId === room.hostId && typeof message.state === 'string') {
            if (message.state.length > 7 * 1024 * 1024) { send(socket, { type: 'error', message: 'Shared game state is too large to relay.' }); return; }
            room.snapshot = { state: message.state, speed: Number(message.speed) || 0 };
            for (const player of room.players.values()) if (player.id !== socket.playerId) send(player.socket, { type: 'snapshot', ...room.snapshot });
            return;
        }
        if (message.type === 'player-state' && socket.playerId !== room.hostId && typeof message.state === 'string') {
            if (message.state.length > 7 * 1024 * 1024) { send(socket, { type: 'error', message: 'Your game update is too large to relay.' }); return; }
            const player = room.players.get(socket.playerId);
            const requestedNation = Number(message.nationId);
            if (Number.isSafeInteger(requestedNation) && requestedNation > 0) {
                const taken = [...room.players.values()].some(other => other.id !== socket.playerId && other.nationId === requestedNation);
                if (taken) { send(socket, { type: 'error', message: 'That nation is already claimed by a friend.' }); return; }
                player.nationId = requestedNation;
            }
            broadcastRoster(room);
            const host = room.players.get(room.hostId);
            if (host) send(host.socket, { type: 'player-state', playerId: socket.playerId, nationId: player.nationId || null, state: message.state });
            return;
        }
        if (message.type === 'claim-nation') {
            const nationId = Number(message.nationId);
            if (!Number.isSafeInteger(nationId) || nationId < 1) return;
            const taken = [...room.players.values()].some(player => player.id !== socket.playerId && player.nationId === nationId);
            if (taken) { send(socket, { type: 'error', message: 'That nation is already claimed by a friend.' }); return; }
            room.players.get(socket.playerId).nationId = nationId;
            broadcastRoster(room);
            return;
        }
    });
    socket.on('close', () => leaveRoom(socket));
});

server.listen(PORT, '0.0.0.0', () => console.log(`Empire Simulation is running on port ${PORT}`));
