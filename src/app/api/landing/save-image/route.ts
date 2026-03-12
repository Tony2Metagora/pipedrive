/**
 * API Route — Save a store image to the landing-workflows GitHub repo
 * POST: accepts base64 image from client, resizes to 1200×900 (4:3 landscape), pushes to GitHub + FTP
 */

import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import sharp from "sharp";
import { uploadToFtp } from "@/lib/landing";

const GITHUB_REPO = process.env.GITHUB_REPO || "Tony2Metagora/landing-workflows";
const GITHUB_BRANCH = "master";

const TARGET_WIDTH = 1200;
const TARGET_HEIGHT = 900; // 4:3 aspect ratio matching .boutique-visual

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { imageBase64, imageUrl, imagePath, brandType } = await request.json();

    if ((!imageBase64 && !imageUrl) || !imagePath) {
      return NextResponse.json({ error: "imageBase64 ou imageUrl + imagePath requis" }, { status: 400 });
    }

    // Image goes under the brand type's assets folder (e.g. retail-luxe/assets/images/)
    const baseDir = brandType === "premium" ? "retail-premium" : "retail-luxe";

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "GITHUB_TOKEN manquant" }, { status: 500 });
    }

    // Get image data: prefer base64 from client, fallback to server-side download
    let arrayBuffer: Buffer | null = null;
    if (imageBase64) {
      arrayBuffer = Buffer.from(imageBase64, "base64");
    } else {
      // Server-side download with multiple User-Agent strategies
      const strategies: Record<string, string>[] = [
        { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36", "Accept": "image/*,*/*", "Referer": new URL(imageUrl).origin + "/" },
        { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Accept": "*/*" },
        { "User-Agent": "facebookexternalhit/1.1", "Accept": "*/*" },
      ];
      for (const headers of strategies) {
        try {
          const res = await fetch(imageUrl, { headers });
          if (res.ok) {
            arrayBuffer = Buffer.from(await res.arrayBuffer());
            break;
          }
        } catch { /* try next */ }
      }
      if (!arrayBuffer) {
        return NextResponse.json({ error: "Impossible de télécharger l'image après 3 tentatives" }, { status: 500 });
      }
    }

    // Resize & crop to 1200×900 (4:3) JPEG, quality 85%
    const resizedBuffer = await sharp(Buffer.from(arrayBuffer))
      .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: "cover", position: "centre" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const base64Content = resizedBuffer.toString("base64");

    // Push to GitHub
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = GITHUB_REPO.split("/");
    const filePath = `${baseDir}/assets/images/${imagePath}`;

    // Check if file already exists
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
      // File doesn't exist yet
    }

    // Push to GitHub + FTP upload to Hostinger in parallel
    await Promise.all([
      octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: `Add store image: ${imagePath}`,
        content: base64Content,
        branch: GITHUB_BRANCH,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
      uploadToFtp(filePath, resizedBuffer).catch((err) =>
        console.error("FTP image upload failed (non-blocking):", err)
      ),
    ]);

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error("POST /api/landing/save-image error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
