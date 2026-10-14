const GAME_SAVES_INDEX_KEY = 'agesOfConflictGameSaves';
const GAME_SAVE_KEY_PREFIX = 'agesOfConflictGameSave:';
let activeGameSaveId = null;

function getGameSaveIndex() {
    const savedIndex = localStorage.getItem(GAME_SAVES_INDEX_KEY);
    if (!savedIndex) return [];
    const parsed = JSON.parse(savedIndex);
    if (!Array.isArray(parsed) || parsed.some(save =>
        !save || typeof save.id !== 'string' || typeof save.name !== 'string' ||
        !Number.isFinite(Date.parse(save.savedAt)))) {
        throw new Error('The saved-games list is invalid. Remove or repair the saved-games data in browser storage.');
    }
    return parsed;
}

function encodeBytesAsBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

function decodeBase64ToBytes(encoded) {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function encodeGameSave(state) {
    const serialized = JSON.stringify(state);
    const source = new TextEncoder().encode(serialized);
    if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
        const compressedStream = new Blob([source])
            .stream()
            .pipeThrough(new CompressionStream('gzip'));
        const compressed = new Uint8Array(await new Response(compressedStream).arrayBuffer());
        return `gzip:${encodeBytesAsBase64(compressed)}`;
    }
    return `json:${encodeBytesAsBase64(source)}`;
}

async function decodeGameSave(encoded) {
    const separator = encoded.indexOf(':');
    const format = encoded.slice(0, separator);
    const bytes = decodeBase64ToBytes(encoded.slice(separator + 1));
    let data;
    if (format === 'gzip') {
        if (typeof DecompressionStream !== 'function') {
            throw new Error('This browser cannot decompress this save. Open it in a newer browser.');
        }
        const decompressedStream = new Blob([bytes])
            .stream()
            .pipeThrough(new DecompressionStream('gzip'));
        data = await new Response(decompressedStream).arrayBuffer();
    } else if (format === 'json') {
        data = bytes;
    } else {
        throw new Error('This save uses an unsupported format.');
    }
    return JSON.parse(new TextDecoder().decode(data));
}

function createGameSaveState() {
    return {
        version: 1,
        grid,
        terrainType,
        popGrid,
        territory,
        cities,
        nations,
        alliances,
        ships,
        carrackShips,
        battleMarkers,
        peaceOffers,
        nextNationId,
        nextAllianceId,
        nextCityId,
        year,
        gameStarted,
        openingPeaceEndsAt,
        playerNationId,
        playerNationName,
        playerOutcome,
        playerExpansionEnabled,
        currentMinIncome,
        currentMaxIncome,
        mapMode,
        lbSortCategory,
        lastRunningSpeed,
        gameWon: Boolean(window.gameWon)
    };
}

function validateGameSave(state) {
    const isGrid = (value, validCell) => Array.isArray(value) &&
        value.length === HEIGHT &&
        value.every(row => Array.isArray(row) && row.length === WIDTH && row.every(validCell));
    if (!state || state.version !== 1 ||
        !isGrid(state.grid, cell => cell === 0 || cell === 1) ||
        !isGrid(state.terrainType, cell => cell === 1 || cell === 2 || cell === 3) ||
        !isGrid(state.popGrid, cell => Number.isSafeInteger(cell) && cell >= 0) ||
        !isGrid(state.territory, cell => cell === null || Number.isSafeInteger(cell)) ||
        !Array.isArray(state.cities) || !state.nations || typeof state.nations !== 'object' ||
        !state.alliances || typeof state.alliances !== 'object' ||
        !Array.isArray(state.ships) || !Array.isArray(state.peaceOffers) ||
        !Number.isSafeInteger(state.year) || !Number.isSafeInteger(state.playerNationId) ||
        !Number.isSafeInteger(state.nextNationId) || !Number.isSafeInteger(state.nextAllianceId) ||
        !Number.isSafeInteger(state.nextCityId) ||
        (state.openingPeaceEndsAt !== null && state.openingPeaceEndsAt !== undefined &&
            !Number.isFinite(state.openingPeaceEndsAt)) ||
        !Number.isFinite(state.currentMinIncome) || !Number.isFinite(state.currentMaxIncome) ||
        !Number.isFinite(state.lastRunningSpeed) || typeof state.playerNationName !== 'string' ||
        typeof state.gameStarted !== 'boolean' ||
        !['nations', 'alliances', 'income'].includes(state.mapMode) ||
        !['tiles', 'gold', 'military', 'income', 'cities'].includes(state.lbSortCategory) ||
        !state.gameStarted ||
        (!Object.hasOwn(state.nations, state.playerNationId) && !state.playerOutcome) ||
        state.cities.some(city => !city || !Number.isSafeInteger(city.x) || city.x < 0 || city.x >= WIDTH ||
            !Number.isSafeInteger(city.y) || city.y < 0 || city.y >= HEIGHT ||
            !Number.isSafeInteger(city.nationId))) {
        throw new Error('This save is damaged or incompatible with this game version.');
    }
}

