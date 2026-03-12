/**
 * API Route — Landing page generation + GitHub push
 * POST: generates HTML from template + variables, pushes to GitHub
 */

import { NextResponse } from "next/server";
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

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as GenerateInput;

    if (!input.brandName || !input.brandSlug || !input.brandType || !input.language) {
      return NextResponse.json({ error: "Champs obligatoires manquants (brandName, brandSlug, brandType, language)" }, { status: 400 });
    }
    if (!input.store?.name || !input.store?.address || !input.store?.city) {
      return NextResponse.json({ error: "Informations boutique manquantes (name, address, city)" }, { status: 400 });
    }

    const [template, variables] = await Promise.all([getTemplate(), getVariables()]);

    const lang = variables.languages[input.language];
    if (!lang) {
      return NextResponse.json({ error: `Langue "${input.language}" non disponible` }, { status: 400 });
    }

    const brandTypeConfig = variables.brandTypes[input.brandType];
    if (!brandTypeConfig) {
      return NextResponse.json({ error: `Type "${input.brandType}" non trouvé` }, { status: 400 });
    }

    // Compute variables and render
    const vars = computeVariables(input, lang, brandTypeConfig.keywords);
    const html = renderTemplate(template, vars);

    // Determine output path
    const basePath = brandTypeConfig.basePath;
    const pathCode = input.urlCode || input.language;
    const outputPath = `${basePath}/${input.brandSlug}/${pathCode}/index.html`;
    const commitMessage = `Add landing page: ${input.brandName} (${pathCode})`;

    // Push to GitHub + FTP upload to Hostinger in parallel
    const [result] = await Promise.all([
      pushToGitHub(outputPath, html, commitMessage),
      uploadToFtp(outputPath, html).catch((err) =>
        console.error("FTP upload failed (non-blocking):", err)
      ),
    ]);

    return NextResponse.json({
      success: true,
      outputPath,
      publicUrl: result.url,
      sha: result.sha,
      commitMessage,
      variablesUsed: Object.keys(vars).length,
    });
  } catch (error) {
    console.error("POST /api/landing/generate error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
