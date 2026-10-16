// --- DIPLOMACY, DYNAMIC BORDERS, PEACE TREATIES & ALLIANCES ---

window.floatingTexts = [];
const ALLIANCE_DURATION = 150;

// Helper function exported globally for simulation.js and other modules
window.isCoastal = function(x, y) {
    if (typeof grid === "undefined" || !grid[y] || grid[y][x] === 0) return false;
    if (typeof getNeighbors !== "function") return false;
    let nbs = getNeighbors(x, y);
    return nbs.some(nb => grid[nb.y] && grid[nb.y][nb.x] === 0);
};

// Optimized Floating Text for Major Events (War & Peace)
function addFloatingText(text, x, y, color = "#ffd700") {
    if (window.floatingTexts.length > 15) {
        window.floatingTexts.shift();
    }

    window.floatingTexts.push({
        text: text,
        x: x,
        y: y,
        color: color,
        life: 60,
        opacity: 1.0
    });
}

function generateUniqueAllianceColor() {
    let usedHues = Object.values(alliances).map(a => a.hue);
    let bestHue = Math.floor(Math.random() * 360);
    let maxMinDist = -1;

    for (let i = 0; i < 35; i++) {
        let candidate = Math.floor(Math.random() * 360);
        if (usedHues.length === 0) { bestHue = candidate; break; }

        let minDist = Math.min(...usedHues.map(h => {
            let d = Math.abs(h - candidate);
            return Math.min(d, 360 - d);
        }));

        if (minDist > maxMinDist) {
            maxMinDist = minDist;
            bestHue = candidate;
        }
    }

    return { color: `hsl(${bestHue}, 85%, 60%)`, hue: bestHue };
}

function initializeNationDiplomacy() {
    let keys = Object.keys(nations);

    keys.forEach(id => {
        let n = nations[id];
        if (!n) return;
        if (!n.opinions) n.opinions = {};
        if (!n.peaceTreaties) n.peaceTreaties = {};

        keys.forEach(otherId => {
            if (id === otherId) return;
            n.opinions[otherId] = Math.floor(35 + Math.random() * 30);
        });

        let potentialRivals = keys.filter(k => k !== id);
        let rivalCount = Math.min(2, potentialRivals.length);
        
        for (let i = 0; i < rivalCount; i++) {
            let rivalId = potentialRivals[Math.floor(Math.random() * potentialRivals.length)];
            n.opinions[rivalId] = Math.floor(20 + Math.random() * 15);
        }
    });
}

// --- PEACE TREATIES & STALEMATE PREVENTION ---

function canSignPeaceTreaty(nationA_Id, nationB_Id) {
    const nationA = nations[nationA_Id];
    const nationB = nations[nationB_Id];
    return Boolean(nationA && nationB && nationA.id !== nationB.id);
}

function signPeaceTreaty(nationA_Id, nationB_Id, reason = "diplomatic pact") {
    if (!canSignPeaceTreaty(nationA_Id, nationB_Id)) return false;

    let a = nations[nationA_Id];
    let b = nations[nationB_Id];
    if (!a || !b) return false;

    if (a.wars[nationB_Id] !== undefined) delete a.wars[nationB_Id];
    if (b.wars[nationA_Id] !== undefined) delete b.wars[nationA_Id];
    if (a.warStartTiles) delete a.warStartTiles[nationB_Id];
    if (b.warStartTiles) delete b.warStartTiles[nationA_Id];

    a.peaceTreaties[nationB_Id] = 400;
    b.peaceTreaties[nationA_Id] = 400;
    peaceOffers = peaceOffers.filter(offer =>
        !((offer.proposerId === nationA_Id && offer.recipientId === nationB_Id) ||
            (offer.proposerId === nationB_Id && offer.recipientId === nationA_Id))
    );

    logNews(`🕊️ <b>${a.name}</b> and <b>${b.name}</b> signed a short <b>Peace Treaty</b> (${reason})!`);

    if (a.tiles.length > 0) {
        let centerA = a.tiles[Math.floor(a.tiles.length / 2)];
        addFloatingText(`🕊️ Peace w/ ${b.name}`, centerA.x, centerA.y, "#2ecc71");
    }

    return true;
}

function getPeaceOfferKey(proposerId, recipientId) {
    return `${proposerId}:${recipientId}`;
}

