-- =============================================================================
-- PropFlow 0006 — listing photography leaves the public bucket.
--
-- Why this file exists:
--   0002 created `property-images` with public = true, so every object was
--   readable by anyone who could name it. A draft, sold, or unpublished listing
--   could therefore have its photographs fetched anonymously even though the
--   listing itself was invisible: the public RPC filtered on
--   status = 'published' and is_available, but the Storage bucket had no notion
--   of publication at all.
--
-- The bucket is now private. Nothing in it is served by bucket URL any more.
-- Images reach the browser only through the server-authorized
-- `/listing-image/<storage_path>` route, which re-checks publication state per
-- request. Unlisting a listing immediately removes its photographs instead of
-- leaving them readable until a CDN cache expires.
--
-- Trade-off: image bytes now traverse the Next.js server, so each uncached
-- image is one Storage fetch. In exchange there is a single, auditable place
-- where "may this visitor see this photograph" is decided, and no public URL
-- survives an unlisting.
-- =============================================================================

update storage.buckets
   set public = false
 where id = 'property-images';

-- An anonymous storage SELECT policy must never exist here. 0002 correctly
-- created none, but that is only safe while the bucket is private, so the
-- posture is asserted rather than assumed: if any anon policy has been added to
-- storage.objects for this bucket, this migration fails loudly.
do $$
declare
  anon_policy text;
begin
  select pol.polname into anon_policy
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_roles r on r.oid = any (pol.polroles)
   where n.nspname = 'storage'
     and c.relname = 'objects'
     and pol.polcmd = 'r'
     and r.rolname = 'anon'
     and (
       pol.polqual::text like '%property-images%'
       or coalesce(pol.polwithcheck::text, '') like '%property-images%'
     )
   limit 1;

  if anon_policy is not null then
    raise exception
      'anonymous read policy % would expose private listing images', anon_policy;
  end if;
end;
$$;