const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
function resize() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', () => {resize();
window.scrollTo(0,0);}); 

const N = Math.floor(0.00012*window.innerWidth*window.innerHeight) + 80;
const MAX_SPEED = 0.5;
const STARS = [];
let t = 0;
const mouse = { x: -9999, y: -9999 };
const R = 85;

const SHOOTERS = [];
const SHOOT_SPEED = 8;           
const SHOOT_TTL = 1.2;           
const LONGPRESS_MS = 350;        
let spawnTimer = 0;              
let spawnDelay = Math.random() * 15 + 15; 

function spawnShootingStar(fromEdge = null, sx = null, sy = null) {
  if (shootingActive) return; 
  shootingActive = true;

  const W = canvas.width, H = canvas.height;

  const PALETTE = [
    { tail: '255,214,137', head: '255,244,229' }, 
    { tail: '173,216,255', head: '235,246,255' }, 
    { tail: '255,180,200', head: '255,238,245' }, 
  ];
  const col = PALETTE[Math.floor(Math.random()*PALETTE.length)];

  const speed = Math.random() * 6 + 6; 
  const radius = Math.random() * 1.2 + 1.6; 

  let sx0, sy0;
  if (sx != null && sy != null) {
    sx0 = sx; sy0 = sy;
  } else {
    const edge = fromEdge || ['top','right','bottom','left'][Math.floor(Math.random()*4)];
    if (edge === 'top')    { sx0 = Math.random()*W; sy0 = -20; }
    if (edge === 'bottom') { sx0 = Math.random()*W; sy0 = H+20; }
    if (edge === 'left')   { sx0 = -20; sy0 = Math.random()*H; }
    if (edge === 'right')  { sx0 = W+20; sy0 = Math.random()*H; }
  }

  const cx = W/2, cy = H/2;
  const base = Math.atan2(cy - sy0, cx - sx0);
  const jitter = (Math.random()*Math.PI/3) - (Math.PI/6);
  const angle = base + jitter;

  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const path = Math.hypot(W, H) * 1.2;
  const frames = path / speed;               
  const lifeSec = frames * 0.016;            

  const startX = wrap(sx0 + cam.x, W);
  const startY = wrap(sy0 + cam.y, H);

  SHOOTERS.push({
    x: startX,
    y: startY,
    vx: dirX * speed,
    vy: dirY * speed,
    life: lifeSec,
    r: radius,
    col,                 
    speed
    
  });
  setTimeout(() => shootingActive = false, 1200);
}

const cam = { x: 0, y: 0, vx: 0.5, vy: 0.05, auto: true };
const wrap = (n, max) => {
    n %= max;
    return n < 0 ? n + max : n;
};

window.addEventListener('keydown', (e) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (keys.includes(e.key)) e.preventDefault();
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
    if (e.key === 's' || e.key === 'S') {
    spawnShootingStar(); 
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
    const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});
canvas.addEventListener('mouseleave', (e) => {
    mouse.x = -9999;
    mouse.y = -9999;
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
     STARS.push({
        x: wrap(sx + cam.x, canvas.width),    
        y: wrap(sy + cam.y, canvas.height),    
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
let shootingActive = false;

function loop() {
    t += 0.016;
    if (cam.auto) {
        cam.x += cam.vx;
        cam.y += cam.vy;
    } else {
        cam.x += cam.vx;
        cam.y += cam.vy;
        cam.vx *= 0.98;
        cam.vy *= 0.98;

        if (Math.abs(cam.vx) < 0.02 && Math.abs(cam.vy) < 0.02) {
            cam.auto = true;
            cam.vx = 0.5;
            cam.vy = 0.05;
        }
    }
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
        const rx = wrap(s.x - cam.x, canvas.width);
        const ry = wrap(s.y - cam.y, canvas.height);
        drawStar({x: rx, y: ry, r: s.r}, b);
    }

    const k = 2;
    ctx.lineWidth = 1;

    const drawn = new Set();
    
    spawnTimer += 0.016;
    if (spawnTimer >= spawnDelay) {
        spawnShootingStar();
        spawnTimer = 0;
        spawnDelay = Math.random()*5 + 4; 
    }

    for (let i = SHOOTERS.length - 1; i >= 0; i--) {
        const s = SHOOTERS[i];

        s.x += s.vx;
        s.y += s.vy;
        s.life -= 0.016;
 
        if (s.life <= 0 ) {
            SHOOTERS.splice(i, 1);
            continue;
        }

        const rx = wrap(s.x - cam.x, canvas.width);
        const ry = wrap(s.y - cam.y, canvas.height);

        const baseTail = 28;
        const tailLen = baseTail * (s.speed / 8); 
        const tx = rx - (s.vx * (tailLen / s.speed));
        const ty = ry - (s.vy * (tailLen / s.speed));

        const a = Math.max(0, s.life / Math.max(0.001, s.life)); 
        const fade = Math.max(0, Math.min(1, s.life)); 

        const grad = ctx.createLinearGradient(tx, ty, rx, ry);
        grad.addColorStop(0, `rgba(${s.col.tail}, 0)`);
        grad.addColorStop(1, `rgba(${s.col.tail}, ${0.9 * fade})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(rx, ry);
        ctx.stroke();


        ctx.beginPath();
        ctx.arc(rx, ry, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.col.head}, ${0.95 * fade})`;
        ctx.fill();

    }


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
        for (const { j, b, d } of top) {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (drawn.has(key)) continue;
        drawn.add(key);

        let alpha = Math.max(0.08, Math.pow(1 - d / R, 1.8));

        const ax = wrap(a.x - cam.x, canvas.width);
        const ay = wrap(a.y - cam.y, canvas.height);
        const bx = wrap(b.x - cam.x, canvas.width);
        const by = wrap(b.y - cam.y, canvas.height);

        let rxA = ax, ryA = ay;
        let rxB = bx, ryB = by;
        const W = canvas.width, H = canvas.height;

        let ddx = rxB - rxA;
        if (ddx >  W/2) rxB -= W; else if (ddx < -W/2) rxB += W;

        let ddy = ryB - ryA;
        if (ddy >  H/2) ryB -= H; else if (ddy < -H/2) ryB += H;

        const torusDelta = (val, size) => {
            val %= size;
            if (val >  size/2) val -= size;
            if (val < -size/2) val += size;
            return val;
        };
        const distToMouse = (x, y) => {
            const dx = torusDelta(x - mouse.x, canvas.width);
            const dy = torusDelta(y - mouse.y, canvas.height);
            return Math.hypot(dx, dy);
        };
        const dm = Math.min(distToMouse(rxA, ryA), distToMouse(rxB, ryB));
        if (dm < 140) alpha = Math.min(1, alpha + (140 - dm) / 300);

        ctx.lineWidth = 0.5 + alpha * 0.9;

        const grad = ctx.createLinearGradient(rxA, ryA, rxB, ryB);
        grad.addColorStop(0.0, `rgba(255,255,255,${alpha * 0.35})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
        grad.addColorStop(1.0, `rgba(255,255,255,${alpha * 0.35})`);
        ctx.strokeStyle = grad;

        ctx.beginPath();
        ctx.moveTo(rxA, ryA);
        ctx.lineTo(rxB, ryB);
        ctx.stroke();
        }
        
    }
}

    requestAnimationFrame(loop);
}
    
loop();