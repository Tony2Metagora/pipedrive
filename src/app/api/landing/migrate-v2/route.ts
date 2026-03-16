/**
 * ONE-TIME Migration — Landing page template + variables v2
 * POST /api/landing/migrate-v2
 * 
 * Changes:
 * 1. Footer: replace "Metagora" text with logo image
 * 2. Remove hero badge (coaching IA top banner)
 * 3. Mobile font size increases for multiple sections
 * 4. EN: replace "conseillers" with "advisors"
 * 5. FR luxe: "Client advisors", FR premium: "conseillers" (already correct in keywords)
 * 6. Replace all "— " with ", " in text content
 * 7. Fix blurry Carrefour/Amazon logos (increase opacity + size)
 * 8. Reformat hero desc into 3 lines, remove dash
 * 9. Pricing note: split into two lines
 * 10. Push updated template + variables to GitHub
 * 11. Regenerate Louis Vuitton FR + Lacoste UK live sites
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import {
  getTemplate,
  getVariables,
  computeVariables,
  renderTemplate,
  pushToGitHub,
  uploadToFtp,
  type GenerateInput,
} from "@/lib/landing";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  const guard = await requireAdmin();
  if (guard.denied) return guard.denied;

  const log: string[] = [];

  try {
    // ─── Step 1: Fetch current template + variables from GitHub ───
    const [rawTemplate, rawVariables] = await Promise.all([
      getTemplate(true),
      (async () => {
        // We need the raw JSON string, not parsed
        const { Octokit } = await import("octokit");
        const token = process.env.GITHUB_TOKEN;
        const octokit = new Octokit({ auth: token });
        const [owner, repo] = (process.env.GITHUB_REPO || "Tony2Metagora/landing-workflows").split("/");
        const res = await octokit.rest.repos.getContent({
          owner, repo,
          path: "_templates/variables.json",
          ref: "master",
        });
        const data = res.data as { content?: string; encoding?: string };
        return Buffer.from(data.content!, (data.encoding as BufferEncoding) || "base64").toString("utf-8");
      })(),
    ]);

    let template = rawTemplate;
    let variablesStr = rawVariables;

    // ─── Step 2: Update variables.json ───

    // 2a. Remove hero badge text (set to empty so the badge div still exists but shows nothing)
    // Actually, we'll remove the hero-badge div from template instead
    
    // 2b. FR hero.desc: reformat into 3 lines, remove dash
    // Current: "Des clients virtuels IA pour améliorer l'écoute, la posture et la performance de vos {{clientType}} — sans risque pour l'image de marque."
    // New: "Des clients virtuels IA pour améliorer l'écoute,\nla posture et la performance de vos {{clientType}},\nsans risque pour l'image de marque."
    variablesStr = variablesStr.replace(
      `"desc": "Des clients virtuels IA pour améliorer l'écoute, la posture et la performance de vos {{clientType}} — sans risque pour l'image de marque."`,
      `"desc": "Des clients virtuels IA pour améliorer l'écoute,<br>la posture et la performance de vos {{clientType}},<br>sans risque pour l'image de marque."`
    );
    log.push("FR hero desc: reformatted into 3 lines");

    // 2c. EN hero.desc: reformat into 3 lines, remove dash, replace conseillers with advisors
    // Current: "AI virtual clients to improve listening, posture and performance of your {{clientType}} — with no risk to brand image."
    // New: "AI virtual clients to improve listening,\nposture and performance of your {{clientType}},\nwith no risk to brand image."
    variablesStr = variablesStr.replace(
      `"desc": "AI virtual clients to improve listening, posture and performance of your {{clientType}} — with no risk to brand image."`,
      `"desc": "AI virtual clients to improve listening,<br>posture and performance of your {{clientType}},<br>with no risk to brand image."`
    );
    log.push("EN hero desc: reformatted into 3 lines");

    // 2d. EN premium clientType: "conseillers" stays in variables.json (correct for FR)
    // For EN generation, we override clientType to "advisors" at render time (see Step 5b)

    // 2e. Replace all "— " (em dash + space) with ", " in text content
    
    // FR store.kpi2: has "—"
    variablesStr = variablesStr.replace(
      `"kpi2": "taux de transformation moyen en boutique luxe mode & maroquinerie — Metagora vous fait passer au niveau supérieur"`,
      `"kpi2": "taux de transformation moyen en boutique luxe mode & maroquinerie, Metagora vous fait passer au niveau supérieur"`
    );
    // EN store.kpi2
    variablesStr = variablesStr.replace(
      `"kpi2": "average conversion rate in luxury fashion & leather goods — Metagora takes you to the next level"`,
      `"kpi2": "average conversion rate in luxury fashion & leather goods, Metagora takes you to the next level"`
    );
    log.push("Replaced — with , in store kpi2 (FR + EN)");

    // FR testimonial company
    variablesStr = variablesStr.replace(
      `"company": "Maison de luxe — Réseau Europe"`,
      `"company": "Maison de luxe, Réseau Europe"`
    );
    // EN testimonial company
    variablesStr = variablesStr.replace(
      `"company": "Luxury House — Europe Network"`,
      `"company": "Luxury House, Europe Network"`
    );
    log.push("Replaced — with , in testimonial companies");

    // FR store.hook
    variablesStr = variablesStr.replace(
      `"hook": "3 à 5 points de transfo gagnés pour vos équipes retail — mesurables dès le premier mois."`,
      `"hook": "3 à 5 points de transfo gagnés pour vos équipes retail, mesurables dès le premier mois."`
    );
    // EN store.hook  
    variablesStr = variablesStr.replace(
      `"hook": "3 to 5 conversion points gained for your retail teams — measurable from month one."`,
      `"hook": "3 to 5 conversion points gained for your retail teams, measurable from month one."`
    );
    log.push("Replaced — with , in store hooks");

    // FR pricing.note: split into 2 lines
    variablesStr = variablesStr.replace(
      `"note": "À partir de — Tarif personnalisé selon le réseau"`,
      `"note": "À partir de<br>Tarif personnalisé selon le réseau"`
    );
    // EN pricing.note
    variablesStr = variablesStr.replace(
      `"note": "Starting from — Custom pricing based on network"`,
      `"note": "Starting from<br>Custom pricing based on network"`
    );
    log.push("Pricing note: split into 2 lines, removed —");

    // 2f. Remove hero badge text  
    variablesStr = variablesStr.replace(
      `"badge": "Coaching IA pour le Retail & le Luxe"`,
      `"badge": ""`
    );
    variablesStr = variablesStr.replace(
      `"badge": "AI Coaching for Retail & Luxury"`,
      `"badge": ""`
    );
    log.push("Removed hero badge text (FR + EN)");

    // ─── Step 3: Update template HTML ───

    // 3a. Remove hero-badge div entirely (since badge is empty)
    template = template.replace(
      `        <div class="hero-badge">{{HERO_BADGE}}</div>\n`,
      ``
    );
    log.push("Removed hero-badge div from template");

    // 3b. Footer: replace text "Meta<span>gora</span>" with logo image
    template = template.replace(
      `<div class="footer-logo">Meta<span>gora</span></div>`,
      `<div class="footer-logo"><img src="{{ASSETS_PATH}}/Logo-Metagora-Black.png" alt="Metagora" style="height:28px;width:auto;"></div>`
    );
    log.push("Footer: replaced text with logo image");

    // 3c. Fix blurry Amazon + Carrefour logos — increase opacity and size
    template = template.replace(
      `<img src="{{ASSETS_PATH}}/logo-lvmh.png" alt="LVMH" style="opacity: 0.7;">`,
      `<img src="{{ASSETS_PATH}}/logo-lvmh.png" alt="LVMH" style="opacity: 0.85;">`
    );
    template = template.replace(
      `<img src="{{ASSETS_PATH}}/logo-amazon.png" alt="Amazon">`,
      `<img src="{{ASSETS_PATH}}/logo-amazon.png" alt="Amazon" style="opacity: 0.85; filter: contrast(1.3) saturate(1.2);">`
    );
    template = template.replace(
      `<img src="{{ASSETS_PATH}}/logo-carrefour.png" alt="Carrefour">`,
      `<img src="{{ASSETS_PATH}}/logo-carrefour.png" alt="Carrefour" style="opacity: 0.85; filter: contrast(1.3) saturate(1.2);">`
    );
    log.push("Logos: increased opacity + contrast for Amazon/Carrefour");

    // 3d. Mobile font size increases
    // Find the existing mobile media queries and add/update them
    // We need to add comprehensive mobile overrides

    const mobileCSS = `
    /* ── MOBILE FONT SIZE OVERRIDES ── */
    @media (max-width: 768px) {
      .hero-meta { font-size: 0.88rem; font-weight: 500; }
      .process-step h3 { font-size: 1.1rem; }
      .process-step p { font-size: 0.92rem; }
      .section-label { font-size: 0.85rem; }
      .comparison-card h3 { font-size: 1.15rem; }
      .comparison-list li { font-size: 0.95rem; }
      .benefit-list li { font-size: 1rem; }
      .boutique-address { font-size: 1rem; }
      .kpi-label { font-size: 0.92rem; }
      .kpi-number { font-size: 2rem; }
      .boutique-hook { font-size: 1.05rem; }
      .pilot-list li { font-size: 1.02rem; }
      .pilot-tagline { font-size: 1.2rem; }
      .pricing-price-sub { font-size: 0.92rem; line-height: 1.6; }
      .section-title { font-size: clamp(1.7rem, 4vw, 2.4rem); }
      .section-subtitle { font-size: 1.02rem; }
      .solution-card h4 { font-size: 1rem; }
      .solution-card p { font-size: 0.9rem; }
      .value-stat-label { font-size: 0.92rem; }
      .footer-logo img { height: 24px; }
    }`;

    // Insert before the closing </style> tag
    template = template.replace(
      `  </style>`,
      `${mobileCSS}\n  </style>`
    );
    log.push("Added mobile font size overrides");

    // 3e. Make hero-desc support <br> tags (it's a <p> so br works natively)
    // No change needed for HTML, br tags will render in the p.hero-desc

    // 3f. Make pricing-price-sub support <br> tags
    // Already a <p> tag, br will work

    // ─── Step 4: Push updated files to GitHub ───
    
    const [templateResult, variablesResult] = await Promise.all([
      pushToGitHub("_templates/landing-template.html", template, "Update template: mobile fonts, footer logo, remove badge, fix logos"),
      pushToGitHub("_templates/variables.json", variablesStr, "Update variables: remove badge, fix hero desc, replace dashes, fix pricing"),
    ]);
    log.push(`Template pushed: ${templateResult.sha}`);
    log.push(`Variables pushed: ${variablesResult.sha}`);

    // ─── Step 5: Regenerate live sites ───

    // Parse the updated variables
    const variables = JSON.parse(variablesStr);

    // Wait a bit for GitHub cache to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 5a. Louis Vuitton FR
    const lvInput: GenerateInput = {
      brandSlug: "louisvuitton",
      brandName: "Louis Vuitton",
      brandType: "luxe",
      language: "fr",
      store: {
        name: "Louis Vuitton Maison Champs-Élysées",
        address: "101 avenue des Champs-Élysées, 75008 Paris",
        city: "Paris",
        image: "boutiques/Boutique Louis Vuitton fr.jpg",
      },
    };

    const lvLang = variables.languages.fr;
    const lvKeywords = variables.brandTypes.luxe.keywords;
    const lvVars = computeVariables(lvInput, lvLang, lvKeywords);
    
    // Fix store image URL
    if (lvVars.STORE_IMAGE && lvVars.STORE_IMAGE.includes("../../assets/images/")) {
      const repoPath = lvVars.STORE_IMAGE.replace("../../assets/images/", "");
      lvVars.STORE_IMAGE = `https://raw.githubusercontent.com/Tony2Metagora/landing-workflows/master/retail-luxe/assets/images/${encodeURIComponent(repoPath).replace(/%2F/g, "/")}`;
    }

    const lvHtml = renderTemplate(template, lvVars);
    const lvPath = "retail-luxe/louisvuitton/fr/index.html";
    const [lvResult] = await Promise.all([
      pushToGitHub(lvPath, lvHtml, "Regenerate Louis Vuitton FR with v2 template"),
      uploadToFtp(lvPath, lvHtml).catch(e => log.push(`LV FR FTP error (non-blocking): ${e}`)),
    ]);
    log.push(`Louis Vuitton FR regenerated: ${lvResult.url}`);

    // 5b. Lacoste UK
    const lacInput: GenerateInput = {
      brandSlug: "lacoste",
      brandName: "Lacoste",
      brandType: "premium",
      language: "en",
      urlCode: "uk",
      store: {
        name: "Lacoste Regent Street Flagship",
        address: "182 Regent Street, London W1B 5BT, United Kingdom",
        city: "London",
        image: "boutiques/Boutique Lacoste uk.jpg",
      },
    };

    const lacLang = variables.languages.en;
    const lacKeywords = variables.brandTypes.premium.keywords;
    // Override clientType for English to "advisors" instead of "conseillers"
    const lacKeywordsEN = { ...lacKeywords, clientType: "advisors" };
    const lacVars = computeVariables(lacInput, lacLang, lacKeywordsEN);

    // Fix store image URL  
    if (lacVars.STORE_IMAGE && lacVars.STORE_IMAGE.includes("../../assets/images/")) {
      const repoPath = lacVars.STORE_IMAGE.replace("../../assets/images/", "");
      lacVars.STORE_IMAGE = `https://raw.githubusercontent.com/Tony2Metagora/landing-workflows/master/retail-luxe/assets/images/${encodeURIComponent(repoPath).replace(/%2F/g, "/")}`;
    }

    let lacHtml = renderTemplate(template, lacVars);
    // For premium, fix asset paths
    lacHtml = lacHtml.replace(/\.\.\/\.\.\/assets\/images/g, "https://metagora-tech.fr/retail-luxe/assets/images");

    const lacPath = "retail-premium/lacoste/uk/index.html";
    const [lacResult] = await Promise.all([
      pushToGitHub(lacPath, lacHtml, "Regenerate Lacoste UK with v2 template"),
      uploadToFtp(lacPath, lacHtml).catch(e => log.push(`Lacoste UK FTP error (non-blocking): ${e}`)),
    ]);
    log.push(`Lacoste UK regenerated: ${lacResult.url}`);

    return NextResponse.json({
      success: true,
      log,
      urls: {
        louisVuittonFR: "https://metagora-tech.fr/retail-luxe/louisvuitton/fr/",
        lacosteUK: "https://metagora-tech.fr/retail-premium/lacoste/uk/",
      },
    });

  } catch (error) {
    console.error("Migration v2 error:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      log,
    }, { status: 500 });
  }
}
