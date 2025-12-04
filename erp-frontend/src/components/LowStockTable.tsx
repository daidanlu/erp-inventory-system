import React, { useEffect, useState } from 'react';
import { Table, Tag, Card } from 'antd';
import axios from 'axios';

interface Product {
  id: number;
  sku: string;
  name: string;
  stock: number;
}

const LowStockTable: React.FC = () => {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // request ProductViewSet's low_stock api in views.py
    axios.get('/api/products/low_stock/') 
      .then(res => {
        // compatible for paging settings: if paging on, data in res.data.results; otherwise in res.data
        const list = (res.data.results) ? res.data.results : res.data;
        // empty list to prevent errors
        setData(Array.isArray(list) ? list : []);
      })
      .catch(err => {
        console.error("Low stock data load failed", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const columns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    { 
      title: 'Stock', 
      dataIndex: 'stock', 
      key: 'stock',
      render: (stock: number) => <Tag color="red">{stock}</Tag>
    },
  ];

  return (
    <Card 
      title="⚠️ Restock Needed (Stock ≤ 5)" 
      variant="borderless" 
      styles={{ body: { padding: 12 } }}
    >
      <Table 
        rowKey="id"
        dataSource={data} 
        columns={columns} 
        loading={loading} 
        pagination={false} 
        size="small"
      />
    </Card>
  );
};

export default LowStockTable;