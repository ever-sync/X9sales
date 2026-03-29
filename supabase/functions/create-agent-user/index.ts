import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

type CreateAgentPayload = {
  company_id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  store_id: string;
  external_id?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const payload = (await req.json()) as CreateAgentPayload;
    
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();

    if (!payload.company_id || !payload.name) {
      return json({ error: "company_id and name are required" }, { status: 400 });
    }

    if (!payload.store_id) {
      return json({ error: "store_id is required" }, { status: 400 });
    }

    // Apenas Admins podem realizar esta ação em nome da companhia
    const { service, user: adminUser } = await requireOwnerAdmin(authHeader, payload.company_id);

    let memberId: string | null = null;
    let authUserId: string | null = null;

    // Se o gestor pediu para criar a conta com e-mail/senha junto (o esperado para o Agent Dashboard)
    if (email) {
      if (!password) {
        return json({ error: "Se informado e-mail, favor enviar a senha de acesso inicial." }, { status: 400 });
      }

      // 1. Criar Auth User via API de Administração
      const { data: newUser, error: authError } = await service.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { name: payload.name },
      });

      if (authError) {
        // Pode falhar se já existir um user com o email
        if (authError.message.includes("already registered")) {
          return json({ error: "Este email já está cadastrado em nossa base." }, { status: 409 });
        }
        throw authError;
      }
      
      if (!newUser.user) {
        throw new Error("Unable to create user on Supabase Auth");
      }

      authUserId = newUser.user.id;

      // 2. Insere na tabela company_members para lhe dar vínculo
      const { data: newMember, error: memberError } = await service
        .from("company_members")
        .insert({
          company_id: payload.company_id,
          user_id: authUserId,
          role: "agent",
          is_active: true,
        })
        .select("id")
        .single();

      if (memberError) {
        // Tentar deletar o Auth User recém-criado em caso de falha de vínculo
        await service.auth.admin.deleteUser(authUserId);
        throw memberError;
      }

      memberId = newMember.id;
    }

    // 3. Cadastra o Agent Profile
    const resolvedExternalId = payload.external_id?.trim() || crypto.randomUUID();

    const { data: newAgent, error: agentError } = await service
      .from("agents")
      .insert({
        company_id: payload.company_id,
        member_id: memberId,
        name: payload.name.trim(),
        email: email || null,
        phone: payload.phone?.trim() || null,
        store_id: payload.store_id,
        external_id: resolvedExternalId,
        is_active: true,
      })
      .select("id, name, email")
      .single();

    if (agentError) {
      // Se ocorreu erro para gravar o agente, tentamos reverter se foi criada a conta Auth
      if (authUserId) {
        if (memberId) {
          await service.from("company_members").delete().eq("id", memberId);
        }
        await service.auth.admin.deleteUser(authUserId);
      }
      throw agentError;
    }

    return json({
      success: true,
      agent: newAgent,
    });
    
  } catch (error) {
    console.error("[create-agent-user] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
