import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, getServiceClient, json } from "../_shared/settings-runtime.ts";

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
    hour12: false,
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday.toLowerCase(),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

function normalizeWeekday(value: string) {
  const map: Record<string, string> = {
    monday: "monday",
    tuesday: "tuesday",
    wednesday: "wednesday",
    thursday: "thursday",
    friday: "friday",
    saturday: "saturday",
    sunday: "sunday",
  };
  return map[value] ?? "monday";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const service = getServiceClient();
    const now = new Date();
    const queued: string[] = [];

    const { data: companies, error: companiesError } = await service
      .from("companies")
      .select("id, name, settings");

    if (companiesError) throw companiesError;

    for (const company of companies ?? []) {
      const settings = (company.settings ?? {}) as Record<string, any>;
      const timezone = settings.timezone ?? "America/Sao_Paulo";
      const local = zonedParts(now, timezone);

      const { data: todayJobs } = await service
        .from("notification_jobs")
        .select("job_type, target_user_id, target_agent_id, created_at")
        .eq("company_id", company.id)
        .gte("created_at", new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString());

      const seen = new Set(
        (todayJobs ?? []).map((job) => `${job.job_type}:${job.target_user_id ?? "none"}:${job.target_agent_id ?? "none"}:${job.created_at.slice(0, 10)}`),
      );

      if (local.hour >= 18) {
        const freq = settings.admin_report_frequency ?? "daily";
        const weekday = normalizeWeekday(settings.admin_report_weekday ?? "monday");
        const monthDay = Number(settings.admin_report_month_day ?? 1);
        const shouldQueueAdmin =
          freq === "daily" ||
          (freq === "weekly" && local.weekday === weekday) ||
          (freq === "monthly" && local.day === Math.min(monthDay, 28));

        if (shouldQueueAdmin) {
          const { data: admins } = await service
            .from("company_members")
            .select("user_id")
            .eq("company_id", company.id)
            .eq("role", "owner_admin")
            .eq("is_active", true);

          const { data: overview } = await service
            .from("mv_dashboard_overview")
            .select("conversations_7d, conversations_30d, open_alerts, avg_predicted_csat_30d")
            .eq("company_id", company.id)
            .maybeSingle();

          for (const admin of admins ?? []) {
            const key = `admin_report:${admin.user_id}:none:${now.toISOString().slice(0, 10)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            await service.from("notification_jobs").insert({
              company_id: company.id,
              job_type: "admin_report",
              target_user_id: admin.user_id,
              channel: settings.admin_report_channel ?? "email",
              scheduled_for: now.toISOString(),
              payload: {
                company_name: company.name,
                summary: {
                  conversations_7d: overview?.conversations_7d ?? 0,
                  conversations_30d: overview?.conversations_30d ?? 0,
                  open_alerts: overview?.open_alerts ?? 0,
                  avg_predicted_csat_30d: overview?.avg_predicted_csat_30d ?? null,
                },
              },
            });
            queued.push(`admin_report:${company.id}:${admin.user_id}`);
          }
        }
      }

      if (local.hour >= 8) {
        const { data: agents } = await service
          .from("agents")
          .select("id, name, email, member_id")
          .eq("company_id", company.id)
          .eq("is_active", true);

        if (settings.agent_morning_improvement_ideas) {
          for (const agent of agents ?? []) {
            const key = `agent_morning_ideas:none:${agent.id}:${now.toISOString().slice(0, 10)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const { data: analysis } = await service
              .from("ai_conversation_analysis")
              .select("quality_score, training_tags, coaching_tips")
              .eq("company_id", company.id)
              .eq("agent_id", agent.id)
              .order("analyzed_at", { ascending: false })
              .limit(3);

            await service.from("notification_jobs").insert({
              company_id: company.id,
              job_type: "agent_morning_ideas",
              target_agent_id: agent.id,
              channel: "email",
              scheduled_for: now.toISOString(),
              payload: {
                agent_name: agent.name,
                agent_email: agent.email,
                suggestions: (analysis ?? []).flatMap((row: any) => row.training_tags ?? []).slice(0, 5),
              },
            });
            queued.push(`agent_morning_ideas:${company.id}:${agent.id}`);
          }
        }

        if (settings.agent_follow_up_alerts) {
          for (const agent of agents ?? []) {
            const key = `agent_follow_up:none:${agent.id}:${now.toISOString().slice(0, 10)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const staleThreshold = new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString();
            const { data: followUps } = await service
              .from("conversations")
              .select("id, started_at, customer:customers(name, phone)")
              .eq("company_id", company.id)
              .eq("agent_id", agent.id)
              .in("status", ["active", "waiting"])
              .lt("created_at", staleThreshold)
              .limit(5);

            if ((followUps ?? []).length === 0) continue;

            await service.from("notification_jobs").insert({
              company_id: company.id,
              job_type: "agent_follow_up",
              target_agent_id: agent.id,
              channel: "email",
              scheduled_for: now.toISOString(),
              payload: {
                agent_name: agent.name,
                agent_email: agent.email,
                customers: (followUps ?? []).map((item: any) => item.customer?.name ?? item.customer?.phone ?? "Cliente"),
              },
            });
            queued.push(`agent_follow_up:${company.id}:${agent.id}`);
          }
        }
      }
    }

    return json({ success: true, queued_count: queued.length, queued });
  } catch (error) {
    console.error("[queue-notification-jobs] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
