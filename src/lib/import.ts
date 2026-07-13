/**
 * Client data layer for email purchase-import (AJA-114). Flag-gated: everything
 * no-ops / returns empty when the user isn't in the trusted cohort.
 */

import { authHeaders, getSupabase } from "./supabase/client";

const INBOUND_HASH = process.env.NEXT_PUBLIC_POSTMARK_INBOUND_HASH || "";

export interface ImportCandidate {
  id: string;
  name: string | null;
  brand: string | null;
  price: number | null;
  productUrl: string | null;
  imageUrl: string | null;
  imageStatus: "ok" | "unavailable";
  category: string | null;
  sender: string | null;
  status: "pending" | "needs_verification" | "accepted" | "dismissed";
  createdAt: string;
}

interface AllowRow {
  inbox_token: string | null;
  disabled: boolean;
  verified_senders: string[] | null;
}

async function myAllow(): Promise<AllowRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return null;
  const { data } = await sb
    .from("import_allow")
    .select("inbox_token,disabled,verified_senders")
    .eq("user_id", uid)
    .maybeSingle();
  return (data as AllowRow) ?? null;
}

/** True when the signed-in user is in the trusted cohort and not disabled. */
export async function isImportEnabled(): Promise<boolean> {
  const row = await myAllow();
  return !!row && !row.disabled && !!row.inbox_token;
}

/** The user's unique forward-to address. */
export async function inboxAddress(): Promise<string | null> {
  const row = await myAllow();
  if (!row || row.disabled || !row.inbox_token || !INBOUND_HASH) return null;
  return `${INBOUND_HASH}+${row.inbox_token}@inbound.postmarkapp.com`;
}

function toCandidate(r: Record<string, unknown>): ImportCandidate {
  return {
    id: r.id as string,
    name: (r.name as string) ?? null,
    brand: (r.brand as string) ?? null,
    price: (r.price as number) ?? null,
    productUrl: (r.product_url as string) ?? null,
    imageUrl: (r.image_url as string) ?? null,
    imageStatus: (r.image_status as "ok" | "unavailable") ?? "ok",
    category: (r.category as string) ?? null,
    sender: (r.sender as string) ?? null,
    status: r.status as ImportCandidate["status"],
    createdAt: r.created_at as string,
  };
}

async function fetchByStatus(status: string): Promise<ImportCandidate[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb
    .from("import_candidates")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  return (data ?? []).map(toCandidate);
}

export const fetchPendingCandidates = () => fetchByStatus("pending");
export const fetchHeldCandidates = () => fetchByStatus("needs_verification");

export async function pendingCount(): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const { count } = await sb
    .from("import_candidates")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

async function post(action: "accept" | "dismiss", ids: string[]): Promise<boolean> {
  if (!ids.length) return false;
  const res = await fetch("/api/import/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ action, ids }),
  });
  return res.ok;
}

export const acceptCandidates = (ids: string[]) => post("accept", ids);
export const dismissCandidates = (ids: string[]) => post("dismiss", ids);

/** Edit a candidate's category before accepting (RLS allows own-row update). */
export async function updateCandidateCategory(id: string, category: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.from("import_candidates").update({ category }).eq("id", id);
}

/** Trust a forwarding sender and release its held items to `pending`. */
export async function confirmSender(email: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.rpc("import_confirm_sender", { p_sender: email.trim().toLowerCase() });
}

/** Export all import records (the imported-items ledger) as JSON. */
export async function exportImportData(): Promise<ImportCandidate[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data } = await sb.from("import_candidates").select("*").order("created_at", { ascending: false });
  return (data ?? []).map(toCandidate);
}

/** Delete all import data AND revoke the inbox (old forward address stops working). */
export async function deleteImportData(): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  await sb.rpc("import_wipe");
}
