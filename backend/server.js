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
const tileSize = 40;

function hasRealPlayers() {
    return Object.keys(activePlayers).filter(id => id !== BOT_ID).length > 0;
}

function handleBotSpawningAndRemoval() {
    const realPlayerPresent = hasRealPlayers();

    if (realPlayerPresent && activePlayers[BOT_ID]) {
        delete activePlayers[BOT_ID];
        io.emit('systemMessage', "🤖 Training Bot left the arena.");
        io.emit('syncPlayers', activePlayers);
    } 
    else if (!realPlayerPresent && !activePlayers[BOT_ID]) {
        activePlayers[BOT_ID] = {
            id: BOT_ID,
            name: "🤖 Practice Bot",
            color: "#6c757d",
            x: 100,
            y: 100,
            radius: FIXED_RADIUS,
            isIt: true,
            angle: Math.random() * Math.PI * 2
        };
        io.emit('syncPlayers', activePlayers);
    }
}

// Helper to check pixel-level maze wall collisions for the Bot
function checkBotWallCollision(x, y, radius) {
    let buffer = radius + 4;
    let checkPoints = [
        {x: x - buffer, y: y},
        {x: x + buffer, y: y},
        {x: x, y: y - buffer},
        {x: x, y: y + buffer}
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
    handleBotSpawningAndRemoval();

    socket.on('playerJoin', (data) => {
        if (activePlayers[BOT_ID]) {
            delete activePlayers[BOT_ID];
            io.emit('systemMessage', "🤖 Training Bot left the arena.");
        }

        let totalPlayers = Object.keys(activePlayers).length;

        activePlayers[socket.id] = {
            id: socket.id,
            name: data.name || "Player",
            color: data.color || "#007bff",
            x: 220,
            y: 220,
            radius: FIXED_RADIUS,
            isIt: (totalPlayers === 0)
        };

        io.emit('systemMessage', `👋 ${activePlayers[socket.id].name} joined the game!`);
        io.emit('syncPlayers', activePlayers);
        socket.emit('syncCooldown', tagCooldown);
    });

    socket.on('playerMove', (data) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = data.x;
            activePlayers[socket.id].y = data.y;
            io.emit('syncPlayers', activePlayers);
        }
    });

    socket.on('tagCollision', (data) => {
        if (tagCooldown > 0) return;

        let tagger = activePlayers[socket.id];
        let tagged = activePlayers[data.taggedId];

        if (tagger && tagged && tagger.isIt) {
            tagger.isIt = false;
            tagged.isIt = true;
            tagCooldown = 3000;

            io.emit('systemMessage', `💥 ${tagger.name} tagged ${tagged.name}!`);
            io.emit('syncPlayers', activePlayers);
            io.emit('syncCooldown', tagCooldown);
        }
    });

    socket.on('disconnect', () => {
        if (activePlayers[socket.id]) {
            io.emit('systemMessage', `🚪 ${activePlayers[socket.id].name} left the room.`);
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
        io.emit('syncCooldown', tagCooldown);
    }

    // High-accuracy Bot movement tracking loop
    if (activePlayers[BOT_ID]) {
        let bot = activePlayers[BOT_ID];
        
        if (Math.random() < 0.02) {
            bot.angle = Math.random() * Math.PI * 2;
        }

        let speed = 2.2;
        let nextX = bot.x + Math.cos(bot.angle) * speed;
        let nextY = bot.y + Math.sin(bot.angle) * speed;

        if (!checkBotWallCollision(nextX, nextY, bot.radius)) {
            bot.x = nextX;
            bot.y = nextY;
        } else {
            bot.angle = Math.random() * Math.PI * 2; // Bounce away instantly
        }
        io.emit('syncPlayers', activePlayers);
    }
}, 16.67);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