function getAiPeaceAcceptanceChance(proposer, recipient, isWar, payment) {
    let chance = isWar ? 0.25 : 0.45;
    if (isWar) {
        const duration = Number(recipient.wars?.[proposer.id] ?? proposer.wars?.[recipient.id]) || 0;
        const proposerArmy = proposer.army.attack + proposer.army.defend + proposer.army.balanced;
        const recipientArmy = recipient.army.attack + recipient.army.defend + recipient.army.balanced;
        const strengthRatio = recipientArmy / Math.max(1, proposerArmy);
        const proposerStartTiles = proposer.warStartTiles?.[recipient.id] ?? proposer.tiles.length;
        const recipientStartTiles = recipient.warStartTiles?.[proposer.id] ?? recipient.tiles.length;
        const territoryMomentum = (recipient.tiles.length - recipientStartTiles) -
            (proposer.tiles.length - proposerStartTiles);
        chance += Math.min(0.3, duration / 500);
        if (strengthRatio < 0.8) chance += 0.2;
        else if (strengthRatio > 1.2) chance -= 0.2;
        if (territoryMomentum < 0) chance += 0.2;
        else if (territoryMomentum > 0) chance -= 0.2;
    } else {
        const relation = Math.min(
            proposer.opinions?.[recipient.id] ?? 50,
            recipient.opinions?.[proposer.id] ?? 50
        );
        chance += (relation - 50) * 0.006;
    }
    chance += Math.min(0.2, payment / Math.max(100, recipient.gold) * 0.2);
    return Math.max(0.05, Math.min(0.9, chance));
}

function createPeaceOffer(proposerId, recipientId, payment, reason = "diplomatic offer") {
    const proposer = nations[proposerId];
    const recipient = nations[recipientId];
    if (!proposer || !recipient || proposer.id === recipient.id ||
        !Number.isSafeInteger(payment) || payment < 1 || payment > proposer.gold ||
        !canSignPeaceTreaty(proposerId, recipientId) ||
        (proposer.peaceTreaties?.[recipientId] || 0) > 0 ||
        (recipient.peaceTreaties?.[proposerId] || 0) > 0) return null;

    const isWar = proposer.wars?.[recipientId] !== undefined ||
        recipient.wars?.[proposerId] !== undefined;
    if (isWar) {
        const duration = Number(proposer.wars?.[recipientId] ?? recipient.wars?.[proposerId]) || 0;
        registerWarPair(proposer, recipient, duration);
    }

    const key = getPeaceOfferKey(proposerId, recipientId);
    if (peaceOffers.some(offer => getPeaceOfferKey(offer.proposerId, offer.recipientId) === key)) return null;
    const offer = {
        id: `${key}:${year}`,
        proposerId: proposer.id,
        recipientId: recipient.id,
        payment,
        isWar,
        reason,
        createdYear: year
    };
    peaceOffers.push(offer);
    logNews(`🕊️ <b>${proposer.name}</b> offered peace to <b>${recipient.name}</b>, paying $${payment.toLocaleString()}.`);
    return offer;
}

function resolvePeaceOfferForAi(offer) {
    const proposer = nations[offer.proposerId];
    const recipient = nations[offer.recipientId];
    if (!proposer || !recipient) return false;
    if (Math.random() >= getAiPeaceAcceptanceChance(proposer, recipient, offer.isWar, offer.payment)) {
        peaceOffers = peaceOffers.filter(item => item.id !== offer.id);
        logNews(`🛡️ <b>${recipient.name}</b> rejected <b>${proposer.name}</b>'s peace offer.`);
        return false;
    }
    if (proposer.gold < offer.payment || !signPeaceTreaty(proposer.id, recipient.id, offer.reason)) {
        peaceOffers = peaceOffers.filter(item => item.id !== offer.id);
        return false;
    }
    proposer.gold -= offer.payment;
    recipient.gold += offer.payment;
    peaceOffers = peaceOffers.filter(item => item.id !== offer.id);
    logNews(`💰 <b>${proposer.name}</b> paid $${offer.payment.toLocaleString()} to <b>${recipient.name}</b> for peace.`);
    return true;
}

function submitPeaceOffer(proposerId, recipientId, payment, reason = "peace proposal") {
    const offer = createPeaceOffer(proposerId, recipientId, payment, reason);
    if (!offer) return { status: 'invalid' };
    if (offer.recipientId === playerNationId) return { status: 'pending', offer };
    return { status: resolvePeaceOfferForAi(offer) ? 'accepted' : 'rejected', offer };
}

function respondToPeaceOffer(offerId, accept) {
    const offer = peaceOffers.find(item => item.id === offerId);
    if (!offer || offer.recipientId !== playerNationId) return false;
    const proposer = nations[offer.proposerId];
    const recipient = nations[offer.recipientId];
    if (!accept) {
        peaceOffers = peaceOffers.filter(item => item.id !== offer.id);
        logNews(`🛡️ <b>${recipient?.name || 'Your nation'}</b> rejected <b>${proposer?.name || 'the nation'}</b>'s peace offer.`);
        return true;
    }
    if (!proposer || !recipient || proposer.gold < offer.payment ||
        !signPeaceTreaty(proposer.id, recipient.id, `accepted ${offer.reason}`)) {
        peaceOffers = peaceOffers.filter(item => item.id !== offer.id);
        return false;
    }
    proposer.gold -= offer.payment;
    recipient.gold += offer.payment;
    logNews(`💰 <b>${proposer.name}</b> paid $${offer.payment.toLocaleString()} to <b>${recipient.name}</b> for peace.`);
    return true;
}

