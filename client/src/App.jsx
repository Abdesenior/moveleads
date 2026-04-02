import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { LoadingScreen } from './components/ui/Loading';
import NotFound from './pages/NotFound';

const Landing = lazy(() => import('./pages/Landing'));
const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/Login'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const GetQuote = lazy(() => import('./pages/GetQuote'));
const ThankYou = lazy(() => import('./pages/ThankYou'));
const ForMovers = lazy(() => import('./pages/ForMovers'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Pricing = lazy(() => import('./pages/Pricing'));

const Dashboard = lazy(() => import('./pages/Dashboard'));
const LeadFeed = lazy(() => import('./pages/dashboard/LeadFeed'));
const MyLeads = lazy(() => import('./pages/dashboard/MyLeads'));
const Customers = lazy(() => import('./pages/dashboard/Customers'));
const Billing = lazy(() => import('./pages/dashboard/Billing'));
const Profile = lazy(() => import('./pages/dashboard/Profile'));
const SettingsPage = lazy(() => import('./pages/dashboard/Settings'));
const Widget = lazy(() => import('./pages/dashboard/Widget'));
const ResolutionCenter = lazy(() => import('./pages/dashboard/ResolutionCenter'));

const WidgetPage = lazy(() => import('./pages/WidgetPage'));
const WidgetEmbedPage = lazy(() => import('./pages/WidgetEmbedPage'));

const Admin = lazy(() => import('./pages/Admin'));
const AdminLeads = lazy(() => import('./pages/admin/AdminLeads'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminRevenue = lazy(() => import('./pages/admin/AdminRevenue'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const AdminDisputes = lazy(() => import('./pages/admin/AdminDisputes'));
const AdminPricing = lazy(() => import('./pages/admin/AdminPricing'));

const MoveRoute = lazy(() => import('./pages/GetQuote').then(m => ({ default: m.MoveRoute })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Router>
          <ScrollToTop />
          <Suspense fallback={<LoadingScreen message="Loading..." />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/register" element={<Register />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/get-quote" element={<GetQuote />} />
              <Route path="/move/:originCity/:destCity" element={<MoveRoute />} />
              <Route path="/thank-you" element={<ThankYou />} />
              <Route path="/for-movers" element={<ForMovers />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/widget-page" element={<WidgetPage />} />
              <Route path="/embed/widget/:companyId" element={<WidgetEmbedPage />} />
              <Route path="/embed/widget" element={<WidgetEmbedPage />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/pricing" element={<Pricing />} />

              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/leads" element={<ProtectedRoute><LeadFeed /></ProtectedRoute>} />
              <Route path="/dashboard/widget" element={<ProtectedRoute><Widget /></ProtectedRoute>} />
              <Route path="/dashboard/my-leads" element={<ProtectedRoute><MyLeads /></ProtectedRoute>} />
              <Route path="/dashboard/customers" element={<ProtectedRoute><Customers /></ProtectedRoute>} />
              <Route path="/dashboard/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
              <Route path="/dashboard/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/dashboard/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/dashboard/resolution-center" element={<ProtectedRoute><ResolutionCenter /></ProtectedRoute>} />

              <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
              <Route path="/admin/leads" element={<ProtectedRoute requireAdmin><AdminLeads /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/revenue" element={<ProtectedRoute requireAdmin><AdminRevenue /></ProtectedRoute>} />
              <Route path="/admin/disputes" element={<ProtectedRoute requireAdmin><AdminDisputes /></ProtectedRoute>} />
              <Route path="/admin/pricing" element={<ProtectedRoute requireAdmin><AdminPricing /></ProtectedRoute>} />
              <Route path="/admin/settings" element={<ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Router>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
