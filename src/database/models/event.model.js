import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { EVENT_STATUS } from '../../utils/constants.js';

class Event extends Model {}

Event.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    slug: { type: DataTypes.STRING(200), allowNull: false },
    shortDescription: { type: DataTypes.STRING(500), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    bannerUrl: { type: DataTypes.STRING(500), allowNull: true },
    venueName: { type: DataTypes.STRING(200), allowNull: false },
    venueAddress: { type: DataTypes.TEXT, allowNull: true },
    venueMapUrl: { type: DataTypes.STRING(500), allowNull: true },
    startAt: { type: DataTypes.DATE, allowNull: true },
    endAt: { type: DataTypes.DATE, allowNull: true },
    eventDate: { type: DataTypes.DATEONLY, allowNull: false },
    eventTimeStart: { type: DataTypes.TIME, allowNull: false },
    eventTimeEnd: { type: DataTypes.TIME, allowNull: true },
    maxCapacity: { type: DataTypes.INTEGER, allowNull: true },
    registrationOpenAt: { type: DataTypes.DATE, allowNull: true },
    registrationCloseAt: { type: DataTypes.DATE, allowNull: true },
    registrationDeadline: { type: DataTypes.DATE, allowNull: true },
    rules: { type: DataTypes.TEXT, allowNull: true },
    faqJson: { type: DataTypes.JSON, allowNull: true },
    contactJson: { type: DataTypes.JSON, allowNull: true },
    galleryUrls: { type: DataTypes.JSON, allowNull: true },
    status: { type: DataTypes.ENUM(...EVENT_STATUS), defaultValue: 'DRAFT' },
    settings: { type: DataTypes.JSON, defaultValue: {} },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Event',
    tableName: 'events',
    indexes: [
      { unique: true, fields: ['tenant_id', 'slug'] },
      { fields: ['tenant_id', 'status'] },
      { fields: ['tenant_id', 'event_date'] },
    ],
  },
);

export default Event;
