// --- MAIN SIMULATION ENGINE ---

// Global Parameters
window.simSpeed = 4;
window.VICTORY_THRESHOLD = 0.75;

// 1. Calculate Pure Power Score (Strictly Army + Conquered Tiles)
function calculateNationPower(nation) {
    if (!nation || !nation.tiles || nation.tiles.length === 0) return 1.0;

    let tileCount = nation.tiles.length;
    let armySize = typeof nation.army === 'object' 
        ? ((nation.army.attack || 0) + (nation.army.defend || 0) + (nation.army.balanced || 0))
        : (nation.army !== undefined ? nation.army : (tileCount * 1.5));

    let rawPower = (tileCount * 1.0) + (armySize * 1.0);
    let powerMultiplier = 1.0 + Math.log10(1 + (rawPower / 100));

    return Math.min(2.5, Math.max(1.0, powerMultiplier));
}

function getNewCityCost(nation) {
    const cityCount = cities.filter(city => city.nationId === nation.id).length;
    return Math.floor(400 + Math.pow(cityCount, 2) * 350);
}

function canBuildCityAt(nation, x, y) {
    if (!nation || grid[y]?.[x] !== 1 || territory[y]?.[x] !== nation.id || cityGrid[y]?.[x]) return false;
    return cities.every(city => Math.hypot(city.x - x, city.y - y) >= 30);
}

function recruitTroops(nation, type, requestedAmount = null) {
    if (!nation || !['attack', 'defend', 'balanced'].includes(type)) return false;
    const batchCost = type === 'balanced' ? 6 : 5;
    const batchSize = type === 'balanced' ? 2 : 3;
    const amount = requestedAmount === null ? batchSize : requestedAmount;
    if (!Number.isSafeInteger(amount) || amount < 1) return false;
    const cost = Math.ceil(amount / batchSize) * batchCost;
    if (nation.gold < cost) return false;
    nation.gold -= cost;
    nation.army[type] += amount;
    return true;
}

function getRecruitmentCost(type, amount) {
    if (!['attack', 'defend', 'balanced'].includes(type) || !Number.isSafeInteger(amount) || amount < 1) return Infinity;
    const batchCost = type === 'balanced' ? 6 : 5;
    const batchSize = type === 'balanced' ? 2 : 3;
    return Math.ceil(amount / batchSize) * batchCost;
}

function getAffordableRecruitmentAmount(nation, type, requestedAmount) {
    if (!nation || !Number.isSafeInteger(requestedAmount) || requestedAmount < 1) return 0;
    const batchCost = type === 'balanced' ? 6 : 5;
    const batchSize = type === 'balanced' ? 2 : 3;
    const affordableBatches = Math.floor(nation.gold / batchCost);
    return Math.min(requestedAmount, affordableBatches * batchSize);
}

function getCityUpgradeCost(city) {
    if (!city || city.level >= 100) return Infinity;
    const level = Math.max(1, city.level);
    const cost = 40 * Math.pow(300000 / 40, (level - 1) / 98);
    return Math.round(cost);
}

const CARRACK_COST = 100000;
const CARRACK_MAINTENANCE = 500;

function buildCarrack(nation) {
    if (!nation || nation.gold < CARRACK_COST ||
        !nation.tiles.some(tile => window.isCoastal(tile.x, tile.y))) return false;
    nation.gold -= CARRACK_COST;
    nation.carracks = (nation.carracks || 0) + 1;
    updateNationEconomy(nation, calculateNationTileIncome(nation));
    return true;
}

function updateAutoArmyManager(nation) {
    if (!nation || nation.id !== playerNationId) return;
    const targets = nation.autoArmyTargets || {};
    const reserve = Math.max(1000, Math.max(0, -nation.netIncome) * 3);
    for (const type of ['attack', 'defend', 'balanced']) {
        const target = Number(targets[type]);
        const current = nation.army[type] || 0;
        if (!Number.isSafeInteger(target) || target <= current) continue;
        const amount = target - current;
        const affordable = getAffordableRecruitmentAmount(nation, type, amount);
        if (affordable <= 0) continue;
        const cost = getRecruitmentCost(type, affordable);
        if (nation.gold - cost < reserve) continue;
        recruitTroops(nation, type, affordable);
    }
}

function upgradeCity(nation, city, refreshMultipliers = false) {
    if (!nation || !city || city.nationId !== nation.id || city.level >= 100) return false;
    const cost = getCityUpgradeCost(city);
    if (nation.gold < cost) return false;
    nation.gold -= cost;
    city.level++;
    if (refreshMultipliers) recalculateCityMultipliers();
    updateNationEconomy(nation, calculateNationTileIncome(nation));
    return true;
}

function updateNationEconomy(nation, totalIncome) {
    const threatenedSectorsCount = Object.keys(nation.threatMarkers || {}).length;
    const cityDirectIncome = cities.filter(city => city.nationId === nation.id)
        .reduce((sum, city) => sum + city.level * 4, 0);
    const cityMaintenance = cities.filter(city => city.nationId === nation.id).length * 0.2;
    const perimeterDefBonus = threatenedSectorsCount > 0 ? 0.012 : 0.005;
    const troopMaintenance = (nation.army.attack * 0.008) +
        (nation.army.defend * perimeterDefBonus) + (nation.army.balanced * 0.01);

    nation.grossIncome = Math.floor((totalIncome * 0.25) + cityDirectIncome);
    nation.maintenance = Math.floor(cityMaintenance + troopMaintenance + (nation.carracks || 0) * CARRACK_MAINTENANCE);
    nation.netIncome = nation.grossIncome - nation.maintenance;
}

function calculateNationTileIncome(nation) {
    return nation.tiles.reduce((sum, tile) =>
        sum + getBaseTerrainValue(tile.x, tile.y) * tileMultiplier[tile.y][tile.x], 0);
}

