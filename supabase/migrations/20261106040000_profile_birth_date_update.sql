-- Meu perfil: o usuário pode corrigir a própria data de nascimento (a coluna não estava liberada para UPDATE,
-- então o "Salvar" falhava). Só esta coluna; status de assinatura e is_admin continuam bloqueados.
GRANT UPDATE (birth_date) ON public.profiles TO authenticated;
