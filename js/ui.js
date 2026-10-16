// --- UI, CONTROLS, LEADERBOARD, & EVENTS ---

const HUD_SETTINGS_KEY = 'agesOfConflictHudSettings';
const MOBILE_HUD_SETTINGS_KEY = 'agesOfConflictMobileHudSettings';
const SHORTCUTS_KEY = 'agesOfConflictShortcuts';
const MOBILE_HUD_QUERY = '(max-width: 760px)';
const HUD_POSITIONS = {
    'top-left': { left: '1vw', top: '1vh', transform: 'none' },
    'top-center': { left: '50%', top: '1vh', transform: 'translateX(-50%)' },
    'top-right': { right: '1vw', top: '1vh', transform: 'none' },
    'middle-left': { left: '1vw', top: '50%', transform: 'translateY(-50%)' },
    'middle-right': { right: '1vw', top: '50%', transform: 'translateY(-50%)' },
    'bottom-left': { left: '1vw', bottom: '1vh', transform: 'none' },
    'bottom-center': { left: '50%', bottom: '1vh', transform: 'translateX(-50%)' },
    'bottom-right': { right: '1vw', bottom: '1vh', transform: 'none' }
};
const DEFAULT_HUD_SETTINGS = {
    'turn-controls-panel': { position: 'top-center', width: 25, height: 8, font: 95, buttons: 125 },
    'selected-nation-details': { position: 'top-center', width: 57, height: 24, font: 105, buttons: 90 },
    'leaderboard-modal': { position: 'top-left', width: 22, height: 85, font: 100, buttons: 100 },
    'nation-panel': {
        position: 'bottom-center',
        width: 92,
        height: 35,
        font: 105,
        buttons: 90
    },
    'speed-controls-panel': { position: 'top-center', width: 8, height: 8, font: 85, buttons: 105 }
};
const DEFAULT_MOBILE_HUD_SETTINGS = {
    'turn-controls-panel': { position: 'top-center', width: 16, height: 10, font: 70, buttons: 70 },
    'selected-nation-details': { position: 'top-center', width: 63, height: 28, font: 75, buttons: 70 },
    'leaderboard-modal': { position: 'top-left', width: 15, height: 15, font: 70, buttons: 70 },
    'nation-panel': { position: 'bottom-center', width: 100, height: 23, font: 70, buttons: 70 },
    'speed-controls-panel': { position: 'top-center', width: 8, height: 5, font: 70, buttons: 70 }
};
const DEFAULT_SHORTCUTS = {
    war: 'W',
    peace: 'H',
    'recruit-attack': '1',
    'recruit-defend': '2',
    'recruit-balanced': '3',
    leaderboard: 'L',
    'play-pause': 'Space',
    speed: ']'
};
const TUTORIAL_COMPLETED_KEY = 'agesOfConflictTutorialCompleted';
const TUTORIAL_STEPS = [
    {
        title: 'Choose and inspect a nation',
        copy: 'Before a campaign begins, click a colored nation to inspect it and press Play as Nation. During a game, clicking another country opens its intelligence and diplomatic actions.',
        tip: 'A new campaign starts paused and begins with a short protected peace period after you take command.'
    },
    {
        title: 'Read your command panel',
        copy: 'The panel shows your treasury, yearly net income, land, cities, army, military strength, personality, and current year. Gold pays for troops, cities, and upgrades.',
        tip: 'Income from land and cities is reduced by army upkeep and city maintenance.'
    },
    {
        title: 'Set a comfortable pace',
        copy: 'Use Pause and Play to control the simulation. The default 1x pace is the former slower 0.5x setting. Open Speed for 2x or 5x when you want to move through years faster.',
        tip: 'The game continues simulating while it runs, so pause whenever you want time to plan.'
    },
    {
        title: 'Grow your economy and borders',
        copy: 'Build cities on your own land to increase income, then upgrade them for a stronger local boost. Expansion Off leaves land growth to the other nations; turn it on when you want your nation to claim nearby territory automatically.',
        tip: 'City placement requires enough gold and open space from other cities.'
    },
    {
        title: 'Recruit troops and sail',
        copy: 'Set minimums for attack, defense, and balanced troops in the Auto Army Manager, or recruit manually below it. Boats carry troops to colonies and enemy coasts. Send carracks to clear enemy carracks and boats before landing.',
        tip: 'Carracks cost $100,000 and $500 per year to maintain. Enemy carracks can repel boats until their fleet is cleared.'
    },
    {
        title: 'Choose friends and rivals',
        copy: 'Select another nation to request an alliance, join an eligible alliance, send or request gold, declare war, or offer a peace treaty with a payment. Other nations make their own diplomatic decisions.',
        tip: 'An active peace treaty prevents renewed fighting for a limited time.'
    },
    {
        title: 'Aim for domination',
        copy: 'Win by controlling at least 75% of the world’s land. If your nation is destroyed, you are defeated, but you can still watch the simulation continue.',
        tip: 'Use the leaderboard and map views to compare territory, alliances, income, armies, and cities.'
    }
];
const hudFontBases = new WeakMap();
const hudButtonBases = new WeakMap();
const desktopHudSettings = loadStoredSettings(HUD_SETTINGS_KEY, DEFAULT_HUD_SETTINGS);
const mobileHudSettings = loadStoredSettings(MOBILE_HUD_SETTINGS_KEY, DEFAULT_MOBILE_HUD_SETTINGS);
const mobileHudMedia = window.matchMedia(MOBILE_HUD_QUERY);
let hudSettings = mobileHudMedia.matches ? mobileHudSettings : desktopHudSettings;
let gameShortcuts = loadStoredSettings(SHORTCUTS_KEY, DEFAULT_SHORTCUTS);
let tutorialStepIndex = 0;
let tutorialResumeAfterClose = false;
let tutorialResumeSpeed = 1;
let tutorialCompletedThisSession = false;
let displayedPlayerOutcome = null;

function renderTutorialStep() {
    const step = TUTORIAL_STEPS[tutorialStepIndex];
    document.getElementById('tutorial-step-count').textContent = `Step ${tutorialStepIndex + 1} of ${TUTORIAL_STEPS.length}`;
    document.getElementById('tutorial-progress-fill').style.width = `${((tutorialStepIndex + 1) / TUTORIAL_STEPS.length) * 100}%`;
    document.getElementById('tutorial-step-title').textContent = step.title;
    document.getElementById('tutorial-copy').textContent = step.copy;
    document.getElementById('tutorial-tip').textContent = step.tip;
    document.getElementById('tutorial-back').disabled = tutorialStepIndex === 0;
    document.getElementById('tutorial-next').textContent = tutorialStepIndex === TUTORIAL_STEPS.length - 1 ? 'Finish' : 'Next';
}

function openTutorial(resumeGameOnClose = false) {
    tutorialStepIndex = 0;
    tutorialResumeAfterClose = resumeGameOnClose && gameStarted && !playerOutcome && simSpeed > 0;
    tutorialResumeSpeed = simSpeed > 0 ? simSpeed : lastRunningSpeed;
    renderTutorialStep();
    document.getElementById('tutorial-overlay').hidden = false;
    if (tutorialResumeAfterClose) setSpeed(0);
}

function closeTutorial() {
    document.getElementById('tutorial-overlay').hidden = true;
    tutorialCompletedThisSession = true;
    try {
        localStorage.setItem(TUTORIAL_COMPLETED_KEY, 'true');
    } catch (error) {
        console.warn('Could not save tutorial completion.', error);
    }
    if (tutorialResumeAfterClose && gameStarted && !playerOutcome) setSpeed(tutorialResumeSpeed);
    tutorialResumeAfterClose = false;
}

function shouldShowFirstRunTutorial() {
    if (tutorialCompletedThisSession) return false;
    try {
        return localStorage.getItem(TUTORIAL_COMPLETED_KEY) !== 'true';
    } catch (error) {
        return true;
    }
}

function resetPlayerOutcomeScreen() {
    displayedPlayerOutcome = null;
    document.getElementById('outcome-overlay').hidden = true;
}

