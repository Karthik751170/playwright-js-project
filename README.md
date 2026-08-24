# 🚀 Hercules & Super J - Autonomous E2E Testing Framework

An enterprise-grade, AI-driven end-to-end automation test suite built with [Playwright](https://playwright.dev/) and powered by Groq & Gemini LLMs.

---

## 🌟 Key Features

- 🤖 **Autonomous AI Answering (`AnswerEngine.js`)**: Evaluates real-time survey DOM structures and uses LLMs to contextually select options across Single-Select, Multi-Select, Ranking, Matrix, Sliders, and Open-ended questions.
- 🔀 **Survey Logic & Branching Validation**: Validates full condition sets (Skip, Redirect, Filter Selections, Ask Why, and Early Termination) across dual-mode consumer execution passes.
- 📩 **Dynamic Mailosaur OTP & Email Auth**: Zero hardcoded credentials. Dynamically creates inboxes, extracts verification links/JWTs, and authenticates into Hercules B2B.
- 📊 **Multi-Reporter Dashboard**: Monocart Reporter + HTML + Allure for rich visual traces and failure analysis.
- ⚡ **CI/CD Integrated**: Complete GitHub Actions workflow supporting manual dispatch test suites and scheduled executions.

---

## 📁 Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── playwright.yml              # CI/CD pipeline for Playwright
├── base/
│   └── BasePage.js                     # Core Playwright wrapper
├── pages/
│   ├── LandingPage.js                  # Super J Consumer landing page
│   ├── LoginPage.js                    # Super J OTP login page
│   ├── SurveyPage.js                   # Survey presentation page
│   └── hercules/
│       ├── HerculesHomePage.js         # Hercules B2B landing
│       ├── HerculesLoginPage.js        # Hercules B2B login
│       ├── HerculesSignupPage.js       # Hercules registration
│       ├── HerculesSurveyGenerator.js  # AI questionnaire & prompt builder
│       ├── HerculesLogicsWizardPage.js # 4-step logic builder & extractor
│       ├── HerculesEditAudience.js     # Audience & demographic controls
│       └── HerculesPaymentModal.js     # Stripe / deployment modals
├── tests/
│   ├── DeploySurvey_Free100Users.spec.js # Full E2E Free 100 Deployment Flow
│   ├── ValidateHerculesLogics.spec.js    # Logic Rules Answering & Branching
│   ├── SurveyTest.spec.js                # Core Consumer Survey Run
│   └── CrawlHerculesB2B.spec.js          # Autonomous B2B Portal Crawler
└── utils/
    ├── AnswerEngine.js                 # LLM-powered dynamic question solver
    ├── ActiveQuestionFinder.js         # Resilient active slide locator
    ├── LiveAIAssistant.js              # Groq / Gemini API orchestrator
    └── MailosaurUtility.js             # Disposable email & OTP handler
```

---

## ⚙️ Prerequisites & Environment Setup

1. **Node.js**: Version 18 or higher.
2. **Environment Variables**: Create a `.env` file in the project root:

```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
GMAIL_USER=your_email@domain.com
GMAIL_PASS=your_app_password
```

---

## 🛠️ Installation

```bash
# Clone the repository
git clone https://github.com/Karthik751170/playwright-js-project.git
cd playwright-js-project

# Install node dependencies
npm install

# Install Playwright browser binaries
npx playwright install --with-deps chromium
```

---

## 🧪 Running Tests

### 1. Free 100 Users Deployment Test
```bash
# Headed mode (with browser GUI)
npx playwright test tests/DeploySurvey_Free100Users.spec.js --headed --reporter=list

# Headless mode
npx playwright test tests/DeploySurvey_Free100Users.spec.js --reporter=list
```

### 2. Validate Conditional Survey Logics
```bash
npx playwright test tests/ValidateHerculesLogics.spec.js --headed --reporter=list
```

### 3. Core Consumer Survey Answering
```bash
npm run test:survey
```

---

## 📊 Viewing Test Reports

```bash
# Open standard Playwright HTML report
npx playwright show-report

# Monocart HTML report
open test-results/report.html
```

---

## 🔄 CI/CD (GitHub Actions)

When pushing to GitHub or creating Pull Requests:
1. Ensure the following **Repository Secrets** are configured under **Settings > Secrets and variables > Actions**:
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   - `GMAIL_USER`
   - `GMAIL_PASS`
2. Run workflows on-demand using the **Run workflow** button under the **Actions** tab with custom suite parameters (`deploy-free-100-users`, `validate-logics`, or `all`).
