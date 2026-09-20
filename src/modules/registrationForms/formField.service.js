import { RegistrationForm, Event, RegistrationData } from '../../database/models/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';
import { pick } from '../../utils/helpers.js';
import { FORM_FIELD_TYPES } from '../../utils/constants.js';

const FIELDS = ['fieldName', 'fieldLabel', 'fieldType', 'options', 'isRequired', 'sortOrder', 'placeholder', 'validationRules', 'helpText', 'fileConfig', 'activityId'];
const CHOICE_TYPES = ['SELECT', 'RADIO', 'CHECKBOX'];

const assertEvent = async (tenantId, eventId) => {
  const event = await Event.findOne({ where: { id: eventId, tenantId } });
  if (!event) throw new NotFoundError('Event not found');
  return event;
};

const assertChoiceOptions = (payload) => {
  if (CHOICE_TYPES.includes(payload.fieldType) && (!Array.isArray(payload.options) || payload.options.length === 0)) {
    throw new ValidationError(`Options are required for ${payload.fieldType} fields`);
  }
};

export async function listFormFields(tenantId, eventId) {
  await assertEvent(tenantId, eventId);
  return RegistrationForm.findAll({ where: { tenantId, eventId }, order: [['sortOrder', 'ASC']] });
}

export async function createFormField(tenantId, eventId, payload) {
  await assertEvent(tenantId, eventId);
  assertChoiceOptions(payload);

  const duplicate = await RegistrationForm.findOne({ where: { eventId, fieldName: payload.fieldName } });
  if (duplicate) throw new ConflictError(`A field named "${payload.fieldName}" already exists for this event`);

  return RegistrationForm.create({ ...pick(payload, FIELDS), tenantId, eventId });
}

export async function updateFormField(tenantId, id, payload) {
  const field = await RegistrationForm.findOne({ where: { id, tenantId } });
  if (!field) throw new NotFoundError('Form field not found');

  const changes = pick(payload, FIELDS);
  if (changes.fieldType) assertChoiceOptions({ ...field.toJSON(), ...changes });

  await field.update(changes);
  return field;
}

export async function deleteFormField(tenantId, id) {
  const field = await RegistrationForm.findOne({ where: { id, tenantId } });
  if (!field) throw new NotFoundError('Form field not found');

  const used = await RegistrationData.count({ where: { formFieldId: id } });
  if (used > 0) throw new ConflictError('This field has submitted data — deactivate or rename it instead');

  await field.destroy();
  return { id };
}

export default { listFormFields, createFormField, updateFormField, deleteFormField };