function updatePlayerOutcomeScreen() {
    if (!playerOutcome || displayedPlayerOutcome === playerOutcome) return;
    displayedPlayerOutcome = playerOutcome;

    const victory = playerOutcome === 'victory' || playerOutcome === 'alliance-victory';
    const allianceVictory = playerOutcome === 'alliance-victory';
    const card = document.querySelector('.outcome-card');
    const nation = nations[playerNationId];
    const totalLand = Object.values(nations).reduce((sum, item) => sum + item.tiles.length, 0);
    const alliance = allianceVictory && nation?.allianceId != null ? alliances[nation.allianceId] : null;
    const controlledLand = alliance
        ? [...new Set(alliance.members)].map(id => nations[id]).filter(Boolean).reduce((sum, member) => sum + member.tiles.length, 0)
        : nation?.tiles.length || 0;
    const landShare = totalLand > 0 ? Math.round((controlledLand / totalLand) * 100) : 0;
    card.dataset.outcome = playerOutcome;
    document.getElementById('outcome-eyebrow').textContent = victory ? 'Campaign Complete' : 'Campaign Ended';
    document.getElementById('outcome-title').textContent = allianceVictory ? 'Alliance Victory' : victory ? 'Domination Victory' : 'Defeat';
    document.getElementById('outcome-emblem').textContent = victory ? '★' : '×';
    document.getElementById('outcome-description').textContent = victory
        ? allianceVictory
            ? `${alliance?.name || 'Your alliance'} controls ${landShare}% of the world’s land and has won the campaign.`
            : `${playerNationName || nation?.name || 'Your nation'} controls ${landShare}% of the world’s land and has won the campaign.`
        : `${playerNationName || 'Your nation'} has fallen in year ${year}. You can continue watching the other nations compete.`;
    document.getElementById('outcome-continue').textContent = victory ? 'Continue Watching' : 'Watch the World Continue';

    const stats = document.getElementById('outcome-stats');
    stats.replaceChildren();
    const addStat = (label, value) => {
        const item = document.createElement('div');
        item.className = 'outcome-stat';
        const caption = document.createElement('span');
        caption.textContent = label;
        const number = document.createElement('strong');
        number.textContent = value;
        item.append(caption, number);
        stats.appendChild(item);
    };
    addStat('Year', String(year));
    addStat('Land control', `${landShare}%`);
    if (nation) addStat('Cities', String(cities.filter(city => city.nationId === nation.id).length));

    document.getElementById('outcome-overlay').hidden = false;
    if (simSpeed > 0) setSpeed(0);
}

function loadStoredSettings(storageKey, defaults) {
    const merged = JSON.parse(JSON.stringify(defaults));
    try {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return merged;
        const parsed = JSON.parse(saved);
        Object.keys(defaults).forEach(key => {
            if (typeof defaults[key] === 'object') {
                if (!parsed[key] || typeof parsed[key] !== 'object') return;
                Object.keys(defaults[key]).forEach(setting => {
                    const value = parsed[key][setting];
                    if (setting === 'position') {
                        if (Object.hasOwn(HUD_POSITIONS, value)) merged[key][setting] = value;
                    } else if (Number.isFinite(Number(value))) {
                        merged[key][setting] = Number(value);
                    }
                });
            } else if (typeof parsed[key] === 'string' && parsed[key].length <= 24) {
                merged[key] = parsed[key];
            }
        });
    } catch (error) {
        console.warn(`Could not load saved ${storageKey}; using defaults.`, error);
    }
    return merged;
}

function saveStoredSettings(storageKey, settings) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch (error) {
        console.error(`Could not save ${storageKey}.`, error);
    }
}

function applyHudTypography(panel, settings) {
    const fontScale = settings.font / 100;
    const buttonScale = settings.buttons / 100;
    const descendants = [panel, ...panel.querySelectorAll('*')];
    descendants.forEach(element => {
        if (!hudFontBases.has(element)) {
            const fontSize = parseFloat(getComputedStyle(element).fontSize);
            if (Number.isFinite(fontSize)) hudFontBases.set(element, fontSize);
        }
        const baseFontSize = hudFontBases.get(element);
        if (baseFontSize) element.style.fontSize = `${baseFontSize * fontScale}px`;

        if (element.classList.contains('btn')) {
            if (!hudButtonBases.has(element)) {
                const style = getComputedStyle(element);
                hudButtonBases.set(element, {
                    paddingTop: parseFloat(style.paddingTop),
                    paddingRight: parseFloat(style.paddingRight),
                    paddingBottom: parseFloat(style.paddingBottom),
                    paddingLeft: parseFloat(style.paddingLeft),
                    minHeight: parseFloat(style.minHeight)
                });
            }
            const base = hudButtonBases.get(element);
            element.style.padding = `${base.paddingTop * buttonScale}px ${base.paddingRight * buttonScale}px ${base.paddingBottom * buttonScale}px ${base.paddingLeft * buttonScale}px`;
            if (Number.isFinite(base.minHeight) && base.minHeight > 0) {
                element.style.minHeight = `${base.minHeight * buttonScale}px`;
            }
        }
    });
}

function applyHudPanelSettings(panelId) {
    const panel = document.getElementById(panelId);
    const settings = hudSettings[panelId];
    if (!panel || !settings) return;

    const position = HUD_POSITIONS[settings.position] || HUD_POSITIONS['top-left'];
    const activeDefaults = mobileHudMedia.matches ? DEFAULT_MOBILE_HUD_SETTINGS : DEFAULT_HUD_SETTINGS;
    const useSelectionPanelHeight = panelId === 'nation-panel' && !mobileHudMedia.matches &&
        playerNationId === null &&
        settings.height === activeDefaults['nation-panel'].height;
    panel.style.position = 'absolute';
    panel.style.width = `${settings.width}vw`;
    panel.style.height = panelId === 'leaderboard-modal' || useSelectionPanelHeight ||
        (panelId === 'nation-panel' && panel.classList.contains('is-minimized'))
        ? 'auto'
        : `${settings.height}vh`;
    panel.style.maxWidth = '100vw';
    panel.style.maxHeight = panelId === 'leaderboard-modal' ? `${settings.height}vh` : '96vh';
    panel.style.left = position.left || 'auto';
    panel.style.right = position.right || 'auto';
    panel.style.top = position.top || 'auto';
    panel.style.bottom = position.bottom || 'auto';
    panel.style.transform = position.transform;
    panel.style.overflow = ['turn-controls-panel', 'speed-controls-panel'].includes(panelId)
        ? 'visible'
        : 'auto';
    applyHudTypography(panel, settings);
}

function applyAllHudSettings() {
    Object.keys(DEFAULT_HUD_SETTINGS).forEach(applyHudPanelSettings);
}

function initializeSettings() {
    const positionOptions = Object.keys(HUD_POSITIONS).map(position =>
        `<option value="${position}">${position.replace('-', ' ').replace(/\b\w/g, letter => letter.toUpperCase())}</option>`
    ).join('');

    function syncPanelSettingInputs() {
        hudSettings = mobileHudMedia.matches ? mobileHudSettings : desktopHudSettings;
        document.querySelectorAll('.panel-setting').forEach(fieldset => {
            const settings = hudSettings[fieldset.dataset.hudPanel];
            fieldset.querySelectorAll('[data-setting]').forEach(input => {
                const setting = input.dataset.setting;
                input.value = settings[setting];
                updateSettingOutput(fieldset, setting, settings[setting]);
            });
        });
        applyAllHudSettings();
    }

    document.querySelectorAll('.panel-setting').forEach(fieldset => {
        const panelId = fieldset.dataset.hudPanel;
        const settings = hudSettings[panelId];
        fieldset.querySelector('[data-setting="position"]').innerHTML = positionOptions;
        fieldset.querySelectorAll('[data-setting]').forEach(input => {
            const setting = input.dataset.setting;
            input.value = settings[setting];
            updateSettingOutput(fieldset, setting, settings[setting]);
            input.addEventListener('input', () => {
                settings[setting] = setting === 'position' ? input.value : Number(input.value);
                updateSettingOutput(fieldset, setting, settings[setting]);
                applyHudPanelSettings(panelId);
                saveStoredSettings(mobileHudMedia.matches ? MOBILE_HUD_SETTINGS_KEY : HUD_SETTINGS_KEY, hudSettings);
            });
        });
    });

    document.querySelectorAll('.shortcut-input').forEach(input => {
        input.value = gameShortcuts[input.dataset.shortcut] || '';
        input.addEventListener('keydown', event => {
            event.preventDefault();
            const shortcut = formatShortcut(event);
            if (!shortcut) return;
            gameShortcuts[input.dataset.shortcut] = shortcut;
            input.value = shortcut;
            saveStoredSettings(SHORTCUTS_KEY, gameShortcuts);
        });
    });

    Object.keys(DEFAULT_HUD_SETTINGS).forEach(panelId => {
        const panel = document.getElementById(panelId);
        if (panel) {
            new MutationObserver(() => applyHudTypography(panel, hudSettings[panelId]))
                .observe(panel, { childList: true, subtree: true });
        }
    });
    mobileHudMedia.addEventListener?.('change', syncPanelSettingInputs);
    if (!mobileHudMedia.addEventListener) mobileHudMedia.addListener(syncPanelSettingInputs);
    applyAllHudSettings();
}

function updateSettingOutput(fieldset, setting, value) {
    const output = fieldset.querySelector(`[data-value="${setting}"]`);
    if (!output) return;
    output.value = setting === 'position' ? value : setting === 'font' || setting === 'buttons' ? `${value}%` :
        setting === 'height' ? `${value}vh` : `${value}vw`;
    output.textContent = output.value;
}

function formatShortcut(event) {
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null;
    const parts = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey && event.key.length !== 1) parts.push('Shift');
    const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
    parts.push(key);
    return parts.join('+');
}

function logNews(text) {
    const ticker = document.getElementById('news-ticker');
    if (!ticker) return;
    const entry = document.createElement('div');
    entry.className = 'news-entry';
    entry.innerHTML = `<span class="year">Year ${year}:</span> ${text}`;
    ticker.appendChild(entry);
}

