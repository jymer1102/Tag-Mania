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

const DIRECTIONS = [
    {x: 1, y: 0},  // Right
    {x: -1, y: 0}, // Left
    {x: 0, y: 1},  // Down
    {x: 0, y: -1}  // Up
];

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
        if(humanIds.length === 1) {
            activePlayers[humanIds[0]].isIt = false;
        }
    } 
    else if (humanIds.length > 1 && activePlayers[BOT_ID]) {
        delete activePlayers[BOT_ID];
        io.emit('systemMessage', "🤖 Training Bot left. Real match active!");
    }
}

function checkBotWallCollision(x, y, radius) {
    let buffer = radius + 2;
    let checkPoints = [
        {x: x - buffer, y: y}, {x: x + buffer, y: y},
        {x: x, y: y - buffer}, {x: x, y: y + buffer}
    ];
    for (let pt of checkPoints) {
        let gX = Math.floor(pt.x / tileSize);
        let gY = Math.floor(pt.y / tileSize);
        if (gY < 0 || gY >= mazeGrid.length || gX < 0 || gX >= mazeGrid[0].length || mazeGrid[gY][gX] === 1) {
            return true;
        }
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('playerJoin', (data) => {
        activePlayers[socket.id] = {
            id: socket.id,
            name: data.name || "Player",
            color: data.color || "#007bff",
            x: 60, 
            y: 60,
            radius: FIXED_RADIUS,
            isIt: false
        };

        handleBotSpawningAndRemoval();
        io.emit('systemMessage', `👋 ${activePlayers[socket.id].name} entered.`);
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
                        let dist = Math.sqrt((data.x - target.x)**2 + (data.y - target.y)**2);
                        if (dist < (FIXED_RADIUS * 2)) {
                            activePlayers[socket.id].isIt = false;
                            target.isIt = true;
                            tagCooldown = 3000;
                            io.emit('systemMessage', `💥 ${activePlayers[socket.id].name} tagged ${target.name}!`);
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
            delete activePlayers[socket.id];
        }
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
                if (dist < minDist) {
                    minDist = dist;
                    targetPlayer = activePlayers[id];
                }
            }
        }

        // MATCH PLAYER SPEED: Exactly 4.2 all the time
        let currentSpeed = 4.2; 
        let isLunging = (bot.isIt && targetPlayer && minDist < 140);

        if (isLunging && targetPlayer) {
            let angleToTarget = Math.atan2(targetPlayer.y - bot.y, targetPlayer.x - bot.x);
            let dx = Math.cos(angleToTarget) * currentSpeed;
            let dy = Math.sin(angleToTarget) * currentSpeed;

            let nextX = bot.x + dx;
            let nextY = bot.y + dy;

            if (!checkBotWallCollision(nextX, nextY, bot.radius)) {
                bot.x = nextX;
                bot.y = nextY;
            } else if (!checkBotWallCollision(nextX, bot.y, bot.radius)) {
                bot.x = nextX;
            } else if (!checkBotWallCollision(bot.x, nextY, bot.radius)) {
                bot.y = nextY;
            }
        } else {
            let nextPatrolX = bot.x + bot.dirX * currentSpeed;
            let nextPatrolY = bot.y + bot.dirY * currentSpeed;

            if (checkBotWallCollision(nextPatrolX, nextPatrolY, bot.radius) || Math.random() < 0.02) {
                let validDirections = DIRECTIONS.filter(d => {
                    let testX = bot.x + d.x * 15;
                    let testY = bot.y + d.y * 15;
                    return !checkBotWallCollision(testX, testY, bot.radius);
                });

                if (validDirections.length > 0) {
                    let choice = validDirections[Math.floor(Math.random() * validDirections.length)];
                    bot.dirX = choice.x;
                    bot.dirY = choice.y;
                } else {
                    bot.dirX *= -1;
                    bot.dirY *= -1;
                }
            }

            bot.x += bot.dirX * currentSpeed;
            bot.y += bot.dirY * currentSpeed;
        }

        if (bot.x > 600) bot.x = 0;
        if (bot.x < 0) bot.x = 600;

        if (bot.isIt && tagCooldown === 0) {
            for (let id in activePlayers) {
                if (id !== BOT_ID) {
                    let p = activePlayers[id];
                    let dist = Math.sqrt((bot.x - p.x)**2 + (bot.y - p.y)**2);
                    if (dist < (FIXED_RADIUS * 2)) {
                        bot.isIt = false;
                        p.isIt = true;
                        tagCooldown = 3000;
                        io.emit('systemMessage', `💥 Bot crowned ${p.name} IT!`);
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
