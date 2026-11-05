import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { z } from 'zod';
import { authorizeVoice, refundAiUse, reserveAiUse } from '@/lib/voiceServer';
import { DRAFT_JSON_SCHEMA, EMPTY_DRAFT, sanitizeDraft, voicePrompt } from '@/lib/voiceDraft';

// Lançamento por voz, plano B: quando o texto falado não traz valor ou tipo, a IA monta um RASCUNHO.
// Nada é salvo aqui: a tela preenche o formulário e a pessoa confere e toca em Salvar. A frase é tratada só como dado.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(2).max(300),
  categories: z.array(z.string().trim().min(1).max(60)).max(80).default([]),
});

export async function POST(request: Request) {
  try {
    const ctx = await authorizeVoice();
    if (ctx instanceof NextResponse) return ctx;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Frase inválida (até 300 caracteres).' }, { status: 400 });
    const { text, categories } = parsed.data;

    const blocked = await reserveAiUse(ctx, 'voice/parse');
    if (blocked) return blocked;

    try {
      const completion = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
        model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_schema', json_schema: { ...DRAFT_JSON_SCHEMA, schema: { ...DRAFT_JSON_SCHEMA.schema } } },
        messages: [
          { role: 'system', content: voicePrompt(ctx.today) },
          { role: 'user', content: JSON.stringify({ frase: text, categorias: categories }) },
        ],
      });
      let raw: unknown = null;
      try { raw = JSON.parse(completion.choices[0]?.message?.content ?? 'null'); } catch { /* resposta fora do formato: rascunho vazio */ }
      const draft = raw ? sanitizeDraft(raw, { today: ctx.today, categories }) : { ...EMPTY_DRAFT };
      return NextResponse.json({ draft });
    } catch (e) {
      await refundAiUse(ctx);
      console.error('[voice/parse]', (e as Error).message);
      return NextResponse.json({ error: 'Não consegui entender agora. Tente de novo ou digite o lançamento.' }, { status: 502 });
    }
  } catch (e) {
    console.error('[voice/parse] erro', (e as Error).message);
    return NextResponse.json({ error: 'Erro interno ao entender a frase.' }, { status: 500 });
  }
}
