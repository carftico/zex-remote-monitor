# ZEX Remote Monitor
Zex Interactive / Paras Sharma. Consent-based remote camera streaming for education and authorized testing.

## Stack
- Hosting: Vercel (static, HTTPS). Settings come from vercel.json (output folder: public).
- Backend: Supabase (Auth for admin, Postgres for sessions, Realtime Broadcast for WebRTC signaling).
- Video: WebRTC peer to peer, video only, 640x480 @ 15 fps, 350 kbps cap. Nothing is recorded or stored.

## Pages
- Admin: https://YOUR-DOMAIN/ (email + password login)
- Participant: https://YOUR-DOMAIN/join.html?s=TOKEN (made by "Generate QR code" in the admin page)

## Security
- Admin must exist in `admins` table. Sessions table is readable and writable only by admins (RLS).
- Participants have no table access. They use 4 token-checked functions: join_check, join_start, join_heartbeat, join_end.
- Token is 192-bit random, expires (10/30/60 min), single use, ended sessions cannot be reopened.
- The participant creates a stream only after consent and Start Sharing, and only when the admin asks for it.
- Permissions-Policy header blocks microphone.

## Deploy
1. Push this folder to GitHub (drag and drop in the GitHub web UI is fine).
2. Vercel > Add New > Project > import the repo. No build command. Deploy.
3. Supabase config is already in public/js/config.js (publishable key only).
4. Use a TURN server in ZEX_ICE for strict mobile networks.
