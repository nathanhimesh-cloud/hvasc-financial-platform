import { getSnapshot } from "@/lib/data";
import { deriveDepartments } from "@/lib/derive";
import { Content } from "@/components/kit/panel";
import { ManagerCard } from "@/components/managers/manager-card";

export default async function DepartmentsPage() {
  const snapshot = await getSnapshot();
  const departments = deriveDepartments(snapshot);

  return (
    <Content>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {departments.map((d) => (
          <ManagerCard key={d.id} department={d} period={snapshot.period} />
        ))}
      </div>
    </Content>
  );
}
