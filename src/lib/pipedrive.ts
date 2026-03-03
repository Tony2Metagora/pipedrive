/**
 * Service Pipedrive — toutes les interactions avec l'API Pipedrive.
 * Utilisé uniquement côté serveur (API routes).
 */

const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN!;
const BASE_URL = "https://api.pipedrive.com/v1";

// ─── Types ───────────────────────────────────────────────

export interface PipedriveDeal {
  id: number;
  title: string;
  person_id: number | null;
  org_id: number | null;
  pipeline_id: number;
  stage_id: number;
  value: number;
  currency: string;
  status: string;
  person_name?: string;
  org_name?: string;
  owner_name?: string;
  note?: string;
}

export interface PipedrivePerson {
  id: number;
  name: string;
  email: { value: string; primary: boolean }[];
  phone: { value: string; primary: boolean }[];
  org_id: number | null;
  job_title?: string;
}

export interface PipedriveActivity {
  id: number;
  subject: string;
  type: string;
  due_date: string;
  due_time: string;
  done: boolean;
  deal_id: number | null;
  person_id: number | null;
  org_id: number | null;
  deal_title?: string;
  person_name?: string;
  org_name?: string;
  note?: string;
  pipeline_id?: number;
  stage_id?: number;
}

export interface PipedriveOrganization {
  id: number;
  name: string;
}

export interface PipedriveNote {
  id: number;
  content: string;
  deal_id: number | null;
  person_id: number | null;
  org_id: number | null;
}

// ─── Helpers ─────────────────────────────────────────────

async function apiGet<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("api_token", API_TOKEN);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Pipedrive GET ${endpoint}: ${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

async function apiPost<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}/${endpoint}?api_token=${API_TOKEN}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipedrive POST ${endpoint}: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.data;
}

async function apiPut<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  const url = `${BASE_URL}/${endpoint}?api_token=${API_TOKEN}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipedrive PUT ${endpoint}: ${res.status} ${text}`);
  }
  const json = await res.json();
  return json.data;
}

