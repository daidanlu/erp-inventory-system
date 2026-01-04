import React, { useEffect, useState } from 'react';
import { Table, Tag, Select, Space, Button, Popconfirm, message, DatePicker, Input } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import type { Dayjs } from 'dayjs';

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

type OrdersPageProps = {
  onDataChanged?: () => void;
};

const OrdersPage: React.FC<OrdersPageProps> = ({ onDataChanged }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [ordering, setOrdering] = useState<string>('-created_at');

  // Draft inputs (only applied when user clicks Apply)
  const [customerNameDraft, setCustomerNameDraft] = useState('');
  const [customerNameFilter, setCustomerNameFilter] = useState('');
  const [dateRangeDraft, setDateRangeDraft] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [dateRangeFilter, setDateRangeFilter] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const pageSize = 10;


  const fetchOrders = async () => {
    setLoading(true);
    try {
      const resp = await axios.get('/api/orders/', {
        params: {
          page,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(customerNameFilter ? { customer_name__icontains: customerNameFilter } : {}),
          ...(dateRangeFilter?.[0]
            ? { created_at__date__gte: dateRangeFilter[0].format('YYYY-MM-DD') }
            : {}),
          ...(dateRangeFilter?.[1]
            ? { created_at__date__lte: dateRangeFilter[1].format('YYYY-MM-DD') }
            : {}),
          ...(ordering ? { ordering } : {}),
        },
      });

      // backend might return a list OR a paginated object; be defensive
      const data: Order[] = Array.isArray(resp.data)
        ? (resp.data as Order[])
        : Array.isArray(resp.data?.results)
          ? (resp.data.results as Order[])
          : [];
      const count = Array.isArray(resp.data)
        ? data.length
        : Number(resp.data?.count ?? data.length);

      setOrders(data);
      setTotal(count);
    } catch (err: any) {
      const code = err?.response?.status;
      // 401 is handled globally (auto-refresh or prompt login); avoid noisy crashes
      if (code !== 401) {
        console.error('Failed to load orders', err?.response || err);
      }
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (orderId: number) => {
    setCancellingId(orderId);
    try {
      await axios.post(`/api/orders/${orderId}/cancel/`);
      message.success('Order cancelled. Inventory restored.');

      // update Orders table immediately
      setOrders((prev) =>
        (Array.isArray(prev) ? prev : []).map((o) =>
          o.id === orderId ? { ...o, status: 'cancelled' } : o
        )
      );

      // trigger App refreshKey -> refresh ProductList / DashboardSummary / LowStockTable
      onDataChanged?.();
    } catch (err: any) {
      const code = err?.response?.status;
      if (code === 401 || code === 403) {
        message.error('Not authorized. Please login as staff.');
      } else {
        message.error('Failed to cancel order.');
      }
    } finally {
      setCancellingId(null);
      fetchOrders();
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page, statusFilter, customerNameFilter, dateRangeFilter, ordering]);

  const applyFilters = () => {
    setPage(1);
    setCustomerNameFilter(customerNameDraft.trim());
    setDateRangeFilter(dateRangeDraft);
  };

  const clearFilters = () => {
    setPage(1);
    setStatusFilter(undefined);
    setOrdering('-created_at');
    setCustomerNameDraft('');
    setCustomerNameFilter('');
    setDateRangeDraft(null);
    setDateRangeFilter(null);
  };

  const handleExportOrders = () => {
    const params = new URLSearchParams();
    if (statusFilter) {
      params.append('status', statusFilter);
    }
    if (customerNameFilter) {
      params.append('customer_name__icontains', customerNameFilter);
    }
    if (dateRangeFilter?.[0]) {
      params.append('created_at__date__gte', dateRangeFilter[0].format('YYYY-MM-DD'));
    }
    if (dateRangeFilter?.[1]) {
      params.append('created_at__date__lte', dateRangeFilter[1].format('YYYY-MM-DD'));
    }
    if (ordering) {
      params.append('ordering', ordering);
    }
    const query = params.toString();
    const url = query ? `/api/orders/export/?${query}` : `/api/orders/export/`;

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
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Popconfirm
          title="Cancel this order?"
          description="This will restore inventory and record an audit movement."
          okText="Cancel order"
          cancelText="Keep"
          okButtonProps={{ danger: true }}
          onConfirm={() => cancelOrder(record.id)}
          disabled={record.status === 'cancelled'}
        >
          <Button
            size="small"
            danger
            disabled={record.status === 'cancelled'}
            loading={cancellingId === record.id}
          >
            Cancel
          </Button>
        </Popconfirm>
      ),
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
        <Space wrap size={12}>
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

          <Space>
            <span>Customer:</span>
            <Input
              allowClear
              style={{ width: 220 }}
              placeholder="Name contains..."
              value={customerNameDraft}
              onChange={(e) => setCustomerNameDraft(e.target.value)}
              onPressEnter={applyFilters}
            />
          </Space>

          <Space>
            <span>Date:</span>
            <DatePicker.RangePicker
              allowEmpty={[true, true]}
              value={dateRangeDraft as any}
              onChange={(dates) => setDateRangeDraft(dates as any)}
              format="YYYY-MM-DD"
            />
          </Space>

          <Space>
            <span>Sort:</span>
            <Select
              style={{ width: 180 }}
              value={ordering}
              onChange={(value) => {
                setPage(1);
                setOrdering(value);
              }}
              options={[
                { value: '-created_at', label: 'Newest first' },
                { value: 'created_at', label: 'Oldest first' },
                { value: '-id', label: 'ID desc' },
                { value: 'id', label: 'ID asc' },
              ]}
            />
          </Space>

          <Button size="small" onClick={applyFilters}>
            Apply
          </Button>
          <Button size="small" onClick={clearFilters}>
            Clear
          </Button>
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
