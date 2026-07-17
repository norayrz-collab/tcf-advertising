"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/session";
import { isEmailAllowed } from "@/lib/allowlist";

export type LoginState = { error?: string } | undefined;

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and the shared password." };
  }

  const passwordHash = process.env.APP_PASSWORD_HASH;
  if (!passwordHash) {
    return { error: "Server is misconfigured (missing APP_PASSWORD_HASH)." };
  }

  const passwordOk = await bcrypt.compare(password, passwordHash);
  if (!passwordOk) {
    return { error: "Incorrect password." };
  }

  if (!(await isEmailAllowed(email))) {
    return { error: "This email hasn't been invited to the dashboard." };
  }

  await createSession(email);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
