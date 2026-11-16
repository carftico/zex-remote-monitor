// ZEX Remote Monitor - Zex Interactive / Paras Sharma
const sb = supabase.createClient(ZEX_SUPABASE_URL, ZEX_SUPABASE_KEY);
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = t => t ? new Date(t).toLocaleString() : '-';
let sessions = [], poll = null, helloT = null, pc = null, ch = null, viewId = null, curGen = null, queue = [];

$('#loginForm').onsubmit = async e => {
  e.preventDefault(); $('#err').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#pass').value });
  if (error) $('#err').textContent = 'Sign in failed.';
};
$('#logout').onclick = () => sb.auth.signOut();
sb.auth.onAuthStateChange((_e, session) => setTimeout(() => gate(session), 0));
async function gate(session) {
  if (!session) { stopView(); clearInterval(poll); $('#app').hidden = true; $('#login').hidden = false; return; }
  const { data } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (!data) { await sb.auth.signOut(); $('#err').textContent = 'This account is not authorized.'; return; }
  $('#login').hidden = true; $('#app').hidden = false;
  load(); clearInterval(poll); poll = setInterval(load, 4000);
}
async function load() {
  const { data } = await sb.from('sessions').select('*').order('created_at', { ascending: false }).limit(50);
  if (data) { sessions = data; render(); }
}

function token() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
$('#newBtn').onclick = async () => {
  const t = token(), mins = +$('#dur').value;
  const { error } = await sb.from('sessions').insert({
    token: t, created_by: (await sb.auth.getUser()).data.user.id, label: $('#label').value.trim().slice(0, 40),
    expires_at: new Date(Date.now() + mins * 60000).toISOString()
  });
  if (error) return alert('Could not create invitation.');
  const url = location.origin + '/join.html?s=' + t;
  $('#qr').innerHTML = ''; new QRCode($('#qr'), { text: url, width: 200, height: 200 });
  $('#link').textContent = url; $('#qrBox').hidden = false; $('#label').value = ''; load();
};
$('#copy').onclick = () => navigator.clipboard.writeText($('#link').textContent);

function eff(s, now) {
  if (s.status === 'ended') return 'ended';
  if (new Date(s.expires_at) < now) return 'expired';
  if (s.status === 'live' && s.last_seen && now - new Date(s.last_seen) > 40000) return 'offline';
  return s.status;
}
function render() {
  const now = Date.now(); let tot = 0, act = 0, off = 0;
  const html = sessions.map(s => {
    const st = eff(s, now);
    if (s.consent_at) { tot++; st === 'live' ? act++ : off++; }
    const btns = (st === 'live' ? `<button class="sm" data-v="${esc(s.token)}">View</button>` : '') +
      (['live', 'waiting', 'offline'].includes(st) ? `<button class="ghost sm" data-k="${esc(s.token)}">${st === 'waiting' ? 'Revoke' : 'Disconnect'}</button>` : '');
    return `<div class="s"><div><b>${esc(s.participant_name || s.label || 'Unclaimed invitation')}</b>
      <small>Started ${fmt(s.started_at)} · Ended ${fmt(s.ended_at)}${s.ended_by ? ' (' + esc(s.ended_by) + ')' : ''}</small>
      <small>Expires ${fmt(s.expires_at)}</small></div>
      <div class="row" style="flex:0"><span class="pill ${st}">${st === 'live' ? '<i></i>' : ''}${st}</span>${btns}</div></div>`;
  }).join('');
  $('#list').innerHTML = html || '<p>No sessions yet.</p>';
  $('#sTot').textContent = tot; $('#sAct').textContent = act; $('#sOff').textContent = off;
}
$('#list').onclick = e => {
  const v = e.target.dataset.v, k = e.target.dataset.k;
  if (v) viewSession(v); if (k) endSession(k);
};
async function endSession(t) {
  await sb.from('sessions').update({ status: 'ended', ended_at: new Date().toISOString(), ended_by: 'admin' }).eq('token', t);
  if (viewId === t && ch) { await ch.send({ type: 'broadcast', event: 'end', payload: {} }); stopView(); }
  else {
    const c = sb.channel('zex-' + t);
    c.subscribe(async st => { if (st === 'SUBSCRIBED') { await c.send({ type: 'broadcast', event: 'end', payload: {} }); sb.removeChannel(c); } });
  }
  load();
}
$('#kick').onclick = () => viewId && endSession(viewId);
$('#stopView').onclick = stopView;

function stopView() {
  clearInterval(helloT); ch && sb.removeChannel(ch); ch = null; pc && pc.close(); pc = null; curGen = null; viewId = null; queue = [];
  $('#vid').srcObject = null; $('#panel').hidden = true;
}
function viewSession(t) {
  stopView(); viewId = t; $('#panel').hidden = false; $('#cstate').textContent = 'waiting for stream';
  const s = sessions.find(x => x.token === t); $('#pinfo').textContent = '· ' + (s && s.participant_name || 'Participant');
  ch = sb.channel('zex-' + t);
  ch.on('broadcast', { event: 'offer' }, ({ payload }) => answer(payload))
    .on('broadcast', { event: 'cand' }, ({ payload }) => {
      if (payload.gen !== curGen) return;
      pc && pc.remoteDescription ? pc.addIceCandidate(payload.c).catch(() => {}) : queue.push(payload.c);
    })
    .on('broadcast', { event: 'end' }, () => stopView())
    .subscribe(st => {
      if (st !== 'SUBSCRIBED') return;
      const hello = () => !pc && ch && ch.send({ type: 'broadcast', event: 'hello', payload: {} });
      hello(); helloT = setInterval(hello, 3000);
    });
}
async function answer(p) {
  pc && pc.close(); curGen = p.gen; queue = [];
  const mine = pc = new RTCPeerConnection({ iceServers: ZEX_ICE });
  mine.ontrack = e => { $('#vid').srcObject = e.streams[0]; };
  mine.onconnectionstatechange = () => { $('#cstate').textContent = mine.connectionState; };
  mine.onicecandidate = e => e.candidate && ch && ch.send({ type: 'broadcast', event: 'cand', payload: { gen: p.gen, c: e.candidate.toJSON() } });
  await mine.setRemoteDescription({ type: 'offer', sdp: p.sdp });
  queue.splice(0).forEach(c => mine.addIceCandidate(c).catch(() => {}));
  const a = await mine.createAnswer(); await mine.setLocalDescription(a);
  ch.send({ type: 'broadcast', event: 'answer', payload: { gen: p.gen, sdp: a.sdp } });
}
