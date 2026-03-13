/**
 * API Route — Landing page preview
 * POST: returns rendered HTML for iframe preview + metadata
 */

import { NextResponse } from "next/server";
import { getTemplate, getVariables, computeVariables, renderTemplate, type GenerateInput } from "@/lib/landing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { storeImageOriginalUrl, ...inputFields } = await request.json();
    const input = inputFields as GenerateInput;

    if (!input.brandName || !input.brandType || !input.language) {
      return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
    }

    const [template, variables] = await Promise.all([getTemplate(true), getVariables()]);

    const lang = variables.languages[input.language];
    if (!lang) {
      return NextResponse.json({ error: `Langue "${input.language}" non trouvée` }, { status: 400 });
    }

    const brandTypeConfig = variables.brandTypes[input.brandType];
    if (!brandTypeConfig) {
      return NextResponse.json({ error: `Type "${input.brandType}" non trouvé` }, { status: 400 });
    }

    const vars = computeVariables(input, lang, brandTypeConfig.keywords);
    let html = renderTemplate(template, vars);
    const basePath = brandTypeConfig.basePath;

    // For preview: replace relative asset paths with absolute URLs so images load in iframe
    // Assets (logos, illustrations, hero) are always in retail-luxe regardless of brandType
    const absoluteAssetsBase = `https://metagora-tech.fr/retail-luxe/assets/images`;
    html = html.replace(/\.\.\/\.\.\/assets\/images/g, absoluteAssetsBase);

    // If original store image URL provided, replace the repo path with it (image may not be synced yet)
    if (storeImageOriginalUrl && input.store?.image) {
      const repoImageUrl = `${absoluteAssetsBase}/${input.store.image}`;
      html = html.split(repoImageUrl).join(storeImageOriginalUrl);
    }
    const pathCode = input.urlCode || input.language;
    const outputPath = `${basePath}/${input.brandSlug}/${pathCode}/index.html`;
    const publicUrl = `https://metagora-tech.fr/${basePath}/${input.brandSlug}/${pathCode}/`;

    return NextResponse.json({
      html,
      variables: vars,
      outputPath,
      publicUrl,
      variableCount: Object.keys(vars).length,
    });
  } catch (error) {
    console.error("POST /api/landing/preview error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
