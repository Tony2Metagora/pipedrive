import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-guard";
import dns from "dns";

// Create a fresh resolver per request to bypass Node.js DNS cache
function freshResolver() {
  const resolver = new dns.Resolver();
  // Use public DNS servers for freshest results
  resolver.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  return {
    resolveTxt: (hostname: string) => new Promise<string[][]>((resolve, reject) => resolver.resolveTxt(hostname, (err, records) => err ? reject(err) : resolve(records))),
    resolveMx: (hostname: string) => new Promise<dns.MxRecord[]>((resolve, reject) => resolver.resolveMx(hostname, (err, records) => err ? reject(err) : resolve(records))),
  };
}

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
  const { resolveTxt, resolveMx } = freshResolver();
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

  // DKIM check — try common selectors (including Hostinger-specific ones)
  const selectors = ["default", "google", "selector1", "selector2", "s1", "s2", "k1", "k2", "mail", "dkim", "hostinger", "hst", "mta", "smtp"];
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
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (error) {
    console.error("Domain check error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
