const canvas = document.getElementById('sky');
const ctx = canvas.getContext('2d');
function resize() {
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

function loop() {
ctx.clearRect(0, 0, canvas.width, canvas.height);

x += vx;
y += vy;
if (x > canvas.width || x < 0) vx = -vx;
if (y > canvas.height || y < 0) vy = -vy;

drawDot(x, y, r);
requestAnimationFrame(loop);
}

