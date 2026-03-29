insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;

drop policy if exists "company_assets_public_read" on storage.objects;
create policy "company_assets_public_read" on storage.objects
    for select using (bucket_id = 'company-assets');

drop policy if exists "company_assets_authenticated_insert" on storage.objects;
create policy "company_assets_authenticated_insert" on storage.objects
    for insert to authenticated with check (bucket_id = 'company-assets');

drop policy if exists "company_assets_authenticated_update" on storage.objects;
create policy "company_assets_authenticated_update" on storage.objects
    for update to authenticated using (bucket_id = 'company-assets') with check (bucket_id = 'company-assets');

drop policy if exists "company_assets_authenticated_delete" on storage.objects;
create policy "company_assets_authenticated_delete" on storage.objects
    for delete to authenticated using (bucket_id = 'company-assets');
