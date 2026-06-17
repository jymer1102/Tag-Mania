const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let myUsername = "Player";
let myChosenColor = "#007bff";
let isPlaying = false;
let tagCooldown = 0; 
let players = [];

// Maze Grid Layout (1 = Wall, 0 = Empty Space)
const mazeGrid = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
    [1,0,0,0,0,0,1,0,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,0,0,0,0,0,0,0,0,0,1,0,1],
    [1,0,1,0,1,0,1,1,1,0,1,0,1,0,1],
    [1,0,0,0,1,0,0,0,0,0,1,0,0,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

let walls = [];
let tileSize = 40; 
let botPath = [];
let lastPathUpdateTime = 0;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    tileSize = Math.floor(canvas.width / mazeGrid[0].length);
    if (tileSize * mazeGrid.length > canvas.height) {
        tileSize = Math.floor(canvas.height / mazeGrid.length);
    }

    // Keep the box collision boundaries accurate behind the scenes
    walls = [];
    for (let r = 0; r < mazeGrid.length; r++) {
        for (let c = 0; c < mazeGrid[r].length; c++) {
            if (mazeGrid[r][c] === 1) {
                walls.push({
                    x: c * tileSize,
                    y: r * tileSize,
                    width: tileSize,
                    height: tileSize
                });
            }
        }
    }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.getElementById('start-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('username-input').value.trim();
    if (nameInput) myUsername = nameInput;
    myChosenColor = document.getElementById('color-picker').value;

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    isPlaying = true;
    initGame();
});

function initGame() {
    const playerRadius = Math.floor(tileSize * 0.32);

    players.push({
        id: 'me', name: myUsername, x: tileSize * 1.5, y: tileSize * 1.5, 
        radius: playerRadius, speed: 3.5, isIt: false, color: myChosenColor
    });

    players.push({
        id: 'bot', name: 'Friend_Bot', x: tileSize * 13.5, y: tileSize * 13.5, 
        radius: playerRadius, speed: 2.3, isIt: false, color: '#e0a800'
    });

    const randomPick = Math.floor(Math.random() * players.length);
    players[randomPick].isIt = true;
    updateStatusText();
}

// Mobile Right-Side Joystick Setup
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

// Circle-vs-Box Collision Logic
function checkWallCollision(player, nextX, nextY) {
    for (let wall of walls) {
        let closestX = Math.max(wall.x, Math.min(nextX, wall.x + wall.width));
        let closestY = Math.max(wall.y, Math.min(nextY, wall.y + wall.height));

        let distanceX = nextX - closestX;
        let distanceY = nextY - closestY;
        let distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

        if (distanceSquared < (player.radius * player.radius)) {
            return true; 
        }
    }
    return false;
}

// BFS Pathfinding Algorithm for the Bot
function findShortestPath(startGridX, startGridY, targetGridX, targetGridY) {
    if (startGridX === targetGridX && startGridY === targetGridY) return [];

    let queue = [[startGridX, startGridY]];
    let visited = Array(mazeGrid.length).fill().map(() => Array(mazeGrid[0].length).fill(false));
    visited[startGridY][startGridX] = true;
    
    let parentMap = {};
    const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    let found = false;

    while (queue.length > 0) {
        let [cx, cy] = queue.shift();

        if (cx === targetGridX && cy === targetGridY) {
            found = true;
            break;
        }

        for (let [dx, dy] of directions) {
            let nx = cx + dx;
            let ny = cy + dy;

            if (ny >= 0 && ny < mazeGrid.length && nx >= 0 && nx < mazeGrid[0].length) {
                if (!visited[ny][nx] && mazeGrid[ny][nx] === 0) {
                    visited[ny][nx] = true;
                    parentMap[`${nx},${ny}`] = `${cx},${cy}`;
                    queue.push([nx, ny]);
                }
            }
        }
    }

    if (!found) return [];

    let path = [];
    let currentKey = `${targetGridX},${targetGridY}`;
    let startKey = `${startGridX},${startGridY}`;

    while (currentKey !== startKey) {
        let [x, y] = currentKey.split(',').map(Number);
        path.unshift({ x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 });
        currentKey = parentMap[currentKey];
    }

    return path;
}

