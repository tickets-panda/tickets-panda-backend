import * as tenantService from './tenant.service.js';
import { success, created, paginated } from '../../utils/apiResponse.js';

export const getProfile = async (req, res) => success(res, { tenant: req.tenant });

export const updateProfile = async (req, res) => {
  const tenant = await tenantService.updateProfile(req.tenantId, req.body);
  return success(res, { tenant }, 'Profile updated successfully');
};

export const getDashboardStats = async (req, res) => {
  const data = await tenantService.getDashboardStats(req.tenantId);
  return success(res, data);
};

export const getAnalytics = async (req, res) => {
  const data = await tenantService.getAnalytics(req.tenantId);
  return success(res, data);
};

export const listMembers = async (req, res) => {
  const members = await tenantService.listMembers(req.tenantId);
  return success(res, { members });
};

export const addMember = async (req, res) => {
  const member = await tenantService.addMember(req.tenantId, req.body, req.user.id, req);
  return created(res, { member }, 'Member added successfully');
};

export const updateMember = async (req, res) => {
  const member = await tenantService.updateMember(req.tenantId, req.params.id, req.body, req.user.id, req);
  return success(res, { member }, 'Member updated successfully');
};

export const removeMember = async (req, res) => {
  await tenantService.removeMember(req.tenantId, req.params.id, req.user.id, req);
  return success(res, null, 'Member removed successfully');
};

export const listRegistrations = async (req, res) => {
  const { rows, pagination } = await tenantService.listRegistrations(req.tenantId, req.query);
  return paginated(res, rows, pagination);
};

export const getRegistration = async (req, res) => success(res, { registration: await tenantService.getRegistration(req.tenantId, req.params.id) });

export const listOrders = async (req, res) => {
  const { rows, pagination } = await tenantService.listOrders(req.tenantId, req.query);
  return paginated(res, rows, pagination);
};

export const listPayments = async (req, res) => {
  const { rows, pagination } = await tenantService.listPayments(req.tenantId, req.query);
  return paginated(res, rows, pagination);
};

export const listTickets = async (req, res) => {
  const { rows, pagination } = await tenantService.listTickets(req.tenantId, req.query);
  return paginated(res, rows, pagination);
};

export const getTicket = async (req, res) => success(res, { ticket: await tenantService.getTicket(req.tenantId, req.params.id) });

export const listCheckins = async (req, res) => {
  const { rows, pagination } = await tenantService.listCheckins(req.tenantId, req.query);
  return paginated(res, rows, pagination);
};

export const listAuditLogs = async (req, res) => {
  const { rows, pagination } = await tenantService.listAuditLogs(req.tenantId, req.query);
  return paginated(res, rows, pagination);
};

export const getStaffStats = async (req, res) => {
  const data = await tenantService.getStaffStats(req.tenantId);
  return success(res, data);
};

export default {
  getProfile,
  updateProfile,
  getDashboardStats,
  getAnalytics,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  listRegistrations,
  getRegistration,
  listOrders,
  listPayments,
  listTickets,
  getTicket,
  listCheckins,
  listAuditLogs,
  getStaffStats,
};