function getNationArmySize(nation) {
    return nation.army.attack + nation.army.defend + nation.army.balanced;
}

function setPlayerActionMessage(message) {
    document.getElementById('player-action-message').textContent = message;
}

function resetNationControlPanel() {
    document.getElementById('nation-selection-hint').hidden = false;
    document.getElementById('selected-nation-details').hidden = true;
    document.getElementById('player-controls').hidden = true;
    document.getElementById('target-nation-actions').hidden = true;
    selectedCityId = null;
    setPlayerActionMessage('');
}

function updateRecruitmentEstimate() {
    const input = document.getElementById('recruit-quantity');
    const requested = Number(input.value);
    const estimate = document.getElementById('recruit-cost-estimate');
    const player = nations[playerNationId];
    if (!Number.isSafeInteger(requested) || requested < 1) {
        estimate.textContent = 'Enter a whole number greater than zero.';
        return;
    }
    const attackCost = getRecruitmentCost('attack', requested);
    const balancedCost = getRecruitmentCost('balanced', requested);
    estimate.textContent = `Cost for ${requested.toLocaleString()} troops: Attack/Defense $${attackCost.toLocaleString()} · Balanced $${balancedCost.toLocaleString()}.`;
}

function updateNationPanel() {
    const player = nations[playerNationId];
    const selectionHint = document.getElementById('nation-selection-hint');
    const selected = nations[selectedNationId];
    const details = document.getElementById('selected-nation-details');
    const controls = document.getElementById('player-controls');
    const targetActions = document.getElementById('target-nation-actions');
    const nationPopout = document.getElementById('selected-nation-details');
    const showSelectedDetails = Boolean(selected) && (!player || selected.id !== player.id);

    selectionHint.hidden = Boolean(selected) || Boolean(player) || Boolean(playerOutcome);
    details.hidden = !showSelectedDetails;
    controls.hidden = !player && !playerOutcome;
    nationPopout.hidden = !showSelectedDetails;

    if (showSelectedDetails) {
        document.getElementById('selected-nation-name').textContent = selected.name;
        document.getElementById('selected-nation-land').textContent = String(selected.tiles.length);
        document.getElementById('selected-nation-cities').textContent = String(cities.filter(city => city.nationId === selected.id).length);
        document.getElementById('selected-nation-gold').textContent = `$${Math.floor(selected.gold)}`;
        document.getElementById('selected-nation-army').textContent = String(getNationArmySize(selected));
        document.getElementById('selected-nation-income').textContent = `${selected.netIncome >= 0 ? '+' : ''}${selected.netIncome}/yr`;
        document.getElementById('selected-nation-archetype').textContent = selected.archetype.type;
    }
    const relationCard = document.getElementById('selected-nation-relation');
    relationCard.hidden = !showSelectedDetails || !player;
    if (!relationCard.hidden) {
        const turnsAtWar = player.wars[selected.id] ?? selected.wars?.[player.id];
        const peaceRemaining = player.peaceTreaties[selected.id] || selected.peaceTreaties?.[player.id] || 0;
        relationCard.classList.toggle('at-war', turnsAtWar !== undefined);
        relationCard.classList.toggle('at-peace', turnsAtWar === undefined && peaceRemaining > 0);
        relationCard.textContent = turnsAtWar !== undefined
            ? `⚔️ At war · ${turnsAtWar} years`
            : peaceRemaining > 0
                ? `🕊️ Peace treaty active · ${peaceRemaining} years remaining`
                : '⚖️ No active treaty';
    }

    const playButton = document.getElementById('play-as-nation');
    playButton.hidden = playerNationId !== null || Boolean(playerOutcome);
    if (player) {
        const outcomeLabel = playerOutcome ? ` — ${playerOutcome.toUpperCase()}` : '';
        document.getElementById('player-nation-name').textContent = `👑 ${player.name}${outcomeLabel}`;
        document.getElementById('player-gold').textContent = `$${Math.floor(player.gold)}`;
        document.getElementById('player-income').textContent = `${player.netIncome >= 0 ? '+' : ''}${player.netIncome}/yr`;
        document.getElementById('player-land').textContent = String(player.tiles.length);
        document.getElementById('player-cities').textContent = String(cities.filter(city => city.nationId === player.id).length);
        document.getElementById('player-army').textContent = String(getNationArmySize(player));
        document.getElementById('player-strength').textContent = `${calculateNationPower(player).toFixed(1)}x`;
        document.getElementById('player-archetype').textContent = player.archetype.type;
        document.getElementById('player-year').textContent = String(year);
        const emergency = document.getElementById('economy-emergency');
        const runway = player.netIncome < 0 ? player.gold / Math.abs(player.netIncome) : Infinity;
        const atRisk = player.netIncome < 0 && (runway <= 10 || player.gold < Math.max(1000, player.maintenance * 2));
        emergency.hidden = !atRisk;
        emergency.textContent = atRisk
            ? `⚠ EMERGENCY: Your treasury is shrinking by $${Math.abs(player.netIncome).toLocaleString()}/year. At this rate, funds may run out in about ${Math.max(0, Math.ceil(runway))} years.`
            : '';
        document.querySelectorAll('.auto-army-target').forEach(input => {
            input.disabled = !player || Boolean(playerOutcome);
            if (document.activeElement !== input) {
                const target = player.autoArmyTargets?.[input.dataset.troopTarget];
                input.value = Number.isSafeInteger(target) ? target : '';
            }
        });
    } else if (playerOutcome) {
        document.getElementById('player-nation-name').textContent = `👑 ${playerNationName || 'Your nation'} — ${playerOutcome.toUpperCase()}`;
        ['player-gold', 'player-income', 'player-land', 'player-cities', 'player-army', 'player-strength', 'player-archetype'].forEach(id => {
            document.getElementById(id).textContent = '—';
        });
        document.getElementById('player-year').textContent = String(year);
    }

    const hasPlayer = Boolean(player) && !playerOutcome;
    const cityButton = document.getElementById('build-city-button');
    const expandButton = document.getElementById('expand-territory-button');
    const hasBuildTile = hasPlayer && player.gold >= getNewCityCost(player) &&
        player.tiles.some(tile => canBuildCityAt(player, tile.x, tile.y));
    cityButton.textContent = player ? `Build City · $${getNewCityCost(player)}` : 'Build City';
    cityButton.disabled = !hasBuildTile;
    expandButton.disabled = !hasPlayer;
    expandButton.textContent = playerExpansionEnabled ? 'Expansion On' : 'Expansion Off';
    expandButton.setAttribute('aria-pressed', String(playerExpansionEnabled));
    expandButton.classList.toggle('active', playerExpansionEnabled);
    cityButton.classList.toggle('active', placementMode === 'city');
    const sendBoatButton = document.getElementById('send-boat-button');
    const navalStatus = document.getElementById('naval-status');
    const activePlayerShips = player ? ships.filter(ship => ship.nationId === player.id).length : 0;
    const activePlayerCarracks = player ? carrackShips.filter(ship => ship.nationId === player.id).length : 0;
    const playerHasPatrollingCarrack = player && carrackShips.some(ship => ship.nationId === player.id && ship.patrol);
    const playerHasCoast = player && player.tiles.some(tile => window.isCoastal(tile.x, tile.y));
    const playerCarracks = player ? player.carracks || 0 : 0;
    const remainingNavalCooldown = player && player.lastNavalLaunch
        ? Math.max(0, NAVAL_LAUNCH_COOLDOWN_TICKS - (year - player.lastNavalLaunch))
        : 0;
    sendBoatButton.disabled = !hasPlayer || !playerHasCoast ||
        player.army.attack + player.army.balanced < 8 ||
        activePlayerShips >= MAX_SHIPS_PER_NATION || remainingNavalCooldown > 0;
    sendBoatButton.textContent = placementMode === 'naval' ? 'Cancel Destination' : 'Send Boat';
    sendBoatButton.classList.toggle('active', placementMode === 'naval');
    navalStatus.textContent = placementMode === 'naval' ? 'Click your chosen destination on the map.' :
        !playerHasCoast ? 'No coastal territory for a launch.' :
        player && player.army.attack + player.army.balanced < 8 ? 'Requires 8 attack or balanced troops.' :
            activePlayerShips >= MAX_SHIPS_PER_NATION ? `${activePlayerShips}/${MAX_SHIPS_PER_NATION} boats already sailing.` :
                remainingNavalCooldown > 0 ? `Next launch available in ${remainingNavalCooldown} years.` :
                    'Boats carry troops; hostile coasts must be cleared of carracks first.';
    const buildCarrackButton = document.getElementById('build-carrack-button');
    buildCarrackButton.disabled = !hasPlayer || !playerHasCoast || player.gold < CARRACK_COST;
    document.getElementById('carrack-status').textContent = !playerHasCoast
        ? 'Carracks require a coastal territory.'
        : `${playerCarracks} carrack${playerCarracks === 1 ? '' : 's'} · annual maintenance $${(playerCarracks * CARRACK_MAINTENANCE).toLocaleString()}.`;
    const sendCarrackButton = document.getElementById('send-carrack-button');
    sendCarrackButton.disabled = !hasPlayer || !playerHasCoast || playerCarracks <= 0 ||
        (activePlayerCarracks >= MAX_SHIPS_PER_NATION && !playerHasPatrollingCarrack);
    sendCarrackButton.textContent = placementMode === 'carrack'
        ? 'Cancel Carrack Attack'
        : playerHasPatrollingCarrack ? 'Redirect Warship' : 'Send Carrack to Attack';
    sendCarrackButton.classList.toggle('active', placementMode === 'carrack');
    if (placementMode === 'carrack') {
        document.getElementById('carrack-status').textContent = 'Choose an enemy coast with carracks or boats to attack.';
    }
    const treatyList = document.getElementById('player-treaties');
    treatyList.replaceChildren();
    if (player) {
        const activeTreaties = Object.entries(player.peaceTreaties || {})
            .filter(([nationId, remaining]) => Number(remaining) > 0 && nations[nationId])
            .sort((a, b) => Number(a[1]) - Number(b[1]));
        if (activeTreaties.length === 0) {
            const empty = document.createElement('span');
            empty.className = 'treaty-empty';
            empty.textContent = 'No active treaties';
            treatyList.appendChild(empty);
        } else {
            activeTreaties.forEach(([nationId, remaining]) => {
                const treaty = document.createElement('div');
                treaty.className = 'treaty-entry';
                const name = document.createElement('strong');
                name.textContent = nations[nationId].name;
                const timer = document.createElement('span');
                timer.textContent = `${remaining} years`;
                treaty.append(name, timer);
                treatyList.appendChild(treaty);
            });
        }
    }
    const citySelect = document.getElementById('player-city-select');
    const previousCityId = selectedCityId || citySelect.value;
    const playerCities = player ? cities.filter(city => city.nationId === player.id) : [];
    citySelect.innerHTML = '<option value="">Select a city</option>' + playerCities.map(city =>
        `<option value="${city.id}">${city.name} · Level ${city.level}</option>`).join('');
    selectedCityId = playerCities.some(city => String(city.id) === String(previousCityId))
        ? String(previousCityId)
        : (playerCities[0] ? String(playerCities[0].id) : null);
    citySelect.value = selectedCityId || '';
    const upgradeCityButton = document.getElementById('upgrade-city-button');
    const autoCityUpgrader = document.getElementById('auto-city-upgrader');
    autoCityUpgrader.checked = Boolean(player?.autoCityUpgrader);
    autoCityUpgrader.disabled = !hasPlayer;
    const selectedCity = playerCities.find(city => String(city.id) === String(selectedCityId));
    const upgradeCost = selectedCity ? getCityUpgradeCost(selectedCity) : Infinity;
    upgradeCityButton.textContent = selectedCity
        ? selectedCity.level >= 100 ? `${selectedCity.name} · Max Level` : `Upgrade City · $${upgradeCost.toLocaleString()}`
        : 'Upgrade City';
    upgradeCityButton.disabled = !hasPlayer || !selectedCity || selectedCity.level >= 100 || player.gold < upgradeCost;
    const allianceMembership = document.getElementById('alliance-membership');
    const playerAlliance = player?.allianceId != null ? alliances[player.allianceId] : null;
    allianceMembership.hidden = !hasPlayer || !playerAlliance;
    document.getElementById('player-alliance-name').textContent = playerAlliance ? playerAlliance.name : '';
    updateRecruitmentEstimate();
    document.querySelectorAll('.recruit-button').forEach(button => {
        const type = button.dataset.troop;
        const requested = Number(document.getElementById('recruit-quantity').value);
        const affordableAmount = getAffordableRecruitmentAmount(player, type, requested);
        button.disabled = !hasPlayer || affordableAmount === 0;
        button.textContent = type === 'attack' ? `⚔️ Recruit ${affordableAmount.toLocaleString()} Attack` :
            type === 'defend' ? `🛡️ Recruit ${affordableAmount.toLocaleString()} Defense` :
                `⚖️ Recruit ${affordableAmount.toLocaleString()} Balanced`;
    });

    const isTarget = hasPlayer && showSelectedDetails;
    targetActions.hidden = !isTarget;
    if (isTarget) {
        const atWar = player.wars[selected.id] !== undefined || selected.wars?.[player.id] !== undefined;
        const sameAlliance = player.allianceId !== null && player.allianceId === selected.allianceId;
        const hasTruce = player.peaceTreaties[selected.id] > 0 || selected.peaceTreaties?.[player.id] > 0;
        const pendingPeaceOffer = peaceOffers.some(offer =>
            offer.proposerId === player.id && offer.recipientId === selected.id
        );
        const peacePayment = Number(document.getElementById('peace-payment-amount').value);
        const canOfferPeace = !sameAlliance && !hasTruce && Number.isSafeInteger(peacePayment) &&
            peacePayment > 0 && peacePayment <= player.gold && !pendingPeaceOffer;
        const warDuration = player.wars[selected.id] ?? selected.wars?.[player.id] ?? 0;
        const canRequestAlliance = !sameAlliance && selected.allianceId == null &&
            !atWar && selected.wars[player.id] === undefined &&
            (player.opinions?.[selected.id] ?? 50) >= 45 && (selected.opinions?.[player.id] ?? 50) >= 45;
        document.getElementById('target-nation-status').textContent =
            `${selected.name} · ${selected.tiles.length} land · ${getNationArmySize(selected)} troops · ` +
            (atWar ? `At war (${warDuration} years)` :
                hasTruce ? `Peace treaty (${player.peaceTreaties[selected.id] || selected.peaceTreaties?.[player.id]} years left)` :
                    sameAlliance ? 'Allied' : 'No active treaty');
        const allianceButton = document.getElementById('request-alliance-button');
        const joinAllianceButton = document.getElementById('join-alliance-button');
        const hasExistingAlliance = selected.allianceId != null && Boolean(alliances[selected.allianceId]);
        const canJoinAlliance = hasExistingAlliance && player.allianceId === null &&
            player.wars[selected.id] === undefined &&
            selected.wars[player.id] === undefined &&
            (player.opinions?.[selected.id] ?? 50) >= 45 &&
            (selected.opinions?.[player.id] ?? 50) >= 45;
        allianceButton.hidden = hasExistingAlliance && player.allianceId !== selected.allianceId;
        allianceButton.disabled = !canRequestAlliance;
        allianceButton.textContent = sameAlliance ? 'Allied' :
            selected.allianceId != null ? 'Nation Already Allied' :
                player.allianceId != null ? 'Invite to Alliance' : 'Request Alliance';
        joinAllianceButton.hidden = !hasExistingAlliance || sameAlliance;
        joinAllianceButton.disabled = !canJoinAlliance;
        joinAllianceButton.textContent = hasExistingAlliance
            ? `Join ${alliances[selected.allianceId].name}`
            : 'Join Alliance';
        const declareButton = document.getElementById('declare-war-button');
        declareButton.disabled = atWar || sameAlliance || hasTruce;
        declareButton.textContent = atWar ? 'At War' : 'Declare War';
        const peaceButton = document.getElementById('offer-peace-button');
        peaceButton.hidden = sameAlliance || hasTruce;
        peaceButton.disabled = !canOfferPeace;
        peaceButton.textContent = atWar ? 'Offer Peace' : 'Offer Peace Treaty';
        document.getElementById('peace-payment-amount').disabled = sameAlliance || hasTruce || pendingPeaceOffer;
        if (pendingPeaceOffer) peaceButton.textContent = 'Peace Offer Pending';
        const samePlayerAlliance = sameAlliance;
        document.getElementById('donation-amount').disabled = !samePlayerAlliance;
        document.getElementById('send-donation-button').hidden = !samePlayerAlliance;
        document.getElementById('request-donation-button').hidden = !samePlayerAlliance;
        document.getElementById('send-donation-button').disabled =
            !samePlayerAlliance || player.gold < Number(document.getElementById('donation-amount').value);
        document.getElementById('request-donation-button').disabled =
            !samePlayerAlliance || selected.gold < 40;
    } else {
        document.getElementById('join-alliance-button').hidden = true;
        document.getElementById('send-donation-button').hidden = true;
        document.getElementById('request-donation-button').hidden = true;
        document.getElementById('donation-amount').disabled = true;
        document.getElementById('offer-peace-button').hidden = true;
        document.getElementById('peace-payment-amount').disabled = true;
    }

    const incomingOffers = peaceOffers.filter(offer => offer.recipientId === playerNationId &&
        nations[offer.proposerId]);
    const offerList = document.getElementById('player-peace-requests');
    offerList.replaceChildren();
    incomingOffers.forEach(offer => {
        const card = document.createElement('div');
        card.className = 'peace-offer-card';
        const description = document.createElement('span');
        description.textContent = `${nations[offer.proposerId].name} requests ${offer.isWar ? 'an end to the war' : 'a peace treaty'} and offers $${offer.payment.toLocaleString()}.`;
        const actions = document.createElement('div');
        actions.className = 'btn-group';
        const accept = document.createElement('button');
        accept.className = 'btn btn-success';
        accept.textContent = 'Accept';
        accept.dataset.peaceOffer = offer.id;
        accept.dataset.peaceDecision = 'accept';
        const reject = document.createElement('button');
        reject.className = 'btn btn-danger';
        reject.textContent = 'Reject';
        reject.dataset.peaceOffer = offer.id;
        reject.dataset.peaceDecision = 'reject';
        actions.append(accept, reject);
        card.append(description, actions);
        offerList.appendChild(card);
    });
    offerList.hidden = incomingOffers.length === 0;
    updatePlayerOutcomeScreen();
}

