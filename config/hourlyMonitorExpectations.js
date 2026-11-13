/**
 * Expected results for the hourly headless Hercules monitor (tests/monitor/HourlySurveyMonitor.spec.js).
 *
 * Every check runs each hour; any FAIL posts a Google Chat alert. Survey content is AI-generated
 * and different every run, so expectations are ranges, presence checks and before/after deltas,
 * never exact question text. Set a scenario's `enabled: false` to skip it.
 *
 * PLACEHOLDER LIMITS until the user's own expected results are added.
 */
module.exports = {
    login: { required: true },

    brief: {
        maxMinutes: 20,
        maxWizardSteps: 15,
        requireTargetAudience: true,
        failOnAudienceInconsistency: false, // e.g. gender % not summing to 100 → WARN only
    },

    // Edit Audience on the research brief (pages/hercules/HerculesEditAudience.js), before creating.
    editAudienceOnBrief: { enabled: true, maxMinutesForUpdatedBrief: 15, addCity: 'Pune' },

    survey: {
        maxMinutesAfterCreate: 15,
        failIfOnlyVisibleAfterReload: false, // known "needs reload" bug → WARN
        requireDeployButton: true,
        minQuestions: 5,
        maxQuestions: 60,
    },

    // "View Audience" page must reflect the brief / edits.
    audience: {
        enabled: true,
        countMustMatchBrief: true,           // Audience Count == brief sample (or the edited size)
        // "Send it to anyone on SuperJ" = deploy pan-India toggle (by design), recorded only.
    },

    // Follow-up prompts to Hercules on the created survey. Each answers clarifications first.
    chat: {
        enabled: true,
        replyTimeoutMinutes: 10,
        addLogic: true,         // Logics panel rule count or logic version must go up
        panIndia: true,         // reply must confirm pan-India targeting
        changeLocations: true,  // reply must name the two new cities
        changeSampleSize: true, // Audience Count must become the requested size
        newSampleSize: 250,
        newCities: ['Pune', 'Jaipur'],
    },

    // H-icon campaign actions.
    campaign: {
        rename: true,
        duplicate: true,
        deleteDuplicate: true,
        deleteOriginalIfAllPassed: true, // keeps failing surveys for debugging, avoids ~24 drafts/day
    },

    // Logic group: how many logic types to request per run (each is one slow chat reply).
    logic: { maxTypes: 5 },

    // Deploy + wallet deduction. OFF until the user confirms (deploying spends credits / goes live).
    deploy: { enabled: false },

    // Budget per group (core / logic / manage run in parallel jobs).
    run: { maxMinutes: 58 },
};
