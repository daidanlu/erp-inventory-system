// src/App.tsx
import { Layout } from 'antd'
import ProductList from './components/ProductList'

const { Header, Content } = Layout

function App() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ color: '#fff', fontSize: 18 }}>
        ERP Inventory Dashboard (Frontend MVP)
      </Header>
      <Content>
        <ProductList />
      </Content>
    </Layout>
  )
}

export default App
