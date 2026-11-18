import { Tag, Tooltip } from "antd";
import { ORDER_STATUS_META, type OrderStatus } from "../../types/domain";

export function StatusTag({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return (
    <Tooltip title={meta.hint}>
      <Tag color={meta.color} variant="filled" style={{ marginInlineEnd: 0, fontWeight: 500 }}>
        {meta.label}
      </Tag>
    </Tooltip>
  );
}