async function apiDelete(endpoint: string): Promise<void> {
  const url = `${BASE_URL}/${endpoint}?api_token=${API_TOKEN}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`Pipedrive DELETE ${endpoint}: ${res.status}`);
}

// ─── Deals ───────────────────────────────────────────────

export async function getDeals(params: Record<string, string> = {}): Promise<PipedriveDeal[]> {
  try {
    const data = await apiGet<PipedriveDeal[] | null>("deals", { limit: "500", ...params });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getDeal(id: number): Promise<PipedriveDeal | null> {
  try {
    return await apiGet<PipedriveDeal>(`deals/${id}`);
  } catch {
    return null;
  }
}

export async function createDeal(data: {
  title: string;
  person_id?: number;
  org_id?: number;
  pipeline_id: number;
  stage_id: number;
  value?: number;
}): Promise<PipedriveDeal> {
  return apiPost<PipedriveDeal>("deals", data);
}

export async function updateDeal(
  id: number,
  data: Partial<{ title: string; pipeline_id: number; stage_id: number; value: number; status: string; lost_reason: string }>
): Promise<PipedriveDeal> {
  return apiPut<PipedriveDeal>(`deals/${id}`, data);
}

export async function searchDeals(term: string): Promise<PipedriveDeal[]> {
  try {
    const url = new URL(`${BASE_URL}/deals/search`);
    url.searchParams.set("api_token", API_TOKEN);
    url.searchParams.set("term", term);
    url.searchParams.set("limit", "20");
    const res = await fetch(url.toString(), { cache: "no-store" });
    const json = await res.json();
    if (!json.data?.items) return [];
    return json.data.items.map((item: { item: PipedriveDeal }) => item.item);
  } catch {
    return [];
  }
}

// ─── Persons ─────────────────────────────────────────────

export async function createPerson(data: {
  name: string;
  email?: string;
  phone?: string;
  org_id?: number;
  job_title?: string;
}): Promise<PipedrivePerson> {
  const body: Record<string, unknown> = { name: data.name };
  if (data.email) body.email = [{ value: data.email, primary: true }];
  if (data.phone) body.phone = [{ value: data.phone, primary: true }];
  if (data.org_id) body.org_id = data.org_id;
  if (data.job_title) body.job_title = data.job_title;
  return apiPost<PipedrivePerson>("persons", body);
}

export async function getPerson(id: number): Promise<PipedrivePerson | null> {
  try {
    return await apiGet<PipedrivePerson>(`persons/${id}`);
  } catch {
    return null;
  }
}

export async function updatePerson(
  id: number,
  data: Partial<{ name: string; email: string; phone: string; job_title: string }>
): Promise<PipedrivePerson> {
  const body: Record<string, unknown> = {};
  if (data.name) body.name = data.name;
  if (data.email) body.email = [{ value: data.email, primary: true }];
  if (data.phone) body.phone = [{ value: data.phone, primary: true }];
  if (data.job_title) body.job_title = data.job_title;
  return apiPut<PipedrivePerson>(`persons/${id}`, body);
}

export async function getDealPersons(dealId: number): Promise<PipedrivePerson[]> {
  try {
    const data = await apiGet<{ data: PipedrivePerson[] } | PipedrivePerson[] | null>(`deals/${dealId}/participants`);
    if (!data) return [];
    if (Array.isArray(data)) return data;
    return (data as { data: PipedrivePerson[] }).data ?? [];
  } catch {
    return [];
  }
}

// ─── Organizations ───────────────────────────────────────

export async function createOrganization(name: string): Promise<PipedriveOrganization> {
  return apiPost<PipedriveOrganization>("organizations", { name });
}

export async function getOrganization(id: number): Promise<PipedriveOrganization | null> {
  try {
    return await apiGet<PipedriveOrganization>(`organizations/${id}`);
  } catch {
    return null;
  }
}

// ─── Person context (deals, activities, notes) ──────────

export async function getPersonDeals(personId: number): Promise<PipedriveDeal[]> {
  try {
    const data = await apiGet<PipedriveDeal[] | null>(`persons/${personId}/deals`, { limit: "50" });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getPersonActivities(personId: number): Promise<PipedriveActivity[]> {
  try {
    const data = await apiGet<PipedriveActivity[] | null>(`persons/${personId}/activities`, { limit: "50" });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getPersonNotes(personId: number): Promise<PipedriveNote[]> {
  try {
    const data = await apiGet<PipedriveNote[] | null>(`persons/${personId}/notes`, { limit: "50" });
    return data ?? [];
  } catch {
    return [];
  }
}

// ─── Activities ──────────────────────────────────────────

export async function getActivities(params: Record<string, string> = {}): Promise<PipedriveActivity[]> {
  try {
    const data = await apiGet<PipedriveActivity[] | null>("activities", { limit: "500", ...params });
    return data ?? [];
  } catch {
    return [];
  }
}

export async function getActivitiesForDeal(dealId: number): Promise<PipedriveActivity[]> {
  try {
    const data = await apiGet<PipedriveActivity[] | null>(`deals/${dealId}/activities`);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function createActivity(data: {
  subject: string;
  type?: string;
  due_date: string;
  due_time?: string;
  deal_id?: number;
  person_id?: number;
  org_id?: number;
  note?: string;
}): Promise<PipedriveActivity> {
  return apiPost<PipedriveActivity>("activities", {
    ...data,
    type: data.type ?? "task",
  });
}

export async function markActivityDone(id: number): Promise<PipedriveActivity> {
  return apiPut<PipedriveActivity>(`activities/${id}`, { done: 1 });
}

export async function updateActivity(
  id: number,
  data: Partial<{ subject: string; due_date: string; due_time: string; done: number; note: string }>
): Promise<PipedriveActivity> {
  return apiPut<PipedriveActivity>(`activities/${id}`, data);
}

// ─── Notes ───────────────────────────────────────────────

export async function createNote(data: {
  content: string;
  deal_id?: number;
  person_id?: number;
  org_id?: number;
}): Promise<PipedriveNote> {
  return apiPost<PipedriveNote>("notes", data);
}

export async function getNotesForDeal(dealId: number): Promise<PipedriveNote[]> {
  try {
    const data = await apiGet<PipedriveNote[] | null>(`deals/${dealId}/notes`);
    return data ?? [];
  } catch {
    return [];
  }
}
