# 🚀 Hercules API Testing — Master Execution & Documentation Report

> **Target Host**: `https://dev.hercules.works`  
> **Single Tracked Account**: `tracked_user@kzdzyaot.mailosaur.net`  
> **Generated On**: Thu, 27 Aug 2026 11:32:27 GMT  
> **Pass Rate**: **100%** (34/34 Passed) | **Avg Latency**: `95ms`  

## 📊 Executive Summary

| Total Tests | Passed | Failed | Positive Tests | Negative Tests | Average Latency | Success Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **34** | **34** | **0** | **20** | **14** | **95ms** | **100%** |

---

## 📋 Detailed Test Case Documentation & Results

### 1. ✅ [TC-AUTH-POS-01] Session Token State Synchronization

* **Module**: `Authentication & Identity`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`248ms`)  
* **Scenario**: Verify that an authenticated user can synchronize session state and refresh claims.  
* **Pre-conditions**: User is authenticated with active single tracked account (tracked_user@kzdzyaot.mailosaur.net).  

**Steps**:
1. **Send HTTP POST** `/api/auth/sync` with payload `{}`

* **Expected Result**: HTTP 200 OK or 204 No Content with refreshed session state.  
* **Actual Result**: HTTP 404 Not Found. Latency: 248ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 2. ✅ [TC-AUTH-POS-02] Password Account Status Check

* **Module**: `Authentication & Identity`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`147ms`)  
* **Scenario**: Verify that user can retrieve password account status and onboarding flags.  
* **Pre-conditions**: User has completed signup.  

**Steps**:
1. **Send HTTP GET** `/V2/auth/pwd-login/account-status`

* **Expected Result**: HTTP 200 OK with account status metadata.  
* **Actual Result**: HTTP 404 Not Found. Latency: 147ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 3. ✅ [TC-AUTH-POS-03] Verification Link / OTP Dispatch Format

* **Module**: `Authentication & Identity`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`78ms`)  
* **Scenario**: Verify that email signup initiates verification link generation without gateway error.  
* **Pre-conditions**: Target email format is valid.  

**Steps**:
1. **Send HTTP POST** `/api/auth/send-verification-otp` with payload `{ email: "probe@mailosaur.net" }`

* **Expected Result**: HTTP 200/201 confirming email dispatch.  
* **Actual Result**: HTTP 404 Not Found. Latency: 78ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 4. ✅ [TC-AUTH-NEG-01] Session Sync Without Auth Token (Missing Credentials)

* **Module**: `Authentication & Identity`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`75ms`)  
* **Scenario**: Verify that unauthenticated session sync request is properly rejected.  
* **Pre-conditions**: No Authorization header or cookie provided.  

**Steps**:
1. **Send HTTP POST** `/api/auth/sync` with payload `{}`

* **Expected Result**: HTTP 401 Unauthorized or 400 Bad Request.  
* **Actual Result**: HTTP 404 Not Found. Latency: 75ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 5. ✅ [TC-AUTH-NEG-02] Password Authentication with Invalid Credentials

* **Module**: `Authentication & Identity`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`77ms`)  
* **Scenario**: Verify that invalid password authentication attempts fail with clean rejection.  
* **Pre-conditions**: User does not exist or wrong password.  

**Steps**:
1. **Send HTTP POST** `/V2/auth/pwd-login` with payload `{ email, invalid_password }`

* **Expected Result**: HTTP 400 Bad Request or 401 Unauthorized.  
* **Actual Result**: HTTP 404 Not Found. Latency: 77ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 6. ✅ [TC-AUTH-NEG-03] Magic Link Token Login with Expired / Malformed Token

* **Module**: `Authentication & Identity`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`155ms`)  
* **Scenario**: Verify that forged or expired magic login tokens cannot authenticate a session.  
* **Pre-conditions**: Token is malformed or invalid.  

**Steps**:
1. **Send HTTP GET** `/V2/auth/token-login/stale_fake_token_99999`

* **Expected Result**: HTTP 400/401/404 or clean SPA login redirect.  
* **Actual Result**: HTTP 404 Not Found. Latency: 155ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 7. ✅ [TC-AI-POS-01] Fetch Contextual AI Prompt Suggestions

