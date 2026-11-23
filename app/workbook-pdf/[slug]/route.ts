import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { publishedWorkbook } from '../../../lib/workbooks/repository';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) return new Response(null, { status: 404 });
  const workbook = await publishedWorkbook(slug);
  if (!workbook) return new Response(null, { status: 404 });
  const { book, modules } = workbook;
  const doc = new PDFDocument({ size: 'LETTER', margin: 58, info: { Title: book.title + ' — My responses' } });
  doc.font(readFileSync(join(process.cwd(), 'assets/fonts/noto-sans-latin.woff')));
  doc.fillColor('#2f3b4b').fontSize(24).text(book.title);
  doc.fontSize(12).text(book.sample ? 'My saved responses · Demonstration workbook' : 'My saved responses');
  doc.moveDown();

  for (const item of modules) {
    doc.fontSize(11).fillColor('#804c60').text(item.content.chapter);
    doc.fontSize(16).fillColor('#2f3b4b').text(item.content.title);
    doc.fontSize(10).text(item.completed ? 'Complete' : 'In progress');
    doc.moveDown(0.5);
    let found = false;
    for (const block of item.content.blocks) {
      if (block.kind === 'lesson') continue;
      const answer = item.answers[block.id];
      if (!answer) continue;
      const details = typeof answer === 'object'
        ? block.kind === 'goal' ? [answer.goal && 'Goal: ' + answer.goal, answer.step && 'First step: ' + answer.step,
          answer.date && 'Target date: ' + answer.date].filter(Boolean).join('\n') : ''
        : block.kind === 'choice' ? block.options.find(option => option.id === answer)?.label ?? ''
        : block.kind === 'rating' ? Number(answer) >= 1 && Number(answer) <= block.max ? answer + ' of ' + block.max : ''
        : block.kind === 'reflection' ? answer : '';
      if (!details) continue;
      found = true;
      doc.fontSize(11).fillColor('#2f3b4b').text(block.prompt, { paragraphGap: 3 });
      doc.fillColor('#303030').text(details);
      doc.moveDown(0.6);
    }
    if (!found) doc.fontSize(11).fillColor('#303030').text('No saved responses.');
    doc.moveDown(1.1);
  }
  doc.end();
  return new Response(Readable.toWeb(doc) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="' + slug + '-responses.pdf"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
