// Executes the four enterprise-validity methods INSIDE an image and reports what
// they actually return. Piped into `node` in the container by
// esc/deploy/verify-esc-enterprise-behaviour.sh.
//
// WHY BEHAVIOUR AND NOT A GREP. The fork has two routes to the same semantics:
// option B patches the COMPILED file (esc/deploy/patch-enterprise.cjs, regex-injecting
// `return true;` onto the signature line) and option A builds from the source overlay,
// where `nest build` pretty-prints. The two therefore produce DIFFERENT COMPILED TEXT
// FOR IDENTICAL SEMANTICS, so no grep can verify both:
//
//   - scripts/verify-esc-image.sh greps for `isValid() { return true;` and FAILS on a
//     correct source image.
//   - esc/deploy/build-source-image.sh greps the whole file for `return true`, a string
//     upstream already ships twice, so it CANNOT FAIL — it would pass on an image with
//     no enterprise patch at all.
//
// That check has now been wrong in both directions. This runs the code instead.
//
// The service is built with Object.create so no Nest container is needed; only the
// collaborators these four methods touch are stubbed, and every stub is inert —
// nothing connects to a database, and ENTERPRISE_API_URL is deliberately unroutable.
'use strict';

const SERVICE_PATH =
  '/app/packages/twenty-server/dist/engine/core-modules/enterprise/services/enterprise-plan.service.js';

const CONFIG = {
  ENTERPRISE_KEY: 'self-hosted-esc', // exactly what production sets, and not a signed JWT
  ENTERPRISE_API_URL: 'http://enterprise-api.invalid',
};

// Nothing should hang. If a method reaches the network despite the unroutable host,
// say so rather than sitting there.
const HARD_TIMEOUT_MS = 30000;
const timer = setTimeout(() => {
  console.log(JSON.stringify({ error: 'probe timed out', timeoutMs: HARD_TIMEOUT_MS }));
  process.exit(3);
}, HARD_TIMEOUT_MS);

const describe = (value) => {
  if (value instanceof Error) return `threw: ${value.message}`;

  return value;
};

const call = (fn) => {
  try {
    return describe(fn());
  } catch (error) {
    return describe(error);
  }
};

const callAsync = async (fn) => {
  try {
    return describe(await fn());
  } catch (error) {
    return describe(error);
  }
};

const main = async () => {
  let ServiceClass;

  try {
    ({ EnterprisePlanService: ServiceClass } = require(SERVICE_PATH));
  } catch (error) {
    console.log(
      JSON.stringify({ error: `could not load the service: ${error.message}` }),
    );
    process.exit(3);
  }

  const service = Object.create(ServiceClass.prototype);

  service.twentyConfigService = { get: (key) => CONFIG[key] };
  service.logger = { log() {}, warn() {}, error() {}, debug() {} };
  service.cachedValidityPayload = null;
  service.cachedKeyPayload = null;

  const report = {
    isValid: call(() => service.isValid()),
    hasValidEnterpriseValidityToken: call(() =>
      service.hasValidEnterpriseValidityToken(),
    ),
    getLicenseInfo: await callAsync(() => service.getLicenseInfo()),
    getSubscriptionStatus: await callAsync(() => service.getSubscriptionStatus()),
  };

  // The question every caller of this probe is really asking. `reportsEnterpriseValid`
  // is what the frontend banner and the SSO guard come down to, and it is the ONLY
  // field the two routes must agree on — the raw values differ harmlessly (dates).
  const licence = report.getLicenseInfo;
  const subscription = report.getSubscriptionStatus;

  report.reportsEnterpriseValid = {
    isValid: report.isValid === true,
    hasValidEnterpriseValidityToken: report.hasValidEnterpriseValidityToken === true,
    licenceIsValid: !!licence && licence.isValid === true,
    subscriptionActive: !!subscription && subscription.status === 'active',
  };

  clearTimeout(timer);
  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  clearTimeout(timer);
  console.log(JSON.stringify({ error: `probe failed: ${error.message}` }));
  process.exit(3);
});
