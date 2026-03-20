import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import dns from "dns";
import { promisify } from "util";

const resolveTxt = promisify(dns.resolveTxt);
const resolveMx = promisify(dns.resolveMx);

interface DomainCheck {
  domain: string;
  spf: { found: boolean; record: string | null; valid: boolean; issue: string | null };
  dkim: { found: boolean; record: string | null; selector: string };
  dmarc: { found: boolean; record: string | null; policy: string | null; issue: string | null };
  mx: { found: boolean; records: string[] };
  score: number;
  recommendations: string[];
}

async function checkDomain(domain: string): Promise<DomainCheck> {
  const result: DomainCheck = {
    domain,
    spf: { found: false, record: null, valid: false, issue: null },
    dkim: { found: false, record: null, selector: "default" },
    dmarc: { found: false, record: null, policy: null, issue: null },
    mx: { found: false, records: [] },
    score: 0,
    recommendations: [],
  };

  // SPF check
  try {
    const txtRecords = await resolveTxt(domain);
    const spfRecord = txtRecords.flat().find((r) => r.startsWith("v=spf1"));
    if (spfRecord) {
      result.spf.found = true;
      result.spf.record = spfRecord;
      result.spf.valid = spfRecord.includes("~all") || spfRecord.includes("-all");
      if (spfRecord.includes("+all")) {
        result.spf.issue = "SPF trop permissif (+all) — devrait être ~all ou -all";
      } else if (spfRecord.includes("?all")) {
        result.spf.issue = "SPF en mode neutre (?all) — préférez ~all ou -all";
      }
    } else {
      result.spf.issue = "Aucun enregistrement SPF trouvé";
      result.recommendations.push("Ajoutez un enregistrement SPF (TXT) sur votre DNS : v=spf1 include:_spf.google.com ~all");
    }
  } catch {
    result.spf.issue = "Impossible de vérifier le SPF (erreur DNS)";
  }

  // DKIM check — try common selectors
  const selectors = ["default", "google", "selector1", "selector2", "s1", "s2", "k1", "mail", "dkim"];
  for (const sel of selectors) {
    try {
      const dkimRecords = await resolveTxt(`${sel}._domainkey.${domain}`);
      const dkimRecord = dkimRecords.flat().find((r) => r.includes("v=DKIM1") || r.includes("p="));
      if (dkimRecord) {
        result.dkim.found = true;
        result.dkim.record = dkimRecord.slice(0, 120) + (dkimRecord.length > 120 ? "..." : "");
        result.dkim.selector = sel;
        break;
      }
    } catch {
      // selector not found, try next
    }
  }
  if (!result.dkim.found) {
    result.recommendations.push("Aucun DKIM détecté — configurez DKIM dans votre hébergeur email (Google: Admin Console, Hostinger: DNS Zone)");
  }

  // DMARC check
  try {
    const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
    const dmarcRecord = dmarcRecords.flat().find((r) => r.startsWith("v=DMARC1"));
    if (dmarcRecord) {
      result.dmarc.found = true;
      result.dmarc.record = dmarcRecord;
      const policyMatch = dmarcRecord.match(/p=(\w+)/);
      result.dmarc.policy = policyMatch ? policyMatch[1] : null;
      if (result.dmarc.policy === "none") {
        result.dmarc.issue = "DMARC en mode 'none' — les emails frauduleux ne sont pas bloqués. Passez à 'quarantine' ou 'reject'.";
      }
    } else {
      result.dmarc.issue = "Aucun enregistrement DMARC trouvé";
      result.recommendations.push("Ajoutez un enregistrement DMARC (TXT) sur _dmarc." + domain + " : v=DMARC1; p=quarantine; rua=mailto:dmarc@" + domain);
    }
  } catch {
    result.dmarc.issue = "Impossible de vérifier DMARC (erreur DNS)";
  }

  // MX check
  try {
    const mxRecords = await resolveMx(domain);
    if (mxRecords.length > 0) {
      result.mx.found = true;
      result.mx.records = mxRecords.sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
    }
  } catch {
    result.recommendations.push("Aucun enregistrement MX trouvé — les réponses ne pourront pas être reçues");
  }

  // Score
  let score = 0;
  if (result.spf.found && result.spf.valid) score += 30;
  else if (result.spf.found) score += 15;
  if (result.dkim.found) score += 30;
  if (result.dmarc.found) score += 25;
  if (result.dmarc.policy === "quarantine" || result.dmarc.policy === "reject") score += 5;
  if (result.mx.found) score += 10;
  result.score = score;

  return result;
}

/** GET /api/sequences/domain-check?domain=metagora-tech.fr */
export async function GET(request: Request) {
  const guard = await requireAuth("sequences" as never, "GET");
  if (guard.denied) return guard.denied;

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "Paramètre 'domain' requis" }, { status: 400 });
  }

  try {
    const result = await checkDomain(domain);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Domain check error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
