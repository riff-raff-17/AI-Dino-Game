// Dino Runner — No image assets, pure Canvas
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const hiEl = document.getElementById("hi");
  const help = document.getElementById("help");
  const startBtn = document.getElementById("startBtn");
  const restartBtn = document.getElementById("restartBtn");
  const nightToggle = document.getElementById("nightToggle");

  // Hi-score via localStorage
  const HI_KEY = "dino_hi";
  let hiScore = Number(localStorage.getItem(HI_KEY) || 0);
  updateScoreText(0);
  updateHiText(hiScore);

  // Handle HiDPI crispness
  function fitForDPR() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = Math.round(cssWidth * (200/800)); // keep 800x200 aspect
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  }
  window.addEventListener("resize", fitForDPR);
  fitForDPR();

  // Game state
  const GROUND_Y = 150;         // baseline in CSS px
  const GRAVITY = 0.7;
  const JUMP_VY = -12;
  const DUCK_HEIGHT = 26;
  const DINO = {
    x: 40,
    y: GROUND_Y - 40,
    w: 40,
    h: 40,
    vy: 0,
    isDead: false,
    isDucking: false,
    legPhase: 0
  };
  let obstacles = [];
  let particles = [];
  let clouds = [];
  let gameSpeed = 6;            // increases with time
  let t = 0;                    // ticks
  let score = 0;
  let running = false;
  let lastSpawn = 0;
  let spawnGap = 80;            // min ticks between spawns
  let night = false;

  // Input
  let keys = new Set();
  window.addEventListener("keydown", (e) => {
    if (["Space","ArrowUp","ArrowDown"].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if ((e.code === "Space" || e.code === "ArrowUp") && !running) startGame();
    if ((e.code === "Space" || e.code === "ArrowUp") && running && onGround()) jump();
    DINO.isDucking = keys.has("ArrowDown") && onGround();
  });
  window.addEventListener("keyup", (e) => {
    keys.delete(e.code);
    DINO.isDucking = keys.has("ArrowDown") && onGround();
  });

  // Touch: tap to jump, hold to duck
  let touchHold = false, touchStartTime = 0;
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!running) startGame();
    touchHold = true;
    touchStartTime = performance.now();
    if (onGround()) jump();
  }, {passive:false});
  canvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    touchHold = false;
  }, {passive:false});

  startBtn.addEventListener("click", startGame);
  restartBtn.addEventListener("click", resetAndStart);
  nightToggle.addEventListener("change", () => {
    night = nightToggle.checked;
    document.body.classList.toggle("night", night);
  });

  // Helpers
  function onGround() { return DINO.y + DINO.h >= GROUND_Y; }
  function jump() {
    DINO.vy = JUMP_VY;
    // spawn a small dust puff
    for (let i=0;i<6;i++){
      particles.push({
        x: DINO.x + DINO.w*0.7,
        y: GROUND_Y,
        vx: (Math.random()*2+1),
        vy: -(Math.random()*2+1),
        life: 18
      });
    }
  }

  function updateScoreText(n){
    scoreEl.textContent = String(Math.floor(n)).padStart(5,"0");
  }
  function updateHiText(n){
    hiEl.textContent = "HI " + String(Math.floor(n)).padStart(5,"0");
  }

  // Entities
  function spawnObstacle() {
    // Randomly make either a cactus (ground) or a bird (air)
    const isBird = Math.random() < 0.25 && gameSpeed > 7;
    if (isBird){
      const yLevels = [GROUND_Y-70, GROUND_Y-50, GROUND_Y-30];
      obstacles.push({
        type:"bird",
        x: canvas.width, y: yLevels[Math.floor(Math.random()*yLevels.length)],
        w: 34, h: 20, passed:false, flap:0
      });
    }else{
      // cluster of 1-3 cacti of varying widths/heights (rectangles)
      const cluster = Math.ceil(Math.random()*3);
      const cacti = [];
      let offset = 0;
      for (let i=0;i<cluster;i++){
        const w = [12,16,20][Math.floor(Math.random()*3)];
        const h = [28,36,46][Math.floor(Math.random()*3)];
        cacti.push({ w, h, xOffset: offset });
        offset += w + 6;
      }
      const totalW = offset - 6;
      obstacles.push({
        type:"cactus",
        x: canvas.width, y: GROUND_Y,
        w: totalW, h: Math.max(...cacti.map(c=>c.h)),
        cluster: cacti,
        passed:false
      });
    }
  }

  function spawnCloud(){
    clouds.push({
      x: canvas.width + Math.random()*100,
      y: 20 + Math.random()*60,
      w: 40 + Math.random()*40,
      h: 14 + Math.random()*6,
      speed: 0.5 + Math.random()*0.8,
      alpha: 0.5 + Math.random()*0.3
    });
  }

  // Drawing (pure vector rectangles/lines)
  function clear() {
    // bg is handled by CSS; here we just clear the canvas area
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function drawGround() {
    ctx.save();
    ctx.strokeStyle = getColorMuted();
    ctx.lineWidth = 2;
    // baseline
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y+1);
    ctx.lineTo(canvas.width, GROUND_Y+1);
    ctx.stroke();
    // dashed segments to imply motion
    ctx.beginPath();
    const dashLen = 22, gap = 18;
    const offset = (t * gameSpeed) % (dashLen + gap);
    for (let x = -offset; x < canvas.width; x += dashLen + gap) {
      ctx.moveTo(x, GROUND_Y + 12);
      ctx.lineTo(x + dashLen, GROUND_Y + 12);
    }
    ctx.stroke();
    ctx.restore();
  }

  function getColorMain(){ return getComputedStyle(document.body).getPropertyValue("--fg").trim(); }
  function getColorMuted(){ return getComputedStyle(document.body).getPropertyValue("--muted").trim(); }
  function getColorDanger(){ return getComputedStyle(document.body).getPropertyValue("--danger").trim(); }

  function drawDino() {
    ctx.save();
    ctx.translate(DINO.x, DINO.y);
    const color = DINO.isDead ? getColorDanger() : getColorMain();

    // Body (rectangle)
    const bodyH = DINO.isDucking && onGround() ? DUCK_HEIGHT : DINO.h;
    const bodyY = (DINO.isDucking && onGround()) ? (DINO.h - DUCK_HEIGHT) : 0;
    ctx.fillStyle = color;
    ctx.fillRect(0, bodyY, DINO.w, bodyH);

    // Eye (small hole)
    ctx.clearRect(DINO.w - 10, bodyY + 8, 4, 4);

    // Legs: simple alternating nubs when on ground and running
    if (onGround() && !DINO.isDead) {
      DINO.legPhase += gameSpeed * 0.25;
      const up = Math.floor(DINO.legPhase) % 2 === 0;
      ctx.fillRect(6, DINO.h, 8, up ? 10 : 4);
      ctx.fillRect(DINO.w - 14, DINO.h, 8, up ? 4 : 10);
    } else {
      // airborne legs
      ctx.fillRect(6, DINO.h, 8, 6);
      ctx.fillRect(DINO.w - 14, DINO.h, 8, 6);
    }

    ctx.restore();
  }

  function drawCactus(o){
    ctx.save();
    ctx.translate(o.x, 0);
    ctx.fillStyle = getColorMain();
    // draw each rectangle in cluster aligned to ground
    let x = 0;
    for (const c of o.cluster){
      ctx.fillRect(x, o.y - c.h, c.w, c.h);
      // tiny "arms"
      ctx.fillRect(x + 2, o.y - c.h - 8, Math.max(2, c.w - 6), 8);
      x += c.w + 6;
    }
    ctx.restore();
  }

  function drawBird(o){
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.fillStyle = getColorMain();
    // Body
    ctx.fillRect(0, -10, 24, 10);
    // Beak
    ctx.fillRect(24, -6, 6, 4);
    // Wings flapping
    o.flap += 0.3 + gameSpeed*0.02;
    const wingUp = Math.floor(o.flap) % 2 === 0;
    if (wingUp) {
      ctx.fillRect(6, -18, 6, 8);
      ctx.fillRect(12, -22, 6, 12);
    } else {
      ctx.fillRect(6, -8, 6, 8);
      ctx.fillRect(12, -4, 6, 12);
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    ctx.fillStyle = getColorMuted();
    for (const p of particles){
      ctx.fillRect(p.x, p.y, 3, 3);
    }
    ctx.restore();
  }

  function drawClouds() {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = getColorMuted();
    for (const c of clouds){
      // simple rounded-ish cloud using rectangles
      ctx.globalAlpha = c.alpha;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillRect(c.x + c.w*0.2, c.y - c.h*0.6, c.w*0.4, c.h);
      ctx.fillRect(c.x + c.w*0.55, c.y - c.h*0.3, c.w*0.35, c.h);
    }
    ctx.restore();
  }

  // Collision
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh){
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // Loop
  let rafId = 0;
  function loop(){
    t++;
    clear();

    // Difficulty curve
    gameSpeed = Math.min(14, 6 + Math.floor(score/120)); // speeds up over time
    spawnGap = Math.max(50, 80 - Math.floor(score/150)); // shorter gaps over time

    // Clouds parallax
    if (Math.random() < 0.02 && clouds.length < 6) spawnCloud();
    for (const c of clouds){
      c.x -= c.speed;
    }
    clouds = clouds.filter(c => c.x + c.w > -10);
    drawClouds();

    // Ground
    drawGround();

    // Dino physics
    DINO.vy += GRAVITY;
    DINO.y += DINO.vy;
    if (onGround()){
      DINO.y = GROUND_Y - DINO.h;
      DINO.vy = 0;
      // Ducking reduces hitbox height for collisions & drawing
      if (DINO.isDucking) {
        // nothing else needed; drawing accounts for duck height
      }
    }
    drawDino();

    // Spawn obstacles
    if (t - lastSpawn > spawnGap) {
      spawnObstacle();
      lastSpawn = t;
    }

    // Update obstacles
    for (const o of obstacles){
      o.x -= gameSpeed;
      if (!o.passed && o.x + o.w < DINO.x){
        o.passed = true;
        score += 1;
        updateScoreText(score);
        if (score > hiScore){
          hiScore = score;
          updateHiText(hiScore);
          localStorage.setItem(HI_KEY, hiScore);
        }
      }
    }

    // Particles
    for (const p of particles){
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.3;
      p.life--;
    }
    particles = particles.filter(p => p.life > 0);
    drawParticles();

    // Draw obstacles & check collisions
    ctx.save();
    for (const o of obstacles){
      if (o.type === "cactus") drawCactus(o);
      else drawBird(o);

      // Effective Dino hitbox (smaller than drawn rect for fairness)
      const hb = {
        x: DINO.x + 6,
        y: DINO.y + (DINO.isDucking ? (DINO.h - DUCK_HEIGHT) + 2 : 4),
        w: DINO.w - 12,
        h: (DINO.isDucking ? DUCK_HEIGHT : DINO.h) - 8
      };

      // Obstacle hitbox
      let ob = {};
      if (o.type === "cactus") {
        ob = { x:o.x, y:o.y - o.h, w:o.w, h:o.h };
      } else {
        ob = { x:o.x, y:o.y - 16, w:34, h:20 };
      }

      if (rectsOverlap(hb.x,hb.y,hb.w,hb.h, ob.x,ob.y,ob.w,ob.h) && !DINO.isDead){
        DINO.isDead = true;
        gameOver();
      }
    }
    ctx.restore();

    // Cleanup obstacles
    obstacles = obstacles.filter(o => o.x + o.w > -20);

    if (running) rafId = requestAnimationFrame(loop);
  }

  // UI + State transitions
  function startGame(){
    if (running) return;
    help.classList.add("hidden");
    restartBtn.classList.add("hidden");
    DINO.isDead = false;
    running = true;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function gameOver(){
    running = false;
    // draw message overlay
    ctx.save();
    ctx.fillStyle = getColorDanger();
    ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    ctx.textAlign = "center";
    const cx = canvas.width/2;
    ctx.fillText("GAME OVER", cx, 70);
    ctx.restore();
    restartBtn.classList.remove("hidden");
  }

  function resetAndStart(){
    // reset state
    obstacles = [];
    particles = [];
    clouds = [];
    score = 0;
    t = 0;
    gameSpeed = 6;
    lastSpawn = 0;
    updateScoreText(0);
    DINO.x = 40;
    DINO.y = GROUND_Y - DINO.h;
    DINO.vy = 0;
    DINO.isDead = false;
    DINO.isDucking = false;
    startGame();
  }

  // Idle attract mode: show a tiny bounce if not started
  (function idle(){
    let dir = -1;
    function tick(){
      if (!running){
        clear();
        drawGround();
        // subtle float
        DINO.y += dir*0.3;
        if (DINO.y < GROUND_Y - DINO.h - 3) dir = 1;
        if (DINO.y > GROUND_Y - DINO.h) dir = -1;
        drawDino();
        drawClouds();
        requestAnimationFrame(tick);
      }
    }
    // seed a couple clouds
    spawnCloud(); spawnCloud();
    tick();
  })();

  // Duck via touch hold
  setInterval(() => {
    if (!running) return;
    DINO.isDucking = (keys.has("ArrowDown") || touchHold) && onGround();
  }, 16);

})();
