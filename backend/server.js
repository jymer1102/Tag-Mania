const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Allow connections from your GitHub Pages domain name

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allows any device to connect securely
        methods: ["GET", "POST"]
    }
});

let activePlayers = {};
let masterTagCooldown = 0;

// Countdown ticker for Tag Cooldown frames
setInterval(() => {
    if (masterTagCooldown > 0) {
        masterTagCooldown -= 100;
        if (masterTagCooldown < 0) masterTagCooldown = 0;
        io.emit('syncCooldown', masterTagCooldown);
    }
}, 100);

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Track login and assign "IT" if they are the first user
    socket.on('playerJoin', (data) => {
        let isFirst = Object.keys(activePlayers).length === 0;
        
        activePlayers[socket.id] = {
            id: socket.id,
            name: data.name,
            color: data.color,
            radius: data.radius,
            x: 60, 
            y: 60,
            isIt: isFirst 
        };
        io.emit('syncPlayers', activePlayers);
    });

    // Receive position ticks from user phone and broadcast
    socket.on('playerMove', (coords) => {
        if (activePlayers[socket.id]) {
            activePlayers[socket.id].x = coords.x;
            activePlayers[socket.id].y = coords.y;
            socket.broadcast.emit('syncPlayers', activePlayers);
        }
    });

    // Handle tag switches safely on the server array tracking
    socket.on('tagCollision', (data) => {
        if (masterTagCooldown === 0 && activePlayers[socket.id] && activePlayers[socket.id].isIt) {
            if (activePlayers[data.taggedId]) {
                activePlayers[socket.id].isIt = false;
                activePlayers[data.taggedId].isIt = true;
                masterTagCooldown = 3000; // 3 second delay
                
                io.emit('syncPlayers', activePlayers);
                io.emit('syncCooldown', masterTagCooldown);
            }
        }
    });

    socket.on('disconnect', () => {
        let wasIt = activePlayers[socket.id] ? activePlayers[socket.id].isIt : false;
        delete activePlayers[socket.id];
        
        // Pass crown to next available random player if old IT logs out
        if (wasIt && Object.keys(activePlayers).length > 0) {
            let keys = Object.keys(activePlayers);
            activePlayers[keys[0]].isIt = true;
        }
        
        io.emit('syncPlayers', activePlayers);
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Run server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Tag Mania Engine running on port ${PORT}`);
});
