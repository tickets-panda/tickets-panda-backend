import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { ORDER_STATUS } from '../../utils/constants.js';

class Order extends Model {}

Order.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderRef: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    registrationId: { type: DataTypes.INTEGER, allowNull: false },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), defaultValue: 'INR' },
    status: { type: DataTypes.ENUM(...ORDER_STATUS), defaultValue: 'CREATED' },
  },
  {
    sequelize,
    modelName: 'Order',
    tableName: 'orders',
    indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }],
  },
);

export default Order;
