import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Spin } from 'antd';
import axios from 'axios';
import { 
  ShoppingOutlined, 
  DatabaseOutlined, 
  AlertOutlined,
  FileTextOutlined
} from '@ant-design/icons';

interface DashboardData {
  products_count: number;
  customers_count: number;
  orders_total_count: number;
  orders_last_30_days: number;
  total_stock: number;
  low_stock_count: number;
}

const DashboardSummary: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/dashboard/')
      .then(res => {
        setData(res.data);
      })
      .catch(err => {
        console.error("Dashboard summary load failed", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <Spin style={{ margin: 20 }} />;
  if (!data) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <Row gutter={16}>
        <Col span={6}>
          <Card variant="borderless">
            <Statistic 
              title="Total Products" 
              value={data.products_count} 
              prefix={<ShoppingOutlined />} 
            />
          </Card>
        </Col>
        
        <Col span={6}>
          <Card variant="borderless">
            <Statistic 
              title="Total Stock Items" 
              value={data.total_stock} 
              prefix={<DatabaseOutlined />} 
            />
          </Card>
        </Col>

        <Col span={6}>
          <Card variant="borderless">
            <Statistic 
              title="Total Orders" 
              value={data.orders_total_count} 
              suffix={<span style={{fontSize: 12, color: '#888'}}>({data.orders_last_30_days} recent)</span>}
              prefix={<FileTextOutlined />}
            />
          </Card>
        </Col>

        <Col span={6}>
          <Card variant="borderless">
            <Statistic 
              title="Low Stock Alerts" 
              value={data.low_stock_count} 
              styles={{ content: { color: '#cf1322' } }}
              prefix={<AlertOutlined />} 
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardSummary;