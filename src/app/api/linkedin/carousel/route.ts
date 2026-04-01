import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { askAzureFast } from "@/lib/azure-ai";

type CarouselDraft = {
  title: string;
  slides: string[];
  cta: string;
};

function parseJsonSafe<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

async function generateCarouselDrafts(prompt: string, count: number): Promise<CarouselDraft[]> {
  const capped = Math.max(1, Math.min(5, count));
  const raw = await askAzureFast(
    [
      {
        role: "system",
        content:
          "Tu es un copywriter LinkedIn expert en carrousels. Réponds uniquement en JSON valide, sans markdown.",
      },
      {
        role: "user",
        content: `Génère ${capped} carrousel(s) LinkedIn en français à partir de ce brief:
"${prompt}"

Contraintes:
- 7 slides par carrousel
- Slide 1 = hook très fort
- Slides 2-6 = idées concrètes, 1 idée par slide
- Slide 7 = CTA
- Ton direct, simple, actionnable
- 12 à 24 mots max par slide

Format JSON attendu:
{
  "drafts": [
    {
      "title": "titre court",
      "slides": ["slide1", "slide2", "slide3", "slide4", "slide5", "slide6", "slide7"],
      "cta": "cta final"
    }
  ]
}`,
      },
    ],
    2200
  );

  const parsed = parseJsonSafe<{ drafts?: CarouselDraft[] }>(raw, { drafts: [] });
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
  return drafts
    .map((d) => ({
      title: String(d.title || "").trim(),
      slides: Array.isArray(d.slides)
        ? d.slides.slice(0, 7).map((s) => String(s || "").trim())
        : [],
      cta: String(d.cta || "").trim(),
    }))
    .filter((d) => d.title && d.slides.length > 0);
}

function canvaHeaders() {
  const key = process.env.CANVA_API_KEY || "";
  if (!key) throw new Error("CANVA_API_KEY manquant");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

async function callCanvaAutofill(templateDesignId: string, draft: CarouselDraft, exportFormat: "pdf" | "png") {
  const base = (process.env.CANVA_API_BASE || "https://api.canva.com").replace(/\/+$/, "");
  const autofillPath = process.env.CANVA_AUTOFILL_PATH || "/rest/v1/autofills";
  const exportPath = process.env.CANVA_EXPORT_PATH || "/rest/v1/exports";

  const fields: Record<string, string> = {
    carousel_title: draft.title,
    slide_1: draft.slides[0] || "",
    slide_2: draft.slides[1] || "",
    slide_3: draft.slides[2] || "",
    slide_4: draft.slides[3] || "",
    slide_5: draft.slides[4] || "",
    slide_6: draft.slides[5] || "",
    slide_7: draft.slides[6] || "",
    cta: draft.cta || draft.slides[6] || "",
  };

  const autofillBody = {
    template: { design_id: templateDesignId },
    data: fields,
    export: { format: exportFormat },
  };

  const autofillRes = await fetch(`${base}${autofillPath}`, {
    method: "POST",
    headers: canvaHeaders(),
    body: JSON.stringify(autofillBody),
  });

  const autofillText = await autofillRes.text();
  const autofillJson = parseJsonSafe<Record<string, unknown>>(autofillText, {});
  if (!autofillRes.ok) {
    throw new Error(`Canva autofill ${autofillRes.status}: ${autofillText.slice(0, 220)}`);
  }

  const autofillId =
    String(
      autofillJson.id ||
        autofillJson.autofill_id ||
        (autofillJson.job as Record<string, unknown> | undefined)?.id ||
        ""
    ) || undefined;
  let exportUrl =
    String(
      autofillJson.export_url ||
        autofillJson.download_url ||
        (autofillJson.export as Record<string, unknown> | undefined)?.url ||
        ""
    ) || "";
  const editUrl =
    String(autofillJson.edit_url || autofillJson.design_url || autofillJson.url || "") || "";

  if (!exportUrl && autofillId) {
    const exportBody = { autofill_id: autofillId, format: exportFormat };
    const exportRes = await fetch(`${base}${exportPath}`, {
      method: "POST",
      headers: canvaHeaders(),
      body: JSON.stringify(exportBody),
    });
    const exportText = await exportRes.text();
    const exportJson = parseJsonSafe<Record<string, unknown>>(exportText, {});
    if (exportRes.ok) {
      exportUrl =
        String(
          exportJson.url ||
            exportJson.download_url ||
            (exportJson.file as Record<string, unknown> | undefined)?.url ||
            ""
        ) || "";
    }
  }

  return {
    autofillId: autofillId || null,
    editUrl: editUrl || null,
    exportUrl: exportUrl || null,
    raw: autofillJson,
  };
}

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = (await request.json()) as {
      action?: "generate-drafts" | "build-canva";
      prompt?: string;
      count?: number;
      templateDesignId?: string;
      drafts?: CarouselDraft[];
      exportFormat?: "pdf" | "png";
    };

    if (body.action === "generate-drafts") {
      if (!body.prompt?.trim()) {
        return NextResponse.json({ error: "Prompt requis" }, { status: 400 });
      }
      const drafts = await generateCarouselDrafts(body.prompt, body.count || 1);
      return NextResponse.json({ data: { drafts } });
    }

    if (body.action === "build-canva") {
      const templateDesignId = (body.templateDesignId || "").trim();
      const drafts = Array.isArray(body.drafts) ? body.drafts : [];
      const exportFormat = body.exportFormat === "png" ? "png" : "pdf";
      if (!templateDesignId) {
        return NextResponse.json({ error: "templateDesignId requis" }, { status: 400 });
      }
      if (drafts.length === 0) {
        return NextResponse.json({ error: "drafts[] requis" }, { status: 400 });
      }

      const results: Array<{
        index: number;
        title: string;
        ok: boolean;
        autofillId?: string | null;
        editUrl?: string | null;
        exportUrl?: string | null;
        error?: string;
      }> = [];

      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i]!;
        try {
          const out = await callCanvaAutofill(templateDesignId, draft, exportFormat);
          results.push({
            index: i,
            title: draft.title,
            ok: true,
            autofillId: out.autofillId,
            editUrl: out.editUrl,
            exportUrl: out.exportUrl,
          });
        } catch (error) {
          results.push({
            index: i,
            title: draft.title,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return NextResponse.json({
        data: {
          total: drafts.length,
          success: results.filter((r) => r.ok).length,
          failed: results.filter((r) => !r.ok).length,
          results,
        },
      });
    }

    return NextResponse.json({ error: "Action invalide" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/linkedin/carousel error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}

