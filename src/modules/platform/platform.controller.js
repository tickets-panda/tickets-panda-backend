import * as platformService from './platform.service.js';
import { success, paginated } from '../../utils/apiResponse.js';

export const dashboardStats = async (req, res) => success(res, await platformService.getDashboardStats());

export const listTenants = async (req, res) => {
  const { rows, pagination } = await platformService.listTenants(req.query);
  return paginated(res, rows, pagination);
};

export const getTenant = async (req, res) => success(res, await platformService.getTenant(req.params.id));

export const changeTenantStatus = async (req, res) => {
  const tenant = await platformService.changeTenantStatus(req.params.id, req.body.status, req.user.id, req);
  return success(res, { tenant }, 'Tenant status updated');
};

export const listBookings = async (req, res) => {
  const { rows, pagination } = await platformService.listBookings(req.query);
  return paginated(res, rows, pagination);
};

export const listPayments = async (req, res) => {
  const { rows, pagination } = await platformService.listPayments(req.query);
  return paginated(res, rows, pagination);
};

export const listAuditLogs = async (req, res) => {
  const { rows, pagination } = await platformService.listAuditLogs(req.query);
  return paginated(res, rows, pagination);
};

export default { dashboardStats, listTenants, getTenant, changeTenantStatus, listBookings, listPayments, listAuditLogs };
