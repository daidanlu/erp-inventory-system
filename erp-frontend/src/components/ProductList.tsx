// erp-frontend/src/components/ProductList.tsx
import React, { useEffect, useState } from 'react';
import { Table, Tag, Button, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import axios from 'axios';
import ProductStockHistoryDrawer from './ProductStockHistoryDrawer';
import BulkAdjustStockModal from './BulkAdjustStockModal';

type Product = {
  id: number;
  sku: string;
  name: string;
  stock: number;
};

type ProductListResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: Product[];
};

interface ProductListProps {
  onAdjustProduct: (product: Product) => void;
  onDataChanged?: () => void;
}

const ProductList: React.FC<ProductListProps> = ({ onAdjustProduct, onDataChanged }) => {
  const [data, setData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [bulkOpen, setBulkOpen] = useState(false);

  const [historyProductId, setHistoryProductId] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const handleViewHistory = (productId: number) => {
    setHistoryProductId(productId);
    setHistoryOpen(true);
  };

  const fetchProducts = async (pageNum = 1) => {
    setLoading(true);
    try {
      const resp = await axios.get<ProductListResponse>('/api/products/', {
        params: { page: pageNum },
      });

      const payload = resp.data as any;
      const items: Product[] = payload.results ?? payload;

      setData(items);
      setTotal(payload.count ?? items.length);
    } catch (err) {
      console.error('Failed to load products', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts(page);
  }, [page]);

  const columns: ColumnsType<Product> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80,
    },
    {
      title: 'SKU',
      dataIndex: 'sku',
      key: 'sku',
      width: 120,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
    },
    {
      title: 'Stock',
      dataIndex: 'stock',
      key: 'stock',
      width: 120,
      render: (value: number) => {
        const isLow = value <= 5;
        return <Tag color={isLow ? 'red' : 'green'}>{value}</Tag>;
      },
    },
    {
      title: 'History',
      key: 'history',
      width: 120,
      render: (_value, record) => (
        <Button type="link" onClick={() => handleViewHistory(record.id)}>
          View history
        </Button>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      render: (_value, record) => (
        <Button type="link" onClick={() => onAdjustProduct(record)}>
          Adjust stock
        </Button>
      ),
    },
  ];

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Space>
          <Button size="small" onClick={() => setBulkOpen(true)}>
            Bulk adjust
          </Button>
        </Space>
      </div>

      <Table<Product>
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

      <BulkAdjustStockModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSuccess={() => {
          fetchProducts(page);
          onDataChanged?.();
        }}
      />

      <ProductStockHistoryDrawer
        open={historyOpen}
        productId={historyProductId}
        onClose={() => setHistoryOpen(false)}
      />
    </>
  );
};

export default ProductList;