function offerPeaceToAi(playerId, enemyId, payment) {
    if (playerId !== playerNationId) return { status: 'invalid' };
    return submitPeaceOffer(playerId, enemyId, payment, 'player peace offer');
}

function endWarToNeutral(nationA_Id, nationB_Id, reason = "ceasefire") {
    let a = nations[nationA_Id];
    let b = nations[nationB_Id];

    if (!a || !b) return false;
    if (signPeaceTreaty(nationA_Id, nationB_Id, reason)) return true;
    if (a.wars?.[nationB_Id] !== undefined) delete a.wars[nationB_Id];
    if (b.wars?.[nationA_Id] !== undefined) delete b.wars[nationA_Id];
    if (a.warStartTiles) delete a.warStartTiles[nationB_Id];
    if (b.warStartTiles) delete b.warStartTiles[nationA_Id];
    return false;
}

function processMultiWarPeaceOffers(nation) {
    if (nation.id === playerNationId) return;
    const playerWarId = Object.keys(nation.wars || {}).find(enemyId => Number(enemyId) === playerNationId);
    if (playerWarId !== undefined &&
        !peaceOffers.some(offer => offer.proposerId === nation.id && offer.recipientId === playerNationId) &&
        nation.gold >= 1 && Math.random() < 0.015) {
        createPeaceOffer(nation.id, playerNationId, Math.max(1, Math.floor(nation.gold * 0.1)), 'AI peace request');
    }

    let activeWarIds = Object.keys(nation.wars);
    
    if (activeWarIds.length >= 2 && Math.random() < 0.08) {
        let targetEnemyId = activeWarIds[Math.floor(Math.random() * activeWarIds.length)];
        let enemy = nations[targetEnemyId];

        if (!enemy) return;

        let mySize = nation.tiles.length;
        let enemySize = enemy.tiles.length;
        let ratio = mySize / Math.max(1, enemySize);

        let acceptanceChance = 0.35; 
        if (ratio < 0.6) {
            acceptanceChance = 0.15;
        } else if (ratio > 1.2) {
            acceptanceChance = 0.75;
        }

        if (Math.random() < acceptanceChance && nation.gold >= 1) {
            const offer = createPeaceOffer(
                nation.id,
                enemy.id,
                Math.max(1, Math.floor(nation.gold * 0.1)),
                "avoiding multi-front war"
            );
            if (offer && enemy.id !== playerNationId) resolvePeaceOfferForAi(offer);
        }
    }
}

// --- ENCLAVE ANNEXATION LOGIC (SILENT) ---

function checkEnclaveAnnexation() {
    if (typeof territory === "undefined" || typeof getNeighbors !== "function") return;

    const visited = new Uint8Array(WIDTH * HEIGHT);
    const queue = new Int32Array(WIDTH * HEIGHT);

    Object.keys(nations).forEach(id => {
        let n = nations[id];
        if (!n || n.tiles.length === 0) return;

        n.tiles.forEach(tile => {
            const startIndex = tile.y * WIDTH + tile.x;
            if (visited[startIndex] || territory[tile.y][tile.x] !== n.id) return;

            let cluster = [];
            let surroundingOwners = new Set();
            let touchesWaterOrUnclaimed = false;
            let head = 0;
            let tail = 0;
            queue[tail++] = startIndex;
            visited[startIndex] = 1;

            while (head < tail) {
                const currentIndex = queue[head++];
                const x = currentIndex % WIDTH;
                const y = Math.floor(currentIndex / WIDTH);
                cluster.push({ x, y });

                getNeighbors(x, y).forEach(neighbor => {
                    if (grid[neighbor.y][neighbor.x] === 0) {
                        touchesWaterOrUnclaimed = true;
                        return;
                    }
                    const owner = territory[neighbor.y][neighbor.x];
                    if (owner === n.id) {
                        const neighborIndex = neighbor.y * WIDTH + neighbor.x;
                        if (!visited[neighborIndex]) {
                            visited[neighborIndex] = 1;
                            queue[tail++] = neighborIndex;
                        }
                    } else if (owner === null) {
                        touchesWaterOrUnclaimed = true;
                    } else {
                        surroundingOwners.add(owner);
                    }
                });
            }

            // Silent annexation without news log or floating text
            if (!touchesWaterOrUnclaimed && surroundingOwners.size === 1) {
                const conquerorId = surroundingOwners.values().next().value;
                const conqueror = nations[conquerorId];
                if (conqueror) {
                    cluster.forEach(tile => {
                        territory[tile.y][tile.x] = conquerorId;
                    });
                    conqueror.tiles.push(...cluster);
                }
            }
        });

        n.tiles = n.tiles.filter(tile => territory[tile.y][tile.x] === n.id);
    });
}

