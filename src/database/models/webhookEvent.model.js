import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';

class WebhookEvent extends Model {}

WebhookEvent.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'razorpay' },
    eventType: { type: DataTypes.STRING(50), allowNull: false },
    payload: { type: DataTypes.JSON, allowNull: false },
    processed: { type: DataTypes.BOOLEAN, defaultValue: false },
    processingResult: { type: DataTypes.TEXT, allowNull: true },
    receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    processedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'WebhookEvent',
    tableName: 'webhook_events',
    timestamps: false,
    indexes: [{ fields: ['event_type'] }, { fields: ['processed'] }],
  },
);

export default WebhookEvent;
