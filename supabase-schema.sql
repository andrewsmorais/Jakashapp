-- ==========================================
-- JAKASH - SUPABASE SCHEMA COMPLETÃO
-- ==========================================

-- 1. ENUMS
CREATE TYPE transaction_type AS ENUM ('income', 'expense');
CREATE TYPE transaction_origin AS ENUM ('manual', 'whatsapp', 'open_finance');
CREATE TYPE goal_status AS ENUM ('in_progress', 'completed', 'cancelled');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled', 'unpaid');
CREATE TYPE subscription_plan AS ENUM ('zap', 'piloto', 'cnpj');

-- 2. TABELAS

-- Profiles (estende a tabela de usuários nativa do auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    whatsapp_number TEXT,
    cpf_cnpj TEXT,
    asaas_customer_id TEXT,
    subscription_status subscription_status DEFAULT 'trial',
    subscription_plan subscription_plan DEFAULT 'zap',
    subscription_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Categories
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL se for categoria global/padrão
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    type transaction_type NOT NULL,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT NOT NULL,
    type transaction_type NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    origin transaction_origin DEFAULT 'manual',
    receipt_url TEXT,
    is_recurring BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Goals (Metas Financeiras)
CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    target_amount DECIMAL(12, 2) NOT NULL,
    current_amount DECIMAL(12, 2) DEFAULT 0,
    deadline DATE,
    status goal_status DEFAULT 'in_progress',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Goal Contributions (Aportes nas metas)
CREATE TABLE goal_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Chat History (Logs da IA no WhatsApp)
CREATE TABLE chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_role TEXT NOT NULL CHECK (message_role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Open Finance Connections
CREATE TABLE open_finance_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    institution_id TEXT NOT NULL,
    institution_name TEXT NOT NULL,
    item_id TEXT NOT NULL, -- ID do Pluggy ou afim
    status TEXT NOT NULL,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Waitlist (Para o plano MEI/CNPJ e Open Finance)
CREATE TABLE waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    feature TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. TRIGGERS & FUNCTIONS

-- Trigger: Update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_goals_updated_at
    BEFORE UPDATE ON goals
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Trigger: Atualiza current_amount da Meta após Aporte
CREATE OR REPLACE FUNCTION update_goal_current_amount()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE goals SET current_amount = current_amount + NEW.amount WHERE id = NEW.goal_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE goals SET current_amount = current_amount - OLD.amount WHERE id = OLD.goal_id;
    ELSIF TG_OP = 'UPDATE' THEN
        UPDATE goals SET current_amount = current_amount - OLD.amount + NEW.amount WHERE id = NEW.goal_id;
    END IF;
    RETURN NULL;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_goal_amount
    AFTER INSERT OR UPDATE OR DELETE ON goal_contributions
    FOR EACH ROW EXECUTE PROCEDURE update_goal_current_amount();

-- Trigger: Cria profile ao criar usuário no auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, whatsapp_number)
  VALUES (
      new.id, 
      COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário Jakash'),
      new.raw_user_meta_data->>'whatsapp_number'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE open_finance_connections ENABLE ROW LEVEL SECURITY;

-- Políticas Profiles
CREATE POLICY "Usuários veem próprio perfil" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuários atualizam próprio perfil" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Políticas Categories (Permite ver as defaults ou as do usuário)
CREATE POLICY "Ver categorias padrão e próprias" ON categories FOR SELECT USING (is_default = true OR auth.uid() = user_id);
CREATE POLICY "Criar próprias categorias" ON categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Atualizar próprias categorias" ON categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Deletar próprias categorias" ON categories FOR DELETE USING (auth.uid() = user_id);

-- Políticas Transactions
CREATE POLICY "Acesso total às próprias transações" ON transactions FOR ALL USING (auth.uid() = user_id);

-- Políticas Goals
CREATE POLICY "Acesso total às próprias metas" ON goals FOR ALL USING (auth.uid() = user_id);

-- Políticas Goal Contributions
CREATE POLICY "Acesso aos aportes das próprias metas" ON goal_contributions FOR ALL USING (
    goal_id IN (SELECT id FROM goals WHERE user_id = auth.uid())
);

-- Políticas Chat History
CREATE POLICY "Acesso ao próprio histórico de chat" ON chat_history FOR ALL USING (auth.uid() = user_id);

-- Políticas Open Finance Connections
CREATE POLICY "Acesso às próprias conexões" ON open_finance_connections FOR ALL USING (auth.uid() = user_id);


-- 5. SEED: CATEGORIAS PADRÃO
INSERT INTO categories (name, icon, color, type, is_default) VALUES
    ('Alimentação', '🛒', '#FFB74D', 'expense', true),
    ('Transporte', '🚗', '#64B5F6', 'expense', true),
    ('Moradia', '🏠', '#81C784', 'expense', true),
    ('Lazer', '🎉', '#BA68C8', 'expense', true),
    ('Saúde', '💊', '#E57373', 'expense', true),
    ('Educação', '📚', '#4DD0E1', 'expense', true),
    ('Compras', '🛍️', '#F06292', 'expense', true),
    ('Serviços', '⚙️', '#90A4AE', 'expense', true),
    ('Taxas/Impostos', '🏛️', '#FF8A65', 'expense', true),
    ('Outros', '📦', '#BCAAA4', 'expense', true),
    ('Salário', '💼', '#4CAF50', 'income', true),
    ('Rendimentos', '📈', '#81C784', 'income', true),
    ('Pix / Transferência', '💸', '#4DB6AC', 'income', true);
