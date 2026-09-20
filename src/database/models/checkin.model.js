import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';

class Checkin extends Model {}

Checkin.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ticketId: { type: DataTypes.INTEGER, allowNull: false },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    activityId: { type: DataTypes.INTEGER, allowNull: true },
    checkedInBy: { type: DataTypes.INTEGER, allowNull: true },
    gateName: { type: DataTypes.STRING(50), allowNull: true },
    checkedInAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: 'Checkin',
    tableName: 'checkins',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['ticket_id'] }, { fields: ['tenant_id', 'event_id'] }],
  },
);

export default Checkin;