// --- WAR DECLARATIONS ---

function registerWarPair(nationA, nationB, duration = 0) {
    if (!nationA || !nationB || nationA.id === nationB.id) return false;
    // Every path that starts or propagates a war must respect an active truce.
    // Alliance warfare and legacy save synchronization call this directly.
    if ((nationA.peaceTreaties?.[nationB.id] || 0) > 0 ||
        (nationB.peaceTreaties?.[nationA.id] || 0) > 0) return false;
    if (isOpeningPeaceActive() &&
        nationA.wars?.[nationB.id] === undefined &&
        nationB.wars?.[nationA.id] === undefined) return;
    nationA.wars = nationA.wars || {};
    nationB.wars = nationB.wars || {};
    nationA.wars[nationB.id] = duration;
    nationB.wars[nationA.id] = duration;
    nationA.warStartTiles = nationA.warStartTiles || {};
    nationB.warStartTiles = nationB.warStartTiles || {};
    if (nationA.warStartTiles[nationB.id] === undefined) {
        nationA.warStartTiles[nationB.id] = nationA.tiles.length;
    }
    if (nationB.warStartTiles[nationA.id] === undefined) {
        nationB.warStartTiles[nationA.id] = nationB.tiles.length;
    }
    return true;
}

function isOpeningPeaceActive() {
    return typeof openingPeaceEndsAt === 'number' && Date.now() < openingPeaceEndsAt;
}

function synchronizeWarPairs() {
    Object.values(nations).forEach(nation => {
        if (!nation) return;
        nation.wars = nation.wars || {};
        Object.entries(nation.wars).forEach(([enemyId, duration]) => {
            const enemy = nations[enemyId];
            if (!enemy) {
                delete nation.wars[enemyId];
                return;
            }
            if ((nation.peaceTreaties?.[enemyId] || 0) > 0 ||
                (enemy.peaceTreaties?.[nation.id] || 0) > 0) {
                delete nation.wars[enemyId];
                if (enemy.wars) delete enemy.wars[nation.id];
                if (nation.warStartTiles) delete nation.warStartTiles[enemyId];
                if (enemy.warStartTiles) delete enemy.warStartTiles[nation.id];
                return;
            }
            if (!enemy.wars || enemy.wars[nation.id] === undefined) {
                registerWarPair(nation, enemy, Number(duration) || 0);
            }
        });
    });
}

function declareWar(attackerId, defenderId) {
    let attacker = nations[attackerId];
    let defender = nations[defenderId];
    if (!attacker || !defender || isOpeningPeaceActive()) return;

    if (attacker.id !== playerNationId && Object.keys(attacker.wars).length >= 2) return;

    if (attacker.wars[defenderId] !== undefined) return;
    if (attacker.peaceTreaties[defenderId] && attacker.peaceTreaties[defenderId] > 0) return;
    if (attacker.allianceId && defender.allianceId && attacker.allianceId === defender.allianceId) return;

    registerWarPair(attacker, defender);

    logNews(`⚔️ <b>${attacker.name}</b> declared war on <b>${defender.name}</b>!`);

    if (attacker.tiles.length > 0) {
        let center = attacker.tiles[Math.floor(attacker.tiles.length / 2)];
        addFloatingText(`⚔️ War w/ ${defender.name}`, center.x, center.y, "#e74c3c");
    }

    if (attacker.allianceId && alliances[attacker.allianceId]) {
        let alliance = alliances[attacker.allianceId];
        alliance.members.forEach(allyId => {
            if (allyId !== attackerId && allyId !== playerNationId && nations[allyId]) {
                let ally = nations[allyId];
                if (ally.wars[defenderId] === undefined && (!ally.peaceTreaties[defenderId] || ally.peaceTreaties[defenderId] <= 0)) {
                    registerWarPair(ally, defender);
                    logNews(`🗡️ <b>${ally.name}</b> joined <b>${attacker.name}</b>'s offensive against <b>${defender.name}</b>!`);
                }
            }
        });
    }

    if (defender.allianceId && alliances[defender.allianceId]) {
        let alliance = alliances[defender.allianceId];
        alliance.members.forEach(allyId => {
            if (allyId !== defenderId && allyId !== playerNationId && nations[allyId]) {
                let ally = nations[allyId];
                if (ally.wars[attackerId] === undefined && (!ally.peaceTreaties[attackerId] || ally.peaceTreaties[attackerId] <= 0)) {
                    registerWarPair(ally, attacker);
                    logNews(`🛡️ <b>${ally.name}</b> declared war on <b>${attacker.name}</b> to defend ally <b>${defender.name}</b>!`);
                }
            }
        });
    }
}

