/**
 * API Route — LinkedIn Calendar Posts CRUD
 * GET:    list all posts
 * POST:   create a post
 * PUT:    update a post (body.id required)
 * DELETE: delete a post (body.id required)
 */

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import { getPosts, createPost, updatePost, deletePost } from "@/lib/linkedin-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAuth("linkedin", "GET");
  if (guard.denied) return guard.denied;

  const posts = await getPosts();
  return NextResponse.json({ data: posts });
}

export async function POST(request: Request) {
  const guard = await requireAuth("linkedin", "POST");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { title, content, theme, hook, publishDate, publishTime, imagePrompt } = body;
    if (!title || !content || !theme || !publishDate || !publishTime) {
      return NextResponse.json({ error: "Champs requis: title, content, theme, publishDate, publishTime" }, { status: 400 });
    }
    const post = await createPost({ title, content, theme, hook: hook || "", publishDate, publishTime, imagePrompt });
    return NextResponse.json({ data: post });
  } catch (error) {
    console.error("POST /api/linkedin/posts error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const guard = await requireAuth("linkedin", "PUT");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    const updated = await updatePost(id, updates);
    if (!updated) return NextResponse.json({ error: "Post introuvable" }, { status: 404 });
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/linkedin/posts error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const guard = await requireAuth("linkedin", "DELETE");
  if (guard.denied) return guard.denied;

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });
    await deletePost(body.id);
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error("DELETE /api/linkedin/posts error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