function getAiWarTargetScore(attacker, target, borderingNationIds = null) {
    if (!attacker || !target || attacker.id === target.id) return -Infinity;

    const relation = attacker.opinions && attacker.opinions[target.id] !== undefined ? attacker.opinions[target.id] : 50;
    const bordersTarget = borderingNationIds
        ? borderingNationIds.has(target.id)
        : getNeighboringNations(attacker.id).includes(target.id);
    const borderBonus = bordersTarget ? 18 : 0;
    const powerGap = calculateNationPower(target) * 18;
    const goldBias = target.gold > attacker.gold ? 10 : 0;
    const pressurePenalty = (attacker.tileCount || attacker.tiles.length) > 0 && target.tiles.length > attacker.tiles.length ? 12 : 0;

    return (100 - relation) * 0.9 + powerGap + borderBonus + goldBias - pressurePenalty;
}

function evaluateNationAI(n) {
    if (!n || !n.tiles) {
        return { posture: 'steady', aggression: 0.1, threat: 0, targetId: null, intent: 'expand' };
    }

    const borderingNationIds = new Set(getNeighboringNations(n.id));
    const neighbors = Array.from(borderingNationIds).map(id => nations[id]).filter(Boolean);
    const totalNeighborPower = neighbors.reduce((sum, enemy) => sum + calculateNationPower(enemy), 0);
    const avgRelation = neighbors.length > 0
        ? neighbors.reduce((sum, enemy) => sum + (n.opinions[enemy.id] || 50), 0) / neighbors.length
        : 50;
    const warCount = Object.keys(n.wars || {}).length;
    const threat = Math.max(0, totalNeighborPower - calculateNationPower(n) * 1.2);
    const resourcePressure = n.gold < 80 ? 0.08 : 0;
    const aggression = Math.min(1.7, Math.max(0.1,
        (n.archetype?.aggressiveness || 0.08) + warCount * 0.06 + Math.max(0, (50 - avgRelation) * 0.012) + resourcePressure
    ));

    let posture = 'balanced';
    if (warCount > 0 || threat > 0.8) posture = 'aggressive';
    else if (threat > 0.3 || avgRelation < 42) posture = 'defensive';
    else if (n.tiles.length > 180 || n.gold > 220) posture = 'expansionist';
    else if (n.gold < 90) posture = 'survival';

    const targets = Object.values(nations)
        .filter(other => other && other.id !== n.id && !n.wars[other.id] && (!n.peaceTreaties[other.id] || n.peaceTreaties[other.id] <= 0))
        .sort((a, b) =>
            getAiWarTargetScore(n, b, borderingNationIds) -
            getAiWarTargetScore(n, a, borderingNationIds));

    return {
        posture,
        aggression,
        threat: Math.round(threat * 100) / 100,
        targetId: targets.length > 0 ? targets[0].id : null,
        intent: posture === 'aggressive' ? 'pressure' : posture === 'expansionist' ? 'expand' : posture === 'defensive' ? 'fortify' : 'stabilize'
    };
}

function updateEmpireOverview() {
    const aiEl = document.getElementById('ai-overview');
    const warCountEl = document.getElementById('war-count');
    const topPowerEl = document.getElementById('top-power');
    const statusEl = document.getElementById('sim-status-pill');

    if (!aiEl && !warCountEl && !topPowerEl && !statusEl) return;

    const nationList = Object.values(nations || {});
    const totalWars = nationList.reduce((sum, n) => sum + Object.keys(n.wars || {}).length, 0);
    const topPower = nationList.length ? Math.max(...nationList.map(n => calculateNationPower(n))) : 1;

    let dominantPosture = 'Balanced';
    const postureCounts = {};

    nationList.forEach(n => {
        const posture = n.ai && n.ai.posture ? n.ai.posture : 'balanced';
        postureCounts[posture] = (postureCounts[posture] || 0) + 1;
    });

    const topPosture = Object.entries(postureCounts).sort((a, b) => b[1] - a[1])[0];
    if (topPosture) {
        dominantPosture = topPosture[0].charAt(0).toUpperCase() + topPosture[0].slice(1);
    }

    if (aiEl) aiEl.textContent = dominantPosture;
    if (warCountEl) warCountEl.textContent = String(totalWars);
    if (topPowerEl) topPowerEl.textContent = topPower.toFixed(1) + 'x';
    if (statusEl) {
        const isPaused = simSpeed === 0;
        const isOpeningPeace = typeof openingPeaceEndsAt === 'number' && Date.now() < openingPeaceEndsAt;
        statusEl.textContent = isPaused ? 'PAUSED' : (isOpeningPeace ? 'PEACE' : totalWars > 0 ? 'WAR' : 'LIVE');
        statusEl.style.background = isPaused ? 'rgba(245, 158, 11, 0.16)' : (isOpeningPeace ? 'rgba(34, 197, 94, 0.15)' : totalWars > 0 ? 'rgba(239, 68, 68, 0.18)' : 'rgba(34, 197, 94, 0.15)');
        statusEl.style.borderColor = isPaused ? 'rgba(245, 158, 11, 0.45)' : (isOpeningPeace ? 'rgba(34, 197, 94, 0.45)' : totalWars > 0 ? 'rgba(239, 68, 68, 0.45)' : 'rgba(34, 197, 94, 0.45)');
        statusEl.style.color = isPaused ? '#fcd34d' : (isOpeningPeace ? '#bbf7d0' : totalWars > 0 ? '#fecaca' : '#bbf7d0');
    }
}