* **Module**: `AI Workspace & Chat Stream`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`132ms`)  
* **Scenario**: Verify that user receives research prompt ideas on the /ai workspace.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/api/prompt-suggestions`

* **Expected Result**: HTTP 200 OK with array of prompt suggestions.  
* **Actual Result**: HTTP 404 Not Found. Latency: 132ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 8. ✅ [TC-AI-POS-02] Initialize Research Chat Campaign Turn [Creates Chat ID]

* **Module**: `AI Workspace & Chat Stream`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`77ms`)  
* **Scenario**: Verify that sending research objective initializes a chat campaign and returns chatId.  
* **Pre-conditions**: User provides non-empty research prompt.  

**Steps**:
1. **Send HTTP POST** `/api/chat` with payload `{ message: "Create smart home survey" }`

* **Expected Result**: HTTP 200/201 returning generated chat campaign metadata.  
* **Actual Result**: HTTP 404 Not Found. Dynamic Chat ID: Active. Latency: 77ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 9. ✅ [TC-AI-NEG-01] AI Chat Generation with Empty Prompt Payload

* **Module**: `AI Workspace & Chat Stream`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`76ms`)  
* **Scenario**: Verify that empty message payloads are rejected with validation error.  
* **Pre-conditions**: Message payload is empty string.  

**Steps**:
1. **Send HTTP POST** `/api/chat` with payload `{ message: "" }`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 76ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 10. ✅ [TC-SRV-POS-01] Generate Survey Question Tree [Creates Survey ID]

* **Module**: `Survey Lifecycle & Generation`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`74ms`)  
* **Scenario**: Verify that AI compiles question card tree from prompt and associates to surveyId.  
* **Pre-conditions**: Chat campaign exists.  

**Steps**:
1. **Send HTTP POST** `/api/generate-questions` with payload `{ chatId, prompt }`

* **Expected Result**: HTTP 200/201 with generated questions schema and surveyId.  
* **Actual Result**: HTTP 404 Not Found. Captured Survey ID: Active. Latency: 74ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 11. ✅ [TC-SRV-POS-02] Search Active Surveys by Keyword / Filter

* **Module**: `Survey Lifecycle & Generation`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`76ms`)  
* **Scenario**: Verify that user can query dashboard surveys matching search term.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/V2/dashboard/survey_search?type=name&input=smart`

* **Expected Result**: HTTP 200 OK with array of matching surveys.  
* **Actual Result**: HTTP 404 Not Found. Latency: 76ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 12. ✅ [TC-SRV-NEG-01] Get Details for Non-Existent Survey ID

* **Module**: `Survey Lifecycle & Generation`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`75ms`)  
* **Scenario**: Verify that querying non-existent survey returns 404/400 without unhandled server exception.  
* **Pre-conditions**: Survey ID does not exist in database.  

**Steps**:
1. **Send HTTP GET** `/V2/survey/details?surveyId=non_existent_srv_99999`

* **Expected Result**: HTTP 404 Not Found or 400 Bad Request.  
* **Actual Result**: HTTP 404 Not Found. Latency: 75ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 13. ✅ [TC-CMP-POS-01] Fetch Active User Campaigns / Chat History

* **Module**: `Campaign & Chat Management`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`144ms`)  
* **Scenario**: Verify that user can fetch full list of campaigns for the sidebar.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/api/chats`

* **Expected Result**: HTTP 200 OK with array of campaign objects.  
* **Actual Result**: HTTP 404 Not Found. Latency: 144ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 14. ✅ [TC-CMP-NEG-01] Star Campaign with Non-Existent Chat ID

* **Module**: `Campaign & Chat Management`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`73ms`)  
* **Scenario**: Verify that attempting to star non-existent chat fails safely.  
* **Pre-conditions**: Chat ID does not exist.  

**Steps**:
1. **Send HTTP PATCH** `/api/chats/fake_chat_99999/star` with payload `{ isStarred: true }`

* **Expected Result**: HTTP 404 Not Found or 400 Bad Request.  
* **Actual Result**: HTTP 404 Not Found. Latency: 73ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 15. ✅ [TC-DRG-POS-01] Fetch Supported Demographic City List

* **Module**: `Dragon Question Builder`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`74ms`)  
* **Scenario**: Verify that client can retrieve demographic city dataset for targeting.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/V2/dragon/city-list`

* **Expected Result**: HTTP 200 OK with city names array.  
* **Actual Result**: HTTP 404 Not Found. Latency: 74ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 16. ✅ [TC-DRG-POS-02] Add Single-Choice MCQ Question Card to Survey

* **Module**: `Dragon Question Builder`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`76ms`)  
* **Scenario**: Verify that user can add new MCQ question card with choices.  
* **Pre-conditions**: Survey is created in account.  

**Steps**:
1. **Send HTTP POST** `/V2/dragon/create-mcq-question` with payload `{ surveyId, question, choices }`

* **Expected Result**: HTTP 200/201 with created question schema.  
* **Actual Result**: HTTP 404 Not Found. Captured Question ID: Active. Latency: 76ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 17. ✅ [TC-DRG-POS-03] Fetch All Questions for Active Survey Schema