function selectNation(nationId) {
    if (!nations[nationId]) return;
    selectedNationId = nationId;
    updateNationPanel();
}

function setNationPanelMinimized(minimized) {
    const panel = document.getElementById('nation-panel');
    const toggle = document.getElementById('nation-panel-toggle');
    panel.classList.toggle('is-minimized', minimized);
    applyHudPanelSettings('nation-panel');
    toggle.setAttribute('aria-expanded', String(!minimized));
    toggle.setAttribute('aria-label', minimized ? 'Expand nation controls' : 'Minimize nation controls');
    toggle.title = minimized ? 'Expand nation controls' : 'Minimize nation controls';
    toggle.textContent = minimized ? '+' : '−';
}

document.getElementById('nation-panel-toggle').addEventListener('click', () => {
    const panel = document.getElementById('nation-panel');
    setNationPanelMinimized(!panel.classList.contains('is-minimized'));
});

function playAsSelectedNation() {
    if (playerNationId !== null || playerOutcome || !nations[selectedNationId]) return;
    if (window.multiplayer?.connected && !window.multiplayer.isNationAvailable(selectedNationId)) {
        setPlayerActionMessage('A friend has already chosen this nation. Please select another.');
        return;
    }
    playerNationId = selectedNationId;
    window.multiplayer?.setNation(playerNationId);
    playerNationName = nations[playerNationId].name;
    playerExpansionEnabled = false;
    nations[playerNationId].playerExpansionEnabled = false;
    gameStarted = true;
    openingPeaceEndsAt = Date.now() + 30000;
    placementMode = null;
    applyHudPanelSettings('nation-panel');
    setPlayerActionMessage(`You are now playing as ${playerNationName}.`);
    logNews(`👑 You are now playing as <b>${playerNationName}</b>.`);
    logNews('🕊️ A 30-second peace period protects every nation from war.');
    document.getElementById('main-menu-overlay').hidden = true;
    document.getElementById('menu-resume').hidden = false;
    document.getElementById('menu-new-game').hidden = false;
    document.getElementById('menu-close').hidden = false;
    setSpeed(lastRunningSpeed);
    updateNationPanel();
    render();
    if (shouldShowFirstRunTutorial()) openTutorial(true);
}