function requestAlliance(playerId, targetId) {
    const player = nations[playerId];
    const target = nations[targetId];
    if (!player || !target || player.id !== playerNationId || target.id === player.id) return false;
    if (target.allianceId != null) return false;
    if (player.wars[target.id] !== undefined || target.wars[player.id] !== undefined) return false;
    player.opinions = player.opinions || {};
    target.opinions = target.opinions || {};
    if ((player.opinions[target.id] ?? 50) < 45 || (target.opinions[player.id] ?? 50) < 45) return false;

    let alliance = player.allianceId != null ? alliances[player.allianceId] : null;
    if (!alliance) {
        const allianceId = nextAllianceId++;
        const allianceName = `${ALLIANCE_PREFIXES[Math.floor(Math.random() * ALLIANCE_PREFIXES.length)]} ${player.name}`;
        const allianceColor = generateUniqueAllianceColor();
        alliance = {
            id: allianceId,
            name: allianceName,
            leaderId: player.id,
            color: allianceColor.color,
            hue: allianceColor.hue,
            members: [player.id]
        };
        alliances[allianceId] = alliance;
        player.allianceId = allianceId;
    }
    alliance.members.push(target.id);
    player.allianceTimer = ALLIANCE_DURATION;
    target.allianceId = alliance.id;
    target.allianceTimer = ALLIANCE_DURATION;
    player.peaceTreaties[target.id] = ALLIANCE_DURATION;
    target.peaceTreaties[player.id] = ALLIANCE_DURATION;
    target.opinions[player.id] = Math.max(target.opinions[player.id] ?? 50, 55);
    player.opinions[target.id] = Math.max(player.opinions[target.id] ?? 50, 55);

    logNews(`🤝 <b>${target.name}</b> joined <b>${alliance.name}</b> after an alliance request.`);
    if (player.tiles.length > 0) {
        const center = player.tiles[Math.floor(player.tiles.length / 2)];
        addFloatingText(`🤝 ${alliance.name}`, center.x, center.y, alliance.color);
    }
    return true;
}

function joinExistingAlliance(playerId, memberId) {
    const player = nations[playerId];
    const member = nations[memberId];
    if (!player || !member || player.id !== playerNationId || player.id === member.id) return false;
    const alliance = member.allianceId !== null ? alliances[member.allianceId] : null;
    if (!alliance || player.allianceId !== null || alliance.members.includes(player.id)) return false;

    const members = alliance.members.map(id => nations[id]).filter(Boolean);
    if (members.length < 2 || members.some(nation =>
        player.wars[nation.id] !== undefined || nation.wars[player.id] !== undefined ||
        (player.peaceTreaties[nation.id] || 0) > 0 || (nation.peaceTreaties[player.id] || 0) > 0
    )) return false;

    player.opinions = player.opinions || {};
    if ((player.opinions[member.id] ?? 50) < 45 || (member.opinions?.[player.id] ?? 50) < 45) return false;

    alliance.members.push(player.id);
    player.allianceId = alliance.id;
    player.allianceTimer = ALLIANCE_DURATION;
    members.forEach(nation => {
        player.peaceTreaties[nation.id] = ALLIANCE_DURATION;
        nation.peaceTreaties[player.id] = ALLIANCE_DURATION;
    });

    logNews(`🤝 <b>${player.name}</b> joined the <b>${alliance.name}</b>.`);
    if (player.tiles.length > 0) {
        const center = player.tiles[Math.floor(player.tiles.length / 2)];
        addFloatingText(`🤝 ${alliance.name}`, center.x, center.y, alliance.color);
    }
    return true;
}

function leaveAlliance(nationId) {
    const nation = nations[nationId];
    const alliance = nation?.allianceId != null ? alliances[nation.allianceId] : null;
    if (!nation || nation.id !== playerNationId || !alliance) return false;
    const formerMembers = alliance.members.filter(id => id !== nation.id);
    alliance.members = formerMembers;
    nation.allianceId = null;
    nation.allianceTimer = 0;
    formerMembers.forEach(memberId => {
        delete nation.peaceTreaties?.[memberId];
        if (nations[memberId]?.peaceTreaties) delete nations[memberId].peaceTreaties[nation.id];
    });
    if (formerMembers.length < 2) {
        formerMembers.forEach(memberId => {
            const member = nations[memberId];
            if (member) {
                member.allianceId = null;
                member.allianceTimer = 0;
            }
        });
        delete alliances[alliance.id];
        logNews(`🛡️ The <b>${alliance.name}</b> dissolved after ${nation.name} left.`);
    } else {
        if (alliance.leaderId === nation.id) alliance.leaderId = formerMembers[0];
        logNews(`🛡️ <b>${nation.name}</b> left the <b>${alliance.name}</b>.`);
    }
    return true;
}

