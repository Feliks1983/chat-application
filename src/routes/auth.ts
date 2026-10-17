import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import { generateTokens} from '../middleware/auth';
import { registrationService } from '../utils/authService';

export const router = Router();

const validateUser = [
  body('email').isEmail().normalizeEmail().withMessage('Must be a valid email'),
  body('password')
    .isLength({ min: 8, max: 100 })
    .withMessage('Password must be between 8 and 100 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=(?:.*\d){2,})(?=.*[@$!%*?&])(?!\s)/)
    .withMessage(
      'PasswordHash must contain uppercase, lowercase, at least 2 digits, a special character, and no spaces'
    )
    .custom(value => {
      const forbidden = ['PasswordHash', 'Password123'];
      if (forbidden.includes(value)) {
        throw new Error('PasswordHash is too common');
      }
      return true;
    }),
  body('username')
    .trim()
    .isLength({ min: 2, max: 50 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('profile.firstName').notEmpty().withMessage('First name is required').trim().escape(),
  body('profile.lastName').notEmpty().withMessage('Last name is required').trim().escape(),
  body('profile.bio').optional().trim().escape(),
];

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many registration attempts. Please try again later.',
  },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Please try again later.',
  },
});

router.post('/register', registrationLimiter, validateUser, async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  const result = await registrationService.registerUser(req.body);
  if (!result.success) {
    return res.status(400).json(result);
  }

  res.status(201).json(result);
});

router.post('/login', loginLimiter, validateUser, async (req: Request, res: Response) => {
  try {
    const { emailOrUsername, password } = req.body || {};
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'emailOrUsername and password are required.' });
    }

    const result = await registrationService.attemptLogin(emailOrUsername, password);
    if (!result.success || !result.data) {
      return res.status(401).json(result);
    }

    const user = result.data;
    const tokens = await generateTokens(user);

    return res.status(200).json({
      ...tokens,
      user: {
        id: user._id.toString(),
        email: user.email,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('POST /login error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});