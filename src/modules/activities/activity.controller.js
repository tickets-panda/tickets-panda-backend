import * as activityService from './activity.service.js';
import { success, created, paginated } from '../../utils/apiResponse.js';

export const createActivity = async (req, res) => {
  const activity = await activityService.createActivity(
    req.tenantId,
    Number(req.params.eventId),
    req.user.id,
    req.body,
    req,
  );
  return created(res, { activity }, 'Activity created successfully');
};

export const listActivities = async (req, res) => {
  const { rows, pagination } = await activityService.listActivities(
    req.tenantId,
    Number(req.params.eventId),
    req.query,
  );
  return paginated(res, rows, pagination);
};

export const getActivity = async (req, res) => {
  const { activity, stats } = await activityService.getActivity(req.tenantId, Number(req.params.id));
  return success(res, { activity, stats });
};

export const updateActivity = async (req, res) => {
  const activity = await activityService.updateActivity(
    req.tenantId,
    Number(req.params.id),
    req.body,
    req.user.id,
    req,
  );
  return success(res, { activity }, 'Activity updated successfully');
};

export const changeStatus = async (req, res) => {
  const activity = await activityService.changeActivityStatus(
    req.tenantId,
    Number(req.params.id),
    req.body.status,
    req.user.id,
    req,
  );
  return success(res, { activity }, 'Activity status updated');
};

export const deleteActivity = async (req, res) => {
  await activityService.deleteActivity(req.tenantId, Number(req.params.id), req.user.id, req);
  return success(res, null, 'Activity deleted successfully');
};

export default { createActivity, listActivities, getActivity, updateActivity, changeStatus, deleteActivity };
