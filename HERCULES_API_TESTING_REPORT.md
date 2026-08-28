# 🚀 Hercules API Testing — Master Execution & Documentation Report (Strict Mode 3.0 — Zero Assumptions)

> **AI Backend Microservice**: `https://devapi-ai.hercules.works`  
> **Core Business Microservice**: `https://devapi.hercules.works`  
> **Single Tracked Account**: `tracked_user@kzdzyaot.mailosaur.net`  
> **Generated On**: Fri, 28 Aug 2026 12:40:39 GMT  
> **Pass Rate**: **100%** (20/20 Passed) | **Avg Latency**: `791ms`  

## 📊 Executive Summary

| Total Tests | Passed | Failed | Positive Tests | Negative Tests | Average Latency | Success Rate |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **20** | **20** | **0** | **16** | **4** | **791ms** | **100%** |

---

## 📋 Detailed Test Case Documentation & Results

### 1. ✅ [TC-AUTH-01] Session Token State Synchronization [POST /api/auth/sync]

* **Module**: `Authentication & Identity`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`298ms`)  
* **Scenario**: Verify that authenticated user token synchronizes claims and tier status.  
* **Pre-conditions**: Authenticated session for tracked_user@kzdzyaot.mailosaur.net.  

**Steps**:
1. **Send HTTP POST** `https://devapi-ai.hercules.works/api/auth/sync` with payload `{}`

