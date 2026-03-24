import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import About from './pages/About';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import GetQuote from './pages/GetQuote';
import ThankYou from './pages/ThankYou';
import ForMovers from './pages/ForMovers';
import VerifyEmail from './pages/VerifyEmail';

// Customer Dashboard
import Dashboard from './pages/Dashboard';
import Leads from './pages/dashboard/Leads';
import MyLeads from './pages/dashboard/MyLeads';
import Customers from './pages/dashboard/Customers';
import Billing from './pages/dashboard/Billing';
import Profile from './pages/dashboard/Profile';
import SettingsPage from './pages/dashboard/Settings';
import Widget from './pages/dashboard/Widget';

// Public pages
import WidgetPage from './pages/WidgetPage';
import WidgetEmbedPage from './pages/WidgetEmbedPage';

// Admin Dashboard
import Admin from './pages/Admin';
import AdminLeads from './pages/admin/AdminLeads';
import AdminUsers from './pages/admin/AdminUsers';
import AdminRevenue from './pages/admin/AdminRevenue';
import AdminSettings from './pages/admin/AdminSettings';
import AdminDisputes from './pages/admin/AdminDisputes';
import AdminPricing from './pages/admin/AdminPricing';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/get-quote" element={<GetQuote />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="/for-movers" element={<ForMovers />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/widget-page" element={<WidgetPage />} />
          <Route path="/embed/widget/:companyId" element={<WidgetEmbedPage />} />
          <Route path="/embed/widget" element={<WidgetEmbedPage />} />

          {/* Customer Dashboard Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/leads" element={<ProtectedRoute><Leads /></ProtectedRoute>} />
          <Route path="/dashboard/widget" element={<ProtectedRoute><Widget /></ProtectedRoute>} />
          <Route path="/dashboard/my-leads" element={<ProtectedRoute><MyLeads /></ProtectedRoute>} />
          <Route path="/dashboard/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
          <Route path="/dashboard/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
          <Route path="/dashboard/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/dashboard/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
          <Route path="/admin/leads" element={<ProtectedRoute requireAdmin><AdminLeads /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
          <Route path="/admin/revenue" element={<ProtectedRoute requireAdmin><AdminRevenue /></ProtectedRoute>} />
          <Route path="/admin/disputes" element={<ProtectedRoute requireAdmin><AdminDisputes /></ProtectedRoute>} />
          <Route path="/admin/pricing" element={<ProtectedRoute requireAdmin><AdminPricing /></ProtectedRoute>} />
          <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