function togglePlacementMode(mode) {
    if (playerNationId === null || playerOutcome) return;
    placementMode = placementMode === mode ? null : mode;
    if (placementMode === 'city') {
        setPlayerActionMessage(`Build City costs $${getNewCityCost(nations[playerNationId])}. Click a highlighted tile to place it.`);
    } else if (placementMode === 'naval') {
        setPlayerActionMessage('Choose an unclaimed coast or a coast held by an enemy you are at war with. Boats carry 8 troops and are repelled by defending carracks.');
    } else if (placementMode === 'carrack') {
        setPlayerActionMessage('Choose an enemy coast to send your carrack after its fleet.');
    } else {
        setPlayerActionMessage('');
    }
    updateNationPanel();
    render();
}

function actOnMapTile(x, y) {
    const player = nations[playerNationId];
    if (placementMode && player && !playerOutcome) {
        if (placementMode === 'carrack') {
            const mission = launchCarrackAttack(player.id, x, y);
            if (!mission) {
                setPlayerActionMessage('No carrack can reach that enemy coast, or the enemy has no carracks or boats there.');
                return;
            }
            placementMode = null;
            setPlayerActionMessage(`Carrack dispatched to clear ${nations[mission.enemyId]?.name || 'the enemy'} fleet. Send boats after the coast is cleared.`);
            updateNationPanel();
            updateLeaderboard();
            render();
            return;
        }
        if (placementMode === 'naval') {
            const expedition = launchNavalExpedition(player.id, x, y);
            if (!expedition) {
                const defender = nations[territory[y]?.[x]];
                setPlayerActionMessage(defender?.carracks > 0
                    ? `Enemy carracks still defend ${defender.name}. Send your carrack to clear them before landing a boat.`
                    : 'No sea route reaches that destination. Choose a reachable unclaimed coast or an enemy you are at war with.');
                return;
            }
            placementMode = null;
            const targetOwner = territory[y][x];
            const targetName = expedition.type === 'invasion' && nations[targetOwner]
                ? nations[targetOwner].name
                : 'uncharted land';
            setPlayerActionMessage(`Boat dispatched toward ${targetName} with 8 troops.`);
            updateNationPanel();
            updateLeaderboard();
            render();
            return;
        }
        if (placementMode === 'city') {
            const cost = getNewCityCost(player);
            if (!canBuildCityAt(player, x, y) || player.gold < cost) {
                setPlayerActionMessage(`That tile is not valid for a city, or you need $${cost}.`);
                return;
            }
            player.gold -= cost;
            buildCity(player.id, x, y);
            recalculateCityMultipliers();
            updateNationEconomy(player, calculateNationTileIncome(player));
            setPlayerActionMessage(`City built for $${cost}.`);
        }
        if (placementMode === 'city') placementMode = null;
        updateNationPanel();
        render();
        updateLeaderboard();
        return;
    }

    const ownerId = territory[y][x];
    if (ownerId !== null && nations[ownerId]) {
        selectNation(ownerId);
    } else if (playerNationId === null && !playerOutcome && grid[y][x] === 1) {
        spawnRandomNation(x, y);
        if (territory[y][x] !== null) selectNation(territory[y][x]);
        updateLeaderboard();
    }
}

function focusNation(nationId) {
    nationId = parseInt(nationId, 10);
    let n = nations[nationId];
    if (!n || !n.tiles || n.tiles.length === 0) return;

    let sumX = 0, sumY = 0;
    n.tiles.forEach(t => { sumX += t.x; sumY += t.y; });
    let avgX = sumX / n.tiles.length;
    let avgY = sumY / n.tiles.length;

    const baseCellW = CANVAS.width / WIDTH;
    const baseCellH = CANVAS.height / HEIGHT;

    let targetPixelX = avgX * baseCellW + baseCellW / 2;
    let targetPixelY = avgY * baseCellH + baseCellH / 2;

    const focusedZoom = Math.max(1.8, Math.min(5.0, 40 / Math.sqrt(n.tiles.length)));

    targetZoom = focusedZoom;
    targetPanX = (CANVAS.width / 2) - (targetPixelX * targetZoom);
    targetPanY = (CANVAS.height / 2) - (targetPixelY * targetZoom);

    selectNation(nationId);
    animateCamera();
}

function setMapMode(mode) {
    mapMode = mode;
    document.getElementById('btn-view-nations').classList.toggle('active', mode === 'nations');
    document.getElementById('btn-view-alliances').classList.toggle('active', mode === 'alliances');
    document.getElementById('btn-view-income').classList.toggle('active', mode === 'income');
    render();
}

function toggleLeaderboard() {
    let modal = document.getElementById('leaderboard-modal');
    modal.style.display = (modal.style.display === 'none' || modal.style.display === '') ? 'flex' : 'none';
    if (modal.style.display === 'flex') updateLeaderboard();
    const toggle = document.getElementById('leaderboard-toggle');
    if (toggle) toggle.textContent = modal.style.display === 'flex' ? '✕ Close Leaderboard' : '🏆 Leaderboard';
}

function setLeaderboardSort(category) {
    lbSortCategory = category;
    ['tiles', 'gold', 'military', 'income', 'cities'].forEach(cat => {
        document.getElementById(`lb-sort-${cat}`).classList.toggle('active', cat === category);
    });
    updateLeaderboard();
}

