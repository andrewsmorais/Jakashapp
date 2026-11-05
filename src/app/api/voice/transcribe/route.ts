import { NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { authorizeVoice, refundAiUse, reserveAiUse } from '@/lib/voiceServer';

// Lançamento por voz, plano C (pago): só para navegadores sem reconhecimento de fala (ex.: Firefox). O áudio (até 20 s, no máximo 2 MB)
// é transcrito pela OpenAI e DESCARTADO: não é gravado em disco, no banco nem em log. Conta 1 uso do limite diário de IA.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 2 * 1024 * 1024;
const MIN_BYTES = 1000;

function sniff(b: Uint8Array): { ext: string; mime: string } | null {
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return { ext: 'ogg', mime: 'audio/ogg' };
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return { ext: 'm4a', mime: 'audio/mp4' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x41 && b[10] === 0x56 && b[11] === 0x45) return { ext: 'wav', mime: 'audio/wav' };
  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  return null;
}

export async function POST(request: Request) {
  try {
    const ctx = await authorizeVoice();
    if (ctx instanceof NextResponse) return ctx;

    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BYTES + 64 * 1024) return NextResponse.json({ error: 'Áudio muito grande (máximo 2 MB).' }, { status: 413 });

    const form = await request.formData().catch(() => null);
    const file = form?.get('audio');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Envie o áudio.' }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Áudio muito grande (máximo 2 MB).' }, { status: 413 });
    if (file.size < MIN_BYTES) return NextResponse.json({ error: 'Áudio muito curto.' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(bytes);
    if (!kind) return NextResponse.json({ error: 'Formato de áudio não suportado.' }, { status: 415 });

    const blocked = await reserveAiUse(ctx, 'voice/transcribe');
    if (blocked) return blocked;

    try {
      const tr = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).audio.transcriptions.create({
        file: await toFile(bytes, `voz.${kind.ext}`, { type: kind.mime }),
        model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
        language: 'pt',
      });
      const text = String(tr.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
      return NextResponse.json({ text });
    } catch (e) {
      await refundAiUse(ctx);
      console.error('[voice/transcribe]', (e as Error).message);
      return NextResponse.json({ error: 'Não consegui ouvir o áudio agora. Tente de novo ou digite o lançamento.' }, { status: 502 });
    }
  } catch (e) {
    console.error('[voice/transcribe] erro', (e as Error).message);
    return NextResponse.json({ error: 'Erro interno ao transcrever.' }, { status: 500 });
  }
}
