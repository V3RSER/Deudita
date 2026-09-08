begin;

update public.entity_email_patterns
set pattern = trim(pattern)
where pattern <> trim(pattern);

delete from public.entity_email_patterns a
using public.entity_email_patterns b
where a.id > b.id
  and a.entity_id = b.entity_id
  and a.pattern = b.pattern;

alter table public.entity_email_patterns
  drop constraint if exists entity_email_patterns_pattern_has_at;

alter table public.entity_email_patterns
  add constraint entity_email_patterns_pattern_has_at
  check (position('@' in pattern) > 0);

create unique index if not exists entity_email_patterns_entity_pattern_uidx
  on public.entity_email_patterns(entity_id, pattern);

commit;
