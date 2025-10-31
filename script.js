let currentMode = 'classic';

const canvas = document.getElementById('sky');  
const ctx = canvas.getContext('2d');             
let proj = null;   

const MODE_HINT = {
  classic: 'Classic: arrows=move, space=pause drift, S=shooting star',
  creator: 'Creator: click stars to connect, Enter=finish group, Esc=cancel',
  waves:   'Waves: G=emit wave, arrows/space as classic',
};

const cam = { x: 0, y: 0, vx: 0.5, vy: 0.05, auto: true };
const CREATOR_RIPPLES = [];
const BODIES = []; 
let placeMode = null; 
let placing = null;   

const GRAV = {
  G: 1200,            
  MASS_PER_S: 1500,
  R_PER_S: 28,
  MASS_MIN: 400,
  MASS_MAX: 12000,
  R_MIN: 10,
  R_MAX: 85,
  BH_SWALLOW_K: 0.85,
  STAR_SPEED_CLAMP: 1.8,

  INFL_RANGE_K: 2.0,  
  SOFTEN: 8,          
  ORBIT_BIAS: 0.45,   
  DAMP_INFL: 0.997,   
  MAX_ACCEL: 1800     
};

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
  let classic = {
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
    let v = creatorViewOf(creator.stars3D[i], creator.yaw, creator.pitch);
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
  let va = creatorViewOf(creator.stars3D[i], creator.yaw, creator.pitch);
  let vb = creatorViewOf(creator.stars3D[j], creator.yaw, creator.pitch);
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
function drawCreatorEdgeIdxCached(i, j, color, lw=0.9, dash=null) {
  if (!proj) return;
  const A = proj[i], B = proj[j];
  if (!A || !B || !A.p || !B.p) return;

  const pa = A.p, pb = B.p;

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

const CREATOR_LAYERS = [
  { id: 0, r: 1.40, twBoost: -0.10, aBoost: -0.06 }, 
  { id: 1, r: 1.00, twBoost:  0.00, aBoost:  0.00 }, 
  { id: 2, r: 0.70, twBoost: +0.12, aBoost: +0.08 }, 
];

function creatorViewOf(star, yaw, pitch) {
  const R = star.layerR || 1.0;
  const base = { x: star.x * R, y: star.y * R, z: star.z * R };
  return rotX(rotY(base, yaw), pitch);
}

function genCreatorStars(count = 260) {
  creator.stars3D = [];
  const pFar = 0.30, pMid = 0.45;
  const nFar = Math.round(count * pFar);
  const nMid = Math.round(count * pMid);
  const nNear = count - nFar - nMid;

  const plan = [
    { n: nFar,  conf: CREATOR_LAYERS[0] },
    { n: nMid,  conf: CREATOR_LAYERS[1] },
    { n: nNear, conf: CREATOR_LAYERS[2] },
  ];

  for (const { n, conf } of plan) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const sqrt1u = Math.sqrt(1 - u*u);
      const x = sqrt1u * Math.cos(phi);
      const y = u;
      const z = sqrt1u * Math.sin(phi);

      const isGiant = Math.random() < 0.05;
      const mag = isGiant ? 0.9 + Math.random()*0.6 : 0.35 + Math.random()*0.55;

      const twSpeed = (0.8 + Math.random()*0.8) * (1.0 + conf.twBoost); 

      creator.stars3D.push({
        x, y, z,
        mag,
        layerId: conf.id,
        layerR:  conf.r,
        aBoost:  conf.aBoost, 
        phase: Math.random() * Math.PI * 2,
        twSpeed
      });
    }
  }
}
function genClassicStars(count = 260) {
  classic.stars3D = [];
  const pFar = 0.22, pMid = 0.38;
  const nFar = Math.round(count * pFar);
  const nMid = Math.round(count * pMid);
  const nNear = count - nFar - nMid;

  const plan = [
    { n: nFar,  conf: CREATOR_LAYERS[0] },
    { n: nMid,  conf: CREATOR_LAYERS[1] },
    { n: nNear, conf: CREATOR_LAYERS[2] },
  ];

  for (const { n, conf } of plan) {
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const sqrt1u = Math.sqrt(1 - u*u);
      const x = sqrt1u * Math.cos(phi);
      const y = u;
      const z = sqrt1u * Math.sin(phi);

      const isGiant = Math.random() < 0.05;
      const mag = isGiant ? 0.9 + Math.random()*0.6 : 0.35 + Math.random()*0.55;

      const twSpeed = (0.8 + Math.random()*0.8) * (1.0 + conf.twBoost);

      classic.stars3D.push({
        x, y, z,
        mag,
        layerId: conf.id,
        layerR:  conf.r,
        aBoost:  conf.aBoost,
        phase: Math.random() * Math.PI * 2,
        twSpeed
      });
    }
  }
}

