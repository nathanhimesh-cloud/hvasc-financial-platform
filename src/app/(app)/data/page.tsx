import { Content } from "@/components/kit/panel";
import { UploadForm } from "@/components/data/upload-form";
import { storeKind } from "@/lib/feed/store";

export const dynamic = "force-dynamic";

export default function DataUploadPage() {
  return (
    <Content>
      <UploadForm
        store={storeKind()}
        passwordRequired={!!process.env.UPLOAD_PASSWORD}
      />
    </Content>
  );
}
