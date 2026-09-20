import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';

class EmailLog extends Model {}

EmailLog.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: true },
    toEmail: { type: DataTypes.STRING(150), allowNull: false },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    templateName: { type: DataTypes.STRING(50), allowNull: false },
    refType: { type: DataTypes.STRING(50), allowNull: false },
    refId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('SENT', 'FAILED'), allowNull: false },
    errorMessage: { type: DataTypes.TEXT, allowNull: true },
    sentAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'EmailLog',
    tableName: 'email_logs',
    timestamps: false,
    indexes: [{ fields: ['tenant_id'] }, { fields: ['ref_type', 'ref_id'] }],
  },
);

export default EmailLog;
