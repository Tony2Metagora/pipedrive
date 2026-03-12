/**
 * Landing page generator utilities.
 *
 * - Fetches template + variables.json from GitHub (Tony2Metagora/landing-workflows)
 * - Caches them in-memory with a TTL
 * - Computes all ~100 template variables from user input + variables.json
 * - Replaces {{VAR}} placeholders in the HTML template
 */

import { Octokit } from "octokit";
import { Client } from "basic-ftp";
import { Readable } from "stream";

const GITHUB_REPO = process.env.GITHUB_REPO || "Tony2Metagora/landing-workflows";
const GITHUB_BRANCH = "master";
const TEMPLATE_PATH = "_templates/landing-template.html";
const VARIABLES_PATH = "_templates/variables.json";

// ─── In-memory cache with 10 min TTL ─────────────────────

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 min
let templateCache: CacheEntry<string> | null = null;
let variablesCache: CacheEntry<VariablesJson> | null = null;

function getOctokit() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN manquant — ajoutez-le dans .env.local et redémarrez le serveur");
  }
  return new Octokit({ auth: token });
}

async function fetchFileFromGitHub(path: string): Promise<string> {
  const octokit = getOctokit();
  const [owner, repo] = GITHUB_REPO.split("/");
  const res = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: GITHUB_BRANCH,
  });
  const data = res.data as { content?: string; encoding?: string };
  if (!data.content) throw new Error(`No content for ${path}`);
  return Buffer.from(data.content, data.encoding as BufferEncoding || "base64").toString("utf-8");
}

export async function getTemplate(): Promise<string> {
  if (templateCache && Date.now() - templateCache.fetchedAt < CACHE_TTL) {
    return templateCache.data;
  }
  const html = await fetchFileFromGitHub(TEMPLATE_PATH);
  templateCache = { data: html, fetchedAt: Date.now() };
  return html;
}

export async function getVariables(): Promise<VariablesJson> {
  if (variablesCache && Date.now() - variablesCache.fetchedAt < CACHE_TTL) {
    return variablesCache.data;
  }
  const raw = await fetchFileFromGitHub(VARIABLES_PATH);
  const parsed = JSON.parse(raw) as VariablesJson;
  variablesCache = { data: parsed, fetchedAt: Date.now() };
  return parsed;
}

// ─── Types ────────────────────────────────────────────────

export interface VariablesJson {
  meta: { description: string; version: string; template: string };
  brandTypes: Record<string, {
    label: string;
    examples: string[];
    keywords: Record<string, string>;
    basePath: string;
  }>;
  languages: Record<string, LanguageConfig>;
  stores: Record<string, { city: string; country: string; flagEmoji: string }>;
  brands: Record<string, {
    name: string;
    type: string;
    stores: Record<string, { name: string; address: string; image: string }>;
  }>;
}

export interface LanguageConfig {
  code: string;
  label: string;
  nav: Record<string, string>;
  hero: Record<string, string>;
  stats: Record<string, string>;
  logos: Record<string, string>;
  sections: Record<string, unknown>;
  form: Record<string, string>;
  testimonial: Record<string, string>;
  store: Record<string, string>;
  footer: Record<string, string>;
}

export interface GenerateInput {
  brandSlug: string;
  brandName: string;
  brandType: "luxe" | "premium";
  language: string;
  urlCode?: string;
  store: {
    name: string;
    address: string;
    city: string;
    image: string;
  };
}

// ─── Compute all template variables ──────────────────────

