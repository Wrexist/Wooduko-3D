// CI only: revoke the throwaway Apple Development certificates that earlier CI runs left behind.
// Each runner is a fresh Mac, so Xcode's cloud signing creates a new development certificate
// every build; Apple caps how many an account may hold, and at the cap the archive fails with
// "Your account has reached the maximum number of certificates".
// Only development certificates created through the API ("Created via API") are revoked; a
// person's own certificates and every distribution certificate are left alone.
// Env: ASC_KEY_ID, ASC_ISSUER_ID, API_KEY_PATH (the .p8). Never fails the build: on any API
// error it warns and exits 0, and the archive reports the real problem.
import { createPrivateKey, createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { ASC_KEY_ID, ASC_ISSUER_ID, API_KEY_PATH } = process.env;
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !API_KEY_PATH) {
  console.log('::warning::asc-prune-certs: missing ASC_KEY_ID, ASC_ISSUER_ID or API_KEY_PATH');
  process.exit(0);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' });
const body = b64({ iss: ASC_ISSUER_ID, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
const sig = createSign('SHA256')
  .update(`${head}.${body}`)
  .sign({ key: createPrivateKey(readFileSync(API_KEY_PATH)), dsaEncoding: 'ieee-p1363' })
  .toString('base64url');
const auth = { Authorization: `Bearer ${head}.${body}.${sig}` };
const api = (path, init = {}) =>
  fetch(`https://api.appstoreconnect.apple.com${path}`, { ...init, headers: auth });

const res = await api('/v1/certificates?limit=200');
if (!res.ok) {
  console.log(`::warning::asc-prune-certs: could not list certificates (HTTP ${res.status})`);
  process.exit(0);
}
const { data } = await res.json();
const DEV = new Set(['DEVELOPMENT', 'IOS_DEVELOPMENT']);
const label = (c) =>
  `${c.attributes.certificateType} "${c.attributes.name}" (${c.attributes.displayName ?? ''})`;
for (const c of data) console.log(`found ${label(c)}`);
const throwaway = data.filter(
  (c) =>
    DEV.has(c.attributes.certificateType) &&
    /created via api/i.test(`${c.attributes.name} ${c.attributes.displayName ?? ''}`),
);
let revoked = 0;
for (const c of throwaway) {
  const r = await api(`/v1/certificates/${c.id}`, { method: 'DELETE' });
  if (r.ok) revoked++;
  console.log(`${r.ok ? 'revoked' : `could not revoke (HTTP ${r.status})`} ${label(c)}`);
}
console.log(
  `asc-prune-certs: revoked ${revoked} CI development certificate(s); ${data.length - revoked} left`,
);
