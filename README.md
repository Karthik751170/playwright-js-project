# 🚀 Hercules & Super J — Autonomous AI E2E Testing Framework

An enterprise-grade, AI-driven end-to-end automation test suite built with **[Playwright](https://playwright.dev/)** and powered by **Groq LLMs (Llama 3.3)**.

Designed to autonomously test the complete survey lifecycle across both **Hercules B2B (Creator Platform)** and **Super J (Consumer Respondent App)**.

---

## 🌟 Key Architecture & Highlights

- 🤖 **Autonomous AI Answer Engine (`AnswerEngine.js`)**:
  - Dynamically evaluates real-time question schemas directly from the DOM.
  - Queries Groq AI (`llama-3.3-70b-versatile`) to generate contextually relevant, human-like answers.
  - Handles complex question components: **Single-Select, Multi-Select, Ranking Cards, Matrix/Sliders, and Open-Ended Text**.
- 🔀 **Conditional Survey Logic & Branching Validation**:
  - Validates all 5 Hercules logic rule actions: **Skip, Redirect, Filter Selections, Ask Why, and Early Termination**.
  - **Dual-Mode AI Execution**:
    - `Mode: TRIGGER`: Intentionally selects condition triggers to assert branch jumps and disqualification/termination handling.
    - `Mode: QUALIFY`: Onboards fresh users, answers constructively to avoid disqualification, and completes 100% of the survey slides.
- 📩 **Zero-Intervention Authentication (`MailosaurUtility.js`)**:
  - Programmatically provisions disposable email inboxes on Mailosaur (`@kzdzyaot.mailosaur.net`).
  - Extracts email verification links, parses JWT tokens, and handles authentication without manual interaction.
- 📊 **Multi-Reporter Observability**:
  - Built-in **Monocart Reporter**, standard **Playwright HTML Report**, and **Allure** integration with automatic trace and screenshot captures on failures.
- ⚡ **CI/CD Cloud Automation (GitHub Actions)**:
  - Automated headless execution on push/PR with configurable workflow dispatch for individual test suites.

---

## 📁 Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── playwright.yml              # GitHub Actions CI/CD Pipeline
├── base/
│   └── BasePage.js                     # Base Playwright page wrapper
├── pages/
│   ├── LandingPage.js                  # Super J Consumer landing page
│   ├── LoginPage.js                    # Super J OTP login page
│   ├── SurveyPage.js                   # Super J active survey presentation
│   ├── RewardPage.js                   # Super J wallet & reward claim
│   └── hercules/
│       ├── HerculesHomePage.js         # Hercules B2B landing & sign-in
│       ├── HerculesLoginPage.js        # Hercules B2B auth & token handler
│       ├── HerculesSignupPage.js       # Hercules registration flow
│       ├── HerculesSurveyGenerator.js  # AI questionnaire & prompt generation
│       ├── HerculesLogicsWizardPage.js # 4-step logic wizard builder & parser
│       ├── HerculesEditAudience.js     # Audience & demographic controls
│       └── HerculesPaymentModal.js     # Stripe / plan deployment modals
├── tests/
│   ├── DeploySurvey_Free100Users.spec.js # Full E2E Free 100 Deployment & Submission
│   ├── ValidateHerculesLogics.spec.js    # Logic Rules Branching & Answering Validation
│   ├── ValidateAllHerculesLogics.spec.js # Multi-rule permutation test suite
│   ├── DeploySurvey_EditAudience_Validation.spec.js # Custom audience targeting test
│   ├── DeploySurvey_NoEdit.spec.js       # Baseline deployment without audience edits
│   ├── SurveyTest.spec.js                # Core Consumer Survey answering test
│   ├── SuperJ_Answer6Surveys.spec.js     # Batch answering across 6 active surveys
│   ├── SuperJ_EditProfileValidation.spec.js # Consumer profile field verification
│   ├── SuperJ_CopyDIDValidation.spec.js  # Decentralized Identity (DID) clipboard test
│   ├── HerculesCreateAccount.spec.js     # Fresh B2B account registration test
│   ├── HerculesLoggedInFeaturesTest.spec.js # Saved audiences & campaign context menus
│   ├── SurveyStarUnstarDelete.spec.js    # Dashboard survey lifecycle management
│   ├── DuplicateAndSaveDraft.spec.js     # Draft survey duplication test
│   ├── UpgradeToStarterPlan.spec.js      # Plan upgrade & Stripe modal test
│   └── CrawlHerculesB2B.spec.js          # Autonomous B2B portal route crawler
└── utils/
    ├── AnswerEngine.js                 # LLM-powered dynamic question solver
    ├── ActiveQuestionFinder.js         # Resilient active slide locator
    ├── LiveAIAssistant.js              # Groq LLM API orchestrator
    ├── MailosaurUtility.js             # Disposable email & OTP handler
    └── AIPromptGenerator.js            # Dynamic survey prompt provider
```

---

## ⚙️ Environment Setup

Create a `.env` file in the project root:

```env
# Primary LLM API Key (Required for AI answering & survey generation)
GROQ_API_KEY=your_groq_api_key_here

# Optional / Fallback notifications
GEMINI_API_KEY=your_gemini_api_key_here
GMAIL_USER=your_email@domain.com
GMAIL_PASS=your_app_password
```

---

## 🛠️ Installation & Quickstart

```bash
# 1. Clone the repository
git clone https://github.com/Karthik751170/playwright-js-project.git
cd playwright-js-project

# 2. Install dependencies
npm install

# 3. Install Playwright browser binaries & system dependencies
npx playwright install --with-deps chromium
```

---

## 🧪 Running Test Suites

### 1. Free 100 Users Deployment & Completion Test (Flagship)
```bash
# Headed mode (browser UI visible)
npx playwright test tests/DeploySurvey_Free100Users.spec.js --headed --reporter=list

# Headless mode
npx playwright test tests/DeploySurvey_Free100Users.spec.js --reporter=list
```

### 2. Survey Conditional Logic & Branching Validation
```bash
# Runs dual-pass validation (Pass A: Trigger early exit, Pass B: Qualify 100%)
npx playwright test tests/ValidateHerculesLogics.spec.js --headed --reporter=list
```

### 3. Consumer App Live Survey Answering
```bash
npx playwright test tests/SurveyTest.spec.js --headed --reporter=list
```

### 4. Audience Targeting & Demographics Test
```bash
npx playwright test tests/DeploySurvey_EditAudience_Validation.spec.js --headed --reporter=list
```

---

## 📊 Viewing Test Reports & Traces

```bash
# Open interactive Playwright HTML report
npx playwright show-report

# Open Monocart dashboard report
open test-results/report.html

# View test trace for debugging (step-by-step DOM snapshots)
npx playwright show-trace test-results/<test-run-folder>/trace.zip
```

---

## 🔄 CI/CD Automation (GitHub Actions)

The workflow file [`.github/workflows/playwright.yml`](.github/workflows/playwright.yml) runs in the cloud automatically.

### Configuring Secrets on GitHub:
Navigate to **Repository Settings ➡️ Secrets and variables ➡️ Actions** and add:
- `GROQ_API_KEY` (or `GROQ_API_KEY_2`)
- `GMAIL_USER` *(optional)*
- `GMAIL_PASS` *(optional)*

### Running via Manual Dispatch:
1. Go to the **Actions** tab on GitHub.
2. Select **Playwright E2E Tests**.
3. Click **Run workflow** and choose your desired test suite from the dropdown:
   - `deploy-free-100-users` *(Default)*
   - `validate-logics`
   - `survey-test`
   - `all`
