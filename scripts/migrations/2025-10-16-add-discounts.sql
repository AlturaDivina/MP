-- Create discount_codes table
create table if not exists public.discount_codes (
  id bigserial primary key,
  code text not null,
  percent_off numeric(5,2) not null check (percent_off > 0 and percent_off <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure case-insensitive uniqueness of code
create unique index if not exists discount_codes_code_unique_ci on public.discount_codes (lower(code));

-- Optional: keep codes in uppercase for consistency
-- alter table public.discount_codes add constraint discount_codes_code_upper check (code = upper(code));

-- Trigger to update updated_at (requires a helper function if not present)
-- If your DB has a generic trigger function, uncomment and adjust. Otherwise, you can skip this.
-- create or replace function public.set_updated_at()
-- returns trigger as $$
-- begin
--   new.updated_at = now();
--   return new;
-- end;
-- $$ language plpgsql;
-- drop trigger if exists tr_discount_codes_updated_at on public.discount_codes;
-- create trigger tr_discount_codes_updated_at before update on public.discount_codes
-- for each row execute function public.set_updated_at();

-- Add discount fields to payment_requests table
alter table if exists public.payment_requests
  add column if not exists discount_code text,
  add column if not exists discount_percent numeric(5,2) not null default 0,
  add column if not exists discount_amount numeric(10,2) not null default 0;

-- Example seed (optional):
-- insert into public.discount_codes (code, percent_off, active)
-- values ('ALTURA10', 10, true)
-- on conflict (code) do nothing;
