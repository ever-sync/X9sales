-- Allow owner_admin members to update their own company profile/settings.

CREATE POLICY "companies_update_owner_admin" ON app.companies
    FOR UPDATE USING (
        app.get_member_role(auth.uid(), id) = 'owner_admin'
    )
    WITH CHECK (
        app.get_member_role(auth.uid(), id) = 'owner_admin'
    );
