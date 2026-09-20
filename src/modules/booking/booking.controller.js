import * as bookingService from './booking.service.js';
import { success, created } from '../../utils/apiResponse.js';

export const initiate = async (req, res) => {
  const data = await bookingService.initiateBooking(req.body, req);
  return created(res, data, 'Booking initiated — proceed to payment');
};

export const verifyPayment = async (req, res) => {
  const result = await bookingService.verifyPayment(req.body, req);

  if (result.status === 'FAILED') {
    return res.status(400).json({
      success: false,
      message: result.message || 'Payment simulation failed',
      data: {
        orderRef: result.order.orderRef,
        status: 'FAILED',
        canRetry: true,
      },
    });
  }

  if (result.status === 'PENDING') {
    return success(
      res,
      {
        orderRef: result.order.orderRef,
        status: 'PENDING',
        message: result.message,
      },
      'Payment is pending',
    );
  }

  return success(
    res,
    {
      orderRef: result.order.orderRef,
      amount: Number(result.order.amount),
      currency: result.order.currency,
      status: 'PAID',
      tickets: result.tickets,
      alreadyProcessed: result.alreadyProcessed,
    },
    result.alreadyProcessed ? 'This payment was already verified' : 'Payment verified — your tickets are ready',
  );
};

export const checkoutDetails = async (req, res) => {
  const data = await bookingService.getCheckoutDetails(req.params.orderRef);
  return success(res, data);
};

export const retryPayment = async (req, res) => {
  const data = await bookingService.retryOrder(req.body.orderRef, req);
  return success(res, data, 'Order payment reset for retry');
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

export default { initiate, verifyPayment, checkoutDetails, retryPayment, confirmation, downloadPdf };
