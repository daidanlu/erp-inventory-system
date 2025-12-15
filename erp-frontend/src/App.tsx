import { useEffect, useState } from 'react';
import {
  Layout,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  Space,
  Typography,
  message,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import axios from 'axios';

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
const { Text } = Typography;

/**
* Global Axios Configuration:
* - Backend base URL points to 127.0.0.1:8000
* - Each request automatically includes Authorization: Bearer <accessToken>
*/
axios.defaults.baseURL = 'http://127.0.0.1:8000';
axios.defaults.withCredentials = false;

axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    const headers = (config.headers || {}) as any;
    headers.Authorization = `Bearer ${token}`;
    config.headers = headers;
  }
  return config;
});


function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // to force refresh child components

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] =
    useState<ProductForAdjust | null>(null);

  // Login-related status
  const [loginVisible, setLoginVisible] = useState(false);
  const [authUsername, setAuthUsername] = useState<string | null>(() =>
    localStorage.getItem('authUsername')
  );
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem('accessToken')
  );
  const isAuthenticated = !!authToken;

  // The login status is restored from localStorage upon initial loading.
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const username = localStorage.getItem('authUsername');
    if (token) {
      setAuthToken(token);
    }
    if (username) {
      setAuthUsername(username);
    }
  }, []);

  const handleExportProducts = () => {
    window.open('/api/products/export/', '_blank');
  };

  const handleAdjustProduct = (product: ProductForAdjust) => {
    setSelectedProduct(product);
    setAdjustOpen(true);
  };

  // Submit the login form: Call /api/token/ to get the JWT.
  const handleLoginSubmit = async (values: {
    username: string;
    password: string;
  }) => {
    try {
      const resp = await axios.post('/api/token/', {
        username: values.username,
        password: values.password,
      });

      const { access, refresh } = resp.data;
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);
      localStorage.setItem('authUsername', values.username);

      setAuthToken(access);
      setAuthUsername(values.username);
      setLoginVisible(false);
      message.success('Logged in successfully');

      // After successful login, the dashboard/list data will be forcibly refreshed
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      console.error('Login failed', err?.response || err);
      message.error('Login failed. Please check username and password.');
    }
  };

  // Logout：clear local token
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('authUsername');
    setAuthToken(null);
    setAuthUsername(null);
    message.success('Logged out');
    setRefreshKey((k) => k + 1);
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
      {/* Top Header: Title on the left, login status + login/logout + New Order on the right */}
      <Header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
          background: '#001529',
          color: 'white',
          flex: '0 0 auto',
          width: '100%',
          zIndex: 100,
        }}
      >
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
          ERP Inventory Dashboard
        </div>

        <Space align="center">
          <Text style={{ color: '#fff' }}>
            {isAuthenticated
              ? `Logged in as ${authUsername ?? 'staff'}`
              : 'Not logged in'}
          </Text>

          {isAuthenticated ? (
            <Button size="small" onClick={handleLogout}>
              Logout
            </Button>
          ) : (
            <Button size="small" onClick={() => setLoginVisible(true)}>
              Login
            </Button>
          )}

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalOpen(true)}
          >
            New Order
          </Button>
        </Space>
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

        {/* 7. Login */}
        <Modal
          open={loginVisible}
          title="Staff Login"
          onCancel={() => setLoginVisible(false)}
          footer={null}
          destroyOnClose
        >
          <Form
            layout="vertical"
            onFinish={handleLoginSubmit}
            autoComplete="off"
          >
            <Form.Item
              label="Username"
              name="username"
              rules={[{ required: true, message: 'Please enter username' }]}
            >
              <Input />
            </Form.Item>

            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, message: 'Please enter password' }]}
            >
              <Input.Password />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block>
                Login
              </Button>
            </Form.Item>
          </Form>
        </Modal>
      </Content>
    </Layout>
  );
}

export default App;
