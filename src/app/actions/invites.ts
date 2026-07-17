"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/dal";
import { inviteEmail, revokeEmail } from "@/lib/allowlist";

export async function inviteEmailAction(formData: FormData) {
  await requireAdminSession();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await inviteEmail(email);
  revalidatePath("/admin/invites");
}

export async function revokeEmailAction(formData: FormData) {
  await requireAdminSession();
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return;
  await revokeEmail(email);
  revalidatePath("/admin/invites");
}
