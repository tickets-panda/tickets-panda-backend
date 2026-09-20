import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';

class RegistrationData extends Model {}

RegistrationData.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    registrationId: { type: DataTypes.INTEGER, allowNull: false },
    formFieldId: { type: DataTypes.INTEGER, allowNull: false },
    fieldValue: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    modelName: 'RegistrationData',
    tableName: 'registration_data',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['registration_id'] }],
  },
);

export default RegistrationData;