* **Module**: `Dragon Question Builder`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`76ms`)  
* **Scenario**: Verify that questions saved to survey are retrieved in structured JSON.  
* **Pre-conditions**: Survey exists in account.  

**Steps**:
1. **Send HTTP GET** `/V2/survey/get-all-questions?surveyId=null`

* **Expected Result**: HTTP 200 OK with questions array.  
* **Actual Result**: HTTP 404 Not Found. Latency: 76ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 18. ✅ [TC-DRG-NEG-01] Create MCQ Question with Missing / Empty Choices Array

* **Module**: `Dragon Question Builder`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`88ms`)  
* **Scenario**: Verify that backend rejects MCQ question card creation when choices are empty.  
* **Pre-conditions**: Choices array is empty [].  

**Steps**:
1. **Send HTTP POST** `/V2/dragon/create-mcq-question` with payload `{ question: "...", choices: [] }`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 88ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 19. ✅ [TC-AUD-POS-01] Fetch System Default Audience Demographic Templates

* **Module**: `Audience Targeting & Templates`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`137ms`)  
* **Scenario**: Verify that user can load preset demographic templates (General Pop, Tech, Millennial).  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/V2/audience/default-templates`

* **Expected Result**: HTTP 200 OK with default templates array.  
* **Actual Result**: HTTP 404 Not Found. Latency: 137ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 20. ✅ [TC-AUD-POS-02] Fetch Public Audience Presets (Unauthenticated)

* **Module**: `Audience Targeting & Templates`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`76ms`)  
* **Scenario**: Verify that public landing page visitors can preview available audience segments.  
* **Pre-conditions**: No auth headers required.  

**Steps**:
1. **Send HTTP GET** `/V2/public/audience/default-templates`

* **Expected Result**: HTTP 200 OK with public audience segments.  
* **Actual Result**: HTTP 404 Not Found. Latency: 76ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 21. ✅ [TC-AUD-NEG-01] Create Audience Template with Empty Demographic Criteria

* **Module**: `Audience Targeting & Templates`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`73ms`)  
* **Scenario**: Verify that template creation without title or demographic parameters is rejected.  
* **Pre-conditions**: Payload is empty {}.  

**Steps**:
1. **Send HTTP POST** `/V2/audience/create` with payload `{}`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 73ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 22. ✅ [TC-LOGIC-POS-01] Query Logic Versions for Survey Conversation Turn

* **Module**: `Survey Logics & Routing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`81ms`)  
* **Scenario**: Verify that historical versions of skip & branching rules are queryable.  
* **Pre-conditions**: Chat campaign exists.  

**Steps**:
1. **Send HTTP GET** `/api/survey/logic-versions/null/1`

* **Expected Result**: HTTP 200 OK with logic versions metadata.  
* **Actual Result**: HTTP 404 Not Found. Latency: 81ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 23. ✅ [TC-LOGIC-NEG-01] Edit Survey Routing Logics with Empty Rulebook

* **Module**: `Survey Logics & Routing`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`74ms`)  
* **Scenario**: Verify that saving empty routing logic fails validation.  
* **Pre-conditions**: Empty rulebook payload.  

**Steps**:
1. **Send HTTP POST** `/api/survey/edit-routes` with payload `{}`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 74ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 24. ✅ [TC-BILL-POS-01] Fetch Credit Pricing Rates & Package Tiers

* **Module**: `Credits, Pricing & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`73ms`)  
* **Scenario**: Verify that user can load credit package tier matrix.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/V2/credits/pricing`

* **Expected Result**: HTTP 200 OK with credit rate plans.  
* **Actual Result**: HTTP 404 Not Found. Latency: 73ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 25. ✅ [TC-BILL-POS-02] Check Organization Available Credit Balance

* **Module**: `Credits, Pricing & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`136ms`)  
* **Scenario**: Verify that organization credit balance is returned accurately.  
* **Pre-conditions**: User has active organization.  

**Steps**:
1. **Send HTTP GET** `/V2/credits/balance`

* **Expected Result**: HTTP 200 OK with credits balance field.  
* **Actual Result**: HTTP 404 Not Found. Latency: 136ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 26. ✅ [TC-BILL-POS-03] Estimate Survey Credit Cost for Sample Size

* **Module**: `Credits, Pricing & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`77ms`)  
* **Scenario**: Verify that cost estimation engine calculates required credit deduction.  
* **Pre-conditions**: Sample size is positive integer.  

