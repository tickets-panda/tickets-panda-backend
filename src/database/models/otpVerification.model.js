import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/database.js';
import { OTP_PURPOSE } from '../../utils/constants.js';

class OtpVerification extends Model {}

OtpVerification.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    identifier: { type: DataTypes.STRING(150), allowNull: false },
    identifierType: { type: DataTypes.ENUM('EMAIL', 'PHONE'), allowNull: false },
    otp: { type: DataTypes.STRING(10), allowNull: false },
    purpose: { type: DataTypes.ENUM(...OTP_PURPOSE), allowNull: false },
    isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'OtpVerification',
    tableName: 'otp_verifications',
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ['identifier', 'otp', 'purpose'] }],
  },
);

export default OtpVerification;
