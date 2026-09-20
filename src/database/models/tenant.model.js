import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { TENANT_STATUS, SUBSCRIPTION_PLANS } from '../../utils/constants.js';

class Tenant extends Model {}

Tenant.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    logoUrl: { type: DataTypes.STRING(500), allowNull: true },
    websiteUrl: { type: DataTypes.STRING(500), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    category: { type: DataTypes.STRING(100), allowNull: true },
    coverImageUrl: { type: DataTypes.STRING(500), allowNull: true },
    socialLinks: { type: DataTypes.JSON, allowNull: true },
    supportEmail: { type: DataTypes.STRING(150), allowNull: true },
    supportPhone: { type: DataTypes.STRING(20), allowNull: true },
    brandingJson: { type: DataTypes.JSON, allowNull: true },
    status: { type: DataTypes.ENUM(...TENANT_STATUS), defaultValue: 'PENDING_VERIFICATION' },
    subscriptionPlan: { type: DataTypes.ENUM(...SUBSCRIPTION_PLANS), defaultValue: 'FREE' },
    settings: { type: DataTypes.JSON, defaultValue: {} },
  },
  {
    sequelize,
    modelName: 'Tenant',
    tableName: 'tenants',
    indexes: [{ fields: ['slug'] }, { fields: ['status'] }],
  },
);

export default Tenant;