function showSavedGamesStatus(message, isError = false) {
    const status = document.getElementById('saved-games-status');
    status.textContent = message;
    status.classList.toggle('error-text', isError);
}

function renderSavedGames() {
    const list = document.getElementById('saved-games-list');
    list.replaceChildren();
    try {
        const saves = getGameSaveIndex().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        if (saves.length === 0) {
            showSavedGamesStatus('No saved games yet.');
            return;
        }
        showSavedGamesStatus(`${saves.length} saved game${saves.length === 1 ? '' : 's'}.`);
        saves.forEach(save => {
            const row = document.createElement('div');
            row.className = 'saved-game-row';
            const info = document.createElement('div');
            info.className = 'saved-game-info';
            const name = document.createElement('div');
            name.className = 'saved-game-name';
            name.textContent = save.id === activeGameSaveId ? `${save.name} · Current` : save.name;
            const date = document.createElement('div');
            date.className = 'saved-game-date';
            date.textContent = `Year ${save.year} · ${new Date(save.savedAt).toLocaleString()}`;
            info.append(name, date);

            const actions = document.createElement('div');
            actions.className = 'saved-game-actions';
            const loadButton = document.createElement('button');
            loadButton.className = 'btn btn-success';
            loadButton.textContent = 'Load';
            loadButton.addEventListener('click', () => loadGameSave(save.id));
            const deleteButton = document.createElement('button');
            deleteButton.className = 'btn btn-danger';
            deleteButton.textContent = 'Delete';
            deleteButton.setAttribute('aria-label', `Delete saved game ${save.name}`);
            deleteButton.addEventListener('click', () => deleteGameSave(save.id));
            actions.append(loadButton, deleteButton);
            row.append(info, actions);
            list.appendChild(row);
        });
    } catch (error) {
        console.error('Could not read saved games.', error);
        showSavedGamesStatus(`Could not read saved games: ${error.message}`, true);
    }
}