function sendAllianceDonation(fromId, toId, amount) {
    const sender = nations[fromId];
    const receiver = nations[toId];
    if (!sender || !receiver || sender.id !== playerNationId || sender.id === receiver.id ||
        sender.allianceId === null || sender.allianceId !== receiver.allianceId ||
        !Number.isSafeInteger(amount) || amount < 1 || sender.gold < amount) return false;

    sender.gold -= amount;
    receiver.gold += amount;
    logNews(`💰 <b>${sender.name}</b> donated $${amount.toLocaleString()} to ally <b>${receiver.name}</b>.`);
    return true;
}

function requestAllianceDonation(requesterId, donorId, requestedAmount) {
    const requester = nations[requesterId];
    const donor = nations[donorId];
    if (!requester || !donor || requester.id !== playerNationId || requester.id === donor.id ||
        requester.allianceId === null || requester.allianceId !== donor.allianceId ||
        !Number.isSafeInteger(requestedAmount) || requestedAmount < 1 || donor.gold < 40) return 0;

    const maximumDonation = Math.floor(donor.gold * 0.3);
    const amount = Math.min(requestedAmount, maximumDonation);
    const opinion = donor.opinions?.[requester.id] ?? 50;
    const acceptanceChance = Math.max(0.1, Math.min(0.95,
        0.35 + opinion / 200 + (requester.gold < donor.gold ? 0.2 : -0.15)
    ));
    if (amount < 1 || Math.random() > acceptanceChance) return 0;

    donor.gold -= amount;
    requester.gold += amount;
    logNews(`💰 Ally <b>${donor.name}</b> donated $${amount.toLocaleString()} to <b>${requester.name}</b>.`);
    return amount;
}

function updateDiplomacyAndFriction() {
    let nationKeys = Object.keys(nations);

    checkEnclaveAnnexation();

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        if (!n.opinions) n.opinions = {};
        if (!n.peaceTreaties) n.peaceTreaties = {};

        if (!isHumanNation(n.id)) processMultiWarPeaceOffers(n);

        nationKeys.forEach(otherId => {
            if (otherId !== n.id && n.opinions[otherId] === undefined) {
                n.opinions[otherId] = Math.floor(35 + Math.random() * 30);
            }
        });

        let neighbors = Array.from(getNeighborNations(n.id));

        neighbors.forEach(neighborId => {
            let neighbor = nations[neighborId];
            if (!neighbor) return;

            let isAlly = (n.allianceId && n.allianceId === neighbor.allianceId);
            if (!isAlly && n.opinions[neighborId] > 0) {
                n.opinions[neighborId] = Math.max(0, n.opinions[neighborId] - 0.03);
            }
        });

        Object.keys(n.opinions).forEach(otherId => {
            let oId = parseInt(otherId);
            if (!neighbors.includes(oId) && n.wars[otherId] === undefined) {
                if (n.opinions[otherId] < 50) n.opinions[otherId] = Math.min(50, n.opinions[otherId] + 0.05);
                else if (n.opinions[otherId] > 50) n.opinions[otherId] = Math.max(50, n.opinions[otherId] - 0.05);
            }
        });

        Object.keys(n.peaceTreaties).forEach(otherId => {
            if (n.peaceTreaties[otherId] > 0) n.peaceTreaties[otherId]--;
            else delete n.peaceTreaties[otherId];
        });
    });
}

