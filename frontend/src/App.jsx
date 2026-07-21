import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home.jsx';
import OrderPay from './pages/OrderPay.jsx';
import VendorOrder from './pages/VendorOrder.jsx';
import Console from './pages/Console.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/o/:ref" element={<OrderPay />} />
      <Route path="/o/:ref/confirm" element={<OrderPay />} />
      <Route path="/vendor/:ref" element={<VendorOrder />} />
      <Route path="/console" element={<Console />} />
      <Route path="/404" element={<NotFound />} />
      <Route path="*" element={<Navigate to="/404" replace />} />
    </Routes>
  );
}
