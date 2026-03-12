/**
 * API Route — Landing page preview
 * POST: returns computed variables without generating/pushing
 */

import { NextResponse } from "next/server";
import { getVariables, computeVariables, type GenerateInput } from "@/lib/landing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as GenerateInput;

    if (!input.brandName || !input.brandType || !input.language) {
      return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
    }

    const variables = await getVariables();
    const lang = variables.languages[input.language];
    if (!lang) {
      return NextResponse.json({ error: `Langue "${input.language}" non trouvée` }, { status: 400 });
    }

    const brandTypeConfig = variables.brandTypes[input.brandType];
    if (!brandTypeConfig) {
      return NextResponse.json({ error: `Type "${input.brandType}" non trouvé` }, { status: 400 });
    }

    const vars = computeVariables(input, lang, brandTypeConfig.keywords);
    const basePath = brandTypeConfig.basePath;
    const outputPath = `${basePath}/${input.brandSlug}/${input.language}/index.html`;
    const publicUrl = `https://metagora-tech.fr/${basePath}/${input.brandSlug}/${input.language}/`;

    return NextResponse.json({
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
