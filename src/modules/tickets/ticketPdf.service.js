import PDFDocument from 'pdfkit';

const dataUrlToBuffer = (dataUrl) => {
  if (!dataUrl || !dataUrl.includes(',')) return null;
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

/**
 * Builds a multi-page PDF, one page per ticket, with the QR code embedded.
 * @returns {Promise<Buffer>}
 */
export function generateTicketPdf({ event, activity, customer, tickets, orderRef }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    tickets.forEach((ticket, index) => {
      const plain = typeof ticket.toJSON === 'function' ? ticket.toJSON() : ticket;
      if (index > 0) doc.addPage();

      doc.fillColor('#F97316').fontSize(22).text('🐼 Ticket Panda', { align: 'left' });
      doc.moveDown(0.5);
      doc.fillColor('#18181b').fontSize(18).text(event.title);
      const actTitle = activity?.title || plain.activity?.title;
      if (actTitle) {
        doc.moveDown(0.2);
        doc.fillColor('#F97316').fontSize(14).text(`Activity: ${actTitle}`);
      }
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#52525b');
      doc.text(`Venue: ${event.venueName}${event.venueAddress ? `, ${event.venueAddress}` : ''}`);
      doc.text(`Date: ${event.eventDate}   Time: ${event.eventTimeStart}`);
      doc.text(`Order: ${orderRef}`);
      doc.moveDown();
      doc.fillColor('#18181b').fontSize(13).text(`Ticket holder: ${customer.name}`);
      doc.fontSize(12).text(`Email: ${customer.email}`);
      doc.moveDown();

      doc.fontSize(14).fillColor('#18181b').text(`Ticket Key: ${plain.ticketKey}`);
      doc.moveDown();

      const qrBuffer = dataUrlToBuffer(plain.qrData);
      if (qrBuffer) {
        doc.image(qrBuffer, { width: 180, align: 'left' });
      }

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#71717a').text('Present this QR code at the gate. Each ticket admits one person.', { align: 'left' });
    });

    doc.end();
  });
}

export default { generateTicketPdf };
