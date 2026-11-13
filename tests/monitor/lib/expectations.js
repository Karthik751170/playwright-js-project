/**
 * Feature area + expected result for every monitor check, matched on the check name.
 * The ACTUAL result comes from what the check observed (its detail). A call can still pass its
 * own { expected, actual } to override these.
 *
 * Order of FEATURES is the order of sections in the report.
 */
const FEATURES = [
    'Sign-up', 'Login', 'AI prompt & research brief', 'Survey creation', 'Edit Audience', 'Audience page',
    'Chat edits', 'Survey & logic versions', 'Logic', 'Survey preview', 'Quick Question',
    'Rename', 'Duplicate', 'Delete', 'Share links', 'Wallet', 'Cleanup & run health',
];

// [pattern, feature, expected]. First match wins, so specific patterns come first.
const RULES = [
    // Sign-up / Login
    [/^sign-up form/i, 'Sign-up', 'A new email shows the "Create your account" form with a password box (not submitted: the monitor never creates accounts)'],
    [/^sign-up/i, 'Sign-up', 'Sign-up page works for a new email'],
    [/^login page/i, 'Login', 'The tagged /login page opens on the email form'],
    [/wrong password/i, 'Login', 'A wrong password is rejected with an error and the user stays logged out'],
    [/^login/i, 'Login', 'The existing monitor account logs in and the dashboard prompt box appears'],

    // Prompt, brief
    [/prompt entered/i, 'AI prompt & research brief', 'The prompt box holds the full prompt text'],
    [/AI quota|daily limit/i, 'AI prompt & research brief', 'The account still has AI quota; if not, Hercules tells the user clearly'],
    [/chat opens|chat opened/i, 'AI prompt & research brief', 'Sending the prompt opens a new chat'],
    [/brief (leads to|offers)/i, 'AI prompt & research brief', 'After the clarifying questions, the research brief offers "create the survey" within the time limit'],
    [/wizard step count/i, 'AI prompt & research brief', 'The clarifying-question wizard finishes within the step limit'],
    [/Target Audience consistency/i, 'AI prompt & research brief', 'The brief\'s Target Audience is internally consistent (no overlapping age bands, matching counts)'],
    [/Target Audience/i, 'AI prompt & research brief', 'The research brief includes a Target Audience section with a sample size'],
    [/^research brief/i, 'AI prompt & research brief', 'The research brief is generated'],

    // Survey creation
    [/survey created|^survey created/i, 'Survey creation', 'Clicking "create the survey" creates the survey (In-drafts card) within the time limit'],
    [/without reload/i, 'Survey creation', 'The new survey appears without reloading the page'],
    [/Deploy button/i, 'Survey creation', 'The survey card shows a Deploy button'],
    [/question count in range/i, 'Survey creation', 'The survey has a sensible number of questions'],

    // Edit audience / audience page
    [/Edit Audience: Confirm/i, 'Edit Audience', 'Confirm becomes enabled after changing the audience'],
    [/updated brief after Edit Audience/i, 'Edit Audience', 'Confirming Edit Audience produces an updated brief'],
    [/updated brief shows new user count/i, 'Edit Audience', 'The updated brief shows the new respondent count'],
    [/updated brief includes added city/i, 'Edit Audience', 'The updated brief includes the city that was added'],
    [/updated brief drops removed city/i, 'Edit Audience', 'The updated brief no longer lists the city that was removed'],
    [/edit audience/i, 'Edit Audience', 'Edit Audience on the brief works end to end'],
    [/audience after create: age groups consistent/i, 'Audience page', 'After the survey is created, View Audience has non-overlapping age groups, all 18+ (a shared boundary like 24-35 / 35-45 is fine)'],
    [/audience after create/i, 'Audience page', 'After the survey is created, View Audience matches the brief'],
    [/View Audience opens/i, 'Audience page', 'View Audience opens the audience page'],
    [/audience count matches/i, 'Audience page', 'The audience page count matches the brief / Edit Audience'],
    [/audience page shows the new locations/i, 'Audience page', 'After a chat location change, the audience page shows the new locations'],
    [/audience page shows added city/i, 'Audience page', 'The audience page lists the added city'],
    [/^audience page/i, 'Audience page', 'The audience page opens and is readable'],

    // Chat edits
    [/reply received/i, 'Chat edits', 'Hercules replies to the chat message'],
    [/pan-India/i, 'Chat edits', 'Asking for pan-India is confirmed in Hercules\' reply'],
    [/new locations confirmed|change locations/i, 'Chat edits', 'Asking to change locations is confirmed in the reply'],
    [/audience count updated by chat|change sample size/i, 'Chat edits', 'Asking to change the sample size updates the audience count'],
    [/question added/i, 'Chat edits', 'Asking to add a question adds exactly one question'],

    // Versions
    [/Survey Version increments|survey version after/i, 'Survey & logic versions', 'The Survey Version number goes up after an edit'],
    [/Logic Version|logic version/i, 'Survey & logic versions', 'The Logic Version number goes up when logic rules change'],

    // Logic
    [/explains its logic types|which logic types/i, 'Logic', 'Hercules explains which logic types it supports'],
    [/read-only question leaves survey unchanged/i, 'Logic', 'A question about logic does not change the survey'],
    [/circular logic/i, 'Logic', 'Circular logic is refused and not applied'],
    [/logic: declined with a reason/i, 'Logic', 'If a logic type can\'t be added, Hercules explains why'],
    [/: questions unchanged/i, 'Logic', 'Adding logic does not change the questions'],
    [/logic added|add .* logic/i, 'Logic', 'The requested logic rule is added to the survey'],

    // Preview
    [/^preview/i, 'Survey preview', 'The survey preview behaves like the respondent app (answers tappable, required questions enforced, terminate rules followed)'],

    // Quick Question (rename/duplicate/delete of QQ fall through to the generic sections below)
    [/flagged by Hercules|stays on step 1|reason shown to the user|: accepted$/i, 'Quick Question', 'Wording checks: problem questions are flagged with a reason and stay on step 1; neutral ones are accepted'],
    [/step 1 (loads|shows)/i, 'Quick Question', 'Quick Question step 1 loads with question types'],
    [/Continue disabled/i, 'Quick Question', 'Continue stays disabled until the question/options are valid'],
    [/capped at/i, 'Quick Question', 'Text is capped at the documented maximum length'],
    [/options|maximum 7/i, 'Quick Question', 'Multiple choice: starts with 2 options, max 7, min 2, duplicates blocked'],
    [/rating/i, 'Quick Question', 'Rating questions explain the scale and reach step 2'],
    [/script tag/i, 'Quick Question', 'A <script> tag in the question is shown as text and never runs'],
    [/yes\/no|YES \/ NO|neutral yes/i, 'Quick Question', 'A yes/no question is accepted and shown on step 2'],
    [/step 2|reaches step 2/i, 'Quick Question', 'Step 2 shows the question, type, audience sizes and targeting options'],
    [/audience .* launch button|custom size|launch button present/i, 'Quick Question', 'Audience size changes the launch button label; custom sizes are validated; launch is never pressed'],
    [/Back returns to step 1/i, 'Quick Question', 'Back returns to step 1 with the question kept'],
    [/use chat instead/i, 'Quick Question', '"Use chat instead" moves the question into the AI chat'],
    [/draft (listed|on the Quick|on Quick)|card opens the quick question/i, 'Quick Question', 'The draft quick question is listed on the Quick Question tab and opens with its text'],

    // Rename / duplicate / delete (survey campaigns and quick questions)
    [/^rename|rename via/i, 'Rename', 'The new name shows on the card / chat title right away'],
    [/duplicate|Duplicate Question/i, 'Duplicate', 'Duplicate creates exactly one copy'],
    [/delete|Delete Question/i, 'Delete', 'Delete removes the item from the list (one fewer card)'],

    // Share
    [/Share Survey link differs/i, 'Share links', 'Share Survey and Share Campaign Chat give different links'],
    [/: link shown/i, 'Share links', 'The share option shows a link'],
    [/: access is/i, 'Share links', 'The share dialog states who can access the link'],
    [/opens logged-out/i, 'Share links', 'The shared link opens for a logged-out visitor (no 404, no login wall)'],
    [/shows the right content/i, 'Share links', 'The shared link shows the right content'],

    // Wallet
    [/wallet unchanged/i, 'Wallet', 'Draft work (no deploy) does not change the wallet balance'],
    [/wallet|deploy \+ wallet/i, 'Wallet', 'The wallet balance can be read (deploy is never pressed on prod)'],

    // Cleanup / health
    [/cleanup/i, 'Cleanup & run health', 'Everything the monitor created is deleted at the end'],
    [/within budget|unexpected error|group produced no result/i, 'Cleanup & run health', 'The run finishes within its time budget without script errors'],
];

function describeCheck(name) {
    for (const [re, feature, expected] of RULES) if (re.test(name)) return { feature, expected };
    return { feature: 'Other', expected: '' };
}

module.exports = { FEATURES, describeCheck };