async function saveCurrentGame() {
    if (playerNationId === null && !playerOutcome) {
        showSavedGamesStatus('Choose a nation and start a game before saving.', true);
        return;
    }
    const nameInput = document.getElementById('save-game-name');
    const saveButton = document.getElementById('save-game-button');
    saveButton.disabled = true;
    try {
        const saves = getGameSaveIndex();
        const activeRecord = saves.find(save => save.id === activeGameSaveId) || null;
        const id = activeRecord?.id || (typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const name = nameInput.value.trim() || activeRecord?.name || `${playerNationName || 'Empire'} · Year ${year}`;
        const savedAt = new Date().toISOString();
        const payload = await encodeGameSave(createGameSaveState());
        const oldPayload = activeRecord ? localStorage.getItem(`${GAME_SAVE_KEY_PREFIX}${id}`) : null;
        localStorage.setItem(`${GAME_SAVE_KEY_PREFIX}${id}`, payload);
        try {
            const updatedSaves = activeRecord
                ? saves.map(save => save.id === id ? { ...save, name, savedAt, year } : save)
                : [...saves, { id, name, savedAt, year }];
            localStorage.setItem(GAME_SAVES_INDEX_KEY, JSON.stringify(updatedSaves));
        } catch (error) {
            if (oldPayload !== null) localStorage.setItem(`${GAME_SAVE_KEY_PREFIX}${id}`, oldPayload);
            else localStorage.removeItem(`${GAME_SAVE_KEY_PREFIX}${id}`);
            throw error;
        }
        activeGameSaveId = id;
        nameInput.value = '';
        showSavedGamesStatus(`Saved “${name}” at year ${year}.`);
        renderSavedGames();
        showSavedGamesStatus(`Saved “${name}” at year ${year}.`);
    } catch (error) {
        console.error('Could not save the current game.', error);
        showSavedGamesStatus(`Could not save game: ${error.message}`, true);
    } finally {
        saveButton.disabled = false;
    }
}

async function loadGameSave(id) {
    try {
        const saves = getGameSaveIndex();
        const record = saves.find(save => save.id === id);
        if (!record) throw new Error('That saved game is no longer in the saved-games list.');
        const payload = localStorage.getItem(`${GAME_SAVE_KEY_PREFIX}${id}`);
        if (!payload) throw new Error('The saved game data could not be found in browser storage.');
        const state = await decodeGameSave(payload);
        validateGameSave(state);

        setSpeed(0);
        grid = state.grid;
        terrainType = state.terrainType;
        popGrid = state.popGrid;
        territory = state.territory;
        cities = state.cities;
        nations = state.nations;
        Object.values(nations).forEach(nation => {
            nation.carracks = Number.isSafeInteger(nation.carracks) && nation.carracks >= 0 ? nation.carracks : 0;
            nation.autoArmyTargets = nation.autoArmyTargets && typeof nation.autoArmyTargets === 'object'
                ? nation.autoArmyTargets
                : {};
            nation.autoCityUpgrader = Boolean(nation.autoCityUpgrader);
        });
        alliances = state.alliances;
        ships = state.ships;
        carrackShips = Array.isArray(state.carrackShips) ? state.carrackShips : [];
        battleMarkers = [];
        peaceOffers = state.peaceOffers;
        nextNationId = state.nextNationId;
        nextAllianceId = state.nextAllianceId;
        nextCityId = state.nextCityId;
        year = state.year;
        gameStarted = state.gameStarted;
        openingPeaceEndsAt = state.openingPeaceEndsAt ?? null;
        playerNationId = state.playerNationId;
        playerNationName = state.playerNationName;
        playerOutcome = state.playerOutcome;
        playerExpansionEnabled = state.playerExpansionEnabled;
        currentMinIncome = state.currentMinIncome;
        currentMaxIncome = state.currentMaxIncome;
        mapMode = state.mapMode;
        lbSortCategory = state.lbSortCategory;
        lastRunningSpeed = state.lastRunningSpeed;
        activeGameSaveId = id;
        window.gameWon = state.gameWon;
        selectedNationId = playerNationId;
        selectedCityId = null;
        placementMode = null;
        cityGrid = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(null));
        cities.forEach(city => { cityGrid[city.y][city.x] = city; });
        recalculateCityMultipliers();
        resetCamera();
        const newsTicker = document.getElementById('news-ticker');
        if (newsTicker) newsTicker.replaceChildren();
        logNews(`Loaded saved game: <b>${record.name}</b>.`);
        document.getElementById('main-menu-overlay').hidden = true;
        document.getElementById('leaderboard-modal').style.display = 'none';
        applyHudPanelSettings('nation-panel');
        resetPlayerOutcomeScreen();
        updateNationPanel();
        setMapMode(mapMode);
        setLeaderboardSort(lbSortCategory);
        // Refresh button state after gameStarted has been restored from the save.
        setSpeed(0);
        renderSavedGames();
    } catch (error) {
        console.error('Could not load saved game.', error);
        showSavedGamesStatus(`Could not load game: ${error.message}`, true);
    }
}

function deleteGameSave(id) {
    try {
        const saves = getGameSaveIndex();
        localStorage.removeItem(`${GAME_SAVE_KEY_PREFIX}${id}`);
        localStorage.setItem(GAME_SAVES_INDEX_KEY, JSON.stringify(saves.filter(save => save.id !== id)));
        if (activeGameSaveId === id) activeGameSaveId = null;
        renderSavedGames();
    } catch (error) {
        console.error('Could not delete saved game.', error);
        showSavedGamesStatus(`Could not delete game: ${error.message}`, true);
    }
}

document.getElementById('save-game-button').addEventListener('click', saveCurrentGame);
document.getElementById('save-game-name').addEventListener('keydown', event => {
    if (event.key === 'Enter') saveCurrentGame();
});
document.getElementById('main-menu-button').addEventListener('click', () => {
    document.getElementById('menu-save-controls').hidden = playerNationId === null && !playerOutcome;
    renderSavedGames();
});
document.getElementById('menu-new-game').addEventListener('click', () => {
    document.getElementById('menu-save-controls').hidden = true;
});
renderSavedGames();
