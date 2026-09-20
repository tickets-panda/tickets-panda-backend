import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { TICKET_STATUS } from '../../utils/constants.js';

class Ticket extends Model {}

Ticket.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    ticketKey: { type: DataTypes.STRING(20), allowNull: false, unique: true },
    verificationToken: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    activityId: { type: DataTypes.INTEGER, allowNull: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    registrationId: { type: DataTypes.INTEGER, allowNull: false },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    ticketTypeId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM(...TICKET_STATUS), defaultValue: 'ACTIVE' },
    qrData: { type: DataTypes.TEXT, allowNull: true },
    pdfUrl: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Ticket',
    tableName: 'tickets',
    indexes: [
      { fields: ['ticket_key'] },
      { fields: ['verification_token'] },
      { fields: ['tenant_id', 'event_id'] },
      { fields: ['activity_id'] },
      { fields: ['order_id'] },
    ],
  },
);

export default Ticket;