function wantedCreatorStars() {
  const W = canvas.width, H = canvas.height;
  const classicN = Math.floor(0.00012 * W * H) + 80; 
  const screenComp = 2.0; 
  const cap = 900;
  return Math.min(cap, Math.floor(classicN * screenComp));
}

function wantedClassicStars() {
  const W = canvas.width, H = canvas.height;
  const base = Math.floor(0.00012 * W * H) + 80;
  const mul = 2.4;
  const cap = 1500;
  return Math.min(cap, Math.floor(base * mul));
}


function rotY(v, a){ const ca=Math.cos(a), sa=Math.sin(a); return {x: ca*v.x+sa*v.z, y:v.y, z:-sa*v.x+ca*v.z}; }
function rotX(v, a){ const ca=Math.cos(a), sa=Math.sin(a); return {x: v.x, y: ca*v.y-sa*v.z, z: sa*v.y+ca*v.z}; }

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
  }

  if (mode !== 'classic') {
    classic.active = false;
    classic.play = false;
    classic.picked = [];
    classic.tempEdges = [];
    classic.hoverStar = -1;
  }

  cam.auto = true;
  setAutoSpeedFor(mode);

  if (mode === 'waves') {
    WAVES.length = 0;
    waveAutoTimer = 0;
    waveAutoDelay = 6 + Math.random() * 6;

    placingKey = null;
    placingType = null;
    placingRPreview = 0;
    placingStart = 0;
}
  
if (mode === 'creator') {
  creator.active = true;
  creator.play = false;
  creator.picked = [];
  creator.tempEdges = [];
  creator.hoverStar = -1;
  if (!creator.stars3D.length) {
    genCreatorStars(wantedCreatorStars());
  }
  cam.auto = true;
  cam.vx = 0;
  cam.vy = 0;
}

if (mode === 'classic') {
  classic.active = true;
  classic.play = false;
  classic.picked = [];
  classic.tempEdges = [];
  classic.hoverStar = -1;
  if (!classic.stars3D.length) {
    genClassicStars(wantedClassicStars());
  }
  cam.auto = true;
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
});

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
  if (currentMode === 'classic' && classic.active) {
  genClassicStars(wantedClassicStars());
  }
  window.scrollTo(0,0);
}); 

const N = Math.floor(0.00012*window.innerWidth*window.innerHeight) + 80;
const MAX_SPEED = 0.5;
const STARS = [];
let t = 0;
let frame = 0;
const WAVES = []; 
let waveAutoTimer = 0;
let waveAutoDelay = 6 + Math.random()*6; 

const WAVECFG = {
  amp: 12,        
  width: 80,      
  life: 3.0,      
  auto: true,     
  longpressMs: 220, 
};

let wavePressing = false;
let wavePressStart = 0;
let waveLastEmitT = 0;

function emitWave(x, y, amp = 10, width = 70, life = 2.8) {
  WAVES.push({ x, y, r: 0, life, amp, width });
}

