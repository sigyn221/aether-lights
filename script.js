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
const METEORS3D = [];
let placeMode = null; 
let placing = null;   

let nebulaCanvas = null;
let nebulaCtx = null;
let nebulaW = 512;
let nebulaH = 256;
let nebulaShift = 0;       
let nebulaColorPhase = 0;  
let nebulaReady = false;

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
let meteorShower = {
  active: false,
  t: 0,
  duration: 5.0,
  spawnEvery: 0.12,
  sinceLast: 0,
  dir: null,
  vx: 0,
  vy: 0
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
  const cap = 2200;
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
  generateNebula();
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

const deg2rad = d => d * Math.PI / 180;
function raHMS(h, m, s) {
  return (h + m/60 + s/3600) * 15; 
}
function raDecToXYZ(raDeg, decDeg) {
  const ra = deg2rad(raDeg);
  const dec = deg2rad(decDeg);
  const x = Math.cos(dec) * Math.cos(ra);
  const y = Math.sin(dec);
  const z = Math.cos(dec) * Math.sin(ra);
  return { x, y, z };
}

const KNOWN_CONSTELLATIONS = {
  orion: {
    label: 'Orion',
    color: '255,230,170',
    stars: [
      // 0 Betelgeuse 
      raDecToXYZ(raHMS(5,55,10), 7.4),
      // 1 Bellatrix 
      raDecToXYZ(raHMS(5,25,7), 6.35),
      // 2 Alnitak 
      raDecToXYZ(raHMS(5,40,45), -1.93),
      // 3 Alnilam 
      raDecToXYZ(raHMS(5,36,13), -1.2),
      // 4 Mintaka 
      raDecToXYZ(raHMS(5,32,0), -0.28),
      // 5 Saiph 
      raDecToXYZ(raHMS(5,47,45), -9.66),
      // 6 Rigel 
      raDecToXYZ(raHMS(5,14,32), -8.2),
      // 7 Meissa 
      raDecToXYZ(raHMS(5,35,8), 9.93),
    ],
    edges: [
      [7,0], [7,1],
      [0,1],
      [0,2], [2,5],
      [1,4], [4,6],
      [2,3], [3,4],
      [5,6],
    ],
    labelFrom: [2,3,4],
  },
  ursa_major: {
    label: 'Ursa Major',
    color: '173,216,255',
    stars: [
      // 0 Dubhe 
      raDecToXYZ(raHMS(11, 3, 43), +61.75),
      // 1 Merak 
      raDecToXYZ(raHMS(11, 1, 50), +56.38),
      // 2 Phecda 
      raDecToXYZ(raHMS(11, 53, 49), +53.69),
      // 3 Megrez 
      raDecToXYZ(raHMS(12, 15, 25), +57.03),
      // 4 Alioth 
      raDecToXYZ(raHMS(12, 54, 1), +55.96),
      // 5 Mizar 
      raDecToXYZ(raHMS(13, 23, 55), +54.93),
      // 6 Alkaid 
      raDecToXYZ(raHMS(13, 47, 32), +49.31),
    ],
        edges: [
      [0,1], [0,3],
      [1,2], [2,3],
      [3,4], 
      [4,5],
      [5,6],
    ],
    labelFrom: [2,3,4],
  },
  cassiopeia: {
    label: 'Cassiopeia',
    color: '255,200,230',
    stars: [
      // 0 Caph 
      raDecToXYZ(raHMS(0, 9, 10), +59.15),
      // 1 Schedar
      raDecToXYZ(raHMS(0, 40, 30), +56.54),
      // 2 Cih /
      raDecToXYZ(raHMS(0, 56, 42), +60.72),
      // 3 Ruchbah 
      raDecToXYZ(raHMS(1, 25, 48), +60.24),
      // 4 Segin 
      raDecToXYZ(raHMS(1, 54, 23), +63.67),
    ],
        edges: [
      [0,1],
      [1,2], 
      [2,3],
      [3,4],
    ],
    labelFrom: [1,2,3],
  },
  cygnus: {
    label: 'Cygnus',
    color: '200,255,210',
    stars: [
      // 0 Deneb 
      raDecToXYZ(raHMS(20, 41, 25), +45.28),
      // 1 Sadr 
      raDecToXYZ(raHMS(20, 22, 14), +40.26),
      // 2 Gienah 
      raDecToXYZ(raHMS(20, 46, 13), +33.97),
      // 3 Delta Cygni
      raDecToXYZ(raHMS(19, 44, 58), +45.13),
      // 4 Albireo 
      raDecToXYZ(raHMS(19, 30, 43), +27.96),
    ],
        edges: [
       [0,1], [1,2], [1,3], [1,4],
    ],
    labelFrom: [1,2,3],
  },
  scorpius: {
    label: 'Scorpius',
    color: '255,180,180',
    stars: [
      // 0 Antares 
      raDecToXYZ(raHMS(16, 29, 24), -26.43),
      // 1 Acrab 
      raDecToXYZ(raHMS(16, 5, 26), -19.80),
      // 2 Dschubba 
      raDecToXYZ(raHMS(16, 0, 20), -22.62),
      // 3 π Sco
      raDecToXYZ(raHMS(15, 59, 51), -26.11),
      // 4 Shaula 
      raDecToXYZ(raHMS(17, 33, 36), -37.10),
      // 5 Lesath 
      raDecToXYZ(raHMS(17, 30, 45), -37.30),
      // 6 Sargas 
      raDecToXYZ(raHMS(17, 37, 20), -43.00),
      // 7 ε Sco
      raDecToXYZ(raHMS(16, 50, 10), -34.30),
    ],
     edges: [
       [0,1], [0,2], [3,0], [0,7], [7,4], [4,5], [5,6]
    ],
    labelFrom: [0, 4, 5],
  },
  leo: {
    label: 'Leo',
    color: '255,220,190',
    stars: [
      // 0 Regulus 
      raDecToXYZ(raHMS(10, 8, 22), +11.97),
      // 1 Algieba 
      raDecToXYZ(raHMS(10, 19, 58), +19.84),
      // 2 Zosma 
      raDecToXYZ(raHMS(11, 14, 6), +20.52),
      // 3 Denebola 
      raDecToXYZ(raHMS(11, 49, 4), +14.57),
      // 4 Adhafera 
      raDecToXYZ(raHMS(10, 17, 6), +23.42),
      // 5 Ras Elased Australis 
      raDecToXYZ(raHMS(9, 46, 6), +23.77),
      // 6 Rasalas 
      raDecToXYZ(raHMS(9, 52, 45), +26.00),
    ],
    edges: [
      [6,5], [5,4], [4,1],
      [1,0], [1,2], [0,3], [2,3]
    ],
    labelFrom: [0,2],
  },
  pegasus: {
   label: 'Pegasus',
   color: '190,210,2550',
   stars: [
    // 0 Markab 
    raDecToXYZ(raHMS(23, 4, 46), +15.21),
    // 1 Scheat 
    raDecToXYZ(raHMS(23, 3, 46), +28.08),
    // 2 Algenib 
    raDecToXYZ(raHMS(0, 13, 14), +15.18),
    // 3 Alpheratz 
    raDecToXYZ(raHMS(0, 8, 23), +29.09),
    // 4 Enif 
    raDecToXYZ(raHMS(21, 44, 12), +9.87),
    // 5 Homam 
    raDecToXYZ(raHMS(22, 41, 28), +10.83),
    // 6 Matar 
    raDecToXYZ(raHMS(22, 50, 4), +30.22),
  ],
  edges: [
    [0,1], [1,3], [3,2], [2,0],
    [0,5], [5,4],
    [1,6],
  ],
  labelFrom: [0,1,2],
},
lyra: {
  label: 'Lyra',
  color: '180,200,255',
  stars: [
    // 0 Vega 
    raDecToXYZ(raHMS(18, 36, 56), +38.78),
    // 1 Sheliak 
    raDecToXYZ(raHMS(18, 50, 4), +33.36),
    // 2 Sulafat 
    raDecToXYZ(raHMS(18, 58, 56), +32.69),
    // 3 δ² Lyr
    raDecToXYZ(raHMS(18, 54, 30), +36.90),
    // 4 ζ Lyr
    raDecToXYZ(raHMS(18, 44, 46), +37.60),
  ],
  edges: [
    [4,3], [1,2], [0,4], [1,4], [3,2]
  ],
  labelFrom: [0,3,2],
},
carina: {
  label: 'Carina',
  color: '200,230,255',
  stars: [
    // 0 Canopus 
    raDecToXYZ(raHMS(6, 23, 57), -52.70),
    // 1 Miaplacidus 
    raDecToXYZ(raHMS(9, 13, 12), -69.72),
    // 2 Avior 
    raDecToXYZ(raHMS(8, 22, 31), -59.51),
    // 3 Aspidiske 
    raDecToXYZ(raHMS(9, 17, 6), -59.27),
    // 4 Theta Car
    raDecToXYZ(raHMS(10, 42, 57), -64.39),
  ],
  edges: [
    [0,2], [3,2], [3,4], [1,4]
  ],
  labelFrom: [0,2,3],
},
carina: {
  label: 'Carina',
  color: '200,230,255',
  stars: [
    // 0 Canopus 
    raDecToXYZ(raHMS(6, 23, 57), -52.70),
    // 1 Miaplacidus 
    raDecToXYZ(raHMS(9, 13, 12), -69.72),
    // 2 Avior 
    raDecToXYZ(raHMS(8, 22, 31), -59.51),
    // 3 Aspidiske 
    raDecToXYZ(raHMS(9, 17, 6), -59.27),
    // 4 Theta Car
    raDecToXYZ(raHMS(10, 42, 57), -64.39),
  ],
  edges: [
    [0,2], [3,2], [3,4], [1,4]
  ],
  labelFrom: [0,2,3],
},
aquila: {
  label: 'Aquila',
  color: '190,230,255',
  stars: [
    // 0 Altair 
    raDecToXYZ(raHMS(19, 50, 47), +8.87),
    // 1 Tarazed 
    raDecToXYZ(raHMS(19, 46, 15), +10.61),
    // 2 Alshain 
    raDecToXYZ(raHMS(19, 55, 18), +6.41),
    // 3 δ Aql
    raDecToXYZ(raHMS(19, 25, 29), +3.12),
    // 4 ζ Aql
    raDecToXYZ(raHMS(19, 5, 25), +13.86),
    // 5 η Aql
    raDecToXYZ(raHMS(19, 52, 28), +1.00),
  ],
  edges: [
    [1,0],
    [0,2],
    [0,4],
    [0,3],
    [2,5],
  ],
  labelFrom: [0,1,2],
},
crux: {
  label: 'Crux',
  color: '255,230,180',
  stars: [
    // 0 Acrux 
    raDecToXYZ(raHMS(12, 26, 36), -63.10),
    // 1 Mimosa 
    raDecToXYZ(raHMS(12, 47, 43), -59.69),
    // 2 Gacrux 
    raDecToXYZ(raHMS(12, 31, 9), -57.11),
    // 3 δ Cru
    raDecToXYZ(raHMS(12, 15, 8), -58.75),
    // 4 ε Cru
    raDecToXYZ(raHMS(12, 21, 22), -60.40),
  ],
  edges: [
    [0,2], 
    [3,1], 
  ],
  labelFrom: [0,1,2],
},
gemini: {
  label: 'Gemini',
  color: '220,245,255',
  stars: [
    // 0 Castor 
    raDecToXYZ(raHMS(7, 34, 36), +31.89),
    // 1 Pollux 
    raDecToXYZ(raHMS(7, 45, 19), +28.03),
    // 2 Alhena 
    raDecToXYZ(raHMS(6, 37, 42), +16.40),
    // 3 Wasat 
    raDecToXYZ(raHMS(7, 20, 7), +21.98),
    // 4 Mekbuda 
    raDecToXYZ(raHMS(7, 4, 6), +20.57),
    // 5 Tejat 
    raDecToXYZ(raHMS(6, 22, 58), +22.51),
    // 6 Propus 
    raDecToXYZ(raHMS(6, 14, 52), +22.51),
  ],
  edges: [
    [0,1],
    [3,4], [4,2],
    [1,3], [5,6],
    [0,5]
  ],
  labelFrom: [0,1,3],
},
};

const CONSTEL_STATE = {
  active: false,
  name: null,        
  t: 0,
  cooldown: 0,        
  period: 15,         
  dur: 10,            
};

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

function spawn3DMeteor(mode = currentMode, edgeOpt = null, velOpt = null) {
  const W = canvas.width;
  const H = canvas.height;

  const edge = edgeOpt || ['top','right','bottom','left'][Math.floor(Math.random()*4)];

  let sx, sy;
  if (edge === 'top')    { sx = Math.random()*W; sy = -30; }
  if (edge === 'bottom') { sx = Math.random()*W; sy = H+30; }
  if (edge === 'left')   { sx = -30; sy = Math.random()*H; }
  if (edge === 'right')  { sx = W+30; sy = Math.random()*H; }

  const zStart = 1.4 + Math.random()*0.5;
  const f = 0.9 * Math.min(W, H);
  const x3 = (sx - W/2) / f * zStart;
  const y3 = (H/2 - sy) / f * zStart;

  let vx, vy, vz;

  if (velOpt) {
    vx = velOpt.vx;
    vy = velOpt.vy;
    vz = velOpt.vz;
    vx += (Math.random() - 0.5) * 0.08;
    vy += (Math.random() - 0.5) * 0.08;
  } else {
    const target = { x: 0, y: 0, z: 1.0 };
    let dx = target.x - x3;
    let dy = target.y - y3;
    let dz = target.z - zStart;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;
    dx += (Math.random() - 0.5) * 0.25;
    dy += (Math.random() - 0.5) * 0.25;
    vx = dx * 1.1;
    vy = dy * 1.1;
    vz = dz * 1.1;
  }

  const PALETTE3D = [
    { tail: '255,214,137', head: '255,244,229' },
    { tail: '173,216,255', head: '235,246,255' },
    { tail: '255,180,200', head: '255,238,245' },
  ];
  const col = PALETTE3D[Math.floor(Math.random()*PALETTE3D.length)];

  METEORS3D.push({
    mode,
    x: x3,
    y: y3,
    z: zStart,
    vx,
    vy,
    vz,
    life: 2.4 + Math.random()*0.6,
    col,
  });
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
    if (e.key === 'm' || e.key === 'M') {
    spawn3DMeteor();
    }
    if (e.key === 'r' || e.key === 'R') {
    const dir = ['top','right','bottom','left'][Math.floor(Math.random()*4)];
    meteorShower.active = true;
    meteorShower.t = 0;
    meteorShower.sinceLast = 999;
    meteorShower.dir = dir;

    let vx = 0, vy = 0, vz = 0.9;
    if (dir === 'top')    { vy =  1.1; }
    if (dir === 'bottom') { vy = -1.1; }
    if (dir === 'left')   { vx =  1.1; }
    if (dir === 'right')  { vx = -1.1; }

    meteorShower.vx = vx;
    meteorShower.vy = vy;
    meteorShower.vz = vz;
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

function render3DMeteors(mode, yaw, pitch) {
  if (!METEORS3D.length) return;

  const W = canvas.width;
  const H = canvas.height;

  for (let i = METEORS3D.length - 1; i >= 0; i--) {
    const m = METEORS3D[i];
    if (m.mode !== mode) continue;

    m.x += m.vx * 0.016;
    m.y += m.vy * 0.016;
    m.z += m.vz * 0.016;
    m.life -= 0.016;

    if (m.z <= 0.05 || m.life <= 0) {
      METEORS3D.splice(i, 1);
      continue;
    }

    const v = rotX(rotY({ x: m.x, y: m.y, z: m.z }, yaw), pitch);
    const p = projectToScreen(v, W, H);
    if (!p) {
      METEORS3D.splice(i, 1);
      continue;
    }

    const depth = Math.max(0.001, v.z);
    const size = 2.0 / depth;

    const back3D = {
      x: m.x - m.vx * 0.12,
      y: m.y - m.vy * 0.12,
      z: m.z - m.vz * 0.12,
    };
    const backV = rotX(rotY(back3D, yaw), pitch);
    const backP = projectToScreen(backV, W, H);
    const alpha = Math.min(0.95, 0.5 + (1.4 - depth) * 0.35);
    const gx0 = backP ? backP.x : p.x;
    const gy0 = backP ? backP.y : p.y;

    const grad = ctx.createLinearGradient(gx0, gy0, p.x, p.y);
    grad.addColorStop(0, `rgba(${m.col.tail}, 0)`);
    grad.addColorStop(1, `rgba(${m.col.tail}, ${alpha})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(gx0, gy0);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI*2);
    ctx.fillStyle = `rgba(${m.col.head}, ${alpha})`;
    ctx.fill();
  }
}
function nrand(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function fbm(x, y) {
  let v = 0.0;
  let a = 0.5;
  let f = 1.0;
  for (let i = 0; i < 4; i++) {
    v += a * nrand(x * f, y * f);
    f *= 2.3;
    a *= 0.52;
  }
  return v;
}
function drawConstellationOverlay(constel, alpha, yaw, pitch) {
  const W = canvas.width;
  const H = canvas.height;
  const projected = [];
  for (let i = 0; i < constel.stars.length; i++) {
    const v = creatorViewOf(constel.stars[i], yaw, pitch); 
    const p = projectToScreen(v, W, H);
    if (!p) {
      projected.push(null);
      continue;
    }
    projected.push({ p, v });
  }

  ctx.save();

  ctx.lineWidth = 1.0;
  ctx.strokeStyle = `rgba(${constel.color || '255,230,170'}, ${alpha * 0.45})`;
  for (const [i, j] of constel.edges) {
    const A = projected[i];
    const B = projected[j];
    if (!A || !B) continue;
    ctx.beginPath();
    ctx.moveTo(A.p.x, A.p.y);
    ctx.lineTo(B.p.x, B.p.y);
    ctx.stroke();
  }

  for (let i = 0; i < projected.length; i++) {
    const P = projected[i];
    if (!P) continue;
    const rHalo = 10;
    const g = ctx.createRadialGradient(P.p.x, P.p.y, 0, P.p.x, P.p.y, rHalo);
    g.addColorStop(0, `rgba(255,255,255,${alpha * 0.55})`);
    g.addColorStop(1, `rgba(255,255,255,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(P.p.x, P.p.y, rHalo, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(P.p.x, P.p.y, 2.4, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
  }

  if (constel.labelFrom && constel.labelFrom.length) {
    let sx = 0, sy = 0, cnt = 0;
    for (const idx of constel.labelFrom) {
      const P = projected[idx];
      if (!P) continue;
      sx += P.p.x;
      sy += P.p.y;
      cnt++;
    }
    if (cnt) {
      sx /= cnt; sy /= cnt;
      ctx.font = '500 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.strokeStyle = `rgba(0,0,0,${alpha*0.6})`;
      ctx.lineWidth = 3;
      ctx.strokeText(constel.label, sx + 10, sy - 10);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillText(constel.label, sx + 10, sy - 10);
    }
  }

  ctx.restore();
}

function generateNebula() {
  nebulaCanvas = document.createElement('canvas');
  nebulaCanvas.width = nebulaW;
  nebulaCanvas.height = nebulaH;
  nebulaCtx = nebulaCanvas.getContext('2d');

  const img = nebulaCtx.createImageData(nebulaW, nebulaH);
  const data = img.data;

  for (let y = 0; y < nebulaH; y++) {
    for (let x = 0; x < nebulaW; x++) {
      const u = x / nebulaW;
      const v = y / nebulaH;
      const band = Math.exp(-Math.pow((v - 0.5) * 3.4, 2)); 
      const noise = fbm(u * 3.5, v * 3.5);

      let val = noise * band;
      val = Math.pow(val, 1.4);

      const idx = (y * nebulaW + x) * 4;
      data[idx + 0] = Math.floor(255 * val);
      data[idx + 1] = Math.floor(230 * val);
      data[idx + 2] = Math.floor(255 * val);
      data[idx + 3] = Math.floor(255 * val); 
    }
  }

  nebulaCtx.putImageData(img, 0, 0);
  nebulaReady = true;
}

function drawNebulaBackground() {
  if (!nebulaReady) return;
  const W = canvas.width;
  const H = canvas.height;

  nebulaShift += 0.025;

  const bandY = H * 0.45;    
  const bandH = H * 0.28;     
  const scale = 2.4;
  const drawW = nebulaW * scale;
  const drawH = nebulaH * scale * 0.6;
  const angle = -Math.PI * 0.065;  

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(angle);

  const shiftX = (nebulaShift % drawW) - drawW;

  ctx.globalAlpha = 0.26;
  for (let x = shiftX; x < W + drawW; x += drawW) {
    ctx.drawImage(
      nebulaCanvas,
      x - W / 2,
      bandY - H / 2 - drawH / 2,
      drawW,
      drawH
    );
  }
  
  const fadeGrad = ctx.createLinearGradient(
    0,
    bandY - H / 2 - bandH / 2,
    0,
    bandY - H / 2 + bandH / 2
  );
  fadeGrad.addColorStop(0.0, 'rgba(26,13,35,0)');
  fadeGrad.addColorStop(0.35, 'rgba(26,13,35,0.35)');
  fadeGrad.addColorStop(0.65, 'rgba(26,13,35,0.35)');
  fadeGrad.addColorStop(1.0, 'rgba(26,13,35,0)');
  ctx.globalAlpha = 1.0;
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(
    -W / 2,
    bandY - H / 2 - bandH / 2,
    W,
    bandH
  );

  ctx.restore();
}

function loop() {
    t += 0.016;
    frame++;
    if (Math.random() < 0.00037) {
      spawn3DMeteor(currentMode);
    }
    if (!meteorShower.active) {
      meteorShower.t += 0.016;          
      if (meteorShower.t >= 180) {      
        const dir = ['top','right','bottom','left'][Math.floor(Math.random()*4)];
        meteorShower.active = true;
        meteorShower.t = 0;
        meteorShower.sinceLast = 999;
        meteorShower.dir = dir;

        let vx = 0, vy = 0, vz = 0.9;
        if (dir === 'top')    { vy =  1.1; }
        if (dir === 'bottom') { vy = -1.1; }
        if (dir === 'left')   { vx =  1.1; }
        if (dir === 'right')  { vx = -1.1; }

        meteorShower.vx = vx;
        meteorShower.vy = vy;
        meteorShower.vz = vz;  
      }
    }
    if (meteorShower.active) {
      meteorShower.t += 0.016;
      meteorShower.sinceLast += 0.016;

      if (meteorShower.sinceLast >= meteorShower.spawnEvery) {
        meteorShower.sinceLast = 0;
        spawn3DMeteor(
        currentMode,
        meteorShower.dir,
        { vx: meteorShower.vx, vy: meteorShower.vy, vz: meteorShower.vz }
      );
      if (Math.random() < 0.35) {
        const otherMode = (currentMode === 'classic') ? 'creator' : 'classic';
        spawn3DMeteor(
          otherMode,
          meteorShower.dir,
          { vx: meteorShower.vx, vy: meteorShower.vy, vz: meteorShower.vz }
        );
      }
      }

      if (meteorShower.t >= meteorShower.duration) {
        meteorShower.active = false;
        meteorShower.dir = null;  
      }
    }

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

    render3DMeteors('creator', creator.yaw, creator.pitch);

    requestAnimationFrame(loop);
    return; 
  }
  if (currentMode === 'classic' && classic.active) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawNebulaBackground();

    const W = canvas.width, H = canvas.height;
    proj = new Array(classic.stars3D.length);
    for (let i = 0; i < classic.stars3D.length; i++) {
      const v = creatorViewOf(classic.stars3D[i], classic.yaw, classic.pitch);
      const p = projectToScreen(v, W, H);
      proj[i] = { v, p };
    }

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
      const size = sizeBase * 1.12 * (0.80 + 0.55 * flick);
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
    
    render3DMeteors('classic', classic.yaw, classic.pitch);
        
    if (!CONSTEL_STATE.active) {
      const keys = Object.keys(KNOWN_CONSTELLATIONS);
      let pick = keys[Math.floor(Math.random() * keys.length)];

      if (CONSTEL_STATE.last && keys.length > 1) {
        let tries = 0;
        while (pick === CONSTEL_STATE.last && tries < 5) {
          pick = keys[Math.floor(Math.random() * keys.length)];
          tries++;
        }
      }

      CONSTEL_STATE.active = true;
      CONSTEL_STATE.name = pick;
      CONSTEL_STATE.last = pick;   
      CONSTEL_STATE.t = 0;
    } else {
      CONSTEL_STATE.t += 0.016;
      const T = CONSTEL_STATE.t;
      const DUR = 10;   

      let alpha = 0;
      if (T < 1.2) {
        alpha = T / 1.2;              
      } else if (T < DUR - 1.2) {
        alpha = 1;                    
      } else {
        const left = DUR - T;
        alpha = Math.max(0, left / 1.2); 
      }

      const c = KNOWN_CONSTELLATIONS[CONSTEL_STATE.name];
      if (c && alpha > 0) {
        drawConstellationOverlay(c, alpha, classic.yaw, classic.pitch);
      }

      if (T >= DUR) {
        CONSTEL_STATE.active = false;
        CONSTEL_STATE.name = null;
        CONSTEL_STATE.t = 0;
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