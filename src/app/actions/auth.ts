"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/session";
import { isBootstrapAdminEmail, verifyInvitedPassword } from "@/lib/allowlist";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Bootstrap admin accounts (ALLOWED_EMAILS) share one password so Redis
  // being down/misconfigured can never lock everyone out. Everyone else
  // invited via /admin/invites has their own password stored in Redis.
  if (isBootstrapAdminEmail(email)) {
    const passwordHash = process.env.APP_PASSWORD_HASH;
    if (!passwordHash) {
      return { error: "Server is misconfigured (missing APP_PASSWORD_HASH)." };
    }
    const passwordOk = await bcrypt.compare(password, passwordHash);
    if (!passwordOk) {
      return { error: "Incorrect password." };
    }
    await createSession(email);
    redirect("/");
  }

  const result = await verifyInvitedPassword(email, password);
  if (result === "not-found") {
    return { error: "This email hasn't been invited to the dashboard." };
  }
  if (result === "wrong-password") {
    return { error: "Incorrect password." };
  }

  await createSession(email);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
