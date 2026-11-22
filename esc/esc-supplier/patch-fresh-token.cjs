// Twenty >= 2.5x guards SSO login with EnterprisePlanService.isValidWithFreshToken()
// (EnterpriseFeaturesEnabledGuard), which reads the cached validity payload directly, so
// esc/deploy/patch-enterprise.cjs (isValid & co) no longer opens it on its own. Upstream
// v2.57.1/v2.60.3 without this redirect /auth/oidc/login to
// /verify?errorMessage=Enterprise+features+are+not+enabled (measured on twenty-rc 2026-11-22).
// Same business authorisation as patch-enterprise.cjs (scripts/PATCH_MANIFEST.md).
// Fails the build if the anchor is missing, so a moved method never ships unpatched.
const fs = require('fs');
const f = '/app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js';
const s = fs.readFileSync(f, 'utf8');
const re = /(\n\s*)async isValidWithFreshToken\(\)\s*\{/;
if (!re.test(s)) { console.error('PATTERN MISS: ' + re); process.exit(1); }
fs.writeFileSync(f, s.replace(re, '$1async isValidWithFreshToken() { return true;'));
console.log('PATCHED isValidWithFreshToken');
