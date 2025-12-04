import { Layout, Row, Col } from 'antd'
import ProductList from './components/ProductList'
import DashboardSummary from './components/DashboardSummary'
import LowStockTable from './components/LowStockTable'

const { Header, Content } = Layout

function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>
        ERP Inventory Dashboard
      </Header>
      <Content style={{ padding: '24px' }}>
        
        {/* 1. dashboard summary on the top: total product, stock, orders, etc. */}
        <DashboardSummary />

        <Row gutter={24} style={{ marginTop: 24 }}>
          {/* 2. left: ProductList */}
          <Col span={16}>
             <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
                <h3 style={{ marginBottom: 16 }}>All Products Inventory</h3>
                <ProductList />
             </div>
          </Col>
          
          {/* 3. right: low stock warning*/}
          <Col span={8}>
             <LowStockTable />
          </Col>
        </Row>

      </Content>
    </Layout>
  )
}

export default App