// 2. Battle Resolution Helper
function resolveBattle(attackerId, defenderId, targetX, targetY) {
    let attacker = nations[attackerId];
    let defender = nations[defenderId];
    if (!attacker || !defender) return false;

    const attackerTroops = attacker.army.attack + attacker.army.defend + attacker.army.balanced;
    const defenderTroops = defender.army.attack + defender.army.defend + defender.army.balanced;
    const attackingForce = attacker.army.attack + attacker.army.balanced * 0.75 + attacker.army.defend * 0.35;
    const defendingForce = defender.army.defend + defender.army.balanced * 0.75 + defender.army.attack * 0.35;
    const cityDefenseBonus = cityGrid[targetY][targetX] ? 1.25 : 1;
    const effectiveDefense = Math.max(1, defendingForce * cityDefenseBonus);
    const winChance = Math.max(0.05, Math.min(0.95, attackingForce / (attackingForce + effectiveDefense)));
    const attackerWon = Math.random() < winChance;
    const nearbyTiles = getNeighbors(targetX, targetY);
    const attackerTile = nearbyTiles.find(tile => territory[tile.y][tile.x] === attacker.id);
    if (attackerTile) {
        const nationAId = Math.min(attacker.id, defender.id);
        const nationBId = Math.max(attacker.id, defender.id);
        const defenderTile = { x: targetX, y: targetY };
        const nationATile = attacker.id === nationAId ? attackerTile : defenderTile;
        const nationBTile = attacker.id === nationBId ? attackerTile : defenderTile;
        const battleKey = `${nationAId}:${nationBId}`;
        const frontKey = `${attackerTile.x},${attackerTile.y}:${targetX},${targetY}`;
        const now = Date.now();
        let battleMarker = battleMarkers.find(marker => marker.key === battleKey);
        if (!battleMarker) {
            battleMarker = {
                key: battleKey,
                nationAId,
                nationBId,
                nationATroops: attacker.id === nationAId ? attackerTroops : defenderTroops,
                nationBTroops: attacker.id === nationBId ? attackerTroops : defenderTroops,
                previousNationATroops: attacker.id === nationAId ? attackerTroops : defenderTroops,
                previousNationBTroops: attacker.id === nationBId ? attackerTroops : defenderTroops,
                troopTransitionAt: now,
                frontFlags: []
            };
            battleMarkers.push(battleMarker);
        } else {
            const troopProgress = Math.min(1, (now - battleMarker.troopTransitionAt) / 600);
            battleMarker.previousNationATroops +=
                (battleMarker.nationATroops - battleMarker.previousNationATroops) * troopProgress;
            battleMarker.previousNationBTroops +=
                (battleMarker.nationBTroops - battleMarker.previousNationBTroops) * troopProgress;
            battleMarker.nationATroops = attacker.id === nationAId ? attackerTroops : defenderTroops;
            battleMarker.nationBTroops = attacker.id === nationBId ? attackerTroops : defenderTroops;
            battleMarker.troopTransitionAt = now;
        }
        const anchorIsActive = battleMarker.frontFlags.some(flag =>
            flag.key === battleMarker.anchorFrontKey && flag.expiresAt > now
        );
        let frontFlag = battleMarker.frontFlags.find(flag => flag.key === frontKey);
        if (!frontFlag) {
            frontFlag = {
                key: frontKey,
                attackerId: attacker.id,
                attackerX: attackerTile.x,
                attackerY: attackerTile.y,
                defenderX: targetX,
                defenderY: targetY,
                nationAX: nationATile.x + 0.5,
                nationAY: nationATile.y + 0.5,
                nationBX: nationBTile.x + 0.5,
                nationBY: nationBTile.y + 0.5
            };
            battleMarker.frontFlags.push(frontFlag);
        }
        frontFlag.attackerId = attacker.id;
        frontFlag.nationAX = nationATile.x + 0.5;
        frontFlag.nationAY = nationATile.y + 0.5;
        frontFlag.nationBX = nationBTile.x + 0.5;
        frontFlag.nationBY = nationBTile.y + 0.5;
        frontFlag.updatedAt = now;
        frontFlag.expiresAt = now + 3000;
        battleMarker.frontFlags = battleMarker.frontFlags.filter(flag => flag.expiresAt > now);
        if (battleMarker.frontFlags.length > 32) {
            battleMarker.frontFlags.splice(0, battleMarker.frontFlags.length - 32);
        }
        battleMarker.expiresAt = now + 3000;
        if (battleMarkers.length > 60) battleMarkers.splice(0, battleMarkers.length - 60);
    }

    const applyCasualties = (nation, amount, priorities) => {
        let remaining = Math.max(1, Math.ceil(amount));
        priorities.forEach(type => {
            const lost = Math.min(nation.army[type], remaining);
            nation.army[type] -= lost;
            remaining -= lost;
        });
    };
    applyCasualties(attacker, Math.max(1, attackingForce * (attackerWon ? 0.004 : 0.012)), ['attack', 'balanced', 'defend']);
    applyCasualties(defender, Math.max(1, defendingForce * (attackerWon ? 0.012 : 0.004)), ['defend', 'balanced', 'attack']);
    if (!attackerWon) return false;

    territory[targetY][targetX] = attackerId;
    attacker.tiles.push({ x: targetX, y: targetY });

    defender.tiles = defender.tiles.filter(t => !(t.x === targetX && t.y === targetY));
    defender.opinions[attacker.id] = Math.max(0, (defender.opinions[attacker.id] || 0) - 2.5);
    return true;
}

const MAX_SHIPS_PER_NATION = 4;
const NAVAL_LAUNCH_COOLDOWN_TICKS = 25;

function launchNavalExpedition(nationId, targetX = null, targetY = null) {
    const nation = nations[nationId];
    if (!nation || !nation.tiles || !nation.tiles.some(tile => window.isCoastal(tile.x, tile.y))) return false;
    if (targetX !== null && targetY !== null) {
        const targetOwner = territory[targetY]?.[targetX];
        if (targetOwner !== null && targetOwner !== undefined && nations[targetOwner]?.carracks > 0) return false;
    }
    if (nation.army.attack + nation.army.balanced < 8) return false;
    if (ships.filter(ship => ship.nationId === nation.id).length >= MAX_SHIPS_PER_NATION) return false;
    if (nation.lastNavalLaunch && year - nation.lastNavalLaunch < NAVAL_LAUNCH_COOLDOWN_TICKS) return false;

    const expedition = targetX === null || targetY === null
        ? findSeaExpedition(nation.id)
        : findSeaExpeditionTo(nation.id, targetX, targetY);
    if (!expedition) return false;
    const expeditionOwner = territory[expedition.target.y]?.[expedition.target.x];
    if (expeditionOwner !== null && expeditionOwner !== undefined &&
        expeditionOwner !== nation.id && (nations[expeditionOwner]?.carracks || 0) > 0) return false;

    if (nation.army.attack >= 8) nation.army.attack -= 8;
    else nation.army.balanced -= 8;
    nation.lastNavalLaunch = year;
    ships.push({
        nationId: nation.id,
        path: expedition.path,
        progress: 0,
        type: expedition.type,
        target: expedition.target,
        enemyId: expedition.enemyId || null
    });
    return expedition;
}

