// Manual de uso do Jakash para o chat de ajuda (Configurações > Fale conosco). Escrito a partir do código das telas em 06/11/2026.
// Ao mudar uma tela, atualize aqui para o chat não explicar o que não existe mais.
export const APP_USAGE_MANUAL = `# MANUAL DO APP (rótulos como aparecem na tela)

IMPORTANTE: o Jakash só ANOTA e organiza. Ele não paga contas nem faturas, não faz transferência, Pix, depósito, resgate ou compra de investimento, e não acessa o banco. Todo botão de "pagar", "aportar" ou "resgatar" apenas REGISTRA algo que a pessoa já fez fora do app.

## Navegação
- Celular: barra de baixo com Início, Lançamentos, botão "+" (Novo lançamento), Supermercado e Menu. A engrenagem no topo abre Configurações. "Menu" abre a tela com todos os grupos.
- Computador: menu lateral com botão "Novo lançamento" e os grupos HOJE (Início, Lançamentos, Supermercado, Contas a pagar e receber), MEU DINHEIRO (Contas e cartões, Dívidas, Guardar), PLANEJAR (Orçamento do mês, Relatórios), TRABALHO (Motorista), e embaixo Chat da Jaki e Configurações.
- Abas dentro das telas: Contas e cartões (Contas bancárias, Cartões, Parcelamentos); Guardar (Objetivos, Reserva, Investimentos, Simulador, Viagem); Orçamento do mês (Limites, Planejamento).
- Categorias fica em Configurações > Categorias.

## Primeiro acesso (Bem-vindo)
Passos: idioma, como vai usar ("Uso pessoal" ou "Casal"), suas contas (nome e saldo), receita fixa, despesa fixa (descrição, valor e dia do mês; viram contas mensais), quanto quer gastar por mês (limite geral e por categoria), lembretes. Dá para "Pular tudo" ou "Configurar depois". Conexão automática com o banco (Open Finance) ainda não existe.

## Início
- Olho no topo esconde ou mostra os valores. Setas mudam o mês; dá para abrir um calendário.
- "Saldo atual" é a soma das contas bancárias ativas. Receita = Recebido + A receber. Despesas = Pago + A pagar. Balanço = Receita - Despesas. "Saldo previsto" = saldo atual + a receber - a pagar - faturas de cartão em aberto.
- Blocos: Minhas contas, Cartões (próxima fatura), Gráfico por categoria (Despesas, Receitas, A pagar), Meus limites de gastos, Meus objetivos, Meus investimentos, Últimos lançamentos, Próximas contas.
- "Primeiros passos" aparece nos primeiros 14 dias e pode ser fechado no X.

## Lançamentos e "+ Novo lançamento"
- Tela Lançamentos: botão "Importar extrato"; filtro de período (Hoje, Esta semana, Este mês, Escolher datas); totais de Receitas, Despesas e Saldo; formulário rápido (Descrição, Valor, Tipo, Categoria, Data, "Adicionar"); filtros Todas, Despesas, Receitas. Em cada linha: clipe para anexar ou ver comprovante (PDF ou imagem até 4 MB) e lixeira para excluir (exclui direto; em compra parcelada pergunta "Só esta parcela" ou "Todas as parcelas").
- Janela "Novo lançamento" (botão "+"): abas Despesa e Receita; valor grande no topo; Descrição (obrigatória); Categoria e Subcategoria (opcionais; a subcategoria só libera depois da categoria). Forma de pagamento: Conta, Crédito ou Débito (Crédito e Débito aparecem se houver cartão cadastrado).
  - Conta: escolhe a conta (vazio = conta principal). A chave "Já paguei" (ou "Já recebi"): se desligada, o item não vira lançamento, vira conta em Contas a pagar e receber, no "Dia que vence". Ligada: "Dia em que paguei", "Vence no mesmo dia" e "Contar em outro mês".
  - Crédito: escolhe o cartão e as Parcelas (À vista até 24x). O valor é o total da compra, dividido em parcelas. A tela mostra em qual fatura entra. O dinheiro só sai da conta quando a fatura é paga.
  - Débito: escolhe o cartão de débito; sai na hora da conta ligada a ele.
  - "Despesa recorrente" ou "Receita recorrente" marca como fixo (não vale no crédito).
  - "Repetir nos próximos meses": de quanto em quanto tempo (Todo mês, Toda semana, Todo ano) e quantas vezes (2 a 60). O primeiro entra agora e os outros viram contas a pagar ou receber (não vale no crédito). Serve para Netflix, aluguel etc.
  - "Anexar comprovante (opcional)" (não vale se ficou como conta a pagar).
  - Voz: botão "Falar o lançamento" (aparece se o aparelho permite). Toque, fale (ex.: "gastei 50 no almoço") e toque de novo para parar. Ele só preenche o formulário; a pessoa confere e toca em Salvar.
  - "Enviar arquivo" (PDF, foto, planilha, OFX ou CSV) leva para a importação.

## Importar extrato
- Caminho: Lançamentos > "Importar extrato". Precisa ter ao menos uma conta bancária ou cartão de crédito.
- Passos: em "Onde importar" escolha Conta bancária ou Cartão de crédito; "Escolher arquivo" (.xlsx, .xls, CSV, OFX, PDF ou foto, até 4 MB); revise a lista (caixas marcadas, categoria sugerida, avisos); toque em "Importar".
- PDF e foto são lidos por IA: confira datas, valores e se é entrada ou saída. Chave "Inverter entradas e saídas" se as despesas vieram como receitas. Lançamentos que já existem são ignorados.

## Contas a pagar e receber
- Topo: totais A pagar e A receber. Formulário: Descrição, Valor, Vencimento, Tipo (A pagar ou A receber), Repete (Não ou Todo mês) e "Adicionar conta".
- Filtro: Tudo (padrão), Hoje, Esta semana, Este mês, Escolher datas (pelo vencimento).
- Em cada conta: botão "Paguei" (ou "Recebi") e lixeira (exclui direto). O app não paga a conta; "Paguei" anota que a pessoa já pagou. Ao dar baixa: a conta sai das pendentes e entra um lançamento com a mesma descrição e valor, com a data de hoje, sem categoria, na conta principal. Se era "Todo mês", cria a próxima. Se for parcela de acordo de dívida, abate a dívida.

## Contas bancárias
- Botão "Adicionar conta": Nome, Tipo (Conta corrente, Poupança, Dinheiro, Investimento), Instituição, Saldo atual. Ao editar, digitar o saldo certo ajusta a conta.
- Abas Ativas e Arquivadas; Editar, Arquivar e Restaurar. Não há excluir conta; arquivada sai do saldo total.

## Cartões
- "Adicionar cartão": escolha Crédito ou Débito (não muda depois). Crédito: Nome, Instituição, Bandeira, Limite, Dia de fechamento, Dia de vencimento e (opcional) conta que paga a fatura. Débito: Nome, Bandeira e a conta de onde o débito sai (obrigatória).
- Na lista: fatura atual, vencimento, barra do limite usado e situação (Aberta, Fechada, Vencida, Paga, Sem compras). Dentro do Editar existe "Excluir cartão" (apaga as compras e pagamentos dele).
- Fatura (toque no cartão): navegue por mês; vê Total, Fecha em, Vence em, Pago e Falta pagar. "Nova compra" abre o lançamento já no cartão. "Pagar fatura" (o pagamento de verdade é feito no banco; aqui a pessoa ANOTA que pagou): informe Valor (pode ser parcial), Data e "Sai da conta" (a conta cujo saldo anotado diminui; pode escolher "Não descontar") e toque em "Registrar pagamento". Isso não move dinheiro: só deixa a fatura e o saldo certos no app. O pagamento não conta como nova despesa (as compras já estão nas despesas). Em "Pagamentos" dá para excluir um pagamento anotado.
- Mudar o dia de fechamento vale para as próximas compras.

## Parcelamentos
Não se cadastra nada: as compras parceladas no cartão aparecem sozinhas, com progresso, "faltam N", última parcela, parcelas do mês e gráfico dos próximos 12 meses.

## Dívidas
- Formulário: Nome, Tipo, Saldo devedor, Juros ao mês (%), Parcela mínima; "Mais detalhes" (Credor, Situação, Atrasada desde, Proposta à vista, Essencial); botão "Adicionar dívida".
- Situações: Em dia, Atrasada, Negativada, Negociada, Quitada.
- "Pagou?" + "Abater": anota um pagamento já feito e diminui o saldo da dívida no app (o pagamento é feito fora do app) (ao chegar a zero vira Quitada). Abater não cria lançamento nem mexe no saldo das contas.
- "Registrar acordo": Parcelas (1 a 60), Valor de cada, "1ª parcela vence em" e "Criar parcelas": cada parcela vira uma conta a pagar; ao dar baixa nelas o saldo da dívida abate.
- "Sair do vermelho": informe quanto consegue pagar por mês e toque em "Montar meu plano" para ver a ordem para pagar.

## Guardar
- Objetivos: a tela mostra a lista dos objetivos (barra de progresso, quanto guardou, quanto falta e "Guarde R$ X por mês" se tem data). Para criar, toque em "Novo objetivo" e escolha o Tipo (Viagem, Chegada do bebê, Reserva de emergência, Carro etc.) e o Ícone nas listas; preencha Nome, Valor-alvo, Já guardado e Data-alvo (opcional) e toque em "Criar objetivo". Em cada objetivo, "Aportar" abre o campo para anotar quanto a pessoa separou (o app só anota; o dinheiro é guardado por ela no banco) e "Histórico" mostra os aportes anotados. No começo do mês pode aparecer "Sobrou R$ X" com o botão "Guardar". O link "Abrir o Simulador" leva às contas de quanto guardar.
- Reserva: calcula a meta com a média dos gastos essenciais dos últimos 3 meses e "Meses de cobertura" (3 a 12); botão "Transformar em objetivo".
- Investimentos: "Adicionar investimento" (Nome, Tipo, Instituição, Quanto aplicou, Valor atual). Em cada um: Aporte, Resgate, Atualizar valor, Histórico, Editar, Arquivar. Aporte e Resgate só ANOTAM o que a pessoa fez na corretora ou no banco; o app não aplica nem resgata de verdade. O registro é manual; o app não busca cotações nem conecta a corretoras.
- Simulador e Viagem saíram de Guardar: agora ficam em Ferramentas > Simulador (veja abaixo).

## Simulador (menu Ferramentas, acima do Chat da Jaki)
Só faz contas com o que a pessoa digita; não guarda nem paga nada.
- No topo, "Uma ordem que costuma funcionar": 1) quitar dívidas com juros altos, 2) reserva de emergência, 3) objetivos. Se a pessoa tem dívidas com juros cadastradas, mostra a mais cara.
- Aba "Guardar dinheiro", com três perguntas:
  - "Em quanto tempo?": informe quanto custa o objetivo e quanto consegue guardar por mês. Ex.: R$ 5.000 guardando R$ 200 por mês = 25 meses.
  - "Quanto guardar?": informe o valor e o mês em que quer chegar ("Quero chegar até"); mostra quanto guardar por mês.
  - "Quanto vou ter?": informe quanto guarda por mês e até quando; mostra o total.
  - "Somar item por item": lista de itens do objetivo (ex.: bebê: pré-natal, parto, enxoval, quarto) com os valores em branco para a pessoa preencher, mais folga para imprevistos.
  - "Já tenho guardado" e "Rendimento do dinheiro guardado (opcional)", em % ao mês ou ao ano.
  - Avisa se o valor por mês cabe na sobra média dos últimos 3 meses. Botão "Criar objetivo com esses números" cria em Guardar > Objetivos.
  - Para viagem há o link do simulador de viagem detalhado (dias, pessoas, parcelar no cartão).
- Aba "Adiantar parcelas" (financiamento de carro, empréstimo, parcelado com juros):
  - Preencha "Valor da parcela", "Parcelas que faltam" e "Juros do contrato". Sem saber os juros, toque em "Não sei os juros" e informe o valor financiado e o total de parcelas: o app calcula a taxa.
  - Dá para puxar a taxa de uma dívida cadastrada.
  - "Como quer adiantar": número de parcelas, um valor que tem, ou quitar tudo. Mostra quanto paga hoje, a economia de juros, quantas parcelas continuam e quando o contrato termina. Adianta sempre as ÚLTIMAS parcelas, que têm mais juros.
  - "Adiantar ou guardar o dinheiro?": informe quanto o dinheiro guardado rende e o app compara as duas escolhas.
  - É estimativa (tabela Price): o valor exato para antecipar é o que o banco informar. O adiantamento é feito pela pessoa com o banco.

## Orçamento do mês
- Limites: navegue por mês; "Adicionar" ou o lápis em "Gastos planejados" (limite geral); escolha a Categoria (ou "Limite geral do mês") e o Limite mensal. Barra de "Atenção" a partir de 80% e "Limite estourado" a partir de 100%. Vale para todos os meses até mudar.
- Planejamento: "Quanto posso gastar hoje", compromissos dos próximos 6 meses, fluxo de caixa de 60 dias, assinaturas e recorrências (aparecem depois de 3 meses de lançamentos parecidos; botão "Lembrar") e estratégia para quitar dívidas.

## Relatórios
Filtro de período (Hoje, Esta semana, Este mês, Escolher datas). Mostra Receitas, Despesas, Resultado, "Essencial x não essencial" e "Despesas por categoria". Botão "CSV" exporta o período.

## Categorias (Configurações > Categorias)
"Adicionar categoria", abas Despesas e Receitas, busca e "Subcategoria" em cada uma. A marca "Essencial" (despesas) alimenta Reserva e Relatórios. As categorias criadas pela pessoa têm Editar e Excluir (os lançamentos ficam sem categoria). As prontas só podem ser escondidas (olho) e voltam em "Categorias prontas escondidas" com o botão "Usar".

## Configurações
Itens: Meu perfil, Preferências, Notificações, Categorias, Aparência, Planos e assinatura, Dados, Fale conosco, "Sair da conta". No app do iPhone há também o bloqueio com Face ID.
- Meu perfil: foto ("Tirar foto" ou "Escolher da galeria"), Nome completo, Data de nascimento. O e-mail não muda no app; para trocar, falar com o suporte.
- Preferências: idioma Português (Brasil); a Moeda só muda o símbolo e o formato, sem converter valores.
- Notificações: "Habilitar notificações", "Enviar teste", avisos por e-mail e "Quando notificar" (no dia, 1, 3 ou 7 dias antes); "Salvar configurações". Os lembretes saem uma vez por dia, de manhã.
- Aparência: tema Claro ou Escuro e cor do tema.
- Dados: "Exportar meus dados" (escolhe itens, período e formato CSV em .zip ou JSON); "Começar do zero" (marca o que apagar e digita APAGAR; não desfaz); "Excluir minha conta" (digita EXCLUIR; definitivo e a assinatura da App Store não é cancelada junto: cancele em Ajustes do iPhone > seu nome > Assinaturas).
- Planos e assinatura: Mensal R$ 19,90 por mês e Anual R$ 159,00 por ano, os dois com 7 dias grátis, comprados no app do iPhone pela App Store. No site só mostra os planos; o botão "Já assinei no iPhone" confere de novo. Cancelar ou gerenciar é nos Ajustes do iPhone.
`;