* **Expected Result**: HTTP 200 OK with JSON { status: true, data: { message: "User ... authenticated" } }.  
* **Actual Result**: HTTP 200 OK. Latency: 298ms. Response: {"status":true,"data":{"message":"User not-globe@kzdzyaot.mailosaur.net is authenticated and synced. Tier refreshed to F  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"message":"User not-globe@kzdzyaot.mailosaur.net is authenticated and synced. Tier refreshed to FREE."},"message":"Sync successful.","exhausted":null,"require_auth":false}
```

---

### 2. ✅ [TC-AUTH-02] Retrieve Authenticated User Profile [GET /V2/account/details]

* **Module**: `Authentication & Identity`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`151ms`)  
* **Scenario**: Verify that user profile details, name, and designation are returned accurately.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/account/details`

* **Expected Result**: HTTP 200 OK with JSON { success: true, data: { email, name, designation } }.  
* **Actual Result**: HTTP 200 OK. User: Userr0z9 (not-globe@kzdzyaot.mailosaur.net). Latency: 151ms.  

```json
// Live JSON Response Excerpt:
{"success":true,"status":true,"data":{"_id":"04f9eae6-f95e-45c5-a86a-f3bdd3587699","email":"not-globe@kzdzyaot.mailosaur.net","name":"Userr0z9","nickname":"Userr0z9","designation":"Founder / Entrepreneur","role":null,"purpose":"Product Development","showStarterWelcome":false,"creditsAdded":500}}
```

---

### 3. ✅ [TC-AI-01] Fetch AI Prompt Suggestions [GET /api/prompt-suggestions]

* **Module**: `AI Workspace`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`66ms`)  
* **Scenario**: Verify that client receives research category suggestions for survey creation.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi-ai.hercules.works/api/prompt-suggestions`

* **Expected Result**: HTTP 200 OK with array surveyNames (e.g., ["Brand Tracking", "Customer Profiling"]).  
* **Actual Result**: HTTP 200 OK. Categories: 8. Latency: 66ms.  

```json
// Live JSON Response Excerpt:
{"surveyNames":["General","Brand Tracking","Customer Profiling","Competitor Analysis","Market Analysis","New Product Development","Campaign Tracking","Net Promoter Score"],"suggestions":{"General":[{"Brand":"our new product line","Prompt":"to understand customer satisfaction."},{"Brand":"our recent 
```

---

### 4. ✅ [TC-AI-02] Initialize Survey Campaign Turn 1 [POST /api/chat]

* **Module**: `AI Workspace`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`5487ms`)  
* **Scenario**: Verify that AI initializes survey workspace and returns generated chat_id & ai_message.  
* **Pre-conditions**: User provides prompt and request_id.  

**Steps**:
1. **Send HTTP POST** `https://devapi-ai.hercules.works/api/chat` with payload `{ prompt: "Create cold brew survey", request_id: "req_1787920824614_1" }`

* **Expected Result**: HTTP 200 OK with JSON { status: true, data: { chat_id, chat_turn_id, ai_message } }.  
* **Actual Result**: HTTP 200 OK. Generated Chat ID: a1840990-40ca-49a6-b749-2ba15fc73ac1. Latency: 5487ms.  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"ai_message":"Cold brew coffee is clear as the topic. I have a few quick questions so the three-question survey focuses on the right preferences and audience.","chat_id":"a1840990-40ca-49a6-b749-2ba15fc73ac1","guest_id":null,"chat_turn_id":"8c96db4f-e47c-4217-9114-8ac71abcbd9f
```

---

### 5. ✅ [TC-AI-03] Survey Refinement Follow-Up Turn 2 [POST /api/chat]

* **Module**: `AI Workspace`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`6804ms`)  
* **Scenario**: Verify that multi-turn follow-up prompts persist within the same active chat_id session.  
* **Pre-conditions**: Chat campaign created in Turn 1.  

**Steps**:
1. **Send HTTP POST** `https://devapi-ai.hercules.works/api/chat` with payload `{ prompt: "Focus on brand awareness...", chat_id: "a1840990-40ca-49a6-b749-2ba15fc73ac1", request_id: "req_1787920830101_2" }`

* **Expected Result**: HTTP 200 OK with conversational response linked to chat_id.  
* **Actual Result**: HTTP 200 OK. Latency: 6804ms. Response: {"status":true,"data":{"ai_message":"That gives the survey a clear measurement focus. I need a few details to make the t  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"ai_message":"That gives the survey a clear measurement focus. I need a few details to make the three questions meaningful and avoid measuring the wrong brand or audience.","chat_id":"a1840990-40ca-49a6-b749-2ba15fc73ac1","guest_id":null,"chat_turn_id":"dfd50acb-be23-44b0-b99b
```

---

### 6. ✅ [TC-AI-04] Fetch Specific Survey Campaign Metadata [GET /api/chats/:id]

* **Module**: `AI Workspace`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`197ms`)  
* **Scenario**: Verify that survey metadata (chat_name, super_j_survey_id, user_id) is queryable by chat_id.  
* **Pre-conditions**: Chat campaign exists in database.  

**Steps**:
1. **Send HTTP GET** `https://devapi-ai.hercules.works/api/chats/a1840990-40ca-49a6-b749-2ba15fc73ac1`

* **Expected Result**: HTTP 200 OK with JSON { status: true, data: { chat_id, chat_name, super_j_survey_id } }.  
* **Actual Result**: HTTP 200 OK. Chat Name: "New Chat (2026-08-28 12:40)". Latency: 197ms.  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"chat_id":"a1840990-40ca-49a6-b749-2ba15fc73ac1","user_id":"6a917cfe1f88f10eb7b5d325","chat_name":"New Chat (2026-08-28 12:40)","super_j_survey_id":"PENDING_73745dc1-d6c5-445f-85e7-64b4a14cabeb","super_j_survey_name":"New Chat (2026-08-28 12:40)","businessId":"6a917cfe1f88f10e
```

---

### 7. ✅ [TC-CMP-01] Star Survey Campaign as Favorite [POST /api/chats/:id/star]

* **Module**: `Campaign Management`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`193ms`)  
* **Scenario**: Verify that user can mark survey campaign as favorite for quick access.  
* **Pre-conditions**: Target chat campaign exists.  

**Steps**:
1. **Send HTTP POST** `https://devapi-ai.hercules.works/api/chats/a1840990-40ca-49a6-b749-2ba15fc73ac1/star` with payload `{ star: true }`

* **Expected Result**: HTTP 200 OK with JSON { status: true, data: { starred: true } }.  
* **Actual Result**: HTTP 200 OK. Starred: true. Latency: 193ms.  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"chat_id":"a1840990-40ca-49a6-b749-2ba15fc73ac1","starred":true,"message":"Chat successfully starred."},"message":"Star status updated.","exhausted":null,"require_auth":false}
```

---

### 8. ✅ [TC-CMP-02] Rename Survey Campaign Title [PATCH /api/chats/:id/rename]

* **Module**: `Campaign Management`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`133ms`)  
* **Scenario**: Verify that user can rename campaign title and update dashboard records.  
* **Pre-conditions**: Target chat campaign exists.  

**Steps**:
1. **Send HTTP PATCH** `https://devapi-ai.hercules.works/api/chats/a1840990-40ca-49a6-b749-2ba15fc73ac1/rename` with payload `{ new_name: "Q3 Cold Brew Brand Perception Intelligence Study" }`

* **Expected Result**: HTTP 200 OK with JSON { status: true, data: { chat_name: "..." } }.  
* **Actual Result**: HTTP 200 OK. Renamed to: "Q3 Cold Brew Brand Perception Intelligence Study". Latency: 133ms.  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"chat_id":"a1840990-40ca-49a6-b749-2ba15fc73ac1","chat_name":"Q3 Cold Brew Brand Perception Intelligence Study","message":"Chat renamed successfully."},"message":"Rename operation completed.","exhausted":null,"require_auth":false}
```

---

### 9. ✅ [TC-CMP-03] Fetch Active User Campaigns History [GET /api/chats]

* **Module**: `Campaign Management`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`261ms`)  
* **Scenario**: Verify that user campaign list includes newly created study and token usage metadata.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi-ai.hercules.works/api/chats?limit=15&offset=0`

* **Expected Result**: HTTP 200 OK with JSON { status: true, data: { total_chats: N, chats: [] } }.  
* **Actual Result**: HTTP 200 OK. Total Campaigns: 5. Latency: 261ms.  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"total_chats":5,"limit":15,"offset":0,"starred_chats":[{"id":"a1840990-40ca-49a6-b749-2ba15fc73ac1","chat_name":"Q3 Cold Brew Brand Perception Intelligence Study","super_j_survey_name":"New Chat (2026-08-28 12:40)","updated_at":"2026-08-28T12:40:37.459287Z","last_opened_at":"2
```

---

### 10. ✅ [TC-CMP-04] Purge Survey Campaign from Account [DELETE /api/chats/:id]

* **Module**: `Campaign Management`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`150ms`)  
* **Scenario**: Verify that user can delete test surveys to maintain clean dashboard state.  
* **Pre-conditions**: Target chat campaign was created.  

**Steps**:
1. **Send HTTP DELETE** `https://devapi-ai.hercules.works/api/chats/a1840990-40ca-49a6-b749-2ba15fc73ac1`

* **Expected Result**: HTTP 200 OK confirming deletion.  
* **Actual Result**: HTTP 200 OK. Purged Chat ID: a1840990-40ca-49a6-b749-2ba15fc73ac1. Latency: 150ms.  

```json
// Live JSON Response Excerpt:
{"status":true,"data":{"message":"Delete operation completed. Deleted 1 chat(s). Skipped 0 ineligible chat(s).","deleted_chat_ids":["a1840990-40ca-49a6-b749-2ba15fc73ac1"],"failed_chat_ids":[]},"message":null,"exhausted":null,"require_auth":false}
```

---

### 11. ✅ [TC-AUD-01] Fetch Demographic City Targeting Catalog [GET /V2/dragon/city-list]

* **Module**: `Audience & Demographics`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`231ms`)  
* **Scenario**: Verify that client can query Tier 1 & Tier 2 cities dataset for geographic targeting.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/dragon/city-list`

* **Expected Result**: HTTP 200 OK with JSON { data: { tier1: ["Delhi", "Mumbai"...], tier2: [...] } }.  
* **Actual Result**: HTTP 200 OK. Tier 1 Cities: 7. Latency: 231ms.  

```json
// Live JSON Response Excerpt:
{"data":{"tier1":["Delhi","Mumbai","Bangalore","Chennai","Kolkata","Hyderabad","Pune"],"tier2":["Ahmedabad","Surat","Jaipur","Lucknow","Kanpur","Nagpur","Indore","Bhopal","Patna","Coimbatore","Kochi","Visakhapatnam","Vijayawada","Chandigarh","Vadodara","Ludhiana","Agra","Varanasi","Rajkot","Amritsar
```

---

### 12. ✅ [TC-AUD-02] Fetch Default Audience Preset Templates [GET /V2/audience/default-templates]

* **Module**: `Audience & Demographics`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`139ms`)  
* **Scenario**: Verify that preset demographic audience templates (Age/Gender splits) are queryable.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/audience/default-templates`

* **Expected Result**: HTTP 200 OK with array of audience templates.  
* **Actual Result**: HTTP 200 OK. Preset Templates: 9. Latency: 139ms.  

```json
// Live JSON Response Excerpt:
{"data":[{"chat_id":"e87ce356-ac77-4758-a5f9-534b74ad0055","title":"Evil Huntar AR Game Concept Testing","total":1000,"male":500,"female":500,"checkcity":false,"imageurl":"https://storage.googleapis.com/jupitermeta-storage/superj/images/game.webp","campaigntype":"Augmented Reality Experiences","surv
```

---

### 13. ✅ [TC-BILL-01] Fetch Credit Pricing & Age Demographic Matrix [GET /V2/credits/pricing]

* **Module**: `Credits & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`133ms`)  
* **Scenario**: Verify that credit cost rates per age group and question multiplier are queryable.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/credits/pricing`

* **Expected Result**: HTTP 200 OK with JSON { data: { age: { "18-24": 1, "24-35": 1 } } }.  
* **Actual Result**: HTTP 200 OK. Latency: 133ms. Response: {"data":{"age":{"18-24":1,"24-35":1,"35-45":1,"45-55":2,"56-90":2},"aiGeneration":{"description":"AI Survey Generator pr  

```json
// Live JSON Response Excerpt:
{"data":{"age":{"18-24":1,"24-35":1,"35-45":1,"45-55":2,"56-90":2},"aiGeneration":{"description":"AI Survey Generator pricing to be determined","status":"TBD"},"attributes":{"claimed":0,"validated":4},"baseRespondent":{"creditsPerUnit":1,"description":"1 credit per respondent"},"creditToINR":10,"gen
```

---

### 14. ✅ [TC-BILL-02] Query Available Credit Balance & INR Value [GET /V2/credits/balance]

* **Module**: `Credits & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`134ms`)  
* **Scenario**: Verify that user available credits and equivalent currency balance are accurate.  
* **Pre-conditions**: User has active account.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/credits/balance`

* **Expected Result**: HTTP 200 OK with JSON { success: true, data: { availableCredits, equivalentINR } }.  
* **Actual Result**: HTTP 200 OK. Available Credits: 0. Latency: 134ms.  

```json
// Live JSON Response Excerpt:
{"data":{"availableCredits":0,"equivalentINR":0},"success":true}
```

---

### 15. ✅ [TC-BILL-03] Retrieve Account Credit Info & Free Tier Limits [GET /V2/credits/info]

* **Module**: `Credits & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`134ms`)  
* **Scenario**: Verify that organization account credits, used credits, and freeCampaignUserlimit are returned.  
* **Pre-conditions**: User has active account.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/credits/info`

* **Expected Result**: HTTP 200 OK with JSON { data: { account: { totalCredits, freeCampaignUserlimit } } }.  
* **Actual Result**: HTTP 200 OK. Free Limit: 100 users. Latency: 134ms.  

```json
// Live JSON Response Excerpt:
{"data":{"account":{"_id":"6a917d141f88f10eb7b5d327","businessId":"6a917cfe1f88f10eb7b5d325","totalCredits":0,"usedCredits":0,"availableCredits":0,"freeCampaignUserlimit":100,"isActive":true,"createdAt":"2026-08-28T12:20:36.288Z","updatedAt":"2026-08-28T12:20:36.288Z"},"availableCredits":0,"equivale
```

---

### 16. ✅ [TC-BILL-04] Fetch Subscription Upgrade Plan Packages [GET /V2/payments/get-tier]

* **Module**: `Credits & Billing`  
* **Test Type**: `POSITIVE`  
* **Status**: **PASS** (`127ms`)  
* **Scenario**: Verify that available credit package tiers (e.g. 100 Credits for ₹1000) are queryable.  
* **Pre-conditions**: User is authenticated.  

**Steps**:
1. **Send HTTP GET** `https://devapi.hercules.works/V2/payments/get-tier`

* **Expected Result**: HTTP 200 OK with JSON { success: true, data: { buyMorePlans: [...] } }.  
* **Actual Result**: HTTP 200 OK. Plan Packages: 5. Latency: 127ms.  

```json
// Live JSON Response Excerpt:
{"success":true,"status":true,"data":{"buyMorePlans":[{"ID":"buy_100","Name":"100 Credits","Tier":"BUY_MORE","Type":"One-time","BillingCycle":"ONE-TIME","Credits":100,"AnnualCredits":0,"ExtraCredits":0,"Price":1000,"Priority":0,"PricePerMonth":0,"ExpiresAt":"2027-08-28T08:52:04.483502188Z","CreditCo
```

---

### 17. ✅ [TC-SEC-01] Tokenless Request Gate [POST /api/auth/sync]

* **Module**: `Security & Rejection Gates`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`44ms`)  
* **Scenario**: Verify that unauthenticated session sync request is strictly blocked with 401.  
* **Pre-conditions**: Zero tokens provided.  

**Steps**:
1. **Send HTTP POST** `https://devapi-ai.hercules.works/api/auth/sync` with payload `{}`

* **Expected Result**: HTTP 401 Unauthorized.  
* **Actual Result**: HTTP 401 Unauthorized. Latency: 44ms.  

```json
// Live JSON Response Excerpt:
{"status":false,"data":null,"message":"Could not validate credentials"}
```

---

### 18. ✅ [TC-SEC-02] Schema Validation Gate on Missing Keys [POST /api/chat]

* **Module**: `Security & Rejection Gates`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`109ms`)  
* **Scenario**: Verify that missing required prompt and request_id fields are rejected with HTTP 422.  
* **Pre-conditions**: Required schema keys omitted.  

**Steps**:
1. **Send HTTP POST** `https://devapi-ai.hercules.works/api/chat` with payload `{ badKey: "test" }`

* **Expected Result**: HTTP 422 Unprocessable Entity with detail array.  
* **Actual Result**: HTTP 422 unknown. Detail: [{"type":"missing","loc":["body","prompt"],"msg":"Field required","input":{"badKey":"test"}},{"type":"missing","loc":["body","request_id"],"msg":"Field required","input":{"badKey":"test"}}]. Latency: 109ms.  

```json
// Live JSON Response Excerpt:
{"detail":[{"type":"missing","loc":["body","prompt"],"msg":"Field required","input":{"badKey":"test"}},{"type":"missing","loc":["body","request_id"],"msg":"Field required","input":{"badKey":"test"}}]}
```

---

### 19. ✅ [TC-SEC-03] Superadmin Privilege Escalation Gate [GET /api/admin/...]

* **Module**: `Security & Rejection Gates`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`125ms`)  
* **Scenario**: Verify that non-root user accounts are strictly denied superadmin telemetry access with HTTP 403.  
* **Pre-conditions**: Standard user token provided.  

**Steps**:
1. **Send HTTP GET** `https://devapi-ai.hercules.works/api/admin/superadmin/users/analytics`

* **Expected Result**: HTTP 403 Forbidden.  
* **Actual Result**: HTTP 403 Forbidden. Latency: 125ms.  

```json
// Live JSON Response Excerpt:
{"status":false,"data":null,"message":"Superadmin access required."}
```

---

### 20. ✅ [TC-SEC-04] OWASP Account Enumeration Defense Gate [POST /V2/auth/pwd-login]

* **Module**: `Security & Rejection Gates`  
* **Test Type**: `NEGATIVE`  
* **Status**: **PASS** (`913ms`)  
* **Scenario**: Verify that invalid login attempts trigger generic envelope to prevent user enumeration.  
* **Pre-conditions**: Non-existent user email provided.  

**Steps**:
1. **Send HTTP POST** `https://devapi.hercules.works/V2/auth/pwd-login` with payload `{ email: "non_existent@domain.com", password: "..." }`

* **Expected Result**: HTTP 200 OK Generic Anti-Enumeration Envelope ("If eligible, instructions sent").  
* **Actual Result**: HTTP 200 OK. Envelope Message: "If eligible, we've sent instructions to your email.". Latency: 913ms.  

```json
// Live JSON Response Excerpt:
{"success":true,"status":true,"data":{"message":"If eligible, we've sent instructions to your email."}}
```

---

