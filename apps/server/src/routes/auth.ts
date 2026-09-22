import express, { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';

import UserModel from '../db/schema/user.js';
import { requireAuth } from '../middleware/auth.js';
import {
  signAccessToken,
  signRefreshToken,
  signVerificationToken,
  verifyRefreshToken,
  verifyVerificationToken,
} from '../utils/jwt.js';
import { sendOtpEmail } from '../utils/mailer.js';
import { sendResponse } from '../utils/response-handler.js';
import { setCooldown, getCooldown, rateLimit } from '../utils/rate-limit.js';
import env from '../utils/env.js';

const router = express.Router();

const OTP_TTL_MINUTES = 10;
const OTP_SEND_COOLDOWN_MS = 60 * 1000;
const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
const OTP_SEND_MAX = 5;
const OTP_VERIFY_WINDOW_MS = 15 * 60 * 1000;
const OTP_VERIFY_MAX = 5;

const sendOtpSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  name: z.string().trim().min(1).max(100).optional(),
});

const verifyOtpSchema = z.object({
  email: z.string().trim().email('A valid email is required'),
  otp: z
    .string()
    .trim()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

const generateOtp = (): string => crypto.randomInt(100000, 1000000).toString();
const hashOtp = (otp: string): Promise<string> => bcrypt.hash(otp, 10);
const hashRefresh = (token: string): Promise<string> => bcrypt.hash(token, 10);

const buildVerifyUrl = (userId: string): string => {
  const token = signVerificationToken(userId);
  return `${env.AUTH_LINK_BASE}verify-email?token=${token}`;
};

const issueTokens = async (userId: string) => {
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);
  return { accessToken, refreshToken, refreshTokenHash: await hashRefresh(refreshToken) };
};

// Send OTP. Registers the account on first request (name optional).
router.post('/send-otp', async (req: Request, res: Response) => {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendResponse(res, 400, parsed.error.issues[0].message);
  }

  const { email, name } = parsed.data;

  const sendKey = `send:${email}`;
  const cooldownKey = `sd-cd:${email}`;
  const count = rateLimit(sendKey, OTP_SEND_MAX, OTP_SEND_WINDOW_MS);
  if (count > OTP_SEND_MAX) {
    return sendResponse(res, 429, 'Too many OTP requests. Please try again later.');
  }

  const remainingCooldown = getCooldown(cooldownKey);
  if (remainingCooldown > 0) {
    return sendResponse(
      res,
      429,
      `Please wait ${Math.ceil(remainingCooldown / 1000)}s before requesting a new code.`,
    );
  }

  let user = await UserModel.findOne({ email });
  const isNewUser = !user;
  const cleanedName = name?.trim();

  if (user && cleanedName) {
    user.name = cleanedName;
  }

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);

  if (user) {
    user.otpCode = otpHash;
    user.otpExpiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await user.save();
  } else {
    user = await UserModel.create({
      email,
      name: cleanedName || email.split('@')[0],
      otpCode: otpHash,
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
    });
  }

  setCooldown(cooldownKey, OTP_SEND_COOLDOWN_MS);

  await sendOtpEmail({
    to: email,
    otp,
    verifyUrl: buildVerifyUrl(user._id.toString()),
  });

  return sendResponse(res, 200, 'A login code has been sent to your email.', {
    email,
    isNewUser,
  });
});

router.post('/verify-otp', async (req: Request, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendResponse(res, 400, parsed.error.issues[0].message);
  }

  const { email, otp } = parsed.data;
  const user = await UserModel.findOne({ email });

  if (!user) {
    return sendResponse(res, 404, 'No account found for this email. Request a code first.');
  }

  const verifyKey = `verify:${email}`;
  const attempts = rateLimit(verifyKey, OTP_VERIFY_MAX, OTP_VERIFY_WINDOW_MS);
  if (attempts > OTP_VERIFY_MAX) {
    return sendResponse(res, 429, 'Too many failed attempts. Please request a new code.');
  }

  if (!user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    return sendResponse(res, 400, 'OTP has expired. Please request a new one.');
  }

  const isValid = await bcrypt.compare(otp, user.otpCode);
  if (!isValid) {
    return sendResponse(res, 400, 'Invalid OTP. Please check and try again.');
  }

  user.isEmailVerified = true;
  user.otpCode = null;
  user.otpExpiresAt = null;

  const { accessToken, refreshToken, refreshTokenHash } = await issueTokens(String(user._id));
  user.refreshTokenHash = refreshTokenHash;
  await user.save();

  return sendResponse(res, 200, 'Login successful', {
    accessToken,
    refreshToken,
    user: user.toSafeJSON(),
  });
});

// Convenience: clicking the link in the email verifies the account without typing the code.
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const payload = verifyVerificationToken(String(req.query.token || ''));
    const user = await UserModel.findById(payload.sub);

    if (!user) {
      return res.status(400).send('<h3>Invalid verification link.</h3>');
    }
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      user.otpCode = null;
      user.otpExpiresAt = null;
      await user.save();
    }

    return res
      .status(200)
      .send(
        '<h3 style="font-family:sans-serif;">✅ Your email has been verified. You can now log in to Crop AI with an OTP.</h3>',
      );
  } catch (error) {
    return res
      .status(400)
      .send('<h3 style="font-family:sans-serif;">Invalid or expired verification link.</h3>');
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendResponse(res, 400, 'refreshToken is required');
  }

  try {
    const payload = verifyRefreshToken(parsed.data.refreshToken);
    const user = await UserModel.findById(payload.sub);

    if (!user?.refreshTokenHash) {
      return sendResponse(res, 401, 'Invalid refresh token');
    }

    const matches = await bcrypt.compare(parsed.data.refreshToken, user.refreshTokenHash);
    if (!matches) {
      return sendResponse(res, 401, 'Invalid refresh token');
    }

    const { accessToken, refreshToken, refreshTokenHash } = await issueTokens(String(user._id));
    user.refreshTokenHash = refreshTokenHash;
    await user.save();

    return sendResponse(res, 200, 'Tokens refreshed', { accessToken, refreshToken });
  } catch (error) {
    return sendResponse(res, 401, 'Invalid or expired refresh token');
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (parsed.success) {
    try {
      const payload = verifyRefreshToken(parsed.data.refreshToken);
      const user = await UserModel.findById(payload.sub);
      if (user?.refreshTokenHash) {
        const matches = await bcrypt.compare(parsed.data.refreshToken, user.refreshTokenHash);
        if (matches) {
          user.refreshTokenHash = null;
          await user.save();
        }
      }
    } catch (error) {
      // token already invalid — nothing to revoke
    }
  }

  return sendResponse(res, 200, 'Logged out successfully');
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await UserModel.findById(req.userId);
  if (!user) {
    return sendResponse(res, 404, 'User not found');
  }

  return sendResponse(res, 200, 'User fetched', user.toSafeJSON());
});

export default router;
