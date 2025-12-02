-- Add shipping_discount_percent column to payment_requests table
-- This column stores the percentage discount applied to shipping costs

alter table if exists public.payment_requests
  add column if not exists shipping_discount_percent numeric(5,2) not null default 0
  check (shipping_discount_percent >= 0 and shipping_discount_percent <= 100);

-- Add comment to document the column
comment on column public.payment_requests.shipping_discount_percent is 
'Percentage discount applied to shipping fee (0-100)';

-- Optional: Add an index if you plan to query by this field frequently
-- create index if not exists idx_payment_requests_shipping_discount 
-- on public.payment_requests (shipping_discount_percent) where shipping_discount_percent > 0;
