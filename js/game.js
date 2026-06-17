const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game Management Properties
let myUsername = "Player";
let myChosenColor = "#007bff";
let isPlaying = false;
let tagCooldown = 0; // Cooldown timer track (milliseconds)
let players = [];

// Screen setup responsive sizing
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Handle Join Game action
document.getElementById('start-btn').addEventListener('click', () => {
    const nameInput = document.getElementById('username-input').value.trim();
    if (nameInput) myUsername = nameInput;
    
    // Capture user color choice
    myChosenColor = document.getElementById('color-picker').value;

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';
    isPlaying = true;
    initGame();
});

// Create entities on start
function initGame() {
    // Your Player Object with custom color choice
    players.push({
        id: 'me', name: myUsername, x: canvas.width / 3, y: canvas.height / 2, 
        radius: 20, speed: 4, isIt: false, color: myChosenColor
    });

    // Test Opponent Object
    players.push({
        id: 'bot', name: 'Friend_Bot', x: (canvas.width / 3) * 2, y: canvas.height / 2, 
        radius: 20, speed: 2.5, isIt: false, color: '#e0a800'
    });

    // Choose random starting "It" player
    const randomPick = Math.floor(Math.random() * players.length);
    players[randomPick].isIt = true;
    updateStatusText();
}

// Mobile Touch Control / Joystick Implementation
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

// Fallback desktop keyboard configurations for quick testing
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') moveY = -1;
    if (e.key === 'ArrowDown' || e.key === 's') moveY = 1;
    if (e.key === 'ArrowLeft' || e.key === 'a') moveX = -1;
    if (e.key === 'ArrowRight' || e.key === 'd') moveX = 1;
});
window.addEventListener('keyup', (e) => {
    if (['ArrowUp','w','ArrowDown','s'].includes(e.key)) moveY = 0;
    if (['ArrowLeft','a','ArrowRight','d'].includes(e.key)) moveX = 0;
});

function updateStatusText() {
    const statusBox = document.getElementById('status-box');
    const currentIt = players.find(p => p.isIt);
    if (tagCooldown > 0) {
        statusBox.innerHTML = `⚠️ COOLDOWN: ${(tagCooldown/1000).toFixed(1)}s <br> ${currentIt.name} is IT!`;
    } else {
        statusBox.innerHTML = `🏃 ${currentIt.name} is IT! RUN!`;
    }
}

// Continuous Frame Loop Execution
function gameLoop() {
    if (isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Process cooldown counters
        if (tagCooldown > 0) {
            tagCooldown -= 16.66; // roughly 1 frame time step at 60Hz
            if (tagCooldown < 0) tagCooldown = 0;
            updateStatusText();
        }

        let me = players.find(p => p.id === 'me');
        let bot = players.find(p => p.id === 'bot');

        // Apply positions
        me.x += moveX * me.speed;
        me.y += moveY * me.speed;

        // Simple Automation Behavior for local testing simulation
        if (bot) {
            let diffX = me.x - bot.x;
            let diffY = me.y - bot.y;
            let dist = Math.sqrt(diffX*diffX + diffY*diffY);
            if (dist > 5) {
                let dirX = diffX / dist;
                let dirY = diffY / dist;
                let multiplier = bot.isIt ? 1 : -1;
                
                if (tagCooldown === 0 || !bot.isIt) {
                    bot.x += dirX * bot.speed * multiplier;
                    bot.y += dirY * bot.speed * multiplier;
                }
            }
        }

        // Limit objects to viewport bounds
        players.forEach(p => {
            if (p.x - p.radius < 0) p.x = p.radius;
            if (p.x + p.radius > canvas.width) p.x = canvas.width - p.radius;
            if (p.y - p.radius < 0) p.y = p.radius;
            if (p.y + p.radius > canvas.height) p.y = canvas.height - p.radius;
        });

        // Run Collision validations (if no active cooldown)
        if (tagCooldown === 0 && players.length > 1) {
            let p1 = players[0];
            let p2 = players[1];
            let dist = Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
            
            if (dist < (p1.radius + p2.radius)) {
                p1.isIt = !p1.isIt;
                p2.isIt = !p2.isIt;
                tagCooldown = 3000; // 3 seconds window activation
                updateStatusText();
            }
        }

        // Draw active entities onto scene
        players.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            // If they are It, they flash/display Red. Otherwise, display their custom selected color!
            ctx.fillStyle = p.isIt ? '#dc3545' : p.color;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#fff';
            ctx.stroke();
            ctx.closePath();

            // Display "IT" overhead label indicator
            if (p.isIt) {
                ctx.fillStyle = '#ffc107';
                ctx.font = 'bold 14px sans-serif';
                ctx.fillText('📢 IT', p.x - 12, p.y - p.radius - 22);
            }

            // Display customized user text handle
            ctx.fillStyle = '#fff';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, p.x, p.y - p.radius - 5);
        });
    }

    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
