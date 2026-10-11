# Privacy Nutrition Label — ASC answers

How to use: Open App Store Connect → App → App Privacy → **Edit** data collection.
For each category below, Apple asks: "Do you collect X?" Click the matching answer.

**Overall:** All linked to user identity. **No** tracking across apps/websites. **No** third-party advertising.

---

## 1. Contact Info

### ☑ Email Address — COLLECTED
- **Purposes:** App Functionality, Analytics
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Name — COLLECTED
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☐ Phone, Address, Other — Not collected

---

## 2. Health & Fitness

### ☑ Health — COLLECTED
*(weight, body fat %, body measurements, menstrual cycle if enabled, glucose if Ultrahuman connected)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Fitness — COLLECTED
*(workouts, cardio sessions, steps, active energy, sleep, recovery, HRV)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

---

## 3. Financial Info

### ☑ Purchase History — COLLECTED
*(subscription tier, renewal dates via RevenueCat/App Store)*
- **Purposes:** App Functionality, Analytics
- **Linked to user:** Yes
- **Used for tracking:** No

### ☐ Payment Info, Credit Info, Other — Not collected (Apple/RevenueCat handle payment data; we never see card details)

---

## 4. Location
### ☐ Precise Location, Coarse Location — Not collected

---

## 5. Sensitive Info
### ☐ Not collected

---

## 6. Contacts
### ☐ Not collected

---

## 7. User Content

### ☑ Photos or Videos — COLLECTED
*(plate scan + menu scan images stored in Supabase Storage; body scan photos processed in-memory only, NOT stored)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Audio Data — COLLECTED
*(voice meal logs; uploaded to our server, transcribed via OpenAI Whisper, not retained)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Customer Support — COLLECTED
*(messages to AI coach stored in chat history)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Other User Content — COLLECTED
*(logged meals, workouts, weight entries, water, fasting, notes — anything the user types in)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☐ Emails/Text Messages, Gameplay Content — Not collected

---

## 8. Browsing History
### ☐ Not collected

---

## 9. Search History
### ☐ Not collected

---

## 10. Identifiers

### ☑ User ID — COLLECTED
*(Supabase UUID — shared with PostHog, Sentry, RevenueCat for feature functionality)*
- **Purposes:** App Functionality, Analytics
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Device ID — COLLECTED
*(Expo push notification token)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

---

## 11. Purchases

### ☑ Purchase History — COLLECTED
*(same as Financial Info — this appears in both sections in the ASC form; answer the same way)*
- **Purposes:** App Functionality, Analytics
- **Linked to user:** Yes
- **Used for tracking:** No

---

## 12. Usage Data

### ☑ Product Interaction — COLLECTED
*(PostHog analytics: scan events, meal logs, workouts, paywall funnel)*
- **Purposes:** Analytics, Product Personalization
- **Linked to user:** Yes
- **Used for tracking:** No

### ☐ Advertising Data, Other Usage Data — Not collected

---

## 13. Diagnostics

### ☑ Crash Data — COLLECTED
*(Sentry error reports with user_id in extra context)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Performance Data — COLLECTED
*(Sentry 10% transaction sampling)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

### ☑ Other Diagnostic Data — COLLECTED
*(Session replay on errors only, client-side)*
- **Purposes:** App Functionality
- **Linked to user:** Yes
- **Used for tracking:** No

---

## Tracking question

ASC will ask separately: **"Do you use data for tracking purposes?"**

**Answer: NO**

SE7A does not:
- Share user data with data brokers
- Use any third-party advertising SDKs
- Track users across apps or websites owned by other companies
- Use IDFA / ATT framework
- Have any ad network integrations

---

## Clickthrough tip

The ASC form is tedious but linear. Open it on one screen, this doc on another, and tick through top to bottom. Takes ~20 min.

If ASC complains that something is required but you haven't answered — scroll up, you probably missed a sub-question (purposes, linking, tracking are three separate clicks per data type).

---

## After submitting

Your public privacy label will appear on your App Store listing roughly like:

> **Data Linked to You**
> - Contact Info, Health & Fitness, Financial Info, User Content, Identifiers, Purchases, Usage Data, Diagnostics
>
> **Data Not Linked to You**
> *(none — everything is linked)*
>
> **Data Used to Track You**
> *(none)*
