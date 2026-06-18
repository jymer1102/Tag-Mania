const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST"] }));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let activePlayers = {};
let tagCooldown = 0;
const BOT_ID = "SERVER_BOT_999";
const FIXED_RADIUS = 14; 
const wallThickness = 16;

const mazeGrid = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], 
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
const tileSize = 40;
const MAP_SIZE = 15 * tileSize;

let wallSegments = [];
for (let r = 0; r < mazeGrid.length; r++) {
    for (let c = 0; c < mazeGrid[r].length; c++) {
        if (mazeGrid[r][c] === 1) {
            let startX = c * tileSize + tileSize / 2;
            let startY = r * tileSize + tileSize / 2;
            if (c + 1 < mazeGrid[r].length && mazeGrid[r][c + 1] === 1) {
                wallSegments.push({ x1: startX, y1: startY, x2: (c + 1) * tileSize + tileSize / 2, y2: startY });
            }
            if (r + 1 < mazeGrid.length && mazeGrid[r + 1][c] === 1) {
                wallSegments.push({ x1: startX, y1: startY, x2: startX, y2: (r + 1) * tileSize + tileSize / 2 });
            }
        }
    }
}

const DIRECTIONS = [
    {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
];

function findShortestPath(startGridX, startGridY, targetGridX, targetGridY) {
    if (startGridX === targetGridX && startGridY === targetGridY) return [];
    
    let queue = [ [startGridX, startGridY] ];
    let visited = Array(mazeGrid.length).fill(null).map(() => Array(mazeGrid[0].length).fill(false));
    let parentMap = {};

    startGridX = Math.max(0, Math.min(14, startGridX));
    startGridY = Math.max(0, Math.min(14, startGridY));
    visited[startGridY][startGridX] = true;

    while (queue.length > 0) {
        let [cx, cy] = queue.shift();

        if (cx === targetGridX && cy === targetGridY) {
            let path = [];
            let key = `${cx},${cy}`;
            while (key) {
                let p = parentMap[key];
                if (!p) break;
                path.push(p.current);
                key = p.parentKey;
            }
            return path.reverse(); 
        }

        for (let dir of DIRECTIONS) {
            let nx = cx + dir.x;
            let ny = cy + dir.y;

            if (ny === 7) {
                if (nx < 0) nx = 14;
                if (nx > 14) nx = 0;
            }

            if (nx >= 0 && nx < 15 && ny >= 0 && ny < 15) {
                if (mazeGrid[ny][nx] === 0 && !visited[ny][nx]) {
                    visited[ny][nx] = true;
                    parentMap[`${nx},${ny}`] = { current: {x: nx, y: ny}, parentKey: `${cx},${cy}` };
                    queue.push([nx, ny]);
                }
            }
        }
    }
    return [];
}

function lineIntersects(x1, y1, x2, y2, x3, y3, x4, y4) {
    let det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
    if (det === 0) return false;
    let lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
    let gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;
    return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

function checkLineOfSight(x1, y1, x2, y2) {
    for (let seg of wallSegments) {
        if (lineIntersects(x1, y1, x2, y2, seg.x1, seg.y1, seg.x2, seg.y2)) {
            return false;
        }
    }
    return true;
}

function ensureSomeoneIsIt() {
    let ids = Object.keys(activePlayers);
    if (ids.length === 0) return;
    
    let itCount = ids.filter(id => activePlayers[id].isIt).length;
    if (itCount === 0) {
        if (activePlayers[BOT_ID]) activePlayers[BOT_ID].isIt = true;
        else activePlayers[ids[0]].isIt = true;
    }
}

function handleBotSpawningAndRemoval() {
    let humanIds = Object.keys(activePlayers).filter(id => id !== BOT_ID);
    if (humanIds.length <= 1 && !activePlayers[BOT_ID]) {
        activePlayers[BOT_ID] = {
            id: BOT_ID,
            name: "🤖 Practice Bot",
            color: "#6c757d",
            x: 540, 
            y: 540,
            radius: FIXED_RADIUS,
            isIt: true,
            dirX: -1,
            dirY: 0
        };
        if(humanIds.length === 1) activePlayers[humanIds[0]].isIt = false;
    } else if (humanIds.length > 1 && activePlayers[BOT_ID]) {
        delete activePlayers[BOT_ID];
    }
    ensureSomeoneIsIt();
}

function checkBotWallCollision(px, py, radius) {
    if (py > tileSize * 6.6 && py < tileSize * 7.4) {
        if (px < tileSize * 0.5 || px > MAP_SIZE - (tileSize * 0.5)) return false;
    }
    for (let seg of wallSegments) {
        let l2 = (seg.x1 - seg.x2) ** 2 + (seg.y1 - seg.y2) ** 2;
        let t = 0;
        if (l2 !== 0) {
            t = ((px - seg.x1) * (seg.x2 - seg.x1) + (py - seg.y1) * (seg.y2 - seg.y1)) / l2;
            t = Math.max(0, Math.min(1, t));
        }
        let closestX = seg.x1 + t * (seg.x2 - seg.x1);
        let closestY = seg.y1 + t * (seg.y2 - seg.y1);
        let dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
        if (dist < (radius + (wallThickness / 2))) return true;
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('playerJoin', (data) => {
        activePlayers[socket.id] = { id: socket.id, name: data.name || "Player", color: data.color || "#007bff", x: 60, y: 60, radius: FIXED_RADIUS, isIt: false };
        handleBotSpawningAndRemoval();
        io.emit('systemMessage', `📢 ${activePlayers[socket.id].name} joined the arena!`);
        io.emit('syncPlayers', activePlayers);
    });

    socket.on('playerMove', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = data.x;
            activePlayers[socket.id].y = data.y;
            
            if (activePlayers[socket.id].isIt && tagCooldown === 0) {
                for (let id in activePlayers) {
                    if (id !== socket.id) {
                        let target = activePlayers[id];
                        let dist = Math.sqrt((activePlayers[socket.id].x - target.x)**2 + (activePlayers[socket.id].y - target.y)**2);
                        if (dist < (FIXED_RADIUS * 2)) {
                            activePlayers[socket.id].isIt = false;
                            target.isIt = true;
                            tagCooldown = 3000; 
                            io.emit('systemMessage', `💥 ${activePlayers[socket.id].name} tagged ${target.name}! 3s FREEZE!`);
                            io.emit('syncCooldown', tagCooldown);
                            break;
                        }
                    }
                }
            }
            io.emit('syncPlayers', activePlayers);
        }
    });

    socket.on('disconnect', () => {
        if (activePlayers[socket.id]) {
            io.emit('systemMessage', `❌ ${activePlayers[socket.id].name} left.`);
            let wasIt = activePlayers[socket.id].isIt;
            delete activePlayers[socket.id];
            if (wasIt) ensureSomeoneIsIt();
        }
        handleBotSpawningAndRemoval();
        io.emit('syncPlayers', activePlayers);
    });
});

