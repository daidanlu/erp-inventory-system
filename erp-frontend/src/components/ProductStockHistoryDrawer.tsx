// src/components/ProductStockHistoryDrawer.tsx
import React, { useEffect, useState } from 'react';
import { Drawer, List, Tag, Typography, Spin, Empty, message } from 'antd';
import axios from 'axios';

const { Text } = Typography;

interface ProductStockHistoryDrawerProps {
  open: boolean;
  productId: number | null;
  onClose: () => void;
}

interface StockMovement {
  id: number;
  previous_stock: number;
  delta: number;
  new_stock: number;
  reason: string;
  created_at: string;
  order?: number | null;
}

const ProductStockHistoryDrawer: React.FC<ProductStockHistoryDrawerProps> = ({
  open,
  productId,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<StockMovement[]>([]);

  useEffect(() => {
    if (!open || productId == null) {
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const resp = await axios.get('/api/stock-movements/', {
          params: {
            product: productId,
            page_size: 10,
          },
        });

        const data = Array.isArray(resp.data)
          ? resp.data
          : resp.data.results;

        setItems(data);
      } catch (error) {
        message.error('Failed to load stock history');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [open, productId]);

  return (
    <Drawer
      title="Stock History"
      placement="right"
      open={open}
      onClose={onClose}
      width={480}
    >
      {loading ? (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Spin />
        </div>
      ) : items.length === 0 ? (
        <Empty description="No stock movements yet" />
      ) : (
        <List
          size="small"
          dataSource={items}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <span>
                    {new Date(item.created_at).toLocaleString()}{' '}
                    <Tag color={item.delta >= 0 ? 'green' : 'red'}>
                      {item.delta >= 0 ? `+${item.delta}` : item.delta}
                    </Tag>
                  </span>
                }
                description={
                  <>
                    <div>
                      <Text type="secondary">
                        {item.reason === 'order'
                          ? 'Order'
                          : item.reason === 'manual_adjustment'
                          ? 'Manual adjustment'
                          : item.reason}
                      </Text>
                    </div>
                    <div>
                      <Text>Previous: {item.previous_stock}</Text>{' '}
                      → <Text strong>{item.new_stock}</Text>
                    </div>
                    {item.order && (
                      <div>
                        <Text type="secondary">
                          Order ID: {item.order}
                        </Text>
                      </div>
                    )}
                  </>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
};

export default ProductStockHistoryDrawer;
