import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { account } from '../../../../../lib/data';
import { savedGrowthReport } from '../../../../../lib/becoming/report-data';
import { metricLabel, reportCategories, reportDataKeys, reportDateLabel, reportLabels, reportQuestions } from '../../../../../lib/becoming/reports';
import { demo } from '../../../../../lib/session';

export const runtime = 'nodejs';
const privacyHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (demo || !id.success) return new Response(null, { status: 404, headers: privacyHeaders });
  const { client, user } = await account();
  const report = await savedGrowthReport(client, user.id, { id: id.data });
  if (!report) return new Response(null, { status: 404, headers: privacyHeaders });
  const title = reportLabels[report.kind];
  const doc = new PDFDocument({ size: 'LETTER', margin: 55, info: { Title: title } });
  doc.font(readFileSync(join(process.cwd(), 'assets/fonts/noto-sans-latin.woff')));
  const plaintext: string[] = [];
  const write = (text: string, size = 11, color = '#2f3b4b') => {
    plaintext.push(text);
    doc.fontSize(size).fillColor(color).text(text);
  };
  write(title, 24);
  write(reportDateLabel(report.start) + ' – ' + reportDateLabel(report.end), 13);
  write('Records through ' + reportDateLabel(report.through) + ' · ' + report.timezone, 10);
  doc.moveDown();
  for (const key of reportDataKeys) {
    if (!report.categories.includes(key)) continue;
    write(reportCategories[key], 15, '#6a4769');
    const data = report.snapshot[key];
    if (!data?.metrics.length && !data?.lines.length) write('No recorded data in this period.');
    for (const metric of data?.metrics ?? []) write(metric.label + ': ' + metricLabel(metric));
    for (const line of data?.lines ?? []) write((line.day ? reportDateLabel(line.day) + ' · ' : '') + line.text);
    doc.moveDown(0.8);
  }
  if (report.categories.includes('guided')) {
    write(reportCategories.guided, 15, '#6a4769');
    for (const [key, question] of Object.entries(reportQuestions)) {
      const answer = report.reflections[key as keyof typeof reportQuestions];
      if (!answer) continue;
      write(question, 11, '#6a4769');
      write(answer);
      doc.moveDown(0.6);
    }
    if (!Object.values(report.reflections).some(Boolean)) write('No guided reflections saved.');
  }
  // Preserve the complete original text for readers whose PDF font cannot render every character.
  doc.file(Buffer.from(plaintext.join('\n'), 'utf8'), {
    name: 'growth-report.txt', type: 'text/plain; charset=utf-8', description: 'Full-text copy of this report', hidden: false,
  });
  doc.end();
  return new Response(Readable.toWeb(doc) as ReadableStream<Uint8Array>, {
    headers: { ...privacyHeaders, 'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="' + report.kind + '-growth-report-' + report.start + '.pdf"' },
  });
}
