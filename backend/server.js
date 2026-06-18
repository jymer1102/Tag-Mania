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

const mazeGrid = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], // Center lane containing portals
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
const tileSize = 40;
const MAP_SIZE = 15 * tileSize; // 600

const DIRECTIONS = [
    {x: 1, y: 0}, {x: -1, y: 0}, {x: 0, y: 1}, {x: 0, y: -1}
];

// PORTAL-AWARE BFS PATHFINDING
function findShortestPath(startGridX, startGridY, targetGridX, targetGridY) {
    if (startGridX === targetGridX && startGridY === targetGridY) return [];
    
    let queue = [ [startGridX, startGridY] ];
    let visited = Array(mazeGrid.length).fill(null).map(() => Array(mazeGrid[0].length).fill(false));
    let parentMap = {};

    // Safeguard grid bounds before searching
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

            // TRACK SEAMLESS PORTAL WRAPS WITHIN THE RADAR LOGIC
            if (ny === 7) {
                if (nx < 0) nx = 14;
                if (nx > 14) nx = 0;
            }

            if (nx >= 0 && nx < 14 && ny >= 0 && ny < 14) {
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

function handleBotSpawningAndRemoval() {
    let humanIds = Object.keys(activePlayers).filter(id => id !== BOT_ID);
    if (humanIds.length <= 1 && !activePlayers[BOT_ID]) {
        activePlayers[BOT_ID] = {
            id: BOT_ID,
            name: "🤖 Practice Bot",
            color: "#6c757d",
            x: 140, 
            y: 60,
            radius: FIXED_RADIUS,
            isIt: true,
            dirX: 1,
            dirY: 0
        };
        if(humanIds.length === 1) activePlayers[humanIds[0]].isIt = false;
    } else if (humanIds.length > 1 && activePlayers[BOT_ID]) {
        delete activePlayers[BOT_ID];
    }
}

function checkBotWallCollision(x, y, radius) {
    // True capsule corner padding calculation to eliminate stickiness
    let buffer = radius - 1.5; 
    let checkPoints = [
        {x: x - buffer, y: y}, {x: x + buffer, y: y},
        {x: x, y: y - buffer}, {x: x, y: y + buffer}
    ];
    for (let pt of checkPoints) {
        let gX = Math.floor(pt.x / tileSize);
        let gY = Math.floor(pt.y / tileSize);
        
        // Exclude portal track lines from collision boundaries
        if (gY === 7 && (gX < 0 || gX >= 15)) continue; 
        
        if (gY < 0 || gY >= mazeGrid.length || gX < 0 || gX >= mazeGrid[0].length || mazeGrid[gY][gX] === 1) {
            return true;
        }
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('playerJoin', (data) => {
        activePlayers[socket.id] = { id: socket.id, name: data.name || "Player", color: data.color || "#007bff", x: 60, y: 60, radius: FIXED_RADIUS, isIt: false };
        handleBotSpawningAndRemoval();
        io.emit('syncPlayers', activePlayers);
    });

    socket.on('playerMove', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = data.x;
            activePlayers[socket.id].y = data.y;
            
            // Check human tag mechanics
            if (activePlayers[socket.id].isIt && tagCooldown === 0) {
                for (let id in activePlayers) {
                    if (id !== socket.id) {
                        let target = activePlayers[id];
                        let dist = Math.sqrt((data.x - target.x)**2 + (data.y - target.y)**2);
                        if (dist < (FIXED_RADIUS * 2)) {
                            activePlayers[socket.id].isIt = false;
                            target.isIt = true;
                            tagCooldown = 3000;
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
        if (activePlayers[socket.id]) delete activePlayers[socket.id];
        handleBotSpawningAndRemoval();
        io.emit('syncPlayers', activePlayers);
    });
});

setInterval(() => {
    if (tagCooldown > 0) {
        tagCooldown -= 16.67;
        if (tagCooldown < 0) tagCooldown = 0;
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

        let currentSpeed = 4.2; 
        let isLunging = (bot.isIt && targetPlayer && minDist < 160);

        if (isLunging && targetPlayer) {
            // LUNGE MODE
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
            // NODE PATH NAVIGATION MODE WITH PORTAL WRAPPING SUPPORT
            let botGridX = Math.floor(bot.x / tileSize);
            let botGridY = Math.floor(bot.y / tileSize);
            
            let destGridX = 1;
            let destGridY = 1;

            if (targetPlayer) {
                destGridX = Math.floor(targetPlayer.x / tileSize);
                destGridY = Math.floor(targetPlayer.y / tileSize);
            }

            let path = findShortestPath(botGridX, botGridY, destGridX, destGridY);

            if (path.length > 0) {
                let nextNode = path[0];
                let trackTargetX = nextNode.x * tileSize + tileSize / 2;
                let trackTargetY = nextNode.y * tileSize + tileSize / 2;

                // Handle sliding alignment changes smoothly across portal wraps
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

        // PHYSICAL SCREEN WRAPPING SYSTEM FOR THE PORTALS
        if (bot.x > MAP_SIZE) bot.x -= MAP_SIZE;
        if (bot.x < 0) bot.x += MAP_SIZE;

        // Bot Tag Verification checks
        if (bot.isIt && tagCooldown === 0) {
            for (let id in activePlayers) {
                if (id !== BOT_ID) {
                    let p = activePlayers[id];
                    let dist = Math.sqrt((bot.x - p.x)**2 + (bot.y - p.y)**2);
                    if (dist < (FIXED_RADIUS * 2)) {
                        bot.isIt = false; p.isIt = true; tagCooldown = 3000;
                        io.emit('syncCooldown', tagCooldown);
                        break;
                    }
                }
            }
        }
        io.emit('syncPlayers', activePlayers);
    }
}, 16.67);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Engine loaded on port ${PORT}`));
