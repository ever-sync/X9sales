-- Allow agents to manage their own sales records
drop policy if exists "sales_records_manage" on app.sales_records;

create policy "sales_records_manage" on app.sales_records
    for all using (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
        OR
        (
            app.get_member_role(auth.uid(), company_id) = 'agent'
            AND seller_agent_id IN (
                select a.id from app.agents a
                join app.company_members cm on a.member_id = cm.id
                where cm.user_id = auth.uid() 
                  and a.company_id = app.sales_records.company_id
                limit 1
            )
        )
    )
    with check (
        app.get_member_role(auth.uid(), company_id) = 'owner_admin'
        OR
        (
            app.get_member_role(auth.uid(), company_id) = 'agent'
            AND seller_agent_id IN (
                select a.id from app.agents a
                join app.company_members cm on a.member_id = cm.id
                where cm.user_id = auth.uid() 
                  and a.company_id = app.sales_records.company_id
                limit 1
            )
        )
    );
