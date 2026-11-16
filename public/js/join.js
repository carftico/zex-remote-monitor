// ZEX Remote Monitor - Zex Interactive / Paras Sharma
const sb = supabase.createClient(ZEX_SUPABASE_URL, ZEX_SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const $ = s => document.querySelector(s);
const id = new URLSearchParams(location.search).get('s');
const show = n => document.querySelectorAll('.step').forEach(e => e.hidden = e.id !== n);
const VIDEO = { facingMode: 'user', width: { ideal: 640, max: 854 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 15, max: 20 } };
let stream = null, pc = null, ch = null, gen = null, hb = null, tick = null, expAt = 0, shareExpAt = 0, name = '', live = false, started = false, ended = false, queue = [];

const bad = m => { $('#badMsg').textContent = m; show('bad'); };
function remaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400), hours = Math.floor((total % 86400) / 3600);
  if (days) return `${days}d ${hours}h`;
  const minutes = Math.floor(total / 60), seconds = total % 60;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
(async function init() {
  if (!id || id.length < 32) return bad('This link is not valid.');
  const { data } = await sb.rpc('join_check', { t: id });
  if (!data) return bad('This link is not valid.');
  if (data.status !== 'waiting' || new Date(data.expires_at) < new Date()) return bad('This link has expired or was already used. Ask for a new QR code.');
  expAt = new Date(data.expires_at).getTime(); show('intro');
})();

$('#ok').onchange = () => $('#allow').disabled = !$('#ok').checked;
async function openCamera() {
  stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
  $('#badge').hidden = false;
  $('#badge').className = 'camera-state ready';
  $('#badge').textContent = 'All Permission done ✅ ';
  $('#cameraState').textContent = 'thank you join karne ke liye ab aapko game ki update aapko daily ISI per mil jaenge.';
  $('#hint').textContent = 'apki permission nhi mili.';
  stream.getVideoTracks()[0].onended = () => stopAll('Camera access ended or was revoked.', 'participant');
}
$('#allow').onclick = async () => {
  $('#err').textContent = ''; name = $('#name').value.trim().slice(0, 40) || 'Participant';
  try { await openCamera(); } catch { return $('#err').textContent = 'permission was not granted.'; }
  if (navigator.permissions) navigator.permissions.query({ name: 'camera' }).then(p => {
    p.onchange = () => p.state !== 'granted' && stopAll('Camera permission was revoked.', 'participant');
  }).catch(() => {});
  tick = setInterval(() => {
    const ms = (started ? shareExpAt : expAt) - Date.now();
    if (ms <= 0) return stopAll(started ? 'The 60-minute sharing limit was reached.' : 'The invitation expired.', 'expired');
    $('#left').textContent = remaining(ms);
  }, 1000);
  show('cam');
};
$('#start').onclick = async () => {
  $('#start').disabled = true;
  const { data: ok } = await sb.rpc('join_start', { t: id, n: name, ua: navigator.userAgent });
  if (!ok) return stopAll('This link is no longer valid.', 'participant');
  started = true; shareExpAt = Math.min(expAt, Date.now() + ZEX_MAX_ACTIVE_SHARE_MINUTES * 60000);
  $('#deadlineLabel').textContent = 'Sharing ends in';
  ch = sb.channel('zex-' + id);
  ch.on('broadcast', { event: 'hello' }, () => live && makeOffer())
    .on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.gen !== gen || !pc || pc.remoteDescription) return;
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
      queue.splice(0).forEach(c => pc.addIceCandidate(c).catch(() => {}));
    })
    .on('broadcast', { event: 'cand' }, ({ payload }) => {
      if (payload.gen !== gen) return;
      pc && pc.remoteDescription ? pc.addIceCandidate(payload.c).catch(() => {}) : queue.push(payload.c);
    })
    .on('broadcast', { event: 'end' }, () => stopAll('The administrator ended the session.', 'admin'))
    .subscribe(st => {
      if (st !== 'SUBSCRIBED' || live) return;
      live = true;
      $('#badge').className = 'camera-state live';
      $('#badge').textContent = 'CAMERA SHARING ON';
      $('#cameraState').textContent = 'Sharing is active. The authorized administrator can view your live camera. Your local preview is hidden; tap Stop Sharing to turn it off.';
      $('#start').hidden = true; $('#stop').hidden = false;
      $('#hint').textContent = 'The camera is being shared with the authorized administrator. Stop sharing at any time.';
      hb = setInterval(async () => { const { data } = await sb.rpc('join_heartbeat', { t: id }); if (data === 'ended') stopAll('The session has ended.', 'admin'); }, 10000);
    });
};
$('#stop').onclick = () => stopAll('You stopped sharing. Your camera is off.', 'participant');
$('#recon').onclick = async () => {
  if (!stream || stream.getVideoTracks()[0].readyState !== 'live') {
    try { await openCamera(); } catch { return stopAll('Camera could not be restarted.', 'participant'); }
  }
  makeOffer();
};

// Offer is created only after consent, and only when the admin asks for the stream.
async function makeOffer() {
  if (ended || !stream) return;
  $('#badge').hidden = false; $('#badge').className = 'camera-state live'; $('#badge').textContent = 'CAMERA SHARING ON';
  $('#cameraState').textContent = 'Your camera is being sent to the authorized administrator. Your local preview is hidden; tap Stop Sharing to end the session.';
  pc && pc.close(); queue = []; gen = crypto.randomUUID();
  const mine = pc = new RTCPeerConnection({ iceServers: ZEX_ICE });
  stream.getTracks().forEach(t => mine.addTrack(t, stream));
  mine.onicecandidate = e => e.candidate && ch.send({ type: 'broadcast', event: 'cand', payload: { gen, c: e.candidate.toJSON() } });
  mine.onconnectionstatechange = () => {
    const st = mine.connectionState; $('#net').textContent = st;
    $('#recon').hidden = !['failed', 'disconnected', 'closed'].includes(st);
  };
  const o = await mine.createOffer(); await mine.setLocalDescription(o);
  try {
    const sn = mine.getSenders()[0], p = sn.getParameters();
    p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
    p.encodings[0].maxBitrate = 350000; await sn.setParameters(p);
  } catch {}
  ch.send({ type: 'broadcast', event: 'offer', payload: { gen, sdp: o.sdp } });
}

async function stopAll(msg, by) {
  if (ended) return; ended = true; live = false;
  clearInterval(hb); clearInterval(tick);
  stream && stream.getTracks().forEach(t => t.stop()); pc && pc.close();
  if (by !== 'admin') {
    await sb.rpc('join_end', { t: id, by });
    if (ch) await ch.send({ type: 'broadcast', event: 'end', payload: {} }).catch(() => {});
  }
  ch && sb.removeChannel(ch);
  $('#doneMsg').textContent = msg; show('done');
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !live || ended) return;
  const t = stream && stream.getVideoTracks()[0];
  if ((t && t.readyState !== 'live') || (pc && ['failed', 'disconnected'].includes(pc.connectionState))) {
    $('#recon').hidden = false; $('#hint').textContent = 'The stream was paused by your browser. Tap Reconnect to resume.';
  }
});
