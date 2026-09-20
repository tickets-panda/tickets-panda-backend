import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';

class Customer extends Model {}

Customer.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    indexes: [{ fields: ['email'] }, { fields: ['phone'] }],
  },
);

export default Customer;
