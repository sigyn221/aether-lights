let currentMode = 'classic';

const MODE_HINT = {
  classic: 'Classic: arrows=move, space=pause drift, S=shooting star',
  creator: 'Creator: click stars to connect, Enter=finish group, Esc=cancel',
  waves:   'Waves: G=emit wave, arrows/space as classic',
};

const cam = { x: 0, y: 0, vx: 0.5, vy: 0.05, auto: true };

let creator = {
  active: false,
  play: false,
  picked: [],
  tempEdges: [],
  edges: [],          
  hoverStar: -1,
  pickRadius: 16,
  palette: [
    'rgba(255,230,170,0.9)',
    'rgba(170,220,255,0.95)',
    'rgba(255,180,210,0.95)',
    'rgba(180,255,210,0.95)'
  ],
  nextColorIdx: 0,
  stars3D: [],        
  yaw: 0,             
  pitch: 0,  
  auto: true,          
  autoYaw: 0.00018,     
  autoPitchAmp: 0.008,
  autoPitchFreq: 0.18
};

function pickCreatorStarAtScreen(mx, my) {
  const W = canvas.width, H = canvas.height;
  let best = -1, bestD = Infinity;
  for (let i = 0; i < creator.stars3D.length; i++) {
    let v = rotY(creator.stars3D[i], creator.yaw);
    v = rotX(v, creator.pitch);
    const p = projectToScreen(v, W, H);
    if (!p) continue;
    const d = Math.hypot(p.x - mx, p.y - my);
    const extra = 6;
    if (d < bestD && d <= (creator.pickRadius + extra)) { bestD = d; best = i; }
  }
  return best;
}

function drawCreatorEdgeIdx(i, j, color, lw=0.9, dash=null) {
  const W = canvas.width, H = canvas.height;
  let va = rotX(rotY(creator.stars3D[i], creator.yaw), creator.pitch);
  let vb = rotX(rotY(creator.stars3D[j], creator.yaw), creator.pitch);
  const pa = projectToScreen(va, W, H);
  const pb = projectToScreen(vb, W, H);
  if (!pa || !pb) return;
  const prevGA = ctx.globalAlpha;
  if (currentMode === 'creator') ctx.globalAlpha = 0.55;
  if (dash) ctx.setLineDash(dash);
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
  if (dash) ctx.setLineDash([]);

  ctx.globalAlpha = prevGA;
}

function setAutoSpeedFor(mode) {
  const speeds = {
    classic: { vx: 0.5,  vy: 0.05 },
    waves:   { vx: 0.5,  vy: 0.05 },
    creator: { vx: 0.1,  vy: 0.01 } 
  };
  const s = speeds[mode] || speeds.classic;
  cam.vx = s.vx;
  cam.vy = s.vy;
}

function genCreatorStars(count = 260) {
  creator.stars3D = [];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const sqrt1u = Math.sqrt(1 - u*u);
    const x = sqrt1u * Math.cos(phi);
    const y = u;
    const z = sqrt1u * Math.sin(phi);

    const isGiant = Math.random() < 0.05;
    const mag = isGiant ? 0.9 + Math.random()*0.6 : 0.35 + Math.random()*0.55;

    creator.stars3D.push({
      x, y, z,
      mag,
      phase: Math.random() * Math.PI * 2,
      twSpeed: 0.8 + Math.random()*0.8 
    });
  }
}


function wantedCreatorStars() {
  const W = canvas.width, H = canvas.height;
  const classicN = Math.floor(0.00012 * W * H) + 80; 
  const screenComp = 6.0; 
  return Math.floor(classicN * screenComp);
}

function rotY(v, a){ const ca=Math.cos(a), sa=Math.sin(a); return {x: ca*v.x+sa*v.z, y:v.y, z:-sa*v.x+ca*v.z}; }
function rotX(v, a){ const ca=Math.cos(a), sa=Math.sin(a); return {x: v.x, y: ca*v.y-sa*v.z, z: sa*v.y+ca*v.z}; }

