-- Migration date: 2026-11-25

-- The workflow catalogue, its asset table, the catalogue replacement function
-- and the Vercel secret schema carried the upstream Mike names. Rename them for
-- LinkMai so both upgraded and fresh databases expose the same identifiers.
-- Every step is guarded: a database that already uses the new names, or a
-- deployment that re-runs this file, converges on backend/schema.sql.

do $$
begin
  if to_regclass('public.mike_workflows') is not null
     and to_regclass('public.linkmai_workflows') is null then
    alter table public.mike_workflows rename to linkmai_workflows;
  end if;

  if to_regclass('public.mike_workflow_assets') is not null
     and to_regclass('public.linkmai_workflow_assets') is null then
    alter table public.mike_workflow_assets rename to linkmai_workflow_assets;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'linkmai_workflow_assets'
      and column_name = 'mike_workflow_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'linkmai_workflow_assets'
      and column_name = 'linkmai_workflow_id'
  ) then
    alter table public.linkmai_workflow_assets
      rename column mike_workflow_id to linkmai_workflow_id;
  end if;
end
$$;

do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      ('linkmai_workflows', 'mike_workflows_pkey', 'linkmai_workflows_pkey'),
      ('linkmai_workflows', 'mike_workflows_key_hash_unique', 'linkmai_workflows_key_hash_unique'),
      ('linkmai_workflows', 'mike_workflows_distribution_check', 'linkmai_workflows_distribution_check'),
      ('linkmai_workflows', 'mike_workflows_type_check', 'linkmai_workflows_type_check'),
      ('linkmai_workflows', 'mike_workflows_source_commit_check', 'linkmai_workflows_source_commit_check'),
      ('linkmai_workflows', 'mike_workflows_content_hash_check', 'linkmai_workflows_content_hash_check'),
      ('linkmai_workflow_assets', 'mike_workflow_assets_pkey', 'linkmai_workflow_assets_pkey'),
      ('linkmai_workflow_assets', 'mike_workflow_assets_name_unique', 'linkmai_workflow_assets_name_unique'),
      ('linkmai_workflow_assets', 'mike_workflow_assets_hash_check', 'linkmai_workflow_assets_hash_check'),
      ('linkmai_workflow_assets', 'mike_workflow_assets_mike_workflow_id_fkey', 'linkmai_workflow_assets_linkmai_workflow_id_fkey')
    ) as t(tbl, old_name, new_name)
  loop
    if to_regclass('public.' || item.tbl) is not null
       and exists (
         select 1 from pg_constraint
         where conname = item.old_name
           and conrelid = to_regclass('public.' || item.tbl)
       )
       and not exists (
         select 1 from pg_constraint
         where conname = item.new_name
           and conrelid = to_regclass('public.' || item.tbl)
       ) then
      execute format(
        'alter table public.%I rename constraint %I to %I',
        item.tbl, item.old_name, item.new_name
      );
    end if;
  end loop;
end
$$;

do $$
declare
  item record;
begin
  for item in
    select *
    from (values
      ('mike_workflows_active_key_idx', 'linkmai_workflows_active_key_idx'),
      ('mike_workflows_active_distribution_type_idx', 'linkmai_workflows_active_distribution_type_idx'),
      ('mike_workflows_active_pack_idx', 'linkmai_workflows_active_pack_idx')
    ) as t(old_name, new_name)
  loop
    if exists (
         select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = item.old_name
           and c.relkind = 'i'
       )
       and not exists (
         select 1 from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = item.new_name
           and c.relkind = 'i'
       ) then
      execute format('alter index public.%I rename to %I', item.old_name, item.new_name);
    end if;
  end loop;
end
$$;

do $$
begin
  if to_regprocedure('public.replace_mike_workflows(text, jsonb)') is not null
     and to_regprocedure('public.replace_linkmai_workflows(text, jsonb)') is null then
    alter function public.replace_mike_workflows(text, jsonb)
      rename to replace_linkmai_workflows;
  end if;

  drop function if exists public.replace_mike_workflows(text, jsonb);
end
$$;

