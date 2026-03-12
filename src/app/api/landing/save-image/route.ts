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
    const { imageBase64, imagePath, brandType } = await request.json();

    if (!imageBase64 || !imagePath) {
      return NextResponse.json({ error: "imageBase64 et imagePath requis" }, { status: 400 });
    }

    // Image goes under the brand type's assets folder (e.g. retail-luxe/assets/images/)
    const baseDir = brandType === "premium" ? "retail-premium" : "retail-luxe";

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "GITHUB_TOKEN manquant" }, { status: 500 });
    }

    // Decode base64 image sent from client (avoids 403 from image hosts)
    const arrayBuffer = Buffer.from(imageBase64, "base64");

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
