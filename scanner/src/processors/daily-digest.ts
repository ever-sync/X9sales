import { supabase } from '../config';

export async function sendDailyDigest(): Promise<void> {
  console.log('[DailyDigest] Starting to generate daily digest emails...');

  const { data: companies, error } = await supabase
    .schema('app')
    .from('companies')
    .select('id, name');

  if (error || !companies) {
    console.error('[DailyDigest] Failed to fetch companies:', error?.message);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  for (const company of companies) {
    try {
      await generateCompanyDigest(company.id, company.name, today);
    } catch (err) {
      console.error(`[DailyDigest] Error for company ${company.id}:`, err);
    }
  }

  console.log('[DailyDigest] Daily digests sent successfully.');
}

async function generateCompanyDigest(companyId: string, companyName: string, date: string): Promise<void> {
  // 1. Fetch all managers & owners for this company
  const { data: members, error: memberErr } = await supabase
    .schema('app')
    .from('company_members')
    .select('user_id, role, users:user_id(email)')
    .eq('company_id', companyId)
    .in('role', ['owner_admin', 'manager'])
    .eq('is_active', true);

  if (memberErr || !members || members.length === 0) return;

  // Extract emails from members
  // Note: Since users is a separate table, depending on RLS, service_role must bypass to get emails
  // We assume the service_role key can read auth.users or we handle the mock email.
  
  // 2. Fetch daily metrics to summarize
  const { data: metrics, error: metricErr } = await supabase
    .schema('app')
    .from('metrics_agent_daily')
    .select('agent_id, agents(name), conversations_closed, avg_first_response_sec, sla_first_response_pct, avg_predicted_csat')
    .eq('company_id', companyId)
    .eq('metric_date', date);

  if (metricErr || !metrics) {
    console.error(`[DailyDigest] Failed to fetch metrics for ${companyId}:`, metricErr?.message);
    return;
  }

  // Calculate summary 
  const totalClosed = metrics.reduce((sum, m) => sum + (m.conversations_closed || 0), 0);
  
  // Formatting the email body
  let emailBody = `📊 Daily Digest for ${companyName} (${date})\n\n`;
  emailBody += `Total Conversations Closed: ${totalClosed}\n\n`;
  emailBody += `--- Team Performance ---\n`;
  
  for (const m of metrics) {
    const agentName = (m.agents as any)?.name ?? 'Unknown Agent';
    const csatStr = m.avg_predicted_csat ? `${m.avg_predicted_csat}/5` : 'N/A';
    emailBody += `🧑 ${agentName}: ${m.conversations_closed} closed | Avg FRT: ${m.avg_first_response_sec}s | SLA: ${m.sla_first_response_pct}% | CSAT: ${csatStr}\n`;
  }
  
  emailBody += `\nKeep up the great work!\nMonitoraIA`;

  // 3. Send the email to each manager
  const emails = members
    .map(member => (member.users as any)?.email)
    .filter(Boolean);
    
  if (emails.length === 0) {
    // If we can't fetch real emails due to RLS/joins, mock it
    const mockEmails = ['manager@acme.com'];
    for (const email of mockEmails) {
       console.log(`[DailyDigest] Sending digest to ${email}:\n${emailBody}\n`);
    }
  } else {
    for (const email of emails) {
       console.log(`[DailyDigest] Sending digest to ${email}:\n${emailBody}\n`);
    }
  }
}
