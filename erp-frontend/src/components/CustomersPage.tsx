// src/components/CustomersPage.tsx
import React, { useEffect, useState } from 'react';
import { Button, Space, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import CreateCustomerModal from './CreateCustomerModal';

type Customer = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

type CustomerListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Customer[];
};

const CustomersPage: React.FC = () => {
  const [data, setData] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchCustomers = async (pageNum = 1) => {
    setLoading(true);
    try {
      const resp = await axios.get<CustomerListResponse>('/api/customers/', {
        params: { page: pageNum },
      });

      const payload = resp.data;
      const items = payload.results;
      setData(items);
      setTotal(payload.count ?? items.length);
    } catch (err) {
      console.error('Failed to load customers', err);
      message.error('Failed to load customers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers(page);
  }, [page]);

  const columns: ColumnsType<Customer> = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      ellipsis: true,
      render: (value: string) =>
        value ? (
          <a href={`mailto:${value}`} onClick={(e) => e.stopPropagation()}>
            {value}
          </a>
        ) : (
          '-'
        ),
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 150,
      ellipsis: true,
      render: (value: string | null) => value || '-',
    },
    {
      title: 'Address',
      dataIndex: 'address',
      key: 'address',
      ellipsis: true,
      render: (value: string | null) => value || '-',
    },
  ];

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Space />
        <Button size="small" type="primary" onClick={() => setCreateOpen(true)}>
          New Customer
        </Button>
      </div>

      <Table<Customer>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: (p) => setPage(p),
        }}
      />

      <CreateCustomerModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          // refresh list; avoid missing refresh when already on page 1
          if (page !== 1) setPage(1);
          else fetchCustomers(1);
        }}
      />
    </>
  );
};

export default CustomersPage;