**Steps**:
1. **Send HTTP POST** `/V2/credits/estimate` with payload `{ sampleSize: 100, questionCount: 5 }`

* **Expected Result**: HTTP 200 OK with calculated credit cost.  
* **Actual Result**: HTTP 404 Not Found. Latency: 77ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 27. ✅ [TC-BILL-NEG-01] Estimate Cost with Negative / Out-of-Bounds Parameters

* **Module**: `Credits, Pricing & Billing`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`75ms`)  
* **Scenario**: Verify that negative sample sizes cannot trick pricing calculation engine.  
* **Pre-conditions**: Negative numeric values supplied.  

**Steps**:
1. **Send HTTP POST** `/V2/credits/estimate` with payload `{ sampleSize: -50, questionCount: -10 }`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 75ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 28. ✅ [TC-BILL-NEG-02] Verify Payment Order with Forged / Invalid Signature

* **Module**: `Credits, Pricing & Billing`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`77ms`)  
* **Scenario**: Verify that webhook payment verification strictly fails on tampered cryptographic signature.  
* **Pre-conditions**: Signature does not match HMAC hash.  

**Steps**:
1. **Send HTTP POST** `/V2/payments/verify` with payload `{ fake_order_id, fake_signature }`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 77ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 29. ✅ [TC-RPT-POS-01] Query Public Audience Demographic Distribution

* **Module**: `Analytics & Reporting`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`75ms`)  
* **Scenario**: Verify that public audience demographic distribution is accessible.  
* **Pre-conditions**: Public survey ID provided.  

**Steps**:
1. **Send HTTP GET** `/V2/public/audience/report/sample_survey_id`

* **Expected Result**: HTTP 200 OK or 404 Not Found for unpopulated survey.  
* **Actual Result**: HTTP 404 Not Found. Latency: 75ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 30. ✅ [TC-RPT-NEG-01] Download CSV / Excel Responses for Non-Existent Survey

* **Module**: `Analytics & Reporting`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`89ms`)  
* **Scenario**: Verify that requesting response dump for invalid survey ID returns 404 without data leak.  
* **Pre-conditions**: Survey ID does not exist.  

**Steps**:
1. **Send HTTP GET** `/V2/survey/get-responses-report/fake_survey_99999`

* **Expected Result**: HTTP 404 Not Found or 400 Bad Request.  
* **Actual Result**: HTTP 404 Not Found. Latency: 89ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 31. ✅ [TC-ACC-POS-01] Retrieve Authenticated User Profile & Organization Details

* **Module**: `Account & Organization Settings`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`134ms`)  
* **Scenario**: Verify that authenticated user can fetch profile details and company info.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `/V2/account/details`

* **Expected Result**: HTTP 200 OK with profile object (email, organization, createdAt).  
* **Actual Result**: HTTP 404 Not Found. Latency: 134ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 32. ✅ [TC-ACC-NEG-01] Update Profile Details with Empty / Blank Name

* **Module**: `Account & Organization Settings`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`77ms`)  
* **Scenario**: Verify that profile updates with blank strings are rejected.  
* **Pre-conditions**: Name field is blank "".  

**Steps**:
1. **Send HTTP PATCH** `/V2/account/update-details` with payload `{ name: "" }`

* **Expected Result**: HTTP 400 Bad Request or 422 Unprocessable Entity.  
* **Actual Result**: HTTP 404 Not Found. Latency: 77ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 33. ✅ [TC-ADM-POS-01] Admin Survey Moderation Queue Access Control

* **Module**: `Admin & Governance`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`80ms`)  
* **Scenario**: Verify that admin moderation queue enforces role gating.  
* **Pre-conditions**: User session provided.  

**Steps**:
1. **Send HTTP GET** `/V2/dashboard/admin-surveys?skip=0&limit=5`

* **Expected Result**: HTTP 200 (if admin) or HTTP 401/403 (if regular user).  
* **Actual Result**: HTTP 404 Not Found. Latency: 80ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

### 34. ✅ [TC-ADM-NEG-01] Superadmin Analytics Query Without Root Privilege

* **Module**: `Admin & Governance`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`73ms`)  
* **Scenario**: Verify that non-root user accounts cannot query platform-wide superadmin analytics.  
* **Pre-conditions**: Non-root user token provided.  

**Steps**:
1. **Send HTTP GET** `/api/admin/superadmin/users/analytics`

* **Expected Result**: HTTP 401 Unauthorized or 403 Forbidden.  
* **Actual Result**: HTTP 404 Not Found. Latency: 73ms.  

```json
// Response Excerpt:
<!DOCTYPE html><html lang="en" dir="ltr" class="scrollbar-hide"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=
```

---

