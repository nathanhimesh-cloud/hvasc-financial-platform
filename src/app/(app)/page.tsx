import { getSnapshot } from "@/lib/data";
import { Content } from "@/components/kit/panel";
import { DashboardController } from "@/components/dashboard/dashboard-controller";

export default async function CfoDashboardPage() {
  const snapshot = await getSnapshot();
  return (
    <Content>
      <DashboardController snapshot={snapshot} />
    </Content>
  );
}
