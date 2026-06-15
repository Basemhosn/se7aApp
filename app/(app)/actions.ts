"use server";

import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = getServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
