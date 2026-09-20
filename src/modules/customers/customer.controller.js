import * as customerService from './customer.service.js';
import { success } from '../../utils/apiResponse.js';

export const sendOtp = async (req, res) => {
  const data = await customerService.sendOtp(req.body, req);
  return success(res, data, 'If we recognise those details, a code is on its way');
};

export const verifyOtp = async (req, res) => {
  const data = await customerService.verifyOtp(req.body, req);
  return success(res, data, 'Verified successfully');
};

export const myTickets = async (req, res) => {
  const tickets = await customerService.myTickets(req.customer.id);
  return success(res, { tickets });
};

export default { sendOtp, verifyOtp, myTickets };
