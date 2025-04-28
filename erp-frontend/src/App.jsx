import React from 'react'
import ProductTable from './components/ProductTable'
import 'antd/dist/reset.css'

function App() {
  return (
    <div style={{ padding: 24 }}>
      <h1>Product Management</h1>
      <ProductTable />
    </div>
  )
}

export default App
