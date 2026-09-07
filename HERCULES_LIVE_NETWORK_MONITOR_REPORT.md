# 📡 Hercules Live Network Monitoring & UI-to-API Parity Report

> **Target Host**: `https://dev.hercules.works`  
> **Microservices**: `devapi-ai.hercules.works` & `devapi.hercules.works`  
> **Audit Timestamp**: Fri, 28 Aug 2026 13:03:50 GMT  
> **Parity Rate**: **100%** (2/2 Reconciled 1-to-1)  

## 📋 Live Network Interception & UI Reconciliation Table

| # | Endpoint Key | HTTP Method & URL | Captured Request Headers | API Field & Response Payload | Live UI Rendered DOM Value | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `GET_ACCOUNT_DETAILS` | `GET https://devapi.hercules.works/V2/account/details` | `...` | **data.name / data.email**: `Userr0z9 (not-globe@kzdzyaot.mailosaur.net)` | `Userr0z9 (not-globe@kzdzyaot.mailosaur.net)` | **EXACT MATCH** ✅ |
| **2** | `CHECK_CREDIT_BALANCE` | `GET https://devapi.hercules.works/V2/credits/balance` | `...` | **data.availableCredits**: `0 Credits` | `0 Credits Available` | **EXACT MATCH** ✅ |

---

## 🔍 Deep-Dive Header & Data Parity Evidence

### 1. ✅ [GET_ACCOUNT_DETAILS] `GET https://devapi.hercules.works/V2/account/details`

* **Response Status**: `HTTP 200`
* **Captured Request Headers**:
  ```json
{
  "Authorization": "...",
  "Cookie": "..."
}
  ```
* **API JSON Field**: `data.name / data.email` -> `Userr0z9 (not-globe@kzdzyaot.mailosaur.net)`
* **UI Rendered Text**: `Userr0z9 (not-globe@kzdzyaot.mailosaur.net)` (`input[name="name"] & input[name="email"]`)
* **Match Verdict**: **EXACT MATCH**
* **Notes**: Reconciled user name "Userr0z9" and email "not-globe@kzdzyaot.mailosaur.net" with Settings form DOM.

---

### 2. ✅ [CHECK_CREDIT_BALANCE] `GET https://devapi.hercules.works/V2/credits/balance`

* **Response Status**: `HTTP 200`
* **Captured Request Headers**:
  ```json
{
  "Authorization": "...",
  "Cookie": "..."
}
  ```
* **API JSON Field**: `data.availableCredits` -> `0 Credits`
* **UI Rendered Text**: `0 Credits Available` (`div.credits-badge, header span.credit-count`)
* **Match Verdict**: **EXACT MATCH**
* **Notes**: Reconciled exact credit balance (0 credits) with UI navigation pill.

---

