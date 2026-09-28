import { requireRole } from '@/lib/auth';
import { getAlertCase, getCaseTimeline } from '@/lib/case-service';
import { db } from '@/lib/db';
import { customerName, dateTime, money, title } from '@/lib/format';
import { investigationSchema } from '@/lib/validation';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const auth = await requireRole(['ADMIN', 'MANAGER', 'ANALYST', 'VIEWER']);
  if (!auth.ok) return auth.error;
  const { id, format } = await params;
  if (format !== 'json' && format !== 'pdf') return Response.json({ error: 'Unknown format' }, { status: 404 });
  const alert = await getAlertCase(id, auth.user.organizationId);
  if (!alert) return Response.json({ error: 'Alert not found' }, { status: 404 });
  await db.auditLog.create({ data: { organizationId: auth.user.organizationId, actorUserId: auth.user.id, entityType: 'Alert', entityId: id, action: 'EXPORT_GENERATED', metadata: { format } } });
  const [timeline, history] = await Promise.all([
    getCaseTimeline(id, auth.user.organizationId),
    db.transaction.findMany({ where: { organizationId: auth.user.organizationId, customerId: alert.customerId, timestamp: { lte: alert.transaction.timestamp } }, orderBy: { timestamp: 'desc' }, take: 80 }),
  ]);
  const report = { generatedAt: new Date().toISOString(), organization: auth.user.organization.name, alert, transactionHistory: history, timeline, notice: 'AI-generated investigation output is decision support only and must be reviewed by an authorized human analyst.' };
  if (format === 'json') return new Response(JSON.stringify(report, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${id}-investigation.json"`, 'cache-control': 'no-store' } });
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 748;
  const addPage = () => { page = pdf.addPage([612, 792]); y = 748; };
  const line = (text: string, size = 10, strong = false, color = rgb(0.13, 0.18, 0.23)) => {
    const font = strong ? bold : regular;
    const clean = text.replace(/[^\x20-\x7E]/g, '-');
    const words = clean.split(/\s+/);
    let part = '';
    for (const word of words) {
      const next = part ? `${part} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > 520 && part) { if (y < 60) addPage(); page.drawText(part, { x: 46, y, size, font, color }); y -= size + 5; part = word; } else part = next;
    }
    if (part) { if (y < 60) addPage(); page.drawText(part, { x: 46, y, size, font, color }); y -= size + 7; }
  };
  const heading = (text: string) => { y -= 10; line(text.toUpperCase(), 9, true, rgb(0.28, 0.4, 0.51)); y -= 2; };
  line('VARIA  /  INVESTIGATION REPORT', 14, true);
  line(`${id}  |  Generated ${dateTime(new Date())}`, 9);
  heading('Case overview');
  line(`Customer: ${customerName(alert.customer)}  |  ${alert.customer.country}  |  KYC ${alert.customer.kycStatus}`);
  line(`Alert: ${alert.type}  |  ${alert.severity}  |  Risk score ${alert.riskScore}/100  |  ${alert.status}`);
  line(alert.description);
  heading('Triggering transaction');
  line(`${money(Number(alert.transaction.amount), alert.transaction.currency)} ${alert.transaction.direction} ${alert.transaction.type} on ${dateTime(alert.transaction.timestamp)}`);
  line(`Counterparty: ${alert.transaction.counterpartyName ?? 'Unknown'}  |  Country: ${alert.transaction.counterpartyCountry ?? 'Unknown'}  |  Rail: ${alert.transaction.paymentRail ?? 'Unknown'}`);
  for (const investigation of alert.investigations) {
    const output = investigationSchema.safeParse(investigation.output);
    if (!output.success) continue;
    heading(`Investigation version ${investigation.version} - ${investigation.source}`);
    line(output.data.summary);
    heading('Risk factors');
    for (const factor of output.data.risk_factors) { line(`${factor.title} (${factor.severity}): ${factor.explanation}`); line(`Evidence: ${factor.evidence_ids.join(', ')}`, 8); }
    heading('Mitigating factors');
    for (const factor of output.data.mitigating_factors) { line(`${factor.title}: ${factor.explanation}`); line(`Evidence: ${factor.evidence_ids.join(', ')}`, 8); }
    heading('Missing information');
    for (const item of output.data.missing_information) line(`${item.field}: ${item.reason_needed}`);
    heading('Recommendation');
    line(`${title(output.data.recommended_action)} (${output.data.confidence} confidence): ${output.data.recommendation_reasoning}`);
    heading('Evidence');
    for (const item of investigation.evidence) line(`${item.label}: ${item.value}`, 8);
  }
  heading('Human decisions');
  if (!alert.decisions.length) line('No analyst decision recorded.');
  for (const decision of alert.decisions) { line(`${title(decision.decision)} by ${decision.analyst.name} on ${dateTime(decision.createdAt)}`); line(`Analyst note: ${decision.note}`); }
  heading('Timeline');
  for (const event of timeline) line(`${dateTime(event.timestamp)}  ${title(event.action)}`, 8);
  y -= 10; line(report.notice, 8, false, rgb(0.35, 0.4, 0.45));
  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${id}-investigation.pdf"`, 'cache-control': 'no-store' } });
}
