import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/index.js';
import { contracts, bookings, animals, tutors, appSettings } from '../db/schema.js';
import { readFile, saveFile } from './storage.js';

async function getImageBuffer(storedPath: string | null | undefined): Promise<Buffer | null> {
  if (!storedPath) return null;
  try { return await readFile(storedPath); } catch { return null; }
}

function trunc(str: string | null | undefined, max: number): string {
  if (!str) return '';
  return String(str).length > max ? String(str).slice(0, max - 1) + '...' : String(str);
}

function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR');
}

function fmtBRL(val: number | string | null | undefined): string {
  return `R$ ${Number(val ?? 0).toFixed(2).replace('.', ',')}`;
}

function sectionTitle(doc: PDFKit.PDFDocument, text: string, x: number, y: number, W: number): void {
  doc.save()
    .rect(x, y + 1, 3, 10).fill('#F97316')
    .restore();
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#F97316')
    .text(text, x + 7, y, { width: W - x - 40 });
}

export async function generateContractPdf(db: DB, contractId: string, tipo: 'rascunho' | 'final' = 'final'): Promise<string> {
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, contractId));
  if (!contract) throw new Error(`Contract ${contractId} not found`);

  const [booking] = await db.select().from(bookings).where(eq(bookings.id, contract.booking_id));
  if (!booking) throw new Error(`Booking ${contract.booking_id} not found`);

  const [[animal], [tutor], [settings]] = await Promise.all([
    db.select().from(animals).where(eq(animals.id, booking.animal_id)),
    db.select().from(tutors).where(eq(tutors.id, booking.tutor_id)),
    db.select().from(appSettings).where(eq(appSettings.id, 1)),
  ]);

  const lang = settings?.idioma_padrao ?? 'pt';
  const clausulas = (lang === 'en' ? settings?.clausulas_en : settings?.clausulas_pt) ?? [];

  const fname = `contrato_${contractId}_${tipo}.pdf`;
  const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
  const chunks: Buffer[] = [];
  const W = 595;

  // Header
  const logoBuf = await getImageBuffer(settings?.logo_path);
  if (logoBuf) {
    try { doc.image(logoBuf, 40, 30, { width: 60, height: 60 }); } catch { /* ignore */ }
  }

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#1C1917')
    .text(trunc(settings?.nome_estabelecimento ?? 'PetStay', 40), 115, 35, { width: 400 });
  doc.font('Helvetica').fontSize(10).fillColor('#78716C')
    .text('Contrato de Hospedagem Pet', 115, 53)
    .text(`${trunc(settings?.cidade, 25)}${settings?.cidade && settings?.telefone_contato ? ' | ' : ''}${trunc(settings?.telefone_contato, 20)}`, 115, 66);

  doc.moveTo(40, 105).lineTo(W - 40, 105).strokeColor('#FED7AA').stroke();

  sectionTitle(doc, 'DADOS DO RESPONSAVEL', 40, 115, W);
  doc.font('Helvetica').fontSize(9).fillColor('#1C1917')
    .text(`Nome: ${trunc(tutor?.nome, 30)}`, 40, 132)
    .text(`Telefone: ${trunc(tutor?.telefone, 20)}`, 300, 132)
    .text(`Email: ${trunc(tutor?.email, 35)}`, 40, 147)
    .text(`Endereco: ${trunc(tutor?.endereco, 40)}`, 300, 147);

  doc.moveTo(40, 165).lineTo(W - 40, 165).strokeColor('#FED7AA').stroke();

  sectionTitle(doc, 'DADOS DO ANIMAL', 40, 175, W);
  doc.font('Helvetica').fontSize(9).fillColor('#1C1917')
    .text(`Nome: ${trunc(animal?.nome, 20)}`, 40, 192)
    .text(`Especie: ${trunc(animal?.especie, 12)}`, 200, 192)
    .text(`Raca: ${trunc(animal?.raca, 18)}`, 330, 192)
    .text(`Peso: ${animal?.peso ?? '-'}kg`, 40, 207)
    .text(`Idade: ${animal?.idade ?? '-'}`, 200, 207)
    .text(`Alergias: ${trunc((animal?.saude?.alergias ?? []).join(', '), 30)}`, 330, 207);

  doc.moveTo(40, 225).lineTo(W - 40, 225).strokeColor('#FED7AA').stroke();

  sectionTitle(doc, 'DADOS DA HOSPEDAGEM', 40, 235, W);
  doc.font('Helvetica').fontSize(9).fillColor('#1C1917')
    .text(`Check-in: ${fmtDate(booking.data_entrada)}`, 40, 252)
    .text(`Check-out: ${fmtDate(booking.data_saida)}`, 200, 252)
    .text(`Valor/diaria: ${fmtBRL(booking.valor_diaria)}`, 350, 252);

  let servY = 267;
  if (booking.servicos_adicionais?.length > 0) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#78716C').text('Servicos adicionais:', 40, servY);
    servY += 12;
    for (const s of booking.servicos_adicionais) {
      doc.font('Helvetica').fontSize(8).fillColor('#1C1917')
        .text(`- ${trunc(s.nome, 30)}`, 50, servY)
        .text(fmtBRL(s.valor), 400, servY);
      servY += 12;
    }
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1C1917')
    .text(`VALOR TOTAL: ${fmtBRL(booking.valor_total)}`, 40, servY + 4);

  doc.moveTo(40, servY + 22).lineTo(W - 40, servY + 22).strokeColor('#FED7AA').stroke();

  const clausulaY = servY + 32;
  sectionTitle(doc, 'CLAUSULAS DO CONTRATO', 40, clausulaY, W);
  let cy = clausulaY + 15;
  for (const c of clausulas) {
    doc.font('Helvetica').fontSize(8).fillColor('#1C1917').text(c, 40, cy, { width: W - 80, lineGap: 1 });
    cy += 30;
  }

  doc.moveTo(40, cy + 5).lineTo(W - 40, cy + 5).strokeColor('#FED7AA').stroke();

  const sigSectionY = cy + 15;

  if (tipo === 'final') {
    sectionTitle(doc, 'ASSINATURAS', 40, sigSectionY, W);
    const tutorSigY = sigSectionY + 18;
    const hotelSigX = 310;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#78716C').text('Responsavel pelo animal:', 40, tutorSigY);
    const tutorSigBuf = await getImageBuffer(contract.assinatura_path);
    if (tutorSigBuf) {
      try { doc.image(tutorSigBuf, 40, tutorSigY + 12, { width: 200, height: 60 }); } catch { /* ignore */ }
    } else {
      doc.moveTo(40, tutorSigY + 72).lineTo(240, tutorSigY + 72).strokeColor('#CBD5E1').stroke();
    }
    doc.font('Helvetica').fontSize(8).fillColor('#1C1917')
      .text(contract.nome_digitado ?? '', 40, tutorSigY + 78)
      .text(contract.data_assinatura ? fmtDateTime(contract.data_assinatura) : '', 40, tutorSigY + 90);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#78716C').text('Representante do estabelecimento:', hotelSigX, tutorSigY);
    const hotelSigBuf = await getImageBuffer(settings?.assinatura_hotel_path);
    if (hotelSigBuf) {
      try { doc.image(hotelSigBuf, hotelSigX, tutorSigY + 12, { width: 200, height: 60 }); } catch { /* ignore */ }
    } else {
      doc.moveTo(hotelSigX, tutorSigY + 72).lineTo(hotelSigX + 200, tutorSigY + 72).strokeColor('#CBD5E1').stroke();
    }
    if (settings?.nome_hotel_assinante) {
      doc.font('Helvetica').fontSize(8).fillColor('#1C1917')
        .text(settings.nome_hotel_assinante, hotelSigX, tutorSigY + 78);
    }

    const hashY = tutorSigY + 108;
    doc.font('Courier').fontSize(7).fillColor('#78716C')
      .text(`SHA-256: ${contract.hash_verificacao ?? ''}`, 40, hashY, { width: 430 });

    const baseUrl = settings?.base_url ?? 'http://localhost:5173';
    if (contract.hash_verificacao) {
      try {
        const verifyUrl = `${baseUrl}/verificar?h=${contract.hash_verificacao}`;
        const qrBuffer = await QRCode.toBuffer(verifyUrl, { type: 'png', width: 100, margin: 1 });
        doc.image(qrBuffer as Buffer, W - 100, hashY - 10, { width: 60, height: 60 });
        doc.font('Helvetica').fontSize(7).fillColor('#78716C')
          .text('Verificar autenticidade', W - 105, hashY + 52, { width: 70, align: 'center' });
      } catch { /* ignore */ }
    }

    if (contract.ip_assinante) {
      doc.font('Helvetica').fontSize(7).fillColor('#A8A29E')
        .text(`IP: ${contract.ip_assinante}`, 40, hashY + 15);
    }
  } else {
    doc.save();
    doc.rotate(45, { origin: [W / 2, 421] });
    doc.font('Helvetica-Bold').fontSize(55).fillColor('#DDDDDD').opacity(0.5)
      .text('PENDENTE DE ASSINATURA', 60, 360, { width: 600 });
    doc.restore();

    sectionTitle(doc, 'ASSINATURAS', 40, sigSectionY, W);
    const lineY = sigSectionY + 40;
    doc.moveTo(40, lineY).lineTo(240, lineY).strokeColor('#CBD5E1').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#78716C').text('Responsavel pelo animal', 40, lineY + 4);
    doc.moveTo(310, lineY).lineTo(W - 40, lineY).strokeColor('#CBD5E1').stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#78716C').text('Representante do estabelecimento', 310, lineY + 4);
  }

  const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });

  const relativePath = `pdfs/${fname}`;
  await saveFile(pdfBuffer, relativePath);

  const field = tipo === 'rascunho' ? 'pdf_rascunho_path' : 'pdf_final_path';
  await db.update(contracts).set({ [field]: relativePath }).where(eq(contracts.id, contractId));

  return relativePath;
}