-- Both catalogue functions resolve table and row types at execution time, so
-- recreate them against the renamed objects. CREATE OR REPLACE keeps their
-- existing grants while converging the stored bodies.
create or replace function public.replace_linkmai_workflows(
  p_source_commit text,
  p_workflows jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  asset_item jsonb;
  asset_items jsonb;
  jurisdiction_values text[];
  workflow_uuid uuid;
begin
  if p_source_commit !~ '^[0-9a-f]{40}$' then
    raise exception 'invalid workflow catalog source commit';
  end if;
  if jsonb_typeof(p_workflows) <> 'array' then
    raise exception 'workflow catalog payload must be an array';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('linkmai_workflows', 0));
  update public.linkmai_workflows set active = false where active;

  for item in select value from jsonb_array_elements(p_workflows)
  loop
    jurisdiction_values := null;
    if jsonb_typeof(item->'jurisdictions') = 'array' then
      select array_agg(value)
        into jurisdiction_values
      from jsonb_array_elements_text(item->'jurisdictions');
    end if;

    insert into public.linkmai_workflows (
      workflow_key, distribution, version, title, description, type,
      prompt_md, columns_config, contributors, language, practice,
      jurisdictions, pack_key, pack_title, pack_description, pack_version,
      default_sort_order, quick_action_name, quick_action_prompt,
      document_upload, word_quick_action, word_quick_action_prompt,
      source_commit, content_hash, active, updated_at
    ) values (
      item->>'workflow_key',
      item->>'distribution',
      nullif(item->>'version', ''),
      item->>'title',
      nullif(item->>'description', ''),
      item->>'type',
      nullif(item->>'prompt_md', ''),
      case when jsonb_typeof(item->'columns_config') = 'array'
        then item->'columns_config' else null end,
      case when jsonb_typeof(item->'contributors') = 'array'
        then item->'contributors' else '[]'::jsonb end,
      nullif(item->>'language', ''),
      nullif(item->>'practice', ''),
      jurisdiction_values,
      nullif(item->>'pack_key', ''),
      nullif(item->>'pack_title', ''),
      nullif(item->>'pack_description', ''),
      nullif(item->>'pack_version', ''),
      nullif(item->>'default_sort_order', '')::integer,
      nullif(item->>'quick_action_name', ''),
      nullif(item->>'quick_action_prompt', ''),
      coalesce((item->>'document_upload')::boolean, false),
      coalesce((item->>'word_quick_action')::boolean, false),
      nullif(item->>'word_quick_action_prompt', ''),
      p_source_commit,
      item->>'content_hash',
      true,
      now()
    )
    on conflict (workflow_key, content_hash) do update set
      distribution = excluded.distribution,
      version = excluded.version,
      title = excluded.title,
      description = excluded.description,
      type = excluded.type,
      prompt_md = excluded.prompt_md,
      columns_config = excluded.columns_config,
      contributors = excluded.contributors,
      language = excluded.language,
      practice = excluded.practice,
      jurisdictions = excluded.jurisdictions,
      pack_key = excluded.pack_key,
      pack_title = excluded.pack_title,
      pack_description = excluded.pack_description,
      pack_version = excluded.pack_version,
      default_sort_order = excluded.default_sort_order,
      quick_action_name = excluded.quick_action_name,
      quick_action_prompt = excluded.quick_action_prompt,
      document_upload = excluded.document_upload,
      word_quick_action = excluded.word_quick_action,
      word_quick_action_prompt = excluded.word_quick_action_prompt,
      source_commit = excluded.source_commit,
      active = true,
      updated_at = now()
    returning id into workflow_uuid;

    delete from public.linkmai_workflow_assets
    where linkmai_workflow_id = workflow_uuid;

    -- reference_files remains a rollout-only alias for catalog payloads
    -- produced immediately before workflow assets were renamed.
    asset_items := coalesce(item->'assets', item->'reference_files');
    if asset_items is not null then
      if jsonb_typeof(asset_items) <> 'array' then
        raise exception 'workflow assets must be an array';
      end if;
      for asset_item in
        select value from jsonb_array_elements(asset_items)
      loop
        insert into public.linkmai_workflow_assets (
          linkmai_workflow_id, filename, file_type, storage_path,
          size_bytes, content_hash
        ) values (
          workflow_uuid,
          asset_item->>'filename',
          asset_item->>'file_type',
          asset_item->>'storage_path',
          nullif(asset_item->>'size_bytes', '')::integer,
          asset_item->>'content_hash'
        );
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.install_missing_default_workflows(
  p_user_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_item public.linkmai_workflows%rowtype;
  workflow_uuid uuid;
  installed_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id, 0));

  for catalog_item in
    select catalog.*
    from public.linkmai_workflows catalog
    where catalog.active
      and catalog.distribution = 'default'
    order by catalog.default_sort_order nulls last, catalog.workflow_key
  loop
    if exists (
      select 1
      from public.default_workflow_installations installation
      where installation.user_id::text = p_user_id
        and installation.default_key = catalog_item.workflow_key
    ) then
      continue;
    end if;

    insert into public.workflows (
      user_id, title, type, prompt_md, columns_config,
      language, practice, jurisdictions
    ) values (
      p_user_id::uuid,
      catalog_item.title,
      catalog_item.type,
      catalog_item.prompt_md,
      catalog_item.columns_config,
      coalesce(nullif(catalog_item.language, ''), 'English'),
      coalesce(nullif(catalog_item.practice, ''), 'General Transactions'),
      coalesce(catalog_item.jurisdictions, array['General']::text[])
    )
    returning id into workflow_uuid;

    insert into public.default_workflow_installations (
      user_id, default_key, workflow_id
    ) values (
      p_user_id::uuid, catalog_item.workflow_key, workflow_uuid
    );

    if catalog_item.type = 'assistant'
       and catalog_item.quick_action_name is not null then
      insert into public.quick_actions (
        user_id, workflow_id, name, prompt, document_upload,
        enabled, sort_order, surface
      ) values (
        p_user_id::uuid,
        workflow_uuid,
        catalog_item.quick_action_name,
        coalesce(catalog_item.quick_action_prompt, ''),
        catalog_item.document_upload,
        true,
        coalesce(catalog_item.default_sort_order, installed_count),
        'app'
      );

      if catalog_item.word_quick_action then
        insert into public.quick_actions (
          user_id, workflow_id, name, prompt, document_upload,
          enabled, sort_order, surface
        ) values (
          p_user_id::uuid,
          workflow_uuid,
          catalog_item.quick_action_name,
          coalesce(
            catalog_item.word_quick_action_prompt,
            'Execute this workflow on this Word document.'
          ),
          false,
          true,
          coalesce(catalog_item.default_sort_order, installed_count),
          'word'
        );
      end if;
    end if;

    installed_count := installed_count + 1;
  end loop;

  return installed_count;
end;
$$;

-- vercel-start.sh keeps deployment secrets in a schema it creates on boot.
-- Rename it in place so existing deployments keep their values.
do $$
begin
  if exists (
    select 1 from pg_namespace where nspname = 'mike_deploy'
  ) and not exists (
    select 1 from pg_namespace where nspname = 'linkmai_deploy'
  ) then
    alter schema mike_deploy rename to linkmai_deploy;
  end if;
end
$$;
