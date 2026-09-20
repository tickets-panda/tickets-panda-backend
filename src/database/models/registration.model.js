import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { REGISTRATION_STATUS } from '../../utils/constants.js';

class Registration extends Model {}

Registration.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    registrationRef: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    activityId: { type: DataTypes.INTEGER, allowNull: true },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    ticketTypeId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: DataTypes.ENUM(...REGISTRATION_STATUS), defaultValue: 'PENDING' },
  },
  {
    sequelize,
    modelName: 'Registration',
    tableName: 'registrations',
    indexes: [{ fields: ['tenant_id', 'event_id'] }, { fields: ['activity_id'] }, { fields: ['customer_id'] }],
  },
);

export default Registration;