function drawAutoLinks3D(k = 2, maxAngle = Math.PI/18) { 
  const W = canvas.width, H = canvas.height;
  const drawn = new Set(); 

  for (let i = 0; i < creator.stars3D.length; i++) {
    const a = creator.stars3D[i];

    let va = rotX(rotY(a, creator.yaw), creator.pitch);
    if (va.z <= 0) continue; 
    const pa = projectToScreen(va, W, H);
    if (!pa) continue;

    const neigh = [];
    for (let j = 0; j < creator.stars3D.length; j++) {
      if (j === i) continue;
      const b = creator.stars3D[j];
      const dot = a.x*b.x + a.y*b.y + a.z*b.z;        
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (ang <= maxAngle) neigh.push({ j, ang });
    }
    neigh.sort((u, v) => u.ang - v.ang);
    const top = neigh.slice(0, k);

    for (const { j, ang } of top) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      let vb = rotX(rotY(creator.stars3D[j], creator.yaw), creator.pitch);
      if (vb.z <= 0) continue;
      const pb = projectToScreen(vb, W, H);
      if (!pb) continue;

      const aLine = Math.max(0.05, 1 - (ang / maxAngle));
      const depthFade = Math.min(1, 0.6 / ((va.z + vb.z) * 0.5)); 
      const alphaMid = 0.28 * aLine * depthFade;  
      const alphaEnds = 0.10 * aLine * depthFade;
      ctx.lineWidth = 0.3 + 0.7 * aLine;

      const grad = ctx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      grad.addColorStop(0.0, `rgba(255,255,255,${0.25 * aLine})`);
      grad.addColorStop(0.5, `rgba(255,255,255,${0.60 * aLine})`);
      grad.addColorStop(1.0, `rgba(255,255,255,${0.25 * aLine})`);
      ctx.strokeStyle = grad;

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }
}

function projectToScreen(v, W, H) {
  if (v.z <= 0) return null;                  
  const f = 0.9 * Math.min(W, H);             
  return { x: W/2 + f*(v.x/v.z), y: H/2 - f*(v.y/v.z) };
}

function setMode(mode) {
  currentMode = mode;
 
  const theme = document.getElementById('theme-style');
  if (theme) theme.href = `style_${mode}.css`;

  const hud = document.getElementById('hud');
  const txt = document.getElementById('hud-text');
  if (txt) txt.textContent = MODE_HINT[mode] || '';
  if (hud) {
    hud.hidden = false;
    clearTimeout(hud._t);
    hud._t = setTimeout(() => { hud.hidden = true; }, 2000);
  }

  const panel = document.getElementById('modes-panel');
  if (panel) {
    [...panel.querySelectorAll('button')].forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }

  if (typeof creator === 'undefined') window.creator = {};

  if (mode !== 'creator') {
  creator.active = false;
  creator.play = false;
  creator.picked = [];
  creator.edges = [];
  creator.hoverStar = -1;
  cam.auto = true;
  setAutoSpeedFor('classic');
  }
  if (mode === 'creator') {
    creator.active = true;
    creator.play = false;
    creator.picked = [];
    creator.tempEdges = [];
    creator.hoverStar = -1; 
    genCreatorStars(wantedCreatorStars());              
    cam.auto = true;
    cam.vx = 0; 
    cam.vy = 0; 
  }
}

(function initModesUI(){
  const panel = document.getElementById('modes-panel');
  if (panel) {
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (!btn) return;
      setMode(btn.dataset.mode);
    });
  }
  setMode('classic'); 
})();

(function initHUDReveal(){
  const hud = document.getElementById('hud');
  if (!hud) return;
  let t;
  window.addEventListener('mousemove', () => {
    hud.hidden = false;
    clearTimeout(t);
    t = setTimeout(() => { hud.hidden = true; }, 1500);
  });
})();

const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
function resize() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resize();
if (currentMode === 'creator' && creator.active) {
  genCreatorStars(wantedCreatorStars());
}

window.addEventListener('resize', () => {
  resize();
  if (currentMode === 'creator' && creator.active) {
    genCreatorStars(wantedCreatorStars());
  }
  window.scrollTo(0,0);
}); 

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

