import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User, { IUser } from '../models/User';

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const SALT_ROUNDS = 12;

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: string[];
}

export const registrationService = {
  async registerUser(userData: any) {
    try {
      const { email, username, password, profile } = userData;
      const normalizedEmail = email?.toLowerCase().trim();

      const existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail) return { success: false, error: 'User with this email already exists' };

      const existingUsername = await User.findOne({ username });
      if (existingUsername) return { success: false, error: 'Username is already taken' };

      const existing = await User.findOne({
        $or: [{ email: email.trim().toLowerCase() }, { username: username.trim() }],
      });
      if (existing) throw new Error('User with this email or username already exists');

      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
     
      let { token, expires } = generateSecureToken();

      const newUser = await User.create({
        email: normalizedEmail,
        username,
        passwordHash,
        profile,
        verificationToken: token,
        verificationTokenExpires: expires,
      });

      await newUser.save();
      await (newUser.email, token);

      return {
        success: true,
        data: {
          id: newUser._id,
          email: newUser.email,
          username: newUser.username,
          profile: newUser.profile,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message || 'Registration failed' };
    }
  },

  async attemptLogin(emailOrUsername: string, password: string): Promise<ServiceResult<IUser>> {
    const idEmail = (emailOrUsername || '').trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ email: idEmail }, { username: idEmail }],
    }).select('+passwordHash');

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password.',
      };
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      return {
        success: false,
        error: `Account locked. Try again in ${minutesLeft} minute(s).`,
      };
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.loginAttempts = 0;
      }
      await user.save();
      return { success: false, error: 'Invalid email or password.' };
    }

    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    return { success: true, data: user };
  },
};

export const generateSecureToken = (): { token: string; expires: Date } => {
  const token = crypto.randomBytes(64).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return { token, expires };
};
