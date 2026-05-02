// send-push — Web Push delivery for new conversation messages and
// notifications. Implements VAPID JWT (ES256/P-256) and AES-128-GCM
// payload encryption per RFC 8291, in pure Deno without webpush libs.
//
// Required env vars:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  (generate via web-push generate-vapid-keys)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Required tables (NOT included in extract/messaging/schema):
//   push_subscriptions(id, member_id, endpoint, p256dh, auth)
//   notifications(id, recipient_id, is_read, ...) — for unread count
//
// Swap-outs:
//   - 'mailto:noreply@haloleadership.org' below (VAPID sub claim)
//   - The unreadCountFor() helper joins both `notifications` and
//     conversation tables; if your host doesn't have a notifications
//     table, simplify or remove the notif half.
//   - Banner body strings ('You have a new update', 'New message')

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function base64urlToUint8Array(b64: string): Uint8Array {
  const padding = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function uint8ToBase64url(arr: Uint8Array): string {
  let s = '';
  arr.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.length; }
  return out;
}

async function importVapidKey(privateKeyB64: string): Promise<CryptoKey> {
  const raw = base64urlToUint8Array(privateKeyB64);
  const pkcs8 = new Uint8Array([
    0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02,
    0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d,
    0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02,
    0x01, 0x01, 0x04, 0x20,
    ...raw,
    0xa1, 0x44, 0x03, 0x42, 0x00, 0x04,
    ...base64urlToUint8Array(VAPID_PUBLIC_KEY).slice(1),
  ]);
  return crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function createVapidAuthHeader(endpoint: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = uint8ToBase64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = uint8ToBase64url(new TextEncoder().encode(JSON.stringify({
    aud, exp, sub: 'mailto:noreply@example.com',
  })));
  const unsigned = `${header}.${payload}`;
  const key = await importVapidKey(VAPID_PRIVATE_KEY);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  const sigBytes = new Uint8Array(sig);
  let r: Uint8Array, s: Uint8Array;
  if (sigBytes.length === 64) {
    r = sigBytes.slice(0, 32);
    s = sigBytes.slice(32);
  } else {
    const rLen = sigBytes[3];
    const rStart = 4 + (rLen - 32);
    r = sigBytes.slice(rStart, rStart + 32);
    const sOffset = 4 + rLen;
    const sLen = sigBytes[sOffset + 1];
    const sStart = sOffset + 2 + (sLen - 32);
    s = sigBytes.slice(sStart, sStart + 32);
  }
  const rawSig = new Uint8Array(64);
  rawSig.set(r);
  rawSig.set(s, 32);
  const token = `${unsigned}.${uint8ToBase64url(rawSig)}`;
  return `vapid t=${token}, k=${VAPID_PUBLIC_KEY}`;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

async function hkdfExpandOnce(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const t1 = await hmacSha256(prk, concat(info, new Uint8Array([0x01])));
  return t1.slice(0, len);
}

async function encryptPayload(plaintext: Uint8Array, p256dhB64: string, authB64: string): Promise<Uint8Array> {
  const subPubRaw = base64urlToUint8Array(p256dhB64);
  const authSecret = base64urlToUint8Array(authB64);

  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const localPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));
  const subPubKey = await crypto.subtle.importKey(
    'raw', subPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, true, [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: subPubKey }, localKeyPair.privateKey, 256),
  );

  const enc = new TextEncoder();
  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concat(enc.encode('WebPush: info\0'), subPubRaw, localPubRaw);
  const ikm = await hkdfExpandOnce(prkKey, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);

  const cek = await hkdfExpandOnce(prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdfExpandOnce(prk, enc.encode('Content-Encoding: nonce\0'), 12);

  const padded = concat(plaintext, new Uint8Array([0x02]));
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded),
  );

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = 65;
  header.set(localPubRaw, 21);
  return concat(header, ciphertext);
}

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: Record<string, unknown> | null,
): Promise<Response> {
  const auth = await createVapidAuthHeader(sub.endpoint);
  const headers: Record<string, string> = {
    'Authorization': auth,
    'TTL': '86400',
    'Urgency': 'high',
  };
  let body: BodyInit | undefined;
  if (payload) {
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await encryptPayload(plaintext, sub.p256dh, sub.auth);
    body = encrypted;
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Length'] = String(encrypted.length);
    headers['Content-Type'] = 'application/octet-stream';
  } else {
    headers['Content-Length'] = '0';
  }
  return await fetch(sub.endpoint, { method: 'POST', headers, body });
}

// Computes per-recipient unread count combining notifications + DM unread
// (cursor-based). Simplify for hosts that don't have a notifications
// table.
async function unreadCountFor(supabase: any, memberId: string): Promise<number> {
  const [notifRes, parts] = await Promise.all([
    supabase.from('notifications').select('id', { count: 'exact', head: true })
      .eq('recipient_id', memberId).eq('is_read', false),
    supabase.from('conversation_participants').select('conversation_id').eq('member_id', memberId),
  ]);
  const notifCount = notifRes?.count || 0;
  const convoIds = (parts?.data || []).map((p: any) => p.conversation_id);
  if (convoIds.length === 0) return notifCount;

  const [msgsRes, cursorsRes] = await Promise.all([
    supabase.from('conversation_messages').select('conversation_id, created_at, sender_id')
      .in('conversation_id', convoIds).neq('sender_id', memberId)
      .order('created_at', { ascending: false }).limit(500),
    supabase.from('conversation_read_cursors').select('conversation_id, last_read_at')
      .eq('member_id', memberId),
  ]);
  const cursorMap = new Map<string, string>();
  (cursorsRes?.data || []).forEach((c: any) => cursorMap.set(c.conversation_id, c.last_read_at));
  let dmCount = 0;
  (msgsRes?.data || []).forEach((m: any) => {
    const cur = cursorMap.get(m.conversation_id);
    if (!cur || new Date(m.created_at).getTime() > new Date(cur).getTime()) dmCount++;
  });
  return notifCount + dmCount;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, record } = body;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let recipientIds: string[] = [];
    let bannerBody = 'You have a new update';
    let url = '/dashboard';

    if (type === 'INSERT' && Array.isArray(record?.recipient_ids) && record.recipient_ids.length > 0) {
      recipientIds = record.recipient_ids;
      bannerBody = 'New message';
      url = '/dashboard/messaging';
    } else if (type === 'INSERT' && record?.recipient_id) {
      recipientIds = [record.recipient_id];
      bannerBody = record?.title || 'New notification';
    }

    if (recipientIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0, skipped: 'no_recipients' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let sent = 0, failed = 0;
    const stale: string[] = [];

    for (const memberId of recipientIds) {
      const count = await unreadCountFor(supabase, memberId);
      const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('member_id', memberId);
      const payload = { body: bannerBody, url, count, tag: 'app-notification' };
      for (const sub of (subs || [])) {
        try {
          const res = await sendPush(sub, payload);
          if (res.status === 201 || res.status === 200) sent++;
          else if (res.status === 404 || res.status === 410) { stale.push(sub.id); failed++; }
          else { console.error(`Push failed for ${sub.id}: ${res.status}`); failed++; }
        } catch (e) {
          console.error(`Push error for ${sub.id}:`, (e as Error).message);
          failed++;
        }
      }
    }

    if (stale.length > 0) {
      await supabase.from('push_subscriptions').delete().in('id', stale);
    }

    return new Response(
      JSON.stringify({ sent, failed, cleaned: stale.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-push error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