function launchCarrackAttack(nationId, targetX, targetY) {
    const nation = nations[nationId];
    const assignedCarrack = carrackShips.find(ship => ship.nationId === nationId && ship.patrol);
    const hasUnassignedCarrack = (nation?.carracks || 0) > carrackShips.filter(ship => ship.nationId === nationId).length;
    const targetId = territory[targetY]?.[targetX];
    const targetNation = targetId === null || targetId === undefined ? null : nations[targetId];
    if (!nation || !targetNation || targetNation.id === nation.id ||
        nation.wars?.[targetNation.id] === undefined ||
        (nation.allianceId != null && nation.allianceId === targetNation.allianceId) ||
        (nation.peaceTreaties?.[targetNation.id] || 0) > 0 ||
        !(targetNation.carracks > 0 || ships.some(ship => ship.nationId === targetNation.id)) ||
        (!hasUnassignedCarrack && !assignedCarrack) ||
        (carrackShips.filter(ship => ship.nationId === nation.id).length >= MAX_SHIPS_PER_NATION && !assignedCarrack)) return false;
    const route = findSeaExpeditionTo(nation.id, targetX, targetY);
    if (!route) return false;
    if (assignedCarrack && !hasUnassignedCarrack) {
        assignedCarrack.path = route.path;
        assignedCarrack.progress = 0;
        assignedCarrack.target = route.target;
        assignedCarrack.enemyId = targetNation.id;
        assignedCarrack.patrol = false;
        assignedCarrack.lastAttackYear = year;
        return route;
    }
    carrackShips.push({ nationId: nation.id, path: route.path, progress: 0, target: route.target, enemyId: targetNation.id });
    return route;
}