function updateLeaderboard() {
    const list = document.getElementById('modal-leaderboard-list');
    const count = document.getElementById('lb-nation-count');
    if (!list) return;
    
    let sorted = Object.values(nations);

    if (lbSortCategory === 'tiles') {
        sorted.sort((a, b) => b.tiles.length - a.tiles.length);
    } else if (lbSortCategory === 'gold') {
        sorted.sort((a, b) => b.gold - a.gold);
    } else if (lbSortCategory === 'military') {
        sorted.sort((a, b) => (b.army.attack + b.army.defend + b.army.balanced) - (a.army.attack + a.army.defend + a.army.balanced));
    } else if (lbSortCategory === 'income') {
        sorted.sort((a, b) => b.netIncome - a.netIncome);
    } else if (lbSortCategory === 'cities') {
        sorted.sort((a, b) => {
            let cA = cities.filter(c => c.nationId === a.id).length;
            let cB = cities.filter(c => c.nationId === b.id).length;
            return cB - cA;
        });
    }

    count.textContent = sorted.length;

    list.innerHTML = sorted.map((n, idx) => {
        let myCitiesCount = cities.filter(c => c.nationId === n.id).length;
        let totalArmy = n.army.attack + n.army.defend + n.army.balanced;

        let statDisplay = "";
        if (lbSortCategory === 'tiles') statDisplay = `${n.tiles.length} tiles`;
        if (lbSortCategory === 'gold') statDisplay = `$${n.gold}`;
        if (lbSortCategory === 'military') statDisplay = `${totalArmy} troops`;
        if (lbSortCategory === 'income') statDisplay = `${n.netIncome >= 0 ? '+' : ''}${n.netIncome}/yr`;
        if (lbSortCategory === 'cities') statDisplay = `${myCitiesCount} cities`;

        return `
            <div class="lb-card" style="border-left-color: ${n.color}">
                <span class="lb-rank">#${idx + 1}</span>
                <div class="lb-info">
                    <div class="lb-name" data-id="${n.id}" title="Click to zoom to ${n.name}">
                        ${n.name}
                        <span style="font-size:0.65rem;">${n.archetype.icon}</span>
                    </div>
                    <span style="font-size:0.65rem; color: var(--text-muted);">
                        💰$${n.gold} • 👥${(n.population/1000).toFixed(1)}k
                    </span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
                    <span class="lb-val">${statDisplay}</span>
                </div>
            </div>
        `;
    }).join('');
}

// Delegated click handler for Leaderboard
document.getElementById('modal-leaderboard-list').addEventListener('click', (e) => {
    let nameEl = e.target.closest('.lb-name');
    if (nameEl && nameEl.dataset.id) {
        focusNation(nameEl.dataset.id);
        return;
    }
});

// Draggable Modal Logic
const dragModal = document.getElementById('leaderboard-modal');
const dragHandle = document.getElementById('modal-drag-handle');
let isModalDragging = false;
let modalOffsetX = 0, modalOffsetY = 0;

dragHandle.addEventListener('mousedown', (e) => {
    isModalDragging = true;
    modalOffsetX = e.clientX - dragModal.offsetLeft;
    modalOffsetY = e.clientY - dragModal.offsetTop;
});

window.addEventListener('mousemove', (e) => {
    if (isModalDragging) {
        dragModal.style.left = (e.clientX - modalOffsetX) + 'px';
        dragModal.style.top = (e.clientY - modalOffsetY) + 'px';
    }
});

window.addEventListener('mouseup', () => {
    isModalDragging = false;
});

// Pan & Zoom Control Handlers
function requestMapRender() {
    if (mapRenderFrame !== null) return;
    mapRenderFrame = requestAnimationFrame(() => {
        mapRenderFrame = null;
        render();
    });
}

function animateCamera(timestamp = performance.now(), previousTimestamp = timestamp) {
    if (cameraAnimationFrame !== null) return;
    let lastTimestamp = previousTimestamp;
    const step = currentTimestamp => {
        const elapsed = Math.max(1, currentTimestamp - lastTimestamp);
        lastTimestamp = currentTimestamp;
        const easing = 1 - Math.exp(-elapsed / 85);
        panX += (targetPanX - panX) * easing;
        panY += (targetPanY - panY) * easing;
        zoom += (targetZoom - zoom) * easing;

        const settled = Math.abs(targetPanX - panX) < 0.25 &&
            Math.abs(targetPanY - panY) < 0.25 &&
            Math.abs(targetZoom - zoom) < 0.001;
        if (settled) {
            panX = targetPanX;
            panY = targetPanY;
            zoom = targetZoom;
            cameraAnimationFrame = null;
        }
        render();
        if (!settled) cameraAnimationFrame = requestAnimationFrame(step);
    };
    cameraAnimationFrame = requestAnimationFrame(step);
}

function adjustZoom(factor) {
    const newZoom = Math.max(0.5, Math.min(8.0, targetZoom * factor));
    let centerX = CANVAS.width / 2;
    let centerY = CANVAS.height / 2;

    targetPanX = centerX - (centerX - targetPanX) * (newZoom / targetZoom);
    targetPanY = centerY - (centerY - targetPanY) * (newZoom / targetZoom);
    targetZoom = newZoom;
    animateCamera();
}

function resetCamera() {
    targetZoom = 1.0;
    targetPanX = 0;
    targetPanY = 0;
    animateCamera();
}

CANVAS.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = Math.exp(-e.deltaY * 0.001);
    const rect = CANVAS.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newZoom = Math.max(0.5, Math.min(8.0, targetZoom * zoomFactor));
    const mapX = (mouseX - targetPanX) / targetZoom;
    const mapY = (mouseY - targetPanY) / targetZoom;

    targetPanX = mouseX - mapX * newZoom;
    targetPanY = mouseY - mapY * newZoom;
    targetZoom = newZoom;
    animateCamera();
}, { passive: false });

const activeMapPointers = new Map();
let pinchStart = null;
let pointerDownPosition = null;

CANVAS.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    CANVAS.setPointerCapture(event.pointerId);
    const rect = CANVAS.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    activeMapPointers.set(event.pointerId, point);
    pointerDownPosition = point;
    hasDragged = false;
    if (activeMapPointers.size === 1) {
        if (cameraAnimationFrame !== null) cancelAnimationFrame(cameraAnimationFrame);
        cameraAnimationFrame = null;
        targetPanX = panX;
        targetPanY = panY;
        targetZoom = zoom;
        isDragging = true;
        dragStart = { x: point.x - panX, y: point.y - panY };
    } else if (activeMapPointers.size === 2) {
        isDragging = false;
        hasDragged = true;
        const [a, b] = activeMapPointers.values();
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        pinchStart = {
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            zoom: targetZoom,
            panX: targetPanX,
            panY: targetPanY,
            worldX: (center.x - targetPanX) / targetZoom,
            worldY: (center.y - targetPanY) / targetZoom
        };
    }
});

function mapTileFromPointer(event) {
    const rect = CANVAS.getBoundingClientRect();
    const baseCellW = CANVAS.width / WIDTH;
    const baseCellH = CANVAS.height / HEIGHT;
    const mapX = Math.floor((event.clientX - rect.left - panX) / (baseCellW * zoom));
    const mapY = Math.floor((event.clientY - rect.top - panY) / (baseCellH * zoom));
    return mapX >= 0 && mapX < WIDTH && mapY >= 0 && mapY < HEIGHT ? { x: mapX, y: mapY } : null;
}

CANVAS.addEventListener('pointermove', e => {
    if (!activeMapPointers.has(e.pointerId)) return;
    e.preventDefault();
    const rect = CANVAS.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    activeMapPointers.set(e.pointerId, point);
    if (activeMapPointers.size >= 2 && pinchStart) {
        const [a, b] = activeMapPointers.values();
        const centerX = (a.x + b.x) / 2;
        const centerY = (a.y + b.y) / 2;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        targetZoom = Math.max(0.5, Math.min(8, pinchStart.zoom * distance / Math.max(1, pinchStart.distance)));
        targetPanX = centerX - pinchStart.worldX * targetZoom;
        targetPanY = centerY - pinchStart.worldY * targetZoom;
        zoom = targetZoom;
        panX = targetPanX;
        panY = targetPanY;
        requestMapRender();
    } else if (isDragging) {
        const pointerX = point.x;
        const pointerY = point.y;
        let dx = pointerX - panX - dragStart.x;
        let dy = pointerY - panY - dragStart.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged = true;

        panX = pointerX - dragStart.x;
        panY = pointerY - dragStart.y;
        targetPanX = panX;
        targetPanY = panY;
        requestMapRender();
    }
});

function finishMapPointer(e) {
    const point = activeMapPointers.get(e.pointerId);
    if (!point) return;
    const wasSingleTap = activeMapPointers.size === 1 && !hasDragged &&
        (!pointerDownPosition || Math.hypot(point.x - pointerDownPosition.x, point.y - pointerDownPosition.y) < 8);
    if (wasSingleTap) {
        const tile = mapTileFromPointer(e);
        if (tile) actOnMapTile(tile.x, tile.y);
    }
    activeMapPointers.delete(e.pointerId);
    pinchStart = null;
    pointerDownPosition = null;
    isDragging = false;
}
CANVAS.addEventListener('pointerup', finishMapPointer);
CANVAS.addEventListener('pointercancel', finishMapPointer);

