# Audit Architecture — Prospection Tool Metagora

> **Date** : 21 mars 2026
> **Auteur** : Audit automatisé (Cascade)
> **Projet** : `prospection-tool` — Next.js 15 / React 19 / TypeScript
> **Déploiement** : Vercel (https://pipedrive-ochre.vercel.app)
> **Repo** : https://github.com/Tony2Metagora/pipedrive

---

## 1. Vue d'ensemble

Application interne de **prospection commerciale B2B** pour Metagora (formation immersive IA pour le retail/luxe). Elle orchestre l'ensemble du cycle de prospection :

1. **Scrapping** d'entreprises via l'API Gouvernementale (SIRENE)
2. **Import** de contacts CSV + enrichissement Dropcontact
3. **Gestion de prospects** (CRUD, scoring IA, déduplication)
4. **Pipeline d'affaires** type CRM (deals, activités, notes, participants)
5. **Séquences email** via Smartlead (campagnes, warmup, preview)
6. **Génération de contenu** IA (emails, SMS, landing pages, posts LinkedIn)
7. **Intégration Gmail** (lecture emails, résumés IA, analyse deal)
8. **RBAC** multi-utilisateurs avec permissions par vue

### Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Next.js 15 (App Router), React 19, TailwindCSS 4, Lucide icons |
| Backend | Next.js API Routes (serverless) |
| Auth | NextAuth v5 (Google OAuth, restriction @metagora.tech) |
| Base de données | Upstash Redis (KV) — remplace Vercel Blob |
| IA | Azure OpenAI (gpt-5.4-pro + gpt-5.2-chat) |
| Email outbound | Smartlead API v1 |
| Enrichissement | Dropcontact API |
| Scraping LinkedIn | PhantomBuster API |
| Scraping entreprises | API Gouvernementale (recherche-entreprises.api.gouv.fr) |
| Images | Sharp (upscale), Vercel Blob (stockage) |
| Déploiement | Vercel + GitHub (master) |

---

## 2. Arborescence commentée

```
prospection-tool/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Redirect → /prospects
│   │   ├── layout.tsx                # Root layout (Inter font, Providers)
│   │   ├── globals.css               # Tailwind imports
│   │   │
│   │   ├── login/                    # Page de connexion Google OAuth
│   │   ├── admin/                    # Admin panel (gestion permissions RBAC)
│   │   ├── dashboard/                # Vue affaires/deals (pipeline board)
│   │   ├── deal/[id]/                # Fiche affaire détaillée
│   │   ├── pipeline/                 # Vue pipeline Kanban
│   │   ├── prospects/                # Liste prospects + scoring + enrichissement
│   │   ├── import/                   # Import CSV + enrichissement Dropcontact
│   │   ├── scrapping/                # Scraping entreprises API Gouv
│   │   ├── sequences/                # Campagnes email Smartlead
│   │   │   └── warmup/              # Warmup des comptes email
│   │   ├── linkedin/                 # Calendrier + génération posts LinkedIn
│   │   ├── landing-generator/        # Générateur de landing pages IA
│   │   │
│   │   └── api/                      # ~42 API routes (serverless)
│   │       ├── auth/                 # NextAuth handlers + /me endpoint
│   │       ├── admin/permissions/    # CRUD permissions RBAC
│   │       ├── activities/           # CRUD activités (deals)
│   │       ├── backup/               # Export JSON complet (toutes collections)
│   │       ├── calendar/meetings/    # Google Calendar (readonly)
│   │       ├── context/[personId]/   # Contexte CRM d'un contact
│   │       ├── deals/                # CRUD deals + participants + email-analysis
│   │       ├── enrich/               # Enrichissement Dropcontact (single)
│   │       ├── enrich-batch/         # Enrichissement Dropcontact (batch)
│   │       ├── generate/             # Génération texte IA (email/SMS)
│   │       ├── gmail/                # Recherche + résumé emails Gmail
│   │       ├── import/               # Ancien endpoint import (legacy?)
│   │       ├── imports/              # CRUD listes d'import + enrichissement
│   │       ├── landing/              # Génération landing pages + images
│   │       ├── linkedin/             # Posts + sources + génération + images
│   │       ├── notes/                # CRUD notes
│   │       ├── persons/[id]/         # CRUD contacts/personnes
│   │       ├── prospects/            # CRUD prospects + scoring IA + download
│   │       ├── rewrite-message/      # Réécriture IA de messages
│   │       ├── scraping/             # Lancement PhantomBuster + API Gouv
│   │       ├── search/               # Recherche entreprises API Gouv
│   │       ├── sequences/            # Smartlead campagnes + emails + warmup
│   │       ├── summary/              # Résumés IA unifiés + refine
│   │       └── templates/            # Templates de messages
│   │
│   ├── components/                   # 16 composants React réutilisables
│   │   ├── Sidebar.tsx               # Navigation latérale (RBAC-aware)
│   │   ├── Navbar.tsx                # Barre supérieure
│   │   ├── AppShell.tsx              # Layout wrapper (Sidebar + content)
│   │   ├── Providers.tsx             # SessionProvider NextAuth
│   │   ├── DealContextPanel.tsx      # Panel contexte affaire (Gmail, IA)
│   │   ├── DetailPanel.tsx           # Panel détail prospect
│   │   ├── ImportTab.tsx             # Onglet import CSV + enrichissement
│   │   ├── ApiGouvTab.tsx            # Onglet scraping API Gouv
│   │   ├── LinkedInGenerator.tsx     # Générateur posts LinkedIn (74KB!)
│   │   ├── LinkedInCalendar.tsx      # Calendrier éditorial LinkedIn
│   │   ├── MessageGenerator.tsx      # Génération email/SMS
│   │   ├── MessagePanel.tsx          # Panel messages
│   │   ├── ArchiveModal.tsx          # Modal archivage deals
│   │   ├── NewActivityModal.tsx      # Modal nouvelle activité
│   │   ├── NewDealModal.tsx          # Modal nouvelle affaire
│   │   └── NewProspectModal.tsx      # Modal nouveau prospect
│   │
│   ├── lib/                          # 18 modules serveur (logique métier + services)
│   │   ├── auth.ts                   # Config NextAuth v5 (Google OAuth)
│   │   ├── api-guard.ts              # Guards auth API (requireAuth, requireAdmin)
│   │   ├── permissions.ts            # Système RBAC (Redis, ViewKey, PermissionLevel)
│   │   ├── config.ts                 # Pipelines Pipedrive, domaines autorisés, emails
│   │   ├── blob-store.ts             # Couche persistance KV (Upstash Redis)
│   │   ├── import-store.ts           # Store listes d'import (index + contacts)
│   │   ├── linkedin-store.ts         # Store posts + sources LinkedIn
│   │   ├── scraping-store.ts         # Store résultats scraping
│   │   ├── smartlead.ts              # Client API Smartlead complet (12KB)
│   │   ├── azure-ai.ts              # Helpers Azure OpenAI (askAzureAI, askAzureFast)
│   │   ├── openai.ts                 # Génération texte (emails/SMS) via Azure
│   │   ├── dropcontact.ts            # Client API Dropcontact (enrichissement)
│   │   ├── phantombuster.ts          # Client API PhantomBuster (scraping LinkedIn)
│   │   ├── api-gouv.ts               # Client API Gouvernementale (SIRENE)
│   │   ├── french-geo.ts             # Données géographiques françaises (17KB)
│   │   ├── landing.ts                # Logique landing pages (19KB)
│   │   ├── templates.ts              # Templates email/SMS prédéfinis
│   │   └── utils.ts                  # Utilitaires (cn, formatDate, etc.)
│   │
│   ├── hooks/                        # 2 hooks React custom
│   │   ├── usePermissions.ts         # Hook RBAC client-side (cache 1min)
│   │   └── useResizableColumns.ts    # Hook colonnes redimensionnables
│   │
│   ├── data/
│   │   └── templates.json            # Templates de messages (JSON)
│   │
│   └── middleware.ts                  # Auth middleware (cookie session check)
│
├── public/                            # Assets statiques
├── scripts/                           # Scripts utilitaires
├── package.json                       # Dépendances
├── next.config.ts                     # Config Next.js
├── tsconfig.json                      # Config TypeScript
└── .env.example                       # Variables d'environnement requises
```

---

## 3. Modules et responsabilités

### 3.1 Domaines fonctionnels

| Domaine | Pages | API Routes | Lib | Composants |
|---------|-------|------------|-----|------------|
| **CRM / Pipeline** | `dashboard/`, `deal/[id]/`, `pipeline/` | `deals/`, `activities/`, `notes/`, `persons/`, `context/` | `blob-store.ts`, `config.ts` | `DealContextPanel`, `DetailPanel`, `ArchiveModal`, `NewDealModal`, `NewActivityModal` |
| **Prospects** | `prospects/` | `prospects/` (10 sous-routes) | `blob-store.ts` | `DetailPanel`, `NewProspectModal` |
| **Import / Enrichissement** | `import/` | `imports/`, `enrich/`, `enrich-batch/` | `import-store.ts`, `dropcontact.ts` | `ImportTab` |
| **Scraping** | `scrapping/` | `scraping/`, `search/` | `scraping-store.ts`, `api-gouv.ts`, `phantombuster.ts`, `french-geo.ts` | `ApiGouvTab` |
| **Séquences Email** | `sequences/`, `sequences/warmup/` | `sequences/` (6 sous-routes) | `smartlead.ts` | (inline dans page.tsx) |
| **LinkedIn** | `linkedin/` | `linkedin/` (5 sous-routes) | `linkedin-store.ts` | `LinkedInGenerator`, `LinkedInCalendar` |
| **Landing Pages** | `landing-generator/` | `landing/` (8 sous-routes) | `landing.ts` | (inline dans page.tsx) |
| **IA / Génération** | (transverse) | `generate/`, `rewrite-message/`, `summary/`, `gmail/summary` | `azure-ai.ts`, `openai.ts` | `MessageGenerator`, `MessagePanel` |
| **Auth / Admin** | `login/`, `admin/` | `auth/`, `admin/permissions/` | `auth.ts`, `api-guard.ts`, `permissions.ts` | `Sidebar`, `Navbar`, `Providers` |
| **Backup** | — | `backup/` | `blob-store.ts` | — |

### 3.2 Rôle de chaque couche

#### UI (Pages + Composants)
- **10 pages** Next.js App Router (`"use client"` dominant)
- Chaque page gère son propre état local (`useState`) — pas de state manager global
- Les composants sont des blocs UI réutilisables, certains très lourds (LinkedInGenerator = 74KB)
- Styling : TailwindCSS 4 exclusivement, icônes Lucide, utilitaire `cn()` (clsx + tailwind-merge)

#### Logique métier (API Routes)
- **~42 API routes** serverless (Next.js Route Handlers)
- Chaque route suit le pattern : `requireAuth()` → validation → appel service → réponse JSON
- Les routes sont le **seul point de contact** entre le frontend et les services externes

#### Services externes (lib/)
- **6 intégrations** : Smartlead, Azure OpenAI, Dropcontact, PhantomBuster, API Gouv, Gmail (OAuth)
- Chaque service a son propre module dans `lib/` avec types TypeScript
- Les clés API sont **toujours** dans `process.env` (jamais côté client)

#### Data (blob-store.ts + Redis)
- **Upstash Redis** comme base de données principale (via `@upstash/redis`)
- Pattern : `readKV<T>(key)` → `T[]` et `writeKV<T>(key, data)` → `void`
- **Mutex par clé** (`withLock`) pour éviter les race conditions read-modify-write
- **Safety check** : refuse d'écrire `[]` si `data.length > 3` (protection anti-wipe)
- Collections : `deals`, `activities`, `notes`, `persons`, `orgs`, `prospects`, `imports-index`, `linkedin-posts`, `linkedin-sources`, `scraping-index`, `permissions`, `scoring-memory`

#### Config
- `config.ts` : pipelines Pipedrive, domaines autorisés, emails whitelist, types d'activité
- `permissions.ts` : système RBAC complet (ViewKey × PermissionLevel)
- `middleware.ts` : vérification session cookie sur toutes les routes (sauf /login, /api/auth)
- `.env` : 15+ variables d'environnement

---

## 4. Flux de données

### 4.1 Flux principal : Prospection

```
[Scraping API Gouv / PhantomBuster]
        ↓
[Import CSV + Dropcontact enrichissement]
        ↓
[Prospects (Redis KV)] ←→ [Scoring IA (Azure OpenAI)]
        ↓
[Pipeline Deals (Redis KV)] ←→ [Gmail analyse / résumé (Azure OpenAI)]
        ↓
[Séquences Email (Smartlead)] ←→ [Génération IA (Azure OpenAI)]
        ↓
[Warmup comptes] → [Envoi campagnes]
```

### 4.2 Flux d'authentification

```
[Browser] → middleware.ts (cookie check)
    ↓ (si pas de cookie)
[/login] → Google OAuth → NextAuth callback
    ↓ (si @metagora.tech)
[Session cookie] → middleware.ts (pass)
    ↓
[API Route] → requireAuth(view, method)
    ↓
[Redis permissions] → check ViewKey × PermissionLevel
    ↓ (si autorisé)
[Exécution route]
```

### 4.3 Flux séquences email

```
[Page sequences] → fetch /api/sequences
    ↓
[Smartlead API] → listCampaigns, listEmailAccounts
    ↓
[Wizard 4 étapes]
  1. Sélection compte email → addEmailAccountsToCampaign
  2. Import leads CSV → addLeadsToCampaign
  3. Génération séquence IA → /api/sequences/generate-emails → Azure OpenAI
  4. Preview + édition directe → saveSequences → Smartlead
    ↓
[Lancement campagne] → setCampaignStatus("START")
```

### 4.4 Flux données CRM

```
[Frontend (useState)] → fetch /api/deals|activities|notes|persons
    ↓
[API Route + requireAuth] → blob-store.ts (readKV/mutateKV)
    ↓
[Upstash Redis] ←→ [withLock mutex]
```

---

## 5. Variables critiques

### 5.1 Variables d'environnement (15+)

| Variable | Service | Criticité |
|----------|---------|-----------|
| `KV_REST_API_URL` | Upstash Redis | **CRITIQUE** — toute la data |
| `KV_REST_API_TOKEN` | Upstash Redis | **CRITIQUE** — toute la data |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` | NextAuth | **CRITIQUE** — sessions |
| `GOOGLE_CLIENT_ID` | Google OAuth | **HAUTE** — authentification |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | **HAUTE** — authentification |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI (pro) | Moyenne — IA |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI (pro) | Moyenne — IA |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI (pro) | Basse — config |
| `AZURE_OPENAI_ENDPOINT_FAST` | Azure OpenAI (fast) | Moyenne — IA |
| `AZURE_OPENAI_API_KEY_FAST` | Azure OpenAI (fast) | Moyenne — IA |
| `AZURE_OPENAI_DEPLOYMENT_FAST` | Azure OpenAI (fast) | Basse — config |
| `SMARTLEAD_API_KEY` | Smartlead | **HAUTE** — emails sortants |
| `DROPCONTACT_API_KEY` | Dropcontact | Moyenne — enrichissement |
| `PHANTOMBUSTER_API_KEY` | PhantomBuster | Moyenne — scraping |
| `PHANTOMBUSTER_AGENT_ID` | PhantomBuster | Basse — config |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (legacy?) | Basse — migration KV faite |

### 5.2 Types de données centraux

| Type | Fichier | Description |
|------|---------|-------------|
| `Deal` | `blob-store.ts` | Affaire CRM (id, title, pipeline_id, stage_id, value, person_id, org_id) |
| `Person` | `blob-store.ts` | Contact (id, name, email[], phone[], org_id, job_title) |
| `Activity` | `blob-store.ts` | Activité (id, type, subject, due_date, deal_id, person_id) |
| `Organization` | `blob-store.ts` | Organisation (id, name) |
| `Note` | `blob-store.ts` | Note texte (id, content, deal_id, person_id) |
| `ImportContact` | `import-store.ts` | Contact importé (CSV enrichi Dropcontact, 30+ champs) |
| `ImportList` | `import-store.ts` | Liste d'import (index, metadata) |
| `ScrapingCompany` | `scraping-store.ts` | Entreprise scrapée API Gouv (SIREN, dirigeants, NAF) |
| `Campaign` | `smartlead.ts` | Campagne Smartlead (id, name, status, settings) |
| `SequenceStep` | `smartlead.ts` | Étape séquence email (seq_number, subject, email_body, delay) |
| `SmartleadLead` | `smartlead.ts` | Lead Smartlead (email, first_name, last_name, company) |
| `EmailAccount` | `smartlead.ts` | Compte email Smartlead (SMTP/IMAP, warmup) |
| `LinkedInPost` | `linkedin-store.ts` | Post LinkedIn planifié (title, content, theme, date) |
| `UserPermissions` | `permissions.ts` | Permissions RBAC par vue (email → Record<ViewKey, PermissionLevel>) |
| `ViewKey` | `permissions.ts` | Clés de vues : dashboard, prospects, pipeline, import, scrapping, landing, deal, linkedin, sequences |

### 5.3 État global / partagé

- **Aucun state manager global** (pas de Redux, Zustand, Context API pour les données)
- Chaque page gère son propre `useState` localement
- Le seul état partagé est la **session NextAuth** (via `SessionProvider` dans `Providers.tsx`)
- Les permissions sont cachées client-side 1 min via `usePermissions()` hook
- Les "edit memories" (séquences) sont dans `localStorage` (clé `"seq-edit-memories"`)

---

## 6. Dépendances majeures entre modules

```
┌─────────────────────────────────────────────────┐
│                    FRONTEND                      │
│                                                  │
│  Pages (app/)  ──→  Components  ──→  Hooks       │
│       │                                │         │
│       └──── fetch /api/* ──────────────┘         │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│                  API ROUTES                      │
│                                                  │
│  Toutes les routes ──→ api-guard.ts (auth)       │
│       │                    │                     │
│       │                    └─→ permissions.ts    │
│       │                         └─→ Redis (KV)   │
│       │                                          │
│       ├──→ blob-store.ts (CRUD data) ──→ Redis   │
│       ├──→ import-store.ts ──→ blob-store.ts     │
│       ├──→ linkedin-store.ts ──→ blob-store.ts   │
│       ├──→ scraping-store.ts ──→ blob-store.ts   │
│       │                                          │
│       ├──→ smartlead.ts ──→ Smartlead API        │
│       ├──→ azure-ai.ts ──→ Azure OpenAI          │
│       ├──→ openai.ts ──→ azure-ai.ts             │
│       ├──→ dropcontact.ts ──→ Dropcontact API    │
│       ├──→ phantombuster.ts ──→ PhantomBuster API│
│       ├──→ api-gouv.ts ──→ API Gouv              │
│       └──→ Gmail API (via OAuth accessToken)     │
└─────────────────────────────────────────────────┘
```

### Dépendances critiques

1. **blob-store.ts** est le point central de TOUTE la persistance. Si Redis tombe, tout tombe.
2. **api-guard.ts** dépend de **permissions.ts** qui dépend de **Redis** — si Redis est lent, chaque appel API est ralenti.
3. **openai.ts** importe dynamiquement `azure-ai.ts` (`await import(...)`) — couplage indirect.
4. Toutes les `*-store.ts` dépendent de `blob-store.ts` (readBlob, writeBlob, withLock).
5. **auth.ts** est le point d'entrée unique de toute l'authentification — single point of failure.

---

## 7. Fichiers à lire en priorité (Top 10)

| # | Fichier | Raison | Taille |
|---|---------|--------|--------|
| 1 | `src/lib/blob-store.ts` | **Cœur de la persistance** — comprendre comment toute la data est stockée, le mutex, le safety check | 343 lignes |
| 2 | `src/lib/permissions.ts` | **Système RBAC complet** — ViewKey, PermissionLevel, admin detection, Redis storage | 169 lignes |
| 3 | `src/lib/api-guard.ts` | **Sécurité API** — requireAuth, requireAdmin, comment chaque route est protégée | 104 lignes |
| 4 | `src/middleware.ts` | **Point d'entrée auth** — quelles routes sont publiques vs protégées | 44 lignes |
| 5 | `src/lib/auth.ts` | **Config OAuth** — scopes Google, callbacks JWT/session, domain restriction | 52 lignes |
| 6 | `src/lib/smartlead.ts` | **Intégration email outbound** — toutes les opérations campagnes/leads/séquences | 369 lignes |
| 7 | `src/app/sequences/page.tsx` | **Page la plus complexe** — wizard 4 étapes, état massif, AI rewrite, preview | ~2000 lignes |
| 8 | `src/lib/azure-ai.ts` | **Moteur IA** — deux modèles, deux patterns d'appel | 80 lignes |
| 9 | `src/lib/config.ts` | **Config métier** — pipelines, stages, domaines autorisés, emails whitelist | 91 lignes |
| 10 | `src/lib/import-store.ts` | **Pattern store** — représentatif de comment toutes les stores fonctionnent | 213 lignes |

---

## 8. Zones floues et couplages dangereux

### 8.1 RISQUES CRITIQUES

#### R1 — God Components (couplage vertical extrême)
- **`sequences/page.tsx`** (~2000 lignes) : contient TOUT dans un seul fichier — UI, state, logique métier, appels API, helpers, types. C'est le plus gros risque de maintenabilité du projet.
- **`LinkedInGenerator.tsx`** (74KB / ~2000+ lignes) : même problème.
- **`ImportTab.tsx`** (65KB) : idem.
- **Impact** : toute modification risque des régressions, le fichier est quasi impossible à review.

#### R2 — Pas de tests
- **Aucun test unitaire, d'intégration, ni e2e** n'a été identifié dans le projet.
- **Impact** : chaque modification est un risque — aucune régression détectable automatiquement.

#### R3 — Redis comme base de données unique
- Toute la data CRM est dans Upstash Redis sous forme de JSON arrays.
- Pattern `readAll → filter → find` pour chaque query (O(n) systématique).
- **Impact** : ne scale pas au-delà de quelques milliers d'entrées par collection. Pas de requêtes indexées.

#### R4 — Mutex in-memory uniquement
- `withLock` dans `blob-store.ts` utilise une `Map<string, Promise>` locale.
- **Impact** : ne protège PAS contre les race conditions entre instances Vercel serverless (chaque cold start a sa propre Map). Risque de data loss sous charge concurrente.

### 8.2 RISQUES ÉLEVÉS

#### R5 — `requireAuth("sequences" as never, ...)`
- Les routes séquences utilisent `"sequences" as never` car `"sequences"` n'était pas dans le type `ViewKey` original. Le cast `as never` bypasse la vérification TypeScript.
- **Impact** : si le type évolue, le compilateur ne signalera pas les incohérences.

#### R6 — Aucune validation de payload côté API
- Les routes API font `const body = await request.json()` puis `const { action } = body as { action: string }` — cast direct sans validation (pas de Zod, ajv, etc.).
- **Impact** : injection de données malformées possible, erreurs runtime au lieu de 400 propres.

#### R7 — Google OAuth accessToken exposé dans la session
- Le `accessToken` Google est stocké dans le token JWT NextAuth et passé à la session.
- Il est utilisé directement dans les routes Gmail pour appeler l'API Google.
- **Impact** : si le token JWT est compromis, l'accès Gmail complet est exposé. Le token n'est pas refreshé (pas de refresh token rotation active).

#### R8 — `BLOB_READ_WRITE_TOKEN` potentiellement obsolète
- `.env.example` référence `BLOB_READ_WRITE_TOKEN` (Vercel Blob) mais la data a migré vers Redis KV.
- Les fonctions `readBlob`/`writeBlob` dans `blob-store.ts` sont en réalité des wrappers Redis (backward compat).
- **Impact** : confusion sur la source de vérité. Le token Blob est-il encore utilisé quelque part ?

### 8.3 RISQUES MODÉRÉS

#### R9 — Fichiers temporaires dans la racine du projet
- `_tmp_retail-luxe_louisvuitton_fr_index.html`, `_tmp_retail-premium_lacoste_uk_index.html`, `_tmp_template.html`, `_tmp_variables.json` — fichiers temporaires non nettoyés.
- **Impact** : pollution du repo, potentielle exposition de données si pushés.

#### R10 — `config.ts` hardcode les IDs Pipedrive
- Les pipeline IDs et stage IDs sont hardcodés (`id: 1`, `id: 12`, etc.).
- **Impact** : si les IDs changent côté Pipedrive, il faut modifier le code source.

#### R11 — Pas de rate limiting sur les API routes
- Aucun mécanisme de rate limiting n'est en place.
- **Impact** : un utilisateur authentifié peut spammer les routes IA (coûteuses) ou les routes Smartlead.

#### R12 — `openai.ts` importe `azure-ai.ts` dynamiquement
- `const { askAzureFast } = await import("@/lib/azure-ai")` — import dynamique au lieu de static.
- **Impact** : pas de tree-shaking, overhead à chaque appel, difficulté de tracking des dépendances.

#### R13 — Couplage landing.ts (19KB)
- `landing.ts` contient toute la logique de génération HTML + FTP upload dans un seul fichier.
- **Impact** : difficile à maintenir, mélange génération de contenu et déploiement.

#### R14 — Backup route sans restriction admin
- `/api/backup` utilise `requireAuth(null, "GET")` — tout utilisateur authentifié peut télécharger toutes les données.
- **Impact** : fuite de données possible pour les utilisateurs non-admin (@metagora.tech).

---

## 9. Questions ouvertes

1. **Quid de la migration Vercel Blob → Redis ?** Le code `blob-store.ts` est nommé "blob" mais utilise Redis. Le `BLOB_READ_WRITE_TOKEN` est-il encore nécessaire ? Y a-t-il encore des données dans Vercel Blob ?

2. **Pourquoi pas de refresh token rotation ?** Le Google OAuth `accessToken` est stocké dans le JWT mais expire (~1h). Que se passe-t-il quand il expire ? Les routes Gmail retournent 401 — l'utilisateur doit se reconnecter.

3. **Quelle est la stratégie de backup ?** La route `/api/backup` existe mais n'est pas automatisée. Y a-t-il des backups réguliers de Redis ?

4. **Les fichiers `_tmp_*` sont-ils dans `.gitignore` ?** Ils ne devraient pas être dans le repo.

5. **Pourquoi `sequences` utilise `as never` ?** Le ViewKey devrait être mis à jour pour inclure `"sequences"` nativement.

6. **Scalabilité Redis** : avec le pattern `readAll + filter`, quelle est la limite pratique ? À combien de deals/prospects la performance se dégrade ?

7. **Les mails "étranges" sur tony@metagora.tech** : est-ce lié au warmup Smartlead qui envoie des emails de test entre comptes, ou à une vraie fuite ? Le warmup Smartlead est conçu pour envoyer/recevoir des emails automatiques pour améliorer la réputation — ce sont probablement ces mails.

8. **Tests** : quelle stratégie de test adopter en priorité ? (API routes critiques ? e2e sur le wizard séquences ?)

9. **Monitoring** : y a-t-il des alertes en place sur Vercel/Redis pour détecter les erreurs ou les pics d'utilisation ?

10. **RGPD** : les données prospects (emails, téléphones, entreprises) sont stockées dans Redis US (Upstash). Y a-t-il une conformité RGPD documentée ?

---

## 10. Recommandations prioritaires

| Priorité | Action | Effort |
|----------|--------|--------|
| P0 | **Restreindre `/api/backup` à admin-only** (`requireAdmin()` au lieu de `requireAuth(null)`) | 1 ligne |
| P0 | **Fixer le cast `as never`** sur les routes sequences — ajouter `"sequences"` au type ViewKey correctement | 5 min |
| P1 | **Découper `sequences/page.tsx`** en sous-composants (WizardStep1, WizardStep2, etc.) | 2-3h |
| P1 | **Ajouter validation Zod** sur les payloads API critiques (sequences, prospects) | 2h |
| P1 | **Nettoyer les fichiers `_tmp_*`** + les ajouter à `.gitignore` | 5 min |
| P2 | **Implémenter le refresh token** Google OAuth pour éviter les expirations | 1h |
| P2 | **Ajouter des tests** sur les routes API critiques (au minimum blob-store, api-guard) | 4h |
| P2 | **Rate limiting** sur les routes IA (Azure OpenAI) et email (Smartlead) | 1h |
| P3 | **Migrer vers une vraie DB** si le volume de données dépasse 1000 entrées/collection | Gros chantier |
| P3 | **Monitoring/alertes** Vercel + Upstash | 1h config |

---

*Généré le 21/03/2026 — Audit Cascade pour Metagora*
