import prisma from '../../lib/prisma.js';
import { NotFoundError, ConflictError, ValidationError } from '../../utils/errors.js';
import { pick } from '../../utils/helpers.js';

const FIELDS = ['fieldName', 'fieldLabel', 'fieldType', 'options', 'isRequired', 'sortOrder', 'placeholder', 'validationRules', 'helpText', 'fileConfig', 'activityId'];
const CHOICE_TYPES = ['SELECT', 'RADIO', 'CHECKBOX'];

const assertEvent = async (tenantId, eventId) => {
  const event = await prisma.event.findFirst({
    where: { id: Number(eventId), tenantId: Number(tenantId) },
  });
  if (!event) throw new NotFoundError('Event not found');
  return event;
};

const assertChoiceOptions = (payload) => {
  if (CHOICE_TYPES.includes(payload.fieldType) && (!Array.isArray(payload.options) || payload.options.length === 0)) {
    throw new ValidationError(`Options are required for ${payload.fieldType} fields`);
  }
};

const sanitizeFieldData = (payload) => {
  const data = pick(payload, FIELDS);
  if (data.sortOrder !== undefined && data.sortOrder !== null) {
    data.sortOrder = Number(data.sortOrder);
  }
  if (data.activityId !== undefined) {
    data.activityId = data.activityId ? Number(data.activityId) : null;
  }
  return data;
};

export async function listFormFields(tenantId, eventId) {
  const tId = Number(tenantId);
  const eId = Number(eventId);
  await assertEvent(tId, eId);
  return prisma.registrationForm.findMany({
    where: { tenantId: tId, eventId: eId },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function createFormField(tenantId, eventId, payload) {
  const tId = Number(tenantId);
  const eId = Number(eventId);
  await assertEvent(tId, eId);
  assertChoiceOptions(payload);

  const duplicate = await prisma.registrationForm.findFirst({
    where: { eventId: eId, fieldName: payload.fieldName },
  });
  if (duplicate) throw new ConflictError(`A field named "${payload.fieldName}" already exists for this event`);

  const data = sanitizeFieldData(payload);

  return prisma.registrationForm.create({
    data: {
      ...data,
      tenantId: tId,
      eventId: eId,
    },
  });
}

export async function updateFormField(tenantId, id, payload) {
  const tId = Number(tenantId);
  const fId = Number(id);
  const field = await prisma.registrationForm.findFirst({ where: { id: fId, tenantId: tId } });
  if (!field) throw new NotFoundError('Form field not found');

  const changes = sanitizeFieldData(payload);
  if (changes.fieldType) assertChoiceOptions({ ...field, ...changes });

  return prisma.registrationForm.update({
    where: { id: field.id },
    data: changes,
  });
}

export async function deleteFormField(tenantId, id) {
  const tId = Number(tenantId);
  const fId = Number(id);
  const field = await prisma.registrationForm.findFirst({ where: { id: fId, tenantId: tId } });
  if (!field) throw new NotFoundError('Form field not found');

  const used = await prisma.registrationData.count({ where: { formFieldId: fId } });
  if (used > 0) throw new ConflictError('This field has submitted data — deactivate or rename it instead');

  await prisma.registrationForm.delete({ where: { id: field.id } });
  return { id: fId };
}

export default { listFormFields, createFormField, updateFormField, deleteFormField };
