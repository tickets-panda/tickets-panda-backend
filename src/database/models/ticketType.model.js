import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';

class TicketType extends Model {}

TicketType.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    activityId: { type: DataTypes.INTEGER, allowNull: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    soldCount: { type: DataTypes.INTEGER, defaultValue: 0 },
    minPerOrder: { type: DataTypes.INTEGER, defaultValue: 1 },
    maxPerOrder: { type: DataTypes.INTEGER, defaultValue: 10 },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    sequelize,
    modelName: 'TicketType',
    tableName: 'ticket_types',
    indexes: [{ fields: ['event_id'] }, { fields: ['activity_id'] }, { fields: ['tenant_id'] }],
  },
);

export default TicketType;
