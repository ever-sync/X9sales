import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AlertPayload {
  type: "INSERT" | "UPDATE";
  record: {
    id: string;
    company_id: string;
    alert_type: string;
    severity: string;
    status: string;
    title: string;
    description: string;
    agent_id?: string;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as AlertPayload;
    const { record, type } = payload;

    // We only want to notify on new CRITICAL or HIGH alerts
    if (type === "INSERT" && (record.severity === "critical" || record.severity === "high")) {
      console.log(`[push-alert] Triggering push for ALERT ${record.id}: ${record.title}`);

      // TODO: Integration with WhaZApi to send a WhatsApp message to the manager's phone
      // OR Integration with Resend/SendGrid to send an Email to the manager
      
      const mockedNotification = `
      🚨 MonitoraIA Alert: ${record.severity.toUpperCase()}
      Title: ${record.title}
      Description: ${record.description}
      Action Required: Please check the system.
      `;

      console.log(`[push-alert] Sent via Push Notification:\n${mockedNotification}`);

      return new Response(JSON.stringify({ success: true, notified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, notified: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[push-alert] Error parsing webhook payload:", error);
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