export function computeVariables(
  input: GenerateInput,
  lang: LanguageConfig,
  keywords: Record<string, string>
): Record<string, string> {
  const assetsPath = "../../assets/images";
  const headerBrandText = lang.code === "fr" ? `Pour ${input.brandName}` : `For ${input.brandName}`;

  // Helper to replace {{clientType}} and {{storeType}} in text
  const kw = (text: string): string => {
    let result = text;
    for (const [key, val] of Object.entries(keywords)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
    }
    return result;
  };

  const s = lang.sections as Record<string, Record<string, unknown>>;

  const vars: Record<string, string> = {
    LANG_CODE: lang.code,
    BRAND_NAME: input.brandName,
    HEADER_BRAND_TEXT: headerBrandText,
    ASSETS_PATH: assetsPath,

    // Nav
    NAV_SOLUTION: lang.nav.solution,
    NAV_PROCESS: lang.nav.process,
    NAV_FEATURES: lang.nav.features,
    NAV_PRICING: lang.nav.pricing,
    NAV_CTA: lang.nav.cta,

    // Hero
    HERO_BADGE: kw(lang.hero.badge),
    HERO_TITLE: kw(lang.hero.title),
    HERO_DESC: kw(lang.hero.desc),
    HERO_CTA_PRIMARY: lang.hero.ctaPrimary,
    HERO_CTA_SECONDARY: lang.hero.ctaSecondary,
    HERO_META: lang.hero.meta,

    // Stats
    STAT_CLOSING: lang.stats.closing,
    STAT_ENGAGEMENT: lang.stats.engagement,
    STAT_SESSION: lang.stats.session,

    // Logos
    LOGOS_LABEL: lang.logos.label,

    // Solution section
    SECTION_SOLUTION_LABEL: (s.solution as Record<string, string>).label,
    SECTION_SOLUTION_TITLE: kw((s.solution as Record<string, string>).title),
    SECTION_SOLUTION_DESC: kw((s.solution as Record<string, string>).desc),

    // Features in solution (first 3 from features.items)
    FEATURE_1_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[0]?.title || "",
    FEATURE_1_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[0]?.desc || "",
    FEATURE_2_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[1]?.title || "",
    FEATURE_2_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[1]?.desc || "",
    FEATURE_3_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[2]?.title || "",
    FEATURE_3_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[2]?.desc || "",

    // Problem section
    SECTION_PROBLEM_LABEL: (s.problem as Record<string, string>).label,
    SECTION_PROBLEM_TITLE: kw((s.problem as Record<string, string>).title),
    SECTION_PROBLEM_DESC: kw((s.problem as Record<string, string>).desc),
    PROBLEM_1: kw(((s.problem as Record<string, unknown>).items as string[])[0] || ""),
    PROBLEM_2: kw(((s.problem as Record<string, unknown>).items as string[])[1] || ""),
    PROBLEM_3: kw(((s.problem as Record<string, unknown>).items as string[])[2] || ""),
    PROBLEM_4: kw(((s.problem as Record<string, unknown>).items as string[])[3] || ""),

    // Results section
    SECTION_RESULTS_LABEL: (s.results as Record<string, string>).label,
    SECTION_RESULTS_TITLE: kw((s.results as Record<string, string>).title),
    SECTION_RESULTS_DESC: kw((s.results as Record<string, string>).desc),
    RESULT_1: kw(((s.results as Record<string, unknown>).items as string[])[0] || ""),
    RESULT_2: kw(((s.results as Record<string, unknown>).items as string[])[1] || ""),
    RESULT_3: kw(((s.results as Record<string, unknown>).items as string[])[2] || ""),

    // Process section
    SECTION_PROCESS_LABEL: (s.process as Record<string, string>).label,
    SECTION_PROCESS_TITLE: kw((s.process as Record<string, string>).title),
    SECTION_PROCESS_DESC: kw((s.process as Record<string, string>).desc),
    STEP_1_TITLE: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[0]?.title || "",
    STEP_1_DESC: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[0]?.desc || "",
    STEP_2_TITLE: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[1]?.title || "",
    STEP_2_DESC: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[1]?.desc || "",
    STEP_3_TITLE: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[2]?.title || "",
    STEP_3_DESC: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[2]?.desc || "",
    STEP_4_TITLE: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[3]?.title || "",
    STEP_4_DESC: ((s.process as Record<string, unknown>).steps as { title: string; desc: string }[])[3]?.desc || "",

    // Comparison section
    SECTION_COMPARISON_LABEL: (s.comparison as Record<string, string>).label,
    SECTION_COMPARISON_TITLE: kw((s.comparison as Record<string, string>).title),
    BEFORE_TITLE: ((s.comparison as Record<string, unknown>).before as Record<string, string>).title,
    BEFORE_1: (((s.comparison as Record<string, unknown>).before as Record<string, unknown>).items as string[])[0] || "",
    BEFORE_2: (((s.comparison as Record<string, unknown>).before as Record<string, unknown>).items as string[])[1] || "",
    BEFORE_3: (((s.comparison as Record<string, unknown>).before as Record<string, unknown>).items as string[])[2] || "",
    BEFORE_4: (((s.comparison as Record<string, unknown>).before as Record<string, unknown>).items as string[])[3] || "",
    AFTER_TITLE: ((s.comparison as Record<string, unknown>).after as Record<string, string>).title,
    AFTER_1: (((s.comparison as Record<string, unknown>).after as Record<string, unknown>).items as string[])[0] || "",
    AFTER_2: (((s.comparison as Record<string, unknown>).after as Record<string, unknown>).items as string[])[1] || "",
    AFTER_3: (((s.comparison as Record<string, unknown>).after as Record<string, unknown>).items as string[])[2] || "",
    AFTER_4: (((s.comparison as Record<string, unknown>).after as Record<string, unknown>).items as string[])[3] || "",

    // Video section
    SECTION_VIDEO_LABEL: (s.video as Record<string, string>).label,
    SECTION_VIDEO_TITLE: kw((s.video as Record<string, string>).title),
    SECTION_VIDEO_DESC: kw((s.video as Record<string, string>).desc),

    // Deploy section
    SECTION_DEPLOY_LABEL: (s.deploy as Record<string, string>).label,
    SECTION_DEPLOY_TITLE: kw((s.deploy as Record<string, string>).title),
    SECTION_DEPLOY_DESC: kw((s.deploy as Record<string, string>).desc),
    DEPLOY_1: ((s.deploy as Record<string, unknown>).items as string[])[0] || "",
    DEPLOY_2: ((s.deploy as Record<string, unknown>).items as string[])[1] || "",
    DEPLOY_3: ((s.deploy as Record<string, unknown>).items as string[])[2] || "",
    DEPLOY_4: ((s.deploy as Record<string, unknown>).items as string[])[3] || "",

    // Store / Boutique section
    STORE_NAME: input.store.name,
    STORE_ADDRESS: input.store.address,
    STORE_IMAGE: `${assetsPath}/${input.store.image}`,
    STORE_HEADLINE: kw(lang.store.headline).replace("{{storeAddress}}", input.store.address),
    STORE_SUBHEADLINE: kw(lang.store.subheadline),
    KPI_1_LABEL: kw(lang.store.kpi1),
    KPI_2_LABEL: kw(lang.store.kpi2),
    STORE_HOOK: kw(lang.store.hook),
    STORE_CTA: kw(lang.store.cta),

    // Pilot section
    SECTION_PILOT_LABEL: (s.pilot as Record<string, string>).label,
    SECTION_PILOT_TITLE: kw((s.pilot as Record<string, string>).title),
    SECTION_PILOT_DESC: kw((s.pilot as Record<string, string>).desc),
    PILOT_1: ((s.pilot as Record<string, unknown>).items as string[])[0] || "",
    PILOT_2: ((s.pilot as Record<string, unknown>).items as string[])[1] || "",
    PILOT_3: ((s.pilot as Record<string, unknown>).items as string[])[2] || "",
    PILOT_4: ((s.pilot as Record<string, unknown>).items as string[])[3] || "",
    PILOT_TAGLINE: (s.pilot as Record<string, string>).tagline,

    // Testimonial
    TESTIMONIAL_QUOTE: kw(lang.testimonial.quote),
    TESTIMONIAL_INITIALS: lang.testimonial.initials,
    TESTIMONIAL_ROLE: lang.testimonial.role,
    TESTIMONIAL_COMPANY: lang.testimonial.company,

    // Audience / Personas
    SECTION_AUDIENCE_LABEL: (s.audience as Record<string, string>).label,
    SECTION_AUDIENCE_TITLE: kw((s.audience as Record<string, string>).title),
    PERSONA_1_TITLE: ((s.audience as Record<string, unknown>).personas as { title: string; desc: string }[])[0]?.title || "",
    PERSONA_1_DESC: ((s.audience as Record<string, unknown>).personas as { title: string; desc: string }[])[0]?.desc || "",
    PERSONA_2_TITLE: ((s.audience as Record<string, unknown>).personas as { title: string; desc: string }[])[1]?.title || "",
    PERSONA_2_DESC: ((s.audience as Record<string, unknown>).personas as { title: string; desc: string }[])[1]?.desc || "",
    PERSONA_3_TITLE: ((s.audience as Record<string, unknown>).personas as { title: string; desc: string }[])[2]?.title || "",
    PERSONA_3_DESC: ((s.audience as Record<string, unknown>).personas as { title: string; desc: string }[])[2]?.desc || "",

    // Features section
    SECTION_FEATURES_LABEL: (s.features as Record<string, string>).label,
    SECTION_FEATURES_TITLE: kw((s.features as Record<string, string>).title),
    SECTION_FEATURES_DESC: kw((s.features as Record<string, string>).desc),
    FEAT_1_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[0]?.title || "",
    FEAT_1_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[0]?.desc || "",
    FEAT_2_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[1]?.title || "",
    FEAT_2_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[1]?.desc || "",
    FEAT_3_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[2]?.title || "",
    FEAT_3_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[2]?.desc || "",
    FEAT_4_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[3]?.title || "",
    FEAT_4_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[3]?.desc || "",
    FEAT_5_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[4]?.title || "",
    FEAT_5_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[4]?.desc || "",
    FEAT_6_TITLE: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[5]?.title || "",
    FEAT_6_DESC: ((s.features as Record<string, unknown>).items as { title: string; desc: string }[])[5]?.desc || "",

    // Pricing
    SECTION_PRICING_LABEL: (s.pricing as Record<string, string>).label,
    SECTION_PRICING_TITLE: kw((s.pricing as Record<string, string>).title),
    PRICING_BADGE: keywords.pricingBadge || "",
    PRICING_SUBTITLE: (s.pricing as Record<string, string>).subtitle,
    PRICING_PRICE: (s.pricing as Record<string, string>).price,
    PRICING_NOTE: (s.pricing as Record<string, string>).note,
    PRICING_FEAT_1: ((s.pricing as Record<string, unknown>).features as string[])[0] || "",
    PRICING_FEAT_2: ((s.pricing as Record<string, unknown>).features as string[])[1] || "",
    PRICING_FEAT_3: ((s.pricing as Record<string, unknown>).features as string[])[2] || "",
    PRICING_FEAT_4: ((s.pricing as Record<string, unknown>).features as string[])[3] || "",
    PRICING_FEAT_5: ((s.pricing as Record<string, unknown>).features as string[])[4] || "",
    PRICING_CTA: (s.pricing as Record<string, string>).cta,

    // Partners
    SECTION_PARTNERS_LABEL: (s.partners as Record<string, string>).label,
    SECTION_PARTNERS_TITLE: kw((s.partners as Record<string, string>).title),

    // Contact
    SECTION_CONTACT_LABEL: (s.contact as Record<string, string>).label,
    SECTION_CONTACT_TITLE: kw((s.contact as Record<string, string>).title),
    SECTION_CONTACT_DESC: kw((s.contact as Record<string, string>).desc),

    // Form
    FORM_TITLE: lang.form.title,
    FORM_NAME_LABEL: lang.form.nameLabel,
    FORM_NAME_PLACEHOLDER: lang.form.namePlaceholder,
    FORM_EMAIL_LABEL: lang.form.emailLabel,
    FORM_EMAIL_PLACEHOLDER: lang.form.emailPlaceholder,
    FORM_COMPANY_LABEL: lang.form.companyLabel,
    FORM_COMPANY_PLACEHOLDER: lang.form.companyPlaceholder,
    FORM_SUBMIT: lang.form.submit,

    // Footer
    FOOTER_RIGHTS: lang.footer.rights,
  };

  return vars;
}

