import Joi from 'joi';
import { EVENT_STATUS } from '../../utils/constants.js';

const baseEvent = {
  title: Joi.string().trim().max(200),
  shortDescription: Joi.string().trim().max(500).allow('', null),
  description: Joi.string().trim().allow('', null),
  bannerUrl: Joi.string().uri().max(500).allow('', null),
  venueName: Joi.string().trim().max(200),
  venueAddress: Joi.string().trim().allow('', null),
  venueMapUrl: Joi.string().uri().max(500).allow('', null),
  eventDate: Joi.date().iso(),
  eventTimeStart: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/),
  eventTimeEnd: Joi.string().pattern(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/).allow('', null),
  startAt: Joi.date().iso().allow(null),
  endAt: Joi.date().iso().allow(null),
  maxCapacity: Joi.number().integer().min(1).allow(null),
  registrationDeadline: Joi.date().iso().allow(null),
  registrationOpenAt: Joi.date().iso().allow(null),
  registrationCloseAt: Joi.date().iso().allow(null),
  rules: Joi.string().trim().allow('', null),
  faqJson: Joi.array().items(Joi.object({ question: Joi.string(), answer: Joi.string() })).allow(null),
  contactJson: Joi.object().allow(null),
  galleryUrls: Joi.array().items(Joi.string().uri()).allow(null),
  status: Joi.string().valid(...EVENT_STATUS),
  settings: Joi.object(),
};

export const createEventSchema = Joi.object({
  ...baseEvent,
  title: baseEvent.title.required(),
  venueName: baseEvent.venueName.required(),
  eventDate: baseEvent.eventDate.required(),
  eventTimeStart: baseEvent.eventTimeStart.required(),
});

export const updateEventSchema = Joi.object(baseEvent).min(1);

export const statusSchema = Joi.object({
  status: Joi.string().valid(...EVENT_STATUS).required(),
});

export default { createEventSchema, updateEventSchema, statusSchema };
