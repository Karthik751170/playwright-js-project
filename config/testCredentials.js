/**
 * testCredentials.js
 * Single, environment-backed source for every test credential.
 *
 * These values were previously hardcoded across ~14 files, which committed live
 * passwords to git history. Anything that was hardcoded should be treated as
 * compromised and rotated.
 *
 * Set them in your shell or a .env file (.env is git-ignored):
 *   MAILOSAUR_UI_EMAIL, MAILOSAUR_UI_PASSWORD, MAILOSAUR_SERVER_ID
 *   GOOGLE_TEST_EMAIL, GOOGLE_TEST_PASSWORD
 *   HERCULES_ADMIN_USER, HERCULES_ADMIN_PASSWORD
 *   HERCULES_SIGNUP_PASSWORD  (password used for newly provisioned accounts)
 */

/** Reads a required variable, failing loudly and actionably when it is absent. */
function required(name, purpose) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[testCredentials] Missing required environment variable ${name} (${purpose}).\n` +
      `Set it in your shell or a .env file before running this test.`
    );
  }
  return value;
}

/** Non-throwing presence check so specs can skip cleanly rather than erroring. */
function has(...names) {
  return names.every((n) => Boolean(process.env[n]));
}

module.exports = {
  required,
  has,

  mailosaur: {
    get email() { return required('MAILOSAUR_UI_EMAIL', 'Mailosaur dashboard login'); },
    get password() { return required('MAILOSAUR_UI_PASSWORD', 'Mailosaur dashboard login'); },
    get serverId() { return required('MAILOSAUR_SERVER_ID', 'Mailosaur server/domain id'); },
    isConfigured: () => has('MAILOSAUR_UI_EMAIL', 'MAILOSAUR_UI_PASSWORD', 'MAILOSAUR_SERVER_ID'),
  },

  google: {
    get email() { return required('GOOGLE_TEST_EMAIL', 'Google SSO test account'); },
    get password() { return required('GOOGLE_TEST_PASSWORD', 'Google SSO test account'); },
    isConfigured: () => has('GOOGLE_TEST_EMAIL', 'GOOGLE_TEST_PASSWORD'),
  },

  herculesAdmin: {
    get user() { return required('HERCULES_ADMIN_USER', 'Hercules admin login'); },
    get password() { return required('HERCULES_ADMIN_PASSWORD', 'Hercules admin login'); },
    isConfigured: () => has('HERCULES_ADMIN_USER', 'HERCULES_ADMIN_PASSWORD'),
  },

  /**
   * Password assigned to freshly provisioned throwaway accounts. Falls back to a
   * generated value so provisioning still works without configuration -- this is
   * a new random account each run, not a shared standing credential.
   */
  get signupPassword() {
    return process.env.HERCULES_SIGNUP_PASSWORD || `Tp${Math.random().toString(36).slice(2, 10)}!A9`;
  },

  /**
   * Password for a pre-existing, standing Hercules test account -- used by specs
   * that log back in to an account created by an earlier run. Deliberately has
   * no fallback: a generated password cannot authenticate an existing account,
   * so it must fail loudly rather than produce a confusing login failure.
   */
  get existingAccountPassword() {
    return required('HERCULES_TEST_ACCOUNT_PASSWORD', 'login for a pre-existing Hercules test account');
  },
};
