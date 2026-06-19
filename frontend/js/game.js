const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- CONNECT TO MULTIPLAYER SERVER ---
window.socket = io("https://tag-mania.onrender.com");
const socket = window.socket;

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

let wallSegments = [];
let tileSize = 40; 
const wallThickness = 16; 
const FIXED_RADIUS = 14; 

function resizeCanvas() {
    let size = Math.min(window.innerWidth, window.innerHeight * 0.60);
    canvas.width = size;
    canvas.height = size;
    
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";
    canvas.style.maxHeight = size + "px";
    canvas.style.maxWidth = size + "px";
    canvas.style.display = "block";
    canvas.style.margin = "10px auto 0 auto";

    tileSize = size / mazeGrid[0].length;

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

window.addEventListener('beforeunload', () => {
    socket.disconnect();
});

const joystickZone = document.getElementById('joystick-zone');
const joystickStick = document.getElementById('joystick-stick');

joystickZone.style.position = "absolute";
joystickZone.style.bottom = "8%";
joystickZone.style.left = "50%";
joystickZone.style.transform = "translateX(-50%)";

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
    if (l2 === 0) return Math.sqrt((px - seg.x1) ** 2 + (py - seg.y1) ** 2) < (radius + (wallThickness / 2));
    
    let t = ((px - seg.x1) * (seg.x2 - seg.x1) + (py - seg.y1) * (seg.y2 - seg.y1)) / l2;
    t = Math.max(0, Math.min(1, t)); 
    
    let closestX = seg.x1 + t * (seg.x2 - seg.x1);
    let closestY = seg.y1 + t * (seg.y2 - seg.y1);
    let dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
    
    return dist < (radius + (wallThickness / 2)); 
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

socket.on('connect', () => {
    myId = socket.id;
    const statusBox = document.getElementById('status-box');
    if(statusBox) statusBox.innerText = "Connected! Click Join.";
});

socket.on('syncPlayers', (serverPlayers) => {
    for (let id in serverPlayers) {
        let ratioX = serverPlayers[id].x / (15 * 40);
        let ratioY = serverPlayers[id].y / (15 * 40);
        let targetX = ratioX * canvas.width;
        let targetY = ratioY * canvas.height;

        if (id === myId && players[myId]) {
            players[myId].isIt = serverPlayers[id].isIt;
            if (players[myId].isIt && tagCooldown > 0) {
                players[myId].x = targetX;
                players[myId].y = targetY;
            }
        } else {
            if (!players[id]) {
                players[id] = {
                    id: serverPlayers[id].id,
                    name: serverPlayers[id].name,
                    color: serverPlayers[id].color,
                    radius: FIXED_RADIUS, // Hitbox scales to full visual body radius
                    isIt: serverPlayers[id].isIt,
                    x: targetX,
                    y: targetY
                };
            }
            players[id].isIt = serverPlayers[id].isIt;
            players[id].targetX = targetX;
            players[id].targetY = targetY;
        }
    }
    for (let id in players) {
        if (!serverPlayers[id]) delete players[id];
    }
});

socket.on('syncCooldown', (cooldownTime) => {
    tagCooldown = cooldownTime;
});

socket.on('systemMessage', (msg) => {
    const notifyBox = document.getElementById('notification-box');
    if (notifyBox) {
        notifyBox.innerText = msg;
        notifyBox.style.opacity = "1";
        setTimeout(() => { notifyBox.style.opacity = "0"; }, 3500);
    }
});

document.getElementById('start-btn').addEventListener('click', () => {
    if (!myId) return alert("Connecting to server...");
    const nameInput = document.getElementById('username-input').value.trim();
    if (nameInput) myUsername = nameInput;
    myChosenColor = document.getElementById('color-picker').value;

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    
    let spawnPixel = tileSize * 1.5;
    players[myId] = {
        id: myId,
        name: myUsername,
        color: myChosenColor,
        radius: FIXED_RADIUS, // Hitbox scales to full visual body radius
        x: spawnPixel,
        y: spawnPixel,
        isIt: false
    };

    socket.emit('playerJoin', {
        name: myUsername,
        color: myChosenColor,
        radius: FIXED_RADIUS
    });
    isPlaying = true;
});

function gameLoop() {
    if (isPlaying && players[myId]) {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let me = players[myId];
        let isMeFrozen = (me.isIt && tagCooldown > 0);
        
        let currentMoveX = isMeFrozen ? 0 : moveX;
        let currentMoveY = isMeFrozen ? 0 : moveY;
        let currentSpeed = isMeFrozen ? 0 : 4.2;

        let speedMultiplier = canvas.width / (15 * 40);
        let nextMeX = me.x + (currentMoveX * currentSpeed * speedMultiplier);
        let nextMeY = me.y + (currentMoveY * currentSpeed * speedMultiplier);
        
        if (!isMeFrozen) {
            if (!checkWallCollision(me.radius, nextMeX, me.y)) me.x = nextMeX;
            if (!checkWallCollision(me.radius, me.x, nextMeY)) me.y = nextMeY;

            if (me.x > canvas.width) me.x = me.x - canvas.width;
            else if (me.x < 0) me.x = me.x + canvas.width;

            if (me.y - me.radius < 0) me.y = me.radius;
            if (me.y + me.radius > canvas.height) me.y = canvas.height - me.radius;
        }

        let uploadX = (me.x / canvas.width) * (15 * 40);
        let uploadY = (me.y / canvas.height) * (15 * 40);
        socket.emit('playerMove', { x: uploadX, y: uploadY });

        let currentItName = "Nobody";
        for(let id in players) { if(players[id].isIt) currentItName = players[id].name; }
        
        const statusBox = document.getElementById('status-box');
        if (statusBox) {
            if (tagCooldown > 0) {
                statusBox.innerHTML = `⏳ FREEZE: ${(tagCooldown/1000).toFixed(1)}s <br> ${currentItName} is IT!`;
            } else {
                statusBox.innerHTML = `🏃 ${currentItName} is IT! RUN!`;
            }
        }

        // Draw Walls
        ctx.strokeStyle = '#ffffff'; 
        ctx.lineWidth = wallThickness * (canvas.width / 600);          
        ctx.lineCap = 'round';       
        ctx.lineJoin = 'round';      

        wallSegments.forEach(seg => {
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.stroke();
        });

        // Render Loop
        for (let id in players) {
            let p = players[id];
            
            if (id !== myId && p.targetX !== undefined) {
                p.x += (p.targetX - p.x) * 0.25;
                p.y += (p.targetY - p.y) * 0.25;
            }

            let isThisPlayerFrozen = (p.isIt && tagCooldown > 0);

            let renderX = p.x;
            let renderY = p.y;
            if (isThisPlayerFrozen) {
                renderX += Math.sin(Date.now() * 0.08) * 0.4; 
                renderY += Math.cos(Date.now() * 0.08) * 0.4;
            }

            ctx.beginPath();
            ctx.arc(renderX, renderY, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = p.isIt ? '#dc3545' : p.color;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.closePath();

            if (p.isIt) {
                ctx.fillStyle = '#ffc107';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(isThisPlayerFrozen ? '⏳ FROZEN' : '👑 IT', renderX, renderY - p.radius - 16);
            }

            ctx.fillStyle = '#fff';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, renderX, renderY - p.radius - 4);
        }
    } else if (!isPlaying) {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
