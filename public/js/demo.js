(() => {
  const KEY = 'zex-safe-demo-state-v1';
  const role = new URLSearchParams(location.search).get('role');
  const chooser = document.querySelector('#chooser');
  const participant = document.querySelector('#participant');
  const admin = document.querySelector('#admin');
  const intro = document.querySelector('#participantIntro');
  const thanks = document.querySelector('#participantThanks');
  const feed = document.querySelector('#feed');
  const stateText = document.querySelector('#adminState');
  const canvas = document.querySelector('#simulatedFeed');
  const ctx = canvas.getContext('2d');
  let active = false;
  let frame = 0;
  let animationId = 0;

  function readState() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
  }

  function writeState(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
    render();
  }

  function render() {
    const state = readState();
    active = Boolean(state.active);
    if (role === 'participant') {
      intro.hidden = active;
      thanks.hidden = !active;
    }
    if (role === 'admin') {
      feed.hidden = !active;
      stateText.textContent = active
        ? 'Demo complete. Showing a generated test pattern—not a person or camera stream.'
        : 'Waiting for the participant demo to be completed.';
      if (active && !animationId) draw();
      if (!active && animationId) {
        cancelAnimationFrame(animationId);
        animationId = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  function draw() {
    const width = canvas.width = Math.max(320, canvas.clientWidth * devicePixelRatio);
    const height = canvas.height = Math.max(240, canvas.clientHeight * devicePixelRatio);
    const t = performance.now() / 1000;
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#101827');
    gradient.addColorStop(0.52, '#26364d');
    gradient.addColorStop(1, '#111018');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const bars = ['#ef4444', '#f59e0b', '#fde047', '#22c55e', '#38bdf8', '#6366f1', '#d946ef'];
    const barW = width / bars.length;
    bars.forEach((color, index) => {
      ctx.globalAlpha = 0.62;
      ctx.fillStyle = color;
      ctx.fillRect(index * barW, height * 0.18, barW + 1, height * 0.12);
    });
    ctx.globalAlpha = 1;

    const radius = Math.min(width, height) * 0.12;
    const x = width * (0.5 + Math.sin(t * 0.8) * 0.18);
    const y = height * (0.59 + Math.cos(t * 0.65) * 0.08);
    const glow = ctx.createRadialGradient(x, y, 2, x, y, radius * 2.2);
    glow.addColorStop(0, 'rgba(147,197,253,.9)');
    glow.addColorStop(1, 'rgba(59,130,246,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(15, width * 0.045)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('GENERATED TEST PATTERN', width / 2, height * 0.48);
    ctx.font = `${Math.max(11, width * 0.025)}px system-ui, sans-serif`;
    ctx.fillStyle = '#d1d5db';
    ctx.fillText(`SIMULATION ONLY  ·  ${new Date().toLocaleTimeString()}`, width / 2, height * 0.9);
    frame += 1;
    animationId = requestAnimationFrame(draw);
  }

  document.querySelector('#completeDemo')?.addEventListener('click', () => {
    writeState({ active: true, completedAt: new Date().toISOString() });
  });

  document.querySelector('#resetDemo')?.addEventListener('click', () => {
    writeState({ active: false });
  });

  window.addEventListener('storage', event => {
    if (event.key === KEY) render();
  });

  if (role === 'participant') {
    chooser.hidden = true;
    participant.hidden = false;
  } else if (role === 'admin') {
    chooser.hidden = true;
    admin.hidden = false;
  }
  render();
})();