const USER_CONSTELLATIONS = []; 


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


const wrap = (n, max) => {
    n %= max;
    return n < 0 ? n + max : n;
};

let shootingActive = false;

function pickStarAtScreen(x, y) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < STARS.length; i++) {
    const s = STARS[i];
    const rx = wrap(s.x - cam.x, canvas.width);
    const ry = wrap(s.y - cam.y, canvas.height);
    const dx = rx - x, dy = ry - y;
    const d = Math.hypot(dx, dy);

    const extra = (currentMode === 'creator') ? 6 : 0;
    if (d < bestD && d <= (creator.pickRadius + extra)) { bestD = d; best = i; }
  }
  return best;
}

window.addEventListener('keydown', (e) => {
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (keys.includes(e.key)) e.preventDefault();
    const kick = (currentMode === 'creator') ? 0.15 : 0.6; 
    if (currentMode === 'creator' && creator.active) {
      const STEP = 0.02; 
      if (e.key === 'ArrowLeft')  {creator.yaw   -= STEP; creator.auto = false;}
      if (e.key === 'ArrowRight') {creator.yaw   += STEP; creator.auto = false;}
      if (e.key === 'ArrowUp')    {creator.pitch -= STEP; creator.auto = false;}
      if (e.key === 'ArrowDown')  {creator.pitch += STEP; creator.auto = false;}

      const LIM = Math.PI/2 * 0.9;
      if (creator.pitch >  LIM) creator.pitch =  LIM;
      if (creator.pitch < -LIM) creator.pitch = -LIM;

      if (e.key === ' ') { 
      e.preventDefault();
      creator.auto = !creator.auto;
      }

      if (e.key === 'Enter') {
      if (creator.tempEdges.length > 0) {
          const color = creator.palette[creator.nextColorIdx % creator.palette.length];
          creator.nextColorIdx++;
          const name = prompt('Name your constellation:', 'My Constellation') || 'Unnamed';
          USER_CONSTELLATIONS.push({ name, color, edges: [...creator.tempEdges] });
        }
        creator.picked = [];
        creator.tempEdges = [];
        creator.hoverStar = -1;
        }
        if (e.key === 'Escape') {
        creator.picked = [];
        creator.tempEdges = [];
        creator.hoverStar = -1;
        }
        if (e.key === 'Backspace') {
        e.preventDefault();
        if (creator.tempEdges.length > 0) creator.tempEdges.pop();
        if (creator.picked.length > 1) creator.picked.pop();
        }
        if (e.key === 'r' || e.key === 'R') {
        creator.play = !creator.play;  
        }
  }  
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

    if (e.key === ' ') {
      cam.auto = !cam.auto;
      if (cam.auto) setAutoSpeedFor(currentMode);
    }
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
  if (currentMode === 'creator' && creator.active) {
    creator.hoverStar = pickCreatorStarAtScreen(mouse.x, mouse.y);
  }
});

