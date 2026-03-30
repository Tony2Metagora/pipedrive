import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CAMPAIGNS_KEY = "followup-campaigns";
const ITEMS_KEY = "followup-items";

const locks = new Map<string, Promise<void>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(key, next.then(() => {}, () => {}));
  return next;
}

async function readArray<T>(key: string): Promise<T[]> {
  const data = await redis.get<T[]>(key);
  return data ?? [];
}

async function writeArray<T>(key: string, data: T[]): Promise<void> {
  await redis.set(key, data);
}

export type FollowupItemStatus =
  | "draft"
  | "a_envoyer"
  | "en_cours"
  | "envoye"
  | "erreur"
  | "repondu";

export interface SenderAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface FollowupCampaign {
  id: number;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  senderEmail: string;
  cadenceMinutes: number;
  lastRunAt?: string;
  startedAt?: string;
  senderAuth?: SenderAuth;
}

export interface FollowupItem {
  id: number;
  campaignId: number;
  dealId: number | null;
  leadEmail: string;
  leadName?: string;
  company?: string;
  sequenceStep?: number;
  totalSteps?: number;
  delayAfterPreviousMinutes?: number;
  // Business days version of delay; used to compute scheduledAt on send
  delayAfterPreviousBusinessDays?: number;
  subject: string;
  body: string;
  status: FollowupItemStatus;
  order: number;
  scheduledAt: string;
  updatedAt: string;
  lastEmailAt?: string;
  sentAt?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  lastError?: string;
}

export async function listFollowupCampaigns(): Promise<FollowupCampaign[]> {
  const campaigns = await readArray<FollowupCampaign>(CAMPAIGNS_KEY);
  return campaigns.sort((a, b) => b.id - a.id);
}

export async function getFollowupCampaign(id: number): Promise<FollowupCampaign | null> {
  const campaigns = await readArray<FollowupCampaign>(CAMPAIGNS_KEY);
  return campaigns.find((c) => c.id === id) ?? null;
}

export async function createFollowupCampaign(
  input: Pick<FollowupCampaign, "name" | "createdBy" | "senderEmail"> & { cadenceMinutes?: number }
): Promise<FollowupCampaign> {
  return withLock(CAMPAIGNS_KEY, async () => {
    const campaigns = await readArray<FollowupCampaign>(CAMPAIGNS_KEY);
    const maxId = campaigns.reduce((m, c) => Math.max(m, c.id), 0);
    const now = new Date().toISOString();
    const created: FollowupCampaign = {
      id: maxId + 1,
      name: input.name.trim(),
      createdBy: input.createdBy,
      senderEmail: input.senderEmail,
      cadenceMinutes: input.cadenceMinutes ?? 10,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    await writeArray(CAMPAIGNS_KEY, [...campaigns, created]);
    return created;
  });
}

export async function updateFollowupCampaign(
  id: number,
  patch: Partial<FollowupCampaign>
): Promise<FollowupCampaign | null> {
  return withLock(CAMPAIGNS_KEY, async () => {
    const campaigns = await readArray<FollowupCampaign>(CAMPAIGNS_KEY);
    const idx = campaigns.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    campaigns[idx] = {
      ...campaigns[idx],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    await writeArray(CAMPAIGNS_KEY, campaigns);
    return campaigns[idx];
  });
}

export async function deleteFollowupCampaign(id: number): Promise<boolean> {
  return withLock(CAMPAIGNS_KEY, async () => {
    const campaigns = await readArray<FollowupCampaign>(CAMPAIGNS_KEY);
    const before = campaigns.length;
    const next = campaigns.filter((c) => c.id !== id);
    if (next.length === before) return false;
    await writeArray(CAMPAIGNS_KEY, next);
    return true;
  });
}

export async function listFollowupItemsByCampaign(campaignId: number): Promise<FollowupItem[]> {
  const items = await readArray<FollowupItem>(ITEMS_KEY);
  return items
    .filter((i) => i.campaignId === campaignId)
    .sort((a, b) => a.order - b.order || a.id - b.id);
}

export async function replaceFollowupItemsForCampaign(
  campaignId: number,
  nextItems: Array<Omit<FollowupItem, "id" | "updatedAt">>
): Promise<FollowupItem[]> {
  return withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    const retained = items.filter((i) => i.campaignId !== campaignId);
    const maxId = items.reduce((m, i) => Math.max(m, i.id), 0);
    const now = new Date().toISOString();
    const created = nextItems.map((it, idx) => ({
      ...it,
      id: maxId + idx + 1,
      updatedAt: now,
    }));
    await writeArray(ITEMS_KEY, [...retained, ...created]);
    return created;
  });
}

