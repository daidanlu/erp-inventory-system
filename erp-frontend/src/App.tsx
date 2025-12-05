import { Layout, Row, Col } from 'antd'
import ProductList from './components/ProductList'
import DashboardSummary from './components/DashboardSummary'
import LowStockTable from './components/LowStockTable'
import { ChatPanel } from './components/ChatPanel'

const { Header, Content } = Layout

function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
        ERP Inventory Dashboard
      </Header>
      <Content style={{ padding: '24px' }}>
        
         {/* 1. dashboard summary on the top: total product, stock, orders, etc. */}
        <DashboardSummary />

        <Row gutter={24} style={{ marginTop: 24 }}>
         {/* 2. left: ProductList */}
          <Col span={16}>
             <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
                <h3>All Products Inventory</h3>
                <ProductList />
             </div>
          </Col>
          
          {/* 3. right: low stock warning & chatbot*/}
          <Col span={8} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             {/* lowstock alert*/}
             <div style={{ flex: '0 0 auto' }}>
                <LowStockTable />
             </div>
             
             {/* chatbot window*/}
             <div style={{ height: 500, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                <ChatPanel />
             </div>
          </Col>
        </Row>

      </Content>
    </Layout>
  )
}

export default App