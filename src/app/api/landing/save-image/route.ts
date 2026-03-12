/**
 * API Route — Save a store image to the landing-workflows GitHub repo
 * POST: downloads image from URL, resizes to 1200×900 (4:3 landscape), pushes to assets/images/{imagePath}
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
    const { imageUrl, imagePath, brandType } = await request.json();

    if (!imageUrl || !imagePath) {
      return NextResponse.json({ error: "imageUrl et imagePath requis" }, { status: 400 });
    }

    // Image goes under the brand type's assets folder (e.g. retail-luxe/assets/images/)
    const baseDir = brandType === "premium" ? "retail-premium" : "retail-luxe";

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "GITHUB_TOKEN manquant" }, { status: 500 });
    }

    // Download the image (with browser-like headers to avoid 403)
    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": new URL(imageUrl).origin + "/",
      },
    });
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Impossible de télécharger l'image: ${imgRes.status}` }, { status: 500 });
    }

    const arrayBuffer = await imgRes.arrayBuffer();

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
