import mongoose from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  isEmailVerified: boolean;
  otpCode: string | null;
  otpExpiresAt: Date | null;
  refreshTokenHash: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUserMethods {
  toSafeJSON(): Record<string, unknown>;
}

type UserModelType = mongoose.Model<IUser, {}, IUserMethods>;

const userSchema = new mongoose.Schema<IUser, UserModelType, IUserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    isEmailVerified: { type: Boolean, default: false },
    otpCode: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    refreshTokenHash: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

userSchema.pre('save', function preSave(next) {
  if (this.isModified('name')) {
    this.name = this.name.trim();
  }
  next();
});

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    isEmailVerified: this.isEmailVerified,
    createdAt: this.createdAt,
  };
};

const UserModel = mongoose.model<IUser, UserModelType>('User', userSchema);
export default UserModel;
