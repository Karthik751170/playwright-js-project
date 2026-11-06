/**
 * Expected results for the hourly headless survey monitor (tests/monitor/HourlySurveyMonitor.spec.js).
 *
 * Every check here runs each hour; any failed check triggers an alert. Survey content is
 * AI-generated and different every run, so expectations are ranges and presence checks, never
 * exact question text or counts.
 *
 * PLACEHOLDER DEFAULTS — replace with the user's expected results.
 */
module.exports = {
    // Login with the Mailosaur monitor account must succeed.
    login: { required: true },

    // The research brief must offer "create the survey" within this time.
    brief: {
        maxMinutes: 20,
        maxWizardSteps: 15,
        requireTargetAudience: true,        // brief has a parseable "Target Audience" section
        failOnAudienceInconsistency: false, // e.g. gender split not summing to 100% → warning only
    },

    // After clicking "create the survey".
    survey: {
        maxMinutesAfterCreate: 8,
        requireCreated: true,               // survey card / editor appears (reload allowed)
        failIfOnlyVisibleAfterReload: false, // the known "needs reload" bug → warning only
        requireDeployButton: true,
        minQuestions: 5,
        maxQuestions: 60,
    },

    // Whole run.
    run: { maxMinutes: 30 },
};
