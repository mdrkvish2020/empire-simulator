// --- RENDER ENGINE WITH DYNAMIC RELATIONSHIP BORDERS & ALLIANCE LEADERBOARD ---

// Global array to track active floating world notifications
window.floatingTexts = [];

function addFloatingText(text, x, y, color = "#ffd700") {
    window.floatingTexts.push({
        text: text,
        x: x,
        y: y,
        color: color,
        life: 60, // Visible for 60 frames (~1 sec)
        opacity: 1.0
    });
}

function renderFloatingTexts(ctx, cellW, cellH) {
    for (let i = window.floatingTexts.length - 1; i >= 0; i--) {
        let ft = window.floatingTexts[i];
        
        ctx.save();
        ctx.globalAlpha = ft.opacity;
        ctx.fillStyle = ft.color;
        ctx.font = "bold 12px sans-serif";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        
        // Draw text centered above the tile position
        ctx.fillText(ft.text, ft.x * cellW, ft.y * cellH - (60 - ft.life) * 0.5);
        ctx.restore();

        // Animate floating upward & fade out
        ft.life--;
        ft.opacity = ft.life / 60;

        if (ft.life <= 0) {
            window.floatingTexts.splice(i, 1);
        }
    }
}

function getIncomeColor(val) {
    let min = currentMinIncome;
    let max = currentMaxIncome;
    let t = (max === min) ? 0 : (val - min) / (max - min);
    t = Math.min(1.0, Math.max(0.0, t));

    let r, g, b;
    if (t < 0.25) {
        let k = t / 0.25;
        r = 255; g = Math.round(255 + (68 - 255) * k); b = Math.round(255 + (68 - 255) * k);
    } else if (t < 0.50) {
        let k = (t - 0.25) / 0.25;
        r = Math.round(239 + (34 - 239) * k); g = Math.round(68 + (197 - 68) * k); b = Math.round(68 + (94 - 68) * k);
    } else if (t < 0.75) {
        let k = (t - 0.50) / 0.25;
        r = Math.round(34 + (59 - 34) * k); g = Math.round(197 + (130 - 197) * k); b = Math.round(59 + (246 - 59) * k);
    } else {
        let k = (t - 0.75) / 0.25;
        r = Math.round(59 + (234 - 59) * k); g = Math.round(130 + (179 - 130) * k); b = Math.round(246 + (8 - 246) * k);
    }
    return `rgb(${r},${g},${b})`;
}

// Border Color Evaluator based on Diplomatic Status
function getBorderColor(nationA, nationB) {
    if (!nationA || !nationB) return "#000000";

    // 1. Enemy at War -> RED
    if (nationA.wars && nationA.wars[nationB.id] !== undefined) return "#e74c3c";

    // 2. Allied Nations -> BLUE
    if (nationA.allianceId !== null && nationA.allianceId === nationB.allianceId) return "#2980b9";

    // 3. Peace Treaty -> GREEN
    if (nationA.peaceTreaties && nationA.peaceTreaties[nationB.id] && nationA.peaceTreaties[nationB.id] > 0) return "#2ecc71";

    // 4. Neutral / No Relation -> BLACK
    return "#000000";
}

