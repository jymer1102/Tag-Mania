const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- CONNECT TO MULTIPLAYER SERVER ---
// Replace the URL below with your exact live Render Web Service URL link!
const socket = io("https://tag-mania.onrender.com");

let myId = null;
let myUsername = "Player";
let myChosenColor = "#007bff";
let isPlaying = false;
let tagCooldown = 0; 
let players = {}; 

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

let wallSegments = [];
let tileSize = 40; 
const wallThickness = 16; 

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    tileSize = Math.floor(canvas.width / mazeGrid[0].length);
    if (tileSize * mazeGrid.length > canvas.height) {
        tileSize = Math.floor(canvas.height / mazeGrid.length);
    }

    wallSegments = [];
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
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Joystick Config
const joystickZone = document.getElementById('joystick-zone');
const joystickStick = document.getElementById('joystick-stick');
let joystickActive = false;
let joystickStartX = 0;
let joystickStartY = 0;
let moveX = 0; 
let moveY = 0; 

joystickZone.addEventListener('touchstart', (e) => {
    joystickActive = true;
    const rect = joystickZone.getBoundingClientRect();
    joystickStartX = rect.left + rect.width / 2;
    joystickStartY = rect.top + rect.height / 2;
});

window.addEventListener('touchmove', (e) => {
    if (!joystickActive) return;
    const touch = e.touches[0];
    let deltaX = touch.clientX - joystickStartX;
    let deltaY = touch.clientY - joystickStartY;
    let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    let maxRadius = 40; 

    if (distance > maxRadius) {
        deltaX = (deltaX / distance) * maxRadius;
        deltaY = (deltaY / distance) * maxRadius;
    }

    joystickStick.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
    moveX = deltaX / maxRadius;
    moveY = deltaY / maxRadius;
});

window.addEventListener('touchend', () => {
    joystickActive = false;
    joystickStick.style.transform = 'translate(0px, 0px)';
    moveX = 0;
    moveY = 0;
});

function checkLineCollision(px, py, radius, seg) {
    let l2 = (seg.x1 - seg.x2) ** 2 + (seg.y1 - seg.y2) ** 2;
    if (l2 === 0) return Math.sqrt((px - seg.x1) ** 2 + (py - seg.y1) ** 2) < radius + (wallThickness / 2);
    let t = ((px - seg.x1) * (seg.x2 - seg.x1) + (py - seg.y1) * (seg.y2 - seg.y1)) / l2;
    t = Math.max(0, Math.min(1, t)); 
    let closestX = seg.x1 + t * (seg.x2 - seg.x1);
    let closestY = seg.y1 + t * (seg.y2 - seg.y1);
    let dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    return dist < (radius + (wallThickness / 2) - 0.5); 
}

function checkWallCollision(radius, nextX, nextY) {
    if (nextY > tileSize * 6.6 && nextY < tileSize * 7.4) {
        if (nextX < tileSize * 0.5 || nextX > (mazeGrid[0].length * tileSize) - (tileSize * 0.5)) {
            return false;
        }
    }
    for (let seg of wallSegments) {
        if (checkLineCollision(nextX, nextY, radius, seg)) {
            return true;
        }
    }
    return false;
}

// --- NETWORK HANDSHAKES ---
socket.on('connect', () => {
    myId = socket.id;
    const statusBox = document.getElementById('status-box');
    if(statusBox) statusBox.innerText = "Connected! Click Join.";
});

socket.on('connect_error', () => {
    const statusBox = document.getElementById('status-box');
    if(statusBox) statusBox.innerText = "Connection failed. Retrying...";
});

socket.on('syncPlayers', (serverPlayers) => {
    players = serverPlayers;
});

socket.on('syncCooldown', (cooldownTime) => {
    tagCooldown = cooldownTime;
});

// Trigger Notification UI Alerts
socket.on('systemMessage', (msg) => {
    const notifyBox = document.getElementById('notification-box');
    if (notifyBox) {
        notifyBox.innerText = msg;
        notifyBox.style.opacity = "1";
        
        // Hide overlay alert smoothly after 3.5 seconds
        setTimeout(() => {
            notifyBox.style.opacity = "0";
        }, 3500);
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    if (!myId) return alert("Still connecting to server... give it a moment.");
    const nameInput = document.getElementById('username-input').value.trim();
    if (nameInput) myUsername = nameInput;
    myChosenColor = document.getElementById('color-picker').value;

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    socket.emit('playerJoin', {
        name: myUsername,
        color: myChosenColor,
        radius: Math.floor(tileSize * 0.28)
    });
    isPlaying = true;
});

function gameLoop() {
    if (isPlaying && players[myId]) {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let me = players[myId];

        let nextMeX = me.x + moveX * 3.5;
        let nextMeY = me.y + moveY * 3.5;
        
        if (!checkWallCollision(me.radius, nextMeX, me.y)) me.x = nextMeX;
        if (!checkWallCollision(me.radius, me.x, nextMeY)) me.y = nextMeY;

        let mazeWidth = mazeGrid[0].length * tileSize;
        if (me.x > mazeWidth) me.x = me.x - mazeWidth;
        else if (me.x < 0) me.x = me.x + mazeWidth;

        if (me.y - me.radius < 0) me.y = me.radius;
        if (me.y + me.radius > canvas.height) me.y = canvas.height - me.radius;

        // Push positions to background engine
        socket.emit('playerMove', { x: me.x, y: me.y });

        // Let human 'IT' client run hit-box tracking checks
        if (me.isIt && tagCooldown === 0) {
            for (let id in players) {
                if (id !== myId) {
                    let p2 = players[id];
                    let dist = Math.sqrt((me.x - p2.x)**2 + (me.y - p2.y)**2);
                    if (dist < (me.radius + p2.radius)) {
                        socket.emit('tagCollision', { taggedId: id });
                        break;
                    }
                }
            }
        }

        // Top Status Header Strings
        let currentItName = "Nobody";
        for(let id in players) { if(players[id].isIt) currentItName = players[id].name; }
        
        const statusBox = document.getElementById('status-box');
        if (statusBox) {
            if (tagCooldown > 0) {
                statusBox.innerHTML = `⚠️ COOLDOWN: ${(tagCooldown/1000).toFixed(1)}s | ${currentItName} is IT!`;
            } else {
                statusBox.innerHTML = `🏃 ${currentItName} is IT! RUN!`;
            }
        }

        // Draw Map Geometry
        ctx.strokeStyle = '#ffffff'; 
        ctx.lineWidth = wallThickness;          
        ctx.lineCap = 'round';       
        ctx.lineJoin = 'round';      

        wallSegments.forEach(seg => {
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.stroke();
        });

        // Frame Render Loops for Online Avatars
        for (let id in players) {
            let p = players[id];
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.isIt ? '#dc3545' : p.color;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.closePath();

            if (p.isIt) {
                ctx.fillStyle = '#ffc107';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText('👑 IT', p.x, p.y - p.radius - 16);
            }

            ctx.fillStyle = '#fff';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, p.x, p.y - p.radius - 4);
        }
    } else if (!isPlaying) {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
