import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { ACTIVITY_STATUS } from '../../utils/constants.js';

class Activity extends Model {}

Activity.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    slug: { type: DataTypes.STRING(200), allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    shortDescription: { type: DataTypes.STRING(500), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    posterUrl: { type: DataTypes.STRING(500), allowNull: true },
    rules: { type: DataTypes.TEXT, allowNull: true },
    eligibility: { type: DataTypes.TEXT, allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    endsAt: { type: DataTypes.DATE, allowNull: true },
    venue: { type: DataTypes.STRING(300), allowNull: true },
    capacity: { type: DataTypes.INTEGER, allowNull: true },
    status: { type: DataTypes.ENUM(...ACTIVITY_STATUS), defaultValue: 'DRAFT' },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'Activity',
    tableName: 'activities',
    indexes: [
      { unique: true, fields: ['event_id', 'slug'] },
      { fields: ['tenant_id'] },
      { fields: ['event_id', 'status'] },
    ],
  },
);

export default Activity;