canvas.addEventListener('mouseleave', (e) => {
    mouse.x = -9999;
    mouse.y = -9999;
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
  if (currentMode === 'creator' && creator.active) {
    const idx = pickCreatorStarAtScreen(sx, sy);
    if (idx !== -1) {
      const n = creator.picked.length;
      if (n > 0) {
        const prev = creator.picked[n - 1];
        if (prev !== idx) creator.tempEdges.push([prev, idx]);
      }
      if (n === 0 || creator.picked[n - 1] !== idx) creator.picked.push(idx);
    }
    return; 
  }
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

function loop() {
    t += 0.016;
    if (currentMode === 'creator' && creator.active) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (creator.auto) {
    creator.yaw += creator.autoYaw;
    const targetPitch = creator.autoPitchAmp * Math.sin(t * 0.25);
    creator.pitch += (targetPitch - creator.pitch) * 0.02;
   }

    for (const s0 of creator.stars3D) {
      let v = rotY(s0, creator.yaw);
      v = rotX(v, creator.pitch);
      const p = projectToScreen(v, canvas.width, canvas.height);
      if (!p) continue;

      const depth = Math.max(0.001, v.z);

      const flick = 0.6 + 0.4 * Math.sin((1.2 * s0.twSpeed) * t + s0.phase);

      const sizeBase  = Math.max(0.6, s0.mag * (0.8 + 0.25 / depth));
      const size = sizeBase * (0.85 + 0.30 * flick); 
      const baseAlpha = Math.min(1, 0.45 + 0.55 / depth);
      const alpha = Math.min(1, baseAlpha * (0.75 + 0.5 * flick)); 

      const rHalo = size * 1.8;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rHalo);
      g.addColorStop(0, `rgba(255,255,255,${alpha * 0.6})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rHalo, 0, Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, alpha)})`;
      ctx.fill();
    }     
    drawAutoLinks3D(2, Math.PI/18); 

    for (const C of USER_CONSTELLATIONS) {
      const col = C.color || 'rgba(255,230,170,0.9)';
      for (const [i,j] of C.edges) drawCreatorEdgeIdx(i, j, col, 1.2);

      if (C.edges.length) {
        let sx=0, sy=0, cnt=0;
        for (const [i,j] of C.edges) {
          let va = rotX(rotY(creator.stars3D[i], creator.yaw), creator.pitch);
          let vb = rotX(rotY(creator.stars3D[j], creator.yaw), creator.pitch);
          const pa = projectToScreen(va, canvas.width, canvas.height);
          const pb = projectToScreen(vb, canvas.width, canvas.height);
          if (!pa || !pb) continue;
          sx += (pa.x+pb.x)*0.5; sy += (pa.y+pb.y)*0.5; cnt++;
        }
        if (cnt) {
          ctx.fillStyle = (col).replace(/0\.\d+/, '1.0');
          ctx.font = '500 13px Inter, system-ui, sans-serif';
          ctx.fillText(C.name, sx/cnt + 6, sy/cnt - 6);
        }
      }
    }
    if (creator.tempEdges.length) {
      for (const [i,j] of creator.tempEdges) {
        drawCreatorEdgeIdx(i, j, 'rgba(255,230,170,0.9)', 1.3);
      }
    }

    if (creator.picked.length > 0 && creator.hoverStar !== -1) {
      const a = creator.picked[creator.picked.length - 1];
      const b = creator.hoverStar;
      drawCreatorEdgeIdx(a, b, 'rgba(255,230,170,0.6)', 1.0, [6,6]);
    }

    if (creator.hoverStar !== -1) {
      let v = rotX(rotY(creator.stars3D[creator.hoverStar], creator.yaw), creator.pitch);
      const p = projectToScreen(v, canvas.width, canvas.height);
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI*2);
        ctx.strokeStyle = 'rgba(255,230,170,0.9)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }
    }

    requestAnimationFrame(loop);
    return; 
  }

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
            setAutoSpeedFor(currentMode);
        }
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let s of STARS) {
        if (currentMode !== 'creator' || creator.play) {
          s.x += s.vx;
          s.y += s.vy;
        }
        if (s.x > canvas.width) s.x = 0;
        if (s.x < 0) s.x = canvas.width;
        if (s.y > canvas.height) s.y = 0;
        if (s.y < 0) s.y = canvas.height;

        const b = 0.6 + 0.4 * Math.sin(1.7*t + s.phase);

        const rx = wrap(s.x - cam.x, canvas.width);
        const ry = wrap(s.y - cam.y, canvas.height);
        const rr = (currentMode === 'creator') ? Math.max(s.r * 1.9, 2.2) : s.r;
        drawStar({ x: rx, y: ry, r: rr }, b);
    }

    const k = 2;
    ctx.lineWidth = 1;

    const drawn = new Set();
    
    spawnTimer += 0.016;
    if (spawnTimer >= spawnDelay) {
        spawnShootingStar();
        spawnTimer = 0;
        spawnDelay = Math.random()*15 + 15; 
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
if (currentMode === 'creator') {
  for (const C of USER_CONSTELLATIONS) {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = C.color || 'rgba(255,230,170,0.9)'; 
    for (const [i, j] of C.edges) {
      const a = STARS[i], b = STARS[j];
      const ax = wrap(a.x - cam.x, canvas.width);
      const ay = wrap(a.y - cam.y, canvas.height);
      const bx = wrap(b.x - cam.x, canvas.width);
      const by = wrap(b.y - cam.y, canvas.height);

      let rxA = ax, ryA = ay, rxB = bx, ryB = by;
      const W = canvas.width, H = canvas.height;
      let ddx = rxB - rxA; if (ddx > W/2) rxB -= W; else if (ddx < -W/2) rxB += W;
      let ddy = ryB - ryA; if (ddy > H/2) ryB -= H; else if (ddy < -H/2) ryB += H;

      ctx.beginPath();
      ctx.moveTo(rxA, ryA);
      ctx.lineTo(rxB, ryB);
      ctx.stroke();
      }

      if (C.edges.length) {
        let sx = 0, sy = 0, cnt = 0;
          for (const [i,j] of C.edges) {
            const a = STARS[i], b = STARS[j];
            sx += (a.x + b.x) * 0.5; sy += (a.y + b.y) * 0.5; cnt++;
          }
        const cx = wrap((sx/cnt) - cam.x, canvas.width);
        const cy = wrap((sy/cnt) - cam.y, canvas.height);
        ctx.fillStyle = (C.color || 'rgba(255,230,170,0.9)').replace(/0\.\d+/, '1.0');
        ctx.font = '500 13px Inter, system-ui, sans-serif';
        ctx.fillText(C.name, cx + 6, cy - 6);
        }
     }

  if (creator.tempEdges.length) {
     ctx.lineWidth = 1.3;
     ctx.strokeStyle = 'rgba(255,230,170,0.9)';
     for (const [i,j] of creator.tempEdges) {
      const a = STARS[i], b = STARS[j];
      const ax = wrap(a.x - cam.x, canvas.width);
      const ay = wrap(a.y - cam.y, canvas.height);
      const bx = wrap(b.x - cam.x, canvas.width);
      const by = wrap(b.y - cam.y, canvas.height);

      let rxA = ax, ryA = ay, rxB = bx, ryB = by;
      const W = canvas.width, H = canvas.height;
      let ddx = rxB - rxA; if (ddx > W/2) rxB -= W; else if (ddx < -W/2) rxB += W;
      let ddy = ryB - ryA; if (ddy > H/2) ryB -= H; else if (ddy < -H/2) ryB += H;

      ctx.beginPath();
      ctx.moveTo(rxA, ryA);
      ctx.lineTo(rxB, ryB);
      ctx.stroke();
    }
  }
  if (creator.picked.length > 0 && creator.hoverStar !== -1) {
    const last = STARS[creator.picked[creator.picked.length - 1]];
    const hov = STARS[creator.hoverStar];
    const ax = wrap(last.x - cam.x, canvas.width);
    const ay = wrap(last.y - cam.y, canvas.height);
    const bx = wrap(hov.x - cam.x, canvas.width);
    const by = wrap(hov.y - cam.y, canvas.height);

    let rxA = ax, ryA = ay, rxB = bx, ryB = by;
    const W = canvas.width, H = canvas.height;
    let ddx = rxB - rxA; if (ddx > W/2) rxB -= W; else if (ddx < -W/2) rxB += W;
    let ddy = ryB - ryA; if (ddy > H/2) ryB -= H; else if (ddy < -H/2) ryB += H;

    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 1.0;
    ctx.strokeStyle = 'rgba(255,230,170,0.6)';
    ctx.beginPath();
    ctx.moveTo(rxA, ryA);
    ctx.lineTo(rxB, ryB);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (creator.hoverStar !== -1) {
    const s = STARS[creator.hoverStar];
    const rx = wrap(s.x - cam.x, canvas.width);
    const ry = wrap(s.y - cam.y, canvas.height);
    ctx.beginPath();
    ctx.arc(rx, ry, Math.max(3, s.r + 2), 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,230,170,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
    requestAnimationFrame(loop);
}
    
loop();