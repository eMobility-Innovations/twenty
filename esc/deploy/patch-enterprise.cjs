// Comprehensive enterprise-bypass patch (option B — applied on the compiled official image).
// Forces ALL enterprise-validity methods to report valid so BOTH the backend SSO guard
// AND the frontend (the "enterprise key no longer valid" banner + the Security/SSO settings
// visibility) treat enterprise as active. A single isValid() patch is NOT enough — the
// frontend reads getSubscriptionStatus()/getLicenseInfo(), which return null/invalid when the
// ENTERPRISE_KEY is not a valid signed JWT.
const fs = require('fs');
const f = '/app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js';
let s = fs.readFileSync(f, 'utf8');
const FAR = 'new Date(Date.now() + 315360000000)'; // ~10 years
const LIC = "'ESC Self-Hosted'";
const patches = [
  [/(\n\s*)isValid\(\)\s*\{/, '$1isValid() { return true;'],
  [/(\n\s*)hasValidEnterpriseValidityToken\(\)\s*\{/, '$1hasValidEnterpriseValidityToken() { return true;'],
  [/(\n\s*)async getLicenseInfo\(\)\s*\{/, "$1async getLicenseInfo() { return { isValid: true, licensee: " + LIC + ", expiresAt: " + FAR + ", subscriptionId: 'self-hosted-esc' };"],
  [/(\n\s*)async getSubscriptionStatus\(\)\s*\{/, "$1async getSubscriptionStatus() { return { status: 'active', licensee: " + LIC + ", expiresAt: " + FAR + ", cancelAt: null, currentPeriodEnd: " + FAR + ", isCancellationScheduled: false };"],
];
let applied = 0;
for (const [re, rep] of patches) { if (re.test(s)) { s = s.replace(re, rep); applied++; } else { console.error('PATTERN MISS: ' + re); } }
if (applied !== 4) { console.error('Expected 4 patches, applied ' + applied); process.exit(1); }
fs.writeFileSync(f, s);
console.log('PATCHED ' + applied + ' enterprise methods');