export async function deleteFollowupItemsForCampaign(campaignId: number): Promise<void> {
  await withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    const next = items.filter((i) => i.campaignId !== campaignId);
    await writeArray(ITEMS_KEY, next);
  });
}

export async function updateFollowupItem(
  id: number,
  patch: Partial<FollowupItem>
): Promise<FollowupItem | null> {
  return withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    const idx = items.findIndex((i) => i.id === id);
    if (idx < 0) return null;
    items[idx] = {
      ...items[idx],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    await writeArray(ITEMS_KEY, items);
    return items[idx];
  });
}

export async function markCampaignItemsReady(
  campaignId: number,
  baseDate?: Date
): Promise<{ total: number; updated: number }> {
  return withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    let updated = 0;
    let offset = 0;
    const base = baseDate ?? new Date();
    const next = items.map((item) => {
      if (item.campaignId !== campaignId) return item;
      if (item.status === "envoye") return item;
      const scheduledAt = new Date(base.getTime() + offset * 10 * 60 * 1000).toISOString();
      offset += 1;
      updated += 1;
      return {
        ...item,
        status: "a_envoyer" as const,
        scheduledAt,
        updatedAt: new Date().toISOString(),
      };
    });
    await writeArray(ITEMS_KEY, next);
    return { total: next.filter((i) => i.campaignId === campaignId).length, updated };
  });
}

export async function markCampaignFirstStepReady(
  campaignId: number,
  baseDate?: Date
): Promise<{ total: number; updated: number }> {
  return withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    let updated = 0;
    let offset = 0;
    const base = baseDate ?? new Date();
    const next = items.map((item) => {
      if (item.campaignId !== campaignId) return item;
      if (item.status === "envoye" || item.status === "repondu") return item;
      const step = item.sequenceStep ?? 1;
      if (step !== 1) {
        if (item.status === "a_envoyer" || item.status === "en_cours") {
          return {
            ...item,
            status: "draft" as const,
            updatedAt: new Date().toISOString(),
          };
        }
        return item;
      }
      const scheduledAt = new Date(base.getTime() + offset * 10 * 60 * 1000).toISOString();
      offset += 1;
      updated += 1;
      return {
        ...item,
        status: "a_envoyer" as const,
        scheduledAt,
        updatedAt: new Date().toISOString(),
      };
    });
    await writeArray(ITEMS_KEY, next);
    return { total: next.filter((i) => i.campaignId === campaignId).length, updated };
  });
}

export async function pickNextReadyItem(campaignId: number): Promise<FollowupItem | null> {
  return withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    const now = Date.now();
    const idx = items.findIndex((i) =>
      i.campaignId === campaignId &&
      i.status === "a_envoyer" &&
      new Date(i.scheduledAt).getTime() <= now
    );
    if (idx < 0) return null;
    items[idx] = {
      ...items[idx],
      status: "en_cours",
      updatedAt: new Date().toISOString(),
    };
    await writeArray(ITEMS_KEY, items);
    return items[idx];
  });
}

export async function getCampaignStats(campaignId: number): Promise<{
  total: number;
  a_envoyer: number;
  en_cours: number;
  envoye: number;
  erreur: number;
  repondu: number;
}> {
  const items = await listFollowupItemsByCampaign(campaignId);
  return {
    total: items.length,
    a_envoyer: items.filter((i) => i.status === "a_envoyer").length,
    en_cours: items.filter((i) => i.status === "en_cours").length,
    envoye: items.filter((i) => i.status === "envoye").length,
    erreur: items.filter((i) => i.status === "erreur").length,
    repondu: items.filter((i) => i.status === "repondu").length,
  };
}

export async function markLeadItemsAsReplied(campaignId: number, leadEmail: string): Promise<number> {
  return withLock(ITEMS_KEY, async () => {
    const items = await readArray<FollowupItem>(ITEMS_KEY);
    let changed = 0;
    const next = items.map((item) => {
      if (item.campaignId !== campaignId) return item;
      if (item.leadEmail.toLowerCase() !== leadEmail.toLowerCase()) return item;
      if (item.status === "envoye" || item.status === "repondu") return item;
      changed += 1;
      return {
        ...item,
        status: "repondu" as const,
        lastError: "Reponse detectee: sequence stoppee",
        updatedAt: new Date().toISOString(),
      };
    });
    if (changed > 0) await writeArray(ITEMS_KEY, next);
    return changed;
  });
}

