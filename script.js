const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
function resize() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const N = Math.floor(0.00012*window.innerWidth*window.innerHeight) + 80;
const MAX_SPEED = 0.6;
const STARS = [];
let t = 0;
const mouse = { x: -9999, y: -9999 };
const R = 120;

const rand = (a, b) => a + Math.random() * (b - a);
const sign = () => Math.random() < 0.5 ? -1 : 1;

STARS.push({
    x: rand(0, canvas.width),
    y: rand(0, canvas.height),
    r: rand(0.7, 1.8),
    vx: rand(0.1, MAX_SPEED) * sign(),
    vy: rand(0.1, MAX_SPEED) * sign(),
    phase: rand(0, 2 * Math.PI)
});

for (let i = 0; i < N; i++) {
    STARS.push({
        x: rand(0, canvas.width),
        y: rand(0, canvas.height),
        r: rand(0.7, 1.8),
        vx: rand(0.1, MAX_SPEED) * sign(),
        vy: rand(0.1, MAX_SPEED) * sign(),
        phase: rand(0, 2 * Math.PI)
    });
}

canvas.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
canvas.addEventListener('mouseleave', (e) => {
    mouse.x = -9999;
    mouse.y = -9999;
});

canvas.addEventListener('click', (e) => {
    STARS.push({
        x: e.clientX,
        y: e.clientY,
        r: rand(0.7, 1.8),
        vx: rand(0.1, MAX_SPEED) * sign(),
        vy: rand(0.1, MAX_SPEED) * sign(),
        phase: rand(0, 2 * Math.PI)
    });
});

function drawStar(s, brightness){
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
    ctx.fill();
}

function loop() {
    t += 0.016;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let s of STARS) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x > canvas.width) s.x = 0;
        if (s.x < 0) s.x = canvas.width;
        if (s.y > canvas.height) s.y = 0;
        if (s.y < 0) s.y = canvas.height;
        
        const b = 0.6 + 0.4 * Math.sin(1.7*t + s.phase);
        drawStar(s, b);
    }

    const maxLinks = 3;
    const linkCounts = new Array(STARS.length).fill(0);

ctx.lineWidth = 1;
for (let i = 0; i < STARS.length; i++) {
    const a = STARS[i];
    for (let j = i + 1; j < STARS.length; j++) {
        if (linkCounts[i] >= maxLinks || linkCounts[j] >= maxLinks) continue;
        const b = STARS[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d >= R) continue;
        
        const keepProb = (1 - d / R)*0.6;
        if (Math.random() > keepProb) continue;
            let alpha = 1.0 - d / R;

            const dm = Math.min(
                Math.hypot(a.x - mouse.x, a.y - mouse.y),
                Math.hypot(b.x - mouse.x, b.y - mouse.y)
            );
            if (dm < 140) alpha = Math.min(1, alpha + (140 - dm) / 300);

            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        
    }
}

    requestAnimationFrame(loop);
}
    
loop();