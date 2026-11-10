import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import type { Env } from "./index";
export const local = (env: Env) => env.APP_ENV === "local";
async function mail(env: Env, email: string, subject: string, url: string) {
  if (local(env)) {
    await env.DB.prepare(
      "INSERT INTO mail_outbox(id,recipient,subject,url) VALUES(?,?,?,?)",
    )
      .bind(crypto.randomUUID(), email, subject, url)
      .run();
    return;
  }
  if (!env.MAIL_API_KEY || !env.MAIL_FROM)
    throw new Error("MAIL_NOT_CONFIGURED");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: email,
      subject,
      text: `Maktabati demo: ${url}`,
    }),
  });
  if (!r.ok) throw new Error("MAIL_DELIVERY_FAILED");
}
export function authFor(env: Env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32)
    throw new Error("AUTH_SECRET_REQUIRED");
  return betterAuth({
    appName: "Maktabati",
    baseURL: env.APP_ORIGIN,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        mail(env, user.email, "Reset your password", url),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) =>
        mail(env, user.email, "Verify your email", url),
    },
    user: {
      additionalFields: {
        role: { type: "string", defaultValue: "CUSTOMER", input: false },
        disabled: { type: "boolean", defaultValue: false, input: false },
        passwordChangeRequired: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 30,
      cookieCache: { enabled: false },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const user = await env.DB.prepare(
              "SELECT disabled FROM user WHERE id=?",
            )
              .bind(session.userId)
              .first<{ disabled: number }>();
            if (!user || user.disabled)
              throw new APIError("UNAUTHORIZED", {
                message: "INVALID_EMAIL_OR_PASSWORD",
              });
          },
        },
      },
    },
    advanced: {
      useSecureCookies: !local(env),
      defaultCookieAttributes: {
        httpOnly: true,
        secure: !local(env),
        sameSite: "strict",
      },
    },
    rateLimit: { enabled: false },
    plugins: [
      twoFactor({ issuer: "Maktabati", skipVerificationOnEnable: false }),
    ],
  });
}
