import React, { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Spin, Tag, Space, Progress } from 'antd';
import axios from 'axios';
import { 
  ShoppingOutlined, 
  DatabaseOutlined, 
  AlertOutlined,
  FileTextOutlined
} from '@ant-design/icons';

interface OrdersByStatus {
  draft: number;
  confirmed: number;
  cancelled: number;
}

interface DashboardData {
  products_count: number;
  customers_count: number;
  orders_total_count: number;
  orders_last_30_days: number;
  total_stock: number;
  low_stock_count: number;
  orders_by_status?: OrdersByStatus;
}

const DashboardSummary: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get('/api/dashboard/')
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error('Dashboard summary load failed', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) return <Spin style={{ margin: 20 }} />;
  if (!data) return null;

  const statusData: OrdersByStatus = data.orders_by_status || {
    draft: 0,
    confirmed: 0,
    cancelled: 0,
  };

  const draftCount = statusData.draft || 0;
  const confirmedCount = statusData.confirmed || 0;
  const cancelledCount = statusData.cancelled || 0;

  const totalStatusCount = draftCount + confirmedCount + cancelledCount;

  const pct = (value: number) =>
    totalStatusCount === 0 ? 0 : Math.round((value * 100) / totalStatusCount);

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
              suffix={
                <span style={{ fontSize: 12, color: '#888' }}>
                  ({data.orders_last_30_days} recent)
                </span>
              }
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

      <Row style={{ marginTop: 24 }}>
        <Col span={24}>
          <Card variant="borderless" title="Order Status Overview">
            {totalStatusCount === 0 ? (
              <div style={{ color: '#888' }}>No orders yet.</div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                  <div style={{ marginBottom: 8, fontWeight: 500 }}>
                    Distribution
                  </div>
                  <Progress
                    percent={100}
                    format={() =>
                      `Draft ${pct(draftCount)}% · Confirmed ${pct(
                        confirmedCount
                      )}% · Cancelled ${pct(cancelledCount)}%`
                    }
                  />
                </div>

                <Space
                  direction="vertical"
                  style={{ width: '100%' }}
                  size="small"
                >
                  <Space
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      <Tag>Draft</Tag>
                      {draftCount} orders
                    </span>
                    <span>{pct(draftCount)}%</span>
                  </Space>

                  <Space
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      <Tag color="green">Confirmed</Tag>
                      {confirmedCount} orders
                    </span>
                    <span>{pct(confirmedCount)}%</span>
                  </Space>

                  <Space
                    style={{
                      width: '100%',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      <Tag color="red">Cancelled</Tag>
                      {cancelledCount} orders
                    </span>
                    <span>{pct(cancelledCount)}%</span>
                  </Space>
                </Space>
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardSummary;
