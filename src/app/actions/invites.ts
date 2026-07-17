"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/dal";
import { inviteEmail, revokeEmail } from "@/lib/allowlist";

export type InviteState = { error?: string; saved?: boolean } | undefined;

export async function inviteEmailAction(_prevState: InviteState, formData: FormData): Promise<InviteState> {
  await requireAdminSession();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter an email and a password." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  await inviteEmail(email, password);
  revalidatePath("/admin/invites");
  return { saved: true };
}

export async function revokeEmailAction(formData: FormData) {
  await requireAdminSession();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await revokeEmail(email);
  revalidatePath("/admin/invites");
}
