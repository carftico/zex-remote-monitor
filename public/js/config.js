// ZEX Remote Monitor - Zex Interactive / Paras Sharma
const ZEX_SUPABASE_URL = "https://qzjzbzustqsoqujrntqw.supabase.co";
const ZEX_SUPABASE_KEY = "sb_publishable_DP8YL5fCogf8MQyTI-poLA_IWGWPmN_";
const ZEX_ICE = [
  { urls: "stun:stun.l.google.com:19302" }
  // add a TURN server here for strict mobile networks
];
// Keep these in sync with the Supabase migration; sharing has a fixed 60-minute cap.
const ZEX_MAX_INVITE_DAYS = 30;
const ZEX_MAX_ACTIVE_SHARE_MINUTES = 60;
