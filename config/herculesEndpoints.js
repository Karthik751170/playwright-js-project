/**
 * herculesEndpoints.js
 * Official Hercules B2B Platform API Route Catalog
 * Categorized by feature module for Playwright E2E and AppSec Security Suites.
 */

const HERCULES_ENDPOINTS = {
  // 1. Authentication & Identity
  AUTH: {
    LOGIN: '/api/login',
    LOGOUT: '/api/logout',
    SYNC: '/api/auth/sync',
    CLEAR_COOKIES: '/api/auth/clear-cookies',
    GOOGLE_LOGIN: '/api/auth/google/code-exchange',
    GOOGLE_TOKEN: '/api/auth/google/get-access-token',
    GOOGLE_LINK: '/V2/auth/google/id-token-auth',
    SIGNUP_OTP: '/api/auth/send-verification-otp',
    VERIFY_OTP: '/api/auth/verify-otp-and-signup',
    PASSWORD_LOGIN: '/V2/auth/pwd-login',
    PASSWORD_LOGIN_VERIFY: '/V2/auth/pwd-login/verify',
    PASSWORD_LOGIN_ACCOUNT_STATUS: '/V2/auth/pwd-login/account-status',
    FORGOT_PASSWORD_EMAIL: '/V2/auth/fpwd/send-email',
    FORGOT_PASSWORD_VERIFY: '/V2/auth/fpwd/verify',
    RESET_PASSWORD_OTP: '/api/auth/forgot-password/send-otp',
    RESET_PASSWORD_VERIFY_OTP: '/api/auth/forgot-password/verify-otp',
    RESET_NEW_PASSWORD: '/api/auth/forgot-password/reset',
    TOKEN_LOGIN: (token) => `/V2/auth/token-login/${token}`,
    CLAIM_GUEST_SESSION: '/api/chat/claim-guest-session',
  },

  // 2. AI Workspace & Chat Stream
  AI_CHAT: {
    SUGGESTIONS: '/api/prompt-suggestions',
    CHAT: '/api/chat',
    CHAT_STREAM: '/api/chat/stream',
    CHAT_STREAM_RESUME: '/api/chat/stream/resume',
    RETRY_PROMPT: '/api/chat/retry',
    RETRY_PROMPT_STREAM: '/api/chat/retry/stream',
    CANCEL_REQUEST: '/api/cancel-request',
    DIRECT_FLOW: '/api/directflow',
    DRAFT_DIRECT_FLOW: '/api/draftdirectflow',
    EXECUTE_DIRECT_FLOW: '/api/executedirectflow',
    GUEST_CHATS: '/api/guest_chats',
  },

  // 3. Survey Lifecycle & Generation
  SURVEY: {
    GENERATE_QUESTIONS: '/api/generate-questions',
    REFINE_SURVEY: '/api/refine-survey',
    REGISTER_ALL_QUESTIONS: '/api/register-all-questions',
    FINALIZE_SURVEY: '/api/finalize-survey',
    DEPLOY_SURVEY_VERSION: '/api/deploy-survey-version',
    DEPLOY_SURVEY_INTERNAL: '/V2/survey/deploy-internal',
    GET_DEPLOYED_VERSION: (chatId, version) => `/api/chats/${chatId}/version/${version}/deployed-payload`,
    GET_SURVEY_DETAILS: '/V2/survey/details',
    UPDATE_SURVEY: '/V2/dashboard/update-survey',
    UPDATE_AI_SURVEY: '/V2/survey/user/update-ai-survey',
    SYNC_EDITS: '/api/survey/sync-edits',
    EDIT_QUESTION_MOBILE: '/api/survey/edit-question',
    LOOKUP_CHAT_IDS: '/api/surveys/lookup-chat-ids',
    SURVEY_INFO: '/api/surveys/info',
    SEARCH_SURVEY: '/V2/dashboard/survey_search',
  },

  // 4. Chat & Campaign Management
  CAMPAIGNS: {
    GET_HISTORY: '/api/chats',
    DELETE_BULK: '/api/chats/bulk',
    GET_CHAT_BY_ID: (id) => `/api/chats/${id}`,
    RENAME_CHAT: (id) => `/api/chats/${id}/rename`,
    STAR_CHAT: (id) => `/api/chats/${id}/star`,
    DUPLICATE_CHAT: (id) => `/api/chats/${id}/duplicate`,
    SHARE_CHAT: (id) => `/api/chats/${id}/share`,
    CANCEL_EDIT_CHAT: (id) => `/api/chats/${id}/cancel-review`,
    RE_EDIT_CHAT: (id) => `/api/chats/${id}/re-edit`,
    EXPLAIN_DATA: (id) => `/api/chats/${id}/explain`,
    MARK_AUDIENCE_REVIEWED: (id) => `/api/chats/${id}/mark-audience-reviewed`,
    GET_SHARE_TURN: (chatId, turnId) => `/api/chat/${chatId}/turn/${turnId}`,
  },

  // 5. Dragon Question Builder
  DRAGON_QUESTIONS: {
    CREATE_MCQ: '/V2/dragon/create-mcq-question',
    EDIT_MCQ: '/V2/dragon/edit-mcq-question',
    CREATE_QUESTIONS: '/V2/dragon/create-questions',
    UPDATE_QUESTIONS: '/V2/dragon/update-questions',
    EDIT_QUESTIONS: '/V2/dragon/edit-questions',
    GET_ALL_QUESTIONS: (surveyId) => `/V2/survey/get-all-questions?surveyId=${surveyId}`,
    GET_CITY_LIST: '/V2/dragon/city-list',
    INJECT_MEDIA: (chatId) => `/api/chats/${chatId}/inject-media`,
  },

  // 6. Audience Templates & Targeting
  AUDIENCE: {
    CREATE: '/V2/audience/create',
    DELETE: '/V2/audience/delete-template',
    DUPLICATE: '/V2/audience/duplicate',
    RENAME: '/V2/audience/update-title',
    GET_DEFAULT: '/V2/audience/default-templates',
    GET_PUBLIC_DEFAULT: '/V2/public/audience/default-templates',
    GET_MY_TEMPLATES: '/V2/audience/my-templates',
    GET_SURVEY_AUDIENCE: (surveyId) => `/V2/audience/get?surveyId=${surveyId}`,
    GET_USER_TEMPLATE: '/V2/audience/template',
    BULK_REPORTS: '/V2/audience/reports',
  },

  // 7. Survey Logics & Routing
  LOGICS: {
    EDIT_ROUTES: '/api/survey/edit-routes',
    RESET_TURN: '/api/survey/reset-survey-turn',
    GET_VERSIONS: (chatId, turnNum) => `/api/survey/logic-versions/${chatId}/${turnNum}`,
    VIEW_VERSION: (chatId, turnNum, versionNum) => `/api/survey/logic-versions/${chatId}/${turnNum}/${versionNum}`,
    REVERSE_QUESTIONS_SYNC: (chatId) => `/api/chats/${chatId}/sync`,
    REVERSE_AUDIENCE_SYNC: (chatId) => `/api/chats/${chatId}/audience`,
  },

  // 8. Credits, Pricing & Stripe Billing
  BILLING: {
    PRICING_DETAILS: '/V2/credits/pricing',
    GET_PRICING_PLANS: '/V2/payments/get-pricing',
    ACCOUNT_CREDITS: '/V2/credits/account',
    CHECK_BALANCE: '/V2/credits/balance',
    ESTIMATE_COST: '/V2/credits/estimate',
    DEDUCT_CREDITS: '/V2/credits/deduct',
    UPGRADE_PLAN: '/V2/credits/subscription/upgrade',
    GET_SUBSCRIPTION: '/V2/credits/subscription',
    ACCOUNT_INFO: '/V2/credits/info',
    REVERSE_TRANSACTION: '/V2/credits/reverse_transcations',
    CREATE_ORDER: '/V2/payments/create-order',
    VERIFY_PAYMENT: '/V2/payments/verify',
    GET_INVOICE: '/V2/payments/invoice',
    GET_TIER: '/V2/payments/get-tier',
    PAYMENT_HISTORY: '/V2/payments/history',
    SURVEY_PAYMENT_HISTORY: (surveyId) => `/V2/payments/survey-history/${surveyId}`,
    PRICING_UPGRADE_PREVIEW: '/V2/payments/upgrades/preview',
    APPLY_REFUND: '/V2/payments/upgrades/apply-refund',
  },

  // 9. Analytics & Reporting
  ANALYTICS: {
    AUDIENCE_INSIGHTS: (surveyId) => `/V2/audience/report/${surveyId}`,
    PUBLIC_AUDIENCE_INSIGHTS: (surveyId) => `/V2/public/audience/report/${surveyId}`,
    QUESTION_ANALYTICS: '/V2/survey/get-question-report',
    BULK_QUESTION_REPORTS: (surveyId) => `/V2/survey/get-bulk-questions-report/${surveyId}`,
    PUBLIC_BULK_QUESTION_REPORTS: (surveyId) => `/V2/public/survey/get-bulk-questions-report/${surveyId}`,
    DOWNLOAD_RESPONSES_REPORT: (surveyId) => `/V2/survey/get-responses-report/${surveyId}`,
    ANALYSIS_QUERY: (id) => `/analysis/query/${id}`,
    ANALYSIS_QUERY_STREAM: (id) => `/analysis/query/stream/${id}`,
  },

  // 10. Account & User Management
  ACCOUNT: {
    GET_DETAILS: '/V2/account/details',
    UPDATE_DETAILS: '/V2/account/update-details',
    DELETE_ACCOUNT: '/V2/account/delete',
    DELETE_USER: '/api/users/me',
    GET_PROFILE_PIC: (businessId) => `/V2/auth/get-profile-pic/${businessId}`,
    SEND_EMAIL: '/V2/contact/research-assistant',
    REQUEST_CONSULTATION: '/V2/contact/consultation',
  },

  // 11. Admin & Governance
  ADMIN: {
    SYNC_SURVEY_STATUS: '/api/admin/update-status',
    UPDATE_STATUS_ADMIN: '/V2/survey/admin/update-ai-survey',
    GET_ADMIN_SURVEYS: '/V2/dashboard/admin-surveys',
    SUPERADMIN_ANALYTICS: '/api/admin/superadmin/users/analytics',
  },

  // 12. Notifications & Alerts
  NOTIFICATIONS: {
    GET_LIST: '/V2/notifications/list',
    GET_ALERTS: '/api/notifications',
    MARK_READ: '/V2/notifications/read',
  }
};

module.exports = HERCULES_ENDPOINTS;
