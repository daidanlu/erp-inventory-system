// src/components/CustomersPage.tsx
import React, { useEffect, useState } from 'react';
import { Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';

type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
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

  const fetchCustomers = async (pageNum = 1) => {
    setLoading(true);
    try {
      const resp = await axios.get<CustomerListResponse>('/api/customers/', {
        params: { page: pageNum },
      });

      const payload = resp.data as any;
      const items: Customer[] = payload.results ?? payload;

      setData(items);
      setTotal(payload.count ?? items.length);
    } catch (err) {
      console.error('Failed to load customers', err);
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
  );
};

export default CustomersPage;
