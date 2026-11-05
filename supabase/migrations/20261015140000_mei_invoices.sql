-- Tabela de recibos/notas do MEI: registra números, clientes e valores das faturas emitidas (sem integração com sistema fiscal)
create table if not exists mei_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  invoice_number integer not null,
  client_id uuid references mei_clients on delete set null,
  client_name text,
  value decimal(12, 2) not null,
  invoice_date date not null,
  notes text,
  created_at timestamp with time zone default now(),
  unique(user_id, invoice_number)
);

-- RLS: cada pessoa vê só seus próprios recibos
alter table mei_invoices enable row level security;
create policy "users_own_invoices" on mei_invoices for all to authenticated
  using (auth.uid() = user_id);

-- Grant para a sessão da pessoa
grant select, insert, update, delete on mei_invoices to authenticated;

-- Índice para buscar rápido por usuário e data
create index idx_mei_invoices_user_date on mei_invoices(user_id, invoice_date desc);