// 3. Main Tick Function
function tick() {
    year++;
    
    let nationKeys = Object.keys(nations);
    synchronizeWarPairs();
    recalculateCityMultipliers();

    let totalLandTiles = 0;
    nationKeys.forEach(id => { if (nations[id]) totalLandTiles += nations[id].tiles.length; });

    // 1. DIPLOMACY & FRICTION CHECKS
    updateDiplomacyAndFriction();
    updateAlliancesAndCoalitions(totalLandTiles);

    // Dynamic Diplomatic Alliance Invitations (>80% Relation) & Union Mergers (100% Relation + Long-time Peace)
    processAllianceAndUnionDiplomacy();

    nationKeys.forEach(id => {
        const n = nations[id];
        if (n) n.ai = evaluateNationAI(n);
    });

    // 2. DOMESTIC ECONOMY, EXPANSION & RECRUITMENT
    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        let coastalCount = 0;
        let newTiles = [];
        let totalIncome = 0;
        let totalPop = 0;

        let frontier = [];
        let seenFrontier = new Set();
        let borderTiles = [];
        let interiorTiles = [];

        n.tiles.forEach(t => {
            popGrid[t.y][t.x] += Math.floor(1 + Math.random() * 2 * tileMultiplier[t.y][t.x]);
            totalPop += popGrid[t.y][t.x];

            let baseTerrain = getBaseTerrainValue(t.x, t.y);
            totalIncome += baseTerrain * tileMultiplier[t.y][t.x];

            if (isCoastal(t.x, t.y)) coastalCount++;

            let nbs = getNeighbors(t.x, t.y);
            let isInterior = true;

            nbs.forEach(nb => {
                let owner = territory[nb.y][nb.x];
                if (owner !== n.id) isInterior = false;
                if (grid[nb.y][nb.x] === 1 && owner === null) {
                    let key = `${nb.x},${nb.y}`;
                    if (!seenFrontier.has(key)) {
                        seenFrontier.add(key);
                        let tType = terrainType[nb.y][nb.x];
                        frontier.push({x: nb.x, y: nb.y, type: tType});
                    }
                }
            });

            if (isInterior) interiorTiles.push(t);
            else borderTiles.push(t);
        });

        // Land Expansion
        if ((n.id !== playerNationId || playerExpansionEnabled) && frontier.length > 0) {
            let expansionBudget = Math.min(8, Math.floor(2 + n.tiles.length * 0.02));

            for (let i = 0; i < expansionBudget && frontier.length > 0; i++) {
                frontier.forEach(f => {
                    let friendlyNeighbors = 0;
                    let exposedBorder = 0;

                    getNeighbors(f.x, f.y).forEach(nb => {
                        let owner = territory[nb.y][nb.x];
                        if (owner === n.id) friendlyNeighbors++;
                        else if (owner === null) exposedBorder++;
                    });

                    let compactnessScore = (friendlyNeighbors * 2.5) - (exposedBorder * 1.2);
                    let terrainWeight = (f.type === 2) ? 15 : (f.type === 1 ? 4 : 1);
                    f.weight = Math.max(0.1, terrainWeight + compactnessScore);
                });

                let totalWeight = frontier.reduce((sum, f) => sum + f.weight, 0);
                let randVal = Math.random() * totalWeight;
                let cumulative = 0;
                let selectedIdx = 0;

                for (let j = 0; j < frontier.length; j++) {
                    cumulative += frontier[j].weight;
                    if (randVal <= cumulative) {
                        selectedIdx = j;
                        break;
                    }
                }

                let picked = frontier[selectedIdx];
                frontier.splice(selectedIdx, 1);

                let speedChance = (picked.type === 2) ? 1.0 : ((picked.type === 1) ? 0.60 : 0.12);

                if (Math.random() < speedChance) {
                    if (territory[picked.y][picked.x] === null) {
                        territory[picked.y][picked.x] = n.id;
                        newTiles.push({x: picked.x, y: picked.y});
                    }
                }
            }
        }

        n.population = totalPop;
        n.tiles.push(...newTiles);
        n.ports = coastalCount;
        if (n.id !== playerNationId && coastalCount > 0 && (n.carracks || 0) === 0 && n.gold >= CARRACK_COST * 1.5 && Math.random() < 0.015) {
            buildCarrack(n);
        }

        // Financial Maintenance
        const threatenedSectorsCount = Object.keys(n.threatMarkers || {}).length;
        updateNationEconomy(n, totalIncome);
        n.gold += n.netIncome;

        if (n.gold < 0) {
            n.gold = 0;
            if (n.army.attack > 5) n.army.attack = Math.floor(n.army.attack * 0.90);
            if (n.army.defend > 5) n.army.defend = Math.floor(n.army.defend * 0.90);
        }

        updateAutoArmyManager(n);

        // Army Recruitment & Subsidizing Allies
        let isAtWar = Object.keys(n.wars).length > 0;
        let isUnderThreat = threatenedSectorsCount > 0;
        let aiBias = n.ai ? n.ai.posture : 'balanced';
        let recruitRatio = (isAtWar || isUnderThreat) ? 0.65 : 0.20;
        if (aiBias === 'defensive') recruitRatio += 0.15;
        if (aiBias === 'aggressive' || aiBias === 'expansionist') recruitRatio += 0.12;

        if (n.id !== playerNationId && n.gold > 15) {
            // Donate excess wealth to fighting allies who cannot border the target
            if (!isAtWar && n.allianceId) {
                let fightingAlly = Object.values(nations).find(ally => ally.allianceId === n.allianceId && Object.keys(ally.wars).length > 0);
                if (fightingAlly && n.gold > 50) {
                    let donation = Math.floor(n.gold * 0.3);
                    n.gold -= donation;
                    fightingAlly.gold += donation;
                }
            }

            let budget = Math.floor(n.gold * recruitRatio);
            if (isUnderThreat && !isAtWar) {
                let count = Math.floor(budget / 3);
                n.army.defend += count;
                n.gold -= count * 3;
            } else if (isAtWar) {
                let count = Math.floor(budget / 3);
                n.army.attack += Math.floor(count * 0.6);
                n.army.balanced += Math.floor(count * 0.4);
                n.gold -= count * 3;
            } else {
                let pref = n.archetype.recruitPref;
                if ((pref === 'attack' || aiBias === 'aggressive') && n.gold >= 8) recruitTroops(n, 'attack');
                else if ((pref === 'defend' || aiBias === 'defensive') && n.gold >= 8) recruitTroops(n, 'defend');
                else if (n.gold >= 10) recruitTroops(n, 'balanced');
            }
        }

        // Cities
        let myCities = cities.filter(c => c.nationId === n.id);
        let newCityCost = getNewCityCost(n);

        if (n.id !== playerNationId && !isAtWar && n.tiles.length >= (myCities.length + 1) * 200 && Math.random() < 0.03) {
            if (n.gold >= newCityCost) {
                let candidates = n.tiles.filter(t => canBuildCityAt(n, t.x, t.y));

                if (candidates.length > 0) {
                    let spot = candidates[Math.floor(Math.random() * candidates.length)];
                    n.gold -= newCityCost;
                    buildCity(n.id, spot.x, spot.y);
                }
            }
        } else if (n.id !== playerNationId && !isAtWar && myCities.length > 0) {
            let upgradeable = myCities.filter(c => c.level < 100);
            if (upgradeable.length > 0) {
                upgradeable.sort((a, b) => a.level - b.level);
                let targetCity = upgradeable[0];
                upgradeCity(n, targetCity);
            }
        } else if (n.id === playerNationId && n.autoCityUpgrader) {
            const targetCity = myCities.filter(city => city.level < 100)
                .sort((a, b) => a.level - b.level || a.id - b.id)[0];
            if (targetCity && n.gold >= getCityUpgradeCost(targetCity)) upgradeCity(n, targetCity);
        }
    });

    // 3. WARFARE DECISIONS & COORDINATED ALLIANCE TARGETING
    checkWarDeclarations();
    processCoordinatedAllianceWarfare();

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        Object.keys(n.wars).forEach(enemyId => {
            n.wars[enemyId]++;
            let enemy = nations[enemyId];

            if (!enemy) {
                delete n.wars[enemyId];
                return;
            }

            n.opinions[enemyId] = Math.max(0, n.opinions[enemyId] - 0.2);

            let warLength = n.wars[enemyId];
            let totalMyArmy = n.army.attack + n.army.defend + n.army.balanced;
            let totalEnemyArmy = enemy.army.attack + enemy.army.defend + enemy.army.balanced;

            if (warLength > 100) {
                if (totalMyArmy < 15 && totalEnemyArmy < 15 && n.gold < 40 && enemy.gold < 40 && Math.random() < 0.05) {
                    endWarToNeutral(n.id, enemy.id, "war exhaustion");
                } else if (warLength > 250 && Math.abs(totalMyArmy - totalEnemyArmy) < 10 && Math.random() < 0.02) {
                    endWarToNeutral(n.id, enemy.id, "stalemate");
                }
            }
        });
    });

    // 4. NAVAL EXPEDITIONS
    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n || n.ports === 0 ||
            n.army.attack + n.army.balanced < 8 ||
            ships.filter(ship => ship.nationId === n.id).length >= MAX_SHIPS_PER_NATION ||
            (n.lastNavalLaunch && year - n.lastNavalLaunch < NAVAL_LAUNCH_COOLDOWN_TICKS)) return;
        if (Math.random() < 0.10) launchNavalExpedition(n.id);
    });

    nationKeys.forEach(id => {
        const nation = nations[id];
        if (!nation || !(nation.carracks > carrackShips.filter(ship => ship.nationId === nation.id).length) || Math.random() >= 0.04) return;
        const targets = Object.values(nations).filter(target => target && target.id !== nation.id &&
            nation.wars?.[target.id] !== undefined && (target.carracks > 0 || ships.some(ship => ship.nationId === target.id)));
        for (const target of targets) {
            const coast = target.tiles.find(tile => window.isCoastal(tile.x, tile.y));
            if (coast && launchCarrackAttack(nation.id, coast.x, coast.y)) break;
        }
    });

    let activeShips = [];
    ships.forEach(ship => {
        ship.progress += 0.50; 
        let owner = nations[ship.nationId];
        if (!owner) return;

        if (ship.progress >= ship.path.length - 1) {
            let tx = ship.target.x, ty = ship.target.y;
            const targetNationId = territory[ty][tx];
            const targetNation = targetNationId !== null ? nations[targetNationId] : null;
            if (targetNation && targetNation.id !== owner.id && (targetNation.carracks || 0) > 0) {
                logNews(`⚓ <b>${owner.name}</b>'s boat was sunk by <b>${targetNation.name}</b>'s carrack. Clear the coast with a carrack attack before landing.`);
                return;
            }
            if (ship.type === 'colonize' && territory[ty][tx] === null && grid[ty][tx] === 1) {
                territory[ty][tx] = owner.id;
                owner.tiles.push({x: tx, y: ty});
                owner.army.balanced += 5;
            } else if (ship.type === 'invasion') {
                let enemy = nations[ship.enemyId];
                if (enemy && territory[ty][tx] === enemy.id) {
                    if (!resolveBattle(owner.id, enemy.id, tx, ty)) return;

                    let sectorKey = `${Math.floor(tx / 10)},${Math.floor(ty / 10)}`;
                    if (!enemy.threatMarkers) enemy.threatMarkers = {};
                    enemy.threatMarkers[sectorKey] = 25;

                    if (enemy.tiles.length === 0) {
                        logNews(`💥 <b>${owner.name}</b> conquered and annexed <b>${enemy.name}</b> via naval invasion!`);
                        removeNation(enemy.id);
                    }
                }
            }
        } else {
            activeShips.push(ship);
        }
    });
    const getSeaPosition = ship => {
        const index = Math.min(Math.floor(ship.progress), ship.path.length - 1);
        const next = ship.path[Math.min(index + 1, ship.path.length - 1)];
        const current = ship.path[index];
        const progress = ship.progress - index;
        return {
            x: current.x + (next.x - current.x) * progress,
            y: current.y + (next.y - current.y) * progress
        };
    };
    ships = activeShips;

    const activeCarrackShips = [];
    const sunkBoats = new Set();
    carrackShips.forEach(carrack => {
        if (!carrack.patrol) carrack.progress += 0.5;
        const owner = nations[carrack.nationId];
        if (!owner) return;
        if (carrack.progress >= carrack.path.length - 1) {
            if (!carrack.patrol) {
                const defender = nations[carrack.enemyId];
                if (defender && (defender.carracks || 0) > 0) {
                    defender.carracks--;
                    logNews(defender.carracks > 0
                        ? `⚓ <b>${owner.name}</b>'s carrack destroyed an enemy carrack off <b>${defender.name}</b>'s coast. ${defender.carracks} carrack${defender.carracks === 1 ? '' : 's'} remain.`
                        : `⚓ <b>${owner.name}</b>'s carrack cleared the last enemy carrack off <b>${defender.name}</b>'s coast. Boats can now attempt a landing.`);
                } else {
                    logNews(`⚓ <b>${owner.name}</b>'s carrack reached the coast, but found no enemy carracks to attack.`);
                }
                carrack.patrol = true;
            }
        }
        activeCarrackShips.push(carrack);
    });

    const sunkCarracks = new Set();
    activeCarrackShips.forEach(carrack => {
        if (sunkCarracks.has(carrack)) return;
        const owner = nations[carrack.nationId];
        const position = getSeaPosition(carrack);
        const nearbyBoats = ships.filter(boat => {
            if (boat.nationId === carrack.nationId || sunkBoats.has(boat)) return false;
            const target = nations[boat.nationId];
            if (!target || owner.wars?.[target.id] === undefined) return false;
            const boatPosition = getSeaPosition(boat);
            return Math.hypot(position.x - boatPosition.x, position.y - boatPosition.y) <= 12;
        });
        const targetBoat = nearbyBoats[0];
        if (targetBoat && year - (carrack.lastAttackYear || -Infinity) >= 3) {
            sunkBoats.add(targetBoat);
            carrack.lastAttackYear = year;
            logNews(`⚓ <b>${owner.name}</b>'s carrack fired on and sank a boat belonging to <b>${nations[targetBoat.nationId]?.name || 'the enemy'}</b>.`);
            return;
        }
        const nearbyCarracks = activeCarrackShips.filter(other => {
            if (other === carrack || other.nationId === carrack.nationId || sunkCarracks.has(other)) return false;
            const enemy = nations[other.nationId];
            if (!enemy || owner.wars?.[enemy.id] === undefined) return false;
            const otherPosition = getSeaPosition(other);
            return Math.hypot(position.x - otherPosition.x, position.y - otherPosition.y) <= 12;
        });
        const targetCarrack = nearbyCarracks[0];
        if (targetCarrack && year - (carrack.lastAttackYear || -Infinity) >= 3) {
            sunkCarracks.add(targetCarrack);
            carrack.lastAttackYear = year;
            const lostNation = nations[targetCarrack.nationId];
            if (lostNation) lostNation.carracks = Math.max(0, (lostNation.carracks || 0) - 1);
            logNews(`⚓ <b>${owner.name}</b>'s warship sank a carrack from <b>${lostNation?.name || 'the enemy'}</b>.`);
        }
    });
    ships = ships.filter(ship => !sunkBoats.has(ship));
    carrackShips = activeCarrackShips.filter(ship => !sunkCarracks.has(ship));

    // 5. COMBAT RESOLUTION
    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n || Object.keys(n.wars).length === 0 || (n.army.attack + n.army.balanced) < 2) return;

        let frontlines = buildFrontlines(n.id);
        if (frontlines.length === 0) return;

        if (!n.objectiveQueue || n.objectiveQueue.length === 0) {
            selectClusterObjective(n, frontlines);
        }

        if (n.objectiveQueue) {
            n.objectiveQueue = n.objectiveQueue.filter(t => territory[t.y][t.x] !== n.id);
        }

        let candidateAttacks = [];

        if (n.objectiveQueue && n.objectiveQueue.length > 0) {
            n.objectiveQueue.forEach(target => {
                getNeighbors(target.x, target.y).forEach(nb => {
                    if (territory[nb.y][nb.x] === n.id) {
                        let enemyId = territory[target.y][target.x];
                        if (enemyId && n.wars[enemyId] !== undefined && (n.allianceId === null || n.allianceId !== nations[enemyId]?.allianceId)) {
                            candidateAttacks.push({ attackerTile: nb, targetTile: target, enemyId: enemyId, isPrimary: true });
                        }
                    }
                });
            });
        }

        if (candidateAttacks.length === 0) {
            frontlines.forEach((front, index) => {
                let isPrimary = (index === 0);
                front.tiles.forEach(fTile => {
                    let enemyId = territory[fTile.y][fTile.x];
                    if (enemyId && n.wars[enemyId] !== undefined && (n.allianceId === null || n.allianceId !== nations[enemyId]?.allianceId)) {
                        getNeighbors(fTile.x, fTile.y).forEach(nb => {
                            if (territory[nb.y][nb.x] === n.id) {
                                candidateAttacks.push({ attackerTile: nb, targetTile: fTile, enemyId: enemyId, isPrimary: isPrimary });
                            }
                        });
                    }
                });
            });
        }

        if (candidateAttacks.length > 0) {
            let myPower = calculateNationPower(n);
            let offensivePower = n.army.attack + n.army.balanced;
            let maxAttacks = Math.max(1, Math.min(12, Math.floor((offensivePower / 10) * myPower)));

            for (let a = 0; a < maxAttacks && candidateAttacks.length > 0; a++) {
                candidateAttacks.forEach(c => {
                    let friendlyNeighbors = 0;
                    let exposedBorder = 0;

                    getNeighbors(c.targetTile.x, c.targetTile.y).forEach(nb => {
                        let owner = territory[nb.y][nb.x];
                        if (owner === n.id) friendlyNeighbors++;
                        else if (owner === null || (owner !== n.id && n.wars[owner] === undefined)) exposedBorder++;
                    });

                    let compactnessScore = (friendlyNeighbors * 2.5) - (exposedBorder * 1.2);
                    let priorityMultiplier = c.isPrimary ? 2.0 : 0.5;
                    c.score = Math.max(0.1, compactnessScore * priorityMultiplier);
                });

                let totalScore = candidateAttacks.reduce((sum, c) => sum + c.score, 0);
                let randVal = Math.random() * totalScore;
                let cumulative = 0;
                let combatIdx = 0;

                for (let j = 0; j < candidateAttacks.length; j++) {
                    cumulative += candidateAttacks[j].score;
                    if (randVal <= cumulative) {
                        combatIdx = j;
                        break;
                    }
                }

                let combat = candidateAttacks[combatIdx];
                candidateAttacks.splice(combatIdx, 1);

                let enemy = nations[combat.enemyId];
                if (!enemy) continue;

                let tx = combat.targetTile.x, ty = combat.targetTile.y;
                if (!resolveBattle(n.id, combat.enemyId, tx, ty)) continue;

                let sectorKey = `${Math.floor(tx / 10)},${Math.floor(ty / 10)}`;
                if (!enemy.threatMarkers) enemy.threatMarkers = {};
                enemy.threatMarkers[sectorKey] = 30;

                if (cityGrid[ty][tx]) cityGrid[ty][tx].nationId = n.id;

                if (enemy.tiles.length === 0) {
                    logNews(`💥 <b>${n.name}</b> completely conquered and annexed <b>${enemy.name}</b>!`);
                    removeNation(enemy.id);
                    n.objectiveQueue = [];
                    break;
                }
            }
        }
    });

    checkDominationVictory(totalLandTiles);
    updateNationPanel();
    updateEmpireOverview();
    render();

    let now = Date.now();
    if (now - lastLeaderboardUpdate >= 2000) {
        updateLeaderboard();
        lastLeaderboardUpdate = now;
    }
}

