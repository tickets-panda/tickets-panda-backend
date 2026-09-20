import * as service from './formField.service.js';
import { success, created } from '../../utils/apiResponse.js';

export const list = async (req, res) => success(res, { formFields: await service.listFormFields(req.tenantId, req.params.eventId) });

export const create = async (req, res) =>
  created(res, { formField: await service.createFormField(req.tenantId, req.params.eventId, req.body) }, 'Form field created successfully');

export const update = async (req, res) =>
  success(res, { formField: await service.updateFormField(req.tenantId, req.params.id, req.body) }, 'Form field updated successfully');

export const remove = async (req, res) => {
  await service.deleteFormField(req.tenantId, req.params.id);
  return success(res, null, 'Form field deleted successfully');
};

export default { list, create, update, remove };