function updateStatusText() {
    const statusBox = document.getElementById('status-box');
    const currentIt = players.find(p => p.isIt);
    if (tagCooldown > 0) {
        statusBox.innerHTML = `⚠️ COOLDOWN: ${(tagCooldown/1000).toFixed(1)}s <br> ${currentIt.name} is IT!`;
    } else {
        statusBox.innerHTML = `🏃 ${currentIt.name} is IT! RUN!`;
    }
}

function gameLoop(timestamp) {
    if (isPlaying) {
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (tagCooldown > 0) {
            tagCooldown -= 16.66;
            if (tagCooldown < 0) tagCooldown = 0;
            updateStatusText();
        }

        let me = players.find(p => p.id === 'me');
        let bot = players.find(p => p.id === 'bot');

        // Move Player
        let nextMeX = me.x + moveX * me.speed;
        let nextMeY = me.y + moveY * me.speed;
        
        if (!checkWallCollision(me, nextMeX, me.y)) me.x = nextMeX;
        if (!checkWallCollision(me, me.x, nextMeY)) me.y = nextMeY;

        // Smart Bot Pathfinding Logic
        if (bot && (tagCooldown === 0 || !bot.isIt)) {
            let botGridX = Math.floor(bot.x / tileSize);
            let botGridY = Math.floor(bot.y / tileSize);
            let myGridX = Math.floor(me.x / tileSize);
            let myGridY = Math.floor(me.y / tileSize);

            if (timestamp - lastPathUpdateTime > 400) {
                if (bot.isIt) {
                    botPath = findShortestPath(botGridX, botGridY, myGridX, myGridY);
                } else {
                    let targetCornerX = myGridX < mazeGrid[0].length / 2 ? 13 : 1;
                    let targetCornerY = myGridY < mazeGrid.length / 2 ? 13 : 1;
                    botPath = findShortestPath(botGridX, botGridY, targetCornerX, targetCornerY);
                }
                lastPathUpdateTime = timestamp;
            }

            if (botPath.length > 0) {
                let targetNode = botPath[0];
                let diffX = targetNode.x - bot.x;
                let diffY = targetNode.y - bot.y;
                let dist = Math.sqrt(diffX * diffX + diffY * diffY);

                if (dist > 4) {
                    let dirX = diffX / dist;
                    let dirY = diffY / dist;
                    
                    let nextBotX = bot.x + dirX * bot.speed;
                    let nextBotY = bot.y + dirY * bot.speed;

                    if (!checkWallCollision(bot, nextBotX, bot.y)) bot.x = nextBotX;
                    if (!checkWallCollision(bot, bot.x, nextBotY)) bot.y = nextBotY;
                } else {
                    botPath.shift();
                }
            }
        }

        // Tag checks (Player vs Player)
        if (tagCooldown === 0 && players.length > 1) {
            let p1 = players[0];
            let p2 = players[1];
            let dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
            
            if (dist < (p1.radius + p2.radius)) {
                p1.isIt = !p1.isIt;
                p2.isIt = !p2.isIt;
                tagCooldown = 3000; 
                botPath = []; 
                updateStatusText();
            }
        }

        // --- NEW ROUNDED SMOOTH WALL RENDERING ---
        ctx.strokeStyle = '#34495e'; // Wall color
        ctx.lineWidth = 16;          // 16px thickness line walls
        ctx.lineCap = 'round';       // Smooth rounded ends
        ctx.lineJoin = 'round';      // Smooth rounded intersections

        for (let r = 0; r < mazeGrid.length; r++) {
            for (let c = 0; c < mazeGrid[r].length; c++) {
                if (mazeGrid[r][c] === 1) {
                    let startX = c * tileSize + tileSize / 2;
                    let startY = r * tileSize + tileSize / 2;

                    // Check right neighbor
                    if (c + 1 < mazeGrid[r].length && mazeGrid[r][c + 1] === 1) {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo((c + 1) * tileSize + tileSize / 2, startY);
                        ctx.stroke();
                    }
                    // Check bottom neighbor
                    if (r + 1 < mazeGrid.length && mazeGrid[r + 1][c] === 1) {
                        ctx.beginPath();
                        ctx.moveTo(startX, startY);
                        ctx.lineTo(startX, (r + 1) * tileSize + tileSize / 2);
                        ctx.stroke();
                    }
                }
            }
        }

        // Draw Players
        players.forEach(p => {
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
        });
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