function updateAlliancesAndCoalitions(totalLandTiles) {
    let nationKeys = Object.keys(nations);

    let hegemon = null;
    nationKeys.forEach(id => {
        let n = nations[id];
        if (n && totalLandTiles > 0 && (n.tiles.length / totalLandTiles) >= 0.50) {
            hegemon = n;
        }
    });

    if (hegemon && !isOpeningPeaceActive()) {
        let hegemonControl = ((hegemon.tiles.length / totalLandTiles) * 100).toFixed(1);

        nationKeys.forEach(id => {
            let n = nations[id];
            if (!n || n.id === hegemon.id) return;

            let isHegemonAlly = (n.allianceId !== null && hegemon.allianceId !== null && n.allianceId === hegemon.allianceId);
            let hasPeaceWithHegemon = (n.peaceTreaties[hegemon.id] && n.peaceTreaties[hegemon.id] > 0);

            if (!isHegemonAlly && !hasPeaceWithHegemon) {
                if (n.wars[hegemon.id] === undefined && Math.random() < 0.12) {
                    declareWar(n.id, hegemon.id);
                    logNews(`🚨 <b>${n.name}</b> joined Containment War against <b>${hegemon.name}</b> (${hegemonControl}% map share)!`);
                }
            }
        });
    }

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;

        if (n.allianceTimer === undefined) n.allianceTimer = 0;

        if (!isHumanNation(n.id) && n.allianceId === null && Math.random() < 0.05) {
            let potentialPartners = Object.values(nations).filter(other => 
                other.id !== n.id && 
                !isHumanNation(other.id) &&
                n.wars[other.id] === undefined && 
                other.allianceId === null &&
                (n.opinions[other.id] || 50) >= 45 &&
                (other.opinions[n.id] || 50) >= 45
            );

            if (potentialPartners.length > 0) {
                let partner = potentialPartners[Math.floor(Math.random() * potentialPartners.length)];
                let allianceId = nextAllianceId++;
                let allianceName = ALLIANCE_PREFIXES[Math.floor(Math.random() * ALLIANCE_PREFIXES.length)] + " " + n.name;
                let allianceColorObj = generateUniqueAllianceColor();

                alliances[allianceId] = {
                    id: allianceId,
                    name: allianceName,
                    leaderId: n.id,
                    color: allianceColorObj.color,
                    hue: allianceColorObj.hue,
                    members: [n.id, partner.id]
                };

                n.allianceId = allianceId;
                n.allianceTimer = ALLIANCE_DURATION;
                partner.allianceId = allianceId;
                partner.allianceTimer = ALLIANCE_DURATION;

                n.peaceTreaties[partner.id] = 400;
                partner.peaceTreaties[partner.id] = 400;

                logNews(`👑 <b>${n.name}</b> and <b>${partner.name}</b> formed the <b>${allianceName}</b>!`);

                if (n.tiles.length > 0) {
                    let center = n.tiles[Math.floor(n.tiles.length / 2)];
                    addFloatingText(`👑 ${allianceName}`, center.x, center.y, allianceColorObj.color);
                }
            }
        }
    });
}

function checkWarDeclarations() {
    if (isOpeningPeaceActive()) return;
    let nationKeys = Object.keys(nations);

    nationKeys.forEach(id => {
        let n = nations[id];
        if (!n) return;
        if (n.id === playerNationId) return;

        if (Object.keys(n.wars).length >= 2) return;

        let preferredTargetId = n.ai && n.ai.targetId ? n.ai.targetId : null;
        let potentialTargets = new Set(Array.from(getNeighborNations(n.id)));
        if (preferredTargetId && nations[preferredTargetId]) {
            potentialTargets.add(preferredTargetId);
        }

        Array.from(potentialTargets).forEach(targetId => {
            let target = nations[targetId];
            if (!target) return;

            let isSameAlliance = (n.allianceId !== null && n.allianceId === target.allianceId);
            let isAtWar = n.wars[targetId] !== undefined;
            let hasPeaceTreaty = n.peaceTreaties[targetId] && n.peaceTreaties[targetId] > 0;

            if (!isSameAlliance && !isAtWar && !hasPeaceTreaty) {
                let currentOpinion = n.opinions[targetId] || 50;
                let strategicPressure = preferredTargetId === targetId ? 0.25 : 0.1;
                let isAggressive = (n.archetype.type === 'Warlord' || n.archetype.type === 'Expansionist' || n.archetype.type === 'Guardian' || n.ai?.posture === 'aggressive');
                let warThreshold = isAggressive ? 58 : 42;
                let warChance = Math.max(0.01, ((warThreshold - currentOpinion) * 0.0035) * ((n.ai?.aggression || n.archetype.aggressiveness || 0.1) + strategicPressure));

                if (currentOpinion < warThreshold && Math.random() < warChance) {
                    declareWar(n.id, targetId);
                }
            }
        });
    });
}

// ANTI-SNAKE BORDER LOGIC
function canAttackTile(attacker, targetX, targetY) {
    let targetOwnerId = territory[targetY][targetX];
    if (targetOwnerId === attacker.id) return false;

    if (targetOwnerId !== null) {
        let targetNation = nations[targetOwnerId];
        if (targetNation) {
            if (attacker.allianceId !== null && attacker.allianceId === targetNation.allianceId) return false;
            if (attacker.peaceTreaties[targetOwnerId] && attacker.peaceTreaties[targetOwnerId] > 0) return false;
            if (attacker.wars[targetOwnerId] === undefined) return false;
        }
    }

    if (typeof getNeighbors === "function") {
        let nbs = getNeighbors(targetX, targetY);
        let friendlyNeighborCount = 0;

        for (let nb of nbs) {
            if (territory[nb.y] && territory[nb.y][nb.x] === attacker.id) {
                friendlyNeighborCount++;
            }
        }

        if (friendlyNeighborCount < 2 && Math.random() > 0.15) {
            return false;
        }
    }

    return true;
}