// 4. COORDINATED ALLIANCE WARFARE & WEAKEST BORDER SELECTION
function processCoordinatedAllianceWarfare() {
    let allianceGroups = {};
    const borderCache = new Map();
    const getBorders = nation => {
        if (!borderCache.has(nation.id)) {
            borderCache.set(nation.id, new Set(getNeighboringNations(nation.id)));
        }
        return borderCache.get(nation.id);
    };

    Object.values(nations).forEach(n => {
        if (!n || n.id === playerNationId) return;
        let groupKey = n.allianceId ? `alliance_${n.allianceId}` : `solo_${n.id}`;
        if (!allianceGroups[groupKey]) allianceGroups[groupKey] = [];
        allianceGroups[groupKey].push(n);
    });

    Object.values(allianceGroups).forEach(members => {
        if (members.some(member => member.id === playerNationId)) return;
        let activelyAtWar = members.some(m => Object.keys(m.wars).length > 0);

        // Alliance Rule: Focus on exactly 1 country at a time, wait until war ends
        if (activelyAtWar) {
            let activeEnemyId = null;
            members.forEach(m => {
                let enemyKeys = Object.keys(m.wars);
                if (enemyKeys.length > 0) activeEnemyId = enemyKeys[0];
            });

            if (activeEnemyId && nations[activeEnemyId]) {
                members.forEach(m => {
                    if (m.wars[activeEnemyId] === undefined && nations[activeEnemyId]) {
                        registerWarPair(m, nations[activeEnemyId], 1);
                    }
                });
            }
            return; 
        }

        // If at peace, allies check bordering nations and target the WEAKEST mutually bordering country
        let collectiveBorderingEnemies = new Set();
        members.forEach(m => {
            getBorders(m).forEach(enemyId => {
                if (!m.allianceId || nations[enemyId].allianceId !== m.allianceId) {
                    collectiveBorderingEnemies.add(enemyId);
                }
            });
        });

        if (collectiveBorderingEnemies.size === 0) return;

        // Select the weakest surrounding country
        let targets = Array.from(collectiveBorderingEnemies).map(eId => nations[eId]).filter(e => e);
        targets.sort((a, b) => calculateNationPower(a) - calculateNationPower(b));

        let selectedTarget = targets[0];
        if (!selectedTarget) return;

        // Declare simultaneous coordinated war
        members.forEach(m => {
            let bordersTarget = getBorders(m).has(selectedTarget.id);
            if (bordersTarget) {
                registerWarPair(m, selectedTarget, 1);
            } else {
                // If member doesn't border, it subsidizes allies via gold donations
                let primaryAttacker = members.find(ally => getBorders(ally).has(selectedTarget.id));
                if (primaryAttacker && m.gold > 30) {
                    let donation = Math.floor(m.gold * 0.4);
                    m.gold -= donation;
                    primaryAttacker.gold += donation;
                }
            }
        });
    });
}

