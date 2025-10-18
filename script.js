const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
function resize() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const N = Math.floor(0.00012*window.innerWidth*window.innerHeight) + 80;
const MAX_SPEED = 0.5;
const STARS = [];
let t = 0;
const mouse = { x: -9999, y: -9999 };
const R = 85;

const cam = { x: 0, y: 0, vx: 0.04, vy: 0.02, auto: true };
const wrap = (n, max) => {
    n %= max;
    return n < 0 ? n + max : n;
};

window.addEventListener('keydown', (e) => {
    const kick = 0.6;
    if (e.key === 'ArrowUp') {
        cam.vy -= kick;
        cam.auto = false;
    }
    if (e.key === 'ArrowDown') {
        cam.vy += kick;
        cam.auto = false;
    }  
    if (e.key === 'ArrowLeft') {
        cam.vx -= kick;
        cam.auto = false;
    }
    if (e.key === 'ArrowRight') {
        cam.vx += kick;
        cam.auto = false;
    }
    if (e.key === ' ') cam.auto = !cam.auto;
    if (e.key === '0') { cam.x = cam.y = cam.vx = cam.vy = 0; cam.auto = false; }
});

const rand = (a, b) => a + Math.random() * (b - a);
const sign = () => Math.random() < 0.5 ? -1 : 1;

STARS.push({
    x: rand(0, canvas.width),
    y: rand(0, canvas.height),
    r: rand(1.0, 2.2),
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

    const k = 2;
    ctx.lineWidth = 1;

    const drawn = new Set();

for (let i = 0; i < STARS.length; i++) {
    const a = STARS[i];
    const neigh = [];
    for (let j = 0; j < STARS.length; j++) {
        if (j==i) continue;
        const b = STARS[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < R) neigh.push({ j, d, b});
    }
    neigh.sort((u, v) => u.d - v.d);
    const top = neigh.slice(0, k);
    for (const {j, b, d} of top) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (drawn.has(key)) continue;
        drawn.add(key);
            let alpha = Math.max(0.08,Math.pow(1 - d / R, 1.8));

            const dm = Math.min(
                Math.hypot(a.x - mouse.x, a.y - mouse.y),
                Math.hypot(b.x - mouse.x, b.y - mouse.y)
            );
            if (dm < 140) alpha = Math.min(1, alpha + (140 - dm) / 300);

            const w = 0.5 + alpha * 0.9;
            ctx.lineWidth = w;

            const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            grad.addColorStop(0.0, `rgba(255, 255, 255, ${alpha*0.35})`);
            grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
            grad.addColorStop(1.0, `rgba(255, 255, 255, ${alpha*0.35})`);
            ctx.strokeStyle = grad;

            ctx.shawdowBlur = alpha * 4;
            ctx.shadowColor = `rgba(255, 255, 255, 0.6)`;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        
    }
}

    requestAnimationFrame(loop);
}
    
loop();