// Bumping this forces every user back through the wizard on their next visit,
// which is how a released change to the script reaches people who already
// finished the old one.
export const ESC_ONBOARDING_SCRIPT_VERSION = 1;

// A user who has never authenticated through Keycloak (password login, dev
// seeds) has no identity-provider subject. Provisioning must still not fail,
// so their row is keyed on a namespaced synthetic subject that can never
// collide with a real one.
export const ESC_ONBOARDING_LOCAL_SUB_PREFIX = 'local:';