// 5. DIPLOMATIC ALLIANCE INVITATIONS (>80%) & UNION FORMATION (100% + Historical Peace)
function processAllianceAndUnionDiplomacy() {
    let nationList = Object.values(nations);

    for (let i = 0; i < nationList.length; i++) {
        for (let j = i + 1; j < nationList.length; j++) {
            let n1 = nationList[i];
            let n2 = nationList[j];
            if (!n1 || !n2) continue;

            let relation1 = n1.opinions[n2.id] || 50;
            let relation2 = n2.opinions[n1.id] || 50;

            // Alliance Invites: Relations > 80% to avoid fighting
            if (n1.id !== playerNationId && n2.id !== playerNationId &&
                relation1 > 80 && relation2 > 80 && !n1.allianceId && !n2.allianceId) {
                let newAllianceId = `alliance_${Date.now()}_${Math.floor(Math.random()*1000)}`;
                n1.allianceId = newAllianceId;
                n2.allianceId = newAllianceId;
                logNews(`🤝 <b>${n1.name}</b> and <b>${n2.name}</b> formed an Alliance to prevent war!`);
            }

            // Union Formation: 100% Relations + Long-time Allies + Never at war
            let hasBeenAtWar = (n1.warHistory && n1.warHistory[n2.id]) || (n2.warHistory && n2.warHistory[n1.id]);
            if (n1.id !== playerNationId && n2.id !== playerNationId &&
                relation1 >= 100 && relation2 >= 100 && n1.allianceId && n1.allianceId === n2.allianceId && !hasBeenAtWar) {
                if (Math.random() < 0.01) { 
                    mergeNationsIntoUnion(n1, n2);
                    return;
                }
            }
        }
    }
}

