import { useState } from 'react'
import { Layout, Row, Col, Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import ProductList from './components/ProductList'
import DashboardSummary from './components/DashboardSummary'
import LowStockTable from './components/LowStockTable'
import { ChatPanel } from './components/ChatPanel'
import CreateOrderModal from './components/CreateOrderModal'

const { Header, Content } = Layout

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0) // to force refresh child components
  return (
    <Layout style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      
      {/* Flex layout, placing the title on the left and the buttons on the right */ }
      {/* Fix: Changed to flex item to prevent overlap naturally */}
      <Header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '0 24px',
        background: '#001529', // Ensure background is dark
        color: 'white',        // Ensure text is white
        flex: '0 0 auto',
        width: '100%',
        zIndex: 100
      }}>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
          ERP Inventory Dashboard
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
          New Order
        </Button>
      </Header>


      <Content style={{ 
        padding: '24px', 
        flex: 1, 
        overflowY: 'auto',
        overflowX: 'hidden'
      }}>
        
         {/* 1. dashboard summary on the top: total product, stock, orders, etc, add key={refreshKey} to the component that needs to be refreshed */}
        <DashboardSummary key={`dash-${refreshKey}`} />

        <Row gutter={24} style={{ marginTop: 24 }}>
         {/* 2. left: ProductList */}
          <Col span={16}>
             <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
                <h3>All Products Inventory</h3>
                <ProductList key={`prod-${refreshKey}`} />
             </div>
          </Col>
          
          {/* 3. right: low stock warning & chatbot*/}
          <Col span={8} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
             {/* lowstock alert*/}
             <div style={{ flex: '0 0 auto' }}>
                <LowStockTable key={`low-${refreshKey}`} />
             </div>
             
             {/* chatbot window*/}
             <div style={{ height: 500, background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
                <ChatPanel />
             </div>
          </Col>
        </Row>
        {/* 4. add the pop-up component at the end */ }
        <CreateOrderModal 
          open={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => setRefreshKey(k => k + 1)} // upon success, increment key by 1 and trigger a global refresh
        />

      </Content>
    </Layout>
  )
}

export default App