// ─── Replace all {{VAR}} in template ─────────────────────

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let html = template;
  for (const [key, val] of Object.entries(vars)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
  }
  return html;
}

// ─── FTP upload to Hostinger ─────────────────────────────

function getFtpConfig() {
  const host = process.env.FTP_HOST || "metagora-tech.fr";
  const user = process.env.FTP_USER || "u222173711";
  const password = process.env.FTP_PASSWORD;
  if (!password) throw new Error("FTP_PASSWORD manquant — ajoutez-le dans .env.local / Vercel");
  return { host, user, password, secure: false };
}

export async function uploadToFtp(
  remotePath: string,
  content: string | Buffer
): Promise<void> {
  const config = getFtpConfig();
  const client = new Client();
  client.ftp.verbose = false;
  try {
    await client.access(config);
    // Ensure remote directory exists
    const dir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    await client.ensureDir("/public_html/" + dir);
    // Upload
    const buf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const stream = Readable.from(buf);
    await client.uploadFrom(stream, "/public_html/" + remotePath);
  } finally {
    client.close();
  }
}

// ─── Push file to GitHub ─────────────────────────────────

export async function pushToGitHub(
  filePath: string,
  content: string,
  commitMessage: string
): Promise<{ sha: string; url: string }> {
  const octokit = getOctokit();
  const [owner, repo] = GITHUB_REPO.split("/");

  // Check if file already exists (to get its SHA for update)
  let existingSha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: GITHUB_BRANCH,
    });
    existingSha = (existing.data as { sha: string }).sha;
  } catch {
    // File doesn't exist yet — that's fine
  }

  const res = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: GITHUB_BRANCH,
    ...(existingSha ? { sha: existingSha } : {}),
  });

  return {
    sha: (res.data.content as { sha: string })?.sha || "",
    url: `https://metagora-tech.fr/${filePath.replace("/index.html", "/")}`,
  };
}