// 6. Merge Two Countries Into a Single Union
function mergeNationsIntoUnion(n1, n2) {
    let primary = n1.tiles.length >= n2.tiles.length ? n1 : n2;
    let absorbed = n1.tiles.length >= n2.tiles.length ? n2 : n1;

    logNews(`👑 <b>${primary.name}</b> and <b>${absorbed.name}</b> merged into a unified Union!`);

    primary.tiles.push(...absorbed.tiles);
    absorbed.tiles.forEach(t => { territory[t.y][t.x] = primary.id; });

    primary.gold += absorbed.gold;
    primary.army.attack += absorbed.army.attack;
    primary.army.defend += absorbed.army.defend;
    primary.army.balanced += absorbed.army.balanced;

    delete nations[absorbed.id];
}

// Helper: Get Neighboring Nations
function getNeighboringNations(nationId) {
    let neighborIds = new Set();
    let nation = nations[nationId];
    if (!nation || !nation.tiles) return [];

    nation.tiles.forEach(t => {
        const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
        dirs.forEach(([dx, dy]) => {
            let nx = t.x + dx;
            let ny = t.y + dy;
            if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) {
                let neighborOwner = territory[ny][nx];
                if (neighborOwner !== null && neighborOwner !== nationId) {
                    neighborIds.add(neighborOwner);
                }
            }
        });
    });
    return Array.from(neighborIds);
}

// Check Victory Conditions
function checkDominationVictory(totalLandTiles) {
    if (!totalLandTiles || totalLandTiles === 0) return;

    const player = nations[playerNationId];
    const playerAlliance = player?.allianceId != null ? alliances[player.allianceId] : null;
    if (player && playerAlliance && !playerOutcome) {
        const allianceLand = [...new Set(playerAlliance.members)]
            .map(id => nations[id])
            .filter(Boolean)
            .reduce((sum, member) => sum + member.tiles.length, 0);
        if (allianceLand / totalLandTiles >= 0.9) {
            playerOutcome = 'alliance-victory';
            logNews(`🏆 <b>${playerAlliance.name}</b> controls at least 90% of the land. You achieved an <b>Alliance Victory</b>!`);
        }
    }

    Object.values(nations).forEach(n => {
        if (!n || !n.tiles) return;
        let controlRatio = n.tiles.length / totalLandTiles;

        if (n.id === playerNationId && controlRatio >= window.VICTORY_THRESHOLD && !playerOutcome) {
            playerOutcome = 'victory';
            logNews(`🏆 You achieved Domination Victory as <b>${n.name}</b>!`);
        }

        if (controlRatio >= window.VICTORY_THRESHOLD && !window.gameWon) {
            window.gameWon = true;
            if (typeof addFloatingText === "function") {
                addFloatingText(`👑 ${n.name} achieved 75% Domination Victory!`, WIDTH / 2, HEIGHT / 2, "#ffd700");
            }
            if (typeof logNews === "function") {
                logNews(`🏆 <b>${n.name}</b> has reached 75% land control and achieved <b>Domination Victory</b>!`);
            }
        }
    });

    Object.values(alliances).forEach(alliance => {
        const allianceLand = [...new Set(alliance.members || [])]
            .map(id => nations[id])
            .filter(Boolean)
            .reduce((sum, member) => sum + member.tiles.length, 0);
        if (allianceLand / totalLandTiles >= 0.9 && !window.gameWon) {
            window.gameWon = true;
            logNews(`🏆 <b>${alliance.name}</b> has reached 90% land control and achieved <b>Alliance Victory</b>!`);
        }
    });
}

// Exports
window.tick = tick;
window.calculateNationPower = calculateNationPower;
