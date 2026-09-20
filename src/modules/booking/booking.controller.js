import * as bookingService from './booking.service.js';
import { success, created } from '../../utils/apiResponse.js';

export const initiate = async (req, res) => {
  const data = await bookingService.initiateBooking(req.body, req);
  return created(res, data, 'Booking initiated — proceed to payment');
};

export const verifyPayment = async (req, res) => {
  const { order, tickets, alreadyProcessed } = await bookingService.verifyPayment(req.body, req);
  return success(
    res,
    {
      orderRef: order.orderRef,
      amount: Number(order.amount),
      currency: order.currency,
      tickets,
      alreadyProcessed,
    },
    alreadyProcessed ? 'This payment was already verified' : 'Payment verified — your tickets are ready',
  );
};

export const confirmation = async (req, res) => {
  const data = await bookingService.getConfirmation(req.params.orderRef);
  return success(res, data);
};

export const downloadPdf = async (req, res) => {
  const { pdfBuffer, filename } = await bookingService.getOrderPdfBuffer(req.params.orderRef);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(pdfBuffer);
};

export default { initiate, verifyPayment, confirmation, downloadPdf };
