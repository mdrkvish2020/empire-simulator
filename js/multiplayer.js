// Friend lobbies use the small WebSocket relay in server.js. The host owns
// simulation ticks; friends send their actions to the host and receive state.
(() => {
    const status = document.getElementById('lobby-status');
    const panel = document.getElementById('lobby-room');
    const codeDisplay = document.getElementById('lobby-code-display');
    const rosterElement = document.getElementById('lobby-roster');
    const joinCode = document.getElementById('join-lobby-code');
    const playerName = `Player ${Math.floor(100 + Math.random() * 900)}`;
    let socket = null;
    let currentCode = '';
    let myPlayerId = '';
    let host = false;
    let roster = [];
    let sendingState = false;
    let applying = false;
    let actionTimer = null;
    let snapshotTimer = null;
    let leavingLobby = false;
    let preLobbySpeed = 1;
    let pendingPlayerState = false;
    let pendingHostSnapshot = false;
    let incomingPlayerStates = Promise.resolve();

    function showStatus(message, isError = false) {
        status.textContent = message;
        status.classList.toggle('error-text', isError);
    }
    function send(message) {
        if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }
    function updateRoster(players) {
        roster = players || [];
        rosterElement.replaceChildren();
        roster.forEach(player => {
            const row = document.createElement('div');
            row.className = 'lobby-player';
            const name = document.createElement('span');
            name.textContent = player.name + (player.id === myPlayerId ? ' (you)' : '');
            const meta = document.createElement('small');
            meta.textContent = player.host ? 'Host' : player.nationId ? `Nation ${nations[player.nationId]?.name || player.nationId}` : 'Choosing a nation';
            row.append(name, meta);
            rosterElement.appendChild(row);
        });
    }
    function connect(type, code = '') {
        if (socket && socket.readyState <= WebSocket.OPEN) {
            showStatus('Leave the current lobby before joining another.', true);
            return;
        }
        if (!window.WebSocket) { showStatus('This browser does not support multiplayer.', true); return; }
        let endpoint;
        try {
            endpoint = new URL(window.MULTIPLAYER_SERVER_URL || location.origin);
            endpoint.protocol = endpoint.protocol === 'https:' || endpoint.protocol === 'wss:' ? 'wss:' : 'ws:';
            endpoint.pathname = '/ws';
            endpoint.search = '';
            endpoint.hash = '';
        } catch {
            showStatus('The multiplayer server address in js/multiplayer-config.js is invalid.', true);
            return;
        }
        socket = new WebSocket(endpoint.href);
        showStatus('Connecting to the lobby server…');
        socket.addEventListener('open', () => send({ type, code, name: playerName }));
        socket.addEventListener('message', event => {
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            if (message.type === 'joined') {
                currentCode = message.code;
                myPlayerId = message.playerId;
                host = Boolean(message.host);
                document.body.classList.add('multiplayer-active');
                preLobbySpeed = lastRunningSpeed || 1;
                lastRunningSpeed = 1;
                if (gameStarted) setSpeed(1);
                codeDisplay.textContent = currentCode;
                panel.hidden = false;
                showStatus(host ? 'Lobby ready. Share the code with your friends.' : 'You joined the lobby. Choose a nation once the host starts the world.');
                clearInterval(snapshotTimer);
                if (host) {
                    snapshotTimer = setInterval(sendHostSnapshot, 900);
                    sendHostSnapshot();
                }
            } else if (message.type === 'roster') {
                updateRoster(message.players);
            } else if (message.type === 'error') {
                showStatus(message.message, true);
            } else if (message.type === 'snapshot' && !host) {
                decodeGameSave(message.state).then(state => {
                    applying = true;
                    const wasStarted = gameStarted;
                    state.gameStarted = Boolean(state.gameStarted || wasStarted);
                    applyMultiplayerGameState(state, message.speed);
                    applying = false;
                    if (state.gameStarted && playerNationId === null) showStatus('Choose a nation on the map, then press Play as Nation.');
                }).catch(error => console.error('Could not apply the shared game state.', error));
            } else if (message.type === 'player-state' && host) {
                incomingPlayerStates = incomingPlayerStates.then(async () => {
                    const state = await decodeGameSave(message.state);
                    if (gameStarted) state.gameStarted = true;
                    state.lastRunningSpeed = window.multiplayer.fixedSpeed;
                    applying = true;
                    window.multiplayerApplyingRemoteState = true;
                    try { applyMultiplayerGameState(state, window.multiplayer.fixedSpeed); }
                    finally {
                        window.multiplayerApplyingRemoteState = false;
                        applying = false;
                    }
                }).catch(error => console.error('Could not apply a player action.', error));
            } else if (message.type === 'nation-claimed') {
                updateRoster(message.players);
            } else if (message.type === 'promoted-host') {
                host = true;
                lastRunningSpeed = window.multiplayer.fixedSpeed;
                if (gameStarted) setSpeed(window.multiplayer.fixedSpeed);
                clearInterval(snapshotTimer);
                snapshotTimer = setInterval(sendHostSnapshot, 900);
                showStatus('The previous host left. You are now hosting this lobby.');
            }
        });
        socket.addEventListener('close', () => {
            clearInterval(snapshotTimer);
            if (currentCode && !leavingLobby) showStatus('Lobby connection lost. Rejoin to continue playing.', true);
            currentCode = '';
            myPlayerId = '';
            host = false;
            panel.hidden = true;
            document.body.classList.remove('multiplayer-active');
            lastRunningSpeed = preLobbySpeed;
            if (gameStarted) setSpeed(lastRunningSpeed);
            leavingLobby = false;
        });
        socket.addEventListener('error', () => showStatus('Could not reach the lobby server. Start the app with npm start or check the hosted server.', true));
    }
    async function makeSharedState() {
        const state = createGameSaveState();
        delete state.playerNationId;
        delete state.playerNationName;
        delete state.playerOutcome;
        delete state.playerExpansionEnabled;
        state.tileMultiplier = tileMultiplier;
        return encodeGameSave(state);
    }
    async function sendHostSnapshot() {
        if (!host || socket?.readyState !== WebSocket.OPEN) return;
        if (sendingState) { pendingHostSnapshot = true; return; }
        sendingState = true;
        try { send({ type: 'snapshot', state: await makeSharedState(), speed: simSpeed }); }
        catch (error) { console.error('Could not share the current game.', error); }
        finally {
            sendingState = false;
            if (pendingHostSnapshot) {
                pendingHostSnapshot = false;
                queueMicrotask(sendHostSnapshot);
            }
        }
    }
    async function sendPlayerState() {
        if (host || applying || socket?.readyState !== WebSocket.OPEN) return;
        if (sendingState) { pendingPlayerState = true; return; }
        sendingState = true;
        try { send({ type: 'player-state', state: await makeSharedState(), nationId: playerNationId }); }
        catch (error) { console.error('Could not send your action to the host.', error); }
        finally {
            sendingState = false;
            if (pendingPlayerState) {
                pendingPlayerState = false;
                queuePlayerState();
            }
        }
    }
    function queuePlayerState() {
        if (!host && currentCode && !applying) {
            clearTimeout(actionTimer);
            actionTimer = setTimeout(sendPlayerState, 0);
        }
    }

    window.multiplayerApplying = false;
    window.multiplayerApplyingRemoteState = false;
    window.multiplayer = {
        fixedSpeed: 1,
        get connected() { return Boolean(currentCode); },
        get isHost() { return host; },
        queuePlayerState,
        publishHostState() { if (host) sendHostSnapshot(); },
        setNation(nationId) { send({ type: 'claim-nation', nationId }); },
        isNationAvailable(nationId) {
            return !roster.some(player => player.id !== myPlayerId && Number(player.nationId) === Number(nationId));
        },
        isHumanNation(nationId) { return roster.some(player => Number(player.nationId) === Number(nationId)); }
    };

    document.getElementById('create-lobby-button').addEventListener('click', () => connect('create'));
    document.getElementById('join-lobby-button').addEventListener('click', () => connect('join', joinCode.value.trim()));
    joinCode.addEventListener('input', () => { joinCode.value = joinCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); });
    joinCode.addEventListener('keydown', event => { if (event.key === 'Enter') connect('join', joinCode.value.trim()); });
    document.getElementById('leave-lobby-button').addEventListener('click', () => {
        leavingLobby = true;
        send({ type: 'leave' });
        socket?.close();
    });
    document.getElementById('copy-lobby-code').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(currentCode); showStatus('Lobby code copied. Send it to your friends.'); }
        catch { showStatus(`Share this lobby code with your friends: ${currentCode}`); }
    });

    // UI handlers run on the target before this document listener, so the
    // serialized state includes the action that was just taken.
    document.addEventListener('click', event => {
        if (event.target.closest('#lobby-room, .friend-lobby-controls, #settings-overlay')) return;
        queuePlayerState();
    });
    document.addEventListener('change', event => {
        if (event.target.closest('#lobby-room, .friend-lobby-controls, #settings-overlay')) return;
        queuePlayerState();
    });
    document.getElementById('mapCanvas').addEventListener('pointerup', queuePlayerState);
})();
