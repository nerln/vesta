# Action plan: from prototype to App Store product

Goal: bring Vesta to a level that can be published on the iOS App Store and is pleasant to use,
with generation based on state-of-the-art paid models and a sustainable subscription business
model for whoever runs the app.

## 1. Current state

It already works: photo onboarding (upload/webcam) with segmentation, color analysis (season and
palette), a wardrobe with filters and auto-cataloguing of photographed garments, try-on with three engines
(local CatVTON, free cloud IDM-VTON, paid premium), render cache, installable PWA, automatic
theme, desktop and smartphone layouts.

Limits for production: the local and free cloud engines have a non-commercial licence and
quality/timings that are not product-grade; the backend runs on the operator's Mac; there are no accounts,
payments or moderation.

## 2. Paid generation engine (implemented)

The Premium mode uses models with a commercial licence via API, selectable with a key:

| Provider | Model | Cost per image (indicative) | Notes |
|---|---|---|---|
| OpenAI | gpt-image-1 (quality high, 1024x1536, input_fidelity high) | ~$0.17-0.25 | top quality, excellent face fidelity |
| OpenAI | gpt-image-1 (quality medium) | ~$0.06-0.08 | good compromise |
| Google | gemini-2.5-flash-image | ~$0.04 | excellent subject consistency, fast |

Implementation already in the repo: `backend/premium_tryon.py` (provider abstraction), a
`/settings` endpoint to configure the keys from the Profile (saved in `backend/.keys.json`, excluded from
git, never exposed by the APIs), `mode=premium` in `/tryon` with per-provider cache and errors
readable in the interface. To try: Profile → Premium models → paste the key → select
Premium → tap a garment.

Both providers apply moderation on the model side (nudity/forbidden content), which is also useful for
the App Store requirements.

## 3. Production architecture

With generation via API no GPU is needed: the backend becomes an ordinary web service.

- FastAPI backend on a VPS or PaaS (Hetzner/Fly.io/Railway): €10-20/month.
- Managed Postgres (users, credits, wardrobe, history): €5-15/month.
- S3-compatible storage for the images (Cloudflare R2): ~€0-5/month at the start.
- Authentication: Sign in with Apple + email; JWT sessions.
- Credit accounting as a ledger with idempotency on renewals.
- Subscriptions: StoreKit 2 on iOS (mandatory for digital goods) with App Store Server
  Notifications v2; Stripe Billing on the web version.
- Telemetry and errors: Sentry + structured logs; rate limiting per IP/user.

The local and free cloud modes stay in the self-hosted open-source version; the commercial
product uses only Premium.

## 4. Subscription economics

Price assumptions for Italy, weighted average cost per render ~$0.05 (Gemini + OpenAI medium mix,
retries included).

| Tier | Price | Credits/month | Estimated API cost | Gross margin after Apple 15%* |
|---|---|---|---|---|
| Free | €0 | 3 renders (one-off + 1/month) | ~$0.15 | acquisition |
| Pro | €7.99/month | 100 renders | ~$5 | ~€1.8 |
| Pro annual | €59.99/year | 100/month | ~$60/year | ~€9 |
| Boost (consumable) | €4.99 | 50 extra renders | ~$2.5 | ~€1.7 |

*Small Business Program (<$1M of revenue): Apple commission 15%. On the web with Stripe the
commission drops to ~2%, so the web is worth having as a parallel sales channel.

A gpt-image-1 high render costs ~4-5 credits; Gemini 1 credit. The variable cost stays
proportional to use: no risk of fixed GPU costs. Infrastructure break-even
(~€30/month) with ~15-20 Pro subscribers.

Free tier abuse countermeasures: per-device limit + Sign in required, rate limiting, DeviceCheck.

## 5. App Store requirements (checklist)

- **4.2 Minimum functionality**: no WKWebView wrapper; native SwiftUI interface that
  consumes the same backend APIs.
- **3.1.1 In-App Purchase**: subscriptions only via StoreKit 2; no links to external payments.
- **4.8 Sign in with Apple** alongside other logins.
- **5.1.1(v)**: account and data deletion from the app.
- **Privacy**: App Privacy labels, privacy policy, explicit consent to the use of photos,
  minimal retention (renders can be deleted, photos not used for training).
- **Content safety (1.1)**: only own photos (declaration), provider moderation,
  minors block (12+ rating), reporting mechanism.
- **2.1 Completeness**: demo account for the review, no broken feature, offline handling.
- Permissions with clear texts (camera, photos), icon/screenshots/description, EULA.

## 6. iOS UX plan (native SwiftUI app)

1. Three-step onboarding: promise ("try on clothes without trying them on") → guided shot with
   silhouette and light check → reveal of the personal palette as the first moment of value.
2. Capture with on-device Vision for person segmentation (instant, private).
3. "Mirror" home: large figure, outfit of the day, quick actions; haptics on actions.
4. Wardrobe: grid with automatic categories, adding from photo/camera roll and from a share extension
   (add a garment from Safari/Instagram with Share → Vesta).
5. Queued try-on with a push notification when done; look history; before/after comparison
   with a slider; saving and sharing.
6. Paywall after the first free render (wow moment), 3-day trial, restore purchases.
7. Ideas: outfit of the day tied to weather and season, an explanation of why a garment works
   with the palette.
8. Finishing touches: SF Symbols, Dynamic Type, VoiceOver, IT/EN localisation, dark/light.

## 7. Web UX plan

1. Landing with pre-generated examples and a try without registration (1 demo render).
2. App (evolution of the current PWA): drag & drop of garments, paste an image from the clipboard,
   multiple upload, look gallery with slider comparison, sharing a look via link,
   keyboard shortcuts; on desktop a three-column layout (wardrobe | mirror | details).
3. Stripe Checkout + Customer Portal for web subscriptions.
4. Accessibility: visible focus, aria-label, AA contrast.

## 8. Roadmap

| Phase | Content | Estimate |
|---|---|---|
| F1 | Hosted multi-user backend: auth, credits, web Stripe, moderation, storage | 1-2 weeks |
| F2 | Native iOS app MVP: onboarding, capture, wardrobe, premium try-on, StoreKit paywall | 2-3 weeks |
| F3 | TestFlight beta, telemetry, iteration on prompt/provider and quality | 1 week |
| F4 | Submission: privacy labels, review notes, demo account, launch | 1 week |

In parallel: privacy policy and ToS (template + review), landing page, store material.

## 9. Main risks

- API costs from free tier abuse → per-device limits, mandatory login beyond the demo.
- Uneven quality across providers → routing by use case, automatic retry on the other
  provider, periodic prompt evaluation.
- Apple review on content with people → "own photos only" policy, moderation, 12+ rating.
- GDPR → complete deletion, data minimization, DPAs with the providers.
