// SSRF allowlist patch (option B — applied on the compiled official image).
//
// WHY THIS EXISTS
// Twenty's workflow HTTP_REQUEST action refuses any host that resolves to a private
// address: "Request to internal IP address 192.168.103.175 is not allowed." That is a
// deliberate anti-SSRF control, it fails closed, and it re-checks AFTER DNS, so no
// hostname gets around it. Upstream exposes no allowlist.
//
// We need exactly one internal endpoint reachable from a workflow: the twenty-ingest
// service on CT 175, which rebuilds ONE customer's interest profile (C4, Redmine
// #14830). The alternative was publishing that endpoint on the internet, which is a
// larger exposure than naming one host here.
//
// WHAT IT CHANGES
// One short-circuit at the top of `isPrivateIp`, the single predicate BOTH call sites
// use (the hostname check and the post-DNS socket check). An address listed in
// ESC_SSRF_ALLOWED_HOSTS is treated as public; everything else is unchanged.
//
// FAILS CLOSED BY DEFAULT: with the variable unset or empty the guard behaves exactly
// as upstream ships it. The allowlist is exact-match on the address, never a range or
// a prefix — a CIDR here would quietly re-open the whole estate.
const fs = require('fs');
const f = '/app/packages/twenty-server/dist/engine/core-modules/secure-http-client/utils/is-private-ip.util.js';
let s = fs.readFileSync(f, 'utf8');

const ANCHOR = /const isPrivateIp = \(addr\)=>\{/;
const SHORT_CIRCUIT = `const isPrivateIp = (addr)=>{
    // ESC: exact-match allowlist, see esc/deploy/patch-ssrf-allowlist.cjs
    if ((process.env.ESC_SSRF_ALLOWED_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean).includes(addr)) {
        return false;
    }`;

if (!ANCHOR.test(s)) {
  console.error('PATTERN MISS: ' + ANCHOR + ' — upstream changed the shape of isPrivateIp; fix this patch, do not skip it');
  process.exit(1);
}
if (s.includes('ESC_SSRF_ALLOWED_HOSTS')) {
  console.log('SSRF allowlist already present — nothing to do');
  process.exit(0);
}
s = s.replace(ANCHOR, SHORT_CIRCUIT);
fs.writeFileSync(f, s);
console.log('PATCHED isPrivateIp with the ESC_SSRF_ALLOWED_HOSTS allowlist');
