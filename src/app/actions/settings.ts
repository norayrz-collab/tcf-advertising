"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/dal";
import { setFullCampaignsSinceDate } from "@/lib/store";

export type SettingsState = { error?: string; saved?: boolean } | undefined;

export async function updateFullCampaignsSinceDateAction(
  _prevState: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  await requireAdminSession();

  const date = String(formData.get("sinceDate") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Enter a valid date (YYYY-MM-DD)." };
  }

  await setFullCampaignsSinceDate(date);
  revalidatePath("/admin/settings");
  return { saved: true };
}