document.getElementById('play-as-nation').addEventListener('click', playAsSelectedNation);
document.getElementById('build-city-button').addEventListener('click', () => togglePlacementMode('city'));
document.getElementById('expand-territory-button').addEventListener('click', () => {
    if (playerNationId === null || playerOutcome) return;
    playerExpansionEnabled = !playerExpansionEnabled;
    if (nations[playerNationId]) nations[playerNationId].playerExpansionEnabled = playerExpansionEnabled;
    setPlayerActionMessage(playerExpansionEnabled
        ? 'Expansion enabled. Your nation will claim territory automatically each year.'
        : 'Expansion paused. Your nation will stop claiming new territory.');
    updateNationPanel();
    render();
});
document.getElementById('send-boat-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    if (!player || playerOutcome) return;
    if (placementMode === 'naval') {
        placementMode = null;
        setPlayerActionMessage('');
    } else {
        placementMode = 'naval';
        setPlayerActionMessage('Choose an unclaimed coast or an enemy coast you are at war with. Defending carracks repel boats.');
    }
    updateNationPanel();
    render();
});
document.getElementById('send-carrack-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    if (!player || playerOutcome) return;
    if (placementMode === 'carrack') {
        placementMode = null;
        setPlayerActionMessage('');
    } else {
        placementMode = 'carrack';
        setPlayerActionMessage('Choose an enemy coast to send your carrack after its fleet.');
    }
    updateNationPanel();
    render();
});
document.getElementById('build-carrack-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    if (!player || playerOutcome) return;
    if (buildCarrack(player)) {
        setPlayerActionMessage(`Carrack built for $${CARRACK_COST.toLocaleString()}. It costs $${CARRACK_MAINTENANCE.toLocaleString()} per year to maintain.`);
        updateNationPanel();
        updateLeaderboard();
    } else {
        setPlayerActionMessage(`A carrack costs $${CARRACK_COST.toLocaleString()} and requires coastal territory.`);
    }
});
document.querySelectorAll('.recruit-button').forEach(button => {
    button.addEventListener('click', () => {
        const player = nations[playerNationId];
        if (!player || playerOutcome) return;
        const requested = Number(document.getElementById('recruit-quantity').value);
        const amount = getAffordableRecruitmentAmount(player, button.dataset.troop, requested);
        if (amount > 0 && recruitTroops(player, button.dataset.troop, amount)) {
            updateNationEconomy(player, calculateNationTileIncome(player));
            setPlayerActionMessage(`Recruited ${amount.toLocaleString()} ${button.dataset.troop} troops for $${getRecruitmentCost(button.dataset.troop, amount).toLocaleString()}.`);
            updateNationPanel();
            updateLeaderboard();
        } else if (amount === 0) {
            setPlayerActionMessage('You do not have enough gold to recruit troops.');
        }
    });
});
document.getElementById('recruit-quantity').addEventListener('input', updateNationPanel);
document.querySelectorAll('.auto-army-target').forEach(input => {
    input.addEventListener('change', () => {
        const player = nations[playerNationId];
        if (!player || playerOutcome) return;
        player.autoArmyTargets = player.autoArmyTargets || {};
        const value = input.value === '' ? null : Number(input.value);
        if (value === null) delete player.autoArmyTargets[input.dataset.troopTarget];
        else if (Number.isSafeInteger(value) && value >= 0) player.autoArmyTargets[input.dataset.troopTarget] = value;
        else input.value = player.autoArmyTargets[input.dataset.troopTarget] ?? '';
        updateNationPanel();
    });
});
document.getElementById('player-city-select').addEventListener('change', event => {
    selectedCityId = event.target.value || null;
    updateNationPanel();
});
document.getElementById('auto-city-upgrader').addEventListener('change', event => {
    const player = nations[playerNationId];
    if (!player || playerOutcome) return;
    player.autoCityUpgrader = event.target.checked;
    setPlayerActionMessage(player.autoCityUpgrader
        ? 'Auto city upgrades enabled. The lowest-level city will upgrade when affordable.'
        : 'Auto city upgrades disabled.');
    updateNationPanel();
});
document.getElementById('upgrade-city-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const city = cities.find(item => String(item.id) === String(selectedCityId));
    if (!player || !city || playerOutcome) return;
    const cost = getCityUpgradeCost(city);
    if (upgradeCity(player, city, true)) {
        setPlayerActionMessage(`${city.name} upgraded to level ${city.level} for $${cost}.`);
        updateNationPanel();
        updateLeaderboard();
    } else {
        setPlayerActionMessage(`Cannot upgrade this city. It costs $${cost}; your treasury has $${Math.floor(player.gold)}.`);
    }
});
document.getElementById('declare-war-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const target = nations[selectedNationId];
    if (!player || !target || playerOutcome || player.id === target.id) return;
    if (!window.confirm(`Declare war on ${target.name}?`)) return;
    declareWar(player.id, target.id);
    updateNationPanel();
});
document.getElementById('request-alliance-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const target = nations[selectedNationId];
    if (!player || !target || playerOutcome) return;
    if (requestAlliance(player.id, target.id)) {
        setPlayerActionMessage(`${target.name} joined your alliance.`);
    } else {
        setPlayerActionMessage(`${target.name} declined the alliance request. Better relations may be needed.`);
    }
    updateNationPanel();
    updateLeaderboard();
    render();
});
document.getElementById('join-alliance-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const target = nations[selectedNationId];
    if (!player || !target || playerOutcome) return;
    if (joinExistingAlliance(player.id, target.id)) {
        setPlayerActionMessage(`Joined the ${alliances[player.allianceId].name}.`);
    } else {
        setPlayerActionMessage('You cannot join this alliance right now. Check relations, wars, and existing membership.');
    }
    updateNationPanel();
    updateLeaderboard();
    render();
});
document.getElementById('leave-alliance-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    if (!player || playerOutcome) return;
    if (leaveAlliance(player.id)) {
        setPlayerActionMessage('You left your alliance. The alliance truce with former members has ended.');
        updateNationPanel();
        updateLeaderboard();
    }
});
document.getElementById('send-donation-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const target = nations[selectedNationId];
    const amount = Number(document.getElementById('donation-amount').value);
    if (!player || !target || playerOutcome) return;
    if (sendAllianceDonation(player.id, target.id, amount)) {
        setPlayerActionMessage(`Donated $${amount.toLocaleString()} to ${target.name}.`);
    } else {
        setPlayerActionMessage('Donation not sent. Choose an ally and a valid amount within your available gold.');
    }
    updateNationPanel();
    updateLeaderboard();
});
document.getElementById('request-donation-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const target = nations[selectedNationId];
    const amount = Number(document.getElementById('donation-amount').value);
    if (!player || !target || playerOutcome) return;
    const received = requestAllianceDonation(player.id, target.id, amount);
    setPlayerActionMessage(received > 0
        ? `${target.name} sent your nation $${received.toLocaleString()}.`
        : `${target.name} declined your request or cannot afford a donation.`);
    updateNationPanel();
    updateLeaderboard();
});
document.getElementById('donation-amount').addEventListener('input', updateNationPanel);
document.getElementById('offer-peace-button').addEventListener('click', () => {
    const player = nations[playerNationId];
    const target = nations[selectedNationId];
    const payment = Number(document.getElementById('peace-payment-amount').value);
    if (!player || !target || playerOutcome || !Number.isSafeInteger(payment) ||
        payment < 1 || payment > player.gold) return;
    const result = offerPeaceToAi(player.id, target.id, payment);
    if (result.status === 'accepted') {
        setPlayerActionMessage(`${target.name} accepted. Your nation paid $${payment.toLocaleString()} and a peace treaty is active.`);
    } else if (result.status === 'rejected') {
        setPlayerActionMessage(`${target.name} rejected your peace offer. No payment was made.`);
    } else if (result.status === 'pending') {
        setPlayerActionMessage(`${target.name} sent a peace offer. Choose accept or reject in your treaty panel.`);
    } else {
        setPlayerActionMessage('Peace offer not sent. Check your payment, treasury, and existing treaty status.');
    }
    updateNationPanel();
    updateLeaderboard();
    render();
});
document.getElementById('peace-payment-amount').addEventListener('input', updateNationPanel);
document.getElementById('player-peace-requests').addEventListener('click', event => {
    const button = event.target.closest('[data-peace-offer]');
    if (!button) return;
    const accepted = button.dataset.peaceDecision === 'accept';
    const offer = peaceOffers.find(item => item.id === button.dataset.peaceOffer);
    if (!offer) return;
    const proposer = nations[offer.proposerId];
    if (respondToPeaceOffer(offer.id, accepted)) {
        setPlayerActionMessage(accepted
            ? `Accepted peace. ${proposer?.name || 'The proposer'} paid $${offer.payment.toLocaleString()} and a treaty is active.`
            : `Rejected the peace offer from ${proposer?.name || 'the nation'}.`);
    } else {
        setPlayerActionMessage('Could not complete this peace offer. The proposer may no longer have enough gold.');
    }
    updateNationPanel();
    updateLeaderboard();
    render();
});

document.getElementById('leaderboard-toggle').addEventListener('click', () => {
    toggleLeaderboard();
});
document.getElementById('close-nation-popout').addEventListener('click', () => {
    selectedNationId = null;
    updateNationPanel();
});
function toggleToolbarDropdown(dropdownId, buttonId) {
    const dropdown = document.getElementById(dropdownId);
    dropdown.hidden = !dropdown.hidden;
    document.getElementById(buttonId).setAttribute('aria-expanded', String(!dropdown.hidden));
}

