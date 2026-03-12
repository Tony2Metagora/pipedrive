/**
 * API Route — Save a store image to the landing-workflows GitHub repo
 * POST: downloads image from URL and pushes it to assets/images/{imagePath}
 */

import { NextResponse } from "next/server";
import { Octokit } from "octokit";

const GITHUB_REPO = process.env.GITHUB_REPO || "Tony2Metagora/landing-workflows";
const GITHUB_BRANCH = "master";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { imageUrl, imagePath } = await request.json();

    if (!imageUrl || !imagePath) {
      return NextResponse.json({ error: "imageUrl et imagePath requis" }, { status: 400 });
    }

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json({ error: "GITHUB_TOKEN manquant" }, { status: 500 });
    }

    // Download the image
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: `Impossible de télécharger l'image: ${imgRes.status}` }, { status: 500 });
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString("base64");

    // Push to GitHub
    const octokit = new Octokit({ auth: token });
    const [owner, repo] = GITHUB_REPO.split("/");
    const filePath = `assets/images/${imagePath}`;

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

    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `Add store image: ${imagePath}`,
      content: base64Content,
      branch: GITHUB_BRANCH,
      ...(existingSha ? { sha: existingSha } : {}),
    });

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error("POST /api/landing/save-image error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
