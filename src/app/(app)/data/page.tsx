import { notFound } from "next/navigation";
import { Content } from "@/components/kit/panel";
import { UploadForm } from "@/components/data/upload-form";
import { storeKind } from "@/lib/feed/store";
import { getSession, isAuthConfigured } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function DataUploadPage() {
  // Admin only. This page isn't in the nav, but an unlinked URL is not a control —
  // anyone who knew the address could reach it, and an upload here replaces the
  // figures on every other page. Same shape as the mapping and audit gates:
  // 404 rather than a redirect, so the page doesn't confirm it exists.
  if (isAuthConfigured()) {
    const session = await getSession();
    if (!can(session?.role, "data.upload")) notFound();
  }

  return (
    <Content>
      <UploadForm
        store={storeKind()}
        passwordRequired={!!process.env.UPLOAD_PASSWORD}
      />
    </Content>
  );
}