function waveOffsetAt(x, y) {
  let ox = 0, oy = 0;
  for (const w of WAVES) {
    const dx = x - wrap(w.x - cam.x, canvas.width);
    const dy = y - wrap(w.y - cam.y, canvas.height);
    const d = Math.hypot(dx, dy) + 1e-6;

    const band = Math.abs(d - w.r);
    const envelope = Math.exp(-band / w.width) * Math.max(0, w.life);
    const push = (w.amp * envelope);

    ox += (dx / d) * push * 0.35;
    oy += (dy / d) * push * 0.35;

    const phase = Math.sin((d - w.r) * 0.12);
    ox += (dx / d) * phase * push * 0.15;
    oy += (dy / d) * phase * push * 0.15;
  }
  return { x: ox, y: oy };
}

function updateAndRenderWaves() {
  for (let i = WAVES.length - 1; i >= 0; i--) {
    const w = WAVES[i];
    w.r += 220 * 0.016;       
    w.life -= 0.016 * 0.6;     
    if (w.life <= 0) WAVES.splice(i, 1);
  }

  for (const w of WAVES) {
    const rx = wrap(w.x - cam.x, canvas.width);
    const ry = wrap(w.y - cam.y, canvas.height);
    const alpha = Math.max(0, Math.min(0.45, w.life * 0.5));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(180,230,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(rx, ry, w.r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

const mouse = { x: -9999, y: -9999 };
const R = 85;

const SHOOTERS = [];       
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

function torusVec(ax, ay, bx, by, W, H) {
  let dx = bx - ax, dy = by - ay;
  if (dx >  W/2) dx -= W; else if (dx < -W/2) dx += W;
  if (dy >  H/2) dy -= H; else if (dy < -H/2) dy += H;
  return { dx, dy };
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function chooseOrbitRadius(body, r) {
  const base = body.r;
  const rings = [1.2, 1.6, 2.0, 2.6];
  let best = base * rings[0];
  let bestDiff = Math.abs(r - best);
  for (let i = 1; i < rings.length; i++) {
    const cand = base * rings[i];
    const diff = Math.abs(r - cand);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  return { target: best, diff: bestDiff };
}
function lockStarToOrbit(star, body, dist, tangential) {
  star.orbiting = body;

  const rings = [1.3, 1.7, 2.1, 2.5];
  let best = body.r * 1.7;
  let bestDiff = Infinity;
  for (const k of rings) {
    const cand = body.r * k;
    const d = Math.abs(cand - dist);
    if (d < bestDiff) {
      bestDiff = d;
      best = cand;
    }
  }

  star.orbitR = best;

  const dx = star.x - body.x;
  const dy = star.y - body.y;
  star.orbitA = Math.atan2(dy, dx);

  const base = 0.22 / Math.sqrt(best / body.r);
  const dir = (tangential >= 0) ? 1 : -1;
  star.orbitSpeed = dir * base;
}

function getPlacementPoint() {
  const W = canvas.width, H = canvas.height;
  const inside = (mouse.x >= 0 && mouse.x < W && mouse.y >= 0 && mouse.y < H);
  const sx = inside ? mouse.x : W / 2;
  const sy = inside ? mouse.y : H / 2;
  return { wx: cam.x + sx, wy: cam.y + sy };
}

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
  if ((e.key === 'p' || e.key === 'P' || e.key === 'b' || e.key === 'B')) {
    const key = e.key.toLowerCase();
    if (placingKey !== key) {
      placingKey = key;
      placingType = (key === 'p') ? 'planet' : 'blackhole';
      placingStart = performance.now();
      placingRPreview = GRAV.R_MIN;

      const hud = document.getElementById('hud'), txt = document.getElementById('hud-text');
      if (hud && txt) {
        txt.textContent = `Waves: holding ${placingType.toUpperCase()} — release to place`;
        hud.hidden = false; clearTimeout(hud._t);
        hud._t = setTimeout(()=>{ hud.hidden = true; }, 1200);
      }
    }
  }
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];
    if (keys.includes(e.key)) e.preventDefault();
    const kick = (currentMode === 'creator') ? 0.15 : 0.6; 
    if ((currentMode === 'creator' && creator.active) ||
      (currentMode === 'classic' && classic.active)) {
        const target = (currentMode === 'creator') ? creator : classic;
        const STEP = 0.02;
        if (e.key === 'ArrowLeft')  { target.yaw   -= STEP; target.auto = false; }
        if (e.key === 'ArrowRight') { target.yaw   += STEP; target.auto = false; }
        if (e.key === 'ArrowUp')    { target.pitch -= STEP; target.auto = false; }
        if (e.key === 'ArrowDown')  { target.pitch += STEP; target.auto = false; }

        const LIM = Math.PI/2 * 0.9;
        if (target.pitch >  LIM) target.pitch =  LIM;
        if (target.pitch < -LIM) target.pitch = -LIM;

        if (e.key === ' ') {
          e.preventDefault();
          target.auto = !target.auto;
        }
    }
    if (currentMode === 'creator' && creator.active) {
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

    if (currentMode === 'waves') {
      if (e.key === 'g' || e.key === 'G') {
        const wx = cam.x + canvas.width  / 2;
        const wy = cam.y + canvas.height / 2;
        emitWave(wx, wy, WAVECFG.amp * 1.2, WAVECFG.width, WAVECFG.life);
      }
      if (e.key === 'a' || e.key === 'A') {
        WAVECFG.auto = !WAVECFG.auto;
        const hud = document.getElementById('hud');
        const txt = document.getElementById('hud-text');
        if (hud && txt) {
          txt.textContent = WAVECFG.auto ? 'Waves: auto=ON' : 'Waves: auto=OFF';
          hud.hidden = false;
          clearTimeout(hud._t);
          hud._t = setTimeout(()=>{ hud.hidden = true; }, 1500);
        }
      }
      if (e.key === '[') { WAVECFG.amp = Math.max(2, WAVECFG.amp - 1); }
      if (e.key === ']') { WAVECFG.amp = Math.min(40, WAVECFG.amp + 1); }

      if (e.key === ';') { WAVECFG.width = Math.max(20, WAVECFG.width - 5); }
      if (e.key === "'") { WAVECFG.width = Math.min(200, WAVECFG.width + 5); }
    }

    if (e.key === ' ') {
      cam.auto = !cam.auto;
      if (cam.auto) setAutoSpeedFor(currentMode);
    }
    if (e.key === '0') { cam.x = cam.y = cam.vx = cam.vy = 0; cam.auto = false; }
    
   
});

window.addEventListener('keyup', (e) => {
  if (currentMode !== 'waves') return;
  const key = e.key.toLowerCase();
  if (!placingKey || key !== placingKey) return;

  const held = (performance.now() - placingStart) / 1000;
  const mass = Math.max(GRAV.MASS_MIN, Math.min(GRAV.MASS_MAX, GRAV.MASS_MIN + GRAV.MASS_PER_S * held));
  const r = Math.max(GRAV.R_MIN, Math.min(GRAV.R_MAX, GRAV.R_MIN + GRAV.R_PER_S * held));

  const { wx, wy } = getPlacementPoint();
  const PLANET_COLORS = [
  'rgba(170,220,255,',   
  'rgba(255,210,160,',   
  'rgba(200,180,255,',   
  'rgba(180,255,210,',   
];

  BODIES.push({
    type: placingType,
    x: wrap(wx, canvas.width),
    y: wrap(wy, canvas.height),
    mass,
    r,
    born: performance.now(),
    color: (placingType === 'planet')
      ? PLANET_COLORS[Math.floor(Math.random()*PLANET_COLORS.length)]
      : null
  });

  placingKey = null;
  placingType = null;
  placingStart = 0;
  placingRPreview = 0;
});

canvas.addEventListener('mousedown', (e) => {
  if (currentMode !== 'waves') return;
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;

  const wx = cam.x + sx;
  const wy = cam.y + sy;
  emitWave(wx, wy, WAVECFG.amp, WAVECFG.width, WAVECFG.life);

  wavePressing = true;
  wavePressStart = performance.now();
  waveLastEmitT = wavePressStart;
});

canvas.addEventListener('mouseup', () => {
  if (currentMode !== 'waves') return;
  wavePressing = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (currentMode !== 'waves' || !wavePressing) return;
  if (placingKey) return; 
  const now = performance.now();
  const pressedFor = now - wavePressStart;
  if (pressedFor < WAVECFG.longpressMs) return;

  if (now - waveLastEmitT < 60) return; 
  waveLastEmitT = now;

  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const wx = cam.x + sx;
  const wy = cam.y + sy;
  emitWave(wx, wy, WAVECFG.amp * 0.8, WAVECFG.width * 0.9, WAVECFG.life * 0.9);
});

const rand = (a, b) => a + Math.random() * (b - a);
const sign = () => Math.random() < 0.5 ? -1 : 1;

STARS.push({
    x: rand(0, canvas.width),
    y: rand(0, canvas.height),
    r: rand(1.0, 2.2),
    vx: rand(0.1, MAX_SPEED) * sign(),
    vy: rand(0.1, MAX_SPEED) * sign(),
    phase: rand(0, 2 * Math.PI),
    orbiting: null,
    orbitR: 0,
    orbitA: 0,
    orbitSpeed: 0
});

for (let i = 0; i < N; i++) {
    STARS.push({
        x: rand(0, canvas.width),
        y: rand(0, canvas.height),
        r: rand(0.7, 1.8),
        vx: rand(0.1, MAX_SPEED) * sign(),
        vy: rand(0.1, MAX_SPEED) * sign(),
        phase: rand(0, 2 * Math.PI),
        orbiting: null,
        orbitR: 0,
        orbitA: 0,
        orbitSpeed: 0
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
    addCreatorRipple(sx, sy);
    return; 
  }
  STARS.push({
    x: wrap(sx + cam.x, canvas.width),
    y: wrap(sy + cam.y, canvas.height),
    r: rand(0.7, 1.8),
    vx: rand(0.1, MAX_SPEED) * sign(),
    vy: rand(0.1, MAX_SPEED) * sign(),
    phase: rand(0, 2 * Math.PI),
    orbiting: null,
    orbitR: 0,
    orbitA: 0,
    orbitSpeed: 0
  });
});

function drawStar(s, brightness){
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
    ctx.fill();
}

function addCreatorRipple(x, y) {
  CREATOR_RIPPLES.push({
    x,
    y,
    r: 0,
    maxR: 45 + Math.random() * 25,
    life: 0.45
  });
}

function drawClassicDust(proj) {
  const D = 120;
  for (let i = 0; i < D; i++) {
    const pick = proj[Math.floor(Math.random() * proj.length)];
    if (!pick || !pick.p) continue;
    const { x, y } = pick.p;

    const jitterX = (Math.random() - 0.5) * 18;
    const jitterY = (Math.random() - 0.5) * 18;
    const alpha = 0.05 + Math.random() * 0.12;

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(x + jitterX, y + jitterY, Math.random() * 1.2 + 0.3, 0, Math.PI*2);
    ctx.fill();
  }
}

function loop() {
    t += 0.016;
    frame++;
    const bg = (currentMode === 'waves') ? 0.30 + 0.05*Math.sin(t*0.8) : 0.35;
    if (currentMode !== 'creator') {
      ctx.fillStyle = `rgba(0, 0, 0, ${bg})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (currentMode === 'creator' && creator.active) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const W = canvas.width, H = canvas.height;
    proj = new Array(creator.stars3D.length);
    for (let i = 0; i < creator.stars3D.length; i++) {
      const v = creatorViewOf(creator.stars3D[i], creator.yaw, creator.pitch);
      const p = projectToScreen(v, W, H);
      proj[i] = { v, p }; 
    }

    if (creator.auto) {
    creator.yaw += creator.autoYaw;
    const targetPitch = creator.autoPitchAmp * Math.sin(t * 0.25);
    creator.pitch += (targetPitch - creator.pitch) * 0.02;
   }

  for (let i = 0; i < creator.stars3D.length; i++) {
    const s0 = creator.stars3D[i];
    const cached = proj[i];
    const v = cached.v;
    const p = cached.p;
    if (!p) continue;

    const depth = Math.max(0.001, v.z);

    const flick = 0.5 + 0.5 * Math.sin((1.35 * s0.twSpeed) * t + s0.phase);

    let baseAlpha = Math.max(0.18, 0.28 + 0.42 / depth);
    baseAlpha += (s0.aBoost || 0); 
    const alpha = Math.min(0.88, baseAlpha * (0.55 + 0.65 * flick));

    const sizeBase = Math.max(0.6, s0.mag * (0.75 + 0.22 / depth));
    const size = sizeBase * (0.80 + 0.55 * flick);

    const rHalo = size * 1.8;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rHalo);
    g.addColorStop(0, `rgba(255,255,255,${alpha * 0.55})`);
    g.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rHalo, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

   for (const C of USER_CONSTELLATIONS) {
  const col = C.color || 'rgba(255,230,170,0.9)';

  for (const [i, j] of C.edges) {
    drawCreatorEdgeIdxCached(i, j, col, 1.2);
  }

  if (C.edges.length) {
    let sx = 0, sy = 0, cnt = 0;
    for (const [i, j] of C.edges) {
      const Ai = proj[i], Bj = proj[j];
      if (!Ai || !Bj || !Ai.p || !Bj.p) continue;
      sx += (Ai.p.x + Bj.p.x) * 0.5;
      sy += (Ai.p.y + Bj.p.y) * 0.5;
      cnt++;
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
      drawCreatorEdgeIdxCached(i, j, 'rgba(255,230,170,0.9)', 1.3);
    }
  }

    if (creator.picked.length > 0 && creator.hoverStar !== -1) {
      const a = creator.picked[creator.picked.length - 1];
      const b = creator.hoverStar;
      drawCreatorEdgeIdxCached(a, b, 'rgba(255,230,170,0.6)', 1.0, [6,6]);
    }

   if (creator.hoverStar !== -1) {
    const C = proj[creator.hoverStar];
    if (C && C.p) {
      ctx.beginPath();
      ctx.arc(C.p.x, C.p.y, 3, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,230,170,0.9)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
    }}
    for (let i = CREATOR_RIPPLES.length - 1; i >= 0; i--) {
      const rp = CREATOR_RIPPLES[i];
      rp.r += 120 * 0.016;
      rp.life -= 0.016;
      if (rp.life <= 0) {
        CREATOR_RIPPLES.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, Math.min(0.45, rp.life / 0.55 * 0.45));
      ctx.lineWidth = 1.1;
      ctx.strokeStyle = `rgba(255,230,170,${alpha})`;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    requestAnimationFrame(loop);
    return; 
  }
  if (currentMode === 'classic' && classic.active) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const W = canvas.width, H = canvas.height;
    proj = new Array(classic.stars3D.length);
    for (let i = 0; i < classic.stars3D.length; i++) {
      const v = creatorViewOf(classic.stars3D[i], classic.yaw, classic.pitch);
      const p = projectToScreen(v, W, H);
      proj[i] = { v, p };
    }
    drawClassicDust(proj);

    if (classic.auto) {
      classic.yaw += classic.autoYaw;
      const targetPitch = classic.autoPitchAmp * Math.sin(t * 0.22);
      classic.pitch += (targetPitch - classic.pitch) * 0.02;
    }

    for (let i = 0; i < classic.stars3D.length; i++) {
      const s0 = classic.stars3D[i];
      const cached = proj[i];
      const v = cached.v;
      const p = cached.p;
      if (!p) continue;
    
      const depth = Math.max(0.001, v.z);
      const flick = 0.5 + 0.5 * Math.sin((1.25 * s0.twSpeed) * t + s0.phase);
      let baseAlpha = Math.max(0.25, 0.34 + 0.50 / depth);
      baseAlpha += (s0.aBoost || 0);
      const alpha = Math.min(0.95, baseAlpha * (0.60 + 0.70 * flick));
      const sizeBase = Math.max(0.6, s0.mag * (0.75 + 0.22 / depth));
      const size = sizeBase * (0.80 + 0.55 * flick);
      const rHalo = size * 1.8;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rHalo);
      g.addColorStop(0, `rgba(255,255,255,${alpha * 0.55})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rHalo, 0, Math.PI*2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
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

  if (currentMode === 'waves') {
    updateAndRenderWaves();
    const now = performance.now();
    for (let i = BODIES.length - 1; i >= 0; i--) {
      const b = BODIES[i];
      if (b.born && (now - b.born) > 60000) {
        BODIES.splice(i, 1);
      }
    }

    if (placingKey && placingType) {
      const held = (performance.now() - placingStart) / 1000;
      placingRPreview = Math.max(GRAV.R_MIN, Math.min(GRAV.R_MAX, GRAV.R_MIN + GRAV.R_PER_S * held));
      const { wx, wy } = getPlacementPoint();
      const rx = wrap(wx - cam.x, canvas.width);
      const ry = wrap(wy - cam.y, canvas.height);

      ctx.setLineDash([6,4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = (placingType === 'planet') ? 'rgba(170,220,255,0.95)' : 'rgba(255,230,170,0.95)';
      ctx.beginPath();
      ctx.arc(rx, ry, placingRPreview, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const body of BODIES) {
      const rx = wrap(body.x - cam.x, canvas.width);
      const ry = wrap(body.y - cam.y, canvas.height);

      if (body.type === 'planet') {
        const base = body.color || 'rgba(170,220,255,';
        const grd = ctx.createRadialGradient(rx, ry, 0, rx, ry, body.r);
        grd.addColorStop(0, base + '0.85)');
        grd.addColorStop(1, base + '0.0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(rx, ry, body.r, 0, Math.PI*2);
        ctx.fill();

        ctx.strokeStyle = base + '0.45)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rx, ry, body.r*0.35, 0, Math.PI*2);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.beginPath();
        ctx.arc(rx, ry, body.r*0.6, 0, Math.PI*2);
        ctx.fill();

        const ring = ctx.createRadialGradient(rx, ry, body.r*0.6, rx, ry, body.r*1.05);
        ring.addColorStop(0, 'rgba(0,0,0,0.0)');
        ring.addColorStop(1, 'rgba(255,230,170,0.35)');
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(rx, ry, body.r*1.05, 0, Math.PI*2);
        ctx.fill();
      }
    }

    if (WAVECFG.auto) {
      waveAutoTimer += 0.016;
      if (waveAutoTimer >= waveAutoDelay) {
        const wx = cam.x + Math.random() * canvas.width;
        const wy = cam.y + Math.random() * canvas.height;
        emitWave(wx, wy, WAVECFG.amp, WAVECFG.width, WAVECFG.life);
        waveAutoTimer = 0;
        waveAutoDelay = 6 + Math.random() * 6;
      }
    }

    for (let s of STARS) {
      if (s.orbiting) {
        const body = s.orbiting;
        if (!BODIES.includes(body)) {
          s.orbiting = null;
        } else {
          s.orbitA += s.orbitSpeed;
          const cx = body.x;
          const cy = body.y;
          s.x = cx + Math.cos(s.orbitA) * s.orbitR;
          s.y = cy + Math.sin(s.orbitA) * s.orbitR;

          const b = 0.6 + 0.4 * Math.sin(1.7*t + s.phase);
          let rx = wrap(s.x - cam.x, canvas.width);
          let ry = wrap(s.y - cam.y, canvas.height);

          const o = waveOffsetAt(rx, ry);
          rx += o.x;
          ry += o.y;
          if (Math.hypot(o.x, o.y) > 4) {
            s.orbiting = null;
            s.vx += o.x * 0.25;
            s.vy += o.y * 0.25;
          }

          drawStar({ x: rx, y: ry, r: s.r }, b);
          continue;
        }
      }

      if (BODIES.length) {
        const W = canvas.width, H = canvas.height;
        let axSum = 0, aySum = 0;

        for (const body of BODIES) {
          const { dx, dy } = torusVec(s.x, s.y, body.x, body.y, W, H);
          const r2s = dx*dx + dy*dy;
          const r = Math.max(1e-6, Math.sqrt(r2s));
          const inflR = GRAV.INFL_RANGE_K * body.r;
          if (r > inflR) continue;

          if (body.type === 'blackhole') {
            const swallowR = GRAV.BH_SWALLOW_K * body.r;
            if (r < swallowR) {
              s.x = rand(0, W);
              s.y = rand(0, H);
              s.vx = rand(0.1, MAX_SPEED) * sign();
              s.vy = rand(0.1, MAX_SPEED) * sign();
              continue;
            }
          }

          const r2 = r2s + GRAV.SOFTEN * GRAV.SOFTEN;
          const baseA = GRAV.G * body.mass / r2;
          const x = r / body.r;
          const fall = (x <= 1) ? 1 : (1 - smoothstep(1, GRAV.INFL_RANGE_K, x));
          const a = baseA * fall;

          const ux = dx / r, uy = dy / r;
          const tx = -uy, ty = ux;
          const vr = s.vx * ux + s.vy * uy;

          let ax = 0, ay = 0;

          if (body.type === 'planet') {
            const { target, diff } = chooseOrbitRadius(body, r);
            const snapTolerance = body.r * 0.4;
            if (diff < snapTolerance) {
              const tangential = s.vx * tx + s.vy * ty;
              lockStarToOrbit(s, body, r, tangential);
              continue;
            }
            const dir = (r > target) ? -1 : +1;
            const pull = a * 0.55;
            ax += dir * pull * ux;
            ay += dir * pull * uy;
          } else {
            ax = a * ux;
            ay = a * uy;
            if (vr < 0) {
              const twist = GRAV.ORBIT_BIAS * (1 - Math.min(1, r / inflR));
              ax += a * twist * tx;
              ay += a * twist * ty;
            }
          }

          axSum += ax;
          aySum += ay;
        }

        const aMag = Math.hypot(axSum, aySum);
        if (aMag > GRAV.MAX_ACCEL) {
          const k = GRAV.MAX_ACCEL / aMag;
          axSum *= k; aySum *= k;
        }

        s.vx += axSum * 0.016;
        s.vy += aySum * 0.016;

        let inAnyInfluence = false;
        for (const body of BODIES) {
          const { dx, dy } = torusVec(s.x, s.y, body.x, body.y, W, H);
          if (Math.hypot(dx, dy) <= GRAV.INFL_RANGE_K * body.r) { inAnyInfluence = true; break; }
        }
        if (inAnyInfluence) {
          s.vx *= GRAV.DAMP_INFL;
          s.vy *= GRAV.DAMP_INFL;
        }

        const sp = Math.hypot(s.vx, s.vy);
        if (sp > GRAV.STAR_SPEED_CLAMP) {
          const k = GRAV.STAR_SPEED_CLAMP / sp;
          s.vx *= k; s.vy *= k;
        }
      }

      s.x += s.vx;
      s.y += s.vy;
      if (s.x > canvas.width) s.x = 0;
      if (s.x < 0) s.x = canvas.width;
      if (s.y > canvas.height) s.y = 0;
      if (s.y < 0) s.y = canvas.height;

      const b = 0.6 + 0.4 * Math.sin(1.7*t + s.phase);
      let rx = wrap(s.x - cam.x, canvas.width);
      let ry = wrap(s.y - cam.y, canvas.height);

      const o = waveOffsetAt(rx, ry);
      rx += o.x;
      ry += o.y;

      drawStar({ x: rx, y: ry, r: s.r }, b);
    }

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
  }

  requestAnimationFrame(loop);
}
    
loop();