function findSeaExpedition(nationId, maxDist = 120) {
    let nation = nations[nationId];
    if (!nation) return null;

    let coastalTiles = nation.tiles.filter(t => window.isCoastal(t.x, t.y));
    if (coastalTiles.length === 0) return null;

    let start = coastalTiles[Math.floor(Math.random() * coastalTiles.length)];
    let queue = [{x: start.x, y: start.y, path: [{x: start.x, y: start.y}], dist: 0}];
    let visited = Array(HEIGHT).fill().map(() => Array(WIDTH).fill(false));
    visited[start.y][start.x] = true;

    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr.dist > maxDist) continue;

        let nbs = getNeighbors(curr.x, curr.y);
        for (let nb of nbs) {
            if (visited[nb.y][nb.x]) continue;
            visited[nb.y][nb.x] = true;

            if (grid[nb.y][nb.x] === 1) {
                let owner = territory[nb.y][nb.x];
                if (owner === null && curr.dist > 3) {
                    return { type: 'colonize', start, target: nb, path: curr.path };
                } else if (owner !== null && owner !== nationId && nation.wars[owner] !== undefined && curr.dist > 4) {
                    return { type: 'invasion', start, target: nb, enemyId: owner, path: curr.path };
                }
            } else if (grid[nb.y][nb.x] === 0) {
                queue.push({ x: nb.x, y: nb.y, path: [...curr.path, nb], dist: curr.dist + 1 });
            }
        }
    }
    return null;
}

function findSeaExpeditionTo(nationId, targetX, targetY, maxDist = 120) {
    const nation = nations[nationId];
    if (!nation || !Number.isInteger(targetX) || !Number.isInteger(targetY) ||
        targetX < 0 || targetX >= WIDTH || targetY < 0 || targetY >= HEIGHT ||
        grid[targetY][targetX] !== 1) return null;

    const targetOwnerId = territory[targetY][targetX];
    const targetNation = targetOwnerId === null ? null : nations[targetOwnerId];
    const isHostileTarget = targetNation &&
        nation.wars?.[targetOwnerId] !== undefined &&
        !(nation.allianceId != null && nation.allianceId === targetNation.allianceId) &&
        !(nation.peaceTreaties?.[targetOwnerId] > 0);
    const type = targetOwnerId === null ? 'colonize' :
        targetOwnerId !== nation.id && isHostileTarget ? 'invasion' : null;
    if (!type) return null;

    const cellCount = WIDTH * HEIGHT;
    const previous = new Int32Array(cellCount);
    previous.fill(-2);
    const distance = new Int16Array(cellCount);
    const queue = new Int32Array(cellCount);
    let head = 0;
    let tail = 0;

    nation.tiles.forEach(tile => {
        if (!window.isCoastal(tile.x, tile.y)) return;
        const startIndex = tile.y * WIDTH + tile.x;
        if (previous[startIndex] !== -2) return;
        previous[startIndex] = -1;
        queue[tail++] = startIndex;
    });

    while (head < tail) {
        const currentIndex = queue[head++];
        const currentX = currentIndex % WIDTH;
        const currentY = Math.floor(currentIndex / WIDTH);
        if (distance[currentIndex] > maxDist) continue;

        for (const neighbor of getNeighbors(currentX, currentY)) {
            if (neighbor.x === targetX && neighbor.y === targetY && distance[currentIndex] >= 4) {
                const path = [];
                let pathIndex = currentIndex;
                while (pathIndex >= 0) {
                    path.push({ x: pathIndex % WIDTH, y: Math.floor(pathIndex / WIDTH) });
                    pathIndex = previous[pathIndex];
                }
                path.reverse();
                return {
                    type,
                    start: path[0],
                    target: { x: targetX, y: targetY },
                    path,
                    enemyId: type === 'invasion' ? targetNation.id : null
                };
            }

            if (grid[neighbor.y][neighbor.x] !== 0) continue;
            const neighborIndex = neighbor.y * WIDTH + neighbor.x;
            if (previous[neighborIndex] !== -2 || distance[currentIndex] >= maxDist) continue;
            previous[neighborIndex] = currentIndex;
            distance[neighborIndex] = distance[currentIndex] + 1;
            queue[tail++] = neighborIndex;
        }
    }
    return null;
}