setInterval(() => {
    if (tagCooldown > 0) {
        tagCooldown -= 16.67;
        if (tagCooldown < 0) {
            tagCooldown = 0;
            io.emit('syncCooldown', 0);
        }
    }

    if (activePlayers[BOT_ID]) {
        let bot = activePlayers[BOT_ID];
        let targetPlayer = null;
        let minDist = 999999;
        
        for (let id in activePlayers) {
            if (id !== BOT_ID) {
                let dist = Math.sqrt((activePlayers[id].x - bot.x)**2 + (activePlayers[id].y - bot.y)**2);
                if (dist < minDist) { minDist = dist; targetPlayer = activePlayers[id]; }
            }
        }

        let currentSpeed = (bot.isIt && tagCooldown > 0) ? 0 : 4.2; 
        
        let hasLOS = targetPlayer ? checkLineOfSight(bot.x, bot.y, targetPlayer.x, targetPlayer.y) : false;
        let isLunging = (bot.isIt && tagCooldown === 0 && targetPlayer && minDist < 160 && hasLOS);

        if (currentSpeed > 0) {
            if (isLunging && targetPlayer) {
                let angleToTarget = Math.atan2(targetPlayer.y - bot.y, targetPlayer.x - bot.x);
                let nextX = bot.x + Math.cos(angleToTarget) * currentSpeed;
                let nextY = bot.y + Math.sin(angleToTarget) * currentSpeed;

                if (!checkBotWallCollision(nextX, nextY, bot.radius)) {
                    bot.x = nextX; bot.y = nextY;
                } else if (!checkBotWallCollision(nextX, bot.y, bot.radius)) {
                    bot.x = nextX;
                } else if (!checkBotWallCollision(bot.x, nextY, bot.radius)) {
                    bot.y = nextY;
                }
            } else {
                let botGridX = Math.floor(bot.x / tileSize);
                let botGridY = Math.floor(bot.y / tileSize);
                
                let destGridX = 1;
                let destGridY = 1;

                if (targetPlayer && !bot.isIt) {
                    destGridX = targetPlayer.x > 300 ? 1 : 13;
                    destGridY = targetPlayer.y > 300 ? 1 : 13;
                } else if (targetPlayer) {
                    destGridX = Math.floor(targetPlayer.x / tileSize);
                    destGridY = Math.floor(targetPlayer.y / tileSize);
                }

                let path = findShortestPath(botGridX, botGridY, destGridX, destGridY);

                if (path.length > 0) {
                    let nextNode = path[0];
                    let trackTargetX = nextNode.x * tileSize + tileSize / 2;
                    let trackTargetY = nextNode.y * tileSize + tileSize / 2;

                    if (Math.abs(trackTargetX - bot.x) > 300) {
                        if (bot.x < trackTargetX) bot.x -= currentSpeed;
                        else bot.x += currentSpeed;
                    } else {
                        let angle = Math.atan2(trackTargetY - bot.y, trackTargetX - bot.x);
                        bot.x += Math.cos(angle) * currentSpeed;
                        bot.y += Math.sin(angle) * currentSpeed;
                    }
                } else {
                    bot.x += bot.dirX * currentSpeed;
                    bot.y += bot.dirY * currentSpeed;
                }
            }
        }

        if (bot.x > MAP_SIZE) bot.x -= MAP_SIZE;
        if (bot.x < 0) bot.x += MAP_SIZE;

        if (bot.isIt && tagCooldown === 0) {
            for (let id in activePlayers) {
                if (id !== BOT_ID) {
                    let p = activePlayers[id];
                    let dist = Math.sqrt((bot.x - p.x)**2 + (bot.y - p.y)**2);
                    if (dist < (FIXED_RADIUS * 2)) {
                        bot.isIt = false; p.isIt = true; 
                        tagCooldown = 3000; 
                        io.emit('systemMessage', `💥 Bot tagged ${p.name}! 3s FREEZE!`);
                        io.emit('syncCooldown', tagCooldown);
                        break;
                    }
                }
            }
        }
    }
    
    ensureSomeoneIsIt();
    io.emit('syncPlayers', activePlayers);
}, 16.67);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Engine loaded on port ${PORT}`));
