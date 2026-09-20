import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { FORM_FIELD_TYPES } from '../../utils/constants.js';

class RegistrationForm extends Model {}

RegistrationForm.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    activityId: { type: DataTypes.INTEGER, allowNull: true },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    fieldName: { type: DataTypes.STRING(100), allowNull: false },
    fieldLabel: { type: DataTypes.STRING(200), allowNull: false },
    helpText: { type: DataTypes.STRING(500), allowNull: true },
    fieldType: { type: DataTypes.ENUM(...FORM_FIELD_TYPES), allowNull: false },
    options: { type: DataTypes.JSON, allowNull: true },
    isRequired: { type: DataTypes.BOOLEAN, defaultValue: false },
    sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
    placeholder: { type: DataTypes.STRING(200), allowNull: true },
    validationRules: { type: DataTypes.JSON, allowNull: true },
    fileConfig: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'RegistrationForm',
    tableName: 'registration_forms',
    indexes: [{ fields: ['event_id'] }, { fields: ['activity_id'] }, { fields: ['tenant_id'] }],
  },
);

export default RegistrationForm;
