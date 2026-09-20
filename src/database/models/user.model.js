import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { PLATFORM_ROLES } from '../../utils/constants.js';

class User extends Model {}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(255), allowNull: false },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    avatarUrl: { type: DataTypes.STRING(500), allowNull: true },
    role: { type: DataTypes.ENUM(...PLATFORM_ROLES), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    indexes: [{ fields: ['email'] }],
  },
);

export default User;
