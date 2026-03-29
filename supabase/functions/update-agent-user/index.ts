import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { corsHeaders, json, requireOwnerAdmin } from "../_shared/settings-runtime.ts";

type UpdateAgentPayload = {
  company_id: string;
  agent_id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  store_id: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const payload = (await req.json()) as UpdateAgentPayload;
    
    const email = payload.email?.trim().toLowerCase();
    const password = payload.password?.trim();

    if (!payload.company_id || !payload.name) {
      return json({ error: "company_id and name are required" }, { status: 400 });
    }

    if (!payload.agent_id) {
      return json({ error: "agent_id is required" }, { status: 400 });
    }

    if (password && password.length < 6) {
      return json({ error: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
    }

    // Apenas Admins podem realizar esta ação em nome da companhia
    const { service, user: adminUser } = await requireOwnerAdmin(authHeader, payload.company_id);

    // 1. Busca os dados atuais do Agent para saber se ele já possui Conta de Login Vinculada
    const { data: currentAgent, error: fetchError } = await service
      .from("agents")
      .select("id, member_id")
      .eq("id", payload.agent_id)
      .eq("company_id", payload.company_id)
      .single();

    if (fetchError || !currentAgent) {
      return json({ error: "Atendente não localizado nesta empresa." }, { status: 404 });
    }

    let currentMemberId = currentAgent.member_id;
    let authUserId: string | null = null;

    // Cenário A: Ele JÁ POSSUI conta real vinculada. Vamos pegar o 'user_id' do auth
    if (currentMemberId) {
      const { data: memberData, error: memError } = await service
        .from("company_members")
        .select("user_id")
        .eq("id", currentMemberId)
        .single();
      
      if (!memError && memberData) authUserId = memberData.user_id;
    }

    // 2. Criação ou Atualização da Conta Auth
    if (email) {
      if (authUserId) {
        // TEM CONTA - Apenas atualizamos se enviaram nova senha ou novo e-mail
        // (A API admin.updateUserById permite alterar login e passwords forçados para manter compatibilidade)
        const updatePayload: { email?: string; password?: string } = {};
        if (email) updatePayload.email = email;
        if (password) updatePayload.password = password;

        if (Object.keys(updatePayload).length > 0) {
           const { error: updateAuthError } = await service.auth.admin.updateUserById(
             authUserId,
             updatePayload
           );
           if (updateAuthError) throw updateAuthError;
        }

      } else {
         // NÃO TEM CONTA (Vendedor Legado Antigo) - e o chefe enviou no mínimo uma Senha Opcional agora?
         if (password) {
            // Cria um novo Auth User (igual fizemos para creation normal)
            const { data: newUser, error: authError } = await service.auth.admin.createUser({
              email: email,
              password: password,
              email_confirm: true,
              user_metadata: { name: payload.name },
            });

            if (authError) {
              if (authError.message.includes("already registered")) {
                 return json({ error: "Um Atendente antigo sem vínculo no painel encontrou conflito. Este e-mail já está em uso na plataforma." }, { status: 409 });
              }
              throw authError;
            }

            if (!newUser.user) throw new Error("Unable to retro-create user on Supabase Auth");

            const newAuthUserId = newUser.user.id;

            // Insere vinculação no company members do time
            const { data: newMember, error: memberError } = await service
              .from("company_members")
              .insert({
                company_id: payload.company_id,
                user_id: newAuthUserId,
                role: "agent",
                is_active: true,
              })
              .select("id")
              .single();

            if (memberError) {
              await service.auth.admin.deleteUser(newAuthUserId);
              throw memberError;
            }

            currentMemberId = newMember.id;
        }
      }
    }

    // 3. Cadastra o update base na tabela agents
    const { data: updatedAgent, error: agentError } = await service
      .from("agents")
      .update({
        member_id: currentMemberId,
        name: payload.name.trim(),
        email: email || null,
        phone: payload.phone?.trim() || null,
        store_id: payload.store_id,
      })
      .eq("id", payload.agent_id)
      .select("id, name, email")
      .single();

    if (agentError) throw agentError;

    return json({
      success: true,
      agent: updatedAgent,
    });
    
  } catch (error) {
    console.error("[update-agent-user] error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 });
  }
});
