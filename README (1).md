# 🌹 US Community Resource Guide

**2,037 free community resources across all 50 states, DC, and Puerto Rico.**

The most comprehensive free social services directory available — food, shelter, health care, legal aid, mental health, employment, immigration, veterans services, disability, reentry, and 16 more categories.

---

## Quick Start

```bash
npm install
npm start
# → http://localhost:3000
```

---

## Features

- **2,037 verified resources** across 25 service categories
- **State → County/Region filter hierarchy** — dynamically populated
- **Full-text search** across name, description, address, phone, and category
- **Category pills** for one-tap filtering
- **Requirements & Eligibility** section on every resource detail
- **Hours** displayed on cards and in detail modal
- **Share button** — native share on mobile, clipboard fallback on desktop
- **Result count** with pagination ("Showing 1–24 of 847 results")
- **7 crisis hotlines** in persistent emergency bar
- **Mobile-first** responsive design
- **Print-optimized** CSS
- **Accessible** — full keyboard navigation, ARIA labels, focus management

---

## Deploy to Render (Free)

1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Environment:** Node
5. Click **Deploy**

## Deploy to Railway

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Deploy to Fly.io

```bash
fly launch
fly deploy
```

## Deploy to Heroku

```bash
heroku create my-resource-guide
git push heroku main
```

---

## API Reference

All resources served from in-memory index for fast response.

| Endpoint | Params | Description |
|----------|--------|-------------|
| `GET /api/meta` | — | Total count, states+counties, categories |
| `GET /api/resources` | `q`, `state`, `county`, `category`, `page`, `limit` | Search & filter resources |
| `GET /api/resources/:index` | — | Single resource by index |

### Example queries

```
GET /api/resources?q=food+portland&state=Oregon&page=1&limit=24
GET /api/resources?category=Shelter&state=California&county=Los+Angeles+County
GET /api/resources?q=domestic+violence&limit=100
```

---

## Data Structure

Each resource in `data/resources.json`:

```json
{
  "name": "Transition Projects – Bud Clark Commons",
  "phone": "503-280-4700",
  "address": "650 NW Irving St, Portland OR 97209",
  "description": "Day center and residential shelter...",
  "hours": "Daily 8:30am-7pm",
  "website": "tprojects.org",
  "state": "Oregon",
  "county": "Multnomah County",
  "category": "Day Services/Hygiene",
  "req": [
    "Open to all experiencing homelessness",
    "Walk-in for day services"
  ]
}
```

---

## Sources

- Street Roots Rose City Resource Guide (Dec 2025–May 2026)
- Coalition for the Homeless NYC Street Sheet (2024)
- Salt Lake County 211 Homeless Resource List (2024-25)
- Louisville Street Tips (2025-26)
- Montgomery County OH Street Card (2024)
- Buncombe County NC Resource Sheet (2025)
- Sacramento County Street Sheet (2024)
- ShelterBridge App (shelterbridge.org)
- Feeding America, 211.org, SAMHSA, HUD, SSA, VA, USDA, HHS
- State DHS offices and verified local nonprofits

*Data compiled and verified March 2026.*

---

## Categories

Benefits & Financial Aid · Clothing · Day Services/Hygiene · Disability & Aging · Domestic Violence & Sexual Assault · Employment & Job Training · Family & Parenting · Food & Groceries · Government Services · Harm Reduction · Health Care · Housing · Immigration · Legal Services · Libraries · Meals · Mental Health & Recovery · Pet Care · Reentry Resources · Rental Assistance · STI & HIV Services · Shelter · Transportation · Veteran Services · Youth Services

