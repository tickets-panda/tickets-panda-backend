import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { PAYMENT_STATUS } from '../../utils/constants.js';

class Payment extends Model {}

Payment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    razorpayOrderId: { type: DataTypes.STRING(100), allowNull: false },
    razorpayPaymentId: { type: DataTypes.STRING(100), allowNull: true },
    razorpaySignature: { type: DataTypes.STRING(255), allowNull: true },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
    method: { type: DataTypes.STRING(50), allowNull: true },
    status: { type: DataTypes.ENUM(...PAYMENT_STATUS), defaultValue: 'CREATED' },
    capturedAt: { type: DataTypes.DATE, allowNull: true },
    failedReason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Payment',
    tableName: 'payments',
    indexes: [{ fields: ['order_id'] }, { fields: ['razorpay_payment_id'] }],
  },
);

export default Payment;
