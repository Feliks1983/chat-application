import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { IUser, JwtProps, RefreshToken, TokenType } from "../models/User";

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; jti: string };
    }
  }
} 
export const ACCESS_TTL_SEC = 150 * 60;
export const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

async function isTokenBlacklisted(jti?: string): Promise<boolean> {
  if (!jti) return false;
  return false;
}

interface CustomJwtPayload extends JwtPayload {
  sub: string;
  type: string;
  jti: string;
}

const b64u = (v: Buffer | string) => Buffer.from(v).toString("base64url");
const hmac = (data: string) =>
  crypto.createHmac("sha256", getSecret()).update(data).digest();

const getSecret = (): string => {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set in .env");
  return s;
};

export async function generateTokens(user: IUser) {
  const sub = String(user.userId ?? user._id);
  const access = signToken({ sub, type: 'access'}, ACCESS_TTL_SEC);
  const refresh = signToken({ sub, type: 'refresh'}, REFRESH_TTL_SEC);
  await RefreshToken.create({
    jti: refresh.payload.jti,
    userId: user._id,
    expiresAt: new Date(refresh.payload.exp * 1000),
  });
  return { accessToken: access.token, refreshToken: refresh.token };
}

export function verifyToken(token: string, expectedType: TokenType): JwtProps {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [h, b, s] = parts;

  const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
  if (header.alg !== "HS256") throw new Error("Unsupported alg");

  const expected = hmac(`${h}.${b}`);
  const actual = Buffer.from(s, "base64url");
  if (
    actual.length !== expected.length ||
    !crypto.timingSafeEqual(actual, expected)
  ) {
    throw new Error("Bad signature");
  }

  const payload = JSON.parse(
    Buffer.from(b, "base64url").toString("utf8"),
  ) as JwtProps;
  if (
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Token expired");
  }
  if (payload.type !== expectedType) throw new Error("Wrong token type");
  if (!payload.sub || !payload.jti) throw new Error("Missing claims");
  return payload;
}

export function signToken(
  input: { sub: string; type: TokenType; },
  ttlSec: number,
): { token: string; payload: JwtProps } {
  const iat = Math.floor(Date.now() / 1000);
  const payload: JwtProps = {
    ...input,
    iat,
    exp: iat + ttlSec,
    jti: crypto.randomUUID(),
  };
  const header = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(hmac(`${header}.${body}`));
  return { token: `${header}.${body}.${sig}`, payload };
}

export interface AuthRequest extends Request {
  userId?: string;
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader && authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as CustomJwtPayload;

    if (decoded.type && decoded.type !== "access") {
      res.status(401).json({ error: "Unauthorized: Invalid token type" });
      return;
    }

    const blacklisted = await isTokenBlacklisted(decoded.jti);
    if (blacklisted) {
      res.status(401).json({ error: "Unauthorized: Token has been revoked" });
      return;
    }

    req.user = {
      userId: decoded.sub || (decoded as any).id,
      jti: decoded.jti,
    };

    next();
  } catch (err) {
    res.status(403).json({ error: "Invalid token" });
  }
}