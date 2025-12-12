import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, Space, Button } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

interface OrderItem {
  product_id: number;
  quantity: number;
}

interface Order {
  id: number;
  customer_name: string;
  status: string;
  created_at: string;
  items: OrderItem[];
}

const OrdersPage: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const pageSize = 10;


    const fetchOrders = async () => {
    setLoading(true);
    try {
      const resp = await axios.get('/api/orders/', {
        params: {
          page,
          ...(statusFilter ? { status: statusFilter } : {}),
        },
      });

      const data = Array.isArray(resp.data) ? resp.data : resp.data.results;
      const count = Array.isArray(resp.data) ? data.length : resp.data.count ?? data.length;

      setOrders(data);
      setTotal(count);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter]);

    const handleExportOrders = () => {
      const params = new URLSearchParams();
      if (statusFilter) {
        params.append('status', statusFilter);
      }
      const query = params.toString();
      const url = `/api/orders/export/${query ? `?${query}` : ''}`;

      window.open(url, '_blank');
    };


    const columns: ColumnsType<Order> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (value: string) => {
      let color: string = 'blue';
      let label: string = value;

      if (value === 'draft') {
      color = 'default';
      label = 'Draft';
    } else if (value === 'confirmed') {
      color = 'green';
      label = 'Confirmed';
    } else if (value === 'cancelled') {
      color = 'red';
      label = 'Cancelled';
    }

    return <Tag color={color}>{label}</Tag>;
  },
},

    {
      title: 'Items',
      key: 'items_count',
      render: (_, record) => record.items?.length ?? 0,
    },
    {
      title: 'Total Qty',
      key: 'total_qty',
      render: (_, record) =>
        record.items?.reduce((sum, it) => sum + (it.quantity ?? 0), 0) ?? 0,
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (value: string) =>
        new Date(value).toLocaleString(),
    },
  ];


    return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Space>
          <span>Status:</span>
          <Select
            allowClear
            style={{ width: 160 }}
            placeholder="All"
            value={statusFilter}
            onChange={(value) => {
              setPage(1);
              setStatusFilter(value);
            }}
            options={[
              { value: 'draft', label: 'Draft' },
              { value: 'confirmed', label: 'Confirmed' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </Space>

        <Button size="small" onClick={handleExportOrders}>
          Export CSV
        </Button>
      </div>

      <Table<Order>
        rowKey="id"
        columns={columns}
        dataSource={orders}
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: (p) => setPage(p),
        }}
      />
    </div>
  );
};

export default OrdersPage;
