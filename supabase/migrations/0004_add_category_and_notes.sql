-- Migration 0004: Add category and notes to expenses table
alter table public.expenses
add column if not exists category text default 'General',
add column if not exists notes text;