function render() {
    CANVAS.style.cursor = placementMode === 'naval' ? 'crosshair' : 'grab';
    if (CANVAS.width !== CANVAS.clientWidth || CANVAS.height !== CANVAS.clientHeight) {
        CANVAS.width = CANVAS.clientWidth;
        CANVAS.height = CANVAS.clientHeight;
    }

    const baseCellW = CANVAS.width / WIDTH;
    const baseCellH = CANVAS.height / HEIGHT;

    CTR.fillStyle = "#030712"; 
    CTR.fillRect(0, 0, CANVAS.width, CANVAS.height);

    CTR.save();
    CTR.translate(panX, panY);
    CTR.scale(zoom, zoom);

    const cellW = baseCellW;
    const cellH = baseCellH;
    const minX = Math.max(0, Math.floor(-panX / (zoom * cellW)) - 1);
    const maxX = Math.min(WIDTH - 1, Math.ceil((CANVAS.width - panX) / (zoom * cellW)) + 1);
    const minY = Math.max(0, Math.floor(-panY / (zoom * cellH)) - 1);
    const maxY = Math.min(HEIGHT - 1, Math.ceil((CANVAS.height - panY) / (zoom * cellH)) + 1);

    // 1. Terrain & Country Fills
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            if (grid[y][x] === 1) {
                if (mapMode === 'income') {
                    let totalVal = getBaseTerrainValue(x, y) * tileMultiplier[y][x];
                    CTR.fillStyle = getIncomeColor(totalVal);
                } else if (mapMode === 'alliances') {
                    let ownerId = territory[y][x];
                    let owner = nations[ownerId];
                    if (owner && owner.allianceId && alliances[owner.allianceId]) {
                        CTR.fillStyle = alliances[owner.allianceId].color;
                    } else if (owner) {
                        CTR.fillStyle = owner.color;
                    } else {
                        CTR.fillStyle = terrainType[y][x] === 3 ? "#334155" : (terrainType[y][x] === 2 ? "#1e3a29" : "#1e293b");
                    }
                } else {
                    let ownerId = territory[y][x];
                    if (ownerId && nations[ownerId]) {
                        CTR.fillStyle = nations[ownerId].color;
                    } else {
                        CTR.fillStyle = terrainType[y][x] === 3 ? "#334155" : (terrainType[y][x] === 2 ? "#1e3a29" : "#1e293b");
                    }
                }
                CTR.fillRect(x * cellW, y * cellH, cellW + 0.5, cellH + 0.5);
            }
        }
    }

    if (placementMode === 'naval' && nations[playerNationId]) {
        const player = nations[playerNationId];
        CTR.lineWidth = Math.max(1.5, 2 / zoom);
        CTR.strokeStyle = 'rgba(56, 189, 248, 0.95)';
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (grid[y][x] !== 1 || !window.isCoastal(x, y)) continue;
                const ownerId = territory[y][x];
                const owner = ownerId === null ? null : nations[ownerId];
                const validTarget = ownerId === null ||
                    (owner && ownerId !== player.id &&
                        player.wars?.[ownerId] !== undefined &&
                        !(player.allianceId != null && player.allianceId === owner.allianceId) &&
                        !(player.peaceTreaties?.[ownerId] > 0));
                if (validTarget) CTR.strokeRect(x * cellW + 0.25, y * cellH + 0.25, cellW - 0.5, cellH - 0.5);
            }
        }
    }

    // 2. DYNAMIC DIPLOMATIC BORDER LINES (THICK BORDERS)
    CTR.lineWidth = Math.max(1.0, 2.0 / zoom);
    CTR.lineCap = "round";
    CTR.lineJoin = "round";
    const borderPaths = new Map();
    const addBorderSegment = (color, x1, y1, x2, y2) => {
        let path = borderPaths.get(color);
        if (!path) {
            path = new Path2D();
            borderPaths.set(color, path);
        }
        path.moveTo(x1, y1);
        path.lineTo(x2, y2);
    };

    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            let ownerId = territory[y][x];
            if (ownerId !== null && nations[ownerId]) {
                let nation = nations[ownerId];
                let px = x * cellW;
                let py = y * cellH;

                // Right Border Check
                if (x + 1 < WIDTH) {
                    let rightOwnerId = territory[y][x + 1];
                    if (rightOwnerId !== null && rightOwnerId !== ownerId) {
                        addBorderSegment(getBorderColor(nation, nations[rightOwnerId]),
                            px + cellW, py, px + cellW, py + cellH);
                    }
                }

                // Bottom Border Check
                if (y + 1 < HEIGHT) {
                    let bottomOwnerId = territory[y + 1][x];
                    if (bottomOwnerId !== null && bottomOwnerId !== ownerId) {
                        addBorderSegment(getBorderColor(nation, nations[bottomOwnerId]),
                            px, py + cellH, px + cellW, py + cellH);
                    }
                }

                // Map Edge Checks (Default to Black Border)
                if (x - 1 < 0 || territory[y][x - 1] === null) {
                    addBorderSegment("#000000", px, py, px, py + cellH);
                }
                if (y - 1 < 0 || territory[y - 1][x] === null) {
                    addBorderSegment("#000000", px, py, px + cellW, py);
                }
            }
        }
    }

    borderPaths.forEach((path, color) => {
        CTR.strokeStyle = color;
        CTR.stroke(path);
    });

    const playerNation = nations[playerNationId];
    if (playerNation && playerNation.tiles.length > 0) {
        CTR.save();
        CTR.strokeStyle = "#fbbf24";
        CTR.lineWidth = Math.max(2.2, 3.2 / zoom);
        CTR.shadowColor = "#fbbf24";
        CTR.shadowBlur = Math.max(3, 6 / zoom);
        CTR.beginPath();
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (territory[y][x] !== playerNation.id) continue;
                const px = x * cellW;
                const py = y * cellH;
                if (x === 0 || territory[y][x - 1] !== playerNation.id) {
                    CTR.moveTo(px, py);
                    CTR.lineTo(px, py + cellH);
                }
                if (x === WIDTH - 1 || territory[y][x + 1] !== playerNation.id) {
                    CTR.moveTo(px + cellW, py);
                    CTR.lineTo(px + cellW, py + cellH);
                }
                if (y === 0 || territory[y - 1][x] !== playerNation.id) {
                    CTR.moveTo(px, py);
                    CTR.lineTo(px + cellW, py);
                }
                if (y === HEIGHT - 1 || territory[y + 1][x] !== playerNation.id) {
                    CTR.moveTo(px, py + cellH);
                    CTR.lineTo(px + cellW, py + cellH);
                }
            }
        }
        CTR.stroke();
        CTR.restore();

        if (placementMode) {
            const validTiles = new Set();
            if (placementMode === 'city') {
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        if (territory[y][x] === playerNation.id &&
                            canBuildCityAt(playerNation, x, y) &&
                            playerNation.gold >= getNewCityCost(playerNation)) {
                            validTiles.add(`${x},${y}`);
                        }
                    }
                }
            }
            CTR.save();
            CTR.fillStyle = "rgba(250, 204, 21, 0.42)";
            CTR.strokeStyle = "#facc15";
            CTR.lineWidth = Math.max(1.4, 2 / zoom);
            validTiles.forEach(key => {
                const [x, y] = key.split(',').map(Number);
                CTR.fillRect(x * cellW, y * cellH, cellW, cellH);
                CTR.strokeRect(x * cellW, y * cellH, cellW, cellH);
            });
            CTR.restore();
        }

        if (playerNation._renderCentroidYear !== year ||
            playerNation._renderCentroidTileCount !== playerNation.tiles.length) {
            let sumX = 0, sumY = 0;
            playerNation.tiles.forEach(tile => {
                sumX += tile.x;
                sumY += tile.y;
            });
            playerNation._renderCentroidX = (sumX / playerNation.tiles.length) * cellW + cellW / 2;
            playerNation._renderCentroidY = (sumY / playerNation.tiles.length) * cellH + cellH / 2;
            playerNation._renderCentroidYear = year;
            playerNation._renderCentroidTileCount = playerNation.tiles.length;
        }
        CTR.save();
        CTR.font = `bold ${Math.max(12, 16 / zoom)}px sans-serif`;
        CTR.textAlign = "center";
        CTR.textBaseline = "bottom";
        CTR.strokeStyle = "#111827";
        CTR.lineWidth = 3;
        CTR.strokeText("👑", playerNation._renderCentroidX, playerNation._renderCentroidY - Math.max(8, 10 / zoom));
        CTR.fillStyle = "#fbbf24";
        CTR.fillText("👑", playerNation._renderCentroidX, playerNation._renderCentroidY - Math.max(8, 10 / zoom));
        CTR.restore();
    }

    // 3. Render Cities
    cities.forEach(c => {
        if (c.x < minX || c.x > maxX || c.y < minY || c.y > maxY) return;
        let cx = c.x * cellW + cellW / 2;
        let cy = c.y * cellH + cellH / 2;
        let baseRadius = Math.max(2.0, cellW * 0.9);

        CTR.fillStyle = c.level >= 80 ? "#ffd700" : "#ffffff";
        CTR.strokeStyle = "#000000";
        CTR.lineWidth = 1.0;
        CTR.beginPath();
        CTR.arc(cx, cy, baseRadius, 0, Math.PI * 2);
        CTR.fill();
        CTR.stroke();
    });

    // 4. Render Ships
    ships.forEach(ship => {
        let n = nations[ship.nationId];
        if (!n || ship.path.length < 2) return;

        let p = Math.min(ship.progress, ship.path.length - 1);
        let idx = Math.floor(p);
        let t = p - idx;

        let p1 = ship.path[idx];
        let p2 = ship.path[Math.min(idx + 1, ship.path.length - 1)];

        let interpolatedX = p1.x + (p2.x - p1.x) * t;
        let interpolatedY = p1.y + (p2.y - p1.y) * t;
        if (interpolatedX < minX || interpolatedX > maxX || interpolatedY < minY || interpolatedY > maxY) return;

        let sx = interpolatedX * cellW + cellW / 2;
        let sy = interpolatedY * cellH + cellH / 2;

        CTR.fillStyle = n.color;
        CTR.strokeStyle = "#ffffff";
        CTR.lineWidth = 1.2;
        CTR.beginPath();
        CTR.arc(sx, sy, Math.max(2.5, cellW * 0.8), 0, Math.PI * 2);
        CTR.fill();
        CTR.stroke();
    });

    // 5. Country Name Labels
    if (mapMode !== 'income') {
        Object.values(nations).forEach(n => {
            if (n.tiles.length < 30) return;

            if (n._renderCentroidYear !== year ||
                n._renderCentroidTileCount !== n.tiles.length) {
                let sumX = 0, sumY = 0;
                n.tiles.forEach(t => { sumX += t.x; sumY += t.y; });
                n._renderCentroidX = (sumX / n.tiles.length) * cellW + cellW / 2;
                n._renderCentroidY = (sumY / n.tiles.length) * cellH + cellH / 2;
                n._renderCentroidYear = year;
                n._renderCentroidTileCount = n.tiles.length;
            }
            const centroidX = n._renderCentroidX;
            const centroidY = n._renderCentroidY;
            if (centroidX < minX * cellW || centroidX > (maxX + 1) * cellW ||
                centroidY < minY * cellH || centroidY > (maxY + 1) * cellH) return;

            let labelText = mapMode === 'alliances' && n.allianceId && alliances[n.allianceId] ? 
                `${n.name} [${alliances[n.allianceId].name}]` : n.name;

            let fontSize = Math.max(8, Math.min(14, 11 / Math.sqrt(zoom)));
            CTR.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
            CTR.textAlign = "center";
            CTR.textBaseline = "middle";

            CTR.strokeStyle = "#000000";
            CTR.lineWidth = 2.5;
            CTR.strokeText(labelText, centroidX, centroidY);

            CTR.fillStyle = "#ffffff";
            CTR.fillText(labelText, centroidX, centroidY);
        });
    }

    // 6. Battle counts
    const now = Date.now();
    battleMarkers = battleMarkers.filter(marker => marker.expiresAt > now);
    if (zoom >= 1.5) battleMarkers.forEach(marker => {
        const nationA = nations[marker.nationAId];
        const nationB = nations[marker.nationBId];
        if (!nationA || !nationB || !Array.isArray(marker.frontFlags)) return;

        const troopProgress = Math.min(1, (now - marker.troopTransitionAt) / 600);
        const nationATroops = Math.round(marker.previousNationATroops +
            (marker.nationATroops - marker.previousNationATroops) * troopProgress);
        const nationBTroops = Math.round(marker.previousNationBTroops +
            (marker.nationBTroops - marker.previousNationBTroops) * troopProgress);
        const activeFronts = marker.frontFlags.filter(flag => flag.expiresAt > now);
        marker.frontFlags = activeFronts;
        if (activeFronts.length === 0) return;

        let totalWeight = 0;
        let weightedX = 0;
        let weightedY = 0;
        let weightedNormalX = 0;
        let weightedNormalY = 0;
        let newestFront = activeFronts[0];
        activeFronts.forEach(front => {
            const age = now - front.updatedAt;
            const weight = 1 - Math.min(0.75, age / 4000);
            const frontAX = front.nationAX * cellW;
            const frontAY = front.nationAY * cellH;
            const frontBX = front.nationBX * cellW;
            const frontBY = front.nationBY * cellH;
            const normalX = frontBX - frontAX;
            const normalY = frontBY - frontAY;
            const normalLength = Math.hypot(normalX, normalY) || 1;
            weightedX += (frontAX + frontBX) * 0.5 * weight;
            weightedY += (frontAY + frontBY) * 0.5 * weight;
            weightedNormalX += normalX / normalLength * weight;
            weightedNormalY += normalY / normalLength * weight;
            totalWeight += weight;
            if (front.updatedAt > newestFront.updatedAt) newestFront = front;
        });
        const targetCenterX = weightedX / totalWeight;
        const targetCenterY = weightedY / totalWeight;
        let averageNormalLength = Math.hypot(weightedNormalX, weightedNormalY);
        if (averageNormalLength < totalWeight * 0.15) {
            const newestAX = newestFront.nationAX * cellW;
            const newestAY = newestFront.nationAY * cellH;
            weightedNormalX = newestFront.nationBX * cellW - newestAX;
            weightedNormalY = newestFront.nationBY * cellH - newestAY;
            averageNormalLength = Math.hypot(weightedNormalX, weightedNormalY) || 1;
        }
        const normalUnitX = weightedNormalX / averageNormalLength;
        const normalUnitY = weightedNormalY / averageNormalLength;
        let targetLabelAngle = Math.atan2(normalUnitY, normalUnitX) + Math.PI / 2;
        if (targetLabelAngle > Math.PI / 2) targetLabelAngle -= Math.PI;
        if (targetLabelAngle < -Math.PI / 2) targetLabelAngle += Math.PI;

        if (!Number.isFinite(marker.labelX) || !Number.isFinite(marker.labelY) ||
            !Number.isFinite(marker.labelAngle)) {
            marker.labelX = targetCenterX;
            marker.labelY = targetCenterY;
            marker.labelAngle = targetLabelAngle;
        } else {
            const elapsed = marker.labelUpdatedAt ? Math.max(0, now - marker.labelUpdatedAt) : 0;
            const easing = 1 - Math.exp(-elapsed / 300);
            marker.labelX += (targetCenterX - marker.labelX) * easing;
            marker.labelY += (targetCenterY - marker.labelY) * easing;
            let angleDifference = targetLabelAngle - marker.labelAngle;
            if (angleDifference > Math.PI / 2) angleDifference -= Math.PI;
            if (angleDifference < -Math.PI / 2) angleDifference += Math.PI;
            marker.labelAngle += angleDifference * easing;
            if (marker.labelAngle > Math.PI / 2) marker.labelAngle -= Math.PI;
            if (marker.labelAngle < -Math.PI / 2) marker.labelAngle += Math.PI;
        }
        marker.labelUpdatedAt = now;
        const centerX = marker.labelX;
        const centerY = marker.labelY;

        const flagSize = Math.max(10 / zoom, Math.min(cellW, cellH) * 0.9);
        const flagPoleHeight = flagSize * 0.9;
        const drawFlag = (x, y, color) => {
            const poleX = x - flagSize * 0.4;
            const poleTop = y - flagPoleHeight / 2;
            CTR.strokeStyle = '#ffffff';
            CTR.lineWidth = Math.max(0.8, 0.8 / zoom);
            CTR.beginPath();
            CTR.moveTo(poleX, poleTop);
            CTR.lineTo(poleX, poleTop + flagPoleHeight);
            CTR.stroke();
            CTR.fillStyle = color;
            CTR.fillRect(poleX, poleTop, flagSize, flagSize * 0.62);
            CTR.strokeStyle = '#000000';
            CTR.lineWidth = Math.max(0.6, 0.7 / zoom);
            CTR.strokeRect(poleX, poleTop, flagSize, flagSize * 0.62);
        };
        activeFronts.forEach(front => {
            const attackerX = front.attackerX + 0.5;
            const attackerY = front.attackerY + 0.5;
            const defenderX = front.defenderX + 0.5;
            const defenderY = front.defenderY + 0.5;
            const centerMapX = (attackerX + defenderX) / 2;
            const centerMapY = (attackerY + defenderY) / 2;
            if (centerMapX < minX - 2 || centerMapX > maxX + 2 ||
                centerMapY < minY - 2 || centerMapY > maxY + 2) return;

            const attackerColor = front.attackerId === nationA.id ? nationA.color : nationB.color;
            const defenderColor = front.attackerId === nationA.id ? nationB.color : nationA.color;
            const attackerScreenX = attackerX * cellW;
            const attackerScreenY = attackerY * cellH;
            const defenderScreenX = defenderX * cellW;
            const defenderScreenY = defenderY * cellH;
            drawFlag(
                attackerScreenX + (defenderScreenX - attackerScreenX) * 0.22,
                attackerScreenY + (defenderScreenY - attackerScreenY) * 0.22,
                attackerColor
            );
            drawFlag(
                defenderScreenX + (attackerScreenX - defenderScreenX) * 0.22,
                defenderScreenY + (attackerScreenY - defenderScreenY) * 0.22,
                defenderColor
            );
        });

        const mapCenterX = centerX / cellW;
        const mapCenterY = centerY / cellH;
        if (mapCenterX < minX - 2 || mapCenterX > maxX + 2 ||
            mapCenterY < minY - 2 || mapCenterY > maxY + 2) return;
        const labelAngle = marker.labelAngle;
        const fontSize = 22 / zoom;
        const labelGap = 4 / zoom;
        const labelOffset = Math.max(Math.min(cellW, cellH) * 0.5, (fontSize + labelGap) / 2);
        CTR.save();
        CTR.font = `bold ${fontSize}px sans-serif`;
        CTR.textAlign = 'center';
        CTR.textBaseline = 'middle';

        [
            {
                x: centerX - normalUnitX * labelOffset,
                y: centerY - normalUnitY * labelOffset,
                troops: nationATroops,
                color: nationA.color
            },
            {
                x: centerX + normalUnitX * labelOffset,
                y: centerY + normalUnitY * labelOffset,
                troops: nationBTroops,
                color: nationB.color
            }
        ].forEach(label => {
            CTR.save();
            CTR.translate(label.x, label.y);
            CTR.rotate(labelAngle);
            CTR.lineJoin = 'round';
            CTR.strokeStyle = '#000000';
            CTR.lineWidth = 4 / zoom;
            CTR.strokeText(label.troops.toLocaleString('en-US'), 0, 0);
            CTR.fillStyle = '#ffffff';
            CTR.fillText(label.troops.toLocaleString('en-US'), 0, 0);
            CTR.restore();
        });
        CTR.restore();
    });

    // 7. Floating World Notifications
    renderFloatingTexts(CTR, cellW, cellH);

    CTR.restore();

}