import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { TENANT_ROLES } from '../../utils/constants.js';

class TenantMember extends Model {}

TenantMember.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    tenantId: { type: DataTypes.INTEGER, allowNull: false },
    role: { type: DataTypes.ENUM(...TENANT_ROLES), allowNull: false },
    assignedEvents: { type: DataTypes.JSON, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    invitedBy: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    sequelize,
    modelName: 'TenantMember',
    tableName: 'tenant_members',
    indexes: [
      { unique: true, fields: ['user_id', 'tenant_id'] },
      { fields: ['tenant_id'] },
    ],
  },
);

export default TenantMember;