document.getElementById('speed-toggle').addEventListener('click', () => {
    toggleToolbarDropdown('speed-dropdown', 'speed-toggle');
    document.getElementById('map-view-dropdown').hidden = true;
    document.getElementById('map-view-toggle').setAttribute('aria-expanded', 'false');
});
document.getElementById('map-view-toggle').addEventListener('click', () => {
    toggleToolbarDropdown('map-view-dropdown', 'map-view-toggle');
    document.getElementById('speed-dropdown').hidden = true;
    document.getElementById('speed-toggle').setAttribute('aria-expanded', 'false');
});

function startNewGame() {
    resetPlayerOutcomeScreen();
    const menu = document.getElementById('main-menu-overlay');
    menu.hidden = true;
    gameStarted = false;
    setSpeed(0);
    lastRunningSpeed = 1;
    generatePresetMap(document.getElementById('mapPresetSelect').value);
    applyHudPanelSettings('nation-panel');
    document.getElementById('main-menu-title').textContent = 'Choose Your Nation';
    document.getElementById('main-menu-description').textContent =
        'The world is ready. Select a nation on the map, then press Play as Nation to begin the simulation.';
    document.getElementById('menu-choose-nation').hidden = false;
    document.getElementById('menu-resume').hidden = true;
    document.getElementById('menu-new-game').hidden = true;
    document.getElementById('menu-close').hidden = true;
    document.getElementById('main-menu-overlay').hidden = false;
}

function openMainMenu() {
    if (gameStarted) setSpeed(0);
    const hasPlayer = playerNationId !== null;
    document.getElementById('main-menu-title').textContent = hasPlayer ? 'Game Menu' : 'Choose Your Nation';
    document.getElementById('main-menu-description').textContent = hasPlayer
        ? 'Resume your current simulation or start a new world.'
        : 'Select a nation on the map, then press Play as Nation to begin the simulation.';
    document.getElementById('menu-choose-nation').hidden = hasPlayer;
    document.getElementById('menu-resume').hidden = !hasPlayer;
    document.getElementById('menu-resume').textContent = playerOutcome ? 'Continue Watching' : 'Resume Game';
    document.getElementById('menu-new-game').hidden = !hasPlayer;
    document.getElementById('menu-close').hidden = !hasPlayer;
    document.getElementById('main-menu-overlay').hidden = false;
}

document.getElementById('main-menu-button').addEventListener('click', openMainMenu);
document.getElementById('menu-choose-nation').addEventListener('click', () => {
    document.getElementById('main-menu-overlay').hidden = true;
});
document.getElementById('menu-resume').addEventListener('click', () => {
    document.getElementById('main-menu-overlay').hidden = true;
    if (gameStarted) setSpeed(lastRunningSpeed);
});
document.getElementById('menu-new-game').addEventListener('click', startNewGame);
document.getElementById('mapPresetSelect').addEventListener('change', event => {
    if (playerNationId === null && !gameStarted) generatePresetMap(event.target.value);
});
document.getElementById('menu-close').addEventListener('click', () => {
    document.getElementById('main-menu-overlay').hidden = true;
});
document.getElementById('menu-tutorial').addEventListener('click', () => openTutorial());
document.getElementById('tutorial-close').addEventListener('click', closeTutorial);
document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
document.getElementById('tutorial-back').addEventListener('click', () => {
    if (tutorialStepIndex === 0) return;
    tutorialStepIndex--;
    renderTutorialStep();
});
document.getElementById('tutorial-next').addEventListener('click', () => {
    if (tutorialStepIndex === TUTORIAL_STEPS.length - 1) {
        closeTutorial();
        return;
    }
    tutorialStepIndex++;
    renderTutorialStep();
});
document.getElementById('tutorial-overlay').addEventListener('click', event => {
    if (event.target.id === 'tutorial-overlay') closeTutorial();
});
document.getElementById('outcome-continue').addEventListener('click', () => {
    document.getElementById('outcome-overlay').hidden = true;
    if (gameStarted) setSpeed(lastRunningSpeed);
});
document.getElementById('outcome-menu').addEventListener('click', () => {
    document.getElementById('outcome-overlay').hidden = true;
    openMainMenu();
});
document.getElementById('outcome-new-game').addEventListener('click', startNewGame);

function openSettings() {
    document.getElementById('settings-overlay').hidden = false;
}

document.getElementById('settings-toggle').addEventListener('click', openSettings);
document.getElementById('settings-menu-button').addEventListener('click', openSettings);
document.getElementById('settings-close').addEventListener('click', closeSettings);
document.getElementById('settings-done').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', event => {
    if (event.target.id === 'settings-overlay') closeSettings();
});
document.getElementById('settings-reset').addEventListener('click', () => {
    const mobile = mobileHudMedia.matches;
    const defaults = mobile ? DEFAULT_MOBILE_HUD_SETTINGS : DEFAULT_HUD_SETTINGS;
    hudSettings = mobile ? mobileHudSettings : desktopHudSettings;
    Object.assign(hudSettings, JSON.parse(JSON.stringify(defaults)));
    gameShortcuts = { ...DEFAULT_SHORTCUTS };
    document.querySelectorAll('.panel-setting').forEach(fieldset => {
        const settings = hudSettings[fieldset.dataset.hudPanel];
        fieldset.querySelectorAll('[data-setting]').forEach(input => {
            input.value = settings[input.dataset.setting];
            updateSettingOutput(fieldset, input.dataset.setting, settings[input.dataset.setting]);
        });
    });
    document.querySelectorAll('.shortcut-input').forEach(input => {
        input.value = gameShortcuts[input.dataset.shortcut];
    });
    saveStoredSettings(mobile ? MOBILE_HUD_SETTINGS_KEY : HUD_SETTINGS_KEY, hudSettings);
    saveStoredSettings(SHORTCUTS_KEY, gameShortcuts);
    applyAllHudSettings();
});

function closeSettings() {
    document.getElementById('settings-overlay').hidden = true;
}

function runShortcut(action) {
    if (action === 'war') document.getElementById('declare-war-button').click();
    else if (action === 'peace') document.getElementById('offer-peace-button').click();
    else if (action.startsWith('recruit-')) {
        const troopType = action.slice('recruit-'.length);
        const button = document.querySelector(`.recruit-button[data-troop="${troopType}"]`);
        if (button && !button.disabled) button.click();
    } else if (action === 'leaderboard') {
        toggleLeaderboard();
    } else if (action === 'play-pause') {
        setSpeed(simSpeed > 0 ? 0 : lastRunningSpeed);
    } else if (action === 'speed') {
        const speeds = [0, 1, 2, 5];
        const currentIndex = speeds.indexOf(simSpeed);
        setSpeed(speeds[(currentIndex + 1) % speeds.length]);
    }
}

window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('tutorial-overlay').hidden) {
        closeTutorial();
        return;
    }
    if (event.key === 'Escape' && placementMode) {
        placementMode = null;
        setPlayerActionMessage('');
        updateNationPanel();
        render();
        return;
    }
    const target = event.target;
    if (target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    const pressed = formatShortcut(event);
    if (!pressed) return;
    const shortcut = Object.entries(gameShortcuts).find(([, binding]) => binding === pressed);
    if (!shortcut) return;
    event.preventDefault();
    runShortcut(shortcut[0]);
});

// Speed Controls
function setSpeed(speed) {
    if (window.multiplayer?.connected && !window.multiplayer.isHost && !window.multiplayerApplying) {
        window.multiplayer.requestSpeed(speed);
        return;
    }
    if (speed > 0 && !gameStarted) speed = 0;
    if (speed > 0) lastRunningSpeed = speed;
    simSpeed = speed;
    clearInterval(tickInterval);
    
    ['btn-pause', 'btn-play', 'btn-1x', 'btn-2x', 'btn-5x'].forEach(id => {
        document.getElementById(id).classList.remove('active');
    });

    let btn = document.getElementById(speed === 0 ? 'btn-pause' : `btn-${speed}x`);
    if (btn) btn.classList.add('active');
    document.getElementById('btn-play').classList.toggle('active', speed > 0);
    document.getElementById('btn-pause').classList.toggle('active', speed === 0);
    document.getElementById('btn-play').disabled = !gameStarted || speed > 0;
    document.getElementById('btn-pause').disabled = speed === 0;
    
    if (speed > 0) {
        let intervalMs = 150 / speed;
        tickInterval = setInterval(tick, intervalMs);
    }

    updateEmpireOverview();
    updateNationPanel();
}

window.addEventListener('resize', render);

// Initial Game Startup
initializeSettings();
generatePresetMap('earth');
setSpeed(0);
document.getElementById('menu-choose-nation').hidden = false;
document.getElementById('menu-resume').hidden = true;
document.getElementById('menu-new-game').hidden = true;
document.getElementById('menu-close').hidden = true;
document.getElementById('leaderboard-modal').style.display = 'none';
updateNationPanel();
