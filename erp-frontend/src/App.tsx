import { useState } from 'react';
import { Layout, Row, Col, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ProductList from './components/ProductList';
import DashboardSummary from './components/DashboardSummary';
import LowStockTable from './components/LowStockTable';
import { ChatPanel } from './components/ChatPanel';
import CreateOrderModal from './components/CreateOrderModal';
import OrdersPage from './components/OrdersPage';
import AdjustStockModal, {
  ProductForAdjust,
} from './components/AdjustStockModal';

const { Header, Content } = Layout;

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // to force refresh child components

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductForAdjust | null>(
    null
  );

  const handleExportProducts = () => {
    window.open('/api/products/export/', '_blank');
  };

  const handleAdjustProduct = (product: ProductForAdjust) => {
    setSelectedProduct(product);
    setAdjustOpen(true);
  };

  return (
    <Layout
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Flex layout, placing the title on the left and the buttons on the right */}
      <Header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
          background: '#001529', // Ensure background is dark
          color: 'white', // Ensure text is white
          flex: '0 0 auto',
          width: '100%',
          zIndex: 100,
        }}
      >
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
          ERP Inventory Dashboard
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setIsModalOpen(true)}
        >
          New Order
        </Button>
      </Header>

      <Content
        style={{
          padding: '24px',
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* 1. Dashboard summary */}
        <DashboardSummary key={`dash-${refreshKey}`} />

        <Row gutter={24} style={{ marginTop: 24 }}>
          {/* 2. left: ProductList */}
          <Col span={16}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: 0 }}>All Products Inventory</h3>
                <Button size="small" onClick={handleExportProducts}>
                  Export CSV
                </Button>
              </div>

              <ProductList
                key={`prod-${refreshKey}`}
                onAdjustProduct={handleAdjustProduct}
              />
            </div>
          </Col>

          {/* 3. right: Low stock + Chat */}
          <Col
            span={8}
            style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
          >
            <div style={{ flex: '0 0 auto' }}>
              <LowStockTable key={`low-${refreshKey}`} />
            </div>
            <div
              style={{
                height: 500,
                background: '#fff',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <ChatPanel />
            </div>
          </Col>
        </Row>

        {/* 4. Orders list section */}
        <div
          style={{
            marginTop: 24,
            background: '#fff',
            padding: 24,
            borderRadius: 8,
          }}
        >
          <h3>Recent Orders</h3>
          <OrdersPage key={`orders-${refreshKey}`} />
        </div>

        {/* 5. New Order modal */}
        <CreateOrderModal
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />

        {/* 6. Adjust stock modal */}
        <AdjustStockModal
          open={adjustOpen}
          product={selectedProduct}
          onClose={() => setAdjustOpen(false)}
          onSuccess={() => setRefreshKey((k) => k + 1)}
        />
      </Content>
    </Layout>
  );
}

export default App;
