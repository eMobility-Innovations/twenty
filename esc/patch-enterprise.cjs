// esc/patch-enterprise.cjs
//
// Removes Twenty's enterprise-licence gate so SSO works on a self-hosted
// instance without a paid Enterprise key. AGPLv3-permitted self-host
// modification — business-authorised (Patryk + Amir, 2026-06-04).
//
// Strategy = "option B" (thin overlay on the official image): patch the
// COMPILED service in the published image rather than rebuilding the monorepo.
// See esc/PATCH_MANIFEST.md for the full rationale and per-method notes.
//
// Idempotent-ish: it asserts exactly 4 methods were patched and EXITS NON-ZERO
// otherwise, so an upstream change to enterprise-plan.service.js fails the
// image build loudly instead of silently shipping the gate. That assertion is
// the upgrade tripwire — when it fires, re-derive the regexes against the new
// upstream and bump esc/PATCH_MANIFEST.md.

const fs = require('fs');

const f =
  '/app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js';

let s = fs.readFileSync(f, 'utf8');

const FAR = 'new Date(Date.now() + 315360000000)'; // ~10 years out
const LIC = "'ESC Self-Hosted'";

const patches = [
  [/(\n\s*)isValid\(\)\s*\{/, '$1isValid() { return true;'],
  [/(\n\s*)hasValidEnterpriseValidityToken\(\)\s*\{/, '$1hasValidEnterpriseValidityToken() { return true;'],
  [/(\n\s*)async getLicenseInfo\(\)\s*\{/, "$1async getLicenseInfo() { return { isValid: true, licensee: " + LIC + ", expiresAt: " + FAR + ", subscriptionId: 'self-hosted-esc' };"],
  [/(\n\s*)async getSubscriptionStatus\(\)\s*\{/, "$1async getSubscriptionStatus() { return { status: 'active', licensee: " + LIC + ", expiresAt: " + FAR + ", cancelAt: null, currentPeriodEnd: " + FAR + ", isCancellationScheduled: false };"],
];

let applied = 0;
for (const [re, rep] of patches) {
  if (re.test(s)) {
    s = s.replace(re, rep);
    applied++;
  } else {
    console.error('MISS: ' + re);
  }
}

if (applied !== 4) {
  console.error('Expected 4 patches, applied ' + applied + ' — upstream enterprise-plan.service.js changed. See esc/PATCH_MANIFEST.md.');
  process.exit(1);
}

fs.writeFileSync(f, s);
console.log('PATCHED ' + applied + ' enterprise methods');
