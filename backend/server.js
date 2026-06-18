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
let cooldownTimer = null;

const TILE_SIZE = 40; 
const BOT_ID = "SERVER_NPC_BOT";

const mazeGrid = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0], 
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Helper to count human players
function getHumanCount() {
    return Object.keys(activePlayers).filter(id => id !== BOT_ID).length;
}

// Check if any player is IT
function checkIfSomeoneIsIt() {
    let hasIt = Object.values(activePlayers).some(p => p.isIt);
    if (!hasIt && Object.keys(activePlayers).length > 0) {
        let firstId = Object.keys(activePlayers)[0];
        activePlayers[firstId].isIt = true;
    }
}

// Autonomous Simple Bot Logic
let botDirectionChange = 0;
let botVX = 1;
let botVY = 0;

function updateBotState() {
    const humans = getHumanCount();
    
    // Rule: Join if alone (1 human), leave if > 1 humans or 0 humans
    if (humans === 1 && !activePlayers[BOT_ID]) {
        activePlayers[BOT_ID] = {
            id: BOT_ID,
            name: "[BOT] Training Dummy",
            color: "#9e9e9e",
            x: 2 * TILE_SIZE + 20,
            y: 2 * TILE_SIZE + 20,
            radius: 11,
            isIt: false
        };
        checkIfSomeoneIsIt();
        io.emit('playerNotification', { message: "[BOT] Training Dummy joined the arena." });
        io.emit('syncPlayers', activePlayers);
    } else if ((humans > 1 || humans === 0) && activePlayers[BOT_ID]) {
        delete activePlayers[BOT_ID];
        checkIfSomeoneIsIt();
        io.emit('syncPlayers', activePlayers);
    }

    // Move Bot if active
    if (activePlayers[BOT_ID]) {
        let bot = activePlayers[BOT_ID];
        botDirectionChange++;
        if (botDirectionChange > 40) {
            const dirs = [[1,0], [-1,0], [0,1], [0,-1]];
            let choice = dirs[Math.floor(Math.random() * dirs.length)];
            botVX = choice[0] * 2.5;
            botVY = choice[1] * 2.5;
            botDirectionChange = 0;
        }
        
        bot.x += botVX;
        bot.y += botVY;

        // Soft boundaries for bot map restrictions
        if (bot.x < 40) bot.x = 40;
        if (bot.x > 560) bot.x = 560;
        if (bot.y < 40) bot.y = 40;
        if (bot.y > 560) bot.y = 560;

        // Bot Tagging Logic when IT
        if (bot.isIt && tagCooldown === 0) {
            for (let id in activePlayers) {
                if (id !== BOT_ID) {
                    let human = activePlayers[id];
                    let d = Math.sqrt((bot.x - human.x)**2 + (bot.y - human.y)**2);
                    if (d < (bot.radius + human.radius)) {
                        triggerTagSwitch(id);
                        break;
                    }
                }
            }
        }
        io.emit('syncPlayers', activePlayers);
    }
}
setInterval(updateBotState, 1000 / 30); // 30 FPS updates for bot positioning

function triggerTagSwitch(taggedId) {
    if (tagCooldown > 0) return;
    
    for (let id in activePlayers) { activePlayers[id].isIt = false; }
    if (activePlayers[taggedId]) {
        activePlayers[taggedId].isIt = true;
        tagCooldown = 2500; 
        io.emit('syncCooldown', tagCooldown);
        
        if (cooldownTimer) clearInterval(cooldownTimer);
        cooldownTimer = setInterval(() => {
            tagCooldown -= 100;
            if (tagCooldown <= 0) {
                tagCooldown = 0;
                clearInterval(cooldownTimer);
            }
            io.emit('syncCooldown', tagCooldown);
        }, 100);
    }
}

io.on('connection', (socket) => {
    socket.on('playerJoin', (data) => {
        activePlayers[socket.id] = {
            id: socket.id,
            name: data.name || "Player",
            color: data.color || "#007bff",
            x: TILE_SIZE * 1.5,
            y: TILE_SIZE * 1.5,
            radius: data.radius || 11,
            isIt: Object.keys(activePlayers).length === 0 
        };
        checkIfSomeoneIsIt();
        
        io.emit('playerNotification', { message: `${activePlayers[socket.id].name} joined the game` });
        io.emit('syncPlayers', activePlayers);
    });

    socket.on('playerMove', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = data.x;
            activePlayers[socket.id].y = data.y;
            socket.broadcast.emit('syncPlayers', activePlayers);
        }
    });

    socket.on('tagCollision', (data) => {
        if (activePlayers[socket.id] && activePlayers[socket.id].isIt) {
            triggerTagSwitch(data.taggedId);
        }
    });

    socket.on('disconnect', () => {
        if (activePlayers[socket.id]) {
            let leftName = activePlayers[socket.id].name;
            delete activePlayers[socket.id];
            checkIfSomeoneIsIt();
            io.emit('playerNotification', { message: `${leftName} left the game` });
            io.emit('syncPlayers', activePlayers);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Running dynamically on port ${PORT}`));
